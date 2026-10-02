// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import TextPane, { windowRange, WINDOW } from "./TextPane.jsx";

afterEach(cleanup);
const words = Array.from({ length: 5000 }, (_, i) => "w" + i);

describe("windowRange", () => {
  it("clamps at both ends", () => {
    expect(windowRange(5000, 0)).toEqual([0, WINDOW]);
    expect(windowRange(5000, 4999)).toEqual([5000 - WINDOW, 5000]);
    expect(windowRange(100, 50)).toEqual([0, 100]);
  });
});

describe("TextPane", () => {
  it("renders only a window and handles jump and bookmark dot", () => {
    window.HTMLElement.prototype.scrollIntoView = () => {};
    let jumped = null;
    const { container } = render(
      <TextPane words={words} currentIndex={2500} onJump={(i) => (jumped = i)} bookmarks={new Set([2500])} paragraphBreaks={new Set()} />,
    );
    const spans = container.querySelectorAll(".tp-word");
    expect(spans.length).toBe(WINDOW);
    expect(container.querySelector(".tp-word.cur").textContent).toBe("w2500");
    expect(container.querySelectorAll(".tp-word.bm").length).toBe(1);
    fireEvent.click(container.querySelector('[data-i="2501"]'));
    expect(jumped).toBe(2501);
  });
});
