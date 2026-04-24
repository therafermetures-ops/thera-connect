/* ==================================================================
   THERA CONNECT — service-worker.js v4.5
================================================================== */

const CACHE_NAME = "thera-connect-v4.5";

// Liste des fichiers statiques à mettre en cache pour l'accès hors-ligne
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon.png",
];

// Installation : Mise en cache des actifs statiques
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Force le nouveau SW à prendre le contrôle immédiatement
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("SW: Mise en cache des actifs statiques");
      return cache.addAll(ASSETS);
    }),
  );
});

// Activation : Nettoyage des anciens caches + prise de contrôle immédiate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log("[SW] Purge ancien cache :", key);
              return caches.delete(key);
            }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Interception des requêtes
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // --- FILTRE DE SÉCURITÉ ---
  // On NE gère PAS les requêtes si :
  // 1. Ce n'est pas du GET (ex: POST pour l'auth ou l'écriture de données)
  // 2. C'est vers le domaine de Supabase (API de données)
  // 3. C'est une requête vers vos modules ESP32 (HTTP local)
  if (
    event.request.method !== "GET" ||
    url.hostname.includes("supabase.co") ||
    url.protocol === "http:" ||
    url.hostname !== self.location.hostname
  ) {
    // On laisse le navigateur gérer la requête normalement sans passer par le cache
    return;
  }

  // --- STRATÉGIE NETWORK-FIRST ---
  // On tente d'abord le réseau pour avoir la version la plus récente
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la réponse est valide, on met à jour le cache
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Si le réseau échoue (mode hors-ligne), on cherche dans le cache
        return caches.match(event.request);
      }),
  );
});
