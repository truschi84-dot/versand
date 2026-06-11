let deployPollTimer = null;
let deployApiBaseResolved = null;
let deployStatusRequestId = 0;
let deployLastOkAt = 0;

/** Per Doppelklick (file://) → auf localhost umleiten, wenn Server läuft. */
(function redirectFileProtocolToLocalhost() {
    if (location.protocol !== 'file:') return;
    const target = 'http://localhost:8080/control/index.html' + (location.hash || '');
    fetch('http://localhost:8080/api/deploy/status', { cache: 'no-store' })
        .then(r => { if (r.ok) location.replace(target); })
        .catch(() => {});
})();

function getDeployStatusCandidates() {
    const list = [];
    const onLocalServer = location.protocol !== 'file:'
        && (location.port === '8080' || (location.port === '' && location.hostname === 'localhost'));
    if (onLocalServer) list.push('');
    list.push('http://127.0.0.1:8080');
    list.push('http://localhost:8080');
    return [...new Set(list)];
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function deployApiBase() {
    return deployApiBaseResolved;
}

function setDeployButtonsDisabled(disabled) {
    ['btn-deploy-full', 'btn-deploy-apk', 'btn-deploy-logistik-usb', 'btn-deploy-logistik-apk', 'btn-deploy-github', 'btn-deploy-github-local', 'btn-deploy-ota'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !!disabled;
    });
}

function updateLogistikLanUrl(data) {
    const el = document.getElementById('logistik-lan-url');
    if (!el) return;
    const url = (data && data.logistikUrl) || (data && data.lanIp ? 'http://' + data.lanIp + ':8080/logistik/' : null);
    if (url) el.textContent = url;
}

function applyDeployStatusData(data) {
    const offlineCard = document.getElementById('deploy-offline-card');
    const hint = document.getElementById('deploy-server-hint');
    const logBox = document.getElementById('deploy-log-box');
    const elServer = document.getElementById('deploy-stat-server');
    const elVersion = document.getElementById('deploy-stat-version');
    const elConfig = document.getElementById('deploy-stat-config');
    const elAdb = document.getElementById('deploy-stat-adb');

    if (offlineCard) offlineCard.style.display = 'none';
    if (elServer) {
        elServer.textContent = data.deployRunning ? 'Läuft…' : 'Bereit';
        elServer.className = 'num ' + (data.deployRunning ? 'deploy-status-warn' : 'deploy-status-ok');
    }
    if (elVersion && data.webVersion) {
        elVersion.textContent = 'v' + (data.webVersion.webVersion || '?');
        elVersion.className = 'num deploy-status-ok';
    }
    if (elConfig) {
        const dc = data.deployConfig || {};
        const ok = dc.ok || (dc.rechner && dc.logistik);
        elConfig.textContent = ok ? 'OK' : (dc.rechner || dc.logistik ? '1/2' : 'Fehlt');
        elConfig.className = 'num ' + (ok ? 'deploy-status-ok' : (dc.rechner || dc.logistik ? 'deploy-status-warn' : 'deploy-status-err'));
        elConfig.title = (dc.rechner ? 'Rechner ✓' : 'Rechner ✗') + ' · ' + (dc.logistik ? 'Logistik ✓' : 'Logistik ✗');
    }
    const devices = (data.adb && data.adb.devices) ? data.adb.devices : [];
    const devCount = devices.length;
    if (elAdb) {
        if (devCount > 0) {
            const label = devCount === 1 ? '1×' : devCount + '×';
            elAdb.textContent = label;
            elAdb.title = devices.map(d => d.id + ' (' + d.status + ')').join(', ');
        } else {
            elAdb.textContent = '—';
            elAdb.title = '';
        }
        elAdb.className = 'num ' + (devCount > 0 ? 'deploy-status-ok' : 'deploy-status-warn');
    }
    if (hint) {
        const parts = [];
        if (data.testMode) parts.push('🧪 Test-Umgebung (Port 8081)');
        const dc = data.deployConfig || {};
        if (!dc.rechner) parts.push('Rechner-Android-Projekt fehlt');
        if (!dc.logistik) parts.push('Logistik-Android-Projekt fehlt');
        if (data.adb && !data.adb.adbFound) parts.push('ADB nicht gefunden (Android Platform Tools)');
        else if (data.adb && data.adb.adbFound && devCount === 0) parts.push('Kein Handy per USB — Kabel + USB-Debugging prüfen');
        else if (devCount > 0) parts.push('Handy verbunden: ' + devices.map(d => d.id).join(', '));
        hint.innerHTML = parts.length ? '⚠️ ' + parts.join(' · ') : '✅ Server läuft — Knöpfe unten nutzen.';
    }
    if (logBox && data.deployLog && data.deployLog.length) {
        logBox.textContent = data.deployLog.join('\n');
        logBox.scrollTop = logBox.scrollHeight;
    }
    updateLogistikLanUrl(data);
    setDeployButtonsDisabled(!!data.deployRunning);
    if (data.deployRunning && !deployPollTimer) {
        deployPollTimer = setInterval(refreshDeployStatus, 2000);
    } else if (!data.deployRunning && deployPollTimer) {
        clearInterval(deployPollTimer);
        deployPollTimer = null;
    }
}

