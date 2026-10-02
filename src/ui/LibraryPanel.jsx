import { useRef, useState } from "react";
import { Book, Upload, Pencil, Trash2, HardDriveDownload, X } from "lucide-react";

const prog = (b) => (b.totalWords ? Math.min(1, Math.max(0, b.wordIndex / b.totalWords)) : 0);

// books: BookMeta[]; currentId: string. Optional per book: cover (url), offline (bool), updatedAt.
// Long-press a book for rename / remove / delete offline copy.
export default function LibraryPanel({ books = [], currentId, onOpen, onDelete, onRename, onForget, onImport }) {
  const [menu, setMenu] = useState(null);
  const [name, setName] = useState("");
  const press = useRef({ t: null, fired: false, x: 0, y: 0 });
  const startPress = (b, e) => {
    press.current = { fired: false, x: e.clientX, y: e.clientY, t: setTimeout(() => {
      press.current.fired = true;
      setName(b.title || "");
      setMenu(b);
    }, 500) };
  };
  const endPress = () => clearTimeout(press.current.t);
  const movePress = (e) => {
    if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) endPress();
  };
  const continuing = books
    .filter((b) => prog(b) > 0 && prog(b) < 0.99)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const all = [...books].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const row = (b, key) => {
    const pct = Math.round(prog(b) * 100);
    return (
      <li key={key} className={"row book" + (b.id === currentId ? " cur" : "")}>
        <button
          className="row-main book-main"
          onPointerDown={(e) => startPress(b, e)} onPointerUp={endPress} onPointerLeave={endPress} onPointerMove={movePress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => { if (press.current.fired) { press.current.fired = false; return; } onOpen && onOpen(b); }}
        >
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
      {books.length > 0 && <p className="hint-small">Long-press a book to rename or remove it.</p>}
      {menu && (
        <div className="book-menu" role="dialog" aria-label={"Options for " + menu.title}>
          <div className="book-menu-head">
            <span className="row-title">{menu.title}</span>
            <button className="icon-only" onClick={() => setMenu(null)} aria-label="Close"><X size={18} /></button>
          </div>
          {onRename && (
            <form className="book-menu-rename" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onRename(menu, name.trim()); setMenu(null); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="New title" />
              <button type="submit" className="btn"><Pencil size={16} /> Rename</button>
            </form>
          )}
          {onForget && menu.offline && (
            <button className="btn" onClick={() => { onForget(menu); setMenu(null); }}><HardDriveDownload size={16} /> Delete offline copy</button>
          )}
          {onDelete && (
            <button className="btn btn-danger" onClick={() => { if (window.confirm(`Remove "${menu.title}" from your library on all devices?`)) onDelete(menu); setMenu(null); }}>
              <Trash2 size={16} /> Remove from library
            </button>
          )}
        </div>
      )}
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
