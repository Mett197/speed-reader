// Replication between the local store and CouchDB via same-origin /api/sync/ (nginx adds auth).
import { listDocs, putDoc, saveProgress } from "./store.js";

const BASE = "/api/sync";
const revs = new Map(); // _id -> last known _rev
const synced = new Map(); // _id -> updatedAt last agreed with the server

export function _resetCouch() {
  revs.clear();
  synced.clear();
}

// true when remote should replace local: newer wins; on a tie the tombstone wins
function remoteWins(remote, local) {
  const r = remote.updatedAt || 0;
  const l = local.updatedAt || 0;
  if (r !== l) return r > l;
  return !!remote.deleted && !local.deleted;
}

function strip(doc) {
  const { _rev, ...rest } = doc;
  return rest;
}

export async function syncNow() {
  const result = { pushed: 0, pulled: 0, online: false };
  try {
    const res = await fetch(`${BASE}/_all_docs?include_docs=true`);
    if (!res.ok) return result;
    const body = await res.json();
    const local = new Map((await listDocs()).map((d) => [d._id, d]));
    const remoteIds = new Set();
    for (const row of body.rows || []) {
      const doc = row.doc;
      if (!doc || String(doc._id).startsWith("_")) continue;
      remoteIds.add(doc._id);
      revs.set(doc._id, doc._rev);
      const mine = local.get(doc._id);
      if (!mine || remoteWins(doc, mine)) {
        if (await putDoc(doc)) {
          result.pulled++;
          synced.set(doc._id, doc.updatedAt || 0);
          local.set(doc._id, strip(doc));
        }
      } else if (!remoteWins(mine, doc) && (mine.updatedAt || 0) === (doc.updatedAt || 0)) {
        synced.set(doc._id, mine.updatedAt || 0);
      }
    }

    const dirty = [...local.values()].filter((d) => synced.get(d._id) !== (d.updatedAt || 0));
    if (dirty.length) {
      const push = await fetch(`${BASE}/_bulk_docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: dirty.map((d) => (revs.has(d._id) ? { ...d, _rev: revs.get(d._id) } : d)) }),
      });
      if (!push.ok) return result;
      const results = await push.json();
      for (const r of Array.isArray(results) ? results : []) {
        const mine = local.get(r.id);
        if (r.ok) {
          revs.set(r.id, r.rev);
          synced.set(r.id, mine.updatedAt || 0);
          result.pushed++;
        } else if (r.error === "conflict" && mine) {
          const out = await resolveConflict(mine);
          result.pushed += out.pushed;
          result.pulled += out.pulled;
        }
      }
    }
    result.online = true;
    return result;
  } catch {
    return { pushed: 0, pulled: 0, online: false };
  }
}

async function resolveConflict(mine) {
  const out = { pushed: 0, pulled: 0 };
  const res = await fetch(`${BASE}/${encodeURIComponent(mine._id)}`);
  if (!res.ok) return out;
  const remote = await res.json();
  revs.set(remote._id, remote._rev);
  if (remoteWins(remote, mine)) {
    if (await putDoc(remote)) {
      synced.set(remote._id, remote.updatedAt || 0);
      out.pulled++;
    }
    return out;
  }
  const push = await fetch(`${BASE}/_bulk_docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docs: [{ ...mine, _rev: remote._rev }] }),
  });
  if (!push.ok) return out;
  const [r] = await push.json();
  if (r && r.ok) {
    revs.set(r.id, r.rev);
    synced.set(r.id, mine.updatedAt || 0);
    out.pushed++;
  }
  return out;
}

export function startAutoSync(intervalMs = 30000) {
  const run = () => {
    syncNow();
  };
  run();
  const timer = setInterval(run, intervalMs);
  const onVisible = () => {
    if (typeof document === "undefined" || document.visibilityState !== "hidden") run();
  };
  if (typeof window !== "undefined") window.addEventListener("online", run);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    if (typeof window !== "undefined") window.removeEventListener("online", run);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };
}

// Progress is written often while reading; coalesce to one write per book, 2 s after the last call.
const timers = new Map();
export function debouncedSaveProgress(bookId, wordIndex, delayMs = 2000) {
  clearTimeout(timers.get(bookId));
  timers.set(
    bookId,
    setTimeout(() => {
      timers.delete(bookId);
      saveProgress(bookId, wordIndex);
    }, delayMs),
  );
}
