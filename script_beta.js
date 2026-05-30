// =========================================================================
// 🤖 AI-REMINDER: WIR SIND IN DER BETA! 🤖
// AI-Notiz: Dies ist die Beta-Umgebung (script_beta.js, index_beta.html etc.).
// Alle zukünftigen Anpassungen, Features und Fixes bitte strikt in den 
// *_beta.* Dateien durchführen, es sei denn, der Nutzer fordert explizit 
// ein Deployment ins Live-System.
// =========================================================================
// ZENTRALE KONFIGURATION (CLOUD)
// =========================================================================
const APP_CONFIG = {
    CLOUD_URL: localStorage.getItem('custom_cloud_url') || "https://tresch-versand-default-rtdb.firebaseio.com/beta_backup",
    LOGISTIK_PIN: "110784",
    NOTIFICATION_URL: "https://formspree.io/f/xrejnkgq"
};

const APP_VERSION = "6.27";
const APP_CHANGELOG = "<b>Was ist neu in 6.27?</b><br><br>• 📥 <b>Neues Leergutkonto:</b> Erfasse Paletten, Lagen, Einzelgebinde, Euro- und H1-Paletten übersichtlich im neuen Tab.<br>• 📦 <b>Sonderposten in Sortierung:</b> Sonderposten lassen sich jetzt analog zur LKW-Funktion auch in der Sortierung anlegen.<br>• 🔍 <b>Erweiterte Sonderposten:</b> Gemeinsam genutzte Vorlagen und ein neues optionales Feld für die Herkunft ('Von wem?').";

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
    return [
        { id: 'lg_0', name: 'E2', weight: 2.0 },
        { id: 'lg_1', name: 'Herta', weight: 2.5 },
        { id: 'lg_2', name: 'H1', weight: 18.0 },
        { id: 'lg_3', name: 'Euro', weight: 21.0 }
    ];
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
                    emailBtn.disabled = true; emailBtn.innerText = "⏳ Sende...";
                    fetch(getAppSetting('notificationUrl', APP_CONFIG.NOTIFICATION_URL), { 
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ Betreff: "🚨 PUK Benötigt!", Nachricht: "App gesperrt.", PUK: activePuk, Zeit: new Date().toLocaleString('de-DE') })
                    }).then(res => {
                        if (res.ok) { showToast("Admin benachrichtigt!", "success"); emailBtn.innerText = "Benachrichtigt ✓"; emailBtn.style.background = "var(--success)"; } 
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
                sendNotification("🔓 Entsperrt", "App wurde mit PUK entsperrt.");
                updateUI(); overlay.style.display = 'none'; resetInactivityTimer(); switchApp(1); showToast("Erfolgreich entsperrt!", "success");
            } else { showToast("PUK falsch!", "error"); pinInput.value = ""; pinInput.focus(); }
            return;
        }

        const validPin = getAppSetting('logistikPin', APP_CONFIG.LOGISTIK_PIN);
        if (pinInput.value === validPin) {
            failedAttempts = 0; AppStorage.setRaw('logistik_pin_fails', '0'); sessionStorage.setItem('logistik_authenticated', 'true');
            pinInput.value = ''; sendNotification("✅ Login", "Erfolgreicher PIN Login."); updateUI();
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
    const url = prompt("Lokale Server-Datenbank (Firebase URL):\nLeer lassen für den Tresch-Standard.", current);
    if (url !== null) {
        if (url.trim() === "") { localStorage.removeItem('custom_cloud_url'); showToast("Standard-Server wiederhergestellt.", "info"); }
        else { localStorage.setItem('custom_cloud_url', url.trim()); showToast("Neuer Server gespeichert!", "success"); }
        setTimeout(() => location.reload(), 1000);
    }
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
document.addEventListener('pointermove', (e) => { if (!isSwiping) return; const swipeable = e.target.closest('.swipeable'); if (!swipeable) return; const diffX = swipeStartX - e.clientX; const diffY = swipeStartY - e.clientY; if (Math.abs(diffX) > Math.abs(diffY) && diffX > 0) { if (e.cancelable) e.preventDefault(); swipeable.style.transform = `translateX(-${Math.min(diffX, 80)}px)`; } else if (Math.abs(diffY) > Math.abs(diffX)) { isSwiping = false; swipeable.style.transition = 'transform 0.2s ease-out'; swipeable.style.transform = 'translateX(0)'; } });
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
        if (typeof toggleMenuApp2 === 'function') toggleMenuApp2(false);
    } else {
        document.getElementById('app1_wrapper').style.display = 'none'; document.getElementById('app2_wrapper').style.display = 'flex'; if(typeof toggleMenuApp1 === 'function') toggleMenuApp1(false);
    }
}
function logoutLogistik(auto = false) { sessionStorage.removeItem('logistik_authenticated'); if(typeof toggleMenuApp1 === 'function') toggleMenuApp1(false); switchApp(2); if (auto === true) showToast("Automatisch gesperrt (Inaktivität).", "warning"); else showToast("Erfolgreich gesperrt.", "success"); }

