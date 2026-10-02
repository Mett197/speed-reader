// Thin pointer-event layer: tap, vertical WPM drag, horizontal scrub, long press.

export const LOCK_PX = 8;
export const TAP_MS = 250;
export const LONG_PRESS_MS = 500;

// 'v' (WPM), 'h' (scrub) or null while under the lock threshold.
export function classifyGesture(dx, dy) {
  if (Math.hypot(dx, dy) < LOCK_PX) return null;
  return Math.abs(dy) >= Math.abs(dx) ? "v" : "h";
}

export function attachGestures(el, handlers = {}) {
  const h = handlers;
  let g = null;
  el.style.touchAction = "none";

  const clear = () => g && clearTimeout(g.timer);

  function down(e) {
    if (g) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, lock: null, long: false, vy: 0, py: e.clientY, pt: e.timeStamp };
    g.timer = setTimeout(() => {
      if (g && !g.lock) { g.long = true; h.onLongPress && h.onLongPress(); }
    }, LONG_PRESS_MS);
  }

  function move(e) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.lock) {
      g.lock = classifyGesture(dx, dy);
      if (!g.lock) return;
      clear();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      g.phase = "start";
    }
    const dt = e.timeStamp - g.pt;
    if (dt > 0) g.vy = (g.py - e.clientY) / dt;
    g.py = e.clientY;
    g.pt = e.timeStamp;
    if (g.lock === "v") h.onWpmDrag && h.onWpmDrag(-dy, Math.abs(g.vy), g.phase);
    else h.onScrub && h.onScrub(dx, g.phase);
    g.phase = "move";
  }

  function up(e) {
    if (!g || e.pointerId !== g.id) return;
    const s = g;
    g = null;
    clearTimeout(s.timer);
    if (s.lock) {
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (s.lock === "v") h.onWpmDrag && h.onWpmDrag(-dy, Math.abs(s.vy), "end");
      else h.onScrub && h.onScrub(dx, "end");
      return;
    }
    if (s.long || e.timeStamp - s.t >= TAP_MS) return;
    h.onTap && h.onTap();
  }

  function cancel(e) {
    if (!g || e.pointerId !== g.id) return;
    const s = g;
    g = null;
    clearTimeout(s.timer);
    if (s.lock === "v") h.onWpmDrag && h.onWpmDrag(0, 0, "end");
    else if (s.lock === "h") h.onScrub && h.onScrub(0, "end");
  }

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  return function detach() {
    clear();
    g = null;
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
  };
}
