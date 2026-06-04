// =========================================================================
// ZENTRALE KONFIGURATION (CLOUD)
// =========================================================================
const APP_CONFIG = {
    CLOUD_URL: localStorage.getItem('custom_cloud_url') || "https://tresch-versand-default-rtdb.firebaseio.com/backup",
    LOGISTIK_PIN: "110784",
    NOTIFICATION_URL: "https://formspree.io/f/xrejnkgq"
};

const APP_VERSION = "7.1";
/** Muss mit app-version.json webVersion Ã¼bereinstimmen (publish-ota.ps1). */
const WEB_BUILD_VERSION = 90;
/** BÃ¼ro-WLAN â€“ IP bei Bedarf anpassen (muss zu app-shell.json passen). */
const OFFICE_LAN_URL = 'http://192.168.2.204:8080';
let pendingOtaUpdate = null;
const APP_CHANGELOG = "<b>Was ist neu in 7.1?</b><br><br>â€¢ ðŸ“² <b>OTA-Updates:</b> App kann sich von eurem Web-Server aktualisieren â€“ keine neue APK fÃ¼r jedes HTML/JS-Update.<br>â€¢ ðŸŽ¨ <b>Handy-Layout:</b> Scrollen und Safe-Area in der APK verbessert.";
/** APK (file://): Update-Config nur bei manueller PrÃ¼fung â€“ nicht beim Start. */
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

/** WK2 nur in control test.html â€“ in der Kombi-App wieder Herta-Standard */
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

    console.log("FÃ¼hre Daten-Migration aus: Bereinige Daten-SchlÃ¼ssel...");
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

