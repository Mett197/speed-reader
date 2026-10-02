// Retired: an earlier v2 build registered this worker. This version removes itself
// and its caches so the home-screen app behaves exactly like the original.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
  })());
});
