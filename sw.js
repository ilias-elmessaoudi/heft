// Hält die App offline bereit. Erst Netz (neueste Version), ohne Netz aus dem Speicher.
const CACHE = 'heft-v3';
const HUELLE = ['./', 'index.html', 'style.css', 'app.js', 'editor.js', 'zeichnen.js', 'db.js', 'zustand.js', 'icons.js', 'werkzeugleiste.js',
  'text.js', 'schriften.js', 'zoomfenster.js', 'elemente.js', 'bild-werkzeug.js', 'pdf-werkzeug.js', 'abgleich.js', 'config.js', 'manifest.webmanifest',
  'icons/icon.svg', 'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs', 'vendor/pdf-lib.min.js', 'vendor/supabase.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' }).then((r) => {
      const kopie = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, kopie));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
