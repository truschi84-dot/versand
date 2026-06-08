/**
 * Lokale Deploy-API für Control Center (nur localhost).
 * USB-Install, GitHub-Publish, OTA – alles per Knopf im Control Center.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJEKT_ROOT = path.join(__dirname);
const APP_ROOT = path.join(PROJEKT_ROOT, '..');
const SCRIPTS = path.join(PROJEKT_ROOT, 'scripts');

let deployRunning = false;
let deployLog = [];
let deployExitCode = null;
let deployStartedAt = null;

function isLocalRequest(req) {
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
    // Gleicher PC, aber Browser nutzt http://192.168.x.x:8080 statt localhost
    const v4 = ip.replace(/^::ffff:/, '');
    if (/^10\./.test(v4) || /^192\.168\./.test(v4) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(v4)) return true;
    return false;
}

function setDeployCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function pushLog(line) {
    const text = String(line || '').replace(/\r/g, '');
    text.split('\n').forEach((l) => {
        if (l.trim()) deployLog.push(l);
    });
    if (deployLog.length > 500) deployLog = deployLog.slice(-500);
}

function readJsonBody(req, cb) {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
        try {
            cb(null, data ? JSON.parse(data) : {});
        } catch (e) {
            cb(e);
        }
    });
    req.on('error', cb);
}

function getWebVersionInfo() {
    const verFile = path.join(APP_ROOT, 'app-version.json');
    if (!fs.existsSync(verFile)) return { webVersion: null, label: null };
    try {
        const v = JSON.parse(fs.readFileSync(verFile, 'utf8'));
        return { webVersion: v.webVersion, label: v.label, publishedAt: v.publishedAt };
    } catch (_) {
        return { webVersion: null, label: null };
    }
}

function getDeployConfigStatus() {
    const cfgPath = path.join(PROJEKT_ROOT, 'deploy.config.json');
    if (!fs.existsSync(cfgPath)) {
        return { ok: false, path: cfgPath, message: 'deploy.config.json fehlt (siehe config/deploy.config.example.json)' };
    }
    try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        const project = (cfg.androidProject || '').trim();
        if (!project || !fs.existsSync(project)) {
            return { ok: false, path: cfgPath, message: 'androidProject in deploy.config.json ungültig oder Ordner fehlt' };
        }
        return { ok: true, path: cfgPath, androidProject: project, webBaseUrl: cfg.webBaseUrl || null };
    } catch (e) {
        return { ok: false, path: cfgPath, message: 'deploy.config.json ist fehlerhaft: ' + e.message };
    }
}

function getAdbPath() {
    const candidates = [];
    if (process.env.ANDROID_HOME) {
        candidates.push(path.join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'));
    }
    if (process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
    }
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function listAdbDevices(cb) {
    const adb = getAdbPath();
    if (!adb) return cb(null, { adbFound: false, devices: [], message: 'adb nicht gefunden (Android SDK Platform-Tools)' });
    const proc = spawn(adb, ['devices'], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('close', () => {
        const devices = out.split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('List of devices'))
            .map((l) => {
                const parts = l.split(/\s+/);
                return { id: parts[0], state: parts[1] || 'unknown' };
            })
            .filter((d) => d.state === 'device');
        cb(null, { adbFound: true, devices, raw: out });
    });
    proc.on('error', (err) => cb(err));
}

function runDeployScript(scriptName, res, extraArgs = [], successMsg) {
    if (deployRunning) {
        res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Es läuft bereits ein Job – bitte warten.' }));
        return;
    }
    const scriptPath = path.join(SCRIPTS, scriptName);
    if (!fs.existsSync(scriptPath)) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Skript fehlt: ' + scriptName }));
        return;
    }

    deployRunning = true;
    deployLog = [];
    deployExitCode = null;
    deployStartedAt = new Date().toISOString();
    const argLine = [scriptName].concat(extraArgs || []).join(' ');
    pushLog('Start: ' + argLine);

    const proc = spawn(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath].concat(extraArgs || []),
        { cwd: PROJEKT_ROOT, windowsHide: true }
    );

    proc.stdout.on('data', (d) => pushLog(d.toString()));
    proc.stderr.on('data', (d) => pushLog(d.toString()));
    proc.on('close', (code) => {
        deployExitCode = code;
        deployRunning = false;
        pushLog(code === 0
            ? (successMsg || '✅ Fertig.')
            : '❌ Fehler (Exit ' + code + ') – siehe Protokoll.');
    });
    proc.on('error', (err) => {
        deployRunning = false;
        deployExitCode = 1;
        pushLog('❌ ' + err.message);
    });

    res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, started: true, script: scriptName, args: extraArgs }));
}

function handleDeployApi(req, res, urlPath) {
    if (urlPath.startsWith('/api/deploy')) {
        setDeployCorsHeaders(res);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return true;
        }
    }

    if (!isLocalRequest(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Nur vom Büro-PC (localhost/LAN) erlaubt.' }));
        return true;
    }

    if (req.method === 'GET' && urlPath === '/api/deploy/status') {
        listAdbDevices((err, adbInfo) => {
            const cfg = getDeployConfigStatus();
            const ver = getWebVersionInfo();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                ok: true,
                deployRunning,
                deployExitCode,
                deployStartedAt,
                deployLog: deployLog.slice(-100),
                deployConfig: cfg,
                webVersion: ver,
                adb: err ? { adbFound: false, devices: [], message: err.message } : adbInfo,
                githubPagesUrl: 'https://truschi84-dot.github.io/versand/app-update.json',
            }));
        });
        return true;
    }

    if (req.method === 'POST' && urlPath === '/api/deploy/usb-full') {
        runDeployScript('deploy-android.ps1', res, [], '✅ Handy per USB aktualisiert.');
        return true;
    }

    if (req.method === 'POST' && urlPath === '/api/deploy/usb-apk-only') {
        runDeployScript('phone-install.ps1', res, [], '✅ APK installiert.');
        return true;
    }

    if (req.method === 'POST' && urlPath === '/api/deploy/github') {
        readJsonBody(req, (err, body) => {
            if (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'Ungültige Anfrage' }));
                return;
            }
            const msg = String(body.message || 'App Update').trim().slice(0, 200) || 'App Update';
            runDeployScript(
                'publish-github.ps1',
                res,
                ['-PushToGitHub', '-BumpVersion', '-Message', msg],
                '✅ GitHub Push fertig – in 1–2 Min unter app-update.json live. Handys: App-Update prüfen.'
            );
        });
        return true;
    }

    if (req.method === 'POST' && urlPath === '/api/deploy/github-local') {
        readJsonBody(req, (err, body) => {
            if (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: false, error: 'Ungültige Anfrage' }));
                return;
            }
            const msg = String(body.message || 'App Update lokal').trim().slice(0, 200);
            const args = ['-BumpVersion'];
            if (msg) args.push('-Message', msg);
            runDeployScript(
                'publish-github.ps1',
                res,
                args,
                '✅ Version lokal erhöht – noch kein GitHub-Push.'
            );
        });
        return true;
    }

    if (req.method === 'POST' && urlPath === '/api/deploy/ota-firebase') {
        runDeployScript(
            'publish-ota.ps1',
            res,
            [],
            '✅ Firebase OTA deploy fertig (falls Firebase CLI eingerichtet).'
        );
        return true;
    }

    return false;
}

module.exports = { handleDeployApi, isLocalRequest };
