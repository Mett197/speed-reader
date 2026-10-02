// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import LibraryPanel from "./LibraryPanel.jsx";

afterEach(cleanup);

describe("LibraryPanel", () => {
  const books = [
    { id: "a", title: "Zeta", totalWords: 100, wordIndex: 50, updatedAt: 1, offline: true },
    { id: "b", title: "Alpha", totalWords: 100, wordIndex: 0, cover: "http://x/c.jpg" },
    { id: "c", title: "Mid", totalWords: 100, wordIndex: 99, updatedAt: 5 },
    { id: "d", title: "Beta", totalWords: 100, wordIndex: 10, updatedAt: 9 },
  ];
  it("lists continue reading newest first and all books alphabetically", () => {
    const { container } = render(<LibraryPanel books={books} onImport={() => {}} />);
    const [cont, all] = [...container.querySelectorAll(".sec")];
    const titles = (el) => [...el.querySelectorAll(".row-title")].map((n) => n.textContent);
    expect(titles(cont)).toEqual(["Beta", "Zeta"]);
    expect(titles(all)).toEqual(["Alpha", "Beta", "Mid", "Zeta"]);
    expect(container.querySelectorAll(".badge").length).toBe(2);
    expect(container.querySelector("img").getAttribute("src")).toBe("http://x/c.jpg");
    expect(container.textContent).toContain("Add a book");
  });
});
