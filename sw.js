/**
 * DEAKTIVIERT – alter SW hat den Handy-Speicher mit Duplikaten gefuellt.
 * Beim Aktivieren nur noch: alte Caches loeschen und sich selbst abmelden.
 */
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).then(() => self.skipWaiting())
    );
});
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).then(() => self.clients.claim())
    );
});
self.addEventListener('fetch', () => {});
