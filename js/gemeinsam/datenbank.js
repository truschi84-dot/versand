/** Gemeinsame localStorage-Zugriffe und Merge-Hilfen (Keys unverändert). */

const STORAGE_KEYS = {
    LOGISTIK: 'kombi_logistik_db',
    RECHNER: 'kombi_rechner_db',
    OFFLINE: 'logistik_offline_db'
};

function _dbGet(key, defaultVal) {
    try {
        if (typeof AppStorage !== 'undefined') return AppStorage.get(key, defaultVal);
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : defaultVal;
    } catch (e) {
        return defaultVal;
    }
}

/**
 * 2026-08-17: Sichtbare Meldung bei Speicherfehlern. Bewusst NUR Konsole und Bildschirm:
 * ein Protokoll-Eintrag (addCloudLog) wuerde wieder in denselben vollen Speicher schreiben
 * und dabei erneut werfen — genau das hat den Klick mitten im Ablauf abgebrochen.
 * Diese Funktion wirft selbst nie.
 */
function meldeSpeicherFehler(key, e) {
    const grund = (e && (e.name || e.message)) || 'Fehler';
    console.error('Speicherfehler bei "' + key + '"', e);
    try {
        // Statuszeilen des Control Centers; in der Rechner-App gibt es sie nicht.
        ['db-status', 'sticky-status'].forEach((id) => {
            const el = (typeof document !== 'undefined') ? document.getElementById(id) : null;
            if (el) el.textContent = '⚠️ NICHT gespeichert — Speicher voll (' + grund + ')';
        });
        if (typeof showToast === 'function') showToast('Speicherfehler: ' + key + ' nicht gespeichert!', 'error');
    } catch (_) {
        /* Melden darf den Ablauf nie stoeren */
    }
}

/**
 * true = geschrieben, false = Speicherfehler (wurde gemeldet). Wirft nie nach oben.
 * Hinweis: In der Rechner-App faengt AppStorage.set den Fehler selbst ab und meldet ihn
 * dort per Toast — der Rueckgabewert ist in diesem Fall immer true.
 */
function _dbSet(key, val) {
    try {
        if (typeof AppStorage !== 'undefined') {
            AppStorage.set(key, val);
        } else {
            localStorage.setItem(key, JSON.stringify(val));
        }
        return true;
    } catch (e) {
        meldeSpeicherFehler(key, e);
        return false;
    }
}

function ladeLogistikDb() {
    return _dbGet(STORAGE_KEYS.LOGISTIK, {});
}

function speichereLogistikDb(db) {
    return _dbSet(STORAGE_KEYS.LOGISTIK, db);
}

function ladeRechnerDb() {
    return _dbGet(STORAGE_KEYS.RECHNER, {});
}

function speichereRechnerDb(db) {
    return _dbSet(STORAGE_KEYS.RECHNER, db);
}

