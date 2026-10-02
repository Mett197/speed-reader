// Device -> server library. nginx maps PUT /api/upload/<path> into the shared ebooks root
// (LazyLibrarian layout <Author>/<Title>/) and answers 409 instead of overwriting.
import { kavitaScanLibraries } from "./kavita.js";

export function safeName(s, fallback) {
  const v = String(s || "").replace(/[\/\\:*?"<>|\u0000-\u001f]/g, " ").replace(/^\.+/, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return v || fallback;
}

export function uploadPath(title, author) {
  const t = safeName(title, "Untitled");
  const a = safeName(author, "Unknown");
  return `/api/upload/${encodeURIComponent(a)}/${encodeURIComponent(t)}/${encodeURIComponent(t)}.epub`;
}

// Returns "uploaded" | "exists". Throws on any other failure.
export async function uploadBook(blob, { title, author }, fetchFn = fetch) {
  const res = await fetchFn(uploadPath(title, author), {
    method: "PUT",
    headers: { "Content-Type": "application/epub+zip" },
    body: blob,
  });
  if (res.status === 409) return "exists";
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  kavitaScanLibraries().catch(() => {});
  return "uploaded";
}
