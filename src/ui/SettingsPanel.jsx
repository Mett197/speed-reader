import { contrastRatio } from "../reader/themes.js";
import { THEMES } from "../reader/themes.js";
import { WPM_MIN, WPM_MAX, MIN_CONTRAST } from "../contracts.js";

// settings: Settings; onChange(partialSettings) -- the app merges and saves.
export default function SettingsPanel({ settings, onChange }) {
  if (!settings) return null;
  const set = (p) => onChange && onChange(p);
  const custom = settings.custom || { bg: "#ffffff", fg: "#000000", accent: "#c0271a" };
  const ratio = contrastRatio(custom.fg, custom.bg);
  const num = (k, v) => set({ [k]: Number(v) });
  return (
    <div className="panel settings">
      <section className="sec">
        <h3 className="sec-h">Reading</h3>
        <label className="set-row">Speed
          <span className="set-ctl">
            <input type="range" min={WPM_MIN} max={WPM_MAX} step="10" value={settings.wpm} onChange={(e) => num("wpm", e.target.value)} />
            <input className="num" type="number" min={WPM_MIN} max={WPM_MAX} value={settings.wpm}
              onChange={(e) => set({ wpm: Math.min(WPM_MAX, Math.max(WPM_MIN, Number(e.target.value) || WPM_MIN)) })} />
          </span>
        </label>
        <div className="set-row">Words at once
          <div className="seg">
            {[1, 2, 3].map((n) => (
              <button key={n} className={settings.chunkSize === n ? "on" : ""} onClick={() => set({ chunkSize: n })}>{n}</button>
            ))}
          </div>
        </div>
        <label className="set-row">Pause every N sentences (0 is off)
          <input className="num" type="number" min="0" max="50" value={settings.pauseEverySentences}
            onChange={(e) => set({ pauseEverySentences: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        </label>
      </section>

      <section className="sec">
        <h3 className="sec-h">Display</h3>
        <div className="set-row">Theme
          <div className="chips">
            {[...Object.keys(THEMES), "custom"].map((t) => {
              const c = t === "custom" ? custom : THEMES[t];
              return (
                <button key={t} className={"chip" + (settings.theme === t ? " on" : "")} onClick={() => set({ theme: t })} aria-pressed={settings.theme === t}>
                  <span className="swatch" style={{ background: c.bg, color: c.accent }}>Aa</span>
                  <span>{t}</span>
                </button>
              );
            })}
          </div>
        </div>
        <label className="set-row">Font size
          <input type="range" min="0.7" max="1.6" step="0.05" value={settings.fontScale} onChange={(e) => num("fontScale", e.target.value)} />
        </label>
        <label className="set-row set-inline">Auto night mode
          <input type="checkbox" checked={!!settings.autoNight} onChange={(e) => set({ autoNight: e.target.checked })} />
        </label>
      </section>

      {settings.theme === "custom" && (
        <section className="sec">
          <h3 className="sec-h">Custom colors</h3>
          <div className="set-row custom">
            <label>Background <input type="color" value={custom.bg} onChange={(e) => set({ custom: { ...custom, bg: e.target.value } })} /></label>
            <label>Text <input type="color" value={custom.fg} onChange={(e) => set({ custom: { ...custom, fg: e.target.value } })} /></label>
            <p className={"contrast" + (ratio < MIN_CONTRAST ? " warn" : "")}>
              Contrast {ratio.toFixed(1)}:1{ratio < MIN_CONTRAST ? " - low, aim for " + MIN_CONTRAST + " or more" : ""}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
