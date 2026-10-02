import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Menu } from "lucide-react";
import RsvpBand from "./ui/RsvpBand.jsx";
import TextPane from "./ui/TextPane.jsx";
import BottomBar from "./ui/BottomBar.jsx";
import Drawer from "./ui/Drawer.jsx";
import "./ui/ui.css";
import "./app2.css";
import { WORDS_PER_PAGE, pageCount, pageOf, pageStart, wordToIndex } from "./ui/pages.js";
import { getWordDelay, getORPIndex, splitLongWord } from "./reader/timing.js";
import { applyTheme, isNight, THEMES } from "./reader/themes.js";
import { dragToWpm, swipeToWords } from "./reader/gestures.js";
import { getSentenceStarts, prevSentenceStart, nextSentenceStart } from "./reader/sentences.js";
import { parseEpub, parseText } from "./lib/books.js";
import { saveText, getText, hashText } from "./lib/texts.js";
import * as store from "./sync/store.js";
import { startAutoSync, debouncedSaveProgress } from "./sync/couch.js";
import { kavitaListBooks, kavitaFetchEpub } from "./api/kavita.js";
import { createKavitaReporter } from "./sync/kavitaProgress.js";
import { llSearch, llAddAndQueue } from "./api/lazylibrarian.js";

const reporter = createKavitaReporter();

