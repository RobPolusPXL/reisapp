// Service worker: de app werkt offline en toont updates meteen als er verbinding is.
// - Code (HTML, JS, CSS): netwerk eerst, met controle bij de server; offline uit de cache.
// - Grote data (kaart, landen, vlaggen, iconen): cache eerst, op de achtergrond bijwerken.
// - Het manifest gaat altijd rechtstreeks naar het netwerk.
const V = 'mustache-passport-v88';
const CORE = [
  './', 'index.html', 'css/app.css',
  'js/main.js', 'js/store.js', 'js/data.js', 'js/ui.js', 'js/map.js', 'js/globe.js', 'js/sheets.js','js/airports.js','data/airports.json','js/airlines.js','data/airlines.json','js/boardingpass.js','vendor/zxing/reader.js','vendor/zxing/share.js','vendor/zxing/zxing_reader.wasm', 'js/trips.js', 'js/sync.js', 'js/firebase-config.js',
  'js/views/kaart.js', 'js/views/paspoort.js', 'js/views/reizen.js', 'js/views/reis.js', 'js/views/statistieken.js', 'js/views/credits.js', 'js/views/achtbaanstatistieken.js', 'data/coasters.json', 'js/views/instellingen.js',
  'data/map.json', 'data/countries.json', 'assets/icons/icon-maskable-512.png', 'assets/logo.png', 'assets/logo-licht.png', 'assets/snor.webp', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' slaat de HTTP-cache van de browser over, zodat er echt nieuwe bestanden in komen
  // Tolerant: één bestand dat tijdelijk niet bereikbaar is (bv. direct na een deploy) mag de hele installatie niet laten mislukken
  e.waitUntil((async () => {
    const c = await caches.open(V);
    const res = await Promise.allSettled(CORE.map(u => c.add(new Request(u, { cache: 'reload' }))));
    res.forEach((r, i) => { if (r.status === 'rejected') console.warn('Precache mislukt:', CORE[i]); });
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isData = p => /\/(data|assets)\//.test(p);

self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('manifest.webmanifest')) return;

  if (isData(u.pathname)) {
    e.respondWith(caches.open(V).then(async cache => {
      const hit = await cache.match(r);
      const net = fetch(r).then(res => { if (res.ok) cache.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(V);
    try {
      const res = await fetch(r, { cache: 'no-cache' });
      if (res.ok) cache.put(r, res.clone());
      return res;
    } catch {
      return (await cache.match(r, { ignoreSearch: r.mode === 'navigate' })) || (r.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  })());
});
