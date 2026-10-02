import { Book, Upload } from "lucide-react";

const prog = (b) => (b.totalWords ? Math.min(1, Math.max(0, b.wordIndex / b.totalWords)) : 0);

// books: BookMeta[]; currentId: string. Optional per book: cover (url), offline (bool), updatedAt.
export default function LibraryPanel({ books = [], currentId, onOpen, onDelete, onImport }) {
  const continuing = books
    .filter((b) => prog(b) > 0 && prog(b) < 0.99)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const all = [...books].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const row = (b, key) => {
    const pct = Math.round(prog(b) * 100);
    return (
      <li key={key} className={"row book" + (b.id === currentId ? " cur" : "")}>
        <button className="row-main book-main" onClick={() => onOpen && onOpen(b)}>
          <span className="book-thumb">
            {b.cover ? <img src={b.cover} alt="" loading="lazy" /> : <Book size={22} aria-hidden="true" />}
          </span>
          <span className="book-text">
            <span className="row-title">{b.title}</span>
            <span className="row-sub">
              {b.author ? b.author + " - " : ""}{pct}%
              {b.offline && <span className="badge">offline</span>}
            </span>
            <span className="bar"><span style={{ width: pct + "%" }} /></span>
          </span>
        </button>
        {onDelete && <button className="row-act" onClick={() => onDelete(b)} aria-label={"Remove " + b.title}>Remove</button>}
      </li>
    );
  };
  return (
    <div className="panel">
      {onImport && (
        <label className="btn btn-primary">
          <Upload size={18} aria-hidden="true" /> Add a book
          <input type="file" accept=".epub,.txt" hidden onChange={(e) => e.target.files[0] && onImport(e.target.files[0])} />
        </label>
      )}
      {!books.length && <p className="empty">No books yet.</p>}
      {continuing.length > 0 && (
        <section className="sec">
          <h3 className="sec-h">Continue reading</h3>
          <ul className="list">{continuing.map((b) => row(b, "c" + b.id))}</ul>
        </section>
      )}
      {all.length > 0 && (
        <section className="sec">
          <h3 className="sec-h">All books</h3>
          <ul className="list">{all.map((b) => row(b, "a" + b.id))}</ul>
        </section>
      )}
    </div>
  );
}
