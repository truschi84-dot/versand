/**
 * Büro-WLAN: LAN-IP ermitteln und officeWebBaseUrl synchronisieren.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PORT = 8080;

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
    const updatePath = path.join(appRoot, 'app-update.json');
    const upd = readJson(updatePath);
    if (upd && String(upd.officeWebBaseUrl || '').trim() !== officeBase) {
        upd.officeWebBaseUrl = officeBase;
        if (upd.preferOfficeLan == null) upd.preferOfficeLan = true;
        writeJson(updatePath, upd);
        changed.push('app-update.json');
    }
    return { ok: true, lanIp, officeBase, logistikUrl, changed };
}

module.exports = { DEFAULT_PORT, getLanIPv4, syncLiveOfficeUrls };
