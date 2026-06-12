// ============================================================
// TRESCH LOGISTIK — CORE  (eigenständig, kein shared code)
// ============================================================

const FIREBASE_URL = "https://tresch-versand-default-rtdb.firebaseio.com/backup";
let _secrets = null;
let _idToken = null;

// ── SECRETS ──────────────────────────────────────────────────
// Normalisiert beide Formate: {apiKey/authEmail/authPassword} und {firebaseApiKey/firebaseAuthEmail/firebaseAuthPassword}
function normalizeSecrets(cfg) {
    if (!cfg) return null;
    return {
        apiKey:       cfg.apiKey       || cfg.firebaseApiKey       || '',
        authEmail:    cfg.authEmail    || cfg.firebaseAuthEmail    || '',
        authPassword: cfg.authPassword || cfg.firebaseAuthPassword || '',
        databaseURL:  cfg.databaseURL  || cfg.firebaseDatabaseURL  || ''
    };
}
function loadSecretsFromStorage() {
    try { const s = localStorage.getItem('app_secrets'); if (s) _secrets = normalizeSecrets(JSON.parse(s)); } catch(e) {}
}
function secretsOk() { return _secrets && _secrets.apiKey && _secrets.authEmail && _secrets.authPassword; }

async function tryAutoLoadSecrets() {
    if (secretsOk()) return;
    if (typeof window !== 'undefined' && window.__FIREBASE_SECRETS__) {
        const cfg = normalizeSecrets(window.__FIREBASE_SECRETS__);
        if (cfg && cfg.apiKey && cfg.authEmail && cfg.authPassword) {
            _secrets = cfg;
            localStorage.setItem('app_secrets', JSON.stringify(cfg));
            return;
        }
    }
    const paths = ['app-secrets.json', './app-secrets.json', '../app-secrets.json', '/app-secrets.json'];
    for (const p of paths) {
        try {
            const r = await fetch(p, { cache: 'no-store' });
            if (!r.ok) continue;
            const cfg = normalizeSecrets(await r.json());
            if (cfg && cfg.apiKey && cfg.authEmail && cfg.authPassword) {
                _secrets = cfg;
                localStorage.setItem('app_secrets', JSON.stringify(cfg));
                return;
            }
        } catch (e) { /* nächster Pfad */ }
    }
}

function loadSecretsFile(input) {
    const file = input.files && input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const cfg = normalizeSecrets(JSON.parse(reader.result));
            if (!cfg.apiKey || !cfg.authEmail || !cfg.authPassword) throw new Error('Felder fehlen (apiKey, authEmail, authPassword)');
            _secrets = cfg;
            localStorage.setItem('app_secrets', JSON.stringify(cfg));
            cloudLog('✅ Secrets geladen – Cloud bereit');
            updateCloudStatus();
        } catch(e) { alert('❌ Ungültige Datei: ' + e.message); }
        input.value = '';
    };
    reader.readAsText(file);
}

async function getIdToken() {
    if (!secretsOk()) throw new Error('Keine Cloud-Zugangsdaten. Bitte app-secrets.json laden.');
    const apiKey = _secrets.apiKey;
    const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: _secrets.authEmail, password: _secrets.authPassword, returnSecureToken: true }) }
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Auth-Fehler');
    _idToken = data.idToken;
    return _idToken;
}

