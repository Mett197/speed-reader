import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Library, Minus, Plus, BookOpen, Eye, EyeOff, Settings, ChevronLeft, ChevronRight, Search } from "lucide-react";
import BookStage from "./ui/BookStage.jsx";
import LibraryScreen from "./ui/LibraryScreen.jsx";
import { attachGestures } from "./reader/gestureLayer.js";
import Drawer from "./ui/Drawer.jsx";
import "./ui/ui.css";
import "./app2.css";
import { WORDS_PER_PAGE, pageCount, pageOf, pageStart, wordToIndex } from "./ui/pages.js";
import { getWordDelay, getORPIndex, splitLongWord } from "./reader/timing.js";
import { applyTheme, isNight, THEMES } from "./reader/themes.js";
import { dragToWpm, swipeToWords } from "./reader/gestures.js";
import { getSentenceStarts, prevSentenceStart, nextSentenceStart } from "./reader/sentences.js";
import { parseEpub, parseText } from "./lib/books.js";
import { saveText, getText, hashText, cachedIds, deleteText } from "./lib/texts.js";
import * as store from "./sync/store.js";
import { startAutoSync, debouncedSaveProgress } from "./sync/couch.js";
import { kavitaListBooks, kavitaFetchEpub } from "./api/kavita.js";
import { makeEpub } from "./lib/makeEpub.js";
import { readOldLibrary } from "./lib/oldLibrary.js";
import { uploadBook } from "./api/upload.js";
import { createKavitaReporter } from "./sync/kavitaProgress.js";
import { llSearch, llAddAndQueue, llWanted } from "./api/lazylibrarian.js";

const reporter = createKavitaReporter();

