// Service Worker for Code Red Dev PWA
const CACHE_NAME = 'code-red-dev-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
});

// A simple pass-through fetch handler is required for PWA installability
self.addEventListener('fetch', (e) => {
  // Let the browser fetch directly
});
