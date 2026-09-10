/**
 * service-worker.js
 * -------------------------------------------------------
 * Met en cache uniquement les fichiers de l'application (l'"app shell").
 * IMPORTANT : ne met JAMAIS en cache les réponses de l'API (données
 * élèves/défis) — elles doivent toujours venir du réseau, sinon un
 * téléphone verrait des données périmées.
 */

const CACHE_NAME = 'nexi-one-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './superviseur.html',
  './eleve.html',
  './css/style.css',
  './js/config.js',
  './js/sync.js',
  './js/auth.js',
  './js/admin.js',
  './js/superviseur.js',
  './js/eleve.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const url = event.request.url;

  // Ne jamais mettre en cache les appels à l'API (données live du Sheet).
  if (url.indexOf('/api/execute-script') !== -1) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
