/**
 * Minimaler lokaler Webserver für Vorschau / Debugging (Port 8080).
 * Start: node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
/** App-Root (eine Ebene über projekt/) – bedient App + projekt/pc/ */
const ROOT = path.join(__dirname, '..');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const headers = {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
        };
        if (req.method === 'HEAD') {
            res.writeHead(200, headers);
            res.end();
            return;
        }
        res.writeHead(200, headers);
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    let lan = 'localhost';
    for (const nics of Object.values(os.networkInterfaces())) {
        for (const nic of nics) {
            if (nic.family === 'IPv4' && !nic.internal) {
                lan = nic.address;
                break;
            }
        }
    }
    console.log(`Kombi Buero-Server:`);
    console.log(`  App:    http://localhost:${PORT}/index.html`);
    console.log(`  Admin:  http://localhost:${PORT}/projekt/pc/control-center.html`);
    console.log(`  WLAN:   http://${lan}:${PORT}/index.html`);
    console.log(`  OTA:    officeWebBaseUrl in app-update.json = http://${lan}:${PORT}`);
});
