// Offline shell: hashed assets cache-first, pages network-first with cached fallback.
// /api/* is never cached here (books are cached in IndexedDB by the app).
const CACHE = "speedreader-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, res.clone()));
        return res;
      })
      .catch(async () => (await caches.match(req.mode === "navigate" ? "/" : req)) || Response.error()),
  );
});
