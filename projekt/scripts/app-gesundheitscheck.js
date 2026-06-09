/**
 * App-Gesundheitscheck: automatische Pruefungen nach Updates.
 * Standalone: node app-gesundheitscheck.js [--html] [--json]
 * Wird auch von /api/deploy/health-check im Control Center genutzt.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');

const PROJEKT_ROOT = path.join(__dirname, '..');
const APP_ROOT = path.join(PROJEKT_ROOT, '..');
const LOG_DIR = path.join(PROJEKT_ROOT, 'logs');

const CRITICAL_FILES = [
    'index.html',
    'app-version.json',
    'app-update.json',
    '.nojekyll',
    'js/script.js',
    'js/rechner.js',
    'js/logistik.js',
    'js/cloud_auth.js',
    'js/cloud_secrets.embed.js',
    'js/druck_utils.js',
    'projekt/pc/control-center.html',
    'projekt/server.js',
    'projekt/local-deploy-api.js',
];

const JS_SYNTAX_FILES = [
    'js/script.js',
    'js/rechner.js',
    'js/logistik.js',
    'js/cloud_auth.js',
    'js/druck_utils.js',
    'projekt/server.js',
    'projekt/local-deploy-api.js',
];

const CODE_MARKERS = [
    { file: 'js/script.js', needle: 'deletedSuppliers', label: 'Lieferanten-Loeschen (Blacklist)' },
    { file: 'js/script.js', needle: 'supplierLines', label: 'Warenlinien in Cloud-Sync' },
    { file: 'js/rechner.js', needle: 'supplierLines', label: 'Warenlinie LKW-Tab' },
    { file: 'projekt/pc/control-center.html', needle: 'deletedSuppliers', label: 'Control Center Cloud-Merge' },
];

const MANUAL_CHECKLIST = [
    'Handy: Menue -> App-Update pruefen (OTA oder Buero-WLAN)',
    'LKW-Tab: Lieferant waehlen, optional Warenlinie, Speichern',
    'Cloud: Aenderung machen -> In Cloud speichern -> auf zweitem Geraet laden',
    'Druck: eine Tabelle drucken (besonders iPhone quer bei breiten Tabellen)',
    'Lieferant loeschen: danach In Cloud speichern, nicht wieder da?',
    'Control Center: Lieferanten / Warenlinien / Statistik oeffnen',
];

function readText(rel) {
    return fs.readFileSync(path.join(APP_ROOT, rel), 'utf8');
}

function addCheck(checks, id, name, status, message, hint) {
    checks.push({ id, name, status, message, hint: hint || null });
}

function fetchUrl(url, timeoutMs) {
    return new Promise((resolve) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout: timeoutMs || 12000 }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    body,
                });
            });
        });
        req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, status: 0, error: 'Timeout' });
        });
    });
}

function checkJsSyntax(checks) {
    JS_SYNTAX_FILES.forEach((rel) => {
        const full = path.join(APP_ROOT, rel);
        if (!fs.existsSync(full)) return;
        const r = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8', windowsHide: true });
        if (r.status === 0) {
            addCheck(checks, 'js-' + rel.replace(/[^\w]+/g, '-'), 'JS Syntax: ' + rel, 'ok', 'Keine Syntaxfehler');
        } else {
            const err = (r.stderr || r.stdout || 'Syntaxfehler').trim().split('\n')[0];
            addCheck(checks, 'js-' + rel.replace(/[^\w]+/g, '-'), 'JS Syntax: ' + rel, 'fail', err);
        }
    });
}

function checkCodeMarkers(checks) {
    CODE_MARKERS.forEach((m) => {
        const full = path.join(APP_ROOT, m.file);
        if (!fs.existsSync(full)) {
            addCheck(checks, 'marker-' + m.needle, m.label, 'fail', 'Datei fehlt: ' + m.file);
            return;
        }
        const txt = fs.readFileSync(full, 'utf8');
        if (txt.includes(m.needle)) {
            addCheck(checks, 'marker-' + m.needle + '-' + m.file, m.label, 'ok', 'Im Code vorhanden (' + m.file + ')');
        } else {
            addCheck(checks, 'marker-' + m.needle + '-' + m.file, m.label, 'fail', 'Marker fehlt in ' + m.file);
        }
    });
}

async function runHealthCheck(opts) {
    const checks = [];
    const startedAt = new Date().toISOString();
    let appVer = null;
    let updateJson = null;
    let webBaseUrl = 'https://truschi84-dot.github.io/versand';

    CRITICAL_FILES.forEach((rel) => {
        const full = path.join(APP_ROOT, rel);
        if (fs.existsSync(full)) {
            addCheck(checks, 'file-' + rel, 'Datei: ' + rel, 'ok', 'Vorhanden');
        } else {
            addCheck(checks, 'file-' + rel, 'Datei: ' + rel, 'fail', 'Fehlt');
        }
    });

    try {
        appVer = JSON.parse(readText('app-version.json'));
        addCheck(checks, 'json-app-version', 'app-version.json', 'ok', 'webVersion ' + appVer.webVersion + ', label ' + appVer.label);
    } catch (e) {
        addCheck(checks, 'json-app-version', 'app-version.json', 'fail', e.message);
    }

    try {
        updateJson = JSON.parse(readText('app-update.json'));
        addCheck(checks, 'json-app-update', 'app-update.json', 'ok', 'webVersion ' + updateJson.webVersion);
        if (updateJson.webBaseUrl) webBaseUrl = String(updateJson.webBaseUrl).replace(/\/$/, '');
    } catch (e) {
        addCheck(checks, 'json-app-update', 'app-update.json', 'fail', e.message);
    }

    if (appVer && updateJson) {
        if (Number(appVer.webVersion) === Number(updateJson.webVersion)) {
            addCheck(checks, 'ver-json-sync', 'Version app-version vs app-update', 'ok', 'Beide: ' + appVer.webVersion);
        } else {
            addCheck(
                checks, 'ver-json-sync', 'Version app-version vs app-update', 'fail',
                'app-version=' + appVer.webVersion + ', app-update=' + updateJson.webVersion,
                'publish-github.ps1 oder WEB_BUILD_VERSION angleichen'
            );
        }
        if (appVer.label && updateJson.webVersion) {
            /* label only in app-version */
        }
    }

    try {
        const scriptSrc = readText('js/script.js');
        const mBuild = scriptSrc.match(/WEB_BUILD_VERSION\s*=\s*(\d+)/);
        const mApp = scriptSrc.match(/APP_VERSION\s*=\s*"([^"]+)"/);
        if (mBuild && appVer) {
            const build = Number(mBuild[1]);
            if (build === Number(appVer.webVersion)) {
                addCheck(checks, 'ver-script-build', 'WEB_BUILD_VERSION in script.js', 'ok', 'Stimmt: ' + build);
            } else {
                addCheck(
                    checks, 'ver-script-build', 'WEB_BUILD_VERSION in script.js', 'fail',
                    'script.js=' + build + ', app-version=' + appVer.webVersion,
                    'In js/script.js WEB_BUILD_VERSION anpassen'
                );
            }
        } else {
            addCheck(checks, 'ver-script-build', 'WEB_BUILD_VERSION in script.js', 'fail', 'Konstante nicht gefunden');
        }
        if (mApp && appVer && appVer.label) {
            if (mApp[1] === String(appVer.label)) {
                addCheck(checks, 'ver-script-label', 'APP_VERSION Label in script.js', 'ok', 'Stimmt: ' + mApp[1]);
            } else {
                addCheck(
                    checks, 'ver-script-label', 'APP_VERSION Label in script.js', 'warn',
                    'script.js=' + mApp[1] + ', app-version.label=' + appVer.label,
                    'Nur Anzeige/Changelog - optional angleichen'
                );
            }
        }
    } catch (e) {
        addCheck(checks, 'ver-script', 'script.js Versionen', 'fail', e.message);
    }

    const secretsPath = path.join(APP_ROOT, 'app-secrets.json');
    if (fs.existsSync(secretsPath)) {
        try {
            const sec = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
            const hasFb = sec && (sec.firebaseApiKey || sec.apiKey || (sec.firebase && sec.firebase.apiKey));
            if (hasFb) {
                addCheck(checks, 'secrets-local', 'app-secrets.json (lokal)', 'ok', 'Firebase-Zugang vorhanden (nicht in Git)');
            } else {
                addCheck(checks, 'secrets-local', 'app-secrets.json (lokal)', 'warn', 'Datei da, aber keine erkennbaren Firebase-Felder');
            }
        } catch (e) {
            addCheck(checks, 'secrets-local', 'app-secrets.json (lokal)', 'fail', 'JSON fehlerhaft: ' + e.message);
        }
    } else {
        addCheck(
            checks, 'secrets-local', 'app-secrets.json (lokal)', 'warn',
            'Fehlt - Cloud auf Handys nach USB-Deploy evtl. ohne Zugang',
            'Datei im App-Root anlegen, dann deploy-android.ps1'
        );
    }

    try {
        const embed = readText('js/cloud_secrets.embed.js');
        if (/__FIREBASE_SECRETS__\s*=\s*null/.test(embed)) {
            addCheck(
                checks, 'secrets-embed', 'cloud_secrets.embed.js', 'ok',
                'Stub (null) - korrekt fuer GitHub Pages',
                'Nach OTA: einmal USB-Deploy damit Handys echte Secrets haben'
            );
        } else if (embed.includes('apiKey')) {
            addCheck(checks, 'secrets-embed', 'cloud_secrets.embed.js', 'warn', 'Echte Secrets eingebettet - nicht auf GitHub pushen!');
        } else {
            addCheck(checks, 'secrets-embed', 'cloud_secrets.embed.js', 'warn', 'Unbekanntes Format');
        }
    } catch (e) {
        addCheck(checks, 'secrets-embed', 'cloud_secrets.embed.js', 'fail', e.message);
    }

    const cfgPath = path.join(PROJEKT_ROOT, 'deploy.config.json');
    if (fs.existsSync(cfgPath)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            const android = (cfg.androidProject || '').trim();
            if (android && fs.existsSync(android)) {
                addCheck(checks, 'deploy-config', 'deploy.config.json', 'ok', 'Android-Projekt: ' + android);
            } else {
                addCheck(checks, 'deploy-config', 'deploy.config.json', 'fail', 'androidProject fehlt oder Ordner nicht gefunden');
            }
        } catch (e) {
            addCheck(checks, 'deploy-config', 'deploy.config.json', 'fail', e.message);
        }
    } else {
        addCheck(
            checks, 'deploy-config', 'deploy.config.json', 'warn',
            'Fehlt - USB-Deploy-Knoepfe im Control Center eingeschraenkt',
            'Kopie von projekt/config/deploy.config.example.json'
        );
    }

    checkJsSyntax(checks);
    checkCodeMarkers(checks);

    const localUrls = [
        'http://127.0.0.1:8080/index.html',
        'http://127.0.0.1:8080/projekt/pc/control-center.html',
        'http://127.0.0.1:8080/api/deploy/status',
    ];
    for (const url of localUrls) {
        const r = await fetchUrl(url, 8000);
        const short = url.replace('http://127.0.0.1:8080', '');
        if (r.ok) {
            addCheck(checks, 'local-' + short, 'Lokal: ' + (short || '/'), 'ok', 'HTTP ' + r.status);
        } else {
            const msg = r.error || ('HTTP ' + (r.status || '?'));
            const isServer = short === '/index.html';
            addCheck(
                checks, 'local-' + short, 'Lokal: ' + (short || '/'),
                isServer ? 'warn' : 'warn',
                msg,
                isServer ? 'Control-Center-Starten.bat starten' : 'Server muss laufen'
            );
        }
    }

    const ghUrl = webBaseUrl + '/app-update.json';
    const gh = await fetchUrl(ghUrl + '?t=' + Date.now(), 15000);
    if (gh.ok) {
        try {
            const remote = JSON.parse(gh.body);
            const localV = appVer ? Number(appVer.webVersion) : null;
            const remoteV = Number(remote.webVersion);
            if (localV !== null && localV === remoteV) {
                addCheck(checks, 'github-ota', 'GitHub OTA Version', 'ok', 'Online und lokal: ' + remoteV);
            } else if (localV !== null && localV > remoteV) {
                addCheck(
                    checks, 'github-ota', 'GitHub OTA Version', 'warn',
                    'Lokal ' + localV + ', GitHub ' + remoteV + ' - Push fehlt noch?',
                    'publish-github.ps1 -PushToGitHub'
                );
            } else {
                addCheck(
                    checks, 'github-ota', 'GitHub OTA Version', 'warn',
                    'Lokal ' + localV + ', GitHub ' + remoteV + ' - lokal veraltet?',
                    'Git pull oder Version pruefen'
                );
            }
        } catch (e) {
            addCheck(checks, 'github-ota', 'GitHub app-update.json', 'fail', 'JSON ungueltig: ' + e.message);
        }
    } else {
        addCheck(checks, 'github-ota', 'GitHub erreichbar', 'warn', gh.error || ('HTTP ' + gh.status), ghUrl);
    }

    const ghIndex = await fetchUrl(webBaseUrl + '/index.html?t=' + Date.now(), 15000);
    if (ghIndex.ok) {
        addCheck(checks, 'github-index', 'GitHub Pages App', 'ok', 'index.html erreichbar');
    } else {
        addCheck(checks, 'github-index', 'GitHub Pages App', 'warn', ghIndex.error || ('HTTP ' + ghIndex.status));
    }

    const counts = { ok: 0, warn: 0, fail: 0 };
    checks.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });

    const summary = {
        ok: counts.fail === 0 && counts.warn === 0,
        failCount: counts.fail,
        warnCount: counts.warn,
        okCount: counts.ok,
        startedAt,
        finishedAt: new Date().toISOString(),
        webBaseUrl,
        githubUpdateUrl: ghUrl,
        githubAppUrl: webBaseUrl + '/index.html',
        manualChecklist: MANUAL_CHECKLIST,
        checks,
    };
    return summary;
}

