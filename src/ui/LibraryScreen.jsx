import { useMemo, useRef, useState } from "react";
import { X, Plus, Pencil, Trash2, HardDriveDownload, Search } from "lucide-react";

// Full-screen library: "Continue reading" row and an all-books cover grid.
// Long-press a book for a bottom sheet with rename / delete offline copy / remove.

const prog = (b) => (b.totalWords ? Math.min(1, Math.max(0, (b.wordIndex || 0) / b.totalWords)) : 0);

function hue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function Cover({ book }) {
  const [broken, setBroken] = useState(false);
  if (book.cover && !broken) {
    return <img className="lib-cover-img" src={book.cover} alt="" loading="lazy" onError={() => setBroken(true)} draggable="false" />;
  }
  const h = hue(book.title || "?");
  return (
    <div className="lib-cover-gen" style={{ background: `linear-gradient(160deg, hsl(${h} 35% 24%), hsl(${(h + 40) % 360} 30% 12%))` }}>
      <span className="lib-cover-gen-title">{book.title}</span>
      {book.author && <span className="lib-cover-gen-author">{book.author}</span>}
    </div>
  );
}

function useLongPress(onLong, onClick) {
  const st = useRef({ t: null, fired: false, x: 0, y: 0 });
  return {
    onPointerDown: (e) => {
      st.current = { fired: false, x: e.clientX, y: e.clientY, t: setTimeout(() => { st.current.fired = true; onLong(); }, 450) };
    },
    onPointerMove: (e) => {
      if (Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 10) clearTimeout(st.current.t);
    },
    onPointerUp: () => clearTimeout(st.current.t),
    onPointerLeave: () => clearTimeout(st.current.t),
    onPointerCancel: () => clearTimeout(st.current.t),
    onContextMenu: (e) => e.preventDefault(),
    onClick: () => { if (st.current.fired) { st.current.fired = false; return; } onClick(); },
  };
}

function BookCard({ book, current, onOpen, onMenu, wide }) {
  const press = useLongPress(() => onMenu(book), () => onOpen(book));
  const pct = Math.round(prog(book) * 100);
  return (
    <button className={"lib-card" + (wide ? " wide" : "") + (current ? " cur" : "")} {...press}>
      <div className="lib-cover">
        <Cover book={book} />
        {book.offline && <span className="lib-dot" title="Available offline" />}
      </div>
      {pct > 0 && <div className="lib-bar"><span style={{ width: `${pct}%` }} /></div>}
      <div className="lib-title">{book.title}</div>
      <div className="lib-sub">{book.author || (pct ? `${pct}%` : "")}</div>
    </button>
  );
}

export default function LibraryScreen({ open, books = [], currentId, onOpen, onClose, onImport, onRename, onDelete, onForget }) {
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState(null);
  const [name, setName] = useState("");
  const fileRef = useRef(null);

  const f = filter.trim().toLowerCase();
  const shown = useMemo(() => books
    .filter((b) => !f || `${b.title} ${b.author || ""}`.toLowerCase().includes(f))
    .sort((a, b) => (a.title || "").localeCompare(b.title || "")), [books, f]);
  const continuing = useMemo(() => books
    .filter((b) => prog(b) > 0 && prog(b) < 0.99)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10), [books]);

  if (!open) return null;
  const openMenu = (b) => { setName(b.title || ""); setMenu(b); };

  return (
    <div className="lib-screen" role="dialog" aria-label="Library">
      <header className="lib-head">
        <h2 className="lib-h">Library</h2>
        <div className="lib-head-actions">
          <button className="lib-icon" onClick={() => fileRef.current?.click()} aria-label="Add a book"><Plus size={22} /></button>
          <button className="lib-icon" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </div>
        <input ref={fileRef} type="file" accept=".epub,.txt" hidden onChange={(e) => { const file = e.target.files[0]; e.target.value = ""; if (file) onImport(file); }} />
      </header>

      <div className="lib-scroll">
        {books.length > 6 && (
          <label className="lib-filter">
            <Search size={16} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter books" aria-label="Filter books" />
          </label>
        )}

        {!f && continuing.length > 0 && (
          <section>
            <h3 className="lib-sec">Continue reading</h3>
            <div className="lib-row">
              {continuing.map((b) => <BookCard key={"c" + b.id} book={b} current={b.id === currentId} onOpen={onOpen} onMenu={openMenu} wide />)}
            </div>
          </section>
        )}

        <section>
          <h3 className="lib-sec">{f ? `${shown.length} found` : "All books"}</h3>
          {books.length === 0 ? (
            <p className="lib-empty">No books yet. Tap + to add an EPUB, or find one in Search.</p>
          ) : (
            <div className="lib-grid">
              {shown.map((b) => <BookCard key={b.id} book={b} current={b.id === currentId} onOpen={onOpen} onMenu={openMenu} />)}
            </div>
          )}
        </section>
        <p className="lib-hint">Long-press a book to rename or remove it.</p>
      </div>

      {menu && (
        <div className="sheet-scrim" onClick={() => setMenu(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Options for ${menu.title}`}>
            <div className="sheet-grab" />
            <div className="sheet-book">
              <div className="sheet-cover"><Cover book={menu} /></div>
              <div>
                <div className="lib-title">{menu.title}</div>
                <div className="lib-sub">{menu.author}</div>
              </div>
            </div>
            <form className="sheet-rename" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== menu.title) onRename(menu, name.trim()); setMenu(null); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Title" />
              <button type="submit" className="sheet-btn sheet-primary" aria-label="Rename"><Pencil size={18} /></button>
            </form>
            {menu.offline && (
              <button className="sheet-btn" onClick={() => { onForget(menu); setMenu(null); }}>
                <HardDriveDownload size={18} /> Delete offline copy
              </button>
            )}
            <button className="sheet-btn sheet-danger" onClick={() => { onDelete(menu); setMenu(null); }}>
              <Trash2 size={18} /> Remove from library
            </button>
            <button className="sheet-btn sheet-cancel" onClick={() => setMenu(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
