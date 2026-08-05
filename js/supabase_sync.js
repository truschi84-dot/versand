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

const SupabaseSync = {
    _h() {
        return {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        };
    },

    async get(rowKey) {
        const res = await fetch(
            getBackendBaseUrl() + '/rest/v1/cloud_backup?key=eq.' + encodeURIComponent(rowKey) + '&select=data',
            { headers: this._h() }
        );
        if (!res.ok) return null;
        const rows = await res.json();
        return (rows && rows[0]) ? rows[0].data : null;
    },

    async upsert(rowKey, data) {
        return fetch(getBackendBaseUrl() + '/rest/v1/cloud_backup', {
            method: 'POST',
            headers: { ...this._h(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ key: rowKey, data, updated_at: new Date().toISOString() })
        });
    },

    async patch(rowKey, partial) {
        const current = await this.get(rowKey) || {};
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
        const current = await SupabaseSync.get(rowKey) || {};
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
            const current = await SupabaseSync.get(rowKey) || {};
            current[rekSub[1]] = body;
            const res = await SupabaseSync.upsert(rowKey, current);
            return res.ok ? ok({}) : err(res.status);
        }
        const res = await SupabaseSync.upsert(rowKey, body);
        return res.ok ? ok({}) : err(res.status);
    }

    if (method === 'DELETE') {
        if (rekSub) {
            const current = await SupabaseSync.get(rowKey) || {};
            delete current[rekSub[1]];
            const res = await SupabaseSync.upsert(rowKey, current);
            return res.ok ? ok({}) : err(res.status);
        }
        return ok({});
    }

    return err(400);
}
