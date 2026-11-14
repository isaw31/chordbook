/* sw.js — keeps ChordBook working with no internet.
   Change VERSION whenever you upload new files so phones get the update. */
const VERSION = 'chordbook-v2';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/home.css',
  './js/library.js', './js/local-store.js', './js/home.js', './js/player.js', './js/setlist.js', './js/import.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'chordbook-fonts').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: save a copy the first time, use it offline afterwards
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('chordbook-fonts').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); c.put(req, res.clone()); return res; }
      catch { return new Response('', { status: 504 }); }
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // App files: use the saved copy (works offline), refresh it in the background when online
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await fresh) || (req.mode === 'navigate' ? c.match('./index.html') : new Response('', { status: 504 }));
  }));
});
