const config = self.OPENSLOT_PWA || {};
const cachePrefix = `${config.slug || "openslot"}-admin-offline-`;
const offlineCache = `${cachePrefix}v4`;
const offlineUrl = new URL("./offline", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(offlineCache).then((cache) => cache.add(offlineUrl)));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(cachePrefix) && key !== offlineCache).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(offlineUrl)));
});
self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("Neue Online-Buchung", {
    body: "Ein neuer Termin wurde gebucht.", icon: new URL("./icon-192.png", self.registration.scope).href,
    data: { url: self.registration.scope },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
    return existing ? existing.focus() : self.clients.openWindow(self.registration.scope);
  })());
});
