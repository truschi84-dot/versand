/**
 * Liest PIN-Einstellungen aus Firebase und schreibt app-settings-public.json
 * (nur logistikPin, adminPin, pinVersion - fuer GitHub Pages ohne Cloud-Auth).
 * Aufruf: node sync-public-pins.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const APP_ROOT = path.join(__dirname, '..', '..');
const SECRETS = path.join(APP_ROOT, 'app-secrets.json');
const OUT = path.join(APP_ROOT, 'app-settings-public.json');
const BACKUP_URL = 'https://tresch-versand-default-rtdb.firebaseio.com/backup';

function postJson(url, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null }); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    if (!fs.existsSync(SECRETS)) {
        console.error('app-secrets.json fehlt - kann PINs nicht aus Cloud lesen.');
        process.exit(1);
    }
    const sec = JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
    const auth = await postJson(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(sec.firebaseApiKey),
        { email: sec.firebaseAuthEmail, password: sec.firebaseAuthPassword, returnSecureToken: true }
    );
    if (auth.status !== 200 || !auth.data.idToken) {
        console.error('Firebase-Login fehlgeschlagen:', auth.data.error?.message || auth.status);
        process.exit(1);
    }
    const token = auth.data.idToken;
    const settingsRes = await getJson(BACKUP_URL + '/settings.json?auth=' + encodeURIComponent(token));
    if (settingsRes.status !== 200 || !settingsRes.data) {
        console.error('settings.json nicht lesbar:', settingsRes.status);
        process.exit(1);
    }
    const s = settingsRes.data;
    const pub = {
        logistikPin: String(s.logistikPin || '').trim(),
        adminPin: String(s.adminPin || '110784').trim(),
        pinVersion: parseInt(s.pinVersion, 10) || 1,
        updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    if (!pub.logistikPin) {
        console.error('Cloud settings haben keine logistikPin');
        process.exit(1);
    }
    fs.writeFileSync(OUT, JSON.stringify(pub, null, 2) + '\n', 'utf8');
    console.log('OK app-settings-public.json (pinVersion ' + pub.pinVersion + ')');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
