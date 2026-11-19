// Service worker: lets the installed app run offline.
// Bump VERSION whenever you release a change so players pick it up.
const VERSION = 'xeno-siege-v1';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './fonts/orbitron-latin-500-normal.woff2',
  './fonts/orbitron-latin-700-normal.woff2',
  './fonts/orbitron-latin-900-normal.woff2',
  './fonts/rajdhani-latin-500-normal.woff2',
  './fonts/rajdhani-latin-600-normal.woff2',
  './fonts/rajdhani-latin-700-normal.woff2',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates show up when online), cached copy when offline.
self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET' || new URL(ev.request.url).origin !== location.origin) return;
  ev.respondWith(
    fetch(ev.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(ev.request, copy));
        return res;
      })
      .catch(() => caches.match(ev.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
