// Writes reading progress back to Kavita.
//
// Verified against Kavita main (raw.githubusercontent.com/Kareadita/Kavita/main/API/...):
// (a) DTOs/ProgressDto.cs: volumeId, chapterId, pageNum, seriesId, libraryId are [Required] ints;
//     bookScrollId is an optional string, "the id of a part marker, to help resume reading position
//     on pages that combine multiple chapters" (EPUB only); lastModifiedUtc is set server side.
//     For EPUBs pageNum is the 0-based index into the book's reading order (spine):
//     Services/BookService.cs GetBookPage walks GetReadingOrderAsync() with a counter == page, and
//     the chapter page count is GetReadingOrder().Count. Not a word or percent position.
//     Services/ReaderService.cs CapPageToChapter clamps pageNum to 0..chapter.Pages (inclusive), so
//     pageNum = Pages (one past the last index) is accepted and means "finished":
//     SaveReadingProgress scrobbles and "read" checks use PagesRead >= chapter.Pages
//     (Data/Repositories/AppUserProgressRepository.cs).
// (b) Controllers/ReaderController.cs POST reader/progress -> ReaderService.SaveReadingProgress
//     only stores AppUserProgress.PagesRead = pageNum (+ series/volume/library ids, bookScrollId),
//     updates LastModified, clears the on-deck removal and fires the SignalR UserProgressUpdate.
//     It adds no reading time. Controllers/StatsController.cs only has GET endpoints
//     (user/{id}/read, reading-count-by-day, user/reading-history, pages-per-year, words-per-year,
//     day-breakdown, server/*): all derived from AppUserProgress rows (PagesRead, LastModified).
//     Time estimates (ReaderController time-left) are computed from word/page counts, not tracked.
//     There is NO reading-session or reading-time endpoint on main, so none is called here.
// Not verified: behaviour of newer unreleased branches (develop returned 404 for these files), and
// what the running server version does. Kavita's reader may send bookScrollId; we omit it
// (resume then starts at the top of the spine page, which is fine for a RSVP client).

export { kavitaSaveProgress } from "../api/kavita.js";
import { kavitaSaveProgress } from "../api/kavita.js";

const FINISH_FRACTION = 0.01;

// spine: [{ page, startIndex }] ascending by startIndex. Returns the page containing wordIndex.
export function wordToPage(spine, wordIndex) {
  if (!Array.isArray(spine) || spine.length === 0) return null;
  let lo = 0;
  let hi = spine.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spine[mid].startIndex <= wordIndex) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { pageNum: spine[found].page, spineIndex: found, startIndex: spine[found].startIndex };
}

export function createKavitaReporter({ saveProgressFn = kavitaSaveProgress, now = Date.now, minIntervalMs = 15000 } = {}) {
  // bookId -> { lastSent, lastAt, pending: {meta, spine, wordIndex} | null, finished }
  const books = new Map();
  const state = (id) => {
    if (!books.has(id)) books.set(id, { lastSent: null, lastAt: -Infinity, pending: null, finished: false });
    return books.get(id);
  };

  async function send(meta, pageNum, st) {
    try {
      await saveProgressFn(
        {
          seriesId: meta.kavitaSeriesId,
          volumeId: meta.kavitaVolumeId,
          chapterId: meta.kavitaChapterId,
          libraryId: meta.kavitaLibraryId,
        },
        pageNum,
      );
      st.lastSent = pageNum;
      st.lastAt = now();
      return true;
    } catch {
      return false; // retried on the next report
    }
  }

  function eligible(meta, spine) {
    return !!(meta && meta.kavitaChapterId && Array.isArray(spine) && spine.length > 0);
  }

  async function flushOne(st, final = false) {
    const p = st.pending;
    if (!p) return;
    const target = final && isFinished(p) ? p.spine[p.spine.length - 1].page + 1 : wordToPage(p.spine, p.wordIndex).pageNum;
    if (target === st.lastSent) return;
    await send(p.meta, target, st);
  }

  function isFinished(p) {
    const total = p.meta.totalWords;
    return total > 0 && p.wordIndex >= total * (1 - FINISH_FRACTION);
  }

  function report(meta, spine, wordIndex) {
    try {
      if (!eligible(meta, spine)) return Promise.resolve();
      const st = state(meta.id);
      const page = wordToPage(spine, wordIndex).pageNum;
      st.pending = { meta, spine, wordIndex };
      if (page === st.lastSent) return Promise.resolve();
      if (now() - st.lastAt < minIntervalMs) return Promise.resolve(); // trailing: sent by a later report or flush
      return flushOne(st);
    } catch {
      return Promise.resolve();
    }
  }

  async function flush() {
    for (const st of books.values()) {
      try {
        await flushOne(st, true);
      } catch {
        /* never throws */
      }
    }
  }

  return { report, flush };
}
