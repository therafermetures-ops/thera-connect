const CACHE_NAME = 'thera-connect-v4.1'; // Changez le nom pour forcer la mise à jour
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. IGNORER LES REQUÊTES API ET EXTERNES
  // Ne pas intercepter : les requêtes non-GET, les requêtes vers Supabase, et les requêtes HTTP (ESP32)
  if (
    event.request.method !== 'GET' || 
    url.hostname.includes('supabase.co') || 
    url.protocol === 'http:' ||
    url.hostname !== self.location.hostname // Ignore tout ce qui ne vient pas de votre domaine
  ) {
    return; // Laisse le navigateur gérer la requête normalement (sans passer par le cache)
  }

  // 2. STRATÉGIE NETWORK-FIRST POUR LES FICHIERS DE L'APP
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Ne met en cache que les réponses locales et valides
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
