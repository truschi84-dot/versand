// =========================================================================
// CLOUD AUTH — Supabase-only (Firebase entfernt)
// cloudFetch delegiert direkt an supabaseCloudFetch (supabase_sync.js)
// =========================================================================

/** Haupt-Cloud-Fetch: immer Supabase */
async function cloudFetch(url, options) {
    if (typeof supabaseCloudFetch === 'function') {
        return supabaseCloudFetch(url, options);
    }
    throw new Error('supabaseCloudFetch nicht verfügbar – supabase_sync.js geladen?');
}

/** Gibt false zurück wenn kein Internet, sonst true */
async function guardCloudAccess(showUserMessage) {
    if (!navigator.onLine) {
        if (showUserMessage && typeof showToast === 'function') showToast('Kein Internet.', 'warning');
        return false;
    }
    return true;
}

/** Immer false – kein Cloud-Skip mehr nötig (Supabase funktioniert auch im Browser) */
async function shouldSkipCloudOnWeb(silent) {
    return false;
}

function getCloudSetupHint() {
    return 'Cloud-Verbindung (Supabase) prüfen – Internet vorhanden?';
}

function isAppAuthenticated() {
    return localStorage.getItem('app_authenticated') === 'true'
        || localStorage.getItem('logistik_authenticated') === 'true';
}

function setAppAuthenticated(value) {
    if (value) {
        localStorage.setItem('app_authenticated', 'true');
        localStorage.setItem('logistik_authenticated', 'true');
    } else {
        localStorage.removeItem('app_authenticated');
        localStorage.removeItem('logistik_authenticated');
    }
    try {
        sessionStorage.removeItem('app_authenticated');
        sessionStorage.removeItem('logistik_authenticated');
    } catch (_) {}
}

function requireAppAuth(actionLabel) {
    if (isAppAuthenticated()) return true;
    if (typeof showPinProtection === 'function') showPinProtection(actionLabel);
    return false;
}
