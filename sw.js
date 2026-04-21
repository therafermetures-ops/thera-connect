const cacheName = 'thera-v2';

self.addEventListener('install', (event) => {
    // Force le service worker à s'activer immédiatement sans attendre
    self.skipWaiting();
    console.log("THERA SW: Installé");
});

self.addEventListener('activate', (event) => {
    console.log("THERA SW: Activé");
});

self.addEventListener('fetch', (event) => {
    // Stratégie simple : on va chercher sur le réseau, si ça échoue on regarde le cache
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});