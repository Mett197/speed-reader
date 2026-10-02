import { describe, it, expect, vi, beforeEach } from "vitest";
import { kavitaLogin, kavitaListBooks, kavitaFetchEpub, kavitaSaveProgress, _resetKavita } from "./kavita.js";
import { llSearch, llAddAndQueue } from "./lazylibrarian.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => {
  _resetKavita();
  vi.restoreAllMocks();
});

describe("kavita", () => {
  it("logs in without sending a key and re-logs once on 401", async () => {
    let calls = 0;
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("plugin/authenticate")) {
        expect(String(url)).not.toMatch(/apiKey/);
        return json({ token: "t" + ++calls, refreshToken: "r" });
      }
      return init.headers.Authorization === "Bearer t1" ? new Response("", { status: 401 }) : new Blob(["x"]).size && new Response("epub");
    });
    await kavitaLogin();
    const blob = await kavitaFetchEpub(7);
    expect(await blob.text()).toBe("epub");
    expect(f.mock.calls.filter((c) => String(c[0]).includes("authenticate"))).toHaveLength(2);
  });

  it("lists only epubs and maps to BookMeta", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("authenticate")) return json({ token: "t" });
      if (u.includes("/series/v2")) {
        const body = JSON.parse(init.body);
        expect(body.statements.some((s) => s.field === 1 && s.value === "dune")).toBe(true);
        return json([{ id: 1, name: "Dune", format: 3 }, { id: 2, name: "Comic", format: 1 }]);
      }
      if (u.includes("seriesId=1")) return json([{ id: 10, chapters: [{ id: 100 }] }]);
      throw new Error("unexpected " + u);
    });
    const books = await kavitaListBooks("dune");
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ id: "k:100", title: "Dune", source: "kavita", kavitaSeriesId: 1, kavitaVolumeId: 10, kavitaChapterId: 100 });
  });

  it("saves progress", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("authenticate") ? json({ token: "t" }) : new Response(""));
    await kavitaSaveProgress({ seriesId: 1, volumeId: 2, chapterId: 3 }, 9);
    const last = f.mock.calls.at(-1);
    expect(last[0]).toBe("/api/kavita/api/reader/progress");
    expect(JSON.parse(last[1].body)).toMatchObject({ seriesId: 1, volumeId: 2, chapterId: 3, pageNum: 9 });
  });

  it("throws on login failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    await expect(kavitaLogin()).rejects.toThrow(/login failed/);
  });
});

describe("lazylibrarian", () => {
  it("parses array results", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json([{ bookid: "a1", bookname: "T", authorname: "A" }]));
    expect(await llSearch("a b")).toEqual([{ id: "a1", title: "T", author: "A" }]);
    expect(f.mock.calls[0][0]).toBe("/api/ll/api?cmd=findBook&name=a+b");
  });
  it("parses object results and throws on error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ results: [{ BookID: "z", BookName: "Q" }] }));
    expect((await llSearch("q"))[0].id).toBe("z");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ status: "error", message: "boom" }));
    await expect(llSearch("q")).rejects.toThrow(/boom/);
  });
  it("adds then queues", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("OK"));
    await llAddAndQueue("42");
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "/api/ll/api?cmd=addBook&id=42",
      "/api/ll/api?cmd=queueBook&id=42&type=eBook",
    ]);
  });
  it("throws on http failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 500 }));
    await expect(llAddAndQueue("1")).rejects.toThrow(/failed/);
  });
});
