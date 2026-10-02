// bookmarks: Bookmark[]; words: string[] (for snippets)
export default function BookmarksPanel({ bookmarks = [], words = [], onJump, onRemove }) {
  const list = bookmarks.filter((b) => !b.deleted).sort((a, b) => a.wordIndex - b.wordIndex);
  if (!list.length) return <div className="panel"><p className="empty">Long-press a word in the text to add a bookmark.</p></div>;
  return (
    <div className="panel">
      <ul className="list">
        {list.map((b) => (
          <li key={b.id} className="row">
            <button className="row-main" onClick={() => onJump && onJump(b.wordIndex)}>
              <span className="row-title">{words.slice(b.wordIndex, b.wordIndex + 8).join(" ")}</span>
              <span className="row-sub">{b.note ? b.note + " - " : ""}word {b.wordIndex + 1}</span>
            </button>
            {onRemove && <button className="row-act" onClick={() => onRemove(b)} aria-label="Remove bookmark">Remove</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