function showPinProtection() {
    const overlay = document.getElementById('pin-protection-overlay');
    if (!overlay) return;
    
    overlay.style.display = 'flex';
    const pinInput = document.getElementById('pin-input');
    const pinSubmit = document.getElementById('pin-submit-btn');
    const attemptsMsg = document.getElementById('pin-attempts-msg');
    const emailBtn = document.getElementById('pin-email-btn');
    const title = document.getElementById('pin-title');
    const desc = document.getElementById('pin-desc');
    
    pinInput.value = '';

    let failedAttempts = parseInt(AppStorage.getRaw('logistik_pin_fails') || '0');
    const maxAttempts = 2;

    const updateUI = () => {
        if (failedAttempts >= maxAttempts) {
            let activePuk = AppStorage.getRaw('logistik_current_puk');
            if (!activePuk) {
                activePuk = Math.floor(10000000 + Math.random() * 90000000).toString();
                AppStorage.setRaw('logistik_current_puk', activePuk);
            }
            title.innerText = "App Gesperrt!"; title.style.color = "#ff4444";
            desc.innerText = "Zu viele Fehlversuche. Bitte PUK eingeben oder Admin kontaktieren.";
            if(attemptsMsg) attemptsMsg.style.display = 'none';
            if(emailBtn) {
                emailBtn.style.display = 'block'; emailBtn.disabled = false;
                emailBtn.innerText = "Admin kontaktieren"; emailBtn.style.background = "#4285F4";
                emailBtn.onclick = () => {
                    showToast("Sende E-Mail an Admin...", "warning");
                    emailBtn.disabled = true; emailBtn.innerText = "â³ Sende...";
                    fetch(getAppSetting('notificationUrl', APP_CONFIG.NOTIFICATION_URL), { 
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ Betreff: "ðŸš¨ PUK BenÃ¶tigt!", Nachricht: "App gesperrt.", PUK: activePuk, Zeit: new Date().toLocaleString('de-DE') })
                    }).then(res => {
                        if (res.ok) { showToast("Admin benachrichtigt!", "success"); emailBtn.innerText = "Benachrichtigt âœ“"; emailBtn.style.background = "var(--success)"; } 
                        else { showToast("Fehler beim Versand.", "error"); emailBtn.disabled = false; emailBtn.innerText = "Erneut versuchen"; }
                    }).catch(() => { showToast("Netzwerkfehler.", "error"); emailBtn.disabled = false; emailBtn.innerText = "Erneut versuchen"; });
                };
            }
        } else {
            title.innerText = "Logistik-Bereich gesperrt"; title.style.color = "white"; desc.innerText = "Bitte Admin-PIN eingeben";
            if (attemptsMsg) { if (failedAttempts > 0) { attemptsMsg.innerText = `Noch ${maxAttempts - failedAttempts} Versuch(e)`; attemptsMsg.style.display = 'block'; } else { attemptsMsg.style.display = 'none'; } }
            if(emailBtn) emailBtn.style.display = 'none';
        }
    };

    updateUI();

    const checkPin = () => {
        if (failedAttempts >= maxAttempts) {
            const activePuk = AppStorage.getRaw('logistik_current_puk');
            if (pinInput.value === activePuk) {
                failedAttempts = 0; AppStorage.setRaw('logistik_pin_fails', '0'); AppStorage.remove('logistik_current_puk');
                sessionStorage.setItem('logistik_authenticated', 'true'); pinInput.value = '';
                sendNotification("ðŸ”“ Entsperrt", "App wurde mit PUK entsperrt.");
                updateUI(); overlay.style.display = 'none'; resetInactivityTimer(); switchApp(1); showToast("Erfolgreich entsperrt!", "success");
            } else { showToast("PUK falsch!", "error"); pinInput.value = ""; pinInput.focus(); }
            return;
        }

        const validPin = getAppSetting('logistikPin', APP_CONFIG.LOGISTIK_PIN);
        if (pinInput.value === validPin) {
            failedAttempts = 0; AppStorage.setRaw('logistik_pin_fails', '0'); sessionStorage.setItem('logistik_authenticated', 'true');
            pinInput.value = ''; sendNotification("âœ… Login", "Erfolgreicher PIN Login."); updateUI();
            overlay.style.display = 'none'; resetInactivityTimer(); switchApp(1);
        } else {
            failedAttempts++; AppStorage.setRaw('logistik_pin_fails', failedAttempts.toString());
            showToast("PIN falsch!", "error"); pinInput.value = ""; updateUI(); pinInput.focus();
        }
    };
    pinSubmit.onclick = checkPin; pinInput.onkeyup = (event) => { if (event.key === 'Enter') { event.preventDefault(); checkPin(); } }; pinInput.focus();
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
    if (e.target.closest('.swipe-bg')) return; // Klicks auf den LÃ¶sch-Button nicht durch den Swipe-Reset blockieren
    
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
    if (sessionStorage.getItem('logistik_authenticated') === 'true') {
        const timeoutMinutes = getAppSetting('inactivityTimeout', 10);
        inactivityTimer = setTimeout(() => { logoutLogistik(true); }, timeoutMinutes * 60 * 1000);
    }
}
['touchstart', 'click', 'keypress', 'scroll'].forEach(evt => document.addEventListener(evt, resetInactivityTimer, true));

// APP WECHSEL
function switchApp(appNum) {
    if (appNum === 1) {
        if (sessionStorage.getItem('logistik_authenticated') !== 'true') { showPinProtection(); return; }
        document.getElementById('app2_wrapper').style.display = 'none'; document.getElementById('app1_wrapper').style.display = 'block';
        if (typeof checkBackupReminder === 'function') checkBackupReminder();
        if (typeof pullLogistikFromCloud === 'function') pullLogistikFromCloud(true);
    } else {
        document.getElementById('app1_wrapper').style.display = 'none'; document.getElementById('app2_wrapper').style.display = 'flex'; if(typeof toggleMenuApp1 === 'function') toggleMenuApp1(false);
    }
}
function logoutLogistik(auto = false) { sessionStorage.removeItem('logistik_authenticated'); if(typeof toggleMenuApp1 === 'function') toggleMenuApp1(false); switchApp(2); if (auto === true) showToast("Automatisch gesperrt (InaktivitÃ¤t).", "warning"); else showToast("Erfolgreich gesperrt.", "success"); }

