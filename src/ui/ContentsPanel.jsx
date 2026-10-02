// chapters: [{ title, wordIndex }]; currentIndex: number
export default function ContentsPanel({ chapters = [], currentIndex = 0, onJump }) {
  if (!chapters.length) return <div className="panel"><p className="empty">No chapters in this book.</p></div>;
  let active = 0;
  chapters.forEach((c, i) => { if (c.wordIndex <= currentIndex) active = i; });
  return (
    <div className="panel">
      <ul className="list">
        {chapters.map((c, i) => (
          <li key={i} className={"row" + (i === active ? " cur" : "")}>
            <button className="row-main" onClick={() => onJump && onJump(c.wordIndex)}>
              <span className="row-title">{c.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
