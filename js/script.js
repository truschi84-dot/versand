// =========================================================================
// ZENTRALE KONFIGURATION (CLOUD)
// =========================================================================
const FIREBASE_CLOUD_BACKUP = "https://tresch-versand-default-rtdb.firebaseio.com/backup";
const APP_CONFIG = {
    CLOUD_URL: localStorage.getItem('custom_cloud_url') || FIREBASE_CLOUD_BACKUP,
    LOGISTIK_PIN: "110784",
    ADMIN_PIN: "3132",
    NOTIFICATION_URL: "https://formspree.io/f/xrejnkgq"
};

const APP_VERSION = "7.1";
/** Muss mit app-version.json webVersion übereinstimmen (publish-ota.ps1). */
const WEB_BUILD_VERSION = 97;
/** Büro-WLAN – IP bei Bedarf anpassen (muss zu app-shell.json passen). */
const OFFICE_LAN_URL = 'http://192.168.211.135:8080';
let pendingOtaUpdate = null;
const APP_CHANGELOG = "<b>Was ist neu in 7.1?</b><br><br>• 📲 <b>OTA-Updates:</b> App kann sich von eurem Web-Server aktualisieren – keine neue APK für jedes HTML/JS-Update.<br>• 🎨 <b>Handy-Layout:</b> Scrollen und Safe-Area in der APK verbessert.";
/** APK (file://): Update-Config nur bei manueller Prüfung – nicht beim Start. */
const OTA_REMOTE_CONFIG_URL = "https://truschi84-dot.github.io/versand/app-update.json";

function getOtaConfigUrl() {
    if (location.protocol === 'https:' || location.protocol === 'http:') {
        return location.origin + '/app-update.json';
    }
    return OTA_REMOTE_CONFIG_URL;
}

const AppStorage = {
    get: (key, defaultVal) => { try { const val = localStorage.getItem(key); return val ? JSON.parse(val) : defaultVal; } catch(e) { return defaultVal; } },
    set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.error("Storage Fehler", e); showToast("Speicherfehler!", "error"); } },
    remove: (key) => localStorage.removeItem(key),
    getRaw: (key) => localStorage.getItem(key),
    setRaw: (key, val) => localStorage.setItem(key, val)
};

function getAppSetting(key, defaultVal) {
    try { const lDb = AppStorage.get('kombi_logistik_db', {});
    if (lDb.settings && lDb.settings[key]) return lDb.settings[key]; } catch(e){}
    return defaultVal;
}

const DEFAULT_LEERGUT_CONFIG = "E2:2.0, Herta:2.5, H1:18.0, Euro:21.0";

/** WK2 nur im PC Control Center – in der Kombi-App wieder Herta-Standard */
function sanitizeCompanyLeergut(company) {
    if (!company || typeof company.leergut !== 'string') return false;
    const raw = company.leergut.trim();
    if (!/\bWK2\s*:/i.test(raw)) return false;
    const parts = raw.split(',').map(s => s.trim()).filter(p => p && !/^WK2\s*:/i.test(p));
    let result = parts.join(', ');
    if (!/\bHerta\s*:/i.test(result) && /\bE2\s*:/i.test(result) && /\bH1\s*:/i.test(result)) {
        result = result.replace(/^E2\s*:[^,]+/i, (m) => m + ', Herta:2.5');
    }
    company.leergut = result || DEFAULT_LEERGUT_CONFIG;
    return true;
}

function getLeergutConfig() {
    try {
        const lDb = AppStorage.get('kombi_logistik_db', {});
        if (lDb.company && lDb.company.leergut) {
            return lDb.company.leergut.split(',').map((s, idx) => {
                let parts = s.split(':'); if(parts.length < 2) return null;
                return { id: 'lg_' + idx, name: parts[0].trim(), weight: parseFloat(parts[1]) || 0 };
            }).filter(lg => lg && lg.name && lg.weight > 0);
        }
    } catch(e) {}
    return DEFAULT_LEERGUT_CONFIG.split(',').map((s, idx) => {
        const parts = s.split(':');
        return { id: 'lg_' + idx, name: parts[0].trim(), weight: parseFloat(parts[1]) || 0 };
    }).filter(lg => lg.name && lg.weight > 0);
}

// ======================= DATEN-MIGRATION =======================
function runDataMigration() {
    const wk2Key = 'migration_remove_wk2_leergut_v1';
    if (AppStorage.getRaw(wk2Key) !== 'done') {
        let wkChanged = false;
        const lDbWk = AppStorage.get('kombi_logistik_db', {});
        if (lDbWk.company && sanitizeCompanyLeergut(lDbWk.company)) wkChanged = true;
        if (wkChanged) AppStorage.set('kombi_logistik_db', lDbWk);

        const rDbWk = AppStorage.get('kombi_rechner_db', {});
        if (Array.isArray(rDbWk.entries)) {
            rDbWk.entries.forEach((e) => {
                if (!e.leergut || e.leergut.WK2 == null) return;
                e.leergut.Herta = (e.leergut.Herta || 0) + (Number(e.leergut.WK2) || 0);
                delete e.leergut.WK2;
                wkChanged = true;
            });
            if (wkChanged) AppStorage.set('kombi_rechner_db', rDbWk);
        }
        AppStorage.setRaw(wk2Key, 'done');
    }

    const migrationKey = 'migration_sanitize_keys_v1';
    if (AppStorage.getRaw(migrationKey) === 'done') {
        return;
    }

    console.log("Führe Daten-Migration aus: Bereinige Daten-Schlüssel...");
    let lDb = AppStorage.get('kombi_logistik_db', {});
    if (!lDb || Object.keys(lDb).length === 0) {
        AppStorage.setRaw(migrationKey, 'done');
        return; // Nichts zu tun
    }
    
    let changed = false;
    const nameMap = new Map();

    const sanitize = (name) => name.replace(/[.#$\[\]]/g, '').trim();

    // 1. Mitarbeiter bereinigen und Map erstellen
    if (lDb.workers && Array.isArray(lDb.workers)) {
        const newWorkers = [];
        lDb.workers.forEach(w => {
            const sanitizedName = sanitize(w);
            if (sanitizedName !== w) { nameMap.set(w, sanitizedName); changed = true; }
            if (!newWorkers.includes(sanitizedName)) { newWorkers.push(sanitizedName); }
        });
        lDb.workers = newWorkers;
    }

    // 2. Lieferanten bereinigen und Map erstellen
    if (lDb.suppliers && Array.isArray(lDb.suppliers)) {
        const newSuppliers = [];
        lDb.suppliers.forEach(s => {
            const sanitizedName = sanitize(s);
            if (sanitizedName !== s) { nameMap.set(s, sanitizedName); changed = true; }
             if (!newSuppliers.includes(sanitizedName)) { newSuppliers.push(sanitizedName); }
        });
        lDb.suppliers = newSuppliers;
    }
    
    if (!changed) { AppStorage.setRaw(migrationKey, 'done'); return; }

    // 3. workerColors aktualisieren
    if (lDb.workerColors) {
        const newColors = {};
        for (const oldName in lDb.workerColors) { newColors[nameMap.get(oldName) || oldName] = lDb.workerColors[oldName]; }
        lDb.workerColors = newColors;
    }

    // 4. dailyAttendance aktualisieren
    if (lDb.dailyAttendance) {
        const newAttendance = {};
        for (const date in lDb.dailyAttendance) {
            newAttendance[date] = {};
            for (const oldName in lDb.dailyAttendance[date]) { newAttendance[date][nameMap.get(oldName) || oldName] = lDb.dailyAttendance[date][oldName]; }
        }
        lDb.dailyAttendance = newAttendance;
    }

    // 5. deliveries (workerShares & delivery.name) aktualisieren
    if (lDb.deliveries && Array.isArray(lDb.deliveries)) {
        lDb.deliveries.forEach(delivery => {
            if (delivery.workerShares && Array.isArray(delivery.workerShares)) { delivery.workerShares.forEach(share => { share.name = nameMap.get(share.name) || share.name; }); }
            delivery.name = nameMap.get(delivery.name) || delivery.name;
        });
    }
    
    AppStorage.set('kombi_logistik_db', lDb); AppStorage.setRaw(migrationKey, 'done');
    showToast("Datenbank wurde automatisch bereinigt!", "success");
}

// UI HELPER
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerText = message; container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function customConfirm(msg, onConfirm) {
    document.getElementById('confirm-modal-text').innerText = msg;
    const modal = document.getElementById('custom-confirm-modal');
    document.getElementById('confirm-yes-btn').onclick = () => { modal.style.display = 'none'; onConfirm(); };
    document.getElementById('confirm-no-btn').onclick = () => { modal.style.display = 'none'; };
    modal.style.display = 'flex';
}

function sendNotification(subject, text) {
    const url = getAppSetting('notificationUrl', APP_CONFIG.NOTIFICATION_URL);
    if (!url || url.includes("DEINE_FORMSPREE_ID")) return;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ Betreff: subject, Nachricht: text, Zeit: new Date().toLocaleString('de-DE') })
    }).catch(e => console.log("Silent Notification Error"));
}

