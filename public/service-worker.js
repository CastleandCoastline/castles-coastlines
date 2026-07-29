/* Castle & Coastline Service Worker */
const CACHE_NAME = 'cc-tours-v2';

const STATIC_ASSETS = [
  '/logo-app.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('open-meteo.com')) return;
  if (url.hostname.includes('openstreetmap.org')) return;
  if (url.hostname.includes('overpass-api.de')) return;
  if (url.hostname.includes('overpass.kumi.systems')) return;
  if (url.hostname.includes('exchangerate-api.com')) return;
  if (url.hostname.includes('frankfurter.app')) return;
  if (url.hostname.includes('googleapis.com')) return;
  // Never intercept the marketing page or root — let the server/rewrite handle them
  if (url.pathname === '/' || url.pathname === '/marketing.html') return;

  // Navigation (HTML shell): ALWAYS network-first, never serve stale shell unless truly offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Everything else: network-first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
