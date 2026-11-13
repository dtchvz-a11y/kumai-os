// KUMAI OS · service worker: la app abre y funciona sin señal.
// Al publicar cambios, sube VERSION: el celular descarga todo de nuevo y avisa que hay versión nueva.
const VERSION = 'kumai-os-f4-1';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/kumai.css',
  'fonts/chango-latin-400-normal.woff2', 'fonts/quicksand-latin-500-normal.woff2', 'fonts/quicksand-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'datos/recetario-semilla.json',
  'js/app.js', 'js/util.js', 'js/modelo.js', 'js/almacen.js', 'js/base.js', 'js/sync.js', 'js/costeo.js',
  'js/recetario-md.js', 'js/semilla.js', 'js/plantillas.js', 'js/migraciones.js', 'js/motor.js', 'js/operacion.js', 'js/analisis.js', 'js/xlsx.js', 'js/simulador.js',
  'js/vistas/hoy.js', 'js/vistas/pedidos.js', 'js/vistas/recetario.js', 'js/vistas/ajustes.js', 'js/vistas/carga-inicial.js', 'js/vistas/produccion.js', 'js/vistas/inventario.js', 'js/vistas/ventas.js', 'js/vistas/dinero.js', 'js/vistas/mas.js', 'js/vistas/simulador.js',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', ev => { if (ev.data === 'actualizar') self.skipWaiting(); });

// Archivos propios: primero la copia guardada (abre al instante y sin señal) y se refresca por detrás.
// La sincronización (POST a Google) nunca pasa por aquí.
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(caches.open(VERSION).then(async cache => {
    const guardada = await cache.match(req, { ignoreSearch: true });
    const red = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return guardada || (await red) || new Response('Sin conexión', { status: 503 });
  }));
});
