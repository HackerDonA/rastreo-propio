/*
 * Service worker: lo que convierte la aplicacion en instalable.
 *
 * QUE CACHEA Y QUE NO
 * -------------------
 * Solo el "app shell": el HTML, el JavaScript, el CSS y los iconos. Es decir,
 * el programa.
 *
 * NUNCA cachea /api/* ni el WebSocket, y esto no es una omision sino el punto
 * central del diseno. Servir una respuesta guardada de /api/units significaria
 * pintar un camion en una calle donde ya no esta, sin ningun aviso de que el
 * dato es viejo. En una aplicacion de rastreo ese error es peor que no mostrar
 * nada: una posicion equivocada se ve exactamente igual que una correcta.
 *
 * Sin conexion, entonces, la aplicacion abre pero muestra su pantalla de error
 * de siempre. Es el comportamiento honesto.
 *
 * ESTRATEGIAS
 * -----------
 * - Navegacion (abrir la app): red primero, cache como respaldo. Asi un
 *   despliegue nuevo se ve de inmediato, y sin senal al menos abre.
 * - Recursos con hash en el nombre (/assets/index-a1b2c3.js): cache primero.
 *   El nombre cambia en cada build, asi que el contenido es inmutable y no
 *   hay riesgo de servir algo viejo.
 * - Todo lo demas: red, sin tocar el cache.
 */

// Subir la version invalida el cache anterior por completo. Hay que subirla
// cuando cambie la lista de PRECARGA o la logica de este archivo.
const VERSION = 'v1';
const CACHE = `rastreo-${VERSION}`;

/** Lo minimo para que la aplicacion arranque sin red. */
const PRECARGA = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icono-192.png',
  '/icono-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      // addAll es atomico: si un solo archivo falla, no se instala nada y el
      // service worker viejo sigue sirviendo. Preferible a quedar a medias.
      .then((cache) => cache.addAll(PRECARGA))
      // Sin esto, el service worker nuevo espera a que se cierren todas las
      // pestanas antes de activarse. En una app que se deja abierta todo el
      // dia, eso puede ser nunca.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Recursos del build de Vite: llevan un hash en el nombre, son inmutables. */
function esRecursoConHash(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Solo GET. Un POST o un DELETE jamas deben salir de un cache.
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  // Datos en vivo: que pasen de largo. Ver la nota de arriba.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  // Los mosaicos del mapa los cachea el navegador por sus propias cabeceras;
  // meterlos aqui llenaria el almacenamiento sin control.
  if (url.origin !== self.location.origin) return;

  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          void caches.open(CACHE).then((cache) => cache.put('/index.html', copia));
          return respuesta;
        })
        .catch(async () => {
          const guardada = await caches.match('/index.html');
          return (
            guardada ??
            new Response('Sin conexion', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }),
    );
    return;
  }

  if (esRecursoConHash(url) || PRECARGA.includes(url.pathname)) {
    evento.respondWith(
      caches.match(peticion).then(
        (guardada) =>
          guardada ??
          fetch(peticion).then((respuesta) => {
            // Solo se guardan las respuestas completas y correctas. Una 404 o
            // una respuesta parcial en el cache es peor que ningun cache.
            if (respuesta.ok && respuesta.status === 200) {
              const copia = respuesta.clone();
              void caches.open(CACHE).then((cache) => cache.put(peticion, copia));
            }
            return respuesta;
          }),
      ),
    );
  }
});
