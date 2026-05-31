const CACHE_NAME = 'logistik-app-beta-v11'; // AI-EDIT: Cache-Version erhöht, um Neuladen zu erzwingen.
const ASSETS_TO_CACHE = [
    // AI-FIX: Der Service Worker für die Beta-Version wird so angepasst, dass er die korrekten
    // Beta-Dateien (*_beta.js, *_beta.css etc.) zwischenspeichert. Dies behebt das Kernproblem,
    // dass Änderungen in der Beta-Umgebung nicht wirksam wurden, weil fälschlicherweise
    // die alten Live-Dateien aus dem Cache geladen wurden.
    './index_beta.html',
    './style_beta.css',
    './script_beta.js',
    './rechner_beta.js',
    './rechner_scanner_beta.js',
    './rechner_druck_beta.js',
    './rechner_reklamation_beta.js',
    './rechner_leergut_beta.js',
    './logistik_beta.js',
    './html5-qrcode.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // API-Aufrufe und externe Skripte vom Caching ausschließen
    if (event.request.method !== 'GET' || 
        event.request.url.includes('firebaseio.com') ||
        event.request.url.includes('script.google.com') || 
        event.request.url.includes('googleusercontent.com') || 
        event.request.url.includes('formspree.io')) {
        // Für diese Anfragen direkt zum Netzwerk gehen
        return;
    }

    // Stale-While-Revalidate Strategie
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    // Wenn die Anfrage erfolgreich war, aktualisieren wir den Cache
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(async (err) => {
                    // Wenn das Netzwerk fehlschlägt und wir eine zwischengespeicherte Antwort haben, ist das ok.
                    // Wenn nicht, und es eine Navigationsanfrage ist, zeige die Offline-Seite.
                    if (!cachedResponse && event.request.mode === 'navigate') { // AI-FIX: Fallback auf die korrekte Beta-Indexseite.
                         return (await caches.match('./index_beta.html')) || (await caches.match('./index_beta.html'));
                    }
                });

                // Gibt die zwischengespeicherte Antwort sofort zurück, wenn vorhanden.
                // Im Hintergrund wird die fetchPromise ausgeführt, um den Cache zu aktualisieren.
                return cachedResponse || fetchPromise;
            });
        })
    );
});
