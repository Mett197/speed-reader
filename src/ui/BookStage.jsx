import { memo, useEffect, useMemo, useRef } from "react";

// The original reader's book view: dimmed text of the current chapter behind, focus word in front.
// Sides of the screen belong to the page-wide gesture layer; the middle zone here
// traverses the text on vertical drag and jumps to a tapped word.

// Window of words as spans (data-i = word index) so a tap can find its word.
function wordSpans(words, startIdx, endIdx, breaks) {
  const out = [];
  for (let i = startIdx; i < endIdx; i++) {
    if (i > startIdx) out.push(breaks.has(i) ? "\n\n" : " ");
    out.push(<span key={i} data-i={i}>{words[i]}</span>);
  }
  return out;
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

const BookStage = memo(function BookStage({
  words, currentIndex, display, orpIdx, sideOpacity, paragraphBreaks, overlayHidden, bookView,
  chapterStart = 0, chapterEnd, chapterTitle, onWordTap, onFocusTap, onTraverse,
}) {
  const stageRef = useRef(null);
  const bgContainerRef = useRef(null);
  const bgTextRef = useRef(null);
  const bgWindowRef = useRef({ start: 0, end: 0, chapterStart: -1 });
  const zone = useRef(null);
  const stageCh = useStageCh(stageRef);
  const fit = fitFor(display, orpIdx, stageCh.current);

  const end = chapterEnd ?? words.length;
  const bgHalf = 500;
  const bgBuffer = 100;
  const prev = bgWindowRef.current;
  let bgStart = prev.start;
  let bgEnd = prev.end;
  const outside = currentIndex < bgStart || currentIndex >= bgEnd;
  const nearEdge = (currentIndex - bgStart < bgBuffer && bgStart > chapterStart) || (bgEnd - currentIndex < bgBuffer && bgEnd < end);
  if (outside || nearEdge || prev.chapterStart !== chapterStart || bgEnd > end) {
    bgStart = Math.max(chapterStart, currentIndex - bgHalf);
    bgEnd = Math.min(end, currentIndex + bgHalf);
    bgWindowRef.current = { start: bgStart, end: bgEnd, chapterStart };
  }
  const spans = useMemo(() => wordSpans(words, bgStart, bgEnd, paragraphBreaks), [words, bgStart, bgEnd, paragraphBreaks]);

  // Highlight the active word and keep it at 30% height without re-rendering the text.
  useEffect(() => {
    if (!bookView || !bgTextRef.current || !bgContainerRef.current) return;
    const old = bgTextRef.current.querySelector(".bv-bg-active-word");
    if (old) old.classList.remove("bv-bg-active-word");
    const el = bgTextRef.current.querySelector(`[data-i="${currentIndex}"]`);
    if (!el) return;
    el.classList.add("bv-bg-active-word");
    const containerH = bgContainerRef.current.clientHeight;
    const offset = containerH * 0.3 - el.offsetTop - el.offsetHeight / 2;
    bgTextRef.current.style.transform = `translateY(${offset}px)`;
  }, [currentIndex, bookView, spans]);

  const onDown = (e) => {
    zone.current = { id: e.pointerId, y: e.clientY, drag: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };
  const onMove = (e) => {
    const z = zone.current;
    if (!z || z.id !== e.pointerId) return;
    const dy = e.clientY - z.y;
    if (!z.drag && Math.abs(dy) > 8) { z.drag = true; onTraverse && onTraverse("start", 0); }
    if (z.drag) onTraverse && onTraverse("move", dy);
  };
  const onUp = (e) => {
    const z = zone.current;
    zone.current = null;
    if (!z || z.id !== e.pointerId) return;
    if (z.drag) { onTraverse && onTraverse("end", e.clientY - z.y); return; }
    const hits = document.elementsFromPoint(e.clientX, e.clientY);
    if (hits.some((h) => h.closest && h.closest(".bv-word-display"))) { onFocusTap && onFocusTap(); return; }
    const w = hits.find((h) => h.dataset && h.dataset.i != null);
    if (w) onWordTap && onWordTap(Number(w.dataset.i));
    else onFocusTap && onFocusTap();
  };
  const onCancel = () => {
    if (zone.current?.drag) onTraverse && onTraverse("end", 0);
    zone.current = null;
  };

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
          {bgStart === chapterStart && chapterTitle && <div className="bv-chapter-title">{chapterTitle}</div>}
          {spans}
        </div>
      </div>
      <div className="flex-spacer" />
      {!overlayHidden && (
        <div className="bv-center">
          <FocusWord display={display} orpIdx={orpIdx} sideOpacity={sideOpacity} fit={fit} guide="bv" />
        </div>
      )}
      <div className="flex-spacer" />
      <div
        className="bv-text-zone" data-no-gesture
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
      />
    </div>
  );
});

export default BookStage;