let _pendingPinAction = null;
let _appInitialized = false;
const AUSWERTUNG_SESSION_KEY = 'auswertung_authenticated';

function isAuswertungAuthenticated() {
    try { return sessionStorage.getItem(AUSWERTUNG_SESSION_KEY) === 'true'; } catch (_) { return false; }
}

function setAuswertungAuthenticated(value) {
    try {
        if (value) sessionStorage.setItem(AUSWERTUNG_SESSION_KEY, 'true');
        else sessionStorage.removeItem(AUSWERTUNG_SESSION_KEY);
    } catch (_) {}
}

function cacheSettingsPins(settings) {
    if (!settings || typeof settings !== 'object') return;
    const lDb = AppStorage.get('kombi_logistik_db', {});
    if (!lDb.settings) lDb.settings = {};
    if (settings.logistikPin != null) lDb.settings.logistikPin = String(settings.logistikPin).trim();
    if (settings.pinVersion != null) lDb.settings.pinVersion = settings.pinVersion;
    if (settings.adminPin != null) lDb.settings.adminPin = String(settings.adminPin).trim();
    AppStorage.set('kombi_logistik_db', lDb);
}

async function validateAdminPin(enteredPin) {
    const pin = String(enteredPin).trim();
    if (!pin) return false;
    try {
        await CloudAuth.ensureAuth();
        const base = FIREBASE_CLOUD_BACKUP.replace(/\/backup\/?$/, '');
        const res = await cloudFetch(base + '/backup/settings.json?t=' + Date.now());
        if (res.ok) {
            const settings = await res.json();
            cacheSettingsPins(settings);
            const adminPin = String(settings?.adminPin ?? APP_CONFIG.ADMIN_PIN).trim();
            return pin === adminPin;
        }
    } catch (e) {
        console.warn('Admin-PIN-Prüfung (offline/Fehler):', e.message || e);
    }
    const cached = getAppSetting('adminPin', APP_CONFIG.ADMIN_PIN);
    return pin === String(cached).trim();
}

function hideAppUntilUnlocked() {
    const a1 = document.getElementById('app1_wrapper');
    const a2 = document.getElementById('app2_wrapper');
    if (a1) a1.style.display = 'none';
    if (a2) a2.style.display = 'none';
}

function ensureAppVisible() {
    if (!isAppAuthenticated()) { hideAppUntilUnlocked(); return; }
    const a1 = document.getElementById('app1_wrapper');
    const a2 = document.getElementById('app2_wrapper');
    if (a1) a1.style.display = 'none';
    if (a2) a2.style.display = 'flex';
}

async function validatePinAndUnlock(enteredPin) {
    try {
        await CloudAuth.ensureAuth();
        const base = FIREBASE_CLOUD_BACKUP.replace(/\/backup\/?$/, '');
        const res = await cloudFetch(base + '/backup/settings.json?t=' + Date.now());
        if (res.ok) {
            const settings = await res.json();
            const cloudPin = String(settings?.logistikPin ?? APP_CONFIG.LOGISTIK_PIN).trim();
            const cloudPinVersion = parseInt(settings?.pinVersion, 10) || 1;
            if (String(enteredPin).trim() !== cloudPin) return false;
            setAppAuthenticated(true);
            AppStorage.setRaw('app_pin_version', String(cloudPinVersion));
            cacheSettingsPins(settings);
            return true;
        }
    } catch (e) {
        console.warn('Cloud-PIN-Prüfung (offline/Fehler):', e.message || e);
    }
    const cachedPin = getAppSetting('logistikPin', '');
    if (cachedPin && String(enteredPin).trim() === String(cachedPin).trim()) {
        setAppAuthenticated(true);
        return true;
    }
    return false;
}

function finishAppUnlock() {
    const overlay = document.getElementById('pin-protection-overlay');
    if (overlay) overlay.style.display = 'none';
    resetPinOverlayDefaults();
    resetInactivityTimer();
    initAppAfterUnlock();
    const pending = _pendingPinAction;
    _pendingPinAction = null;
    if (pending === 'auswertung') {
        ensureAppVisible();
        showAdminPinForAuswertung();
    } else {
        ensureAppVisible();
    }
}

function initAppAfterUnlock() {
    if (_appInitialized || !isAppAuthenticated()) return;
    _appInitialized = true;
    if (document.getElementById('selectedWorkDate')) {
        document.getElementById('selectedWorkDate').value = getLocalISO();
        document.getElementById('selectedWorkDate').onchange = renderApp1;
    }
    if (typeof loadLocalDB === 'function') loadLocalDB();
    if (typeof loadRechnerData === 'function') loadRechnerData();
    if (typeof initCalc === 'function') initCalc();
    if (navigator.onLine && typeof loadAllFromCloud === 'function') loadAllFromCloud();
    if (typeof renderAppCloudLogs === 'function') renderAppCloudLogs();
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    if (typeof initLkwShareButtons === 'function') initLkwShareButtons();
    if (typeof initTeamDayBrief === 'function') initTeamDayBrief();
    if (!AppStorage.getRaw('last_update_push')) AppStorage.setRaw('last_update_push', Date.now().toString());
    const lastSeenVer = AppStorage.getRaw('last_seen_version');
    if (lastSeenVer !== APP_VERSION) {
        const clogModal = document.getElementById('changelog-modal');
        if (clogModal) {
            document.getElementById('changelog-version').innerText = APP_VERSION;
            document.getElementById('changelog-text').innerHTML = APP_CHANGELOG;
            clogModal.style.display = 'flex';
            AppStorage.setRaw('last_seen_version', APP_VERSION);
        }
    }
}

function resetPinOverlayDefaults() {
    const title = document.getElementById('pin-title');
    const desc = document.getElementById('pin-desc');
    const pinSubmit = document.getElementById('pin-submit-btn');
    const cancelBtn = document.getElementById('pin-cancel-btn');
    const settingsLink = document.querySelector('#pin-protection-overlay .pin-settings-link');
    if (title) { title.innerText = 'App gesperrt'; title.style.color = 'white'; }
    if (desc) desc.innerText = 'Bitte Firmen-PIN eingeben.';
    if (pinSubmit) pinSubmit.innerText = 'Entsperren';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (settingsLink) settingsLink.style.display = '';
}

function showPinProtection(pendingAction) {
    if (pendingAction !== undefined) _pendingPinAction = pendingAction;
    const overlay = document.getElementById('pin-protection-overlay');
    if (!overlay) return;
    AppStorage.remove('logistik_pin_fails');
    AppStorage.remove('logistik_current_puk');
    hideAppUntilUnlocked();
    resetPinOverlayDefaults();
    overlay.style.display = 'flex';
    const pinInput = document.getElementById('pin-input');
    const pinSubmit = document.getElementById('pin-submit-btn');
    const title = document.getElementById('pin-title');
    const desc = document.getElementById('pin-desc');
    pinInput.value = '';

    const checkPin = async () => {
        pinSubmit.disabled = true;
        const ok = await validatePinAndUnlock(pinInput.value);
        pinSubmit.disabled = false;
        if (ok) {
            pinInput.value = '';
            startPinVersionWatch();
            finishAppUnlock();
        } else {
            showToast("PIN falsch!", "error");
            pinInput.value = "";
            pinInput.focus();
        }
    };
    pinSubmit.onclick = checkPin;
    pinInput.onkeyup = (event) => { if (event.key === 'Enter') { event.preventDefault(); checkPin(); } };
    pinInput.focus();
}

function showAdminPinForAuswertung() {
    const overlay = document.getElementById('pin-protection-overlay');
    if (!overlay) return;
    if (isAppAuthenticated()) ensureAppVisible();
    const pinInput = document.getElementById('pin-input');
    const pinSubmit = document.getElementById('pin-submit-btn');
    const cancelBtn = document.getElementById('pin-cancel-btn');
    const title = document.getElementById('pin-title');
    const desc = document.getElementById('pin-desc');
    const settingsLink = document.querySelector('#pin-protection-overlay .pin-settings-link');
    pinInput.value = '';
    title.innerText = 'LKW-Auswertung';
    title.style.color = 'white';
    desc.innerText = 'Admin-PIN eingeben — nur für Restmengen & Sortier-Auswertung.';
    pinSubmit.innerText = 'Öffnen';
    if (cancelBtn) cancelBtn.style.display = 'block';
    if (settingsLink) settingsLink.style.display = 'none';
    overlay.style.display = 'flex';

    const closeOverlay = () => {
        overlay.style.display = 'none';
        resetPinOverlayDefaults();
        pinInput.value = '';
    };

    const checkPin = async () => {
        pinSubmit.disabled = true;
        const ok = await validateAdminPin(pinInput.value);
        pinSubmit.disabled = false;
        if (ok) {
            setAuswertungAuthenticated(true);
            closeOverlay();
            updateAdminOnlyDrawerItems();
            const pending = _pendingPinAction;
            _pendingPinAction = null;
            if (pending === 'privateNotes') {
                if (typeof renderPrivateNotesModal === 'function') renderPrivateNotesModal();
            } else {
                openAuswertungApp();
            }
        } else {
            showToast('Admin-PIN falsch!', 'error');
            pinInput.value = '';
            pinInput.focus();
        }
    };
    pinSubmit.onclick = checkPin;
    if (cancelBtn) cancelBtn.onclick = closeOverlay;
    pinInput.onkeyup = (event) => { if (event.key === 'Enter') { event.preventDefault(); checkPin(); } };
    pinInput.focus();
}

