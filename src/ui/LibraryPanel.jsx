// books: BookMeta[]; currentId: string
export default function LibraryPanel({ books = [], currentId, onOpen, onDelete, onImport }) {
  return (
    <div className="panel">
      {onImport && (
        <label className="btn">
          Import EPUB or TXT
          <input type="file" accept=".epub,.txt" hidden onChange={(e) => e.target.files[0] && onImport(e.target.files[0])} />
        </label>
      )}
      {!books.length && <p className="empty">No books yet.</p>}
      <ul className="list">
        {books.map((b) => {
          const pct = b.totalWords ? Math.round((b.wordIndex / b.totalWords) * 100) : 0;
          return (
            <li key={b.id} className={"row" + (b.id === currentId ? " cur" : "")}>
              <button className="row-main" onClick={() => onOpen && onOpen(b)}>
                <span className="row-title">{b.title}</span>
                <span className="row-sub">{b.author ? b.author + " - " : ""}{pct}%</span>
                <span className="bar"><span style={{ width: pct + "%" }} /></span>
              </button>
              {onDelete && <button className="row-act" onClick={() => onDelete(b)} aria-label={"Remove " + b.title}>Remove</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