/** Entfernt Service Worker + Cache API â€“ Ursache fuer "Speicher voll" bei Server-Betrieb. */
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
    showToast('App-Cache geleert. Seite wird neu geladen â€¦', 'success');
    setTimeout(() => location.reload(true), 600);
}

// START LOGIK
window.onload = () => { 
    initLeanStorageHygiene();

    // HARD-CACHE PURGE V7 (BETA MERGE): Zwingt Browser/Tablets, alte Beta-Dateien und fehlerhafte Versionen endgÃ¼ltig zu verwerfen.
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

    document.getElementById('app1_wrapper').style.display = 'none'; document.getElementById('app2_wrapper').style.display = 'flex';
    if (document.getElementById('selectedWorkDate')) { document.getElementById('selectedWorkDate').value = getLocalISO(); document.getElementById('selectedWorkDate').onchange = renderApp1; }
    if (typeof loadLocalDB === 'function') loadLocalDB(); if (typeof loadRechnerData === 'function') loadRechnerData(); if (typeof loadAllFromCloud === 'function') loadAllFromCloud(); if (typeof initCalc === 'function') initCalc(); 
    if (AppStorage.getRaw('kombi_dark_mode') === 'true') { document.body.classList.add('dark-mode'); updateDarkModeIcons(true); applyHeaderDarkModeFix(true); }
    resetInactivityTimer();
    if (typeof renderAppCloudLogs === 'function') renderAppCloudLogs();
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    
    initLkwShareButtons();

    // Initiales Setzen des Update-Wachhundes
    if (!AppStorage.getRaw('last_update_push')) {
        AppStorage.setRaw('last_update_push', Date.now().toString());
    }

    // NEU: Update Changelog Modal anzeigen
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

    lockPortraitForApp();
    if ((location.protocol === 'http:' || location.protocol === 'https:') && /^\d+\.\d+\.\d+\.\d+/.test(location.hostname)) {
        AppStorage.setRaw('last_office_lan_url', location.origin);
    }
};

/** LÃ¤uft in der nativen APK (WebView + JavascriptInterface â€žAndroidAppâ€œ)? */
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
            setTimeout(() => {
                try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
            }, 350);
        }, { passive: true });
    }
}

function getInstalledWebVersion() {
    return Number(AppStorage.getRaw('installed_web_version') || WEB_BUILD_VERSION);
}

function recordInstalledWebVersion(ver) {
    const v = Number(ver) || WEB_BUILD_VERSION;
    if (v >= getInstalledWebVersion()) {
        AppStorage.setRaw('installed_web_version', String(v));
    }
}

function recordInstalledWebVersionFromPage() {
    const v = getInstalledWebVersion() || WEB_BUILD_VERSION;
    recordInstalledWebVersion(v);
    updateVersionSubtitle(v);
}

function updateVersionSubtitle(installedVer) {
    const sub = document.querySelector('#app2_wrapper .head-subtitle');
    if (sub && /Layout v\d+|WLAN v\d+/.test(sub.textContent)) {
        sub.textContent = 'Version ' + installedVer + ' Â· Produktion & Touren';
    }
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
        showOtaUpdateModal(pendingOtaUpdate.remoteVer, pendingOtaUpdate.remoteBase);
    } else {
        checkForWebUpdate(true);
    }
}

/** Kein Server-Abruf beim Start â€“ nur lokaler Versionsstand (GitHub nur per Knopf). */
function initOtaUpdateWatch() {
    if (!AppStorage.getRaw('installed_web_version')) {
        recordInstalledWebVersion(WEB_BUILD_VERSION);
    }
    recordInstalledWebVersionFromPage();
}

/** MenÃ¼: einmal online prÃ¼fen, ob eine neuere webVersion da ist. */
function checkForWebUpdateManual() {
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    showToast('PrÃ¼fe auf App-Update â€¦', 'info');
    checkForWebUpdate(true);
}

