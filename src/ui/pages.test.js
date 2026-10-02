import { describe, it, expect } from "vitest";
import { pageCount, pageOf, pageStart, wordToIndex } from "./pages.js";

describe("pages", () => {
  it("counts pages, at least one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(250)).toBe(1);
    expect(pageCount(251)).toBe(2);
  });
  it("maps word index to a 1-based page", () => {
    expect(pageOf(0)).toBe(1);
    expect(pageOf(249)).toBe(1);
    expect(pageOf(250)).toBe(2);
  });
  it("maps page to its first word and clamps", () => {
    expect(pageStart(1, 1000)).toBe(0);
    expect(pageStart(3, 1000)).toBe(500);
    expect(pageStart(99, 1000)).toBe(750);
    expect(pageStart(-4, 1000)).toBe(0);
    expect(pageStart(2, 100)).toBe(0);
  });
  it("maps a typed word number to a clamped index", () => {
    expect(wordToIndex(1, 1000)).toBe(0);
    expect(wordToIndex(1000, 1000)).toBe(999);
    expect(wordToIndex(5000, 1000)).toBe(999);
    expect(wordToIndex("abc", 1000)).toBe(0);
  });
});
