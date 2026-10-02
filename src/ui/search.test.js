import { describe, it, expect } from "vitest";
import { searchWords } from "./search.js";

const words = "The café was quiet. Naïve readers love a quiet café, really.".split(" ");

describe("searchWords", () => {
  it("is case and accent insensitive", () => {
    const r = searchWords(words, "CAFE");
    expect(r.map((x) => x.index)).toEqual([1, 9]);
  });
  it("matches phrases", () => {
    expect(searchWords(words, "quiet cafe").map((x) => x.index)).toEqual([8]);
  });
  it("matches prefix of last term and ignores punctuation", () => {
    expect(searchWords(words, "naive")[0].index).toBe(4);
    expect(searchWords(words, "quiet")).toHaveLength(2);
  });
  it("caps results and builds snippets", () => {
    const many = Array(500).fill("go");
    expect(searchWords(many, "go")).toHaveLength(200);
    expect(searchWords(many, "go", { max: 5 })).toHaveLength(5);
    expect(searchWords(words, "was", { context: 1 })[0].snippet).toBe("café was quiet.");
  });
  it("handles empty input", () => {
    expect(searchWords(words, "  ")).toEqual([]);
    expect(searchWords([], "a")).toEqual([]);
  });
});