/** Rechner-MenÃ¼: Update manuell vom Laptop im WLAN laden. */
function loadWlanUpdateNow() {
    if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    const base = (AppStorage.getRaw('last_office_lan_url') || OFFICE_LAN_URL).replace(/\/$/, '');
    if (!navigator.onLine) {
        showToast('Kein Netz â€“ bitte WLAN prÃ¼fen.', 'error');
        return;
    }
    AppStorage.remove('ota_banner_dismissed');
    showToast('Lade Update vom Laptop â€¦', 'info');
    location.href = base + '/index.html?t=' + Date.now();
}

function hideOtaUpdateModal() {
    const modal = document.getElementById('ota-update-modal');
    if (modal) modal.style.display = 'none';
}

function applyOtaUpdate(remoteVer, remoteBase) {
    hideOtaUpdateModal();
    setUpdateAvailableUI(false);
    AppStorage.setRaw('ota_banner_dismissed', String(remoteVer));
    recordInstalledWebVersion(remoteVer);
    let otherHost = false;
    try {
        if (remoteBase) otherHost = location.hostname !== new URL(remoteBase).hostname;
    } catch (_) {}
    if (remoteBase && (location.protocol === 'file:' || otherHost)) {
        location.href = remoteBase + '/index.html?t=' + Date.now();
    } else {
        location.reload(true);
    }
}

function showOtaUpdateModal(remoteVer, remoteBase) {
    const modal = document.getElementById('ota-update-modal');
    const verEl = document.getElementById('ota-update-ver');
    const confirmBtn = document.getElementById('ota-update-confirm');
    const laterBtn = document.getElementById('ota-update-later');
    if (!modal || !confirmBtn) return;
    pendingOtaUpdate = { remoteVer, remoteBase };
    if (verEl) verEl.textContent = String(remoteVer);
    modal.style.display = 'flex';
    setUpdateAvailableUI(true, remoteVer);
    confirmBtn.onclick = () => applyOtaUpdate(remoteVer, remoteBase);
    if (laterBtn) {
        laterBtn.onclick = () => {
            AppStorage.setRaw('ota_banner_dismissed', String(remoteVer));
            hideOtaUpdateModal();
        };
    }
}