function spiegelAufKombi(db) {
    const existing = ladeLogistikDb();
    const deletedSortierBuchungen = typeof mergeDeletedSortierKeys === 'function'
        ? mergeDeletedSortierKeys(existing.deletedSortierBuchungen, db.deletedSortierBuchungen)
        : [...new Set([...(existing.deletedSortierBuchungen || []), ...(db.deletedSortierBuchungen || [])])];
    let teamSortierBuchungen = db.teamSortierBuchungen || [];
    if (typeof mergeTeamSortierBuchungen === 'function') {
        teamSortierBuchungen = mergeTeamSortierBuchungen(
            existing.teamSortierBuchungen || [],
            teamSortierBuchungen,
            deletedSortierBuchungen
        );
    } else if (!teamSortierBuchungen.length && Array.isArray(existing.teamSortierBuchungen) && existing.teamSortierBuchungen.length) {
        teamSortierBuchungen = existing.teamSortierBuchungen;
    }
    const deliveries = typeof mergeLieferungen === 'function'
        ? mergeLieferungen(existing.deliveries || [], db.deliveries || [])
        : (db.deliveries || existing.deliveries || []);
    const teamTagesMengen = typeof mergeTeamTagesMengen === 'function'
        ? mergeTeamTagesMengen(existing.teamTagesMengen || {}, db.teamTagesMengen || {})
        : { ...(existing.teamTagesMengen || {}), ...(db.teamTagesMengen || {}) };
    const logistik = {
        suppliers: db.suppliers || [],
        customers: db.customers || [],
        articles: db.articles || [],
        todo: db.todo || [],
        lose: db.lose || [],
        later: db.later || [],
        hidden: db.hidden || [],
        workers: db.workers || [],
        deliveries,
        dailyStaff: db.dailyStaff || {},
        dailyAttendance: db.dailyAttendance || {},
        workerColors: db.workerColors || {},
        checklistMorningTemplate: db.checklistMorningTemplate || [],
        teamDayBrief: db.teamDayBrief || null,
        deletedSuppliers: db.deletedSuppliers || [],
        supplierLines: db.supplierLines || {},
        supplierLinesCleared: db.supplierLinesCleared || [],
        artikelMarkt: db.artikelMarkt || {},
        teamTagesMengen,
        teamSortierBuchungen,
        deletedSortierBuchungen,
        settings: db.settings || {},
        company: db.company
    };
    const rechner = ladeRechnerDb();
    rechner.savedProdukteRaw = db.savedProdukteRaw || rechner.savedProdukteRaw || [];
    rechner.sonderTemplates = db.sonderTemplates || rechner.sonderTemplates || [];
    const logistikOk = speichereLogistikDb(logistik);
    const rechnerOk = speichereRechnerDb(rechner);
    return logistikOk && rechnerOk;
}

/** Rückwärtskompatibilität für bestehende Aufrufer */
function mergeDeliveriesArrays(localList, cloudList) {
    if (typeof mergeLieferungenCloudMitLokalLkw === 'function') {
        return mergeLieferungenCloudMitLokalLkw(localList, cloudList);
    }
    return typeof mergeLieferungen === 'function'
        ? mergeLieferungen(localList, cloudList)
        : localList || [];
}

function ladeOfflineDb() {
    return _dbGet(STORAGE_KEYS.OFFLINE, {});
}

/**
 * Vollstand ins Offline-Lager schreiben. Eine Stelle fuer alle Aufrufer im Control Center,
 * damit der Speicherfehler nur einmal abgesichert und gemeldet werden muss.
 * Rueckgabe: true = geschrieben, false = Speicher voll (Meldung ist schon raus).
 */
function speichereOffline(db) {
    return _dbSet(STORAGE_KEYS.OFFLINE, db);
}

function patchOfflineDb(patch) {
    const db = { ...ladeOfflineDb(), ...(patch || {}) };
    _dbSet(STORAGE_KEYS.OFFLINE, db);
    return db;
}

