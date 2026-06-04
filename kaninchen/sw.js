/**
 * Kaninchen-PWA (eigener Ordner /kaninchen/) – getrennt von der Kombi-App.
 * Kein Cache-Löschen – Firebase & localStorage bleiben unberührt.
 */
self.addEventListener('install', (e) => {
    e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
    e.respondWith(fetch(e.request));
});