function openAuswertungApp() {
    document.getElementById('app2_wrapper').style.display = 'none';
    document.getElementById('app1_wrapper').style.display = 'block';
    if (typeof checkBackupReminder === 'function') checkBackupReminder();
    if (typeof pullLogistikFromCloud === 'function') pullLogistikFromCloud(true);
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    if (typeof updateAdminOnlyDrawerItems === 'function') updateAdminOnlyDrawerItems();
    if (typeof renderTeamDayBanner === 'function') renderTeamDayBanner();
}

function requestAuswertungAccess() {
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    if (!isAppAuthenticated()) {
        showPinProtection('auswertung');
        return;
    }
    if (isAuswertungAuthenticated()) {
        openAuswertungApp();
        return;
    }
    showAdminPinForAuswertung();
}

function promptCustomCloudUrl() {
    const current = localStorage.getItem('custom_cloud_url') || "";
    document.getElementById('cloud-url-input').value = current;
    document.getElementById('cloud-url-modal').style.display = 'flex';
}

window.saveCustomCloudUrl = function() {
    const url = document.getElementById('cloud-url-input').value.trim();
    if (url === "") { localStorage.removeItem('custom_cloud_url'); showToast("Standard-Server wiederhergestellt.", "info"); }
    else { localStorage.setItem('custom_cloud_url', url); showToast("Neuer Server gespeichert!", "success"); }
    document.getElementById('cloud-url-modal').style.display = 'none';
    setTimeout(() => location.reload(), 1000);
}

// SWIPE LOGIK
let swipeStartX = 0; let swipeStartY = 0; let isSwiping = false; let currentSwipedEl = null;
document.addEventListener('pointerdown', (e) => { 
    const swipeable = e.target.closest('.swipeable'); 
    if (e.target.closest('.swipe-bg')) return; // Klicks auf den Lösch-Button nicht durch den Swipe-Reset blockieren
    
    if (currentSwipedEl && currentSwipedEl !== swipeable) { currentSwipedEl.style.transform = 'translateX(0)'; currentSwipedEl = null; } 
    if (!swipeable || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return; 
    isSwiping = true; swipeStartX = e.clientX; swipeStartY = e.clientY; swipeable.style.transition = 'none'; 
});
document.addEventListener('pointermove', (e) => {
    if (!isSwiping) return;
    const swipeable = e.target.closest('.swipeable');
    if (!swipeable) return;
    const diffX = swipeStartX - e.clientX;
    const diffY = swipeStartY - e.clientY;
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
        isSwiping = false;
        swipeable.style.transition = 'transform 0.2s ease-out';
        swipeable.style.transform = 'translateX(0)';
        return;
    }
    if (Math.abs(diffX) > Math.abs(diffY) && diffX > 0) {
        if (e.cancelable && !isNativeAndroidApp()) e.preventDefault();
        swipeable.style.transform = `translateX(-${Math.min(diffX, 80)}px)`;
    } else if (Math.abs(diffY) > Math.abs(diffX)) {
        isSwiping = false;
        swipeable.style.transition = 'transform 0.2s ease-out';
        swipeable.style.transform = 'translateX(0)';
    }
});
document.addEventListener('pointerup', (e) => { if (!isSwiping) return; isSwiping = false; const swipeable = e.target.closest('.swipeable'); if (!swipeable) return; swipeable.style.transition = 'transform 0.2s ease-out'; if ((swipeStartX - e.clientX) > 40) { swipeable.style.transform = `translateX(-80px)`; currentSwipedEl = swipeable; } else { swipeable.style.transform = `translateX(0)`; if (currentSwipedEl === swipeable) currentSwipedEl = null; } });

// AUTO-LOGOUT
let inactivityTimer;
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (!isAppAuthenticated()) return;
    const timeoutMinutes = parseInt(getAppSetting('inactivityTimeout', 0), 10) || 0;
    if (timeoutMinutes <= 0) return;
    inactivityTimer = setTimeout(() => { logoutLogistik(true); }, timeoutMinutes * 60 * 1000);
}

/** Firmendaten lokal entfernen (z. B. nach PIN-Entzug / Kündigung – ohne Zugriff aufs Handy). */
function wipeLocalFirmData() {
    const keys = [
        'kombi_logistik_db', 'kombi_rechner_db', 'firebase_auth_secrets', 'app_pin_version',
        'logistik_cloud_logs', 'logistik_last_backup_day', 'logistik_offline_db',
        'checklist_init_done', 'logistik_pin_fails', 'logistik_current_puk'
    ];
    keys.forEach((k) => AppStorage.remove(k));
    setAuswertungAuthenticated(false);
    if (typeof CloudAuth !== 'undefined') CloudAuth.clearSession();
    _appInitialized = false;
}

function isPinVersionRevoked(settings) {
    if (!settings) return false;
    const localVer = parseInt(AppStorage.getRaw('app_pin_version'), 10);
    if (!localVer) return false;
    const cloudVer = parseInt(settings.pinVersion, 10) || 1;
    return cloudVer !== localVer;
}

function revokeSessionIfPinChanged(settings) {
    if (!settings || !isPinVersionRevoked(settings)) return false;
    wipeLocalFirmData();
    logoutLogistik(false, 'PIN wurde geändert – lokale Firmendaten gelöscht. Neue PIN eingeben.');
    return true;
}

async function checkAndWipeIfPinRevoked() {
    if (!AppStorage.getRaw('app_pin_version')) return;
    try {
        await CloudAuth.ensureAuth();
        const base = FIREBASE_CLOUD_BACKUP.replace(/\/backup\/?$/, '');
        const res = await cloudFetch(base + '/backup/settings.json?t=' + Date.now());
        if (!res.ok) return;
        const settings = await res.json();
        if (isPinVersionRevoked(settings)) {
            wipeLocalFirmData();
            setAppAuthenticated(false);
        }
    } catch (_) {}
}

async function verifySessionStillValid() {
    if (!isAppAuthenticated()) return false;
    try {
        await CloudAuth.ensureAuth();
        const base = FIREBASE_CLOUD_BACKUP.replace(/\/backup\/?$/, '');
        const res = await cloudFetch(base + '/backup/settings.json?t=' + Date.now());
        if (!res.ok) return true;
        const settings = await res.json();
        return !revokeSessionIfPinChanged(settings);
    } catch (_) {
        return true;
    }
}

let _pinWatchStarted = false;
function startPinVersionWatch() {
    if (_pinWatchStarted) return;
    _pinWatchStarted = true;
    setInterval(() => { if (isAppAuthenticated()) verifySessionStillValid(); }, 2 * 60 * 1000);
}
['touchstart', 'click', 'keypress', 'scroll'].forEach(evt => document.addEventListener(evt, resetInactivityTimer, true));

// APP WECHSEL — Auswertung (App 1) nur mit Admin-PIN; Rechner (App 2) für alle mit Firmen-PIN
function switchApp(appNum) {
    if (appNum === 1) {
        requestAuswertungAccess();
        return;
    }
    if (!isAppAuthenticated()) { showPinProtection(); return; }
    setAuswertungAuthenticated(false);
    if (typeof updateAdminOnlyDrawerItems === 'function') updateAdminOnlyDrawerItems();
    document.getElementById('app1_wrapper').style.display = 'none';
    document.getElementById('app2_wrapper').style.display = 'flex';
    if (typeof toggleMenuApp1 === 'function') toggleMenuApp1(false);
}
function logoutLogistik(auto = false, message) {
    setAppAuthenticated(false);
    setAuswertungAuthenticated(false);
    if (typeof updateAdminOnlyDrawerItems === 'function') updateAdminOnlyDrawerItems();
    if (typeof CloudAuth !== 'undefined') CloudAuth.clearSession();
    if (typeof toggleMenuApp1 === 'function') toggleMenuApp1(false);
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    hideAppUntilUnlocked();
    _pendingPinAction = null;
    showPinProtection();
    if (message) showToast(message, 'warning');
    else if (auto === true) showToast("Automatisch gesperrt (Inaktivität).", "warning");
    else showToast("App gesperrt.", "success");
}

/** Entfernt Service Worker + Cache API – Ursache fuer "Speicher voll" bei Server-Betrieb. */
function initLeanStorageHygiene() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((r) => r.unregister());
        });
    }
    if ('caches' in window) {
        caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
    }
}