function showDeployOffline(reason) {
    deployApiBaseResolved = null;
    const offlineCard = document.getElementById('deploy-offline-card');
    const hint = document.getElementById('deploy-server-hint');
    const elServer = document.getElementById('deploy-stat-server');
    if (offlineCard) offlineCard.style.display = 'block';
    const urlHint = location.protocol === 'file:'
        ? 'Du hast die HTML-Datei direkt geöffnet.'
        : ('Aktuelle Adresse: <code>' + location.href + '</code>');
    if (hint) {
        hint.innerHTML = '❌ Server aus. ' + (reason || '') + '<br>' + urlHint
            + '<br><strong>Lösung:</strong> Doppelklick <code>START.bat</code> im App-Ordner, dann diese Seite mit '
            + '<a href="http://localhost:8080/control/index.html">localhost:8080/control/index.html</a> öffnen.';
    }
    if (elServer) { elServer.textContent = 'Aus'; elServer.className = 'num deploy-status-err'; }
    setDeployButtonsDisabled(true);
    if (deployPollTimer) { clearInterval(deployPollTimer); deployPollTimer = null; }
}

async function refreshDeployStatus(retries) {
    const requestId = ++deployStatusRequestId;
    const maxRetries = typeof retries === 'number' ? retries : 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (requestId !== deployStatusRequestId) return;

        for (const base of getDeployStatusCandidates()) {
            if (requestId !== deployStatusRequestId) return;
            try {
                const url = (base || '') + '/api/deploy/status?refresh=1';
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) continue;
                const data = await res.json();
                if (data && data.ok) {
                    if (requestId !== deployStatusRequestId) return;
                    deployApiBaseResolved = base;
                    deployLastOkAt = Date.now();
                    applyDeployStatusData(data);
                    return;
                }
            } catch (e) { /* nächster Kandidat */ }
        }
        if (attempt < maxRetries - 1) await sleep(800);
    }

    if (requestId !== deployStatusRequestId) return;
    if (deployLastOkAt && Date.now() - deployLastOkAt < 8000) return;
    showDeployOffline('Port 8080 antwortet nicht — START.bat nochmal doppelklicken, dann F5.');
}

