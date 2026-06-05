const CACHE_NAME = 'my-pwa-cache-v1';
const urlsToCache = [
  '/',                  // Aapka main route
  '/index.html',        // Main HTML
  '/manifest.json',     // Manifest file
  '/icons/icon-192x192.png', // Icons ke sahi paths (jo manifest me hain)
  '/icons/icon-512x512.png'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch Cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});