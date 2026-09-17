const OFFLINE_CACHE = "liyong-admin-offline-v1";
const OFFLINE_URL = new URL("./offline.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("liyong-admin-offline-") && key !== OFFLINE_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
