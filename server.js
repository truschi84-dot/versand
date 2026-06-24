// ============================================================
// TRESCH APPS — SERVER  (Static + Deploy API)
// Port 8080
// ============================================================
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { exec, execSync } = require('child_process');
const { getLanIPv4, syncLiveOfficeUrls } = require('./office-config');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

// ── Deploy state ──────────────────────────────────────────────
let deployRunning  = false;
let deployLog      = [];
let deployConfig   = null;

function loadDeployConfig() {
    try {
        const raw = fs.readFileSync(path.join(ROOT, 'deploy.config.json'), 'utf8');
        const next = JSON.parse(raw);
        const changed = JSON.stringify(next) !== JSON.stringify(deployConfig);
        deployConfig = next;
        if (changed) resetAdbCaches();
        return true;
    } catch(e) { deployConfig = null; return false; }
}

function logDeploy(msg) {
    const ts = new Date().toLocaleTimeString('de-DE');
    const line = '[' + ts + '] ' + msg;
    deployLog.push(line);
    if (deployLog.length > 200) deployLog.shift();
    console.log(line);
}

function run(cmd, cwd, timeoutMs) {
    return new Promise((resolve, reject) => {
        const opts = { cwd: cwd || ROOT, maxBuffer: 20 * 1024 * 1024, timeout: timeoutMs || 15000 };
        exec(cmd, opts, (err, stdout, stderr) => {
            if (err) reject(new Error((stderr || stdout || err.message).trim()));
            else resolve((stdout || '').trim());
        });
    });
}

function getAppDeployConfig(appKey) {
    loadDeployConfig();
    if (!deployConfig) return null;
    return deployConfig[appKey] || null;
}

function assetsDest(cfg) {
    return path.join(cfg.androidProject, (cfg.assetsPath || 'app/src/main/assets').replace(/\//g, path.sep));
}

function copyDirContents(srcDir, destDir, skipNames) {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (skipNames && skipNames.includes(ent.name)) continue;
        const s = path.join(srcDir, ent.name);
        const d = path.join(destDir, ent.name);
        if (ent.isDirectory()) copyDirContents(s, d, skipNames);
        else {
            fs.mkdirSync(path.dirname(d), { recursive: true });
            fs.copyFileSync(s, d);
        }
    }
}

function embedSecrets(destJsDir) {
    const secretsPath = path.join(ROOT, 'app-secrets.json');
    const out = path.join(destJsDir, 'cloud_secrets.embed.js');
    if (!fs.existsSync(secretsPath)) {
        fs.writeFileSync(out, 'window.__FIREBASE_SECRETS__=null;\n');
        logDeploy('⚠️ app-secrets.json fehlt – Cloud in APK nicht eingebettet');
        return;
    }
    const cfg = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
    fs.writeFileSync(out, 'window.__FIREBASE_SECRETS__=' + JSON.stringify(cfg) + ';\n');
    logDeploy('cloud_secrets.embed.js eingebettet');
}

function setJavaHomeEnv() {
    const candidates = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android', 'Android Studio', 'jbr'),
        'C:\\Program Files\\Android\\Android Studio\\jbr'
    ];
    for (const jbr of candidates) {
        if (fs.existsSync(path.join(jbr, 'bin', 'java.exe'))) {
            process.env.JAVA_HOME = jbr;
            process.env.PATH = path.join(jbr, 'bin') + ';' + (process.env.PATH || '');
            logDeploy('JAVA_HOME: ' + jbr);
            return true;
        }
    }
    logDeploy('⚠️ JAVA_HOME nicht gesetzt – Gradle nutzt System-Java');
    return false;
}

async function runGradle(project, task) {
    const gradlew = path.join(project, 'gradlew.bat');
    if (!fs.existsSync(gradlew)) throw new Error('gradlew.bat fehlt: ' + project);
    setJavaHomeEnv();
    logDeploy('Gradle: ' + task + ' …');
    await run('"' + gradlew + '" ' + task + ' --no-daemon', project, 600000);
}