/** Geschaetzte localStorage-Nutzung (nur Anzeige). */
function getLocalStorageUsedBytes() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (k ? k.length : 0) + (localStorage.getItem(k) || '').length;
    }
    return total * 2;
}

function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

/** Einstellungen / Konsole: Cache leeren, Daten bleiben in localStorage. */
async function clearAppBrowserCache() {
    initLeanStorageHygiene();
    try {
        if (typeof AndroidApp !== 'undefined' && AndroidApp.clearWebViewCache) {
            AndroidApp.clearWebViewCache();
        }
    } catch (_) {}
    showToast('App-Cache geleert. Seite wird neu geladen …', 'success');
    setTimeout(() => location.reload(true), 600);
}

// START LOGIK
window.onload = async () => {
    initLeanStorageHygiene();

    if (await initOtaApkBootstrap()) return;

    // HARD-CACHE PURGE V7 (BETA MERGE): Zwingt Browser/Tablets, alte Beta-Dateien und fehlerhafte Versionen endgültig zu verwerfen.
    if (AppStorage.getRaw('hard_purge_v70') !== 'done') {
        if ('caches' in window) {
            caches.keys().then(names => {
                for (let name of names) caches.delete(name);
            });
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for(let registration of registrations) registration.unregister();
            });
        }
        AppStorage.setRaw('hard_purge_v70', 'done');
        setTimeout(() => window.location.reload(true), 500);
        return;
    }

    runDataMigration();
    initMobileApp();
    initOtaUpdateWatch();

    if (AppStorage.getRaw('kombi_dark_mode') === 'true') {
        document.body.classList.add('dark-mode');
        updateDarkModeIcons(true);
        clearStaleDarkModeInlineStyles();
        applyHeaderDarkModeFix(true);
    }

    hideAppUntilUnlocked();
    (async () => {
        await checkAndWipeIfPinRevoked();
        if (isAppAuthenticated() && await verifySessionStillValid()) {
            ensureAppVisible();
            initAppAfterUnlock();
            resetInactivityTimer();
            startPinVersionWatch();
        } else {
            showPinProtection();
        }
    })();

    lockPortraitForApp();
    if ((location.protocol === 'http:' || location.protocol === 'https:') && /^\d+\.\d+\.\d+\.\d+/.test(location.hostname)) {
        AppStorage.setRaw('last_office_lan_url', location.origin);
    }
};

/** Läuft in der nativen APK (WebView + JavascriptInterface „AndroidApp“)? */
function isNativeAndroidApp() {
    return typeof AndroidApp !== 'undefined';
}

function isAppleDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Handy / PWA / APK: Viewport, Tastatur, Touch */
function initMobileApp() {
    const root = document.documentElement;
    const setVH = () => {
        const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        root.style.setProperty('--vh', (h * 0.01) + 'px');
    };
    setVH();
    window.addEventListener('resize', setVH, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setVH, { passive: true });
    }
    const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const narrow = window.matchMedia('(max-width: 768px)').matches;
    if (coarse || narrow || isNativeAndroidApp()) root.classList.add('is-mobile');
    if (isAppleDevice()) {
        root.classList.add('is-ios');
        document.body.classList.add('is-ios');
    }
    if (isNativeAndroidApp()) initAndroidApkBridge();
    if (!isNativeAndroidApp()) {
        document.addEventListener('focusin', (e) => {
            if (!e.target.matches('input, select, textarea')) return;
            if (e.target.closest('.modal, .overlay')) return;
            setTimeout(() => {
                try { e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
            }, 300);
        }, { passive: true });
    }
}

/** Laufende Version = WEB_BUILD_VERSION in dieser script.js (nicht veralteter localStorage). */
function getRunningWebVersion() {
    return WEB_BUILD_VERSION;
}

function getInstalledWebVersion() {
    const stored = Number(AppStorage.getRaw('installed_web_version') || 0);
    if (stored > WEB_BUILD_VERSION) return WEB_BUILD_VERSION;
    return stored || WEB_BUILD_VERSION;
}

function recordInstalledWebVersion(ver) {
    const v = Number(ver) || WEB_BUILD_VERSION;
    if (v >= getRunningWebVersion()) {
        AppStorage.setRaw('installed_web_version', String(v));
    }
}

function syncInstalledWebVersionStorage() {
    const stored = Number(AppStorage.getRaw('installed_web_version') || 0);
    if (!stored || stored !== WEB_BUILD_VERSION) {
        AppStorage.setRaw('installed_web_version', String(WEB_BUILD_VERSION));
    }
}

function recordInstalledWebVersionFromPage() {
    syncInstalledWebVersionStorage();
    updateVersionSubtitle();
}

function updateVersionSubtitle() {
    const sub = document.querySelector('#app2_wrapper .head-subtitle');
    if (sub) sub.textContent = 'v' + getRunningWebVersion() + ' · Logistik & Rechner';
}

function setUpdateAvailableUI(visible, remoteVer) {
    document.querySelectorAll('.header-update-chip').forEach((chip) => {
        chip.style.display = visible ? 'inline-flex' : 'none';
        if (visible && remoteVer) chip.textContent = 'UPDATE v' + remoteVer;
    });
    document.querySelectorAll('.update-available-chip.menu-chip').forEach((chip) => {
        chip.style.display = visible ? 'inline-flex' : 'none';
        if (visible) chip.textContent = 'NEU';
    });
    const menuWlan = document.getElementById('menu-wlan-update-item');
    if (menuWlan) {
        menuWlan.classList.toggle('has-app-update', !!visible);
    }
}

function openOtaUpdatePrompt() {
    if (pendingOtaUpdate) {
        showOtaUpdateModal(pendingOtaUpdate.remoteVer, pendingOtaUpdate.remoteBase, pendingOtaUpdate.webBase);
    } else {
        checkForWebUpdate(true);
    }
}

function isBundledApkPage() {
    if (!isNativeAndroidApp()) return false;
    if (location.protocol === 'file:') return true;
    return /android_asset/i.test(location.href);
}

function normalizeOtaBase(url) {
    return String(url || '').replace(/\/$/, '');
}

async function probeOtaBase(base) {
    const b = normalizeOtaBase(base);
    if (!b) return false;
    try {
        await fetchJsonNoCache(b + '/app-version.json?t=' + Date.now());
        return true;
    } catch (_) {
        return false;
    }
}

async function readOtaVersion(base) {
    try {
        const v = await fetchJsonNoCache(normalizeOtaBase(base) + '/app-version.json?t=' + Date.now());
        return Number(v?.webVersion || 0);
    } catch (_) {
        return 0;
    }
}

/** Büro-LAN bevorzugen, wenn dort die gleiche oder neuere Version liegt. */
async function pickBestOtaInstallBase(webBase, officeBase) {
    const web = normalizeOtaBase(webBase);
    const office = normalizeOtaBase(officeBase);
    const webOk = web && await probeOtaBase(web);
    const officeOk = office && await probeOtaBase(office);
    let webVer = 0;
    let officeVer = 0;
    if (webOk) webVer = await readOtaVersion(web);
    if (officeOk) officeVer = await readOtaVersion(office);
    if (officeOk && officeVer >= webVer) return office;
    if (webOk) return web;
    if (officeOk) return office;
    return pickReachableOtaBase([office, web]);
}

async function pickReachableOtaBase(candidates) {
    const seen = new Set();
    for (const raw of candidates) {
        const base = normalizeOtaBase(raw);
        if (!base || seen.has(base)) continue;
        seen.add(base);
        if (await probeOtaBase(base)) return base;
    }
    return '';
}

async function getOtaConfigBases() {
    let office = normalizeOtaBase(OFFICE_LAN_URL);
    let web = normalizeOtaBase(OTA_REMOTE_CONFIG_URL.replace(/\/app-update\.json$/i, ''));
    const configUrls = [getOtaConfigUrl(), OTA_REMOTE_CONFIG_URL];
    for (const url of configUrls) {
        if (!url) continue;
        try {
            const cfg = await fetchJsonNoCache(url + '?t=' + Date.now());
            if (cfg?.officeWebBaseUrl) office = normalizeOtaBase(cfg.officeWebBaseUrl);
            if (cfg?.webBaseUrl) web = normalizeOtaBase(cfg.webBaseUrl);
        } catch (_) {}
    }
    try {
        const bundled = await loadBundledOtaConfig();
        if (bundled?.officeWebBaseUrl) office = normalizeOtaBase(bundled.officeWebBaseUrl);
        if (bundled?.webBaseUrl) web = normalizeOtaBase(bundled.webBaseUrl);
    } catch (_) {}
    return { office, web };
}

function navigateToOtaUrl(url) {
    try {
        if (typeof AndroidApp !== 'undefined' && typeof AndroidApp.clearWebViewCache === 'function') {
            AndroidApp.clearWebViewCache();
        }
    } catch (_) {}
    try {
        if (typeof AndroidApp !== 'undefined' && typeof AndroidApp.loadUrl === 'function') {
            AndroidApp.loadUrl(url);
            return;
        }
    } catch (_) {}
    location.replace(url);
}