function cloudLog(msg) {
    let logs = JSON.parse(localStorage.getItem('logistik_cloud_logs') || '[]');
    const now = new Date();
    logs.unshift({ t: now.toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit'}), d: now.toLocaleDateString('de-DE'), msg });
    if (logs.length > 30) logs.pop();
    localStorage.setItem('logistik_cloud_logs', JSON.stringify(logs));
    renderCloudLog();
}

function renderCloudLog() {
    const el = document.getElementById('cloud-log'); if (!el) return;
    let logs = JSON.parse(localStorage.getItem('logistik_cloud_logs') || '[]');
    el.innerHTML = logs.map(l => `<div>${l.d} ${l.t} · ${l.msg}</div>`).join('') || 'Noch keine Aktionen';
}

function updateCloudStatus() {
    const el = document.getElementById('cloud-status-text'); if (!el) return;
    if (secretsOk()) {
        el.textContent = '✅ Cloud konfiguriert (' + (_secrets.authEmail || '') + ')';
        el.style.color = 'var(--success)';
    } else {
        el.textContent = '⚠️ Kein Cloud-Zugang — app-secrets.json laden';
        el.style.color = 'var(--danger)';
    }
}

function showToast(msg, type) {
    let t = document.getElementById('app-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'app-toast';
        t.style.cssText = 'position:fixed;bottom:calc(var(--nav-h,64px) + 20px);left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;color:white;z-index:9999;transition:opacity 0.4s;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.25);';
        document.body.appendChild(t);
    }
    t.style.background = type === 'error' ? '#d32f2f' : type === 'warn' ? '#e65100' : '#137333';
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

const LOGISTIK_CLOUD_KEYS = [
    'suppliers', 'customers', 'articles', 'todo', 'lose', 'later', 'hidden', 'workers', 'workerColors',
    'entries', 'settings', 'company', 'deletedSuppliers', 'supplierLines', 'supplierLinesCleared',
    'artikelMarkt', 'teamTagesMengen', 'dailyAttendance', 'dailyStaff', 'savedProdukteRaw', 'sonderTemplates',
    'noelkeItems', 'teamDayBrief', 'checklistMorningTemplate',
    'teamSortierBuchungen', 'deletedSortierBuchungen', 'deliveries'
];

function buildLogistikCloudPatch(mergedDb) {
    const patch = {};
    LOGISTIK_CLOUD_KEYS.forEach((k) => { if (mergedDb[k] !== undefined) patch[k] = mergedDb[k]; });
    return typeof safeLogistikCloudPatchPayload === 'function'
        ? safeLogistikCloudPatchPayload(patch)
        : patch;
}

async function pullCloud() {
    if (!secretsOk()) { showToast('⚠️ Bitte zuerst app-secrets.json laden', 'warn'); openCloudPanel(); return; }
    closeAllSheets();
    try {
        cloudLog('⏳ Lade aus Cloud…');
        const token = await getIdToken();
        const dbUrl = (_secrets.databaseURL || FIREBASE_URL.replace('/backup','')).replace(/\/$/, '');
        const resp = await fetch(`${dbUrl}/backup.json?auth=${token}`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data && typeof data === 'object') {
            const keys = ['suppliers','customers','articles','todo','lose','later','hidden','workers','workerColors',
                'entries','settings','company','deletedSuppliers','supplierLines','supplierLinesCleared',
                'artikelMarkt','teamTagesMengen','dailyAttendance','dailyStaff','savedProdukteRaw','sonderTemplates',
                'noelkeItems','teamDayBrief','checklistMorningTemplate'];
            keys.forEach(k => { if (data[k] !== undefined) db[k] = data[k]; });
            if (Array.isArray(data.deletedSortierBuchungen) && typeof mergeDeletedSortierKeys === 'function') {
                db.deletedSortierBuchungen = mergeDeletedSortierKeys(db.deletedSortierBuchungen || [], data.deletedSortierBuchungen);
            } else if (Array.isArray(data.deletedSortierBuchungen)) {
                db.deletedSortierBuchungen = data.deletedSortierBuchungen;
            }
            const cloudBuch = typeof asSortierBuchungenArray === 'function'
                ? asSortierBuchungenArray(data.teamSortierBuchungen)
                : (Array.isArray(data.teamSortierBuchungen) ? data.teamSortierBuchungen : []);
            if (cloudBuch.length) {
                const lokalBuch = typeof asSortierBuchungenArray === 'function'
                    ? asSortierBuchungenArray(db.teamSortierBuchungen)
                    : (db.teamSortierBuchungen || []);
                const lokalHat = lokalBuch.length > 0;
                if (!(lokalHat && !cloudBuch.length) && typeof mergeTeamSortierBuchungen === 'function') {
                    db.teamSortierBuchungen = mergeTeamSortierBuchungen(
                        lokalBuch,
                        cloudBuch,
                        db.deletedSortierBuchungen || []
                    );
                } else if (!lokalHat) {
                    db.teamSortierBuchungen = cloudBuch;
                }
            }
            if (data.deliveries != null) {
                db.deliveries = typeof mergeLieferungenCloudMitLokalLkw === 'function'
                    ? mergeLieferungenCloudMitLokalLkw(db.deliveries || [], data.deliveries)
                    : (typeof mergeLieferungen === 'function'
                        ? mergeLieferungen(db.deliveries || [], data.deliveries)
                        : data.deliveries);
            }
            if (typeof ensureDatenKonsistenz === 'function') ensureDatenKonsistenz(db);
            else if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
            saveDb();
            renderAll();
            const sortRows = typeof sortierBuchungenNachDatum === 'function'
                ? sortierBuchungenNachDatum({ teamSortierBuchungen: db.teamSortierBuchungen, deletedSortierBuchungen: db.deletedSortierBuchungen })
                : [];
            const sortHint = sortRows.length
                ? ' — Sortier: ' + sortRows.slice(0, 4).map((r) => r.datum.split('-').reverse().join('.') + '(' + r.count + ')').join(' ')
                : '';
            cloudLog('✅ Aus Cloud geladen [OK]' + sortHint);
            showToast('✅ Daten aus Cloud geladen!');
        } else { throw new Error('Leere Antwort'); }
    } catch(e) { cloudLog('❌ Fehler: ' + e.message); showToast('❌ ' + e.message, 'error'); }
}

async function pushCloud() {
    if (!secretsOk()) { showToast('⚠️ Bitte zuerst app-secrets.json laden', 'warn'); openCloudPanel(); return; }
    closeAllSheets();
    try {
        cloudLog('⏳ Speichere in Cloud…');
        if (typeof hydrateSortierBuchungenInDb === 'function') hydrateSortierBuchungenInDb(db);
        const token = await getIdToken();
        const dbUrl = (_secrets.databaseURL || FIREBASE_URL.replace('/backup','')).replace(/\/$/, '');
        let uploadDb = db;
        try {
            const pull = await fetch(`${dbUrl}/backup.json?auth=${token}&t=${Date.now()}`);
            if (pull.ok) {
                const cloud = await pull.json();
                if (cloud && typeof mergeLogistikPayloadMitCloud === 'function') {
                    uploadDb = mergeLogistikPayloadMitCloud(db, cloud);
                    db.teamSortierBuchungen = uploadDb.teamSortierBuchungen;
                    db.deliveries = uploadDb.deliveries;
                    db.teamTagesMengen = uploadDb.teamTagesMengen;
                    db.deletedSortierBuchungen = uploadDb.deletedSortierBuchungen;
                }
            }
        } catch (e) { /* nur lokaler Stand */ }
        const patchPayload = buildLogistikCloudPatch(uploadDb);
        const resp = await fetch(`${dbUrl}/backup.json?auth=${token}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchPayload)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        saveDb();
        cloudLog('✅ In Cloud gespeichert [OK]');
        showToast('✅ Daten in Cloud gesichert!');
    } catch(e) { cloudLog('❌ Fehler: ' + e.message); showToast('❌ ' + e.message, 'error'); }
}

function downloadBackup() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'logistik-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    cloudLog('📥 Backup heruntergeladen');
    closeAllSheets();
}

// ── DATABASE ──────────────────────────────────────────────────
let db = {
    suppliers: [], customers: [], articles: [], savedProdukteRaw: [],
    deletedSuppliers: [], supplierLines: {}, supplierLinesCleared: [],
    todo: [], lose: [], later: [], hidden: [],
    workers: [], workerColors: {},
    dailyAttendance: {}, dailyStaff: {}, deliveries: [], entries: [],
    teamSortierBuchungen: [], deletedSortierBuchungen: [],
    noelkeItems: [],
    sonderTemplates: [],
    teamDayBrief: null,
    checklistMorningTemplate: [],
    teamTagesMengen: {},
    settings: { printerIp: '', notificationUrl: '', logistikPin: '3132', adminPin: '110784', pinVersion: 1, inactivityTimeout: 0, noelkeDefaultArtNr: 'NÖLKE' },
    company: { name: 'Tresch & Sohn', color: '#004b93', modules: { lkw: true, sort: true, noelke: true }, leergut: 'E2:2.0, Herta:2.5, H1:18.0, Euro:21.0' },
    artikelMarkt: {},
    v41_initialized: false
};

function mirrorToKombiLogistik() {
    try {
        const l = localStorage.getItem('kombi_logistik_db');
        const ld = l ? JSON.parse(l) : {};
        ['dailyStaff', 'dailyAttendance', 'workers', 'workerColors', 'suppliers', 'articles', 'artikelMarkt',
            'teamTagesMengen'].forEach((k) => {
            if (db[k] !== undefined) ld[k] = db[k];
        });
        if (Array.isArray(db.deletedSortierBuchungen) && typeof mergeDeletedSortierKeys === 'function') {
            ld.deletedSortierBuchungen = mergeDeletedSortierKeys(ld.deletedSortierBuchungen || [], db.deletedSortierBuchungen);
        } else if (Array.isArray(db.deletedSortierBuchungen)) {
            ld.deletedSortierBuchungen = db.deletedSortierBuchungen;
        }
        if (Array.isArray(db.teamSortierBuchungen) && typeof mergeTeamSortierBuchungen === 'function') {
            ld.teamSortierBuchungen = mergeTeamSortierBuchungen(
                ld.teamSortierBuchungen || [],
                db.teamSortierBuchungen,
                ld.deletedSortierBuchungen || db.deletedSortierBuchungen || []
            );
        } else if (Array.isArray(db.teamSortierBuchungen)) {
            ld.teamSortierBuchungen = db.teamSortierBuchungen;
        }
        if (db.deliveries != null && typeof mergeLieferungen === 'function') {
            ld.deliveries = mergeLieferungen(ld.deliveries || [], db.deliveries);
        } else if (db.deliveries != null) {
            ld.deliveries = db.deliveries;
        }
        localStorage.setItem('kombi_logistik_db', JSON.stringify(ld));
    } catch (e) {}
}

/** Druck-Daten aus Rechner-App (kombi_logistik_db) nachladen — nicht überschreiben. */
function refreshSortierFromKombi() {
    try {
        const l = localStorage.getItem('kombi_logistik_db');
        if (!l) return;
        mergeFromKombiLogistik(JSON.parse(l));
        if (typeof ensureDatenKonsistenz === 'function') ensureDatenKonsistenz(db);
    } catch (e) {}
}

function saveDb() {
    localStorage.setItem('logistik_offline_db', JSON.stringify(db));
    mirrorToKombiLogistik();
    const ts = new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
    const sub = document.getElementById('header-sub');
    if (sub) sub.textContent = 'Gespeichert ' + ts;
}

function doSave() { saveDb(); }

function mergeFromKombiLogistik(ld) {
    if (!ld || typeof ld !== 'object') return;
    ['suppliers','articles','todo','lose','later','hidden','workers','workerColors','settings','company',
     'deletedSuppliers','supplierLines','supplierLinesCleared','artikelMarkt','teamTagesMengen','dailyStaff','dailyAttendance'].forEach(k => {
        if (ld[k] !== undefined) db[k] = ld[k];
    });
    if (Array.isArray(ld.deletedSortierBuchungen) && typeof mergeDeletedSortierKeys === 'function') {
        db.deletedSortierBuchungen = mergeDeletedSortierKeys(db.deletedSortierBuchungen || [], ld.deletedSortierBuchungen);
    } else if (Array.isArray(ld.deletedSortierBuchungen)) {
        db.deletedSortierBuchungen = ld.deletedSortierBuchungen;
    }
    const kombiBuch = typeof asSortierBuchungenArray === 'function'
        ? asSortierBuchungenArray(ld.teamSortierBuchungen)
        : (Array.isArray(ld.teamSortierBuchungen) ? ld.teamSortierBuchungen : []);
    if (kombiBuch.length && typeof mergeTeamSortierBuchungen === 'function') {
        db.teamSortierBuchungen = mergeTeamSortierBuchungen(
            typeof asSortierBuchungenArray === 'function' ? asSortierBuchungenArray(db.teamSortierBuchungen) : (db.teamSortierBuchungen || []),
            kombiBuch,
            db.deletedSortierBuchungen || []
        );
    } else if (kombiBuch.length) {
        db.teamSortierBuchungen = kombiBuch;
    }
    if (ld.deliveries != null && typeof mergeLieferungen === 'function') {
        db.deliveries = mergeLieferungen(db.deliveries || [], ld.deliveries);
    } else if (ld.deliveries != null) {
        db.deliveries = ld.deliveries;
    }
}

function loadDb() {
    try {
        const s = localStorage.getItem('logistik_offline_db');
        if (s) db = { ...db, ...JSON.parse(s) };
    } catch(e) {}
    try {
        const l = localStorage.getItem('kombi_logistik_db');
        if (l) mergeFromKombiLogistik(JSON.parse(l));
        const r = localStorage.getItem('kombi_rechner_db');
        if (r) {
            const rd = JSON.parse(r);
            if (rd.savedProdukteRaw) db.savedProdukteRaw = rd.savedProdukteRaw;
            if (rd.sonderTemplates) db.sonderTemplates = rd.sonderTemplates;
            if (rd.entries) db.entries = rd.entries;
        }
    } catch(e) {}
}

// ── INIT ──────────────────────────────────────────────────────
function ccTodayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function ensureDefaults() {
    if (!Array.isArray(db.todo)) db.todo = [];
    if (!Array.isArray(db.lose)) db.lose = [];
    if (!Array.isArray(db.later)) db.later = [];
    if (!Array.isArray(db.hidden)) db.hidden = [];
    if (!Array.isArray(db.articles)) db.articles = [];
    if (!Array.isArray(db.suppliers)) db.suppliers = [];
    if (!Array.isArray(db.workers)) db.workers = [];
    if (!Array.isArray(db.deliveries)) db.deliveries = [];
    if (!Array.isArray(db.teamSortierBuchungen)) db.teamSortierBuchungen = [];
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    if (!db.dailyStaff || typeof db.dailyStaff !== 'object') db.dailyStaff = {};
    if (!Array.isArray(db.noelkeItems)) db.noelkeItems = [];
    if (!Array.isArray(db.sonderTemplates)) db.sonderTemplates = [];
    if (!db.workerColors || typeof db.workerColors !== 'object') db.workerColors = {};
    if (!db.artikelMarkt || typeof db.artikelMarkt !== 'object') db.artikelMarkt = {};
    if (!db.teamTagesMengen || typeof db.teamTagesMengen !== 'object') db.teamTagesMengen = {};
    if (!db.supplierLines || typeof db.supplierLines !== 'object') db.supplierLines = {};
    if (!Array.isArray(db.deletedSuppliers)) db.deletedSuppliers = [];
    if (!Array.isArray(db.supplierLinesCleared)) db.supplierLinesCleared = [];
    if (!db.settings) db.settings = {};
    if (!db.company) db.company = {};
    if (!db.teamDayBrief || typeof db.teamDayBrief !== 'object') {
        db.teamDayBrief = { date: ccTodayISO(), message: '', tasks: [] };
    }
    if (!Array.isArray(db.teamDayBrief.tasks)) db.teamDayBrief.tasks = [];
    if (!Array.isArray(db.checklistMorningTemplate) || !db.checklistMorningTemplate.length) {
        db.checklistMorningTemplate = [
            { id: 'm1', text: 'Stapler prüfen (Wasser, Öl, Batterie)' },
            { id: 'm2', text: 'Tore & Türen öffnen' },
            { id: 'm3', text: 'LKW Ladezonen aufräumen / reinigen' },
            { id: 'm4', text: 'Leergut-Platz kontrollieren' },
            { id: 'm5', text: 'Müll / Pappe entsorgen' }
        ];
    }
    // Migrate noelke from savedProdukteRaw if needed
    if (db.savedProdukteRaw?.length && !db.noelkeItems?.length) {
        db.noelkeItems = (db.savedProdukteRaw || []).map((v, i) => ({ id: 'nk' + i, val: String(v) }));
    }
}

function initRawData() {
    if (db.v41_initialized) return;
    rawData.forEach(r => {
        const inArt = db.articles.some(a => a.fertigNr === r.id);
        const inTodo = db.todo.some(a => a.fertigNr === r.id);
        const inLose = db.lose.some(a => a.fertigNr === r.id);
        const inLater = db.later.some(a => a.fertigNr === r.id);
        const inHidden = db.hidden.some(a => a.fertigNr === r.id);
        if (!inArt && !inTodo && !inLose && !inLater && !inHidden) {
            const item = { fertigNr: r.id, name: r.name, nr: '', suppliers: [] };
            if (r.name.toLowerCase().includes('lose')) db.lose.push(item);
            else db.todo.push(item);
        }
    });
    db.v41_initialized = true;
}

// ── NAVIGATION ────────────────────────────────────────────────
let activePage = 'artikel';
const MEHR_PAGES = ['stats', 'sortimente', 'noelke', 'sonderposten'];

function showPage(name) {
    activePage = name;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + name);
    if (page) page.classList.add('active');
    scrollLogistikToTop();
    // Update bottom nav
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (MEHR_PAGES.includes(name)) {
        document.getElementById('nav-mehr')?.classList.add('active');
    } else {
        document.getElementById('nav-' + name)?.classList.add('active');
    }
    // Trigger page render
    if (name === 'briefing') renderBriefing();
    if (name === 'lieferanten') renderLieferanten();
    if (name === 'erfassung') renderErfassung();
    if (name === 'stats') renderStats();
    if (name === 'sortimente') renderSortimente();
    if (name === 'noelke') renderNoelke();
    if (name === 'sonderposten') renderSonderposten();
    if (name === 'artikel') renderArtikelList();
}

function openMehrMenu() { openSheet('sheet-mehr'); }

/** Wie Rechner toggleMenuApp2 — Menü zu = display:none + pointer-events:none. */
function setLogistikSheetOpen(open, sheetId) {
    const bd = document.getElementById('backdrop');
    document.body.classList.toggle('logistik-menu-open', !!open);
    if (bd) {
        bd.style.display = open ? 'block' : 'none';
        bd.style.pointerEvents = open ? 'auto' : 'none';
    }
    document.querySelectorAll('.bottom-sheet').forEach((s) => {
        s.style.display = 'none';
        s.style.pointerEvents = 'none';
        s.classList.remove('open');
    });
    if (open && sheetId) {
        const sheet = document.getElementById(sheetId);
        if (sheet) {
            sheet.style.display = 'block';
            sheet.style.pointerEvents = 'auto';
            sheet.classList.add('open');
        }
    }
}

function resetBlockingUi() {
    const anySheet = document.querySelector('.bottom-sheet.open');
    if (anySheet) return;
    document.body.classList.remove('logistik-menu-open', 'scroll-lock');
    const bd = document.getElementById('backdrop');
    if (bd) {
        bd.style.display = 'none';
        bd.style.pointerEvents = 'none';
    }
    document.querySelectorAll('.bottom-sheet').forEach((s) => {
        if (!s.classList.contains('open')) {
            s.style.display = 'none';
            s.style.pointerEvents = 'none';
        }
    });
}

function scrollLogistikToTop() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
}

function applyLogistikSafeAreaInsets() {
    if (typeof AndroidApp === 'undefined') return;
    try {
        const top = Math.min(Math.max(Number(AndroidApp.getStatusBarHeightPx?.() || 0), 24), 40);
        const bottom = Math.min(Number(AndroidApp.getNavigationBarHeightPx?.() || 0), 48);
        document.documentElement.style.setProperty('--safe-top', top + 'px');
        if (bottom > 0) document.documentElement.style.setProperty('--safe-bottom', bottom + 'px');
    } catch (_) {}
}

/** Wie Rechner initAndroidApkBridge + Versand onPageFinished Scroll-Fix. */
function applyLogistikDocumentScroll() {
    const d = document.documentElement;
    const b = document.body;
    const main = document.querySelector('.main-content');
    if (typeof AndroidApp !== 'undefined') {
        // Flexbox-Layout: html+body overflow hidden, main-content scrollt
        d.style.height = '100%'; d.style.overflow = 'hidden';
        b.style.height = '100%'; b.style.overflow = 'hidden';
        b.style.display = 'flex'; b.style.flexDirection = 'column';
        b.style.touchAction = '';
    } else {
        d.style.overflowY = 'auto';
        d.style.height = 'auto';
        b.style.overflowY = 'auto';
        b.style.height = 'auto';
    }
    if (main && typeof AndroidApp !== 'undefined') {
        main.style.flex = '1 1 auto';
        main.style.overflowY = 'auto';
        main.style.overflowX = 'hidden';
        main.style.minHeight = '0';
        main.style.webkitOverflowScrolling = 'touch';
        main.style.position = 'static';
    }
    // Scroll-blockierende Klassen immer entfernen — unabh. von offenem bottom-sheet
    document.body.classList.remove('logistik-menu-open', 'scroll-lock');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    resetBlockingUi();
}

function initLogistikTouch() {
    setLogistikSheetOpen(false);
    resetBlockingUi();
    if (typeof AndroidApp !== 'undefined') {
        document.documentElement.classList.add('is-android-app');
        document.body.classList.add('is-android-app');
        applyLogistikSafeAreaInsets();
        setTimeout(applyLogistikSafeAreaInsets, 400);
    }
    applyLogistikDocumentScroll();
    setTimeout(() => { resetBlockingUi(); applyLogistikDocumentScroll(); }, 300);
}

function handleAndroidBackPress() {
    const ov = document.querySelector('.overlay.visible');
    if (ov) {
        ov.classList.remove('visible');
        return true;
    }
    const modal = document.getElementById('modal-assign');
    if (modal && modal.classList.contains('visible')) {
        if (typeof closeAssignModal === 'function') closeAssignModal();
        else modal.classList.remove('visible');
        return true;
    }
    if (document.querySelector('.bottom-sheet.open') || (document.getElementById('backdrop')?.style.display === 'block')) {
        closeAllSheets();
        return true;
    }
    return false;
}
window.handleAndroidBackPress = handleAndroidBackPress;

function openSheet(id) {
    setLogistikSheetOpen(true, id);
}

function closeAllSheets() {
    setLogistikSheetOpen(false);
}

function openCloudPanel() {
    renderCloudLog(); updateCloudStatus();
    openSheet('sheet-cloud');
}

function openOv(id) { document.getElementById(id).classList.add('visible'); }
function closeOv(id) { document.getElementById(id).classList.remove('visible'); }

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
    ensureDefaults();
    if (typeof ensureDatenKonsistenz === 'function') ensureDatenKonsistenz(db);
    else if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
    // clean articles
    db.articles = (db.articles || []).filter(a => a && typeof a === 'object');
    const assignedFNrs = new Set(db.articles.map(a => a.fertigNr).filter(Boolean));
    const isNotAssigned = a => !a.fertigNr || !assignedFNrs.has(a.fertigNr);
    db.todo = (db.todo || []).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    db.lose = (db.lose || []).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    db.later = (db.later || []).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    db.hidden = (db.hidden || []).filter(a => a && a.fertigNr && a.name !== undefined && isNotAssigned(a));
    saveDb();
    if (activePage) showPage(activePage);
}

// ── RAW DATA ─────────────────────────────────────────────────
const rawData = [
    {id:"20100",name:"Katenschinken ger. Verschn."},{id:"20101",name:"Kräuterlachsschinken Verschn."},{id:"20102",name:"Lachsschinken Natur Verschn."},{id:"20103",name:"Lachsschinken Grav Art Verschn"},{id:"20104",name:"Serrano Ver mit Interliver"},{id:"20105",name:"Schwarzwälder Schinken Verschn"},{id:"20106",name:"Südtiroler Alpenspeck Verschn."},{id:"20107",name:"Serrano Schinken Kappen"},{id:"20108",name:"Serrano Schinken Wickelpack90g"},{id:"20109",name:"Bel. Rohschinken luft Versch"},
    {id:"20110",name:"Ital Rohschinken ca. 300g Vers"},{id:"20111",name:"Bacon Würfel"},{id:"20112",name:"Katenschinken luft Verschn."},{id:"20113",name:"Pariser Lachsschinken Verschn"},{id:"20114",name:"Bauernschinken Würfel"},{id:"20115",name:"Bacon geräuchert Verschn."},{id:"20116",name:"Eierspeck SB Bacon"},{id:"20117",name:"Serrano Schinken ca.300g"},{id:"20118",name:"Bel. Rohschinken ger Verschnitt"},{id:"20119",name:"Edellachsschinken Verschn."},
    {id:"20120",name:"Edellachsschinken Kappen"},{id:"20121",name:"Putenschinken luft Kappen"},{id:"20122",name:"Putenschinken luft Verschn."},{id:"20123",name:"Serrano-Schinken 100 g Atmos"},{id:"20124",name:"Rohschinken mild geräuchert"},{id:"20125",name:"Wildschweinschinken Verschnitt"},{id:"20126",name:"Lachs Graved Pfeffer Verschnit"},{id:"20127",name:"Bauernschinken ger"},{id:"20128",name:"Westf. Edel-Rohschinken ger"},{id:"20129",name:"Puten Lachsfleisch Verschn."},
    {id:"20130",name:"Serrano Schinken 1/2 Blöcke"},{id:"20131",name:"Westf Edel-Rohschinken luft"},{id:"20132",name:"Schinken Nuss"},{id:"20133",name:"Bauernschinken luft"},{id:"20134",name:"Knochenschinken luft"},{id:"20135",name:"Knochenschinken geräuchert"},{id:"20136",name:"Schwarzwälder Schinken ca. 300g"},{id:"20137",name:"Magerschinken 3% Fett"},{id:"20138",name:"Ital Rohschinken ungl Scheiben"},{id:"20139",name:"Lachsschinken Kappen"},
    {id:"20140",name:"Tiroler Bergschinken ung Schei"},{id:"20141",name:"Bauernschinken ger Kappen"},{id:"20142",name:"Schwarzwälder Kappen"},{id:"20143",name:"Putenlachsschinken Kappen"},{id:"20144",name:"Entenbrust Versch & Kappen"},{id:"20145",name:"Gänsebrust Versch & Kappen"},{id:"20146",name:"Spanisches-Sortiment"},{id:"20147",name:"Italienisches-Sortiment"},{id:"20148",name:"Gewürzschinken ungl"},{id:"20149",name:"Bauernschinken End luft"},
    {id:"20501",name:"Fetter Speck mit Kräuter"},{id:"20502",name:"Fetter Speck geräuchert"},{id:"20503",name:"Fetter Speck mit Paprika"},{id:"20504",name:"Fetter Speck mit Knoblauch"},{id:"20505",name:"Aspik Sortiment Verschn."},{id:"20506",name:"Aspik Sortiment Kappen"},{id:"20507",name:"Hausmacher Sülze Stück"},{id:"20508",name:"Schinkenröllchen Meerrett Vers"},{id:"20509",name:"Hausmacher Leberwurst 200g"},{id:"20510",name:"Zwiebelmettwurst gekocht 200g"},
    {id:"20511",name:"Corned Beef Verschnitt"},{id:"20512",name:"Bauernfrühstück ungl Scheiben"},{id:"20513",name:"Hausmacher Wurstebrei"},{id:"20514",name:"Leberwurst zum braten Scheiben"},{id:"20515",name:"Blutwurst zum braten Scheiben"},{id:"20516",name:"Zungenwurst ungl Scheiben"},{id:"20517",name:"Blutwurst ungl Scheiben"},{id:"20518",name:"Fetter Speck Abschnitte ger B"},{id:"20519",name:"Corned Turkey ungl Scheiben"},{id:"20520",name:"Bauernfrühstück Kappen"},
    {id:"20521",name:"Corned Beef End"},{id:"20522",name:"Zungenwurst End"},{id:"20523",name:"Blutwurst End"},{id:"20524",name:"Kräuterlachs Kappen"},{id:"20525",name:"Schweinezunge Ver"},{id:"20526",name:"Schweinezunge Kap"},{id:"20527",name:"Serrano Ver ohne Interliver"},{id:"30100",name:"Kasseler Verschn."},{id:"30101",name:"Gewürzbraten Kappen"},{id:"30102",name:"Kochschinken Kappen"},
    {id:"30103",name:"Kochschinken Verschn."},{id:"30104",name:"Geflügel Ansch/Kapp sortiert"},{id:"30105",name:"Schinkenbraten Verschn."},{id:"30106",name:"Gewürzbraten Natur 100g"},{id:"30107",name:"Kasseler Kappen"},{id:"30108",name:"Spanferkelbraten Verschn."},{id:"30109",name:"Spanferkelbraten Kappen"},{id:"30110",name:"Schinkenbraten Kappen"},{id:"30111",name:"Schweinebraten Verschn."},{id:"30112",name:"Schweinebraten Kappen"},
    {id:"30113",name:"Krustenbraten Verschn."},{id:"30114",name:"Pastirma Verschn."},{id:"30115",name:"Krustenbraten Kappen"},{id:"30116",name:"Gewürzbraten Verschn."},{id:"30117",name:"Kasseler vom Kotelett Kappen"},{id:"30118",name:"Katenbauch Verschn."},{id:"30119",name:"Leberkäse fein Verschn."},{id:"30120",name:"Bockwurst im Naturdarm"},{id:"30121",name:"Wiener Würstchen"},{id:"30122",name:"Leberkåse grob Verschn."},
    {id:"30123",name:"Brühwurst Sch Atmos Verschn"},{id:"30124",name:"Aufschnitt Sortiment Verschn."},{id:"30125",name:"Leberkäse fein Kappen"},{id:"30126",name:"Brühwurst Geflügel Ver Atmos"},{id:"30127",name:"Nürnberger Rostbratwürstchen"},{id:"30128",name:"Leberkäse grob Kappen"},{id:"30129",name:"Wiener Mini Geflügel VAC"},{id:"30130",name:"Wiener Mini Schwein VAC"},{id:"30131",name:"Rinder-Saftfleisch Verschn."},{id:"30132",name:"Rinder-Saftfleisch Kappen"},
    {id:"30133",name:"Putenbrust Kappen"},{id:"30134",name:"Hähnchenbrust-Stücke gebraten"},{id:"30135",name:"Hähnchenbrust gegart Verschn."},{id:"30136",name:"Putenbrust Verschn."},{id:"30137",name:"Hähnchenbrust Kappen"},{id:"30138",name:"Hähnchengrillbrust Verschn."},{id:"30139",name:"Kasseler Nacken, Verschnitt"},{id:"30140",name:"Kasseler-Nacken Stücke"},{id:"30141",name:"Kasseler Lachsbraten"},{id:"30142",name:"Kasseler Minutensteaks"},
    {id:"30143",name:"Wiener Geflügel unsortiert"},{id:"30144",name:"Kochschinken 200g England"},{id:"30145",name:"Fleischwurst"},{id:"30146",name:"Roast Chicken ungl. Scheiben"},{id:"30147",name:"Roast Turkey ungl. Scheiben"},{id:"30148",name:"Rinder Pastrami Verschnitte"},{id:"30149",name:"Rinder Pastrami Endstücke"},{id:"30150",name:"Spanferkelpastete ung Scheiben"},{id:"30151",name:"Spanferkelpastete Kappen"},{id:"30152",name:"Geflügelfilet Roulade"},
    {id:"30153",name:"Pastirma Kappen"},{id:"30154",name:"Krustenbauch Verschnitt"},{id:"30155",name:"Kochschinken Sch ungl Vac"},{id:"30156",name:"Leberkåse Gefl ungl Scheiben"},{id:"30157",name:"Leberkåse Geflügel End."},{id:"30158",name:"Brühwurst-Pastete"},{id:"30159",name:"Frischwurst Ansch/Kap sortiert"},{id:"30160",name:"Leberrolle ungl Scheiben"},{id:"30161",name:"Wiener Mini Käåse/Pap ungl"},{id:"30162",name:"Rindswürstchen ungl"},
    {id:"30163",name:"Katenbauch Kappen"},{id:"30164",name:"Krustenbauch Kappen"},{id:"30165",name:"Gänsebrust geback Verschnitt"},{id:"30166",name:"Entenbrust geback Verschnitt"},{id:"30167",name:"Backhendl Verschnitt"},{id:"30168",name:"Entenbrust geb Kappen"},{id:"30169",name:"Gänsebrust geb Kappen"},{id:"30170",name:"Mini Wiener Mix Spanien"},{id:"30171",name:"Kochschinken Sch Ribo"},{id:"30172",name:"Kochschinken Dienstleistung"},
    {id:"30173",name:"Käse-Krainer"},{id:"30174",name:"Backhendl End"},{id:"30175",name:"Kochschinken End Ribo"},{id:"30176",name:"Putenbrust ungl Sch Spanien"},{id:"30177",name:"Debreziner"},{id:"30178",name:"Wiener mit Käse"},{id:"30179",name:"Roast Chicken Eck"},{id:"30180",name:"Roast Turky End"},{id:"30181",name:"Schinkenbraten am Stück"},{id:"30182",name:"Grill-Bauernschinken"},
    {id:"40100",name:"Bio Salami"},{id:"50096",name:"Pfefferbeißer Kugeln"},{id:"50097",name:"Salami Peitschen geraucht"},{id:"50098",name:"Salami Pur Porc"},{id:"50099",name:"Salami Kugeln"},{id:"50100",name:"Pfefferbeiser"},{id:"50101",name:"Snack Salami 250g"},{id:"50102",name:"Elbwürmer Pfferbeiser Art"},{id:"50103",name:"Salami diverse Sorten"},{id:"50104",name:"Mettwurst Verschn."},
    {id:"50105",name:"Salami Kappen 500g"},{id:"50106",name:"Salami Verschn."},{id:"50107",name:"Salami Verschn. Vac"},{id:"50108",name:"Mettenden geräuchert"},{id:"50109",name:"Edelsalami Verschn."},{id:"50110",name:"Salami Sticks"},{id:"50111",name:"Salchichon Fuet 175g"},{id:"50112",name:"Rostbratwurst Schwein 5/100g"},{id:"50113",name:"Rostbratwurst Geflügel 5/100g"},{id:"50114",name:"Hähnchenfilet Curry"},
    {id:"50115",name:"Hähnchenfilet Paprika"},{id:"50116",name:"Nackensteaks Paprika"},{id:"50117",name:"Nackensteaks Kräuter"},{id:"50118",name:"Rückensteaks Paprika"},{id:"50119",name:"Rückensteaks Kräuter"},{id:"50120",name:"Spare Ribs Texas"},{id:"50121",name:"Bauchscheiben Texas"},{id:"50122",name:"Grillfackeln"},{id:"50123",name:"Nackensteaks"},{id:"50124",name:"Kotelett-Anschnitte"},
    {id:"50125",name:"Bauch Anschnitte"},{id:"50126",name:"Rostbratwurst divers"},{id:"50127",name:"Suzcuk 240 g"},{id:"50128",name:"Mini Kabanossi"},{id:"50129",name:"Salami Endstücke Verarbeitung"},{id:"50130",name:"Salami Sortenrein"},{id:"50131",name:"Salami Gef/Rind Schei/Kap"},{id:"50132",name:"Edelsalami am Stück"},{id:"50133",name:"Grillfleisch Rind TK"},{id:"50134",name:"Grillfleisch Rind"},
    {id:"50135",name:"Fingerfood TK"},{id:"50136",name:"Weißwurst ungleich"},{id:"50137",name:"Hähnchenbrust Kräuter"},{id:"50138",name:"Nackensteaks Holzfäller"},{id:"50139",name:"Nackensteaks Gyros"},{id:"50140",name:"Nackensteaks Zagreb"},{id:"50141",name:"Hähnchenoberkeulensteaks Pap"},{id:"50142",name:"Hähnchenoberkeulensteaks"},{id:"50143",name:"Hähnchenoberkeulensteaks"},{id:"50144",name:"Hähnchen Minifackel rot"},
    {id:"50145",name:"Hähnchen Minifackeln gelb"},{id:"50146",name:"Puten Minifackeln rot"},{id:"50147",name:"Puten Minifackeln gelb"},{id:"50148",name:"Puten Brustspieße"},{id:"50149",name:"Krakauer Schwein"},{id:"50150",name:"Krakauer mit Käse Schwein"},{id:"50151",name:"Weißkraut mit Dill"},{id:"50152",name:"Farmer Salat"},{id:"50153",name:"Gurkensalat"},{id:"50154",name:"Bohnen Salat"},
    {id:"50155",name:"Weißkraut Natur"},{id:"50156",name:"Kartoffelsalat"},{id:"50157",name:"Tortelini Mandarinen Salat"},{id:"50158",name:"Kohlrabi Gurken Salat"},{id:"50159",name:"Coleshaw Salat"},{id:"50160",name:"Nudelsalat"},{id:"50161",name:"Tyrolini"},{id:"50162",name:"Salami am Stück Z"},{id:"50163",name:"Chorizo zum Grillen u Braten"},{id:"50164",name:"Stracke"},
    {id:"50165",name:"Bratwurstschnecken"},{id:"50166",name:"Pur Porc"},{id:"50167",name:"Kabanossi ungl"},{id:"50168",name:"Glas-Ware 200g"},{id:"50169",name:"Salami am Stück R"},{id:"50170",name:"Kaminwurzen Rohw. gemischt"},{id:"50171",name:"Salami Scheiben ungl Sopo"},{id:"50172",name:"Salami Scheiben Schwein Sopo"},{id:"50173",name:"Nacken mariniert"},{id:"50174",name:"Rücken mariniert"},
    {id:"50175",name:"Hüfte mariniert"},{id:"50176",name:"Bauch mariniert"},{id:"50500",name:"Puten Oberkeule Hahn SB"},{id:"50501",name:"Puten Unterkeule Hahn Vac"},{id:"50502",name:"Puten Flügel Hahn Vac"},{id:"50503",name:"Puten Hålse Hahn Vac"},{id:"50504",name:"Puten Herzen Vac"},{id:"50505",name:"Puten Magen Vac"},{id:"50506",name:"Puten Leber Vac"},{id:"50507",name:"Frischfleisch vom Schwein"},
    {id:"50508",name:"Frischfleisch vom Rind"},{id:"70400",name:"Sonderproduktion kg"},{id:"70401",name:"Sonderposten Pack groß"},{id:"70402",name:"Zimbo kurz MHD"},{id:"70403",name:"Zimbo lang MHD"},{id:"70404",name:"Discount kurz MHD"},{id:"70405",name:"Discount lang MHD"},{id:"70406",name:"Sonderposten ohne MwSt"},{id:"70407",name:"Sonderposten 19%"},{id:"70500",name:"Sonderproduktion Stück"},
    {id:"70561",name:"Bacon Endstücke lose"},{id:"70562",name:"Leberrolle Scheiben lose"},{id:"70563",name:"Entenbrust gebacken Schei lose"},{id:"70564",name:"Gänsebrust gebacken Schei lose"},{id:"70565",name:"Lachsschinken Kappen lose"},{id:"70566",name:"Kochschinken Dienstl lose"},{id:"70590",name:"Salami Sticks lose"},{id:"70602",name:"Wiener Mini Käse/Pap lose"},{id:"70603",name:"Krustenbauch End lose"},{id:"70613",name:"Schinkenbraten Scheiben lose"},
    {id:"70620",name:"Rohschinken Bel. luft Sch lose"},{id:"70642",name:"Leberkäse Mini fein Schei lose"},{id:"70643",name:"Brühwurst Kappen lose"},{id:"70700",name:"Salami Scheiben lose"},{id:"70701",name:"Kasseler Scheiben lose"},{id:"70702",name:"Kräuterlachsschinken Scheiben"},{id:"70703",name:"Pfefferbeisser lose"},{id:"70704",name:"Pastirma Scheiben lose"},{id:"70705",name:"Katenbauch End lose"},{id:"70706",name:"Serrano Endkappen lose"},
    {id:"70707",name:"Hähnchenbrust End gebraten los"},{id:"70708",name:"Schinkenröllchen Scheiben lose"},{id:"70709",name:"Putenbrust Scheiben lose"},{id:"70710",name:"Lachsschinken Natur lose"},{id:"70711",name:"Katenschinken luft Schei lose"},{id:"70712",name:"Schweinebraten Scheiben lose"},{id:"70714",name:"Hähnchenbrust Scheiben lose"},{id:"70715",name:"Gewürzbraten Ecken lose"},{id:"70716",name:"Gewürzbraten Scheiben lose"},{id:"70717",name:"Wiener Würstchen lose"},
    {id:"70718",name:"Bratwurst Schwein lose"},{id:"70719",name:"Katenbauch Sch lose"},{id:"70721",name:"Serrano mit Interliver lose"},{id:"70722",name:"Putenbrust Ecken lose"},{id:"70723",name:"Hähnchenbrust Ecken lose"},{id:"70724",name:"Schweinebraten Eck lose"},{id:"70725",name:"Schinkenbraten Ecken lose"},{id:"70726",name:"Krustenbraten Scheiben lose"},{id:"70727",name:"Krustenbraten Ecken lose"},{id:"70728",name:"Brühwurst Gefl lose"},
    {id:"70729",name:"Brühwurst Schwein Schei lose"},{id:"70730",name:"Kochschinken Scheiben lose"},{id:"70731",name:"Kochschinken Ecken lose"},{id:"70732",name:"Leberkåse fein Schei lose"},{id:"70733",name:"Leberkåse fein Ecken lose"},{id:"70734",name:"Leberkåse grob Schei lose"},{id:"70735",name:"Leberkåse grob Ecken lose"},{id:"70736",name:"Salami Ecken lose"},{id:"70737",name:"Bacon Scheiben lose"},{id:"70738",name:"Kasseler Ecken lose"},
    {id:"70739",name:"Wiener Gefl lose"},{id:"70740",name:"Weißwurst lose"},{id:"70741",name:"Bratwurst Gefl lose"},{id:"70743",name:"Leberkåse Mini grob Schei lose"},{id:"70744",name:"Edellachs scheiben lose"},{id:"70745",name:"Salami Sticks lose"},{id:"70746",name:"Kasseler-End Kotelett lose"},{id:"70747",name:"Emswürmer lose"},{id:"70748",name:"Mettenden geraucht lose"},{id:"70749",name:"Nürnberger Rostbratwurst lose"},
    {id:"70750",name:"Wiener Mini Gefl lose"},{id:"70751",name:"Wiener Mini Schwein lose"},{id:"70752",name:"Putenlachs End lose"},{id:"70753",name:"Kochschinken W Sch Export"},{id:"70754",name:"Bockwurst lose"},{id:"70755",name:"Spanferkelbraten Scheiben lose"},{id:"70756",name:"Spanferkelbraten Ecken lose"},{id:"70757",name:"Hähnchengrillbrust Schei lose"},{id:"70758",name:"Rindswürstchen lose"},{id:"70759",name:"Rinder-Saftfleisch Scheib lose"},
    {id:"70760",name:"Rinder-Saftfleisch Ecken lose"},{id:"70761",name:"Edellachs End lose"},{id:"70762",name:"Edelsalami Scheiben lose"},{id:"70763",name:"Rohschinken Bel. ger lose"},{id:"70764",name:"Kasseler Kotelett lose"},{id:"70765",name:"Kasseler-Nacken lose"},{id:"70766",name:"Lachsbraten lose"},{id:"70767",name:"Kasseler Minutensteaks lose"},{id:"70768",name:"Schwarzwälder Schinken lose"},{id:"70769",name:"Wildschweinschinken lose"},
    {id:"70770",name:"Grillfackeln lose"},{id:"70771",name:"Bauernschinken ger lose"},{id:"70772",name:"Putenschinken luft lose E2"},{id:"70773",name:"Puten Lachsfleisch"},{id:"70774",name:"Mini Kabanossi lose"},{id:"70775",name:"Fleischwurst im Ring lose"},{id:"70776",name:"Magerschinken"},{id:"70777",name:"Roast Chicken Scheiben lose"},{id:"70778",name:"Roast Turkey Scheiben lose"},{id:"70779",name:"Rinder-Pastrami Schei lose"},
    {id:"70780",name:"Rinder Pastrami End lose"},{id:"70781",name:"Bauernschinken luft lose"},{id:"70782",name:"Schwarzwälder End lose"},{id:"70783",name:"Corned Beef"},{id:"70784",name:"Bauch Anschnitte lose"},{id:"70785",name:"Aspik Scheiben lose"},{id:"70786",name:"Bauernfrühstück Scheiben lose"},{id:"70787",name:"Spanferkelpastete Schei lose"},{id:"70788",name:"Spanferkelpastete Kap lose"},{id:"70789",name:"Mettwurst lose E2"},
    {id:"70790",name:"Salami Gef/Rind Sch/Kap Bille"},{id:"70791",name:"Backhendl Scheiben lose"},{id:"70792",name:"Geflügelfilet Rou Schei lose"},{id:"70793",name:"Pastirma Kappen lose"},{id:"70794",name:"Grillfleisch Schwein lose"},{id:"70795",name:"Grillfleisch Rind lose"},{id:"70796",name:"Frischfleisch Schwein lose"},{id:"70797",name:"Frischfleisch Rind lose"},{id:"70798",name:"Entenbrust geb Kappen lose"},{id:"70799",name:"Salami Scheiben Export lose"},
    {id:"70800",name:"Brötchen zum aufbacken lose"},{id:"70801",name:"Gänsebrust geb Kappen lose"},{id:"70802",name:"Bratwurstschnecke lose"},{id:"70803",name:"Kochschinken Könecke 3 lose"},{id:"70804",name:"Kochschinken Könecke 4 lose"},{id:"70805",name:"Krustenbraten lose Könecke 5"},{id:"70806",name:"Putenbrust Scheiben Exp lose"},{id:"70807",name:"Hähnchenbrust Sch Exp lose"},{id:"70808",name:"Schweinebraten Sch Exp lose"},{id:"70809",name:"Hähnchenbrust End Exp lose"},
    {id:"70810",name:"Putenbrust End Exp lose"},{id:"70811",name:"Krustenbauch lose"},{id:"70812",name:"Geflügelfilet-Roul End"},{id:"70813",name:"Kochschinken Sch Mett Ex lose"},{id:"70814",name:"Kochschinken End Mett Exp lose"},{id:"70815",name:"Kochsch Kräuter Köneke lose Ex"},{id:"70816",name:"Kochsch Sch Pfeffer Köneke Ex"},{id:"70817",name:"Blutwurst Scheiben lose"},{id:"70818",name:"Zungenwurst Scheiben lose"},{id:"70819",name:"Aspik Kappen"},
    {id:"70820",name:"Hähnchen Kräuter Sch Nölke los"},{id:"70821",name:"Hähnchen Pap Sch Nölke lose"},{id:"70822",name:"Roast Turkey End lose"},{id:"70823",name:"Roast Chicken End lose"},{id:"70824",name:"Tiroler Bergschinken lose"},{id:"70825",name:"Rohschinken End/Würfel lose"},{id:"70826",name:"Leberkåse Gef Sch lose"},{id:"70827",name:"Leberkåse Gefl End lose"},{id:"70828",name:"Corned Turkey Scheiben lose"},{id:"70829",name:"Brühwurst Pastete lose"},
    {id:"70830",name:"Bauernfrühstück Kappen lose"},{id:"70831",name:"Salami Kugeln lose"},{id:"70832",name:"Bauernschinken Kappen lose"},{id:"70833",name:"Backhendl End lose"},{id:"70834",name:"Pur Porc lose"},{id:"70835",name:"Blutwurst End lose"},{id:"70836",name:"Zungenwurst End lose"},{id:"70837",name:"Corned Beef End lose"},{id:"70838",name:"Käse End lose"},{id:"70839",name:"Käse Scheiben lose"},
    {id:"70840",name:"Gewürzschinken lose"},{id:"70842",name:"Lachsschinken Grav Pf lose"},{id:"70844",name:"Nuss- Schinken lose"},{id:"70845",name:"Entenbrust lose"},{id:"70846",name:"Gänsebrust lose"},{id:"70848",name:"Debreziner lose"},{id:"70849",name:"Wiener mit Käse lose"},{id:"70850",name:"Kräuterlachsschinken Eck lose"},{id:"70851",name:"Pariser Lachschinken lose"},{id:"70852",name:"Lachsschinken Graved lose"},
    {id:"70853",name:"Kaminwurzen lose"},{id:"70854",name:"Schweinezunge Sch lose"},{id:"70855",name:"Schweinezunge Kap lose"},{id:"70856",name:"Sonderproduktion lose"},{id:"70857",name:"Krakauer lose"},{id:"70858",name:"Kabanossi lose"},{id:"70859",name:"Serrano ohne Interliver lose"},{id:"70860",name:"Salami Sch lose Sopo"},{id:"70861",name:"Salami Sch Schwein lose Sopo"},{id:"70862",name:"Bauernschinken Kap luft lose"},
    {id:"80075",name:"Kochschinken Sch EX Ribo"},{id:"80076",name:"Kochschinken End Willms EX"},{id:"80077",name:"Kochschinken Sch Willms EX"},{id:"80078",name:"Hinterschinken Sch/EnPon Ex"},{id:"80079",name:"Prosciutto Cotto Sch/En Pon Ex"},{id:"80080",name:"Hinterschinken Sch/En Pon Ex"},{id:"80081",name:"Hähnchenbrust Kräuter Pon Ex"},{id:"80083",name:"Kochschinken Chi Sch/En Pon Ex"},{id:"80084",name:"Hähnchenbrust Pap Pon EX"},{id:"80085",name:"Kochschinken Tom Sch/En Pon Ex"},
    {id:"80086",name:"Hähnchenbrust geraucht Pon Ex"},{id:"80087",name:"Hähnchenbrust Curry Pon Ex"},{id:"80088",name:"Kochschinken Krä Sch/En Pon Ex"},{id:"80089",name:"Kochschinken Med Sch/En Pon Ex"},{id:"80090",name:"Hähnchenbrust Pap Pon Ex"},{id:"80091",name:"Hähnchenbrust Pon Ex"},{id:"80092",name:"Kochschinken ger Sch/En Pon Ex"},{id:"80093",name:"Hähnchenroulade frit Pon Ex"},{id:"80094",name:"Hähnchenfiletroulade Pon Ex"},{id:"80095",name:"Krustenbraten Sch/End Pon Ex"},
    {id:"80096",name:"Putenbrust Sch/End Ponn EX"},{id:"80097",name:"Putenbrust Pap Sch/End Pon Ex"},{id:"80098",name:"Putenbrustroulade Pon Ex"},{id:"80099",name:"Schinkenbraten Sch/End Pon EX"},{id:"80100",name:"Kochschinken Ex Sch/Eck Vers"},{id:"80101",name:"Kochschinken Wolf Ex Verschn."},{id:"80102",name:"Kochschinken Tillmans Ex Vers"},{id:"80103",name:"Kochschinken Eck W Ex Verschn."},{id:"80104",name:"Pute Metten Export Scheiben"},{id:"80105",name:"Salami Scheiben Export"},
    {id:"80106",name:"Kasseler Scheiben ca.5 kg"},{id:"80107",name:"Kochschinken Sch Gu. Export"},{id:"80108",name:"Kochschinken Sch Ex Könecke"},{id:"80109",name:"Salami End Export"},{id:"80110",name:"Krustenbraten Schei Wolf Exp."},{id:"80111",name:"Kochschinken Könecke 1"},{id:"80112",name:"Kochschinken Könecke 2"},{id:"80113",name:"Kochschinken Könecke 3"},{id:"80114",name:"Gewürzbraten Sch Könecke 4"},{id:"80115",name:"Krustenbraten Könecke 5"},
    {id:"80116",name:"Hähnchen Metten Expo Scheiben"},{id:"80117",name:"Schweinebraten Kupfer Exp Vers"},{id:"80118",name:"Hähnchen Metten Export Endst."},{id:"80119",name:"Putenbrust Metten Export Endst"},{id:"80120",name:"Puten Scheiben Export Könecke"},{id:"80121",name:"Hähnchen Scheiben Expo Könecke"},{id:"80122",name:"Hähnchen Endst Export Könecke"},{id:"80123",name:"Puten Endst Export Könecke"},{id:"80124",name:"Pute Scheiben Export"},{id:"80125",name:"Geflügelfilet-Roul Sch Export"},
    {id:"80126",name:"Geflügelfilet-Rou Endst Export"},{id:"80127",name:"Roast Chicken Sch Export Nölke"},{id:"80128",name:"Roast Turkey Sch Export"},{id:"80129",name:"Gewürzbraten End Export WKS"},{id:"80130",name:"Hähnchenbrust Sch Nölke Exp"},{id:"80131",name:"Schweinebraten Sch Hein Export"},{id:"80132",name:"Schweinebraten End Hein Export"},{id:"80133",name:"Hähnchenbrust Sch Hein Export"},{id:"80134",name:"Hähnchenbrust End Hein Export"},{id:"80135",name:"Kochschinken Sch Hein Export"},
    {id:"80136",name:"Kochschinken End Hein Export"},{id:"80137",name:"Putenbrust Sch Hein Export"},{id:"80138",name:"Putenbrust End Hein Export"},{id:"80139",name:"Kochschinken Sch Metten Export"},{id:"80140",name:"Kochschinken End Metten Export"},{id:"80141",name:"Kochsch Kräuter Sch Köneke Ex"},{id:"80142",name:"Kochsch Sch Pfeffer Köneke Ex"},{id:"80143",name:"Kochsch Sch Pfeffer Hein Ex"},{id:"80144",name:"Kochsch End Pfeffer Hein Ex"},{id:"80145",name:"Pute Pap Sch Hein Ex"},
    {id:"80146",name:"Pute Pap End Hein Ex"},{id:"80147",name:"Hähnchen Sch Kräuter Nölke Ex"},{id:"80148",name:"Hähnchen Pap Sch Nölke"},{id:"80149",name:"Schwarzwälder Schinken Export"},{id:"80150",name:"Bauchspeck Scheiben Export"},{id:"80151",name:"Roast Turkey End Export Nölke"},{id:"80152",name:"Roast Chicken End Export Nölke"},{id:"80153",name:"Kochschinken End Gusto Export"},{id:"80154",name:"Hähnchen Sch Schw Cranz Export"},{id:"80155",name:"Pute Sch Schw Cranz Export"},
    {id:"80156",name:"Putenbrust End Exp Schwarz Cr"},{id:"80157",name:"Hähnchenbrust End Ex Schwarz C"},{id:"80158",name:"Krustenbraten End Ex Metten"},{id:"80159",name:"Krustenbraten End Ex Wolf"},{id:"80160",name:"Schweinebraten Sch Könecke EX"},{id:"80161",name:"Geflügel Scheib Ex Lutz"},{id:"80162",name:"Geflügel Paprik Sch Ex Lutz"},{id:"80163",name:"Putenbrust Sch ger EX Nölke"},{id:"80164",name:"Putenbrust End ger EX Nölke"},{id:"80165",name:"Gewürzbraten Sch WKS Export"},
    {id:"80166",name:"Krustenbraten Sch Metten Ex"},{id:"80167",name:"Pute frittiert End Nölke Ex"},{id:"80168",name:"Hähnchen Curry Sch Nölke"},{id:"80169",name:"Hähnchen End Natur Nölke Ex"},{id:"80170",name:"Hähnchen End Kräut Nölke Ex"},{id:"80171",name:"Hähnchen End Pap Nölke Ex"},{id:"80172",name:"Backhendl Sch Nölke Ex"},{id:"80173",name:"Backhendl End Nölke Ex"},{id:"80174",name:"Putenbrust Pap Sch Nölke Ex"},{id:"80175",name:"Putenbrust Pap End Nölke Ex"},
    {id:"80176",name:"Schinkenbr End Könecke Ex"},{id:"80177",name:"Kasseler End Kõnecke Ex"},{id:"80178",name:"Hinterschinken Sch Wolf Ex"},{id:"80179",name:"Puten Sch gegrillt Hein Ex"},{id:"80180",name:"Puten End gegrillt Hein Ex"},{id:"80181",name:"Hähnch Man/Curry Sch Nölke"},{id:"80182",name:"Hähn Man/Cur End Nölke"},{id:"80183",name:"Kasseler Sch Köneke Ex"},{id:"80184",name:"Kochschinken Schei Eggel Ex"},{id:"80185",name:"Putenbrust Schei Eggel EX"},
    {id:"80186",name:"Hähnchen Sch gebacken Köneke"},{id:"80187",name:"Hähnchen End gebacken Köneke"},{id:"80188",name:"Puten Sch gebacken Köneke"},{id:"80189",name:"Puten End gebacken Köneke"},{id:"80190",name:"Kochschinken Sch geraucht Hein"},{id:"80191",name:"Kochschinken End geraucht Hein"},{id:"80192",name:"Kasseler Sch Ex Zimbo"},{id:"80194",name:"Putenbrust Sch EX Zimbo"},{id:"80195",name:"Putenbrust End EX Zimbo"},{id:"80196",name:"Pute Curry Sch Nölke"},
    {id:"80197",name:"Pute Kräuter Sch Nölke"},{id:"80198",name:"Schinkenbr Kräu End Könecke EX"},{id:"80199",name:"Schinkenbr Pfef End Könecke Ex"},{id:"80200",name:"Truthahnbrustfilet ofenge Nr.2"},{id:"80201",name:"Truthahnbrustfilet ofenge Nr.1"},{id:"80202",name:"Truthahnbrust mit Paprika"},{id:"80203",name:"Truthahnbrust geraucht"},{id:"80204",name:"Geflügelfleischwurst Spanien"},{id:"80205",name:"Truthahnbrustfilet"},{id:"80206",name:"Putenbrust Bauerin"},
    {id:"80207",name:"Schnitzel TK"},{id:"80300",name:"Kochschinken versch Ex CZ"},{id:"80301",name:"Pute Ecken Curry Nölke"},{id:"80302",name:"Pute Ecken Kräuter Nölke"},{id:"80303",name:"Hähnchen Eck Curry Nölke"},{id:"80304",name:"Schinkenbr Sch Krä Willms EX"},{id:"80305",name:"Schinkenbr Krå End Willms EX"},{id:"80306",name:"Schinkenbr Pap Sch Willms EX"},{id:"80307",name:"Schinkenbr Pap End Willms EX"},{id:"80308",name:"Schinkenbr Sch Pf Willms EX"},
    {id:"80309",name:"Schinkenbr Pfe End Willms EX"},{id:"80310",name:"Kustenbra Sch Willms EX"},{id:"80311",name:"Krustenbra End Willms EX"},{id:"80312",name:"Kasseler Sch Willms EX"},{id:"80313",name:"Kochschinken End Könecke EX"},{id:"80314",name:"Krustenbra End Könecke EX"},{id:"80315",name:"Kochschinken Sch/End TFB EX"},{id:"80316",name:"Putenbrust Sch/End TFB EX"},{id:"80317",name:"Hähnchenbrust Sch/End TFB EX"},{id:"80318",name:"Schinkenbr End Natur Willms EX"},
    {id:"80319",name:"Pute ger Boui Sch/End Herta EX"},{id:"80320",name:"Pute Boul Sch/End Herta EX"},{id:"80321",name:"Pute Boui Honig Sch/End Herta"},{id:"80322",name:"Kochsch gegrillt Sch/End Herta"},{id:"80323",name:"Kochschi Pfeffer Sch/End Herta"},{id:"80324",name:"Koch gegrillt Sch/End Herta"},{id:"80325",name:"Koch Ahorn Sch/End Herta"},{id:"80326",name:"Hähnchen Prov. Sch/End TFB EX"},{id:"80327",name:"Schinkenbr Sch Nat Willms EX"},{id:"80328",name:"Kasseler Eck Willms EX"},
    {id:"80329",name:"Kass-Zuschn Rümke EX"},{id:"80330",name:"Hähnch-Zuschnitte Rümke EX"},{id:"80331",name:"Putenb-Zuschn Rümke EX"},{id:"80332",name:"Schinkenb-Zuschn Rümke EX"},{id:"80333",name:"Hähn Boui Sch/End geba Herta"},{id:"80334",name:"Hähn Sch/End Boui ger Herta EX"},{id:"80335",name:"Curry Herta Sch/End Boui Hähn"},{id:"80336",name:"Hähn Sch/End Boui gega Herta"},{id:"80337",name:"Hähn Sch/End Honih Herta"},{id:"80338",name:"Pute Sch/End 408 Sauels"},
    {id:"80339",name:"Hähn Sch/End 394 Sauels"},{id:"80340",name:"Hähn geb Sch Rewe"},{id:"80341",name:"Hähn Curry Sch Rewe"},{id:"80342",name:"Hähn geb Sch Rewe"},{id:"80343",name:"Hähn Pap Sch Rewe"},{id:"80344",name:"Pute geb Sch Rewe"},{id:"80345",name:"Pute geb Sch Rewe"},{id:"80346",name:"Koch ger Sch/End TFB"},{id:"80347",name:"Hähn gebacken End Rewe"},{id:"80348",name:"Hähn Curry End Rewe"},
    {id:"80349",name:"Hähn geb End Rewe"},{id:"80350",name:"Hähn Paprika End Rewe"},{id:"80351",name:"Puten geb End Rewe"},{id:"80352",name:"Puten gebacken End Rewe"},{id:"80353",name:"Rinder-Saft ger Sch Willms"},{id:"80354",name:"Rinder-Saft ger End Willms"},{id:"80355",name:"Rinder.Saft Pfeffer Sch Willms"},{id:"80356",name:"Rinder-Saft Pfeffer End Willms"},{id:"80357",name:"Kochsch vier Sch Suhl"},{id:"80358",name:"Kochsch vier End Suhl"},
    {id:"80359",name:"Hähnch Curry Sch/End TFB EX"},{id:"80360",name:"Hähnch Paprika Sch/End TFB EX"},{id:"80361",name:"Hähnch Sch/End Chili Herta EX"},{id:"80362",name:"Krustenbraten Sch Suhl"},{id:"80363",name:"Krustenbraten End Suhl"},{id:"80364",name:"Kochschinken Sch Suhl"},{id:"80365",name:"Kochschinken End Suhl"},{id:"80366",name:"Schinkenbraten Sch Suhl"},{id:"80367",name:"Schinkenbraten End Suhl"},{id:"80368",name:"Putenbrust Sch Suhl"},
    {id:"80369",name:"Putenbrust End Suhl"},{id:"80370",name:"Pastrami Gew/ger Sch Willms"},{id:"80371",name:"Pastrami Gew/ger End Willms"},{id:"80372",name:"Kochsch geg salzr Sch/En Herta"},{id:"80373",name:"Kochsch Honig ger Sch/En Herta"},{id:"80374",name:"Kochsch gegart Sch/End Herta"},{id:"80375",name:"Kochsch gegrillt Sch/End Herta"},{id:"80376",name:"Hähn Boul Prov Sch/End Herta"},{id:"80377",name:"Hähn Boul BBQ Sch/End Herta"},{id:"80378",name:"Pute Sch frittiert EX Nölke"},
    {id:"80379",name:"Putenbrust Sch/End Pon"},{id:"80380",name:"Hähnchenbrust Sch/End Pon"},{id:"80381",name:"Pute mit Honig Sch/End Pon"},{id:"80382",name:"Kochsch Pfeff Sch/End Pon"},{id:"80383",name:"Kochschinken mit Bratenr TFB"},{id:"80384",name:"Hähnch mit Bratenrand TFB"},{id:"80385",name:"Pute mit Bratenrand TFB"},{id:"80386",name:"Kasseler Pfeffer Willms"},{id:"80387",name:"Pute Cury Sch/End Po EX"},{id:"80388",name:"Hähnch Pap Sch/End Po EX"},
    {id:"80389",name:"Hähn Pap geb Sch/End Po EX"},{id:"80390",name:"Kochschinken Olive Sch/End"},{id:"80391",name:"Hähnch geb Sch/End Po EX"},{id:"90100",name:"Gouda Scheiben 400g"},{id:"90101",name:"Edamer Scheiben 400g"},{id:"90102",name:"Tilsiter Scheiben 400g"},{id:"90103",name:"Butterkåse Scheiben 400g"}
];

// ── WINDOW LOAD ───────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // PIN-Check bei Rückkehr aus Hintergrund
    if (!isLogistikPinValid()) {
        showLogistikPinOverlay(() => {
            document.body.style.overflow = '';
            resetBlockingUi();
            applyLogistikDocumentScroll();
        });
        return;
    }
    resetBlockingUi();
    applyLogistikDocumentScroll();
    if (typeof refreshSortierFromKombi === 'function') refreshSortierFromKombi();
    if (activePage === 'erfassung' && typeof renderErfassung === 'function') renderErfassung();
});

document.addEventListener('DOMContentLoaded', () => initLogistikTouch(), { once: true });

// ── PIN-SCHUTZ ───────────────────────────────────────────────
const LOGISTIK_PIN_KEY = 'logistik_chef_auth';
const LOGISTIK_PIN_CODE = '3132';
const LOGISTIK_PIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 Minuten

function isLogistikPinValid() {
    try {
        const ts = parseInt(localStorage.getItem(LOGISTIK_PIN_KEY) || '0', 10);
        return ts > 0 && (Date.now() - ts) < LOGISTIK_PIN_TIMEOUT_MS;
    } catch (_) { return false; }
}

function showLogistikPinOverlay(onSuccess) {
    let overlay = document.getElementById('logistik-pin-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'logistik-pin-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:#1a1a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:32px 28px;width:300px;max-width:90vw;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.4);">
                <div style="font-size:40px;margin-bottom:8px;">🔒</div>
                <h2 style="margin:0 0 6px;font-size:20px;color:#1a1a2e;">Tresch Logistik</h2>
                <p style="margin:0 0 20px;font-size:13px;color:#666;">Bitte PIN eingeben</p>
                <input id="logistik-pin-input" type="password" inputmode="numeric" maxlength="10"
                    style="width:100%;box-sizing:border-box;padding:12px;font-size:22px;text-align:center;border:2px solid #ddd;border-radius:8px;outline:none;letter-spacing:6px;"
                    placeholder="• • • •">
                <div id="logistik-pin-error" style="color:#e53935;font-size:13px;min-height:20px;margin:8px 0;"></div>
                <button onclick="checkLogistikPin()"
                    style="width:100%;padding:14px;background:#1976d2;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;">
                    Entsperren
                </button>
            </div>`;
        document.body.appendChild(overlay);
        const inp = overlay.querySelector('#logistik-pin-input');
        inp.addEventListener('keyup', e => { if (e.key === 'Enter') checkLogistikPin(); });
        setTimeout(() => inp.focus(), 100);
    }
    overlay.style.display = 'flex';
    window._logistikPinSuccess = onSuccess;
}

window.checkLogistikPin = function() {
    const inp = document.getElementById('logistik-pin-input');
    const err = document.getElementById('logistik-pin-error');
    const pinCode = (db && db.settings && db.settings.chefPin) ? db.settings.chefPin : LOGISTIK_PIN_CODE;
    if (inp.value === pinCode) {
        localStorage.setItem(LOGISTIK_PIN_KEY, String(Date.now()));
        const overlay = document.getElementById('logistik-pin-overlay');
        if (overlay) overlay.style.display = 'none';
        if (typeof window._logistikPinSuccess === 'function') window._logistikPinSuccess();
    } else {
        inp.value = '';
        err.textContent = 'Falscher PIN. Bitte erneut versuchen.';
        setTimeout(() => { err.textContent = ''; }, 3000);
        inp.focus();
    }
};

window.addEventListener('load', async () => {
    initLogistikTouch();
    loadSecretsFromStorage();
    await tryAutoLoadSecrets();
    loadDb();
    ensureDefaults();
    initRawData();
    updateCloudStatus();
    const ed = document.getElementById('erf-date');
    if (ed) ed.value = ccTodayISO();

    if (!isLogistikPinValid()) {
        // App-Inhalt verstecken bis PIN stimmt
        document.querySelector('body > *:not(#logistik-pin-overlay)') && (document.body.style.overflow = 'hidden');
        showLogistikPinOverlay(() => {
            document.body.style.overflow = '';
            renderAll();
            resetBlockingUi();
            applyLogistikDocumentScroll();
        });
    } else {
        renderAll();
        resetBlockingUi();
        applyLogistikDocumentScroll();
    }
});
