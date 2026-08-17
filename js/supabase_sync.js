// =========================================================================
// SUPABASE SYNC — ersetzt Firebase RTDB
// URL + Anon-Key sind public (RLS schützt, App hat PIN-System)
// =========================================================================
const SUPABASE_URL = 'https://qoaqpzmclvacaorginor.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvYXFwem1jbHZhY2Fvcmdpbm9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzQ3NjYsImV4cCI6MjA5Njg1MDc2Nn0.QddH8vVM2-yD8PIW89phVVKAkwX8Rl4-occwmabeUyk';

window.__useSupabase = true;

// 2026-08-05: Server-Adresse umschaltbar machen. Das Bedienfeld im Sperrbildschirm
// (promptCustomCloudUrl -> localStorage 'custom_cloud_url') war bisher wirkungslos,
// weil SUPABASE_URL fest verdrahtet benutzt wurde. Damit laesst sich EIN Testgeraet
// auf den Firmenserver umstellen, waehrend alle anderen in der Cloud bleiben.
// Wird bei JEDEM Aufruf frisch gelesen, damit Umschalten sofort greift.
// Leer oder nicht gesetzt = eingebaute Cloud-Adresse, Verhalten unveraendert.
function getBackendBaseUrl() {
    let custom = '';
    try { custom = (localStorage.getItem('custom_cloud_url') || '').trim(); } catch (e) { custom = ''; }
    if (!custom) return SUPABASE_URL;
    return custom.replace(/\/+$/, ''); // nachlaufende Schraegstriche abfangen
}

// 2026-08-17: Jeder Datenabruf bekommt ein Zeitlimit. Vorher konnte ein haengender Server
// die App endlos warten lassen (kein AbortController im ganzen Code). Lesen 20 s, Schreiben 30 s.
const SUPABASE_LESE_LIMIT_MS = 20000;
const SUPABASE_SCHREIB_LIMIT_MS = 30000;

/**
 * fetch mit Zeitlimit fuers Schreiben. Bei Ablauf wird ein klarer Fehler geworfen — genau
 * wie bei einem Netzfehler heute. Eine echte Antwort kommt weiter als Response zurueck,
 * der Aufrufer prueft res.ok selbst.
 */
async function fetchMitZeitlimit(url, options, limitMs, was) {
    if (typeof AbortController === 'undefined') return fetch(url, options);
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), limitMs);
    try {
        return await fetch(url, { ...(options || {}), signal: abbruch.signal });
    } catch (e) {
        if (e && (e.name === 'AbortError' || abbruch.signal.aborted)) {
            throw new Error('Zeitlimit ' + Math.round(limitMs / 1000) + ' s ueberschritten (' + was + ') — Server antwortet nicht');
        }
        throw e;
    } finally {
        clearTimeout(uhr);
    }
}

/**
 * 2026-08-17: Lesen mit Zeitlimit — und zwar bis der Rumpf vollstaendig gelesen ist.
 * Das bisherige Zeitlimit endete schon, sobald die Kopfzeilen da waren; das Lesen des
 * Rumpfs (bei einer Vollkopie rund 2,8 MB) lief danach ohne Grenze weiter.
 * Bei HTTP-Fehlerstatus wird geworfen: 401 nach einem Schluesselwechsel oder 500/503 darf
 * NIE als "keine Daten" durchgehen — sonst schreiben die Zusammenfuehr-Stellen die ganze
 * Sammelzeile mit einem fast leeren Objekt zu.
 */
async function holeJsonMitZeitlimit(url, options, limitMs, was) {
    if (typeof AbortController === 'undefined') {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(was + ' fehlgeschlagen — Server-Status ' + res.status);
        return res.json();
    }
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), limitMs);
    try {
        const res = await fetch(url, { ...(options || {}), signal: abbruch.signal });
        if (!res.ok) throw new Error(was + ' fehlgeschlagen — Server-Status ' + res.status);
        return await res.json();   // noch innerhalb des Zeitlimits
    } catch (e) {
        if (e && (e.name === 'AbortError' || abbruch.signal.aborted)) {
            throw new Error('Zeitlimit ' + Math.round(limitMs / 1000) + ' s ueberschritten (' + was + ') — Server antwortet nicht');
        }
        throw e;
    } finally {
        clearTimeout(uhr);
    }
}

