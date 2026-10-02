import { useEffect, useMemo, useRef } from "react";

export const WINDOW = 600;

// Pure: window of word indices [start, end) around the current index.
export function windowRange(total, current, size = WINDOW) {
  const start = Math.max(0, Math.min(current - size / 2, total - size));
  return [Math.max(0, Math.floor(start)), Math.min(total, Math.max(0, Math.floor(start)) + size)];
}

export default function TextPane({
  words, currentIndex, onJump, onToggleBookmark,
  bookmarks = new Set(), paragraphBreaks = new Set(), playing = false,
}) {
  const paneRef = useRef(null);
  const curRef = useRef(null);
  const pressed = useRef(false);
  const timer = useRef(null);

  // Quantize the window so it does not re-render a new range on every word.
  const step = WINDOW / 4;
  const anchor = Math.round(currentIndex / step) * step;
  const [start, end] = useMemo(() => windowRange(words.length, anchor), [words.length, anchor]);

  const breaks = useMemo(
    () => (paragraphBreaks instanceof Set ? paragraphBreaks : new Set(paragraphBreaks)),
    [paragraphBreaks],
  );

  useEffect(() => {
    const pane = paneRef.current;
    const el = curRef.current;
    if (!pane || !el || !el.scrollIntoView) return;
    const pr = pane.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const lo = pr.top + pr.height * 0.2;
    const hi = pr.top + pr.height * 0.8;
    if (er.top < lo || er.bottom > hi) {
      el.scrollIntoView({ block: "center", behavior: playing ? "auto" : "smooth" });
    }
  }, [currentIndex, start, playing]);

  const down = (i) => {
    pressed.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pressed.current = true;
      onToggleBookmark && onToggleBookmark(i);
    }, 500);
  };
  const cancel = () => clearTimeout(timer.current);
  const click = (i) => {
    if (pressed.current) { pressed.current = false; return; }
    onJump && onJump(i);
  };

  const nodes = [];
  for (let i = start; i < end; i++) {
    if (i > start && breaks.has(i)) nodes.push(<br key={"b" + i} />, <br key={"c" + i} />);
    const cls = "tp-word" + (i === currentIndex ? " cur" : "") + (bookmarks.has(i) ? " bm" : "");
    nodes.push(
      <span
        key={i} data-i={i} className={cls} ref={i === currentIndex ? curRef : null}
        onPointerDown={() => down(i)} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
        onClick={() => click(i)} onContextMenu={(e) => e.preventDefault()}
      >{words[i]}</span>,
      " ",
    );
  }
  return (
    <div className="text-pane" ref={paneRef}>
      {nodes}
    </div>
  );
}
