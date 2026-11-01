// Service worker: de app werkt offline. Stale-while-revalidate voor bestanden van deze site.
const V = 'reisapp-v1';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/store.js', 'js/data.js', 'js/ui.js', 'js/map.js', 'js/sheets.js', 'js/trips.js', 'js/sync.js', 'js/seed.js', 'js/firebase-config.js',
  'js/views/kaart.js', 'js/views/paspoort.js', 'js/views/reizen.js', 'js/views/reis.js', 'js/views/instellingen.js',
  'data/map.json', 'data/countries.json', 'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(V).then(async cache => {
    const hit = await cache.match(r);
    const net = fetch(r).then(res => { if (res.ok) cache.put(r, res.clone()); return res; }).catch(() => hit || (r.mode === 'navigate' ? cache.match('index.html') : undefined));
    return hit || net;
  }));
});