// START LOGIK
window.onload = () => { 
    document.getElementById('app1_wrapper').style.display = 'none'; document.getElementById('app2_wrapper').style.display = 'flex';
    if (document.getElementById('selectedWorkDate')) { document.getElementById('selectedWorkDate').value = getLocalISO(); document.getElementById('selectedWorkDate').onchange = renderApp1; }
    if (typeof loadLocalDB === 'function') loadLocalDB(); if (typeof loadRechnerData === 'function') loadRechnerData(); if (typeof loadAllFromCloud === 'function') loadAllFromCloud(); if (typeof initCalc === 'function') initCalc(); 
    if (AppStorage.getRaw('kombi_dark_mode') === 'true') { document.body.classList.add('dark-mode'); updateDarkModeIcons(true); }
    resetInactivityTimer();
    if (typeof renderAppCloudLogs === 'function') renderAppCloudLogs();
    
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
};
function toggleDarkMode() { document.body.classList.toggle('dark-mode'); const isDark = document.body.classList.contains('dark-mode'); AppStorage.setRaw('kombi_dark_mode', isDark); updateDarkModeIcons(isDark); }
function updateDarkModeIcons(isDark) { document.querySelectorAll('.dark-mode-icon').forEach(el => el.innerText = isDark ? '☀️' : '🌙'); }

