const CACHE_VERSION = 'v1.0';
const CACHE_NAME = `workout-tracker-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

/* Install: cache static assets */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        console.log('Some assets could not be cached during install');
      });
    })
  );
  self.skipWaiting();
});

/* Activate: clean up old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/* Fetch: cache-first for static assets, network-first for API */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Skip cross-origin and non-GET requests */
  if (url.origin !== location.origin || event.request.method !== 'GET') {
    return;
  }

  /* Static assets: cache-first */
  if (url.pathname.match(/\.(js|css|png|svg|woff|woff2)$/)) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(response => {
          if (response.status === 200) {
            const cacheCopy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, cacheCopy);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  /* API calls: network-first, fallback to offline page */
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.status === 200) {
          const cacheCopy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, cacheCopy);
          });
        }
        return response;
      })
      .catch(() => {
        /* Return cached version if available */
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          /* Offline fallback */
          return new Response(
            JSON.stringify({ error: 'offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
      })
  );
});