async function copyRechnerWebAssets(dest) {
    fs.mkdirSync(dest, { recursive: true });
    const rootFiles = ['index.html', 'manifest.webmanifest', 'sw.js', 'app-version.json', 'app-update.json', 'app-settings-public.json'];
    for (const f of rootFiles) {
        const fp = path.join(ROOT, f);
        if (fs.existsSync(fp)) {
            fs.copyFileSync(fp, path.join(dest, f));
            logDeploy('+ ' + f);
        }
    }
    for (const dir of ['js', 'css', 'lib', 'icons']) {
        const src = path.join(ROOT, dir);
        if (!fs.existsSync(src)) continue;
        const d = path.join(dest, dir);
        copyDirContents(src, d, ['cloud_secrets.embed.js']);
        logDeploy('+ ' + dir + '/');
    }
    const jsDir = path.join(dest, 'js');
    if (fs.existsSync(jsDir)) embedSecrets(jsDir);
}

async function copyLogistikWebAssets(dest) {
    fs.mkdirSync(dest, { recursive: true });
    const cRoot = path.join(ROOT, 'control');
    if (!fs.existsSync(cRoot)) throw new Error('control/ Ordner fehlt');

    // index.html: ../js/ → js/ patchen (APK kennt keinen Elternordner)
    let indexHtml = fs.readFileSync(path.join(cRoot, 'index.html'), 'utf8');
    indexHtml = indexHtml.replace(/\.\.\/js\//g, 'js/');
    fs.writeFileSync(path.join(dest, 'index.html'), indexHtml);
    logDeploy('+ index.html (Control)');

    // Control-eigene JS-Dateien
    const jsDir = path.join(dest, 'js');
    fs.mkdirSync(jsDir, { recursive: true });
    copyDirContents(path.join(cRoot, 'js'), jsDir);
    logDeploy('+ js/ (Control)');

    // Shared JS aus Root (druck_utils, supabase_sync, cloud_auth, gemeinsam/)
    for (const f of ['druck_utils.js', 'supabase_sync.js', 'cloud_auth.js']) {
        const fp = path.join(ROOT, 'js', f);
        if (fs.existsSync(fp)) fs.copyFileSync(fp, path.join(jsDir, f));
    }
    const gemeinsamSrc = path.join(ROOT, 'js', 'gemeinsam');
    if (fs.existsSync(gemeinsamSrc)) {
        copyDirContents(gemeinsamSrc, path.join(jsDir, 'gemeinsam'));
        logDeploy('+ js/gemeinsam/ (Shared)');
    }
    if (fs.existsSync(jsDir)) embedSecrets(jsDir);

    const secretsPath = path.join(ROOT, 'app-secrets.json');
    if (fs.existsSync(secretsPath)) {
        fs.copyFileSync(secretsPath, path.join(dest, 'app-secrets.json'));
        logDeploy('+ app-secrets.json (Cloud)');
    } else {
        logDeploy('⚠️ app-secrets.json fehlt – Cloud in Control-APK nicht eingebettet');
    }
    for (const f of ['app-version.json', 'app-update.json', 'app-settings-public.json']) {
        const fp = path.join(ROOT, f);
        if (fs.existsSync(fp)) fs.copyFileSync(fp, path.join(dest, f));
    }
    const icons = path.join(ROOT, 'icons');
    if (fs.existsSync(icons)) {
        copyDirContents(icons, path.join(dest, 'icons'));
        logDeploy('+ icons/');
    }
}

async function jobGradleDeploy(appKey) {
    const cfg = getAppDeployConfig(appKey);
    if (!cfg || !cfg.androidProject) throw new Error(appKey + ': androidProject fehlt in deploy.config.json');
    if (!fs.existsSync(cfg.androidProject)) throw new Error('Android-Projekt nicht gefunden: ' + cfg.androidProject);
    const dest = assetsDest(cfg);
    const label = appKey === 'logistik' ? 'Logistik-App' : 'Rechner-App';
    logDeploy(label + ' → kopiere Web-Dateien nach APK-Projekt…');
    if (appKey === 'logistik') await copyLogistikWebAssets(dest);
    else await copyRechnerWebAssets(dest);

    const devices = await getAdbDevices();
    const installTask = cfg.gradleTask || 'installDebug';
    let task = installTask;
    if (!devices.length) {
        task = installTask.startsWith('install')
            ? ('assemble' + installTask.slice(7))
            : 'assembleDebug';
    }
    await runGradle(cfg.androidProject, task);

    if (devices.length) {
        logDeploy('✅ ' + label + ' auf USB installiert (' + devices.map(d => d.id).join(', ') + ')');
    } else {
        const apk = path.join(cfg.androidProject, (cfg.apkPath || '').replace(/\//g, path.sep));
        logDeploy('✅ APK gebaut (kein Handy per USB): ' + apk);
    }
}

// ── ADB helpers ───────────────────────────────────────────────
let resolvedAdbPath = null;
let adbAvailableCache = { ok: null, at: 0 };
let adbDevicesCache = { devices: [], at: 0 };

function adbCandidates() {
    const list = [];
    if (deployConfig && deployConfig.adbPath) list.push(deployConfig.adbPath);
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) list.push(path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe'));
    if (process.env.ANDROID_HOME) list.push(path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe'));
    list.push('adb');
    return [...new Set(list)];
}

function adb() {
    if (resolvedAdbPath) return resolvedAdbPath;
    for (const candidate of adbCandidates()) {
        if (candidate === 'adb' || fs.existsSync(candidate)) {
            resolvedAdbPath = candidate;
            return candidate;
        }
    }
    resolvedAdbPath = 'adb';
    return resolvedAdbPath;
}

function adbCmd() {
    const p = adb();
    return p === 'adb' ? 'adb' : '"' + p + '"';
}

function resetAdbCaches() {
    resolvedAdbPath = null;
    adbAvailableCache = { ok: null, at: 0 };
    adbDevicesCache = { devices: [], at: 0 };
}

async function checkAdbAvailable(force) {
    if (!force && adbAvailableCache.ok !== null && Date.now() - adbAvailableCache.at < 30000) {
        return adbAvailableCache.ok;
    }
    for (const candidate of adbCandidates()) {
        if (candidate !== 'adb' && !fs.existsSync(candidate)) continue;
        try {
            await run((candidate === 'adb' ? 'adb' : '"' + candidate + '"') + ' version', null, 3000);
            resolvedAdbPath = candidate;
            adbAvailableCache = { ok: true, at: Date.now() };
            return true;
        } catch (e) { /* nächster Kandidat */ }
    }
    resolvedAdbPath = 'adb';
    adbAvailableCache = { ok: false, at: Date.now() };
    return false;
}

async function getAdbDevices() {
    if (!(await checkAdbAvailable(false))) return [];
    try {
        const out = await run(adbCmd() + ' devices', null, 5000);
        const lines = out.split('\n').slice(1).filter(l => l.trim() && l.includes('\t'));
        return lines
            .map(l => ({ id: l.split('\t')[0].trim(), status: l.split('\t')[1].trim() }))
            .filter(d => d.status === 'device');
    } catch(e) { return []; }
}

async function getAdbDevicesCached(force) {
    if (!force && Date.now() - adbDevicesCache.at < 4000) return adbDevicesCache.devices;
    const devices = await getAdbDevices();
    adbDevicesCache = { devices, at: Date.now() };
    return devices;
}

async function adbPush(localDir, remoteDir, deviceId) {
    const prefix = deviceId ? adbCmd() + ' -s ' + deviceId : adbCmd();
    await run(prefix + ' shell mkdir -p ' + remoteDir);
    await run(prefix + ' push "' + localDir + '/." ' + remoteDir + '/');
}

async function adbInstallApk(apkPath, deviceId) {
    const prefix = deviceId ? adbCmd() + ' -s ' + deviceId : adbCmd();
    await run(prefix + ' install -r "' + apkPath + '"');
}

// ── Version helpers ───────────────────────────────────────────
function readVersions() {
    try {
        const av = JSON.parse(fs.readFileSync(path.join(ROOT, 'app-version.json'), 'utf8'));
        return av;
    } catch(e) { return {}; }
}

function bumpRechnerVersion() {
    // Bump WEB_BUILD_VERSION in js/script.js
    const scriptPath = path.join(ROOT, 'js', 'script.js');
    let src = fs.readFileSync(scriptPath, 'utf8');
    const m = src.match(/const WEB_BUILD_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('WEB_BUILD_VERSION nicht gefunden');
    const oldV = parseInt(m[1]);
    const newV = oldV + 1;
    src = src.replace(/const WEB_BUILD_VERSION\s*=\s*\d+/, 'const WEB_BUILD_VERSION = ' + newV);
    fs.writeFileSync(scriptPath, src, 'utf8');

    // Update app-version.json
    const avPath = path.join(ROOT, 'app-version.json');
    const av = JSON.parse(fs.readFileSync(avPath, 'utf8'));
    av.webVersion = newV;
    av.publishedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
    fs.writeFileSync(avPath, JSON.stringify(av, null, 2), 'utf8');

    // Update ?v=XXX in index.html
    const indexPath = path.join(ROOT, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replace(/(\?v=)\d+/g, '$1' + newV);
    fs.writeFileSync(indexPath, html, 'utf8');

    // Update app-update.json
    const auPath = path.join(ROOT, 'app-update.json');
    const au = JSON.parse(fs.readFileSync(auPath, 'utf8'));
    au.webVersion = newV;
    fs.writeFileSync(auPath, JSON.stringify(au, null, 2), 'utf8');

    return newV;
}

function bumpLogistikVersion() {
    const avPath = path.join(ROOT, 'app-version.json');
    const av = JSON.parse(fs.readFileSync(avPath, 'utf8'));
    const oldV = parseInt(av.logistikVersion || 0);
    const newV = oldV + 1;
    av.logistikVersion = newV;
    av.logistikLabel   = '1.' + newV;
    av.publishedAt     = new Date().toISOString().replace('T', ' ').slice(0, 16);
    fs.writeFileSync(avPath, JSON.stringify(av, null, 2), 'utf8');

    // control/index.html hat eigene Versionsnummern – kein Auto-Bump nötig

    return newV;
}

// ── Deploy jobs ───────────────────────────────────────────────
async function jobUsbFull() {
    await jobGradleDeploy('rechner');
}

async function jobUsbFull_Logistik() {
    await jobGradleDeploy('logistik');
}

async function jobUsbApkOnly(appKey, target) {
    const cfg = getAppDeployConfig(appKey || 'rechner');
    if (!cfg || !cfg.apkPath) throw new Error((appKey || 'rechner') + ': apkPath fehlt in deploy.config.json');
    const apk = path.join(cfg.androidProject, cfg.apkPath.replace(/\//g, path.sep));
    if (!fs.existsSync(apk)) throw new Error('APK nicht gefunden – zuerst bauen: ' + apk);
    const devices = await getAdbDevices();
    if (!devices.length) throw new Error('Kein Handy per USB gefunden.');
    const device = target || devices[0].id;
    logDeploy('Installiere ' + (appKey === 'logistik' ? 'Logistik-' : 'Rechner-') + 'APK auf ' + device + '…');
    await adbInstallApk(apk, device);
    logDeploy('✅ APK installiert');
}

async function jobGithub(message) {
    logDeploy('Erhöhe Versionen…');
    const newV = bumpRechnerVersion();
    const newLV = bumpLogistikVersion();
    logDeploy('Rechner-App: Build ' + newV);
    logDeploy('Logistik-App: v1.' + newLV);
    const msg = message || ('App Update Build ' + newV);
    logDeploy('git add -A…');
    await run('git add -A');
    logDeploy('git commit…');
    await run('git commit -m "' + msg.replace(/"/g, "'") + '"');
    logDeploy('git push…');
    const remote = (deployConfig && deployConfig.githubRemote) || 'origin';
    const branch = (deployConfig && deployConfig.githubBranch) || 'main';
    await run('git push ' + remote + ' ' + branch);
    logDeploy('✅ Auf GitHub veröffentlicht — Build ' + newV);
    logDeploy('URL: https://truschi84-dot.github.io/versand/');
    logDeploy('Logistik: https://truschi84-dot.github.io/versand/logistik/');
}

async function jobGithubLocal() {
    const newV  = bumpRechnerVersion();
    const newLV = bumpLogistikVersion();
    logDeploy('✅ Lokal erhöht — Build ' + newV + ' · Logistik v1.' + newLV + ' (kein Push)');
}

// ── Health Check ──────────────────────────────────────────────
async function runHealthCheck() {
    const checks = [];
    function ok(name, msg)   { checks.push({ status:'ok',   name, message: msg }); }
    function warn(name, msg, hint) { checks.push({ status:'warn', name, message: msg, hint }); }
    function fail(name, msg, hint) { checks.push({ status:'fail', name, message: msg, hint }); }

    // app-secrets.json
    if (fs.existsSync(path.join(ROOT, 'app-secrets.json'))) ok('app-secrets.json', 'Vorhanden');
    else fail('app-secrets.json', 'Fehlt', 'Datei aus sicherem Speicher wiederherstellen');

    // deploy.config.json
    loadDeployConfig();
    if (deployConfig) ok('deploy.config.json', 'Geladen');
    else warn('deploy.config.json', 'Fehlt', 'USB-Deploy nicht möglich ohne Konfiguration');

    // Android-Projekte
    ['rechner', 'logistik'].forEach(key => {
        const cfg = deployConfig && deployConfig[key];
        const label = key === 'logistik' ? 'Logistik-APK' : 'Rechner-APK';
        if (!cfg || !cfg.androidProject) {
            warn(label, 'Nicht konfiguriert', 'deploy.config.json → ' + key);
            return;
        }
        if (!fs.existsSync(cfg.androidProject)) {
            fail(label, 'Projekt fehlt: ' + cfg.androidProject);
            return;
        }
        const apk = path.join(cfg.androidProject, (cfg.apkPath || '').replace(/\//g, path.sep));
        if (fs.existsSync(apk)) ok(label, 'APK vorhanden');
        else warn(label, 'Gradle-Projekt OK, APK noch nicht gebaut', 'Einmal „APK bauen + USB“ klicken');
    });

    // ADB
    try {
        await run(adb() + ' version');
        const devices = await getAdbDevices();
        if (devices.length) ok('ADB', devices.length + ' Gerät(e) verbunden: ' + devices.map(d=>d.id).join(', '));
        else warn('ADB', 'Installiert, aber kein Gerät verbunden', 'USB-Kabel prüfen + USB-Debugging aktivieren');
    } catch(e) { fail('ADB', 'Nicht gefunden', 'Android Platform Tools installieren: https://developer.android.com/tools/releases/platform-tools'); }

    // Git
    try {
        const branch = await run('git rev-parse --abbrev-ref HEAD');
        const status = await run('git status --short');
        ok('Git', 'Branch: ' + branch + (status ? ' · ' + status.split('\n').length + ' unkommittierte Dateien' : ' · sauber'));
    } catch(e) { warn('Git', 'git nicht verfügbar', e.message); }

    // Versionen
    const av = readVersions();
    ok('Versionen', 'Rechner Build ' + (av.webVersion||'?') + ' · Logistik v' + (av.logistikLabel||'?'));

    // Control app files
    const controlFiles = ['control/index.html', 'control/js/control-center-core.js'];
    const missingControl = controlFiles.filter(f => !fs.existsSync(path.join(ROOT, f)));
    if (!missingControl.length) ok('Control-App', 'Alle Dateien vorhanden');
    else fail('Control-App', 'Dateien fehlen: ' + missingControl.join(', '));

    const okCount   = checks.filter(c=>c.status==='ok').length;
    const warnCount = checks.filter(c=>c.status==='warn').length;
    const failCount = checks.filter(c=>c.status==='fail').length;
    return { checks, okCount, warnCount, failCount, manualChecklist: [
        'Handy zeigt "Gerät verbunden" Meldung (USB)',
        'USB-Debugging in Entwickleroptionen aktiviert',
        'App öffnet sich nach Installation ohne Fehler',
        'Control-App: URL im Browser testen',
    ]};
}

// ── API Router ────────────────────────────────────────────────
async function handleApi(req, res) {
    const url = req.url.split('?')[0];
    const json = (data, code) => {
        res.writeHead(code||200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify(data));
    };

    if (req.method === 'GET' && url === '/api/deploy/status') {
        const forceRefresh = (req.url.split('?')[1] || '').includes('refresh=1');
        loadDeployConfig();
        const adbOk = await checkAdbAvailable(forceRefresh);
        const devices = adbOk ? await getAdbDevicesCached(forceRefresh).catch(()=>[]) : [];
        const av = readVersions();
        const lanIp = getLanIPv4();
        const logistikUrl = lanIp ? ('http://' + lanIp + ':' + PORT + '/logistik/') : null;
        const rechnerCfg = getAppDeployConfig('rechner');
        const logistikCfg = getAppDeployConfig('logistik');
        return json({ ok:true, deployRunning, deployLog: deployLog.slice(-30),
            webVersion: av,
            deployConfig: {
                ok: !!(rechnerCfg && rechnerCfg.androidProject && logistikCfg && logistikCfg.androidProject),
                rechner: !!(rechnerCfg && fs.existsSync(rechnerCfg.androidProject || '')),
                logistik: !!(logistikCfg && fs.existsSync(logistikCfg.androidProject || ''))
            },
            adb: { adbFound: adbOk, adbPath: adbOk ? adb() : null, devices },
            lanIp, logistikUrl,
            testMode: PORT !== 8080 });
    }

    if (req.method === 'GET' && url === '/api/deploy/health-check') {
        try { const report = await runHealthCheck(); return json({ ok:true, report }); }
        catch(e) { return json({ ok:false, error: e.message }); }
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', d => body += d);
        await new Promise(r => req.on('end', r));
        let payload = {};
        try { payload = JSON.parse(body || '{}'); } catch(e) {}

        if (deployRunning && url !== '/api/deploy/status') {
            return json({ ok:false, error: 'Deploy läuft bereits.' });
        }

        const runJob = (job) => {
            deployRunning = true; deployLog = [];
            job().then(() => { deployRunning = false; })
                 .catch(e => { logDeploy('❌ Fehler: ' + e.message); deployRunning = false; });
            return json({ ok:true });
        };

        if (url === '/api/deploy/usb-full')          return runJob(() => jobUsbFull());
        if (url === '/api/deploy/usb-full-logistik') return runJob(() => jobUsbFull_Logistik());
        if (url === '/api/deploy/usb-apk-only')      return runJob(() => jobUsbApkOnly(payload.app || 'rechner', payload.deviceId));
        if (url === '/api/deploy/github')            return runJob(() => jobGithub(payload.message));
        if (url === '/api/deploy/github-local')      return runJob(() => jobGithubLocal());
        if (url === '/api/deploy/ota-firebase')      return runJob(async () => { logDeploy('Firebase CLI…'); await run('firebase deploy --only hosting'); logDeploy('✅ Firebase deployed'); });
    }

    json({ ok:false, error: 'Unbekannte Route: ' + url }, 404);
}

// ── Static file server ────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url.startsWith('/api/')) return handleApi(req, res).catch(e => {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:false, error: e.message }));
    });

    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '') url = '/Start.html';
    // Alte Pfade weiterleiten
    if (url === '/projekt/buero/control-center.html') { res.writeHead(302, { Location: '/control/index.html' }); res.end(); return; }
    let filePath = path.join(ROOT, url);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found: ' + url); return; }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('');
        console.error('  FEHLER: Port ' + PORT + ' ist bereits belegt!');
        console.error('  START.bat erneut doppelklicken (beendet nur den Server auf Port 8080).');
        console.error('');
    } else {
        console.error('Server-Fehler:', err.message);
    }
    process.exit(1);
});

function onListening() {
    const sync = syncLiveOfficeUrls(ROOT, PORT);
    console.log('');
    console.log('  ================================');
    console.log('   Tresch Apps Server · Port ' + PORT);
    console.log('  ================================');
    console.log('  Start:    http://localhost:' + PORT + '/Start.html');
    console.log('  Logistik: http://localhost:' + PORT + '/logistik/');
    console.log('  Control:  http://localhost:' + PORT + '/control/');
    console.log('  Deploy:   http://localhost:' + PORT + '/api/deploy/status');
    if (sync.lanIp) {
        console.log('  WLAN:     ' + sync.officeBase + '  (Handys im gleichen Netz)');
        console.log('  Logistik: ' + sync.logistikUrl);
        if (sync.changed.length) console.log('  Sync:     ' + sync.changed.join(', '));
    } else {
        console.log('  WLAN:     keine LAN-IP — nur localhost erreichbar');
    }
    console.log('');
}

server.listen(PORT, '0.0.0.0', onListening);