async function postDeployJob(url, confirmText, bodyObj) {
    if (!deployApiBaseResolved) {
        await refreshDeployStatus();
    }
    const base = deployApiBase();
    if (!base && base !== '') {
        alert('Server aus – bitte START.bat doppelklicken.');
        return;
    }
    if (confirmText && !confirm(confirmText)) return;
    const logBox = document.getElementById('deploy-log-box');
    if (logBox) logBox.textContent = 'Starte…';
    try {
        let body = '{}';
        if (url.includes('github')) {
            body = JSON.stringify({ message: (document.getElementById('deploy-github-message') || {}).value || '' });
        } else if (bodyObj) {
            body = JSON.stringify(bodyObj);
        }
        const res = await fetch(base + url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        const data = await res.json();
        if (!data.ok) alert(data.error || 'Start fehlgeschlagen');
        refreshDeployStatus();
    } catch (e) { alert('Fehler: ' + e.message); }
}

function startUsbDeployFull() {
    postDeployJob('/api/deploy/usb-full', 'Rechner-APK bauen und per USB installieren? (Gradle, kann einige Minuten dauern)');
}
function startUsbDeployApkOnly() {
    postDeployJob('/api/deploy/usb-apk-only', 'Nur Rechner-APK installieren (ohne neu zu bauen)?', { app: 'rechner' });
}
function startGithubPublish() {
    postDeployJob('/api/deploy/github', 'Version erhöhen und auf GitHub pushen? (Handys können danach OTA updaten)');
}
function startGithubLocalBump() {
    postDeployJob('/api/deploy/github-local', 'Nur Versionsnummer lokal erhöhen (ohne GitHub)?');
}
function startOtaFirebase() {
    postDeployJob('/api/deploy/ota-firebase', 'Firebase Hosting deploy starten?');
}
function startUsbDeployLogistik() {
    postDeployJob('/api/deploy/usb-full-logistik', 'Logistik-APK bauen und per USB installieren? (Gradle, kann einige Minuten dauern)');
}
function startUsbDeployLogistikApkOnly() {
    postDeployJob('/api/deploy/usb-apk-only', 'Nur Logistik-APK installieren (ohne neu zu bauen)?', { app: 'logistik' });
}
async function showLogistikLanUrl() {
    await refreshDeployStatus(1);
}

function healthStatusColor(s) {
    if (s === 'ok') return '#2e7d32';
    if (s === 'warn') return '#e65100';
    return '#b71c1c';
}

function renderHealthCheckReport(report) {
    const sumEl = document.getElementById('health-check-summary');
    const box = document.getElementById('health-check-results');
    const manualEl = document.getElementById('health-check-manual');
    if (!sumEl || !box) return;
    sumEl.style.display = 'block';
    box.style.display = 'block';
    const allOk = report.failCount === 0 && report.warnCount === 0;
    sumEl.style.color = report.failCount ? '#b71c1c' : (report.warnCount ? '#e65100' : '#2e7d32');
    sumEl.textContent = (report.failCount ? '❌ ' : (report.warnCount ? '⚠️ ' : '✅ '))
        + 'OK ' + report.okCount + ' · Warn ' + report.warnCount + ' · Fehler ' + report.failCount;
    box.innerHTML = (report.checks || []).map(function(c) {
        const hint = c.hint ? '<div style="color:#888;margin-top:2px;">→ ' + c.hint + '</div>' : '';
        return '<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #eee;">'
            + '<strong style="color:' + healthStatusColor(c.status) + ';">' + c.status.toUpperCase() + '</strong> '
            + '<span>' + c.name + '</span><br><span style="color:#555;">' + c.message + '</span>' + hint + '</div>';
    }).join('');
    if (manualEl && report.manualChecklist && report.manualChecklist.length) {
        manualEl.style.display = 'block';
        manualEl.innerHTML = '<strong>Handy-Checkliste (manuell):</strong><ol style="margin:6px 0 0;padding-left:20px;">'
            + report.manualChecklist.map(function(m) { return '<li>' + m + '</li>'; }).join('') + '</ol>';
    }
}

async function runHealthCheckUi() {
    const btn = document.getElementById('btn-health-check');
    const sumEl = document.getElementById('health-check-summary');
    const box = document.getElementById('health-check-results');
    if (btn) btn.disabled = true;
    if (sumEl) { sumEl.style.display = 'block'; sumEl.textContent = 'Prüfe…'; sumEl.style.color = '#666'; }
    if (box) { box.style.display = 'block'; box.textContent = 'Bitte warten (GitHub-Abfrage kann einige Sekunden dauern)…'; }
    try {
        if (!deployApiBaseResolved) await refreshDeployStatus();
        const base = deployApiBase();
        if (!base && base !== '') {
            alert('Server aus – bitte START.bat doppelklicken.');
            return;
        }
        const res = await fetch(base + '/api/deploy/health-check', { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok || !data.report) {
            alert(data.error || 'Gesundheitscheck fehlgeschlagen');
            return;
        }
        renderHealthCheckReport(data.report);
    } catch (e) {
        alert('Fehler: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}
