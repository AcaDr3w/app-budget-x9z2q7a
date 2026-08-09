// Service Worker - Dashboard Bilancio Personale PWA
const CACHE_NAME = 'bilancio-pwa-v1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Installazione: pre-carica le risorse locali
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.warn('[SW] Pre-cache parziale:', err);
      });
    })
  );
  self.skipWaiting();
});

// Attivazione: rimuove le vecchie cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Network First con fallback sulla cache
self.addEventListener('fetch', event => {
  // Non intercettare richieste a Google APIs, CDN esterni, ecc.
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clona e salva in cache se è una risposta valida
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline: servi dalla cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback HTML per navigazione offline
          return caches.match('./index.html');
        });
      })
  );
});
