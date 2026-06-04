/**
 * Kaninchen-PWA: nur Installierbarkeit (Chrome „App installieren“).
 * Kein Cache-Löschen – Firebase & localStorage der Seite bleiben unberührt.
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
