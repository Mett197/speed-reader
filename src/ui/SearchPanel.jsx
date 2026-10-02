import { useEffect, useState } from "react";
import { searchWords } from "./search.js";

export const DEBOUNCE_MS = 250;

// libraryIds: Set of ids/titles already in library, used to mark results as 'in library'.
// item shape from onFindBook: { id, title, author, inLibrary? }
// requests: [{ id, title, author, status }] from the app; onLoadRequests refreshes them.
export default function SearchPanel({ words = [], onJump, onFindBook, onRequestBook, libraryIds = new Set(), requests = [], onLoadRequests }) {
  const [mode, setMode] = useState("book");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [requested, setRequested] = useState({});
  const [reqErr, setReqErr] = useState({});

  useEffect(() => { if (mode === "find" && onLoadRequests) onLoadRequests(); }, [mode]); // eslint-disable-line

  useEffect(() => {
    setErr("");
    if (!q.trim()) { setResults([]); setBusy(false); return undefined; }
    let dead = false;
    const t = setTimeout(async () => {
      if (mode === "book") { setResults(searchWords(words, q, { max: 200, context: 4 })); return; }
      if (!onFindBook) return;
      setBusy(true);
      try {
        const r = await onFindBook(q.trim());
        if (!dead) setResults(r || []);
      } catch (e) { if (!dead) { setErr("Search failed. Try again."); setResults([]); } }
      if (!dead) setBusy(false);
    }, mode === "book" ? DEBOUNCE_MS : 500);
    return () => { dead = true; clearTimeout(t); };
  }, [q, mode, words, onFindBook]);

  const request = async (item) => {
    setRequested((r) => ({ ...r, [item.id]: "pending" }));
    try { await onRequestBook(item); setRequested((r) => ({ ...r, [item.id]: "done" })); }
    catch (e) { setRequested((r) => ({ ...r, [item.id]: "error" })); setReqErr((r) => ({ ...r, [item.id]: e.message })); }
  };

  return (
    <div className="panel">
      <div className="seg" role="tablist">
        <button className={mode === "book" ? "on" : ""} onClick={() => { setMode("book"); setResults([]); }}>In this book</button>
        <button className={mode === "find" ? "on" : ""} onClick={() => { setMode("find"); setResults([]); }}>Find a book</button>
      </div>
      <input
        className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={mode === "book" ? "Search the text" : "Title or author"} aria-label="Search"
      />
      {busy && <p className="empty">Searching...</p>}
      {err && <p className="empty">{err}</p>}
      {mode === "book" ? (
        <ul className="list">
          {results.map((r) => (
            <li key={r.index} className="row">
              <button className="row-main" onClick={() => onJump && onJump(r.index)}>
                <span className="row-title">{r.snippet}</span>
                <span className="row-sub">word {r.index + 1}</span>
              </button>
            </li>
          ))}
          {q.trim() && !results.length && <li className="empty">No matches.</li>}
        </ul>
      ) : (
        <ul className="list">
          {results.map((it) => {
            const have = it.inLibrary || libraryIds.has(it.id) || libraryIds.has(it.title);
            const st = requested[it.id];
            return (
              <li key={it.id} className="row">
                <span className="row-main">
                  <span className="row-title">{it.title}</span>
                  <span className="row-sub">{st === "error" ? reqErr[it.id] : it.author}</span>
                </span>
                {have ? <span className="row-sub">in library</span> : (
                  <button className="row-act" disabled={st === "pending" || st === "done"} onClick={() => request(it)}>
                    {st === "pending" ? "Asking..." : st === "done" ? "Requested" : st === "error" ? "Retry" : "Get it"}
                  </button>
                )}
              </li>
            );
          })}
          {!q.trim() && (
            <li className="sec">
              <h3 className="sec-h">Your requests</h3>
              {!requests.length && <p className="empty">Nothing requested yet. Search a title and tap Get it.</p>}
              <ul className="list">
                {requests.map((r) => (
                  <li key={r.id} className="row">
                    <span className="row-main">
                      <span className="row-title">{r.title}</span>
                      <span className="row-sub">{r.author}</span>
                    </span>
                    <span className={"badge req-" + r.status.toLowerCase().replace(/\s+/g, "-")}>{r.status}</span>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