async function initOtaApkBootstrap() {
    if (!isBundledApkPage() || !navigator.onLine) return false;
    const saved = AppStorage.getRaw('ota_web_base_url');
    const { office, web } = await getOtaConfigBases();
    const installBase = await pickBestOtaInstallBase(web, office);
    if (!installBase) return false;
    try {
        const v = await fetchJsonNoCache(installBase + '/app-version.json?t=' + Date.now());
        const remoteVer = Number(v?.webVersion || 0);
        const shouldUseWeb = remoteVer > getRunningWebVersion() || (saved && normalizeOtaBase(saved) === installBase);
        if (!shouldUseWeb) return false;
        AppStorage.setRaw('ota_web_base_url', installBase);
        navigateToOtaUrl(installBase + '/index.html?t=' + Date.now());
        return true;
    } catch (_) {
        return false;
    }
}

/** Kein Server-Abruf beim Start – nur lokaler Versionsstand; APK springt bei Bedarf auf Web-URL. */
function initOtaUpdateWatch() {
    syncInstalledWebVersionStorage();
    recordInstalledWebVersionFromPage();
    if (location.protocol === 'https:' || location.protocol === 'http:') {
        if (!isBundledApkPage()) {
            AppStorage.setRaw('ota_web_base_url', normalizeOtaBase(location.origin));
        }
        recordInstalledWebVersion(getRunningWebVersion());
    }
}

let _otaCheckBusy = false;

/** Menü: einmal online prüfen, ob eine neuere webVersion da ist. */
function checkForWebUpdateManual() {
    if (_otaCheckBusy) return;
    _otaCheckBusy = true;
    try {
        if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
        checkForWebUpdate(true).catch((e) => {
            console.error('Update-Prüfung fehlgeschlagen', e);
            showOtaInfoModal('Update-Prüfung', 'Die Prüfung ist fehlgeschlagen.<br>Bitte Internet/WLAN prüfen und erneut versuchen.', '⚠️');
        }).finally(() => { _otaCheckBusy = false; });
    } catch (e) {
        _otaCheckBusy = false;
        console.error('Update-Prüfung fehlgeschlagen', e);
        showOtaInfoModal('Update-Prüfung', 'Die Prüfung ist fehlgeschlagen. Bitte Internet/WLAN prüfen und erneut versuchen.', '⚠️');
    }
}
window.checkForWebUpdateManual = checkForWebUpdateManual;
window.openOtaUpdatePrompt = openOtaUpdatePrompt;

/** Rechner-Menü: Update manuell vom Laptop im WLAN laden. */
function loadWlanUpdateNow() {
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    const base = (AppStorage.getRaw('last_office_lan_url') || OFFICE_LAN_URL).replace(/\/$/, '');
    if (!navigator.onLine) {
        showToast('Kein Netz – bitte WLAN prüfen.', 'error');
        return;
    }
    AppStorage.remove('ota_banner_dismissed');
    showToast('Lade Update vom Laptop …', 'info');
    location.href = base + '/index.html?t=' + Date.now();
}

function hideOtaUpdateModal() {
    const modal = document.getElementById('ota-update-modal');
    if (modal) modal.style.display = 'none';
}

async function applyOtaUpdate(remoteVer, remoteBase, webBase) {
    const confirmBtn = document.getElementById('ota-update-confirm');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Wird geladen …';
    }
    const { office, web } = await getOtaConfigBases();
    const installBase = await pickBestOtaInstallBase(webBase || web, remoteBase || office);
    if (!installBase) {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Jetzt installieren';
        }
        showOtaInfoModal(
            'Install fehlgeschlagen',
            'Weder GitHub noch Büro-Server erreichbar.<br>Bitte Internet/WLAN prüfen – im Büro Laptop mit <code>start-buero-server.ps1</code> starten.',
            '⚠️'
        );
        return;
    }
    hideOtaUpdateModal();
    setUpdateAvailableUI(false);
    AppStorage.remove('ota_banner_dismissed');
    AppStorage.setRaw('ota_web_base_url', installBase);
    pendingOtaUpdate = null;
    navigateToOtaUrl(installBase + '/index.html?t=' + Date.now());
}

function restoreOtaUpdateModalLayout() {
    const modal = document.getElementById('ota-update-modal');
    if (!modal) return;
    const h2 = modal.querySelector('h2');
    const textEl = document.getElementById('ota-update-text');
    const verEl = document.getElementById('ota-update-ver');
    const confirmBtn = document.getElementById('ota-update-confirm');
    const laterBtn = document.getElementById('ota-update-later');
    const iconEl = modal.querySelector('.ota-update-icon');
    if (h2) h2.textContent = 'App-Update verfügbar';
    if (iconEl) iconEl.textContent = '📲';
    if (textEl) {
        textEl.innerHTML = 'Version <strong id="ota-update-ver">—</strong> ist bereit.<br>Nach dem Bestätigen wird die neue Version installiert.';
    }
    if (confirmBtn) {
        confirmBtn.textContent = 'Jetzt installieren';
        confirmBtn.style.display = '';
        confirmBtn.style.background = '';
    }
    if (laterBtn) laterBtn.style.display = '';
}

function showOtaInfoModal(title, message, icon) {
    const modal = document.getElementById('ota-update-modal');
    if (!modal) {
        showToast(message, 'info');
        return;
    }
    restoreOtaUpdateModalLayout();
    const h2 = modal.querySelector('h2');
    const textEl = document.getElementById('ota-update-text');
    const confirmBtn = document.getElementById('ota-update-confirm');
    const laterBtn = document.getElementById('ota-update-later');
    const iconEl = modal.querySelector('.ota-update-icon');
    if (h2) h2.textContent = title;
    if (iconEl) iconEl.textContent = icon || '✓';
    if (textEl) textEl.innerHTML = message;
    if (confirmBtn) {
        confirmBtn.textContent = 'OK';
        confirmBtn.style.background = 'var(--primary)';
        confirmBtn.onclick = () => hideOtaUpdateModal();
    }
    if (laterBtn) laterBtn.style.display = 'none';
    modal.style.display = 'flex';
}

function showOtaUpdateModal(remoteVer, remoteBase, webBase) {
    const modal = document.getElementById('ota-update-modal');
    const confirmBtn = document.getElementById('ota-update-confirm');
    const laterBtn = document.getElementById('ota-update-later');
    if (!modal || !confirmBtn) return;
    restoreOtaUpdateModalLayout();
    const verEl = document.getElementById('ota-update-ver');
    pendingOtaUpdate = { remoteVer, remoteBase, webBase };
    if (verEl) verEl.textContent = String(remoteVer);
    modal.style.display = 'flex';
    setUpdateAvailableUI(true, remoteVer);
    confirmBtn.disabled = false;
    confirmBtn.onclick = () => applyOtaUpdate(remoteVer, remoteBase, webBase);
    if (laterBtn) {
        laterBtn.style.display = '';
        laterBtn.onclick = () => {
            AppStorage.setRaw('ota_banner_dismissed', String(remoteVer));
            hideOtaUpdateModal();
        };
    }
}

async function fetchJsonNoCache(url) {
    try {
        const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    } catch (fetchErr) {
        return fetchJsonViaXhr(url);
    }
}

function fetchJsonViaXhr(url) {
    return new Promise((resolve, reject) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'json';
            xhr.timeout = 15000;
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.response || JSON.parse(xhr.responseText || '{}'));
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            };
            xhr.onerror = () => reject(new Error('Netzwerkfehler'));
            xhr.ontimeout = () => reject(new Error('Timeout'));
            xhr.send();
        } catch (e) {
            reject(e);
        }
    });
}

async function loadBundledOtaConfig() {
    const paths = [
        'app-update.json',
        './app-update.json',
        'file:///android_asset/app-update.json'
    ];
    for (const p of paths) {
        try {
            const cfg = await fetchJsonNoCache(p + '?t=' + Date.now());
            if (cfg && Number(cfg.webVersion)) return cfg;
        } catch (_) {}
    }
    return null;
}

