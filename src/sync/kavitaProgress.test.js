import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { wordToPage, createKavitaReporter } from "./kavitaProgress.js";
import { parseEpub, parseText } from "../lib/books.js";

const spine = [
  { page: 0, startIndex: 0 },
  { page: 2, startIndex: 100 },
  { page: 3, startIndex: 250 },
];
const meta = { id: "k:9", kavitaChapterId: 9, kavitaSeriesId: 1, kavitaVolumeId: 2, kavitaLibraryId: 3, totalWords: 1000 };

describe("wordToPage", () => {
  it("handles edges", () => {
    expect(wordToPage(spine, 0).pageNum).toBe(0);
    expect(wordToPage(spine, 99).pageNum).toBe(0);
    expect(wordToPage(spine, 100).pageNum).toBe(2);
    expect(wordToPage(spine, 249).pageNum).toBe(2);
    expect(wordToPage(spine, 99999).pageNum).toBe(3);
    expect(wordToPage(spine, -5).pageNum).toBe(0);
    expect(wordToPage([], 3)).toBeNull();
  });
});

describe("reporter", () => {
  const make = (extra = {}) => {
    let t = 0;
    const fn = vi.fn(async () => {});
    const r = createKavitaReporter({ saveProgressFn: fn, now: () => t, ...extra });
    return { fn, r, tick: (ms) => (t += ms) };
  };

  it("throttles and sends only on page change", async () => {
    const { fn, r, tick } = make();
    tick(20000);
    await r.report(meta, spine, 5);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]).toEqual([{ seriesId: 1, volumeId: 2, chapterId: 9, libraryId: 3 }, 0]);
    tick(2000);
    await r.report(meta, spine, 50); // same page
    expect(fn).toHaveBeenCalledTimes(1);
    tick(1000);
    await r.report(meta, spine, 120); // page changed but throttled
    expect(fn).toHaveBeenCalledTimes(1);
    await r.flush(); // trailing
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1][1]).toBe(2);
    await r.flush();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("no-ops for local books and books without spine", async () => {
    const { fn, r, tick } = make();
    tick(20000);
    await r.report({ id: "h:1", totalWords: 10 }, spine, 5);
    await r.report(meta, undefined, 5);
    await r.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("swallows errors and retries on the next report", async () => {
    const { fn, r, tick } = make();
    fn.mockRejectedValueOnce(new Error("net"));
    tick(20000);
    await expect(r.report(meta, spine, 120)).resolves.toBeUndefined();
    tick(1);
    await r.report(meta, spine, 121);
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(r.flush()).resolves.toBeUndefined();
  });

  it("marks finished within the last 1 percent on flush", async () => {
    const { fn, r, tick } = make();
    tick(20000);
    await r.report(meta, spine, 995);
    expect(fn.mock.calls[0][1]).toBe(3);
    await r.flush();
    expect(fn.mock.calls.at(-1)[1]).toBe(4); // last page + 1, Kavita caps to chapter.Pages
  });
});

describe("parseEpub spine", () => {
  it("returns page indexes and word starts matching parseText", async () => {
    const words = (n, w) => Array(n).fill(w).join(" ");
    const zip = new JSZip();
    zip.file("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>');
    zip.file(
      "OEBPS/c.opf",
      `<package><metadata><dc:title>T</dc:title></metadata><manifest>
<item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>
<item id="b" href="b.xhtml" media-type="application/xhtml+xml"/>
<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/>
</manifest><spine><itemref idref="a"/><itemref idref="b"/><itemref idref="c"/></spine></package>`,
    );
    zip.file("OEBPS/a.xhtml", `<html><body><p>${words(5, "one")}</p></body></html>`);
    zip.file("OEBPS/b.xhtml", "<html><body></body></html>");
    zip.file("OEBPS/c.xhtml", `<html><body><p>${words(7, "two")}</p></body></html>`);
    const out = await parseEpub(await zip.generateAsync({ type: "uint8array" }));
    expect(out.spine).toEqual([
      { page: 0, startIndex: 0 },
      { page: 2, startIndex: 5 },
    ]);
    const { words: w } = parseText(out.text);
    expect(w[5]).toBe("two");
    expect(w).toHaveLength(12);
  });
});
