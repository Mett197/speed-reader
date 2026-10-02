import { describe, it, expect } from "vitest";
import { getSentenceStarts, prevSentenceStart, nextSentenceStart } from "./sentences.js";

const starts = (t) => getSentenceStarts(t.split(" "));

describe("getSentenceStarts", () => {
  it("handles empty and single", () => {
    expect(getSentenceStarts([])).toEqual([]);
    expect(starts("Hi")).toEqual([0]);
  });
  it("splits on . ! ?", () => {
    expect(starts("One two. Three! Four? Five")).toEqual([0, 2, 3, 4]);
  });
  it("handles closing quotes and brackets", () => {
    expect(starts('He said "go." Then left (maybe.) End')).toEqual([0, 3, 6]);
  });
  it("ignores abbreviations", () => {
    expect(starts("Mr. Smith met Dr. Jones, e.g. today, etc. Then he left.")).toEqual([0]);
    expect(starts("Ask J. R. Tolkien. Done")).toEqual([0, 4]);
  });
  it("ellipsis only ends before a capital", () => {
    expect(starts("Well... maybe so. Yes")).toEqual([0, 3]);
    expect(starts("Well... Maybe so")).toEqual([0, 1]);
    expect(starts("Well… maybe so")).toEqual([0]);
  });
});

describe("prev/next sentence start", () => {
  const s = [0, 5, 9, 20];
  it("prev goes to current start or previous start", () => {
    expect(prevSentenceStart(s, 7)).toBe(5);
    expect(prevSentenceStart(s, 9)).toBe(5);
    expect(prevSentenceStart(s, 25)).toBe(20);
    expect(prevSentenceStart(s, 20)).toBe(9);
  });
  it("prev clamps to 0", () => {
    expect(prevSentenceStart(s, 0)).toBe(0);
    expect(prevSentenceStart(s, 3)).toBe(0);
    expect(prevSentenceStart([], 3)).toBe(0);
  });
  it("next goes to the following start and clamps to last", () => {
    expect(nextSentenceStart(s, 0)).toBe(5);
    expect(nextSentenceStart(s, 6)).toBe(9);
    expect(nextSentenceStart(s, 20)).toBe(20);
    expect(nextSentenceStart(s, 99)).toBe(20);
  });
});
