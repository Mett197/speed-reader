import { describe, it, expect } from "vitest";
import { contrastRatio, THEMES, applyTheme, isNight } from "./themes.js";

describe("contrastRatio", () => {
  it("black/white is 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("known pair #767676 on white is about 4.54", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });
});

describe("THEMES", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    it(`${name} meets contrast`, () => {
      expect(contrastRatio(t.fg, t.bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("night is amber on black", () => {
    expect(THEMES.night.bg).toBe("#000000");
  });
});

describe("applyTheme / isNight", () => {
  it("sets css variables", () => {
    const vars = {};
    const el = { style: { setProperty: (k, v) => (vars[k] = v) } };
    applyTheme("dark", el);
    expect(vars["--bg"]).toBe("#121212");
    applyTheme({ bg: "#000000", fg: "#ffffff", accent: "#ff0000" }, el);
    expect(vars["--dim"]).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("night window 21:00-06:59", () => {
    const at = (h, m = 0) => new Date(2026, 0, 1, h, m);
    expect(isNight(at(21))).toBe(true);
    expect(isNight(at(6, 59))).toBe(true);
    expect(isNight(at(7))).toBe(false);
    expect(isNight(at(20, 59))).toBe(false);
    expect(isNight(at(0))).toBe(true);
  });
});
