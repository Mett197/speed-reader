// Read-only access to the original app's library (IndexedDB "rsvp-reader", store "data"):
// key "library" = [{ id, title, author, currentIndex, totalWords }], texts at book-text-<id>,
// chapters at book-chapters-<id>. Never writes; does not create the database if missing.

function openOld() {
  return new Promise((resolve) => {
    const req = indexedDB.open("rsvp-reader");
    req.onupgradeneeded = () => req.transaction.abort(); // did not exist: leave it absent
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function get(db, key) {
  return new Promise((resolve) => {
    try {
      const req = db.transaction("data", "readonly").objectStore("data").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function readOldLibrary() {
  const db = await openOld();
  if (!db || !db.objectStoreNames.contains("data")) { db?.close(); return []; }
  const lib = (await get(db, "library")) || [];
  const out = [];
  for (const b of Array.isArray(lib) ? lib : []) {
    const text = await get(db, `book-text-${b.id}`);
    if (typeof text !== "string" || !text.trim()) continue;
    const chapters = (await get(db, `book-chapters-${b.id}`)) || [];
    out.push({ title: b.title, author: b.author || "", text, chapters, wordIndex: b.currentIndex || 0 });
  }
  db.close();
  return out;
}
