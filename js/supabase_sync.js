// =========================================================================
// SUPABASE SYNC — ersetzt Firebase RTDB
// URL + Anon-Key sind public (RLS schützt, App hat PIN-System)
// =========================================================================
const SUPABASE_URL = 'https://qoaqpzmclvacaorginor.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvYXFwem1jbHZhY2Fvcmdpbm9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzQ3NjYsImV4cCI6MjA5Njg1MDc2Nn0.QddH8vVM2-yD8PIW89phVVKAkwX8Rl4-occwmabeUyk';

window.__useSupabase = true;

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
            SUPABASE_URL + '/rest/v1/cloud_backup?key=eq.' + encodeURIComponent(rowKey) + '&select=data',
            { headers: this._h() }
        );
        if (!res.ok) return null;
        const rows = await res.json();
        return (rows && rows[0]) ? rows[0].data : null;
    },

    async upsert(rowKey, data) {
        return fetch(SUPABASE_URL + '/rest/v1/cloud_backup', {
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
    if (/shared_lkw/i.test(url)) rowKey = 'shared_lkw';
    else if (/reklamation/i.test(url)) rowKey = 'reklamationen';

    // /reklamationen/KEY.json → Sub-Key
    const rekSub = url.match(/reklamation(?:en)?\/([^/?]+)\.json/);
    const isSettings = /\/settings\.json/.test(url);

    const ok  = (d) => ({ ok: true,  status: 200, json: () => Promise.resolve(d) });
    const err = (s) => ({ ok: false, status: s,   json: () => Promise.resolve(null) });

    if (method === 'GET') {
        const data = await SupabaseSync.get(rowKey);
        if (isSettings) return ok(data ? (data.settings || null) : null);
        if (rekSub)     return ok(data ? (data[rekSub[1]] || null) : null);
        return ok(data);
    }

    const body = (options && options.body) ? JSON.parse(options.body) : {};

    if (method === 'PATCH') {
        const res = await SupabaseSync.patch(rowKey, body);
        return res.ok ? ok({}) : err(res.status);
    }

    if (method === 'PUT') {
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
