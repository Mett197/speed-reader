import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as store from "./store.js";
import { syncNow, startAutoSync, debouncedSaveProgress, _resetCouch } from "./couch.js";

const json = (d, status = 200) => new Response(JSON.stringify(d), { status });
const book = { id: "k:1", title: "B", totalWords: 100, wordIndex: 0, updatedAt: 1 };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  store._resetStore();
  _resetCouch();
  vi.restoreAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("store", () => {
  it("defaults settings and saves", async () => {
    expect(await store.getSettings()).toEqual({ wpm: 300, theme: "dark", autoNight: true, chunkSize: 1, pauseEverySentences: 0, fontScale: 1 });
    await store.saveSettings({ wpm: 500 });
    expect((await store.getSettings()).wpm).toBe(500);
    expect((await store.getSettings()).theme).toBe("dark");
  });

  it("saves books and progress with updatedAt", async () => {
    await store.saveBook(book);
    await store.saveProgress("k:1", 42);
    const [b] = await store.getBooks();
    expect(b.wordIndex).toBe(42);
    expect(b.updatedAt).toBeGreaterThan(1);
  });

  it("toggles bookmarks with tombstones", async () => {
    await store.toggleBookmark("k:1", 5, "n");
    expect(await store.getBookmarks("k:1")).toHaveLength(1);
    await store.toggleBookmark("k:1", 5);
    expect(await store.getBookmarks("k:1")).toHaveLength(0);
    const docs = await store.listDocs();
    expect(docs.find((d) => d._id === "bm:k:1:5").deleted).toBe(true);
    await store.toggleBookmark("k:1", 5);
    expect(await store.getBookmarks("k:1")).toHaveLength(1);
  });

  it("computes stats", async () => {
    const t = new Date(2026, 0, 5, 10).getTime();
    await store.logSession({ id: "session:1", bookId: "k:1", startedAt: t, endedAt: t + 60000, words: 300, avgWpm: 300 });
    await store.logSession({ id: "session:2", bookId: "k:1", startedAt: t + 120000, endedAt: t + 180000, words: 100, avgWpm: 100 });
    const s = await store.getStats();
    expect(s).toEqual({ totalWords: 400, totalMs: 120000, avgWpm: 200, days: { "2026-01-05": 400 } });
  });
});

describe("couch", () => {
  it("returns online:false and changes nothing when offline or non-2xx", async () => {
    await store.saveBook(book);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("net"));
    expect(await syncNow()).toEqual({ pushed: 0, pulled: 0, online: false });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 500 }));
    expect((await syncNow()).online).toBe(false);
    expect(await store.getBooks()).toHaveLength(1);
  });

  it("pulls remote docs and pushes local ones", async () => {
    await store.saveBook(book);
    const remote = { _id: "settings", _rev: "1-a", wpm: 700, updatedAt: 5 };
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("_all_docs")) return json({ rows: [{ doc: remote }] });
      const docs = JSON.parse(init.body).docs;
      expect(docs.map((d) => d._id)).toEqual(["book:k:1"]);
      return json([{ ok: true, id: "book:k:1", rev: "1-b" }]);
    });
    expect(await syncNow()).toEqual({ pushed: 1, pulled: 1, online: true });
    expect((await store.getSettings()).wpm).toBe(700);
    f.mockClear();
    f.mockImplementation(async (url) => json({ rows: [{ doc: remote }, { doc: { _id: "book:k:1", _rev: "1-b", ...(await store.listDocs()).find((d) => d._id === "book:k:1") } }] }));
    expect(await syncNow()).toEqual({ pushed: 0, pulled: 0, online: true });
  });

  it("resolves conflicts last-write-wins", async () => {
    await store.saveBook(book); // local updatedAt = now
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("_all_docs")) return json({ rows: [] });
      if (u.endsWith("/book%3Ak%3A1")) return json({ _id: "book:k:1", _rev: "2-z", id: "k:1", title: "R", updatedAt: 1 });
      const docs = JSON.parse(init.body).docs;
      return json(docs[0]._rev ? [{ ok: true, id: "book:k:1", rev: "3-q" }] : [{ id: "book:k:1", error: "conflict" }]);
    });
    expect(await syncNow()).toEqual({ pushed: 1, pulled: 0, online: true });
  });

  it("remote wins conflict when newer, tombstone wins ties", async () => {
    await store.toggleBookmark("k:1", 1);
    const local = (await store.listDocs()).find((d) => d._id === "bm:k:1:1");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("_all_docs")) return json({ rows: [{ doc: { ...local, _rev: "2-a", deleted: true } }] });
      throw new Error("no push expected");
    });
    expect(await syncNow()).toEqual({ pushed: 0, pulled: 1, online: true });
    expect(await store.getBookmarks("k:1")).toHaveLength(0);
  });

  it("debounces progress writes by 2 s", async () => {
    await store.saveBook(book);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    debouncedSaveProgress("k:1", 1);
    debouncedSaveProgress("k:1", 2);
    vi.advanceTimersByTime(1999);
    await new Promise((r) => setImmediate(r));
    expect((await store.getBooks())[0].wordIndex).toBe(0);
    vi.advanceTimersByTime(1);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect((await store.getBooks())[0].wordIndex).toBe(2);
  });

  it("startAutoSync syncs on start, interval and stop", async () => {
    vi.useFakeTimers();
    const f = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    const stop = startAutoSync(1000);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