/** Zeichen die in Cloud-Schlüsseln nicht erlaubt sind: . # $ / [ ] */
const CLOUD_KEY_INVALID_CHARS = /[.#$\/\[\]]/;

function cloudSafeKey(key) {
    const s = String(key ?? '');
    if (!CLOUD_KEY_INVALID_CHARS.test(s)) return s;
    return encodeURIComponent(s).replace(/\./g, '%2E');
}

/** Alias für Rückwärtskompatibilität mit bestehendem Code */
const firebaseSafeKey = cloudSafeKey;

function normalizeSupplierName(name) {
    return String(name ?? '').trim().replace(/\s+/g, ' ');
}

function supplierNamesMatch(a, b) {
    return normalizeSupplierName(a) === normalizeSupplierName(b);
}

function supplierLinesSafeKey(name) {
    return firebaseSafeKey(normalizeSupplierName(name));
}

function mergeSupplierLinesClearedLists(a, b) {
    return [...new Set([...(a || []), ...(b || [])].map((k) => supplierLinesSafeKey(supplierNameFromLinesKey(k))))];
}

function isSupplierLinesCleared(clearedKeys, name) {
    if (!Array.isArray(clearedKeys) || !clearedKeys.length || name == null) return false;
    const target = supplierLinesSafeKey(name);
    return clearedKeys.some((k) => supplierLinesSafeKey(supplierNameFromLinesKey(k)) === target);
}

function markSupplierLinesCleared(store, name) {
    if (!store) return;
    if (!Array.isArray(store.supplierLinesCleared)) store.supplierLinesCleared = [];
    const k = supplierLinesSafeKey(name);
    if (!store.supplierLinesCleared.includes(k)) store.supplierLinesCleared.push(k);
}

function unmarkSupplierLinesCleared(store, name) {
    if (!store || !Array.isArray(store.supplierLinesCleared)) return;
    const k = supplierLinesSafeKey(name);
    store.supplierLinesCleared = store.supplierLinesCleared.filter((x) => x !== k);
}

function migrateSupplierLinesClearedRename(store, oldName, newName) {
    if (!store || !Array.isArray(store.supplierLinesCleared)) return;
    const oldK = supplierLinesSafeKey(oldName);
    const newK = supplierLinesSafeKey(newName);
    if (!store.supplierLinesCleared.includes(oldK)) return;
    store.supplierLinesCleared = store.supplierLinesCleared.filter((x) => x !== oldK);
    if (!store.supplierLinesCleared.includes(newK)) store.supplierLinesCleared.push(newK);
}

function purgeClearedSupplierLines(supplierLines, clearedKeys) {
    const out = normalizeSupplierLinesForCloud(supplierLines || {});
    if (!Array.isArray(clearedKeys) || !clearedKeys.length) return out;
    Object.keys(out).forEach((k) => {
        if (isSupplierLinesCleared(clearedKeys, supplierNameFromLinesKey(k))) delete out[k];
    });
    return out;
}

/** Lokale Warenlinien haben Vorrang — Cleared-Markierung entfernen wenn Linien existieren. */
function reconcileSupplierLinesCleared(store) {
    if (!store || !Array.isArray(store.supplierLinesCleared)) return;
    store.supplierLinesCleared = store.supplierLinesCleared.filter((k) => {
        const name = supplierNameFromLinesKey(k);
        const lines = lookupSupplierLines(store.supplierLines, name, []);
        return !(lines && lines.length);
    });
}

function supplierNameFromLinesKey(rawKey) {
    try {
        const decoded = decodeURIComponent(String(rawKey ?? ''));
        return normalizeSupplierName(decoded || rawKey);
    } catch (_) {
        return normalizeSupplierName(rawKey);
    }
}

/** Warenlinien-Map: Lieferantennamen als cloud-sichere Schlüssel speichern */
function normalizeSupplierLinesForCloud(supplierLines) {
    if (!supplierLines || typeof supplierLines !== 'object' || Array.isArray(supplierLines)) return {};
    const out = {};
    Object.keys(supplierLines).forEach((rawKey) => {
        const name = supplierNameFromLinesKey(rawKey);
        const safeKey = firebaseSafeKey(name);
        const lines = supplierLines[rawKey];
        if (!Array.isArray(lines) || !lines.length) return;
        const cleaned = lines.map((l) => String(l).trim()).filter(Boolean);
        if (cleaned.length) out[safeKey] = cleaned;
    });
    return out;
}

function lookupSupplierLines(supplierLines, name, clearedKeys) {
    if (!supplierLines || typeof supplierLines !== 'object' || !name) return null;
    if (isSupplierLinesCleared(clearedKeys, name)) return null;
    const target = normalizeSupplierName(name);
    const safe = firebaseSafeKey(target);
    if (Array.isArray(supplierLines[safe])) return supplierLines[safe];
    if (Array.isArray(supplierLines[target])) return supplierLines[target];
    if (Array.isArray(supplierLines[name])) return supplierLines[name];
    for (const k of Object.keys(supplierLines)) {
        if (supplierNamesMatch(supplierNameFromLinesKey(k), target) && Array.isArray(supplierLines[k])) {
            return supplierLines[k];
        }
    }
    return null;
}

/** Cloud + lokal zusammenführen; gelöschte (cleared) Lieferanten ausgenommen. */
function mergeSupplierLinesForSync(localLines, cloudLines, clearedKeys) {
    const cleared = clearedKeys || [];
    const out = purgeClearedSupplierLines(localLines, cleared);
    const cloud = purgeClearedSupplierLines(cloudLines, cleared);
    Object.keys(cloud).forEach((safeKey) => {
        const cloudArr = cloud[safeKey] || [];
        if (!cloudArr.length) return;
        const name = supplierNameFromLinesKey(safeKey);
        if (isSupplierLinesCleared(cleared, name)) return;
        const localArr = lookupSupplierLines(out, name, cleared) || [];
        const pick = localArr.length > 0 && localArr.length >= cloudArr.length ? localArr : cloudArr;
        if (pick.length) out[supplierLinesSafeKey(name)] = pick.slice();
    });
    return out;
}

function rekeyObjectShallow(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    Object.keys(obj).forEach((k) => { out[firebaseSafeKey(k)] = obj[k]; });
    return out;
}

function findInvalidCloudKeys(obj, path) {
    const hits = [];
    const prefix = path || '';
    if (obj === null || typeof obj !== 'object') return hits;
    if (Array.isArray(obj)) {
        obj.forEach((v, i) => {
            hits.push(...findInvalidCloudKeys(v, prefix + '[' + i + ']'));
        });
        return hits;
    }
    Object.keys(obj).forEach((k) => {
        const next = prefix ? prefix + '.' + k : k;
        if (CLOUD_KEY_INVALID_CHARS.test(k)) hits.push(next);
        hits.push(...findInvalidCloudKeys(obj[k], next));
    });
    return hits;
}

/** Alias für Rückwärtskompatibilität */
const findInvalidFirebaseKeys = findInvalidCloudKeys;

/** Klont db für Cloud-PUT und korrigiert ungültige Schlüssel (v. a. supplierLines). */
function prepareDbForCloudUpload(db) {
    let payload;
    try {
        payload = JSON.parse(JSON.stringify(db));
    } catch (e) {
        throw new Error('Datenbank lässt sich nicht serialisieren: ' + (e.message || e));
    }
    payload.supplierLinesCleared = mergeSupplierLinesClearedLists([], payload.supplierLinesCleared);
    if (typeof reconcileSupplierLinesCleared === 'function') reconcileSupplierLinesCleared(payload);
    payload.supplierLines = mergeSupplierLinesForSync(
        payload.supplierLines,
        {},
        payload.supplierLinesCleared
    );
    if (payload.workerColors && typeof payload.workerColors === 'object') {
        payload.workerColors = rekeyObjectShallow(payload.workerColors);
    }
    if (payload.supplierNumbers && typeof payload.supplierNumbers === 'object' && !Array.isArray(payload.supplierNumbers)) {
        payload.supplierNumbers = rekeyObjectShallow(payload.supplierNumbers);
    }
    if (payload.dailyAttendance && typeof payload.dailyAttendance === 'object' && !Array.isArray(payload.dailyAttendance)) {
        const att = {};
        Object.keys(payload.dailyAttendance).forEach((dateKey) => {
            const day = payload.dailyAttendance[dateKey];
            att[firebaseSafeKey(dateKey)] = (day && typeof day === 'object' && !Array.isArray(day))
                ? rekeyObjectShallow(day)
                : day;
        });
        payload.dailyAttendance = att;
    }
    if (payload.suppliers && !Array.isArray(payload.suppliers)) {
        payload.suppliers = Object.values(payload.suppliers).map((s) => String(s || '').trim()).filter(Boolean);
    } else if (Array.isArray(payload.suppliers)) {
        payload.suppliers = payload.suppliers.map((s) => String(s || '').trim()).filter(Boolean);
    }
    if (Array.isArray(payload.deliveries) && typeof deliveriesFuerCloudSync === 'function') {
        payload.deliveries = deliveriesFuerCloudSync(payload.deliveries);
    }
    // Safety: strip null bytes from deletedSortierBuchungen before sending to Supabase (jsonb rejects \0)
    if (Array.isArray(payload.deletedSortierBuchungen)) {
        payload.deletedSortierBuchungen = [...new Set(
            payload.deletedSortierBuchungen.map(k => String(k).replace('\0', '|'))
        )];
    }
    const bad = findInvalidCloudKeys(payload);
    if (bad.length) {
        throw new Error('Ungültige Cloud-Schlüssel in: ' + bad.slice(0, 4).join(', ') + (bad.length > 4 ? ' …' : ''));
    }
    return payload;
}

/** PUT darf Druck-Buchungen aus der Cloud nicht löschen, wenn lokal (PC) noch keine da sind. */
function finalizeCloudPutPayload(localPayload, cloudSnapshot) {
    const payload = { ...(localPayload || {}) };
    const cloud = cloudSnapshot || {};
    const localBuch = Array.isArray(payload.teamSortierBuchungen) ? payload.teamSortierBuchungen : [];
    const cloudBuch = Array.isArray(cloud.teamSortierBuchungen) ? cloud.teamSortierBuchungen : [];
    if (!localBuch.length && cloudBuch.length) {
        payload.teamSortierBuchungen = cloudBuch;
    }
    const localDel = Array.isArray(payload.deletedSortierBuchungen) ? payload.deletedSortierBuchungen : [];
    const cloudDel = Array.isArray(cloud.deletedSortierBuchungen) ? cloud.deletedSortierBuchungen : [];
    if (typeof mergeDeletedSortierKeys === 'function') {
        payload.deletedSortierBuchungen = mergeDeletedSortierKeys(localDel, cloudDel);
    } else if (!localDel.length && cloudDel.length) {
        payload.deletedSortierBuchungen = cloudDel;
    }
    if (cloud.teamTagesMengen && typeof mergeTeamTagesMengen === 'function') {
        payload.teamTagesMengen = mergeTeamTagesMengen(payload.teamTagesMengen || {}, cloud.teamTagesMengen);
    }
    if (cloud.deliveries != null && typeof mergeLieferungenCloudMitLokalLkw === 'function') {
        payload.deliveries = mergeLieferungenCloudMitLokalLkw(payload.deliveries || [], cloud.deliveries);
    } else if (cloud.deliveries != null && typeof mergeLieferungen === 'function') {
        payload.deliveries = mergeLieferungen(payload.deliveries || [], cloud.deliveries);
    }
    return payload;
}

function leererTeamTagesEintrag() {
    return { personalAnzahl: 0, gesamtKg: 0, exportKg: 0, unsKg: 0 };
}

function mergeTeamTagesEintrag(lokal, cloud) {
    const l = { ...leererTeamTagesEintrag(), ...(lokal || {}) };
    const c = { ...leererTeamTagesEintrag(), ...(cloud || {}) };
    const lp = parseFloat(l.personalAnzahl);
    const cp = parseFloat(c.personalAnzahl);
    let personalAnzahl = 0;
    if (!isNaN(lp) && lp > 0) personalAnzahl = lp;
    else if (!isNaN(cp) && cp > 0) personalAnzahl = cp;
    else if (!isNaN(lp)) personalAnzahl = lp;
    else if (!isNaN(cp)) personalAnzahl = cp;

    const lSort = (parseFloat(l.exportKg) || 0) + (parseFloat(l.unsKg) || 0);
    const cSort = (parseFloat(c.exportKg) || 0) + (parseFloat(c.unsKg) || 0);
    if (lSort > 0 || cSort > 0) {
        const src = cSort > lSort ? c : l;
        return {
            personalAnzahl,
            gesamtKg: parseFloat(src.gesamtKg) || 0,
            exportKg: parseFloat(src.exportKg) || 0,
            unsKg: parseFloat(src.unsKg) || 0
        };
    }
    return {
        personalAnzahl,
        gesamtKg: Math.max(parseFloat(l.gesamtKg) || 0, parseFloat(c.gesamtKg) || 0),
        exportKg: Math.max(parseFloat(l.exportKg) || 0, parseFloat(c.exportKg) || 0),
        unsKg: Math.max(parseFloat(l.unsKg) || 0, parseFloat(c.unsKg) || 0)
    };
}

function mergeTeamTagesMengen(lokal, cloud) {
    const keys = new Set([...Object.keys(lokal || {}), ...Object.keys(cloud || {})]);
    const out = {};
    keys.forEach((datum) => {
        out[datum] = mergeTeamTagesEintrag(lokal?.[datum], cloud?.[datum]);
    });
    return out;
}