async function fetchRemoteUpdateVersion() {
    let remoteVer = 0;
    let officeBase = normalizeOtaBase(OFFICE_LAN_URL);
    let webBase = normalizeOtaBase(OTA_REMOTE_CONFIG_URL.replace(/\/app-update\.json$/i, ''));
    const configUrls = [];
    const primary = getOtaConfigUrl();
    if (primary) configUrls.push(primary);
    if (!configUrls.includes(OTA_REMOTE_CONFIG_URL)) configUrls.push(OTA_REMOTE_CONFIG_URL);

    for (const baseUrl of configUrls) {
        try {
            const cfg = await fetchJsonNoCache(baseUrl + '?t=' + Date.now());
            remoteVer = Math.max(remoteVer, Number(cfg?.webVersion || 0));
            if (cfg?.officeWebBaseUrl) officeBase = normalizeOtaBase(cfg.officeWebBaseUrl);
            if (cfg?.webBaseUrl) webBase = normalizeOtaBase(cfg.webBaseUrl);
        } catch (e) {
            console.warn('OTA config fetch failed:', baseUrl, e);
        }
    }

    if (!remoteVer) {
        try {
            const bundled = await loadBundledOtaConfig();
            if (bundled) {
                remoteVer = Number(bundled.webVersion || 0);
                if (bundled.officeWebBaseUrl) officeBase = normalizeOtaBase(bundled.officeWebBaseUrl);
                if (bundled.webBaseUrl) webBase = normalizeOtaBase(bundled.webBaseUrl);
            }
        } catch (_) {}
    }

    if (navigator.onLine) {
        for (const candidate of [officeBase, webBase]) {
            if (!candidate) continue;
            try {
                const v = await fetchJsonNoCache(candidate + '/app-version.json?t=' + Date.now());
                remoteVer = Math.max(remoteVer, Number(v?.webVersion || 0));
            } catch (_) {}
        }
    }

    const remoteBase = await pickBestOtaInstallBase(webBase, officeBase);
    return { remoteVer, remoteBase, webBase, officeBase };
}

async function checkForWebUpdate(manual) {
    const modal = document.getElementById('ota-update-modal');
    if (!modal) {
        if (manual) showToast('Update-Dialog fehlt – Seite neu laden.', 'error');
        return;
    }
    if (!navigator.onLine) {
        hideOtaUpdateModal();
        setUpdateAvailableUI(false);
        pendingOtaUpdate = null;
        if (manual) {
            showOtaInfoModal('Kein Netz', 'Ohne Internet/WLAN kann nicht geprüft werden.<br>Im Büro-WLAN alternativ über den Laptop-Server laden.', '⚠️');
        }
        return;
    }

    const installedVer = getRunningWebVersion();
    let remoteVer = 0;
    let remoteBase = '';
    let webBase = '';
    try {
        ({ remoteVer, remoteBase, webBase } = await fetchRemoteUpdateVersion());
    } catch (e) {
        console.error('Update-Server Fehler', e);
    }
    if (!remoteVer) {
        hideOtaUpdateModal();
        setUpdateAvailableUI(false);
        pendingOtaUpdate = null;
        if (manual) {
            showOtaInfoModal('Server nicht erreichbar', 'GitHub oder Büro-Server antwortet nicht.<br>Bitte WLAN/Internet prüfen oder später erneut versuchen.', '⚠️');
        }
        return;
    }

    const dismissed = Number(AppStorage.getRaw('ota_banner_dismissed') || 0);
    if (remoteVer <= installedVer) {
        hideOtaUpdateModal();
        setUpdateAvailableUI(false);
        pendingOtaUpdate = null;
        if (manual) {
            showOtaInfoModal('App ist aktuell', 'Du hast bereits die neueste Version <strong>v' + installedVer + '</strong>.', '✓');
        }
        return;
    }

    pendingOtaUpdate = { remoteVer, remoteBase, webBase };
    setUpdateAvailableUI(true, remoteVer);

    if (!manual && dismissed >= remoteVer) {
        hideOtaUpdateModal();
        return;
    }

    showOtaUpdateModal(remoteVer, remoteBase, webBase);
}

/** APK: Statusleiste, Zurück-Taste, Portrait – siehe ANDROID_APK.md */
function initAndroidApkBridge() {
    document.documentElement.classList.add('is-android-app');
    document.body.classList.add('is-android-app');
    window.handleAndroidBackPress = handleAndroidBackPress;
    applyAndroidSafeAreaInsets();
    setTimeout(applyAndroidSafeAreaInsets, 400);
}

function applyAndroidSafeAreaInsets() {
    if (!isNativeAndroidApp()) return;
    try {
        const top = Math.min(Math.max(Number(AndroidApp.getStatusBarHeightPx?.() || 0), 24), 40);
        const bottom = Math.min(Number(AndroidApp.getNavigationBarHeightPx?.() || 0), 48);
        document.documentElement.style.setProperty('--safe-top', top + 'px');
        if (bottom > 0) document.documentElement.style.setProperty('--safe-bottom', bottom + 'px');
    } catch (_) {}
}

/**
 * Von der APK bei hardware back aufgerufen (WebView.evaluateJavascript).
 * @returns {boolean} true = Web-App hat zurück verarbeitet, Activity nicht beenden
 */
function handleAndroidBackPress() {
    const pin = document.getElementById('pin-protection-overlay');
    if (pin && getComputedStyle(pin).display !== 'none') {
        return true;
    }
    const calc = document.getElementById('calc-modal');
    if (calc && getComputedStyle(calc).display === 'flex') {
        if (typeof toggleCalc === 'function') toggleCalc(false);
        else calc.style.display = 'none';
        return true;
    }
    for (const m of document.querySelectorAll('.modal')) {
        if (getComputedStyle(m).display === 'flex') {
            m.style.display = 'none';
            return true;
        }
    }
    const drawer2 = document.getElementById('drawer2');
    if (drawer2 && drawer2.classList.contains('open')) {
        if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
        return true;
    }
    const drawer1 = document.getElementById('drawer');
    if (drawer1 && drawer1.classList.contains('open')) {
        if (typeof toggleMenuApp1 === 'function') toggleMenuApp1(false);
        return true;
    }
    const overlay2 = document.getElementById('overlay2');
    if (overlay2 && overlay2.style.display === 'block') {
        if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
        return true;
    }
    const overlay1 = document.getElementById('overlay');
    if (overlay1 && overlay1.style.display === 'block') {
        if (typeof toggleMenuApp1 === 'function') toggleMenuApp1(false);
        return true;
    }
    return false;
}

function lockPortraitForApp() {
    const lock = isNativeAndroidApp()
        || window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    if (!lock) return;
    try {
        if (isNativeAndroidApp() && typeof AndroidApp.lockPortrait === 'function') {
            AndroidApp.lockPortrait();
            return;
        }
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
            screen.orientation.lock('portrait-primary').catch(() => {});
            screen.orientation.addEventListener('change', () => {
                if (!screen.orientation.type.startsWith('portrait')) {
                    screen.orientation.lock('portrait-primary').catch(() => {});
                }
            });
        }
    } catch (_) {}
}

// Dunkelmodus: dynamische Elemente — Header/Tabs/Drawer nur per CSS (body.dark-mode)
function applyHeaderDarkModeFix(isDark) {
    const scanStatusEl = document.getElementById('brandenburg-scan-status');
    if (scanStatusEl) {
        scanStatusEl.style.background = isDark ? '#2c2c2c' : '';
        scanStatusEl.style.color = isDark ? '#e0e0e0' : '';
    }
    const leergutContainer = document.getElementById('bb-e2')?.parentElement?.parentElement;
    if (leergutContainer) {
        leergutContainer.style.background = isDark ? '#252525' : '';
        leergutContainer.style.border = isDark ? '1px solid #444' : '';
    }
}

function clearStaleDarkModeInlineStyles() {
    document.querySelectorAll('header, #drawer, #drawer2').forEach(el => {
        el.style.removeProperty('background');
    });
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    AppStorage.setRaw('kombi_dark_mode', isDark);
    updateDarkModeIcons(isDark);
    clearStaleDarkModeInlineStyles();
    applyHeaderDarkModeFix(isDark);
}
function updateDarkModeIcons(isDark) { document.querySelectorAll('.dark-mode-icon').forEach(el => el.innerText = isDark ? '☀️' : '🌙'); }

// CLOUD SYNC
// Logistik Pro: komplette kombi_logistik_db + Nölke-Produktliste hoch/runter
// Rechner: nur Lieferanten, Sorten (articles), Nölke-Produkte – Tageslisten bleiben lokal
// LKW-Rechner-Liste: nur über „LKW Senden“ / „LKW Empfangen“ (_shared_lkw.json)

function getLogistikFullCloudPayload() {
    const lData = AppStorage.get('kombi_logistik_db', {});
    const rData = AppStorage.get('kombi_rechner_db', {});
    const safeSettings = { ...(lData.settings || {}) };
    delete safeSettings.logistikPin;
    delete safeSettings.adminPin;
    delete safeSettings.pinVersion;
    const payload = {
        suppliers: lData.suppliers || [],
        customers: lData.customers || [],
        articles: lData.articles || [],
        lose: lData.lose || [],
        todo: lData.todo || [],
        later: lData.later || [],
        hidden: lData.hidden || [],
        workers: lData.workers || [],
        deliveries: lData.deliveries || [],
        dailyStaff: lData.dailyStaff || {},
        dailyAttendance: lData.dailyAttendance || {},
        workerColors: lData.workerColors || {},
        checklistMorningTemplate: lData.checklistMorningTemplate || [],
        teamDayBrief: lData.teamDayBrief || null,
        savedProdukteRaw: rData.savedProdukteRaw || [],
        sonderTemplates: rData.sonderTemplates || []
    };
    if (Object.keys(safeSettings).length) payload.settings = safeSettings;
    if (lData.company) payload.company = lData.company;
    return payload;
}

