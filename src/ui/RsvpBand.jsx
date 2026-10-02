import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { attachGestures } from "../reader/gestureLayer.js";

export const MIN_FIT = 0.6;

// Pure: scale so that the word fits on both sides of the guide line.
export function fitScale(beforeW, afterW, orpW, bandW, pad = 16) {
  const half = bandW / 2 - pad;
  const need = Math.max(beforeW, afterW) + orpW / 2;
  if (!need || half <= 0) return 1;
  return Math.max(MIN_FIT, Math.min(1, half / need));
}

// Char index of the orpIndex-th letter or digit (punctuation is skipped).
export function orpCharIndex(text, orpIndex) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[\p{L}\p{N}]/u.test(text[i])) {
      if (n === orpIndex) return i;
      n++;
    }
  }
  return Math.min(Math.max(orpIndex, 0), Math.max(text.length - 1, 0));
}

export default function RsvpBand({
  word = "", chunks, orpIndex = 0, fontScale = 1, wpm,
  showWpmBubble = false, onTap, onWpmDrag, onScrub, onLongPress,
}) {
  const bandRef = useRef(null);
  const beforeRef = useRef(null);
  const afterRef = useRef(null);
  const orpRef = useRef(null);
  const handlers = useRef({});
  handlers.current = { onTap, onWpmDrag, onScrub, onLongPress };
  const [fit, setFit] = useState(1);
  const [bubble, setBubble] = useState(false);

  const text = chunks && chunks.length ? chunks.join(" ") : word;
  const oi = orpCharIndex(text, orpIndex);
  const before = text.slice(0, oi);
  const orp = text.slice(oi, oi + 1);
  const after = text.slice(oi + 1);

  useLayoutEffect(() => {
    const band = bandRef.current;
    if (!band) return;
    // measure at natural size (fit applied through font-size on the inner stage)
    const stage = band.firstChild;
    const prev = stage.style.fontSize;
    stage.style.fontSize = "";
    const s = fitScale(
      beforeRef.current.offsetWidth, afterRef.current.offsetWidth,
      orpRef.current.offsetWidth, band.clientWidth,
    );
    stage.style.fontSize = prev;
    setFit((f) => (Math.abs(f - s) < 0.001 ? f : s));
  }, [text, fontScale]);

  useEffect(() => {
    const el = bandRef.current;
    const wrap = (k) => (...a) => handlers.current[k] && handlers.current[k](...a);
    return attachGestures(el, {
      onTap: wrap("onTap"), onWpmDrag: wrap("onWpmDrag"),
      onScrub: wrap("onScrub"), onLongPress: wrap("onLongPress"),
    });
  }, []);

  useEffect(() => {
    if (showWpmBubble) { setBubble(true); return undefined; }
    const t = setTimeout(() => setBubble(false), 800);
    return () => clearTimeout(t);
  }, [showWpmBubble]);

  return (
    <div className="rsvp-band" ref={bandRef} data-fit={fit}>
      <div className="rsvp-stage" style={{ fontSize: `calc(var(--rsvp-base, 2.6rem) * ${fontScale * fit})` }}>
        <span className="rsvp-side rsvp-before"><span ref={beforeRef}>{before}</span></span>
        <span className="rsvp-orp" ref={orpRef}>{orp}</span>
        <span className="rsvp-side rsvp-after"><span ref={afterRef}>{after}</span></span>
      </div>
      <div className="rsvp-guide" aria-hidden="true" />
      <div className={"rsvp-bubble" + (showWpmBubble ? " on" : "")} aria-live="polite" hidden={!bubble && !showWpmBubble}>
        {wpm}
      </div>
    </div>
  );
}
