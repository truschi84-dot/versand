/**
 * Büro-WLAN: LAN-IP ermitteln und officeWebBaseUrl synchronisieren.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PORT = 8080;
/**
 * 2026-08-17: Die LAN-IP dieses Rechners geht NUR noch in diese oertliche Datei
 * (steht in .gitignore). app-update.json im Repo wird nicht mehr angefasst — am 05.08.
 * war so eine Hotspot-Adresse in einen Commit geraten und fast auf die Handys gelangt.
 * server.js legt beim Ausliefern von /app-update.json diese Werte oben drauf.
 */
const LOCAL_UPDATE_FILE = 'app-update.local.json';

function getLanIPv4() {
    const candidates = [];
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const nic of ifaces || []) {
            const family = nic.family;
            if (family !== 'IPv4' && family !== 4) continue;
            if (nic.internal) continue;
            const ip = nic.address;
            if (!ip || ip.startsWith('127.')) continue;
            let score = 0;
            if (/^192\.168\./.test(ip)) score = 3;
            else if (/^10\./.test(ip)) score = 2;
            else if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) score = 1;
            candidates.push({ ip, score });
        }
    }
    candidates.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip));
    return candidates[0]?.ip || null;
}

function readJson(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function syncLiveOfficeUrls(appRoot, port) {
    port = port || DEFAULT_PORT;
    const lanIp = getLanIPv4();
    if (!lanIp) {
        return { ok: false, lanIp: null, officeBase: null, logistikUrl: null, changed: [] };
    }
    const officeBase = 'http://' + lanIp + ':' + port;
    const logistikUrl = officeBase + '/logistik/';
    const changed = [];
    const localPath = path.join(appRoot, LOCAL_UPDATE_FILE);
    const local = readJson(localPath) || {};
    if (String(local.officeWebBaseUrl || '').trim() !== officeBase || local.preferOfficeLan == null) {
        local.officeWebBaseUrl = officeBase;
        if (local.preferOfficeLan == null) local.preferOfficeLan = true;
        writeJson(localPath, local);
        changed.push(LOCAL_UPDATE_FILE);
    }
    return { ok: true, lanIp, officeBase, logistikUrl, changed };
}

module.exports = { DEFAULT_PORT, LOCAL_UPDATE_FILE, getLanIPv4, syncLiveOfficeUrls, readJson };