const SupabaseSync = {
    _h() {
        return {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        };
    },

    /** null NUR wenn die Zeile nicht existiert. Bei HTTP-Fehler wird geworfen (siehe holeJsonMitZeitlimit). */
    async get(rowKey) {
        const rows = await holeJsonMitZeitlimit(
            getBackendBaseUrl() + '/rest/v1/cloud_backup?key=eq.' + encodeURIComponent(rowKey) + '&select=data',
            { headers: this._h() },
            SUPABASE_LESE_LIMIT_MS,
            'Lesen ' + rowKey
        );
        return (rows && rows[0]) ? rows[0].data : null;
    },

    async upsert(rowKey, data) {
        return fetchMitZeitlimit(getBackendBaseUrl() + '/rest/v1/cloud_backup', {
            method: 'POST',
            headers: { ...this._h(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ key: rowKey, data, updated_at: new Date().toISOString() })
        }, SUPABASE_SCHREIB_LIMIT_MS, 'Schreiben ' + rowKey);
    },

    /**
     * Grundlage zum Zusammenfuehren: der vorhandene Stand der Sammelzeile.
     * Zweite Sicherung gegen Datenverlust — geschrieben wird nur, wenn das Lesen
     * geklappt hat. Schlaegt es fehl, wirft get() und der Aufrufer schreibt gar nichts.
     */
    async _basisZumZusammenfuehren(rowKey) {
        const daten = await this.get(rowKey);
        if (daten == null) return {};   // Zeile gibt es (noch) nicht — leere Grundlage ist richtig
        if (typeof daten !== 'object' || Array.isArray(daten)) {
            throw new Error('Cloud-Zeile "' + rowKey + '" hat unerwartete Form — Zusammenfuehren abgebrochen');
        }
        return daten;
    },

    async patch(rowKey, partial) {
        const current = await this._basisZumZusammenfuehren(rowKey);
        return this.upsert(rowKey, { ...current, ...partial });
    }
};

/** Compat-Layer: übersetzt Firebase REST URL-Muster in Supabase-Aufrufe */
async function supabaseCloudFetch(url, options) {
    const method = (options && options.method) || 'GET';

    let rowKey = 'main';
    if (/shared_lkw/i.test(url))    rowKey = 'shared_lkw';
    else if (/\/archive/i.test(url)) rowKey = 'archive';
    else if (/\/snapshot/i.test(url))rowKey = 'snapshot';
    else if (/reklamation/i.test(url))rowKey = 'reklamationen';

    // /reklamationen/KEY.json → Sub-Key
    const rekSub = url.match(/reklamation(?:en)?\/([^/?]+)\.json/);
    const isSettings = /\/settings\.json/.test(url);

    const ok  = (d) => ({ ok: true,  status: 200, json: () => Promise.resolve(d),        text: () => Promise.resolve(JSON.stringify(d)) });
    const err = (s) => ({ ok: false, status: s,   json: () => Promise.resolve(null),     text: () => Promise.resolve('') });

    if (method === 'GET') {
        const data = await SupabaseSync.get(rowKey);
        if (isSettings) return ok(data ? (data.settings || null) : null);
        if (rekSub)     return ok(data ? (data[rekSub[1]] || null) : null);
        return ok(data);
    }

    const body = (options && options.body) ? JSON.parse(options.body) : {};

    // POST = neue Reklamation mit auto-generiertem Key (Firebase-kompatibel)
    if (method === 'POST') {
        const newKey = 'rek_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const current = await SupabaseSync._basisZumZusammenfuehren(rowKey);
        current[newKey] = body;
        const res = await SupabaseSync.upsert(rowKey, current);
        return res.ok ? ok({ name: newKey }) : err(res.status);
    }

    if (method === 'PATCH') {
        // Settings-PATCH: nur settings-Unterkey aktualisieren, nicht ganzen Row überschreiben
        if (isSettings) {
            const res = await SupabaseSync.patch(rowKey, { settings: body });
            return res.ok ? ok({}) : err(res.status);
        }
        const res = await SupabaseSync.patch(rowKey, body);
        return res.ok ? ok({}) : err(res.status);
    }

    if (method === 'PUT') {
        // Settings-PUT: nur settings-Unterkey schreiben, nicht ganzen Row überschreiben
        if (isSettings) {
            const res = await SupabaseSync.patch(rowKey, { settings: body });
            return res.ok ? ok({}) : err(res.status);
        }
        if (rekSub) {
            const current = await SupabaseSync._basisZumZusammenfuehren(rowKey);
            current[rekSub[1]] = body;
            const res = await SupabaseSync.upsert(rowKey, current);
            return res.ok ? ok({}) : err(res.status);
        }
        const res = await SupabaseSync.upsert(rowKey, body);
        return res.ok ? ok({}) : err(res.status);
    }

    if (method === 'DELETE') {
        if (rekSub) {
            const current = await SupabaseSync._basisZumZusammenfuehren(rowKey);
            delete current[rekSub[1]];
            const res = await SupabaseSync.upsert(rowKey, current);
            return res.ok ? ok({}) : err(res.status);
        }
        return ok({});
    }

    return err(400);
}
