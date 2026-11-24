// Service Worker for TSH Transport PWA (Network-First)
const CACHE_NAME = 'tsh-transport-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './tsh-mascot.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // ข้าม POST request และ API ภายนอก (เช่น Google Apps Script)
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        const cloned = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cloned));
        return networkRes;
      })
      .catch(() => caches.match(e.request))
  );
});