// AUTO SYNC
// KI-NOTIZ: Der automatische DOWNLOAD (silentCloudSync) wurde deaktiviert, damit Dropdowns nicht zurückspringen.
// Der UPLOAD (triggerAutoSync) wird jetzt wieder aktiviert, damit erfasste Mitarbeiter sofort in der Cloud landen!
let syncTimeout;
function triggerAutoSync() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(silentPushToCloud, 1500);
}
function silentPushToCloud() { 
    if (!navigator.onLine) return; 
    const lData = AppStorage.get('kombi_logistik_db', {}); 
    const rData = AppStorage.get('kombi_rechner_db', {}); 
    const combinedData = {
        // Stammdaten werden ab sofort MIT hochgeladen, damit das 
        // Zuordnungssystem in der Logistik-App voll synchronisiert wird!
        suppliers: lData.suppliers || [],
        customers: lData.customers || [],
        articles: lData.articles || [],
        lose: lData.lose || [],
        workers: lData.workers || [],
        todo: lData.todo || [],
        later: lData.later || [],
        hidden: lData.hidden || [],
        deliveries: lData.deliveries || [],
        dailyStaff: lData.dailyStaff || {},
        dailyAttendance: lData.dailyAttendance || {},
        workerColors: lData.workerColors || {},
        settings: lData.settings || {},
        savedProdukteRaw: rData.savedProdukteRaw || [],
        sonderTemplates: rData.sonderTemplates || []
    };
    fetch(APP_CONFIG.CLOUD_URL + ".json", { 
        method: 'PATCH', 
        body: JSON.stringify(combinedData), 
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => {
        if (res.ok && typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Upload erfolgreich [OK]");
    })
    .catch(e => {
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Auto-Sync Upload fehlgeschlagen");
    });
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
        let lDb = AppStorage.get('kombi_logistik_db', {});
        let rDb = AppStorage.get('kombi_rechner_db', {});
        let changed = false;
        
        if (cloudData.suppliers && JSON.stringify(lDb.suppliers) !== JSON.stringify(cloudData.suppliers)) {
            lDb.suppliers = cloudData.suppliers;
            changed = true;
        }
        if (cloudData.articles && JSON.stringify(lDb.articles) !== JSON.stringify(cloudData.articles)) {
            lDb.articles = cloudData.articles;
            changed = true;
        }
        if (cloudData.customers && JSON.stringify(lDb.customers) !== JSON.stringify(cloudData.customers)) {
            lDb.customers = cloudData.customers;
            changed = true;
        }
        if (cloudData.lose && JSON.stringify(lDb.lose) !== JSON.stringify(cloudData.lose)) {
            lDb.lose = cloudData.lose;
            changed = true;
        }
        if (cloudData.todo && JSON.stringify(lDb.todo) !== JSON.stringify(cloudData.todo)) {
            lDb.todo = cloudData.todo;
            changed = true;
        }
        if (cloudData.later && JSON.stringify(lDb.later) !== JSON.stringify(cloudData.later)) {
            lDb.later = cloudData.later;
            changed = true;
        }
        if (cloudData.hidden && JSON.stringify(lDb.hidden) !== JSON.stringify(cloudData.hidden)) {
            lDb.hidden = cloudData.hidden;
            changed = true;
        }
        if (cloudData.workers && JSON.stringify(lDb.workers) !== JSON.stringify(cloudData.workers)) {
            lDb.workers = cloudData.workers;
            changed = true;
        }
        if (cloudData.deliveries && JSON.stringify(lDb.deliveries) !== JSON.stringify(cloudData.deliveries)) {
            lDb.deliveries = cloudData.deliveries;
            changed = true;
        }
        if (cloudData.dailyStaff && JSON.stringify(lDb.dailyStaff) !== JSON.stringify(cloudData.dailyStaff)) {
            lDb.dailyStaff = cloudData.dailyStaff;
            changed = true;
        }
        if (cloudData.dailyAttendance && JSON.stringify(lDb.dailyAttendance) !== JSON.stringify(cloudData.dailyAttendance)) {
            lDb.dailyAttendance = cloudData.dailyAttendance;
            changed = true;
        }
        if (cloudData.workerColors && JSON.stringify(lDb.workerColors) !== JSON.stringify(cloudData.workerColors)) {
            lDb.workerColors = cloudData.workerColors;
            changed = true;
        }
        if (cloudData.settings && JSON.stringify(lDb.settings) !== JSON.stringify(cloudData.settings)) {
            lDb.settings = cloudData.settings;
            changed = true;
        }
        if (cloudData.savedProdukteRaw && JSON.stringify(rDb.savedProdukteRaw) !== JSON.stringify(cloudData.savedProdukteRaw)) {
            rDb.savedProdukteRaw = cloudData.savedProdukteRaw;
            changed = true;
        }
        if (cloudData.sonderTemplates && JSON.stringify(rDb.sonderTemplates) !== JSON.stringify(cloudData.sonderTemplates)) {
            rDb.sonderTemplates = cloudData.sonderTemplates;
            changed = true;
        }
        
        
        if (cloudData.settings && cloudData.settings.lastUpdatePush) {
            const localPush = parseInt(AppStorage.getRaw('last_update_push') || '0');
            if (cloudData.settings.lastUpdatePush > localPush) {
                AppStorage.setRaw('last_update_push', cloudData.settings.lastUpdatePush.toString());
                const banner = document.getElementById('update-banner'); if(banner) banner.style.display = 'block';
                showToast("✨ App-Update verfügbar!", "info");
            }
        }
        if (changed) { AppStorage.set('kombi_logistik_db', lDb); AppStorage.set('kombi_rechner_db', rDb); if(typeof loadLocalDB === 'function') loadLocalDB(); if(typeof loadRechnerData === 'function') loadRechnerData(); if (typeof addAppCloudLog === 'function') addAppCloudLog("AUTO-SYNC: Neue Daten empfangen [OK]"); showToast("🔄 Live-Sync: Neue Einträge empfangen!", "success"); }
    }).catch(e => {
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Auto-Sync Download fehlgeschlagen");
    });
}

// Automatischen 3-Minuten-Sync deaktiviert (nur noch manuell über 🔄 Button)
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
    
    fetch(APP_CONFIG.CLOUD_URL + "_shared_lkw.json", {
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
    
    fetch(APP_CONFIG.CLOUD_URL + "_shared_lkw.json?t=" + Date.now())
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
        // Fallback auf die alte Methode, falls die ID nicht gefunden wurde
        targetContainer = document.getElementById('app2_wrapper');
        if(!targetContainer) return;
    }
    
    const bar = document.createElement('div');
    bar.id = 'lkw-share-bar';
    bar.style.cssText = "background: #f0f2f5; padding: 15px 10px 50px 10px; display: flex; justify-content: center; gap: 10px; border-top: 2px solid #ddd; margin-top: 20px;";
    bar.innerHTML = `
        <button id="btn-share-lkw" onclick="shareLkwData()" style="flex:1; max-width:200px; padding:12px; background:#004b93; color:white; border:none; border-radius:6px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">📤 LKW Senden</button>
        <button id="btn-receive-lkw" onclick="receiveLkwData()" style="flex:1; max-width:200px; padding:12px; background:#4caf50; color:white; border:none; border-radius:6px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">📥 LKW Empfangen</button>
    `;
    targetContainer.appendChild(bar);
}

function setVoiceInputResult(text) {
    if (!window.currentVoiceTarget) return;
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