function statusIcon(s) {
    if (s === 'ok') return 'OK';
    if (s === 'warn') return 'WARN';
    return 'FAIL';
}

function printConsoleReport(report) {
    console.log('');
    console.log('=== App-Gesundheitscheck ===');
    console.log('OK: ' + report.okCount + '  WARN: ' + report.warnCount + '  FAIL: ' + report.failCount);
    console.log('');
    report.checks.forEach((c) => {
        const line = '[' + statusIcon(c.status) + '] ' + c.name + ' - ' + c.message;
        console.log(line);
        if (c.hint) console.log('      -> ' + c.hint);
    });
    console.log('');
    console.log('--- Manuell am Handy pruefen ---');
    report.manualChecklist.forEach((item, i) => console.log((i + 1) + '. ' + item));
    console.log('');
    if (report.failCount > 0) {
        console.log('Ergebnis: FEHLER - bitte FAIL-Eintraege beheben.');
    } else if (report.warnCount > 0) {
        console.log('Ergebnis: OK mit Hinweisen (WARN).');
    } else {
        console.log('Ergebnis: Alles automatisch OK.');
    }
    console.log('');
    console.log('GitHub: ' + report.githubUpdateUrl);
}

function writeHtmlReport(report) {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const outPath = path.join(LOG_DIR, 'gesundheitscheck.html');
    const rows = report.checks.map((c) => {
        const cls = c.status === 'ok' ? 'ok' : (c.status === 'warn' ? 'warn' : 'fail');
        const hint = c.hint ? '<div class="hint">' + escapeHtml(c.hint) + '</div>' : '';
        return '<tr class="' + cls + '"><td>' + cls.toUpperCase() + '</td><td>' + escapeHtml(c.name) + '<br><small>' + escapeHtml(c.message) + '</small>' + hint + '</td></tr>';
    }).join('\n');
    const manual = report.manualChecklist.map((m) => '<li>' + escapeHtml(m) + '</li>').join('\n');
    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>App-Gesundheitscheck</title>
<style>
body{font-family:Segoe UI,sans-serif;margin:24px;background:#f5f5f5;color:#222;}
h1{margin:0 0 8px;} .meta{color:#666;font-size:14px;margin-bottom:20px;}
.summary{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
.badge{padding:10px 16px;border-radius:8px;font-weight:bold;background:#fff;border:1px solid #ddd;}
.badge.ok{border-color:#4caf50;color:#2e7d32}.badge.warn{border-color:#ff9800;color:#e65100}.badge.fail{border-color:#f44336;color:#b71c1c}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #eee;vertical-align:top;}
th{background:#263238;color:#fff;font-size:13px;}
tr.ok td:first-child{color:#2e7d32;font-weight:bold;} tr.warn td:first-child{color:#e65100;font-weight:bold;} tr.fail td:first-child{color:#b71c1c;font-weight:bold;}
.hint{color:#666;font-size:12px;margin-top:4px;} a{color:#1565c0;}
.card{background:#fff;padding:16px;border-radius:8px;margin-top:20px;border:1px solid #ddd;}
</style></head><body>
<h1>App-Gesundheitscheck</h1>
<p class="meta">${escapeHtml(report.startedAt)} · <a href="${escapeHtml(report.githubUpdateUrl)}" target="_blank">GitHub app-update.json</a> · <a href="${escapeHtml(report.githubAppUrl)}" target="_blank">GitHub App</a></p>
<div class="summary">
<span class="badge ok">OK ${report.okCount}</span>
<span class="badge warn">WARN ${report.warnCount}</span>
<span class="badge fail">FAIL ${report.failCount}</span>
</div>
<table><thead><tr><th>Status</th><th>Pruefung</th></tr></thead><tbody>${rows}</tbody></table>
<div class="card"><h3 style="margin-top:0">Handy-Checkliste (manuell)</h3><ol>${manual}</ol></div>
</body></html>`;
    fs.writeFileSync(outPath, html, 'utf8');
    return outPath;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function main() {
    const args = process.argv.slice(2);
    const asJson = args.includes('--json');
    const openHtml = args.includes('--html');

    const report = await runHealthCheck({});
    if (asJson) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printConsoleReport(report);
    }

    if (openHtml || (!asJson && args.length === 0)) {
        const htmlPath = writeHtmlReport(report);
        if (!asJson) console.log('Report: ' + htmlPath);
        if (openHtml && process.platform === 'win32') {
            spawnSync('cmd', ['/c', 'start', '', htmlPath], { windowsHide: true, stdio: 'ignore' });
        }
    }

    process.exit(report.failCount > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch((e) => {
        console.error(e);
        process.exit(2);
    });
}

module.exports = { runHealthCheck, writeHtmlReport, MANUAL_CHECKLIST };
