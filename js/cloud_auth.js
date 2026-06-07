// =========================================================================
// FIREBASE CLOUD-AUTH (Realtime Database REST + E-Mail/Passwort)
// Zugangsdaten in app-secrets.json (nicht ins öffentliche GitHub!)
// =========================================================================
const CloudAuth = {
    _config: null,
    _idToken: null,
    _refreshToken: null,
    _expiresAt: 0,
    _authPromise: null,

    _secretsComplete(cfg) {
        return !!(cfg && cfg.firebaseApiKey && cfg.firebaseAuthEmail && cfg.firebaseAuthPassword
            && !String(cfg.firebaseAuthPassword).includes('HIER_DEIN'));
    },

    _cacheSecrets(cfg) {
        if (!this._secretsComplete(cfg)) return;
        try { localStorage.setItem('firebase_auth_secrets', JSON.stringify(cfg)); } catch (_) {}
    },

    async loadSecrets() {
        if (this._config && this._secretsComplete(this._config)) return this._config;
        if (typeof window !== 'undefined' && window.__FIREBASE_SECRETS__ && this._secretsComplete(window.__FIREBASE_SECRETS__)) {
            this._config = window.__FIREBASE_SECRETS__;
            this._cacheSecrets(this._config);
            return this._config;
        }
        try {
            const raw = localStorage.getItem('firebase_auth_secrets');
            if (raw) {
                this._config = JSON.parse(raw);
                if (this._secretsComplete(this._config)) return this._config;
            }
        } catch (_) {}
        const paths = [];
        const inPc = (location.pathname || '').replace(/\\/g, '/').includes('/pc/');
        if (inPc) paths.push('../../app-secrets.json', '../app-secrets.json');
        if (location.protocol === 'file:') {
            paths.push('app-secrets.json', './app-secrets.json', 'file:///android_asset/app-secrets.json');
        } else {
            paths.push('app-secrets.json', '/app-secrets.json');
        }
        for (const p of paths) {
            try {
                const res = await fetch(p + '?t=' + Date.now(), { cache: 'no-store' });
                if (!res.ok) continue;
                const cfg = await res.json();
                if (this._secretsComplete(cfg)) {
                    this._config = cfg;
                    this._cacheSecrets(cfg);
                    return this._config;
                }
            } catch (_) {}
        }
        return null;
    },

    importSecretsFromJson(cfg) {
        if (!this._secretsComplete(cfg)) return false;
        this._config = cfg;
        this._cacheSecrets(cfg);
        this.clearSession();
        return true;
    },

    isConfigured() {
        return !!(this._config && this._config.firebaseApiKey && this._config.firebaseAuthEmail && this._config.firebaseAuthPassword);
    },

    async ensureAuth() {
        if (this._idToken && Date.now() < this._expiresAt - 60000) return this._idToken;
        if (this._authPromise) return this._authPromise;
        this._authPromise = this._signIn().finally(() => { this._authPromise = null; });
        return this._authPromise;
    },

    async _signIn() {
        const cfg = await this.loadSecrets();
        if (!this._secretsComplete(cfg)) {
            const hint = location.protocol === 'file:'
                ? 'Öffne über http://localhost:8080/projekt/pc/control-center.html (projekt\\scripts\\start-buero-server.ps1) – oder app-secrets.json per Datei-Button laden.'
                : 'app-secrets.json fehlt oder ist unvollständig (im Projekt-Root).';
            throw new Error('Cloud-Zugang nicht konfiguriert. ' + hint);
        }
        const res = await fetch(
            'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(cfg.firebaseApiKey),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: cfg.firebaseAuthEmail,
                    password: cfg.firebaseAuthPassword,
                    returnSecureToken: true
                })
            }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = data.error?.message || ('HTTP ' + res.status);
            throw new Error('Firebase-Login fehlgeschlagen: ' + msg);
        }
        this._idToken = data.idToken;
        this._refreshToken = data.refreshToken;
        this._expiresAt = Date.now() + (parseInt(data.expiresIn, 10) || 3600) * 1000;
        return this._idToken;
    },

    async _refresh() {
        const cfg = this._config || await this.loadSecrets();
        if (!cfg || !this._refreshToken) return this._signIn();
        const res = await fetch(
            'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(cfg.firebaseApiKey),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(this._refreshToken)
            }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return this._signIn();
        this._idToken = data.id_token;
        this._refreshToken = data.refresh_token || this._refreshToken;
        this._expiresAt = Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000;
        return this._idToken;
    },

    _withAuth(url) {
        if (!this._idToken) return url;
        const sep = url.includes('?') ? '&' : '?';
        return url + sep + 'auth=' + encodeURIComponent(this._idToken);
    },

    clearSession() {
        this._idToken = null;
        this._refreshToken = null;
        this._expiresAt = 0;
    },

    async fetch(url, options) {
        await this.ensureAuth();
        let res = await fetch(this._withAuth(url), options || {});
        if (res.status === 401) {
            await this._refresh();
            res = await fetch(this._withAuth(url), options || {});
        }
        return res;
    }
};

/** Wrapper für alle Firebase-RTDB-Aufrufe. */
async function cloudFetch(url, options) {
    return CloudAuth.fetch(url, options);
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