const ENDS_SENTENCE = /[.!?…]["'”’)\]»]*$/;

function effectiveTheme(s) {
  if (s.theme === "custom" && s.custom) {
    return { bg: s.custom.bg, fg: s.custom.fg, accent: s.custom.accent || "#c0271a" };
  }
  if (s.autoNight && isNight() && (s.theme === "light" || s.theme === "sepia")) return "night";
  return THEMES[s.theme] ? s.theme : "classic";
}

export default function AppV2() {
  const [settings, setSettings] = useState(store.DEFAULT_SETTINGS);
  const [books, setBooks] = useState([]);
  const [book, setBook] = useState(null);
  const [words, setWords] = useState([]);
  const [breaks, setBreaks] = useState(new Set());
  const [chapters, setChapters] = useState([]);
  const [index, setIndex] = useState(0);
  const [sub, setSub] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [stats, setStats] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState("search");
  const [libOpen, setLibOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState("");
  const [requests, setRequests] = useState([]);
  const [goto, setGoto] = useState(false);
  const [gotoPage, setGotoPage] = useState("");
  const [gotoWord, setGotoWord] = useState("");

  const warm = useRef(0);
  const sentences = useRef(0);
  const session = useRef(null);
  const dragStart = useRef({ wpm: 300 });
  const scrub = useRef({ idx: 0, was: false });
  const spineRef = useRef([]);
  const indexRef = useRef(0);
  indexRef.current = index;

  const loadBooks = useCallback(async () => {
    const [all, cached] = await Promise.all([store.getBooks(), cachedIds().catch(() => new Set())]);
    setBooks(all.filter((b) => !b.mergedInto && !b.deleted).map((b) => ({
      ...b,
      offline: cached.has(b.id),
      cover: b.kavitaSeriesId ? `/api/cover/${b.kavitaSeriesId}` : b.cover,
    })));
  }, []);

  const starts = useMemo(() => getSentenceStarts(words), [words]);

  // ---- boot ----
  useEffect(() => {
    (async () => {
      const saved = await store.getSettings();
      setSettings(saved.themeChosen ? saved : { ...saved, theme: "classic" });
      await loadBooks();
      const stop = startAutoSync();
      refreshKavita().then(pushLocalBooks).then(() => refreshKavita());
      return stop;
    })();
  }, []);

  useEffect(() => {
    applyTheme(effectiveTheme(settings), document.documentElement);
  }, [settings]);

  async function refreshKavita(query = "") {
    try {
      const found = await kavitaListBooks(query);
      const have = new Map((await store.getBooks()).map((b) => [b.id, b]));
      for (const b of found) {
        const old = have.get(b.id);
        if (!old) await store.saveBook({ ...b, wordIndex: 0 });
        else if (old.kavitaLibraryId == null && b.kavitaLibraryId != null) {
          await store.saveBook({ ...old, kavitaLibraryId: b.kavitaLibraryId, kavitaVolumeId: b.kavitaVolumeId ?? old.kavitaVolumeId, kavitaSeriesId: b.kavitaSeriesId ?? old.kavitaSeriesId });
        }
      }
      await mergeUploaded(found);
      await loadBooks();
      return found;
    } catch {
      return [];
    }
  }


  const norm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  // Local books that were uploaded: once Kavita lists the same title, move progress
  // and the cached text over and hide the local copy.
  async function mergeUploaded(found) {
    const all = await store.getBooks();
    for (const local of all.filter((b) => b.source === "local" && b.uploaded && !b.mergedInto)) {
      const k = found.find((f) => norm(f.title) === norm(local.title));
      if (!k) continue;
      const kb = all.find((b) => b.id === k.id) || { ...k, wordIndex: 0 };
      if ((local.wordIndex || 0) > (kb.wordIndex || 0)) await store.saveBook({ ...kb, wordIndex: local.wordIndex });
      const rec = await getText(local.id);
      if (rec && !(await getText(k.id))) await saveText(k.id, rec.text, rec.chapters || [], []);
      await store.saveBook({ ...local, mergedInto: k.id });
    }
  }

  // Send books that only exist on this device (new imports and the original app's
  // library) to the server library. Safe to rerun: the server refuses overwrites (409).
  async function pushLocalBooks() {
    if (!navigator.onLine) return;
    let all = await store.getBooks();
    for (const o of await readOldLibrary().catch(() => [])) {
      const id = hashText(o.text);
      if (all.some((b) => b.id === id)) continue;
      await saveText(id, o.text, o.chapters || []);
      await store.saveBook({
        id, title: o.title || "Untitled", author: o.author || "", source: "local",
        totalWords: parseText(o.text).words.length, wordIndex: o.wordIndex || 0,
      });
    }
    all = await store.getBooks();
    for (const b of all.filter((x) => x.source === "local" && !x.uploaded && !x.mergedInto)) {
      const rec = await getText(b.id);
      if (!rec) continue;
      try {
        const blob = await makeEpub({ title: b.title, author: b.author, text: rec.text, chapters: rec.chapters || [] });
        await uploadBook(blob, b);
        await store.saveBook({ ...b, uploaded: true });
        setBusy(`Sent "${b.title}" to your server library.`);
        setTimeout(() => setBusy(""), 4000);
      } catch (e) {
        setBusy(`Couldn't send "${b.title}" to the server (${e.message}). Will retry next start.`); // retried next start
      }
    }
    await loadBooks();
  }

  // ---- sessions (stats) ----
  const endSession = useCallback(() => {
    const s = session.current;
    session.current = null;
    reporter.flush();
    if (!s) return;
    const n = indexRef.current - s.startIndex;
    const now = Date.now();
    if (n > 0 && now - s.t0 > 1000) {
      store.logSession({
        id: `session:${s.t0}`, bookId: s.bookId, startedAt: s.t0, endedAt: now,
        words: n, avgWpm: Math.round(n / ((now - s.t0) / 60000)),
      });
    }
  }, []);

  const play = useCallback(() => {
    if (!book || !words.length) return;
    warm.current = 0;
    session.current = { t0: Date.now(), startIndex: indexRef.current, bookId: book.id };
    setPlaying(true);
  }, [book, words.length]);

  const pause = useCallback(() => {
    setPlaying(false);
    endSession();
    if (book) store.saveProgress(book.id, indexRef.current);
  }, [book, endSession]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") pause(); };
    const onPageHide = () => reporter.flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onPageHide); };
  }, [pause]);

  // ---- playback loop ----
  const n = settings.chunkSize || 1;
  const word = words[index] || "";
  const parts = useMemo(() => (n === 1 ? splitLongWord(word) : [word]), [word, n]);
  const display = n > 1 ? words.slice(index, index + n).join(" ") : parts[Math.min(sub, parts.length - 1)] || "";

  useEffect(() => {
    if (!playing || !words.length) return;
    const last = words[Math.min(index + n, words.length) - 1] || "";
    let delay;
    if (n > 1) {
      let d = 0;
      for (let i = index; i < Math.min(index + n, words.length); i++) {
        d += getWordDelay(words[i], { baseWpm: settings.wpm, isParagraphEnd: breaks.has(i + 1) });
      }
      delay = d * 0.8;
    } else {
      delay = getWordDelay(word, {
        baseWpm: settings.wpm, isParagraphEnd: breaks.has(index + 1), warmupIndex: warm.current,
      }) / parts.length;
    }
    const t = setTimeout(() => {
      warm.current += 1;
      if (n === 1 && sub < parts.length - 1) { setSub(sub + 1); return; }
      const next = index + n;
      if (next >= words.length) { setPlaying(false); endSession(); setIndex(words.length - 1); return; }
      setSub(0);
      setIndex(next);
      if (ENDS_SENTENCE.test(last) && settings.pauseEverySentences > 0) {
        sentences.current += 1;
        if (sentences.current % settings.pauseEverySentences === 0) pause();
      }
      debouncedSaveProgress(book.id, next);
      reporter.report(book, spineRef.current, next);
    }, delay);
    return () => clearTimeout(t);
  }, [playing, index, sub, settings.wpm, settings.chunkSize, words]); // eslint-disable-line

  const jump = useCallback((i) => {
    const k = Math.max(0, Math.min(words.length - 1, i));
    setSub(0);
    setIndex(k);
    if (book) { debouncedSaveProgress(book.id, k); reporter.report(book, spineRef.current, k); }
  }, [words.length, book]);

  // ---- opening books ----
  async function openBook(meta) {
    endSession();
    setPlaying(false);
    setBusy("Opening…");
    try {
      let rec = await getText(meta.id);
      if ((!rec || !rec.spine?.length) && meta.source === "kavita") {
        const parsed = await parseEpub(await kavitaFetchEpub(meta.kavitaChapterId));
        await saveText(meta.id, parsed.text, parsed.chapters, parsed.spine);
        rec = { text: parsed.text, chapters: parsed.chapters, spine: parsed.spine };
      }
      if (!rec) { setBusy("This book isn't on this device. Import the file here."); return; }
      const p = parseText(rec.text);
      setWords(p.words);
      setBreaks(p.breaks);
      setChapters((rec.chapters || []).map((c) => ({ title: c.title, wordIndex: c.startIndex })));
      spineRef.current = rec.spine || [];
      setBook(meta);
      loadBooks();
      setIndex(Math.min(meta.wordIndex || 0, Math.max(0, p.words.length - 1)));
      setSub(0);
      setBookmarks((await store.getBookmarks(meta.id)).filter((b) => !b.deleted));
      closeDrawer();
      setBusy("");
    } catch (e) {
      setBusy(`Could not open: ${e.message}`);
    }
  }

  async function importFile(file) {
    setBusy("Importing…");
    try {
      let text, title = file.name.replace(/\.[^.]+$/, ""), author = "", chapters = [], spine = [];
      if (/\.epub$/i.test(file.name)) {
        const p = await parseEpub(file);
        text = p.text; chapters = p.chapters; spine = p.spine || [];
        title = p.metadata?.title || title; author = p.metadata?.author || "";
      } else {
        text = await file.text();
      }
      const id = hashText(text);
      await saveText(id, text, chapters, spine);
      const existing = (await store.getBooks()).find((b) => b.id === id);
      const meta = existing ? { ...existing, deleted: false, ...(existing.deleted ? { uploaded: false } : {}) } : { id, title, author, source: "local", totalWords: parseText(text).words.length, wordIndex: 0 };
      if (!existing) await store.saveBook(meta);
      else if (existing.deleted) await store.saveBook({ ...existing, deleted: false, uploaded: false });
      await loadBooks();
      await openBook(meta);
      if (!meta.uploaded) {
        try {
          const blob = /\.epub$/i.test(file.name) ? file : await makeEpub({ title, author, text, chapters });
          const r = await uploadBook(blob, { title, author });
          await store.saveBook({ ...meta, uploaded: true });
          setBusy(r === "exists" ? "Already in your server library." : "Added to your server library.");
          setTimeout(() => setBusy(""), 3000);
          refreshKavita();
        } catch (e) {
          setBusy(`Saved on this device only: ${e.message}`);
        }
      }
    } catch (e) {
      setBusy(`Import failed: ${e.message}`);
    }
  }

  async function findBook(q) {
    const inKavita = await refreshKavita(q);
    const out = inKavita.map((b) => ({ id: b.id, title: b.title, author: b.author, inLibrary: true }));
    try {
      const ll = await llSearch(q);
      const titles = new Set(out.map((o) => o.title.toLowerCase()));
      for (const r of ll) {
        if (!titles.has((r.title || "").toLowerCase())) out.push({ id: `ll:${r.id}`, llId: r.id, title: r.title, author: r.author, inLibrary: false });
      }
    } catch { /* LazyLibrarian unreachable: show library hits only */ }
    return out;
  }

  // ---- book requests (LazyLibrarian), remembered in synced settings ----
  async function requestBook(it) {
    await llAddAndQueue(it.llId);
    const list = (settings.requests || []).filter((r) => r.id !== it.llId);
    await changeSettings({ requests: [{ id: it.llId, title: it.title, author: it.author, at: Date.now() }, ...list] });
    loadRequests();
  }

  async function loadRequests() {
    const mine = (await store.getSettings()).requests || settings.requests || [];
    let wanted = [];
    try { wanted = await llWanted(); } catch { /* offline: show what we know */ }
    const byId = new Map(wanted.map((w) => [w.id, w]));
    const have = new Set((await store.getBooks()).filter((b) => b.source === "kavita").map((b) => norm(b.title)));
    setRequests(mine.map((r) => {
      const status = have.has(norm(r.title)) ? "In library" : byId.get(r.id)?.status || (wanted.length ? "Downloading" : "Requested");
      return { ...r, status };
    }));
  }

  // ---- controls ----
  const togglePlay = () => (playing ? pause() : play());
  const toggleBookmark = async (i) => {
    if (!book) return;
    await store.toggleBookmark(book.id, i);
    setBookmarks((await store.getBookmarks(book.id)).filter((b) => !b.deleted));
  };
  const changeSettings = async (partial) => {
    const next = { ...settings, ...partial, ...("theme" in partial ? { themeChosen: true } : {}) };
    setSettings(next);
    await store.saveSettings(next);
  };

  const containerRef = useRef(null);
  const closedAt = useRef(0);
  const closeDrawer = () => { closedAt.current = Date.now(); setDrawer(false); };
  const blocked = () => drawer || goto || libOpen || Date.now() - closedAt.current < 450;

  const gestures = {
    onTap: () => { if (!blocked()) togglePlay(); },
    onWpmDrag: (dy, v, phase) => {
      if (blocked() && phase === "start") return;
      if (phase === "start") { dragStart.current.wpm = settings.wpm; setDragging(true); }
      const w = dragToWpm(dragStart.current.wpm, dy, v);
      if (phase === "end") { setDragging(false); store.saveSettings({ ...settings, wpm: settings.wpm }); return; }
      setSettings((s) => ({ ...s, wpm: w }));
    },
    onScrub: (dx, phase) => {
      if (blocked() && phase === "start") return;
      if (phase === "start") {
        scrub.current = { idx: indexRef.current, was: playing };
        if (playing) pause();
      }
      if (phase !== "end") jump(scrub.current.idx - swipeToWords(dx));
      else if (scrub.current.was) play();
    },
    onLongPress: () => { if (!blocked()) toggleBookmark(indexRef.current); },
  };
  const gesturesRef = useRef(gestures);
  gesturesRef.current = gestures;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fwd = (name) => (...a) => gesturesRef.current[name]?.(...a);
    return attachGestures(el, { onTap: fwd("onTap"), onWpmDrag: fwd("onWpmDrag"), onScrub: fwd("onScrub"), onLongPress: fwd("onLongPress") });
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowLeft") jump(prevSentenceStart(starts, index));
      else if (e.key === "ArrowRight") jump(nextSentenceStart(starts, index));
      else if (e.key === "ArrowUp") changeSettings({ wpm: Math.min(1500, settings.wpm + 10) });
      else if (e.key === "ArrowDown") changeSettings({ wpm: Math.max(100, settings.wpm - 10) });
      else if (e.key === "b") toggleBookmark(index);
      else if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const left = Math.max(0, words.length - index);
  const mins = Math.round(left / settings.wpm);
  const timeLeftLabel = words.length ? (mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min left` : `${mins} min left`) : "";
  const bmSet = useMemo(() => new Set(bookmarks.map((b) => b.wordIndex)), [bookmarks]);
  const libraryIds = useMemo(() => new Set(books.flatMap((b) => [b.id, b.title])), [books]);

  const panels = {
    library: {
      books, currentId: book?.id, onOpen: openBook, onImport: importFile,
      onRename: async (b, title) => {
        const cur = (await store.getBooks()).find((x) => x.id === b.id);
        if (cur) await store.saveBook({ ...cur, title });
        if (book?.id === b.id) setBook((m) => ({ ...m, title }));
        loadBooks();
      },
      onDelete: async (b) => {
        const cur = (await store.getBooks()).find((x) => x.id === b.id);
        if (cur) await store.saveBook({ ...cur, deleted: true });
        await deleteText(b.id).catch(() => {});
        loadBooks();
      },
      onForget: async (b) => { await deleteText(b.id).catch(() => {}); loadBooks(); },
    },
    contents: { chapters, currentIndex: index, onJump: (i) => { jump(i); closeDrawer(); } },
    search: {
      words, onJump: (i) => { jump(i); closeDrawer(); },
      onFindBook: findBook, onRequestBook: requestBook, libraryIds, requests, onLoadRequests: loadRequests,
    },
    bookmarks: { bookmarks, words, onJump: (i) => { jump(i); closeDrawer(); }, onRemove: (b) => toggleBookmark(b.wordIndex) },
    stats: { stats },
    settings: { settings, onChange: changeSettings },
  };

  const openDrawer = async (t) => {
    setTab(t);
    if (t === "stats") setStats(await store.getStats());
    setDrawer(true);
  };

  const pct = words.length ? Math.round((index / words.length) * 100) : 0;
  const view = settings.bookView !== false;

  return (
    <>
    <div className="container app2-home" ref={containerRef}>
      <div className="top-bar">
        <div className="top-left">
          <button onClick={() => { loadBooks(); setLibOpen(true); }} className="text-btn icon-btn" title="Library">
            <Library size={16} />
            <span className="text-btn-label">Library</span>
          </button>
          <button onClick={() => openDrawer("search")} className="icon-btn" title="Search">
            <Search size={18} />
          </button>
        </div>
        <div className="top-center">
          <div className="wpm-control">
            <button onClick={() => changeSettings({ wpm: Math.max(100, settings.wpm - 25) })} className="wpm-btn"><Minus size={16} /></button>
            <div className="wpm-display">
              <span className="wpm-value">{settings.wpm}</span>
              <span className="wpm-label">WPM</span>
            </div>
            <button onClick={() => changeSettings({ wpm: Math.min(1500, settings.wpm + 25) })} className="wpm-btn"><Plus size={16} /></button>
          </div>
        </div>
        <div className="top-right">
          <button onClick={() => changeSettings({ bookView: !view })} className={`icon-btn${view ? " active" : ""}`} title="Book view">
            <BookOpen size={18} />
          </button>
          {view && (
            <button onClick={() => changeSettings({ overlayHidden: !settings.overlayHidden })} className={`icon-btn${settings.overlayHidden ? " active" : ""}`} title={settings.overlayHidden ? "Show focus word" : "Hide focus word"}>
              {settings.overlayHidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
          <button onClick={() => openDrawer("settings")} className="icon-btn" title="Settings">
            <Settings size={18} />
          </button>
        </div>
      </div>

      <BookStage
        words={words} currentIndex={index} display={display} orpIdx={getORPIndex(display)}
        sideOpacity={settings.sideOpacity ?? 0.5} paragraphBreaks={breaks}
        overlayHidden={!!settings.overlayHidden} bookView={view}
      />

      {dragging && <div className="app2-wpm-bubble mono">{settings.wpm}<small> wpm</small></div>}
      {busy && <div className="app2-toast">{busy}</div>}
      {!book && !busy && <div className="app2-toast">Tap Library to pick a book.</div>}

      <div className="bottom-area">
        <div className="controls-row">
          <button onClick={() => jump(prevSentenceStart(starts, index))} className="skip-btn" title="Previous sentence">
            <ChevronLeft size={24} />
            <ChevronLeft size={24} className="chevron-overlap" />
          </button>
          <button onClick={togglePlay} className="play-btn" aria-label={playing ? "Pause" : "Play"}>
            {playing
              ? <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              : <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
          </button>
          <button onClick={() => jump(nextSentenceStart(starts, index))} className="skip-btn" title="Next sentence">
            <ChevronRight size={24} />
            <ChevronRight size={24} className="chevron-overlap" />
          </button>
        </div>

        <div
          className="progress-container" data-no-gesture
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); jump(Math.round(((e.clientX - r.left) / r.width) * (words.length - 1))); }}
        >
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-row">
          <button className="progress-text app2-pos" onClick={() => { setGotoPage(String(pageOf(index))); setGotoWord(String(index + 1)); setGoto(true); }}>
            {words.length ? `${(index + 1).toLocaleString()} / ${words.length.toLocaleString()} (${pct}%) · page ${pageOf(index)}/${pageCount(words.length)}` : ""}
          </button>
        </div>

        {book && (
          <aside aria-label="Current book" className="book-metadata">
            {(book.cover || book.kavitaSeriesId) && (
              <img src={book.cover || `/api/cover/${book.kavitaSeriesId}`} alt="" className="book-cover" />
            )}
            <div className="book-info">
              <h3 className="book-title">{book.title}</h3>
              {book.author && <p className="book-author">{book.author}</p>}
              <p className="book-stats">{timeLeftLabel}</p>
            </div>
          </aside>
        )}
      </div>

    </div>
      {goto && (
        <div className="app2-goto-scrim" data-no-gesture onClick={() => { closedAt.current = Date.now(); setGoto(false); }}>
          <form
            className="app2-goto" onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); jump(wordToIndex(gotoWord, words.length)); closedAt.current = Date.now(); setGoto(false); }}
          >
            <label>Page (1-{pageCount(words.length)})
              <span><input type="number" inputMode="numeric" min="1" max={pageCount(words.length)} value={gotoPage} autoFocus
                onChange={(e) => { setGotoPage(e.target.value); setGotoWord(String(pageStart(e.target.value, words.length) + 1)); }} /></span>
            </label>
            <label>Word (1-{words.length.toLocaleString()})
              <span><input type="number" inputMode="numeric" min="1" max={words.length} value={gotoWord}
                onChange={(e) => { setGotoWord(e.target.value); setGotoPage(String(pageOf(wordToIndex(e.target.value, words.length)))); }} /></span>
            </label>
            <button type="submit">Go</button>
            <small>A page is {WORDS_PER_PAGE} words.</small>
          </form>
        </div>
      )}

      <LibraryScreen
        open={libOpen} books={books} currentId={book?.id}
        onOpen={(b) => { setLibOpen(false); closedAt.current = Date.now(); openBook(b); }}
        onClose={() => { closedAt.current = Date.now(); setLibOpen(false); }}
        onImport={(f) => { setLibOpen(false); closedAt.current = Date.now(); importFile(f); }}
        onRename={panels.library.onRename} onDelete={panels.library.onDelete} onForget={panels.library.onForget}
      />
      <Drawer open={drawer} onClose={closeDrawer} tab={tab} onTab={openDrawer} panels={panels} />
    </>
  );
}
