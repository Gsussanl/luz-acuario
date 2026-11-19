// Guarda la app para que abra sin internet (el Bluetooth no necesita internet).
// Red primero: si hay conexión se usa la versión nueva; si no, la guardada.
const CACHE = 'luz-acuario-v25';
const ARCHIVOS = ['./', 'index.html', 'js/app.js', 'js/ble.js', 'js/protocolo.js', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png', '../datos/mezclas.json', 'js/acuario.js', '../datos/recomendar.js', '../datos/plantas.json', '../datos/habitantes.json', 'js/diseno.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok && new URL(e.request.url).origin === location.origin) {
      const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia));
    }
    return r;
  }).catch(() => caches.match(e.request)));
});
