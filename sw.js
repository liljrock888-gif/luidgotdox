/* LuidgotDOx service worker: makes the app installable and usable offline.
   Bump VERSION whenever site files change so people get the update. */
const VERSION = 'ldx-v8';
const SHELL = [
  './', './index.html', './style.css', './app.js', './art.js', './essay.js', './help.js', './pwa.js', './tips.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/.test(url.hostname);
  if (!sameOrigin && !cdn) return;

  // Network first for the page itself (so updates show up), fall back to cache offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Stale-while-revalidate for everything else.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