function getRechnerStammdatenCloudPayload() {
    const lData = AppStorage.get('kombi_logistik_db', {});
    const rData = AppStorage.get('kombi_rechner_db', {});
    return {
        suppliers: lData.suppliers || [],
        articles: lData.articles || [],
        savedProdukteRaw: rData.savedProdukteRaw || [],
        sonderTemplates: rData.sonderTemplates || []
    };
}

function applyLogistikFullFromCloud(data) {
    if (!data || typeof data !== 'object') return false;
    const lDb = AppStorage.get('kombi_logistik_db', {});
    let changed = false;
    const setArr = (key) => { if (Array.isArray(data[key])) { lDb[key] = data[key]; changed = true; } };
    const setObj = (key) => { if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) { lDb[key] = data[key]; changed = true; } };
    setArr('suppliers'); setArr('customers'); setArr('articles');
    setArr('lose'); setArr('todo'); setArr('later'); setArr('hidden');
    setArr('workers'); setArr('deliveries');
    setArr('checklistMorningTemplate');
    setObj('dailyStaff'); setObj('dailyAttendance'); setObj('workerColors');
    setObj('teamDayBrief');
    if (data.settings && typeof data.settings === 'object') {
        if (revokeSessionIfPinChanged(data.settings)) return changed;
        const merged = { ...(lDb.settings || {}), ...data.settings };
        lDb.settings = merged;
        changed = true;
    }
    if (data.company) {
        lDb.company = data.company;
        if (lDb.company) sanitizeCompanyLeergut(lDb.company);
        changed = true;
    }
    if (changed) AppStorage.set('kombi_logistik_db', lDb);
    if (Array.isArray(data.savedProdukteRaw)) {
        const rDb = AppStorage.get('kombi_rechner_db', {});
        rDb.savedProdukteRaw = data.savedProdukteRaw;
        AppStorage.set('kombi_rechner_db', rDb);
        changed = true;
    }
    if (Array.isArray(data.sonderTemplates)) {
        const rDb = AppStorage.get('kombi_rechner_db', {});
        rDb.sonderTemplates = data.sonderTemplates;
        AppStorage.set('kombi_rechner_db', rDb);
        changed = true;
    }
    if (changed) {
        if (typeof syncMorningChecklistFromTemplate === 'function') syncMorningChecklistFromTemplate();
        if (typeof renderTeamDayBanner === 'function') renderTeamDayBanner();
    }
    return changed;
}

function applyRechnerStammdatenFromCloud(data) {
    if (!data || typeof data !== 'object') return false;
    let changed = false;
    const lDb = AppStorage.get('kombi_logistik_db', {});
    const rDb = AppStorage.get('kombi_rechner_db', {});
    if (Array.isArray(data.suppliers)) { lDb.suppliers = data.suppliers; changed = true; }
    if (Array.isArray(data.articles)) { lDb.articles = data.articles; changed = true; }
    if (Array.isArray(data.savedProdukteRaw)) { rDb.savedProdukteRaw = data.savedProdukteRaw; changed = true; }
    if (Array.isArray(data.sonderTemplates)) { rDb.sonderTemplates = data.sonderTemplates; changed = true; }
    if (Array.isArray(data.checklistMorningTemplate)) { lDb.checklistMorningTemplate = data.checklistMorningTemplate; changed = true; }
    if (data.teamDayBrief && typeof data.teamDayBrief === 'object') { lDb.teamDayBrief = data.teamDayBrief; changed = true; }
    if (changed) {
        AppStorage.set('kombi_logistik_db', lDb);
        AppStorage.set('kombi_rechner_db', rDb);
        if (typeof syncMorningChecklistFromTemplate === 'function') syncMorningChecklistFromTemplate();
        if (typeof renderTeamDayBanner === 'function') renderTeamDayBanner();
    }
    return changed;
}

function applyCloudSyncPayload(data) { return applyRechnerStammdatenFromCloud(data); }

let syncTimeout;
let pendingSyncMode = 'logistik';

function triggerAutoSync(mode) {
    pendingSyncMode = mode || 'logistik';
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        if (pendingSyncMode === 'rechner') silentPushRechnerStammdatenToCloud();
        else silentPushLogistikToCloud();
    }, 1500);
}

