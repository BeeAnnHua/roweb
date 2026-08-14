// RO_WEB V0.9.88B3 - starter pack cache bridge.
const ROWEB_STARTER_CACHE = "roweb-starter-assets-0.9.88B3";
self.addEventListener("install", event => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  const request = event.request;
  if (!request || request.method !== "GET") return;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async()=>{
    try {
      const cache = await caches.open(ROWEB_STARTER_CACHE);
      const hit = await cache.match(request,{ignoreSearch:true});
      if (hit) return hit;
    } catch (_) {}
    return fetch(request);
  })());
});
