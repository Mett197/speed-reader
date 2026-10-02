// Local-first IndexedDB store. Every write stamps updatedAt = Date.now().

const DB_NAME = "speedreader2";
const STORES = ["books", "bookmarks", "sessions", "settings"];

export const DEFAULT_SETTINGS = {
  wpm: 300,
  theme: "dark",
  autoNight: true,
  chunkSize: 1,
  pauseEverySentences: 0,
  fontScale: 1,
};

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) req.result.createObjectStore(s, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// Test helper: drop the cached connection so a fresh IndexedDB can be used.
export function _resetStore() {
  if (dbPromise) dbPromise.then((db) => db.close()).catch(() => {});
  dbPromise = null;
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const out = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const getOne = (store, id) => tx(store, "readonly", (s) => s.get(id));
const getAll = (store) => tx(store, "readonly", (s) => s.getAll());
const put = (store, obj) => tx(store, "readwrite", (s) => void s.put(obj));

export async function getBooks() {
  return getAll("books");
}

export async function saveBook(meta) {
  await put("books", { ...meta, updatedAt: Date.now() });
}

export async function saveProgress(bookId, wordIndex) {
  const book = await getOne("books", bookId);
  if (!book) return;
  await put("books", { ...book, wordIndex, updatedAt: Date.now() });
}

export async function getBookmarks(bookId) {
  return (await getAll("bookmarks")).filter((b) => b.bookId === bookId && !b.deleted);
}

export async function toggleBookmark(bookId, wordIndex, note) {
  const id = `bm:${bookId}:${wordIndex}`;
  const existing = await getOne("bookmarks", id);
  const now = Date.now();
  if (existing && !existing.deleted) {
    await put("bookmarks", { ...existing, deleted: true, updatedAt: now });
  } else {
    const bm = { id, bookId, wordIndex, updatedAt: now };
    if (note !== undefined) bm.note = note;
    await put("bookmarks", bm);
  }
}

export async function logSession(s) {
  await put("sessions", { ...s, updatedAt: Date.now() });
}

function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getStats() {
  const sessions = await getAll("sessions");
  let totalWords = 0;
  let totalMs = 0;
  const days = {};
  for (const s of sessions) {
    const words = s.words || 0;
    totalWords += words;
    totalMs += Math.max(0, (s.endedAt || 0) - (s.startedAt || 0));
    const k = dayKey(s.startedAt);
    days[k] = (days[k] || 0) + words;
  }
  const avgWpm = totalMs > 0 ? Math.round(totalWords / (totalMs / 60000)) : 0;
  return { totalWords, totalMs, avgWpm, days };
}

export async function getSettings() {
  const saved = (await getOne("settings", "settings")) || {};
  const { id, ...rest } = saved;
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(s) {
  await put("settings", { ...s, id: "settings", updatedAt: Date.now() });
}

// ---- raw access for couch.js (docs keyed by CouchDB _id) ----
const PREFIX = { books: "book:", bookmarks: "", sessions: "", settings: "" };

function storeForId(_id) {
  if (_id.startsWith("book:")) return "books";
  if (_id.startsWith("bm:")) return "bookmarks";
  if (_id.startsWith("session:")) return "sessions";
  if (_id === "settings") return "settings";
  return null;
}

export async function listDocs() {
  const out = [];
  for (const store of STORES) {
    for (const o of await getAll(store)) out.push({ ...o, _id: PREFIX[store] + o.id });
  }
  return out;
}

// Write a replicated doc without touching its updatedAt.
export async function putDoc(doc) {
  const store = storeForId(doc._id);
  if (!store) return false;
  const { _id, _rev, ...obj } = doc;
  obj.id = store === "books" ? _id.slice(PREFIX.books.length) : _id;
  await put(store, obj);
  return true;
}
