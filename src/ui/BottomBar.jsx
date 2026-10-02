import { SkipBack, SkipForward, Play, Pause } from "lucide-react";

export default function BottomBar({
  playing, onPlayPause, onPrevSentence, onNextSentence,
  wpm, progress = 0, onSeek, timeLeftLabel,
}) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 10;
  return (
    <div className="bottom-bar">
      <input
        className="bb-scrub" type="range" min="0" max="1000" step="1"
        aria-label="Progress" value={Math.round(progress * 1000)}
        style={{ "--pct": pct + "%" }}
        onChange={(e) => onSeek && onSeek(Number(e.target.value) / 1000)}
      />
      <div className="bb-row">
        <span className="bb-time">{timeLeftLabel}</span>
        <button className="bb-btn" onClick={onPrevSentence} aria-label="Previous sentence"><SkipBack size={22} /></button>
        <button className="bb-btn bb-play" onClick={onPlayPause} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={30} /> : <Play size={30} />}
        </button>
        <button className="bb-btn" onClick={onNextSentence} aria-label="Next sentence"><SkipForward size={22} /></button>
        <span className="bb-wpm">{wpm}<small> wpm</small></span>
      </div>
    </div>
  );
}