const ENDS_SENTENCE = /[.!?…]["'”’)\]»]*$/;

function effectiveTheme(s) {
  if (s.theme === "custom" && s.custom) {
    return { bg: s.custom.bg, fg: s.custom.fg, accent: s.custom.accent || "#c0271a" };
  }
  if (s.autoNight && isNight() && (s.theme === "light" || s.theme === "sepia")) return "night";
  return THEMES[s.theme] ? s.theme : "dark";
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
  const [tab, setTab] = useState("library");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState("");
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

  const starts = useMemo(() => getSentenceStarts(words), [words]);

  // ---- boot ----
  useEffect(() => {
    (async () => {
      setSettings(await store.getSettings());
      setBooks(await store.getBooks());
      const stop = startAutoSync();
      refreshKavita();
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
      setBooks(await store.getBooks());
      return found;
    } catch {
      return [];
    }
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
      setIndex(Math.min(meta.wordIndex || 0, Math.max(0, p.words.length - 1)));
      setSub(0);
      setBookmarks((await store.getBookmarks(meta.id)).filter((b) => !b.deleted));
      setDrawer(false);
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
      const meta = existing || { id, title, author, source: "local", totalWords: parseText(text).words.length, wordIndex: 0 };
      if (!existing) await store.saveBook(meta);
      setBooks(await store.getBooks());
      await openBook(meta);
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

  // ---- controls ----
  const togglePlay = () => (playing ? pause() : play());
  const toggleBookmark = async (i) => {
    if (!book) return;
    await store.toggleBookmark(book.id, i);
    setBookmarks((await store.getBookmarks(book.id)).filter((b) => !b.deleted));
  };
  const changeSettings = async (partial) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await store.saveSettings(next);
  };

  const gestures = {
    onTap: togglePlay,
    onWpmDrag: (dy, v, phase) => {
      if (phase === "start") { dragStart.current.wpm = settings.wpm; setDragging(true); }
      const w = dragToWpm(dragStart.current.wpm, dy, v);
      if (phase === "end") { setDragging(false); store.saveSettings({ ...settings, wpm: settings.wpm }); return; }
      setSettings((s) => ({ ...s, wpm: w }));
    },
    onScrub: (dx, phase) => {
      if (phase === "start") {
        scrub.current = { idx: indexRef.current, was: playing };
        if (playing) pause();
      }
      if (phase !== "end") jump(scrub.current.idx - swipeToWords(dx));
      else if (scrub.current.was) play();
    },
    onLongPress: () => toggleBookmark(indexRef.current),
  };

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
      else if (e.key === "Escape") setDrawer(false);
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
    library: { books, currentId: book?.id, onOpen: openBook, onImport: importFile },
    contents: { chapters, currentIndex: index, onJump: (i) => { jump(i); setDrawer(false); } },
    search: {
      words, onJump: (i) => { jump(i); setDrawer(false); },
      onFindBook: findBook, onRequestBook: (it) => llAddAndQueue(it.llId), libraryIds,
    },
    bookmarks: { bookmarks, words, onJump: (i) => { jump(i); setDrawer(false); }, onRemove: (b) => toggleBookmark(b.wordIndex) },
    stats: { stats },
    settings: { settings, onChange: changeSettings },
  };

  const openDrawer = async (t) => {
    setTab(t);
    if (t === "stats") setStats(await store.getStats());
    setDrawer(true);
  };

  return (
    <div className="app2">
      <button className="app2-menu" aria-label="Menu" onClick={() => openDrawer("library")}><Menu size={22} /></button>
      <div className="app2-top">
        <RsvpBand
          word={display} orpIndex={getORPIndex(display)} fontScale={settings.fontScale}
          wpm={settings.wpm} showWpmBubble={dragging} {...gestures}
        />
        {book && (
          <div className="app2-info">
            <span className="app2-title">{book.title}</span>
            <span>{(index + 1).toLocaleString()} / {words.length.toLocaleString()} ({Math.floor((index / Math.max(1, words.length)) * 100)}%)</span>
          </div>
        )}
        {!book && (
          <div className="app2-empty">
            <p>{busy || "Open the menu to pick a book."}</p>
          </div>
        )}
        {book && busy && <div className="app2-toast">{busy}</div>}
      </div>
      <div className="app2-bottom">
        <TextPane
          words={words} currentIndex={index} onJump={jump} onToggleBookmark={toggleBookmark}
          bookmarks={bmSet} paragraphBreaks={breaks} playing={playing}
        />
      </div>
      {book && (
        <div className="app2-pages">
          <button aria-label="Previous page" onClick={() => jump(pageStart(pageOf(index) - 1, words.length))}>&lsaquo;</button>
          <button className="app2-pages-go" onClick={() => { setGotoPage(String(pageOf(index))); setGotoWord(String(index + 1)); setGoto(true); }}>
            Page {pageOf(index)} / {pageCount(words.length)} <span>word {(index + 1).toLocaleString()}</span>
          </button>
          <button aria-label="Next page" onClick={() => jump(pageStart(pageOf(index) + 1, words.length))}>&rsaquo;</button>
        </div>
      )}
      <BottomBar
        playing={playing} onPlayPause={togglePlay}
        onPrevSentence={() => jump(prevSentenceStart(starts, index))}
        onNextSentence={() => jump(nextSentenceStart(starts, index))}
        wpm={settings.wpm} progress={words.length ? index / words.length : 0}
        onSeek={(f) => jump(Math.round(f * (words.length - 1)))} timeLeftLabel={timeLeftLabel}
      />
      {goto && (
        <div className="app2-goto-scrim" onClick={() => setGoto(false)}>
          <form
            className="app2-goto" onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              jump(wordToIndex(gotoWord, words.length));
              setGoto(false);
            }}
          >
            <label>Page (1-{pageCount(words.length)})
              <span><input name="page" type="number" inputMode="numeric" min="1" max={pageCount(words.length)} value={gotoPage} onChange={(e) => { setGotoPage(e.target.value); setGotoWord(String(pageStart(e.target.value, words.length) + 1)); }} autoFocus />
              </span>
            </label>
            <label>Word (1-{words.length.toLocaleString()})
              <span><input name="word" type="number" inputMode="numeric" min="1" max={words.length} value={gotoWord} onChange={(e) => { setGotoWord(e.target.value); setGotoPage(String(pageOf(wordToIndex(e.target.value, words.length)))); }} />
              </span>
            </label>
            <button type="submit">Go</button>
            <small>A page is {WORDS_PER_PAGE} words.</small>
          </form>
        </div>
      )}
      <Drawer open={drawer} onClose={() => setDrawer(false)} tab={tab} onTab={openDrawer} panels={panels} />
    </div>
  );
}