function silentPushLogistikToCloud() {
    if (!navigator.onLine || !isAppAuthenticated()) return;
    cloudFetch(APP_CONFIG.CLOUD_URL + ".json", {
        method: 'PATCH',
        body: JSON.stringify(getLogistikFullCloudPayload()),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => {
        if (res.ok && typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Logistik in Cloud gesichert [OK]");
    })
    .catch(() => {
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Logistik-Upload fehlgeschlagen");
    });
}

function silentPushRechnerStammdatenToCloud() {
    if (!navigator.onLine || !isAppAuthenticated()) return;
    cloudFetch(APP_CONFIG.CLOUD_URL + ".json", {
        method: 'PATCH',
        body: JSON.stringify(getRechnerStammdatenCloudPayload()),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => {
        if (res.ok && typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Rechner-Stammdaten hochgeladen [OK]");
    })
    .catch(() => {
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Stammdaten-Upload fehlgeschlagen");
    });
}

function silentPushToCloud() { silentPushLogistikToCloud(); }

async function pullLogistikFromCloud(silent) {
    if (!navigator.onLine || !isAppAuthenticated()) return;
    try {
        const res = await cloudFetch(APP_CONFIG.CLOUD_URL + ".json?t=" + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;
        if (data.settings && revokeSessionIfPinChanged(data.settings)) return;
        if (!applyLogistikFullFromCloud(data)) return;
        if (typeof loadLocalDB === 'function') loadLocalDB();
        if (typeof updateLiefDropdowns === 'function') updateLiefDropdowns();
        if (typeof addAppCloudLog === 'function') addAppCloudLog("DOWNLOAD: Logistik aus Cloud geladen [OK]");
        if (!silent) showToast("Logistik-Daten aus Cloud geladen!", "success");
    } catch (e) {
        if (!silent && typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Logistik-Download fehlgeschlagen");
    }
}

function addAppCloudLog(action) {
    let logs = AppStorage.get('logistik_cloud_logs', []);
    const now = new Date();
    const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const isErr = /fehler|error|nicht/i.test(action);
    const isOk = /\[OK\]|erfolg|gespeichert|geladen|empfangen/i.test(action);
    logs.unshift({ date, time, action, cls: isErr ? 'err' : isOk ? 'ok' : '' });
    if (logs.length > 50) logs.pop();
    AppStorage.set('logistik_cloud_logs', logs);
    renderAppCloudLogs();
}

function renderAppCloudLogs() {
    const list = document.getElementById('app-cloud-log-list');
    if (!list) return;
    let logs = AppStorage.get('logistik_cloud_logs', []);
    if (!Array.isArray(logs)) logs = [];
    if (logs.length === 0) {
        list.innerHTML = '<div class="activity-item"><span class="activity-time">—</span><span class="activity-msg">Noch keine Cloud-Aktionen</span></div>';
        return;
    }
    list.innerHTML = logs.map(l => {
        const entry = typeof l === 'string'
            ? { date: '', time: '', action: l.replace(/C:\\&gt;\s*/, ''), cls: '' }
            : l;
        const ts = entry.date && entry.time ? `${entry.date} ${entry.time}` : '—';
        return `<div class="activity-item"><span class="activity-time">${ts}</span><span class="activity-msg ${entry.cls || ''}">${entry.action}</span></div>`;
    }).join('');
}

function silentCloudSync() {
    if (!navigator.onLine || !isAppAuthenticated()) return;
    cloudFetch(APP_CONFIG.CLOUD_URL + ".json?t=" + Date.now())
    .then(res => res.json())
    .then(cloudData => {
        if (!cloudData) return;
        if (cloudData.settings && revokeSessionIfPinChanged(cloudData.settings)) return;
        if (isAppAuthenticated()) {
            if (applyLogistikFullFromCloud(cloudData)) {
                if (typeof loadLocalDB === 'function') loadLocalDB();
                if (typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Logistik empfangen [OK]");
                showToast("🔄 Logistik aus Cloud aktualisiert!", "success");
            }
        } else if (applyRechnerStammdatenFromCloud(cloudData)) {
            if (typeof loadLocalDB === 'function') loadLocalDB();
            if (typeof loadRechnerData === 'function') loadRechnerData();
            if (typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Stammdaten empfangen [OK]");
            showToast("🔄 Stammdaten aus Cloud aktualisiert!", "success");
        }
    }).catch(() => {
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Auto-Sync Download fehlgeschlagen");
    });
}

// Automatischen 3-Minuten-Sync deaktiviert (nur noch manuell über 🔄 Button)
// setInterval(silentCloudSync, 3 * 60 * 1000);

// UNIVERSAL DRUCKER – saubere HTML-Tabelle, kein Screenshot
function forcePrint(filename, htmlContent) {
    const content = htmlContent || (document.getElementById('printArea') || {}).innerHTML;
    if (!content || !content.trim()) {
        if (typeof showToast === 'function') showToast('Nichts zum Drucken!', 'warning');
        return;
    }

    const wasDark = document.body.classList.contains('dark-mode');
    if (wasDark) document.body.classList.remove('dark-mode');
    const restoreDark = () => { if (wasDark) document.body.classList.add('dark-mode'); };

    setTimeout(() => {
        const title = (filename || 'Druck').replace(/_/g, ' ');
        try {
            if (typeof AndroidApp !== 'undefined' && AndroidApp.printHtml) {
                AndroidApp.printHtml(title, '', content);
                setTimeout(restoreDark, 1500);
                return;
            }
            if (typeof AndroidApp !== 'undefined' && AndroidApp.printPage) {
                const printEl = document.getElementById('printArea');
                if (printEl) {
                    printEl.innerHTML = content;
                    printEl.style.display = 'block';
                    printEl.style.position = 'absolute';
                    printEl.style.top = '0';
                    printEl.style.left = '0';
                    printEl.style.width = '100%';
                    printEl.style.background = '#ffffff';
                    printEl.style.zIndex = '99999';
                }
                AndroidApp.printPage();
                setTimeout(() => {
                    if (printEl) printEl.style.cssText = '';
                    restoreDark();
                }, 8000);
                return;
            }
        } catch (e) {
            console.error('Native Android print call failed', e);
            if (typeof showToast === 'function') showToast('Drucken via App fehlgeschlagen, nutze Fallback...', 'warning');
        }

        if (typeof printCleanDocument === 'function') {
            printCleanDocument({ title, bodyHtml: content, onClose: restoreDark });
        } else {
            const printEl = document.getElementById('printArea');
            if (printEl) printEl.innerHTML = content;
            window.print();
            setTimeout(restoreDark, 8000);
        }
    }, 200);
}
function saveBlobAsFile(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

// ==========================================
// SPRACHSTEUERUNG (VOICE INPUT)
// ==========================================
window.currentVoiceTarget = null;

function startVoiceRecognition(targetId) {
    window.currentVoiceTarget = targetId;
    
    // 1. Prüfen, ob wir in der nativen Android-App sind
    if (typeof AndroidApp !== 'undefined') { 
        showToast("Mikrofon wird geladen...", "warning");
        AndroidApp.startVoiceInput();
    // 2. Fallback: Die eingebaute Browser-Spracherkennung nutzen (Chrome, Edge, Safari)
    } else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'de-DE'; // Auf Deutsch stellen
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function() { showToast("🎤 Bitte jetzt Gewicht sprechen...", "warning"); };
        recognition.onresult = function(event) { 
            const transcript = event.results[0][0].transcript; 
            setVoiceInputResult(transcript); 
        };
        recognition.onerror = function(event) { showToast("Spracherkennung fehlgeschlagen (" + event.error + ")", "error"); };
        
        recognition.start();
    } else {
        showToast("Dein Browser unterstützt leider keine Spracherkennung.", "error");
    }
}

// ==========================================
// LKW LIVE-TEILEN (Cloud-Zwischenablage)
// ==========================================
function shareLkwData() {
    const rDb = AppStorage.get('kombi_rechner_db', {});
    if (!rDb.entries || rDb.entries.length === 0) {
        showToast("Die LKW-Liste ist leer!", "warning");
        return;
    }
    
    const shareBtn = document.getElementById('btn-share-lkw');
    if(shareBtn) shareBtn.innerText = "⏳ Sende...";
    
    if (!isAppAuthenticated()) { showPinProtection(); return; }
    cloudFetch(APP_CONFIG.CLOUD_URL + "_shared_lkw.json", {
        method: 'PUT',
        body: JSON.stringify({ entries: rDb.entries, timestamp: Date.now() }),
        headers: { 'Content-Type': 'application/json' }
    }).then(res => {
        if(shareBtn) shareBtn.innerHTML = "📤 LKW Senden";
        if (res.ok) {
            showToast("LKW-Liste an Kollege gesendet!", "success");
        } else {
            showToast("Fehler beim Senden.", "error");
        }
    }).catch(e => {
        if(shareBtn) shareBtn.innerHTML = "📤 LKW Senden";
        showToast("Netzwerkfehler.", "error");
    });
}

function receiveLkwData() {
    const recBtn = document.getElementById('btn-receive-lkw');
    if(recBtn) recBtn.innerText = "⏳ Lade...";
    
    if (!isAppAuthenticated()) { showPinProtection(); return; }
    cloudFetch(APP_CONFIG.CLOUD_URL + "_shared_lkw.json?t=" + Date.now())
    .then(res => res.json())
    .then(data => {
        if(recBtn) recBtn.innerHTML = "📥 LKW Empfangen";
        if (!data || !data.entries) {
            showToast("Keine geteilten Daten gefunden.", "warning");
            return;
        }
        
        const ageMins = Math.round((Date.now() - (data.timestamp || 0)) / 60000);
        let ageText = ageMins === 0 ? "Gerade eben" : `Vor ${ageMins} Minute(n)`;
        
        customConfirm(`LKW-Liste vom Kollegen laden?\n(Geteilt: ${ageText})\n\nDie geteilten Paletten werden deiner aktuellen Liste hinzugefügt.`, () => {
            let rDb = AppStorage.get('kombi_rechner_db', {});
            if (!rDb.entries) rDb.entries = [];
            
            let addedCount = 0;
            const existingIds = new Set(rDb.entries.map(e => e.id));
            
            // Original-IDs beibehalten und nur komplett neue Paletten hinzufügen
            data.entries.forEach(e => {
                if (!existingIds.has(e.id)) {
                    rDb.entries.push(e);
                    existingIds.add(e.id);
                    addedCount++;
                }
            });
            
            AppStorage.set('kombi_rechner_db', rDb);
            if (typeof loadRechnerData === 'function') loadRechnerData();
            showToast(`${addedCount} neue Paletten ergänzt!`, "success");
        });
    })
    .catch(e => {
        if(recBtn) recBtn.innerHTML = "📥 LKW Empfangen";
        showToast("Fehler beim Laden.", "error");
    });
}

function initLkwShareButtons() {
    if(document.getElementById('lkw-share-bar')) return;
    
    // Wir suchen gezielt nach dem LKW-Tab, damit die Buttons nur dort erscheinen.
    // HINWEIS: Bitte passe 'tab-lkw' an die echte ID deines LKW-Tabs in der HTML an, falls er anders heißt!
    let targetContainer = document.getElementById('tab-lkw') || document.getElementById('lkw-tab') || document.getElementById('lkw-container');
    
    if(!targetContainer) {
        // AI-FIX: Fallback entfernt. Wenn der LKW-Tab nicht gefunden wird,
        // sollen die Buttons nicht an den Haupt-Wrapper angehängt werden,
        // da sie sonst auf allen Seiten erscheinen.
        return;
    }
    
    const bar = document.createElement('div');
    bar.id = 'lkw-share-bar';
    bar.style.cssText = "background: transparent; padding: 15px 10px 50px 10px; display: flex; justify-content: center; gap: 10px; border-top: 2px solid var(--border-color, #ddd); margin-top: 20px;";
    bar.innerHTML = `
        <button id="btn-share-lkw" onclick="shareLkwData()" style="flex:1; max-width:200px; padding:12px; background:#004b93; color:white; border:none; border-radius:6px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">📤 LKW Senden</button>
        <button id="btn-receive-lkw" onclick="receiveLkwData()" style="flex:1; max-width:200px; padding:12px; background:#4caf50; color:white; border:none; border-radius:6px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">📥 LKW Empfangen</button>
    `;
    targetContainer.appendChild(bar);
}

function setVoiceInputResult(text) {
    if (!window.currentVoiceTarget) return;
    
    if (window.currentVoiceTarget === 'input-adhoc' || window.currentVoiceTarget === 'input-morning') {
        const inputEl = document.getElementById(window.currentVoiceTarget);
        if (inputEl) {
            inputEl.value = text;
            showToast("Text erkannt!", "success");
        }
        return;
    }
    
    let numberMatch = text.replace(',', '.').match(/\d+(\.\d+)?/);
    if (numberMatch) {
        const inputEl = document.getElementById(window.currentVoiceTarget);
        if (inputEl) {
            inputEl.value = numberMatch[0];
            inputEl.dispatchEvent(new Event('input', { bubbles: true })); // Löst automatische Berechnungen aus!
        }
        showToast("Gewicht erkannt: " + numberMatch[0] + " kg", "success");
    } else {
        showToast("Keine Zahl verstanden (" + text + ")", "warning");
    }
}
