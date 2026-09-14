const CACHE_NAME = 'upzites-crm-public-v1';
const OFFLINE_URL = '/sin-conexion';
const PUBLIC_ASSETS = [
  OFFLINE_URL,
  '/icons/upzites-180.png',
  '/icons/upzites-192.png',
  '/icons/upzites-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Las navegaciones siempre consultan la red. Nunca se guardan páginas
  // autenticadas, respuestas RSC, APIs, conversaciones, contactos ni tokens.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const isPublicStatic =
    url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
  if (!isPublicStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
