import { WPM_MIN, WPM_MAX } from "../contracts.js";

export { WPM_MIN, WPM_MAX };

const roundAway = (x) => Math.sign(x) * Math.round(Math.abs(x));

// dyPx > 0 means the finger moved up = faster. velocity in px/ms.
export function dragToWpm(startWpm, dyPx, velocity = 0) {
  const d = Math.abs(dyPx);
  const curve = 0.5 * d + 0.03 * Math.pow(Math.max(0, d - 40), 1.5);
  const boost = 1 + Math.min(0.5, 0.25 * Math.abs(velocity));
  const delta = Math.sign(dyPx) * curve * boost;
  const wpm = 5 * Math.round(startWpm / 5) + 5 * roundAway(delta / 5);
  return Math.min(WPM_MAX, Math.max(WPM_MIN, wpm));
}

// Signed word offset for a horizontal swipe.
export function swipeToWords(dxPx) {
  const d = Math.abs(dxPx);
  const w = d / 12 + Math.pow(Math.max(0, d - 150), 2) / 1200;
  return Math.trunc(w) * Math.sign(dxPx) || 0;
}
