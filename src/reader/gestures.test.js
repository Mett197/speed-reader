import { describe, it, expect } from "vitest";
import { dragToWpm, swipeToWords, WPM_MIN, WPM_MAX } from "./gestures.js";

describe("dragToWpm", () => {
  it("zero stays zero", () => {
    expect(dragToWpm(300, 0, 0)).toBe(300);
    expect(dragToWpm(300, 0, 3)).toBe(300);
  });
  it("slow 20px is about 10 wpm", () => {
    expect(dragToWpm(300, 20, 0.05)).toBe(310);
    expect(dragToWpm(300, -20, 0.05)).toBe(290);
  });
  it("first 40px is 5 wpm per 10px", () => {
    expect(dragToWpm(300, 40, 0)).toBe(320);
  });
  it("fast 300px changes by a few hundred", () => {
    const delta = dragToWpm(300, 300, 2) - 300;
    expect(delta).toBeGreaterThan(250);
    expect(delta).toBeLessThan(600);
  });
  it("is symmetric", () => {
    for (const dy of [5, 20, 60, 150, 300]) {
      expect(dragToWpm(600, dy, 1) - 600).toBe(600 - dragToWpm(600, -dy, 1));
    }
  });
  it("is monotonic", () => {
    let prev = -Infinity;
    for (let dy = -400; dy <= 400; dy += 3) {
      const v = dragToWpm(700, dy, 0.5);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("clamps and rounds to 5", () => {
    expect(dragToWpm(1450, 900, 3)).toBe(WPM_MAX);
    expect(dragToWpm(150, -900, 3)).toBe(WPM_MIN);
    for (let dy = -200; dy <= 200; dy += 7) expect(dragToWpm(303, dy, 0.3) % 5).toBe(0);
  });
});

describe("swipeToWords", () => {
  it("zero stays zero (not -0)", () => {
    expect(Object.is(swipeToWords(0), 0)).toBe(true);
    expect(Object.is(swipeToWords(-5), 0)).toBe(true);
  });
  it("about 1 word per 12px, toward zero", () => {
    expect(swipeToWords(11)).toBe(0);
    expect(swipeToWords(12)).toBe(1);
    expect(swipeToWords(-35)).toBe(-2);
    expect(swipeToWords(120)).toBe(10);
  });
  it("is odd-symmetric, monotonic and accelerating beyond 150px", () => {
    let prev = -Infinity;
    for (let dx = -500; dx <= 500; dx += 4) {
      const v = swipeToWords(dx);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBe(-swipeToWords(-dx) || 0);
      prev = v;
    }
    expect(swipeToWords(300)).toBeGreaterThan(300 / 12);
  });
});
