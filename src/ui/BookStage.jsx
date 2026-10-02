import { memo, useEffect, useMemo, useRef } from "react";

// The original reader's book view: dimmed book text behind, focus word in front.
// Gestures are handled by the page-wide layer, so this has no drag handlers.

function joinWordsWithBreaks(words, startIdx, endIdx, breaks) {
  const parts = [];
  for (let i = startIdx; i < endIdx; i++) {
    if (i > startIdx && breaks.has(i)) parts.push("\n\n");
    else if (i > startIdx) parts.push(" ");
    parts.push(words[i]);
  }
  return parts.join("");
}

function FocusWord({ display, orpIdx, sideOpacity, fit, guide = "bv" }) {
  const before = display.slice(0, orpIdx);
  const orp = display[orpIdx] || "";
  const after = display.slice(orpIdx + 1);
  const cls = guide === "bv"
    ? { area: "bv-display-area", g: "bv-focal-guide", l: "bv-focal-line", m: "bv-focal-marker", c: "bv-word-container", w: "bv-word-display mono" }
    : { area: "display-area", g: "focal-guide", l: "focal-line", m: "focal-marker", c: "word-container", w: "word-display mono" };
  return (
    <div className={cls.area}>
      <div className={cls.g}><div className={cls.l} /><div className={cls.m} /><div className={cls.l} /></div>
      <div className={cls.c}>
        {display ? (
          <div
            className={cls.w}
            style={{ transform: `translateY(-50%) translateX(calc(-${orpIdx}ch - 0.5ch))`, fontSize: fit < 1 ? `${fit}em` : undefined }}
          >
            <span className="before-orp" style={{ opacity: sideOpacity }}>{before}</span>
            <span className="orp-char">{orp}</span>
            <span className="after-orp" style={{ opacity: sideOpacity }}>{after}</span>
          </div>
        ) : (
          <div className={cls.w} style={{ transform: "translateY(-50%) translateX(-50%)" }}>
            <span className="placeholder">Ready</span>
          </div>
        )}
      </div>
      <div className={cls.g}><div className={cls.l} /><div className={cls.m} /><div className={cls.l} /></div>
    </div>
  );
}

// Shrink so the longer side of the word (from the ORP letter) fits in half the stage width.
export function fitFor(display, orpIdx, stageCh) {
  const side = Math.max(orpIdx + 0.5, display.length - orpIdx - 0.5);
  if (!stageCh || side <= stageCh / 2) return 1;
  return Math.max(0.6, (stageCh / 2) / side);
}

function useStageCh(ref) {
  const ch = useRef(0);
  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const probe = document.createElement("span");
      probe.className = "mono";
      probe.style.cssText = "position:absolute;visibility:hidden;font-size:inherit";
      probe.textContent = "0000000000";
      const host = el.querySelector(".bv-word-display, .word-display") || el;
      host.appendChild(probe);
      const w = probe.getBoundingClientRect().width / 10;
      probe.remove();
      if (w > 0) ch.current = el.clientWidth / w;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);
  return ch;
}

const BookStage = memo(function BookStage({ words, currentIndex, display, orpIdx, sideOpacity, paragraphBreaks, overlayHidden, bookView }) {
  const stageRef = useRef(null);
  const bgContainerRef = useRef(null);
  const bgTextRef = useRef(null);
  const markerRef = useRef(null);
  const bgWindowRef = useRef({ start: 0, end: 0 });
  const stageCh = useStageCh(stageRef);
  const fit = fitFor(display, orpIdx, stageCh.current);

  const bgHalf = 500;
  const bgBuffer = 100;
  const prev = bgWindowRef.current;
  let bgStart = prev.start;
  let bgEnd = prev.end;
  if (currentIndex - bgStart < bgBuffer || bgEnd - currentIndex < bgBuffer || prev.start === prev.end) {
    bgStart = Math.max(0, currentIndex - bgHalf);
    bgEnd = Math.min(words.length, currentIndex + bgHalf);
    bgWindowRef.current = { start: bgStart, end: bgEnd };
  }
  const past = useMemo(() => joinWordsWithBreaks(words, bgStart, currentIndex, paragraphBreaks), [words, bgStart, currentIndex, paragraphBreaks]);
  const future = useMemo(() => joinWordsWithBreaks(words, currentIndex + 1, bgEnd, paragraphBreaks), [words, currentIndex, bgEnd, paragraphBreaks]);
  const activeWord = words[currentIndex] || "";

  useEffect(() => {
    if (!bookView) return;
    if (markerRef.current && bgTextRef.current && bgContainerRef.current) {
      const containerH = bgContainerRef.current.clientHeight;
      const markerTop = markerRef.current.offsetTop - bgTextRef.current.offsetTop;
      const offset = containerH * 0.3 - markerTop - markerRef.current.offsetHeight / 2;
      bgTextRef.current.style.transform = `translateY(${offset}px)`;
    }
  }, [currentIndex, bookView]);

  if (!bookView) {
    return (
      <div className="main-area" ref={stageRef}>
        <FocusWord display={display} orpIdx={orpIdx} sideOpacity={sideOpacity} fit={fit} guide="plain" />
      </div>
    );
  }

  return (
    <div className="bv-outer" ref={stageRef}>
      <div ref={bgContainerRef} className="bv-bg">
        <div ref={bgTextRef} className="bv-bg-text">
          {past}
          {past ? (paragraphBreaks.has(currentIndex) ? "\n\n" : " ") : ""}
          <span ref={markerRef} className="bv-bg-active-word">{activeWord}</span>
          {paragraphBreaks.has(currentIndex + 1) ? "\n\n" : " "}
          {future}
        </div>
      </div>
      <div className="flex-spacer" />
      {!overlayHidden && (
        <div className="bv-center">
          <FocusWord display={display} orpIdx={orpIdx} sideOpacity={sideOpacity} fit={fit} guide="bv" />
        </div>
      )}
      <div className="flex-spacer" />
    </div>
  );
});

export default BookStage;
