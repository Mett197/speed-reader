import { describe, it, expect } from "vitest";
import { makeEpub } from "./makeEpub.js";
import { parseEpub, parseText } from "./books.js";

describe("makeEpub", () => {
  it("round-trips through parseEpub with the same words and chapters", async () => {
    const text = "Chapter one starts here.\n\nSecond para & <odd> \"chars\".\n\nChapter two text here.\n\nThe end.";
    const words = parseText(text).words;
    const blob = await makeEpub({
      title: "Babel", author: "R. F. Kuang", text,
      chapters: [{ title: "One", startIndex: 0 }, { title: "Two", startIndex: 8 }],
    });
    const parsed = await parseEpub(await blob.arrayBuffer());
    expect(parsed.metadata.title).toBe("Babel");
    expect(parsed.metadata.author).toBe("R. F. Kuang");
    expect(parseText(parsed.text).words).toEqual(words);
    expect(parsed.spine.length).toBe(2);
  });
});