async function fetchRemoteUpdateVersion() {
    let remoteVer = 0;
    let remoteBase = (AppStorage.getRaw('last_office_lan_url') || OFFICE_LAN_URL).replace(/\/$/, '');
    const officeVerUrl = remoteBase + '/app-version.json?t=' + Date.now();
    try {
        const v = await fetch(officeVerUrl, { cache: 'no-store' }).then(r => r.json());
        remoteVer = Math.max(remoteVer, Number(v?.webVersion || 0));
    } catch (_) {}
    try {
        const cfg = await fetch(getOtaConfigUrl() + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
        remoteVer = Math.max(remoteVer, Number(cfg?.webVersion || 0));
        const office = (cfg?.officeWebBaseUrl || '').replace(/\/$/, '');
        const web = (cfg?.webBaseUrl || '').replace(/\/$/, '');
        if (office) remoteBase = office;
        else if (web) remoteBase = web;
    } catch (_) {}
    return { remoteVer, remoteBase };
}

async function checkForWebUpdate(manual) {
    if (!document.getElementById('ota-update-modal')) return;
    if (!navigator.onLine) {
        hideOtaUpdateModal();
        setUpdateAvailableUI(false);
        pendingOtaUpdate = null;
        if (manual) showToast('Kein Netz â€“ Update-PrÃ¼fung nicht mÃ¶glich.', 'error');
        return;
    }

    const installedVer = getInstalledWebVersion();
    const { remoteVer, remoteBase } = await fetchRemoteUpdateVersion();
    if (!remoteVer) {
        hideOtaUpdateModal();
        setUpdateAvailableUI(false);
        pendingOtaUpdate = null;
        if (manual) showToast('Update-Server nicht erreichbar.', 'error');
        return;
    }

    const dismissed = Number(AppStorage.getRaw('ota_banner_dismissed') || 0);
    if (remoteVer <= installedVer) {
        hideOtaUpdateModal();
        setUpdateAvailableUI(false);
        pendingOtaUpdate = null;
        if (manual) showToast('App ist aktuell (v' + installedVer + ').', 'success');
        return;
    }

    pendingOtaUpdate = { remoteVer, remoteBase };
    setUpdateAvailableUI(true, remoteVer);

    if (!manual && dismissed >= remoteVer) {
        hideOtaUpdateModal();
        return;
    }

    if (manual) showToast('Neues Update v' + remoteVer + ' verfÃ¼gbar.', 'warning');
    showOtaUpdateModal(remoteVer, remoteBase);
}

/** APK: Statusleiste, ZurÃ¼ck-Taste, Portrait â€“ siehe ANDROID_APK.md */
function initAndroidApkBridge() {
    document.documentElement.classList.add('is-android-app');
    document.body.classList.add('is-android-app');
    window.handleAndroidBackPress = handleAndroidBackPress;
}

function applyAndroidSafeAreaInsets() {
    if (!isNativeAndroidApp()) return;
    try {
        const top = Math.min(Number(AndroidApp.getStatusBarHeightPx?.() || 0), 56);
        const bottom = Math.min(Number(AndroidApp.getNavigationBarHeightPx?.() || 0), 64);
        if (top > 0) document.documentElement.style.setProperty('--safe-top', top + 'px');
        if (bottom > 0) document.documentElement.style.setProperty('--safe-bottom', bottom + 'px');
    } catch (_) {}
}

/**
 * Von der APK bei hardware back aufgerufen (WebView.evaluateJavascript).
 * @returns {boolean} true = Web-App hat zurÃ¼ck verarbeitet, Activity nicht beenden
 */
function handleAndroidBackPress() {
    const pin = document.getElementById('pin-protection-overlay');
    if (pin && getComputedStyle(pin).display !== 'none') {
        pin.style.display = 'none';
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

// AI-ADD: This function was missing in the live version and is required to fix dark mode display bugs.
function applyHeaderDarkModeFix(isDark) {
    let headers = document.querySelectorAll('header');
    if (!headers || headers.length === 0) {
        headers = document.querySelectorAll('.head');
    }
    if (!headers || headers.length === 0) {
        return;
    }

    headers.forEach(header => {
        const menuButton = header.querySelector('[onclick*="toggleMenuApp"]');

        if (isDark) {
            header.style.setProperty('background', '#1f1f1f', 'important');
            if (menuButton) {
                menuButton.style.backgroundColor = 'transparent';
                menuButton.style.color = '#ffffff';
            }
        } else {
            header.style.background = '';
            if (menuButton) {
                menuButton.style.backgroundColor = '';
                menuButton.style.color = '';
            }
        }
    });

    const drawers = [document.getElementById('drawer'), document.getElementById('drawer2')].filter(Boolean);
    drawers.forEach(drawer => {
        if (isDark) {
            drawer.style.setProperty('background', '#1f1f1f', 'important');
        } else {
            drawer.style.background = '';
        }
    });

    const scanStatusEl = document.getElementById('brandenburg-scan-status');
    if (scanStatusEl) {
        const neutralBg = isDark ? 'var(--bg-disabled, #2c2c2c)' : 'var(--bg-color-2, #f0f2f5)';
        const currentBg = scanStatusEl.style.backgroundColor;
        if (currentBg === 'rgb(240, 242, 245)' || currentBg === '' || currentBg === 'var(--bg-color-2, #f0f2f5)') {
             scanStatusEl.style.background = neutralBg;
        }
    }

    const leergutContainer = document.getElementById('bb-e2')?.parentElement.parentElement;
    if (leergutContainer) {
        leergutContainer.style.background = isDark ? 'var(--bg-disabled, #2c2c2c)' : '#f9f9f9';
        leergutContainer.style.border = isDark ? '1px solid #444' : '1px solid #eee';
    }
}

function toggleDarkMode() { document.body.classList.toggle('dark-mode'); const isDark = document.body.classList.contains('dark-mode'); AppStorage.setRaw('kombi_dark_mode', isDark); updateDarkModeIcons(isDark); applyHeaderDarkModeFix(isDark); }
function updateDarkModeIcons(isDark) { document.querySelectorAll('.dark-mode-icon').forEach(el => el.innerText = isDark ? 'â˜€ï¸' : 'ðŸŒ™'); }

// CLOUD SYNC
// Logistik Pro: komplette kombi_logistik_db + NÃ¶lke-Produktliste hoch/runter
// Rechner: nur Lieferanten, Sorten (articles), NÃ¶lke-Produkte â€“ Tageslisten bleiben lokal
// LKW-Rechner-Liste: nur Ã¼ber â€žLKW Sendenâ€œ / â€žLKW Empfangenâ€œ (_shared_lkw.json)

function getLogistikFullCloudPayload() {
    const lData = AppStorage.get('kombi_logistik_db', {});
    const rData = AppStorage.get('kombi_rechner_db', {});
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
        settings: lData.settings || {},
        savedProdukteRaw: rData.savedProdukteRaw || []
    };
    if (lData.company) payload.company = lData.company;
    return payload;
}

function getRechnerStammdatenCloudPayload() {
    const lData = AppStorage.get('kombi_logistik_db', {});
    const rData = AppStorage.get('kombi_rechner_db', {});
    return {
        suppliers: lData.suppliers || [],
        articles: lData.articles || [],
        savedProdukteRaw: rData.savedProdukteRaw || []
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
    setObj('dailyStaff'); setObj('dailyAttendance'); setObj('workerColors'); setObj('settings');
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
    if (changed) {
        AppStorage.set('kombi_logistik_db', lDb);
        AppStorage.set('kombi_rechner_db', rDb);
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
    if (!navigator.onLine) return;
    fetch(APP_CONFIG.CLOUD_URL + ".json", {
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
    if (!navigator.onLine) return;
    fetch(APP_CONFIG.CLOUD_URL + ".json", {
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
    if (!navigator.onLine) return;
    try {
        const res = await fetch(APP_CONFIG.CLOUD_URL + ".json?t=" + Date.now(), { credentials: 'omit' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !applyLogistikFullFromCloud(data)) return;
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
    const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    logs.unshift(`C:\\&gt; ${date} ${time} - ${action}`);
    if(logs.length > 100) logs.pop();
    AppStorage.set('logistik_cloud_logs', logs);
    renderAppCloudLogs();
}

function renderAppCloudLogs() {
    const list = document.getElementById('app-cloud-log-list');
    if(!list) return;
    let logs = AppStorage.get('logistik_cloud_logs', []);
    let header = `<div>Tresch & Sohn System Terminal [Version ${APP_VERSION}]</div><div>(c) Robert Trusch. Alle Rechte vorbehalten.</div><br>`;
    if(logs.length === 0) list.innerHTML = header + "<div>C:\\&gt; Warte auf System-Eingabe...<span class='cmd-cursor'>_</span></div>";
    else list.innerHTML = header + logs.map(l => `<div style="margin-bottom: 2px;">${l}</div>`).join('') + `<div>C:\\&gt; <span class="cmd-cursor">_</span></div>`;
}

function silentCloudSync() {
    if (!navigator.onLine) return;
    fetch(APP_CONFIG.CLOUD_URL + ".json?t=" + Date.now())
    .then(res => res.json())
    .then(cloudData => {
        if (!cloudData) return;
        if (sessionStorage.getItem('logistik_authenticated') === 'true') {
            if (applyLogistikFullFromCloud(cloudData)) {
                if (typeof loadLocalDB === 'function') loadLocalDB();
                if (typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Logistik empfangen [OK]");
                showToast("ðŸ”„ Logistik aus Cloud aktualisiert!", "success");
            }
        } else if (applyRechnerStammdatenFromCloud(cloudData)) {
            if (typeof loadLocalDB === 'function') loadLocalDB();
            if (typeof loadRechnerData === 'function') loadRechnerData();
            if (typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Stammdaten empfangen [OK]");
            showToast("ðŸ”„ Stammdaten aus Cloud aktualisiert!", "success");
        }
    }).catch(() => {
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Auto-Sync Download fehlgeschlagen");
    });
}

// Automatischen 3-Minuten-Sync deaktiviert (nur noch manuell Ã¼ber ðŸ”„ Button)
// setInterval(silentCloudSync, 3 * 60 * 1000);

// UNIVERSAL DRUCKER & PDF WORKAROUND
let generatedPdfFile = null; let generatedPdfFilename = "";
function forcePrint(filename) {
    const wasDark = document.body.classList.contains('dark-mode');
    if (wasDark) {
        document.body.classList.remove('dark-mode');
    }

    setTimeout(() => {
        const restoreDark = () => { if (wasDark) document.body.classList.add('dark-mode'); };

        try {
            if (typeof AndroidApp !== 'undefined' && AndroidApp.printPage) {
                AndroidApp.printPage();
                setTimeout(restoreDark, 8000);
                return;
            }
        } catch(e) {
            console.error("Native Android print call failed", e);
            showToast("Drucken via App fehlgeschlagen, nutze Fallback...", "warning");
        }
        
        if (typeof html2pdf !== 'undefined') {
            showToast("Generiere Druckdatei...", "warning"); const printEl = document.getElementById("printArea");
            printEl.style.display = "block"; printEl.style.position = "absolute"; printEl.style.top = "0"; printEl.style.left = "0"; printEl.style.width = "100%"; printEl.style.background = "#ffffff"; printEl.style.zIndex = "99999";
            
            const opt = { margin: 5, filename: filename + '.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
            
            html2pdf().set(opt).from(printEl).outputPdf('blob').then(function(blob) {
                printEl.style.cssText = ""; generatedPdfFilename = filename; generatedPdfFile = new File([blob], filename + '.pdf', { type: 'application/pdf' });
                document.getElementById('pdf-share-modal').style.display = 'flex';
                restoreDark();
            }).catch(() => { printEl.style.cssText = ""; window.print(); setTimeout(restoreDark, 8000); });
        } else { 
            window.print(); 
            setTimeout(restoreDark, 8000);
        }
    }, 300);
}
function triggerShare() {
    if (!generatedPdfFile) return;
    if (navigator.canShare && navigator.canShare({ files: [generatedPdfFile] })) { navigator.share({ files: [generatedPdfFile], title: generatedPdfFilename }).then(() => { document.getElementById('pdf-share-modal').style.display = 'none'; }).catch(e => { if (e.name !== "AbortError") saveBlobAsFile(generatedPdfFile, generatedPdfFilename + '.pdf'); }); } 
    else { document.getElementById('pdf-share-modal').style.display = 'none'; saveBlobAsFile(generatedPdfFile, generatedPdfFilename + '.pdf'); showToast("Heruntergeladen!", "success"); }
}
function saveBlobAsFile(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

// ==========================================
// SPRACHSTEUERUNG (VOICE INPUT)
// ==========================================
window.currentVoiceTarget = null;

function startVoiceRecognition(targetId) {
    window.currentVoiceTarget = targetId;
    
    // 1. PrÃ¼fen, ob wir in der nativen Android-App sind
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

        recognition.onstart = function() { showToast("ðŸŽ¤ Bitte jetzt Gewicht sprechen...", "warning"); };
        recognition.onresult = function(event) { 
            const transcript = event.results[0][0].transcript; 
            setVoiceInputResult(transcript); 
        };
        recognition.onerror = function(event) { showToast("Spracherkennung fehlgeschlagen (" + event.error + ")", "error"); };
        
        recognition.start();
    } else {
        showToast("Dein Browser unterstÃ¼tzt leider keine Spracherkennung.", "error");
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
    if(shareBtn) shareBtn.innerText = "â³ Sende...";
    
    fetch(APP_CONFIG.CLOUD_URL + "_shared_lkw.json", {
        method: 'PUT',
        body: JSON.stringify({ entries: rDb.entries, timestamp: Date.now() }),
        headers: { 'Content-Type': 'application/json' }
    }).then(res => {
        if(shareBtn) shareBtn.innerHTML = "ðŸ“¤ LKW Senden";
        if (res.ok) {
            showToast("LKW-Liste an Kollege gesendet!", "success");
        } else {
            showToast("Fehler beim Senden.", "error");
        }
    }).catch(e => {
        if(shareBtn) shareBtn.innerHTML = "ðŸ“¤ LKW Senden";
        showToast("Netzwerkfehler.", "error");
    });
}

function receiveLkwData() {
    const recBtn = document.getElementById('btn-receive-lkw');
    if(recBtn) recBtn.innerText = "â³ Lade...";
    
    fetch(APP_CONFIG.CLOUD_URL + "_shared_lkw.json?t=" + Date.now())
    .then(res => res.json())
    .then(data => {
        if(recBtn) recBtn.innerHTML = "ðŸ“¥ LKW Empfangen";
        if (!data || !data.entries) {
            showToast("Keine geteilten Daten gefunden.", "warning");
            return;
        }
        
        const ageMins = Math.round((Date.now() - (data.timestamp || 0)) / 60000);
        let ageText = ageMins === 0 ? "Gerade eben" : `Vor ${ageMins} Minute(n)`;
        
        customConfirm(`LKW-Liste vom Kollegen laden?\n(Geteilt: ${ageText})\n\nDie geteilten Paletten werden deiner aktuellen Liste hinzugefÃ¼gt.`, () => {
            let rDb = AppStorage.get('kombi_rechner_db', {});
            if (!rDb.entries) rDb.entries = [];
            
            let addedCount = 0;
            const existingIds = new Set(rDb.entries.map(e => e.id));
            
            // Original-IDs beibehalten und nur komplett neue Paletten hinzufÃ¼gen
            data.entries.forEach(e => {
                if (!existingIds.has(e.id)) {
                    rDb.entries.push(e);
                    existingIds.add(e.id);
                    addedCount++;
                }
            });
            
            AppStorage.set('kombi_rechner_db', rDb);
            if (typeof loadRechnerData === 'function') loadRechnerData();
            showToast(`${addedCount} neue Paletten ergÃ¤nzt!`, "success");
        });
    })
    .catch(e => {
        if(recBtn) recBtn.innerHTML = "ðŸ“¥ LKW Empfangen";
        showToast("Fehler beim Laden.", "error");
    });
}

function initLkwShareButtons() {
    if(document.getElementById('lkw-share-bar')) return;
    
    // Wir suchen gezielt nach dem LKW-Tab, damit die Buttons nur dort erscheinen.
    // HINWEIS: Bitte passe 'tab-lkw' an die echte ID deines LKW-Tabs in der HTML an, falls er anders heiÃŸt!
    let targetContainer = document.getElementById('tab-lkw') || document.getElementById('lkw-tab') || document.getElementById('lkw-container');
    
    if(!targetContainer) {
        // AI-FIX: Fallback entfernt. Wenn der LKW-Tab nicht gefunden wird,
        // sollen die Buttons nicht an den Haupt-Wrapper angehÃ¤ngt werden,
        // da sie sonst auf allen Seiten erscheinen.
        return;
    }
    
    const bar = document.createElement('div');
    bar.id = 'lkw-share-bar';
    bar.style.cssText = "background: transparent; padding: 15px 10px 50px 10px; display: flex; justify-content: center; gap: 10px; border-top: 2px solid var(--border-color, #ddd); margin-top: 20px;";
    bar.innerHTML = `
        <button id="btn-share-lkw" onclick="shareLkwData()" style="flex:1; max-width:200px; padding:12px; background:#004b93; color:white; border:none; border-radius:6px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">ðŸ“¤ LKW Senden</button>
        <button id="btn-receive-lkw" onclick="receiveLkwData()" style="flex:1; max-width:200px; padding:12px; background:#4caf50; color:white; border:none; border-radius:6px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">ðŸ“¥ LKW Empfangen</button>
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
            inputEl.dispatchEvent(new Event('input', { bubbles: true })); // LÃ¶st automatische Berechnungen aus!
        }
        showToast("Gewicht erkannt: " + numberMatch[0] + " kg", "success");
    } else {
        showToast("Keine Zahl verstanden (" + text + ")", "warning");
    }
}
