import { describe, it, expect } from "vitest";
import { getWordDelay, getORPIndex, splitLongWord } from "./timing.js";

const ctx = { baseWpm: 300, isParagraphEnd: false, warmupIndex: -1 };
const d = (w, c = {}) => getWordDelay(w, { ...ctx, ...c });

describe("getWordDelay", () => {
  it("increases with length for 4..15 letters", () => {
    let prev = 0;
    for (let n = 4; n <= 15; n++) {
      const v = d("a".repeat(n));
      expect(v).toBeGreaterThanOrEqual(prev);
      if (n > 6) expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
  it("short words are faster", () => {
    expect(d("the")).toBeCloseTo(200 * 0.85);
  });
  it("punctuation multiplies with length", () => {
    expect(d("cat.")).toBeCloseTo(d("cat") * 2.2);
    expect(d("elephants.")).toBeCloseTo(d("elephants") * 2.2);
    expect(d("elephants.")).toBeGreaterThan(d("cat."));
    expect(d("word,")).toBeCloseTo(d("word") * 1.5);
    expect(d('word."')).toBeCloseTo(d("word") * 2.2);
    expect(d("(word;)")).toBeCloseTo(d("word") * 1.5);
    expect(d("word),")).toBeCloseTo(d("word") * 1.5);
  });
  it("digits and very long words", () => {
    expect(d("abc123")).toBeCloseTo(d("abcdef") * 1.3);
    expect(d("a".repeat(13))).toBeCloseTo(200 * 1.35 * 1.3);
  });
  it("paragraph end replaces sentence factor when larger", () => {
    expect(d("word", { isParagraphEnd: true })).toBeCloseTo(d("word") * 2.5);
    expect(d("word.", { isParagraphEnd: true })).toBeCloseTo(d("word") * 2.5);
  });
  it("warmup", () => {
    expect(d("word", { warmupIndex: 0 })).toBeCloseTo(d("word") / 0.6);
    expect(d("word", { warmupIndex: 4 })).toBeCloseTo(d("word"));
    expect(d("word", { warmupIndex: 5 })).toBeCloseTo(d("word"));
  });
});

describe("getORPIndex", () => {
  it("follows the table", () => {
    const t = [[1, 0], [2, 1], [5, 1], [6, 2], [9, 2], [10, 3], [13, 3], [14, 4], [20, 4]];
    for (const [n, i] of t) expect(getORPIndex("a".repeat(n))).toBe(i);
  });
  it("skips leading punctuation", () => {
    expect(getORPIndex('"hello')).toBe(2);
    expect(getORPIndex("(a")).toBe(1);
    expect(getORPIndex("...")).toBe(0);
  });
});

describe("splitLongWord", () => {
  const rebuild = (parts, word) => {
    let out = "";
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      out += !last && p.endsWith("-") && word[out.length + p.length - 1] !== "-" ? p.slice(0, -1) : p;
    });
    return out;
  };
  it("returns short words unchanged", () => {
    expect(splitLongWord("hello")).toEqual(["hello"]);
    expect(splitLongWord("a".repeat(10))).toEqual(["a".repeat(10)]);
  });
  it("respects maxLen and reconstructs", () => {
    const words = [
      "internationalization",
      "supercalifragilisticexpialidocious",
      "a".repeat(35),
      "pneumonoultramicroscopicsilicovolcanoconiosis",
      "well-known-state-of-the-art-technology",
      "x-".repeat(20),
      "-".repeat(25),
    ];
    for (const w of words) for (const max of [6, 10, 12]) {
      const parts = splitLongWord(w, max);
      parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(max));
      parts.slice(0, -1).forEach((p) => expect(p.endsWith("-")).toBe(true));
      expect(rebuild(parts, w)).toBe(w);
    }
  });
  it("prefers a vowel/consonant boundary", () => {
    const parts = splitLongWord("internationalization", 10);
    expect(parts[0]).toBe("internat-");
  });
});
