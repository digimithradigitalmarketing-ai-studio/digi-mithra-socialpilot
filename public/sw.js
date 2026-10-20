// Minimal offline support: cache the app shell assets, always go to network for data.
const CACHE = "sp-shell-v1";
const ASSETS = ["/brand-logo.webp", "/mark.png", "/icons/icon-192.png", "/offline.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (ASSETS.includes(new URL(req.url).pathname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});
