const WORKER_COLOR_PALETTE = ['#d32f2f', '#1976d2', '#fbc02d', '#388e3c', '#7b1fa2', '#e65100', '#00838f', '#5d4037', '#c2185b', '#00695c'];

function getWorkerColor(name) {
    return (db.workerColors && db.workerColors[name]) || '#9e9e9e';
}

function nextWorkerColor() {
    const used = new Set(Object.values(db.workerColors || {}));
    for (const c of WORKER_COLOR_PALETTE) if (!used.has(c)) return c;
    return WORKER_COLOR_PALETTE[(db.workers || []).length % WORKER_COLOR_PALETTE.length];
}

function workerDomKey(name) { return encodeURIComponent(name); }

function renderWorkersList() {
    const body = document.getElementById('worker-body');
    const countEl = document.getElementById('worker-count');
    const hint = document.getElementById('worker-empty-hint');
    const colorInput = document.getElementById('new-worker-color');
    if (!body) return;

    const list = (db.workers || []).slice();
    if (countEl) countEl.textContent = list.length;
    if (hint) hint.style.display = list.length === 0 ? 'block' : 'none';
    if (colorInput && document.activeElement !== colorInput) colorInput.value = nextWorkerColor();

    body.innerHTML = list.map(w => {
        const color = getWorkerColor(w);
        const key = workerDomKey(w);
        const esc = w.replace(/"/g, '&quot;');
        return `<tr>
            <td><span class="worker-color-swatch" style="background:${color};"></span></td>
            <td style="font-weight:bold; font-size:15px;">
                <span id="wor-label-${key}">${w}</span>
                <input type="text" id="wor-edit-input-${key}" value="${esc}" style="display:none; width:90%; padding:6px 10px; font-size:14px;">
            </td>
            <td style="text-align:right; white-space:nowrap;">
                <input type="color" class="worker-color-input" value="${color}" title="Farbe ändern" onchange="updateWorkerColor(decodeURIComponent('${key}'), this.value)">
                <button id="btn-edit-wor-${key}" onclick="inlineEditWorker(decodeURIComponent('${key}'))" class="btn" style="background:#ffc107; color:black; padding:6px 12px; font-size:12px; margin-left:4px;">✏️</button>
                <button id="btn-save-wor-${key}" onclick="inlineSaveWorker(decodeURIComponent('${key}'))" class="btn btn-success" style="display:none; padding:6px 12px; font-size:12px; margin-left:4px;">💾</button>
                <button onclick="deleteWorker(decodeURIComponent('${key}'))" class="btn" style="background:var(--todo); padding:6px 12px; font-size:12px; margin-left:4px;">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function saveWorker() {
    const name = document.getElementById('new-worker-name').value.trim();
    if (!name) return alert('Bitte einen Namen eingeben.');
    if ((db.workers || []).includes(name)) return alert('Dieser Mitarbeiter existiert bereits.');
    if (!db.workers) db.workers = [];
    if (!db.workerColors) db.workerColors = {};
    const color = document.getElementById('new-worker-color').value || nextWorkerColor();
    // 2026-08-21: wieder angelegt = nicht mehr geloescht (siehe Fall "Herta").
    mitarbeiterGrabsteinAufheben(name);
    db.workers.push(name);
    db.workerColors[name] = color;
    document.getElementById('new-worker-name').value = '';
    renderAll();
}

function inlineEditWorker(oldName) {
    const key = workerDomKey(oldName);
    document.getElementById(`wor-label-${key}`).style.display = 'none';
    document.getElementById(`wor-edit-input-${key}`).style.display = 'inline-block';
    document.getElementById(`btn-edit-wor-${key}`).style.display = 'none';
    document.getElementById(`btn-save-wor-${key}`).style.display = 'inline-block';
    document.getElementById(`wor-edit-input-${key}`).focus();
}

function renameWorkerInDb(oldName, newName) {
    if (oldName === newName) return;
    const idx = db.workers.indexOf(oldName);
    if (idx !== -1) db.workers[idx] = newName;
    if (db.workerColors && db.workerColors[oldName] !== undefined) {
        db.workerColors[newName] = db.workerColors[oldName];
        delete db.workerColors[oldName];
    }
    if (db.dailyAttendance) {
        Object.keys(db.dailyAttendance).forEach(date => {
            const day = db.dailyAttendance[date];
            if (day && day[oldName] !== undefined) {
                day[newName] = day[oldName];
                delete day[oldName];
            }
        });
    }
    (db.deliveries || []).forEach(del => {
        (del.workerShares || []).forEach(ws => { if (ws.name === oldName) ws.name = newName; });
    });
    (db.entries || []).forEach(entry => {
        if (entry.workers && entry.workers[oldName] !== undefined) {
            entry.workers[newName] = entry.workers[oldName];
            delete entry.workers[oldName];
        }
    });
}

function inlineSaveWorker(oldName) {
    const key = workerDomKey(oldName);
    const newName = document.getElementById(`wor-edit-input-${key}`).value.trim();
    if (!newName) return alert('Der Name darf nicht leer sein.');
    if (newName !== oldName && db.workers.includes(newName)) return alert('Ein Mitarbeiter mit diesem Namen existiert bereits.');
    renameWorkerInDb(oldName, newName);
    renderAll();
}

function updateWorkerColor(name, color) {
    if (!db.workerColors) db.workerColors = {};
    db.workerColors[name] = color;
    renderAll();
}

function deleteWorker(name) {
    const usage = (db.deliveries || []).reduce((n, del) => n + (del.workerShares || []).filter(ws => ws.name === name).length, 0);
    let msg = `Mitarbeiter "${name}" aus der Liste entfernen?`;
    if (usage > 0) msg += `\n\nHinweis: ${usage} historische Zuweisung(en) in LKW-Erfassungen behalten den Namen.`;
    if (!confirm(msg)) return;
    db.workers = (db.workers || []).filter(w => w !== name);
    if (db.workerColors) delete db.workerColors[name];
    // 2026-08-21: Grabstein setzen. Er sagt "bewusst geloescht" -- ohne ihn kann das
    // neue Datenmodell nicht unterscheiden, ob der Mitarbeiter geloescht wurde oder
    // auf diesem PC nur gerade fehlt, und musste deshalb nachfragen.
    if (!Array.isArray(db.deletedWorkers)) db.deletedWorkers = [];
    if (!db.deletedWorkers.includes(name)) db.deletedWorkers.push(name);
    renderAll();
}

/**
 * Gegenstueck zu deleteWorker(). Wird jemand wieder angelegt, ist er nicht mehr
 * geloescht -- gleiche Regel wie bei Artikeln, Lieferanten und Sortier-Buchungen.
 * Siehe den Fall "Herta" vom 21.08.2026.
 */
function mitarbeiterGrabsteinAufheben(name) {
    const n = String(name || '').trim();
    if (!n || !Array.isArray(db.deletedWorkers)) return false;
    const vorher = db.deletedWorkers.length;
    db.deletedWorkers = db.deletedWorkers.filter(w => String(w).trim() !== n);
    return vorher !== db.deletedWorkers.length;
}
