import LibraryPanel from "./LibraryPanel.jsx";
import ContentsPanel from "./ContentsPanel.jsx";
import SearchPanel from "./SearchPanel.jsx";
import BookmarksPanel from "./BookmarksPanel.jsx";
import StatsPanel from "./StatsPanel.jsx";
import SettingsPanel from "./SettingsPanel.jsx";

export const TABS = [
  ["library", "Library", LibraryPanel],
  ["contents", "Contents", ContentsPanel],
  ["search", "Search", SearchPanel],
  ["bookmarks", "Bookmarks", BookmarksPanel],
  ["stats", "Stats", StatsPanel],
  ["settings", "Settings", SettingsPanel],
];

// panels: { library: {...props}, contents: {...}, ... } passed through to each panel.
export default function Drawer({ open, onClose, tab = "library", onTab, panels = {} }) {
  const Active = (TABS.find((t) => t[0] === tab) || TABS[0])[2];
  return (
    <div className={"drawer-root" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Menu">
        <div className="drawer-head">
          <nav className="drawer-tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button
                key={id} role="tab" aria-selected={tab === id}
                className={"drawer-tab" + (tab === id ? " on" : "")}
                onClick={() => onTab && onTab(id)}
              >{label}</button>
            ))}
          </nav>
          <button className="drawer-close" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <div className="drawer-body">{open && <Active {...(panels[tab] || {})} />}</div>
      </aside>
    </div>
  );
}
