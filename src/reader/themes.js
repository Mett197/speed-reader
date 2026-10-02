// Reader themes and WCAG contrast helpers.

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const THEMES = {
  light: { bg: "#fafaf7", fg: "#1a1a1a", accent: "#c0271a", dim: "#6b6b66" },
  sepia: { bg: "#f4ecd8", fg: "#3b2f20", accent: "#a52a14", dim: "#75664f" },
  dark: { bg: "#121212", fg: "#e6e6e6", accent: "#ff6b5e", dim: "#8a8a8a" },
  night: { bg: "#000000", fg: "#ffb35c", accent: "#ff8a3d", dim: "#8a5a2a" },
};

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * t + ((pb >> s) & 255) * (1 - t));
  return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

export function applyTheme(themeNameOrCustom, rootEl) {
  const t = typeof themeNameOrCustom === "string"
    ? THEMES[themeNameOrCustom] || THEMES.light
    : themeNameOrCustom;
  const dim = t.dim || mix(t.fg, t.bg, 0.55);
  const s = rootEl.style;
  s.setProperty("--bg", t.bg);
  s.setProperty("--fg", t.fg);
  s.setProperty("--accent", t.accent);
  s.setProperty("--dim", dim);
  return { ...t, dim };
}

export function isNight(date = new Date()) {
  const h = date.getHours();
  return h >= 21 || h < 7;
}
