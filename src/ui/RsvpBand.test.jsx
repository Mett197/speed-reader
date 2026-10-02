// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import RsvpBand, { fitScale, orpCharIndex } from "./RsvpBand.jsx";

afterEach(cleanup);

describe("fitScale", () => {
  it("never scales above 1 and never below 60%", () => {
    expect(fitScale(50, 50, 20, 800)).toBe(1);
    expect(fitScale(1000, 1000, 20, 300)).toBe(0.6);
  });
  it("shrinks so the word fits", () => {
    const s = fitScale(200, 100, 20, 400, 0);
    expect((200 + 10) * s).toBeLessThanOrEqual(200);
  });
});

describe("orpCharIndex", () => {
  it("skips leading punctuation", () => {
    expect(orpCharIndex('"hello', 1)).toBe(2);
  });
});

describe("RsvpBand", () => {
  it("scales the font down when the word is too wide", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return 300; } });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 400; } });
    const { container } = render(<RsvpBand word="extraordinarily" orpIndex={4} fontScale={1} wpm={300} />);
    const fit = Number(container.querySelector(".rsvp-band").dataset.fit);
    expect(fit).toBeLessThan(1);
    expect(fit).toBeGreaterThanOrEqual(0.6);
    expect(container.querySelector(".rsvp-orp").textContent).toBe("a");
  });
});
