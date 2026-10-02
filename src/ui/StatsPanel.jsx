// stats: { totalWords, totalMs, avgWpm, days: { 'YYYY-MM-DD': words } }
export default function StatsPanel({ stats }) {
  if (!stats) return <div className="panel"><p className="empty">No reading stats yet.</p></div>;
  const hours = (stats.totalMs || 0) / 3600000;
  const days = Object.entries(stats.days || {}).sort().slice(-14);
  const max = Math.max(1, ...days.map(([, v]) => (typeof v === "number" ? v : v.words || 0)));
  return (
    <div className="panel">
      <dl className="stats">
        <div><dt>Words read</dt><dd>{(stats.totalWords || 0).toLocaleString()}</dd></div>
        <div><dt>Time reading</dt><dd>{hours.toFixed(1)} h</dd></div>
        <div><dt>Average speed</dt><dd>{Math.round(stats.avgWpm || 0)} wpm</dd></div>
      </dl>
      <div className="spark" aria-label="Words per day, last 14 days">
        {days.map(([d, v]) => {
          const n = typeof v === "number" ? v : v.words || 0;
          return <span key={d} title={d + ": " + n} style={{ height: Math.max(4, (n / max) * 100) + "%" }} />;
        })}
      </div>
    </div>
  );
}
