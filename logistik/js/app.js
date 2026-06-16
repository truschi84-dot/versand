// ============================================================
// TRESCH LOGISTIK — APP (Sektionen, UI, CRUD)
// ============================================================

// ── HELPERS ──────────────────────────────────────────────────
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function ge(id) { return document.getElementById(id); }

function getWorkerColor(name) { return (db.workerColors && db.workerColors[name]) || '#9e9e9e'; }

function getSupLines(name) {
    if (!db.supplierLines) return [];
    const key = encodeURIComponent(name);
    const lines = db.supplierLines[key] || db.supplierLines[name];
    return Array.isArray(lines) ? lines.filter(Boolean) : [];
}
function setSupLines(name, lines) {
    if (!db.supplierLines) db.supplierLines = {};
    const key = encodeURIComponent(name);
    const cleaned = lines.filter(l => String(l).trim());
    if (cleaned.length) db.supplierLines[key] = cleaned;
    else { delete db.supplierLines[key]; delete db.supplierLines[name]; }
}

function getArtikelMarkt(fnr) {
    const v = (db.artikelMarkt || {})[String(fnr || '')];
    return v === 'export' || v === 'uns' ? v : '';
}

// ── ARTIKEL ──────────────────────────────────────────────────
let activeArtTab = 'todo';
let artLastAction = null;

function switchArtTab(tab) {
    activeArtTab = tab;
    ['todo','done','later','hidden'].forEach(t => {
        ge('atab-' + t)?.classList.toggle('active', t === tab);
    });
    renderArtikelList();
}

function updateArtCounts() {
    ge('cnt-todo').textContent = db.todo.length;
    ge('cnt-done').textContent = db.articles.length;
    ge('cnt-later').textContent = db.later.length;
    ge('cnt-hidden').textContent = db.hidden.length;
    const total = db.todo.length + db.lose.length + db.later.length + db.hidden.length + db.articles.length;
    const done = db.articles.length + db.hidden.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    ge('art-progress').style.width = pct + '%';
    ge('art-progress-text').textContent = pct + '% zugeordnet';
}

function renderArtikelList() {
    updateArtCounts();
    const s = (ge('art-search')?.value || '').toLowerCase();
    const list = ge('art-list');
    const empty = ge('art-empty');

    let items = [];
    if (activeArtTab === 'todo') items = db.todo || [];
    else if (activeArtTab === 'done') items = db.articles || [];
    else if (activeArtTab === 'later') items = db.later || [];
    else if (activeArtTab === 'hidden') items = db.hidden || [];

    const filtered = s ? items.filter(a => (a.fertigNr||'').toLowerCase().includes(s) || (a.name||'').toLowerCase().includes(s) || (a.nr||'').toLowerCase().includes(s)) : items;

    if (!filtered.length) {
        list.innerHTML = ''; list.style.display = 'none';
        empty.style.display = 'block'; return;
    }
    empty.style.display = 'none'; list.style.display = 'block';

    list.innerHTML = filtered.map(a => {
        const id = esc(a.fertigNr);
        const nm = esc(a.name);
        let actions = '';
        if (activeArtTab === 'todo') {
            actions = `<button class="btn btn-primary btn-sm" onclick="openAssignModal('${id}')">✅ Zuordnen</button>
                <button class="btn btn-sm" style="background:#ffc107;color:#333;" onclick="moveArtikel('${id}','todo','lose')">→ Lose</button>
                <button class="btn btn-sm" style="background:#17a2b8;" onclick="moveArtikel('${id}','todo','later')">→ Später</button>
                <button class="btn btn-sm" style="background:#6c757d;" onclick="moveArtikel('${id}','todo','hidden')">→ Versteckt</button>
                <button class="btn btn-sm" onclick="openEditArtModal('${id}','todo')" style="background:#ff9800;">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteArtItem('${id}','todo')">🗑️</button>`;
        } else if (activeArtTab === 'done') {
            const idx = db.articles.findIndex(x => x.fertigNr === a.fertigNr);
            const m = getArtikelMarkt(a.fertigNr);
            const mLabel = m === 'export' ? ' <span style="background:#1565c0;color:white;padding:2px 6px;border-radius:4px;font-size:10px;">Export</span>' : m === 'uns' ? ' <span style="background:#e65100;color:white;padding:2px 6px;border-radius:4px;font-size:10px;">Uns</span>' : '';
            actions = `<button class="btn btn-sm" onclick="openEditArtModal('${id}','done')" style="background:#ff9800;">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="unassignArt(${idx})">🗑️ Lösen</button>
                <select onchange="setArtMarkt('${id}',this.value)" style="padding:6px;border-radius:6px;border:1px solid #ccc;font-size:12px;">
                    <option value="">Markt</option>
                    <option value="uns"${m==='uns'?' selected':''}>Uns</option>
                    <option value="export"${m==='export'?' selected':''}>Export</option>
                </select>`;
            return `<div class="art-item">
                <div class="art-item-row">
                    <span class="art-nr lose">${esc(a.nr||'—')}</span>
                    <span class="art-nr">${id}</span>
                    <span class="art-name">${nm}${mLabel}</span>
                    <button class="art-expand" onclick="toggleArtActions(this)">⋯</button>
                </div>
                <div class="art-actions">${actions}</div>
            </div>`;
        } else if (activeArtTab === 'later') {
            actions = `<button class="btn btn-sm" style="background:#17a2b8;" onclick="restoreArt('${id}','later')">↩ Zurück</button>
                <button class="btn btn-sm" onclick="openEditArtModal('${id}','later')" style="background:#ff9800;">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteArtItem('${id}','later')">🗑️</button>`;
        } else if (activeArtTab === 'hidden') {
            actions = `<button class="btn btn-sm" style="background:#6c757d;" onclick="restoreArt('${id}','hidden')">👁 Einblenden</button>
                <button class="btn btn-sm" onclick="openEditArtModal('${id}','hidden')" style="background:#ff9800;">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteArtItem('${id}','hidden')">🗑️</button>`;
        }
        return `<div class="art-item">
            <div class="art-item-row">
                <span class="art-nr${activeArtTab==='done'?' lose':''}">${id}</span>
                <span class="art-name">${nm}</span>
                <button class="art-expand" onclick="toggleArtActions(this)">⋯</button>
            </div>
            <div class="art-actions">${actions}</div>
        </div>`;
    }).join('');
}

function toggleArtActions(btn) {
    const actions = btn.closest('.art-item').querySelector('.art-actions');
    const isOpen = actions.classList.contains('open');
    // close all others
    document.querySelectorAll('.art-actions.open').forEach(a => a.classList.remove('open'));
    if (!isOpen) actions.classList.add('open');
}

function setArtMarkt(fnr, val) {
    if (!db.artikelMarkt) db.artikelMarkt = {};
    if (val === 'uns' || val === 'export') db.artikelMarkt[fnr] = val;
    else delete db.artikelMarkt[fnr];
    saveDb();
    renderArtikelList();
}

function moveArtikel(id, from, to) {
    const pool = db[from]; const idx = pool.findIndex(a => a.fertigNr === id);
    if (idx === -1) return;
    const art = pool.splice(idx, 1)[0];
    db[to].push(art);
    artLastAction = { from, to, id };
    ge('undo-bar').classList.remove('hidden');
    ge('undo-text').textContent = id + ' → ' + to;
    renderAll();
}

function restoreArt(id, pool) {
    const arr = db[pool]; const idx = arr.findIndex(a => a.fertigNr === id);
    if (idx === -1) return;
    const art = arr.splice(idx, 1)[0];
    db.todo.push(art);
    renderAll();
}

function unassignArt(idx) {
    if (idx < 0 || idx >= db.articles.length) return;
    const art = db.articles.splice(idx, 1)[0];
    art.nr = '';
    if (art.originalName) art.name = art.originalName;
    db.todo.push(art);
    renderAll();
}

function deleteArtItem(id, pool) {
    if (!confirm('Artikel endgültig löschen?')) return;
    db[pool] = (db[pool] || []).filter(a => a.fertigNr !== id);
    renderAll();
}

function undoLastAction() {
    if (!artLastAction) return;
    const { from, to, id } = artLastAction;
    const arr = db[to]; const idx = arr.findIndex(a => a.fertigNr === id);
    if (idx !== -1) { const art = arr.splice(idx, 1)[0]; db[from].push(art); }
    artLastAction = null;
    ge('undo-bar').classList.add('hidden');
    renderAll();
}

// New Artikel
function toggleNewArtCard() {
    const c = ge('new-art-card');
    c.style.display = c.style.display === 'none' ? 'block' : 'none';
}

function saveNewFertig() {
    const nr = (ge('c-fnr').value||'').trim();
    const name = (ge('c-fname').value||'').trim();
    const markt = (ge('c-fmarkt').value||'');
    if (!nr || !name) return alert('Bitte Nr. und Bezeichnung eingeben!');
    if (db.todo.some(a=>a.fertigNr===nr)||db.articles.some(a=>a.fertigNr===nr)) return alert('Nr. existiert bereits!');
    db.todo.push({ fertigNr: nr, name, nr: '', suppliers: [] });
    if (markt) { if (!db.artikelMarkt) db.artikelMarkt = {}; db.artikelMarkt[nr] = markt; }
    ge('c-fnr').value = ''; ge('c-fname').value = ''; ge('c-fmarkt').value = '';
    renderAll();
}

function saveNewLose() {
    const nr = (ge('c-lnr').value||'').trim();
    const name = (ge('c-lname').value||'').trim();
    if (!nr || !name) return alert('Bitte Nr. und Bezeichnung eingeben!');
    if (db.lose.some(a=>a.fertigNr===nr)) return alert('Lose-Nr. existiert bereits!');
    db.lose.push({ fertigNr: nr, name, nr: '', suppliers: [] });
    ge('c-lnr').value = ''; ge('c-lname').value = '';
    renderAll();
}

// Lose Pool
function openLosePool() {
    renderLosePool();
    openSheet('sheet-lose');
}

function renderLosePool() {
    const s = (ge('lose-search')?.value||'').toLowerCase();
    const count = ge('lose-count'); if(count) count.textContent = db.lose.length;
    const list = ge('lose-list'); if(!list) return;
    const items = s ? db.lose.filter(a => (a.fertigNr||'').toLowerCase().includes(s)||(a.name||'').toLowerCase().includes(s)) : db.lose;
    list.innerHTML = items.map(a => `
        <div class="sheet-item" style="border-bottom:1px solid #f0f2f5;">
            <div style="flex:1;">
                <div style="font-weight:700; font-size:13px;color:var(--muted);">${esc(a.fertigNr)}</div>
                <div style="font-size:14px;">${esc(a.name)}</div>
            </div>
            <div style="display:flex;gap:6px;">
                <button class="btn btn-sm" style="background:#17a2b8;" onclick="restoreArt('${esc(a.fertigNr)}','lose')">↩</button>
                <button class="btn btn-danger btn-sm" onclick="deleteArtItem('${esc(a.fertigNr)}','lose')">🗑️</button>
            </div>
        </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--muted);">Lose-Pool leer</div>';
}

// Edit Art Overlay
let editArtCtx = null;

function openEditArtModal(id, pool) {
    const art = pool === 'done'
        ? db.articles.find(a => a.fertigNr === id)
        : (db[pool]||[]).find(a => a.fertigNr === id);
    if (!art) return;
    editArtCtx = { pool, id };
    ge('ov-art-pool').value = pool;
    ge('ov-art-old-id').value = id;
    ge('ov-art-nr').value = art.fertigNr || '';
    ge('ov-art-name').value = art.name || '';
    ge('ov-edit-art-title').textContent = pool === 'done' ? 'Fertig-Artikel bearbeiten' : 'Artikel bearbeiten';
    const doneFields = ge('ov-art-done-fields');
    if (pool === 'done') {
        doneFields.style.display = 'block';
        ge('ov-art-lose-nr').value = art.nr || '';
    } else { doneFields.style.display = 'none'; }
    openOv('ov-edit-art');
}

function saveEditArt() {
    if (!editArtCtx) return;
    const { pool, id } = editArtCtx;
    const newNr = (ge('ov-art-nr').value||'').trim();
    const newName = (ge('ov-art-name').value||'').trim();
    if (!newNr || !newName) return alert('Bitte alle Felder ausfüllen.');
    let art;
    if (pool === 'done') { art = db.articles.find(a => a.fertigNr === id); }
    else { art = (db[pool]||[]).find(a => a.fertigNr === id); }
    if (!art) return closeOv('ov-edit-art');
    art.fertigNr = newNr; art.name = newName;
    if (pool === 'done') art.nr = (ge('ov-art-lose-nr').value||'').trim();
    closeOv('ov-edit-art');
    renderAll();
}

// Assign Modal
let assignTargetId = null;

function openAssignModal(targetId) {
    if (!db.lose.length) return alert('Lose-Pool ist leer! Zuerst Lose-Artikel anlegen.');
    assignTargetId = targetId;
    const art = db.todo.find(a => a.fertigNr === targetId); if (!art) return;
    ge('assign-target-name').textContent = art.fertigNr + ' – ' + art.name;
    ge('assign-app-name').value = art.name;
    ge('assign-search').value = '';
    ge('modal-assign').classList.add('visible');
    renderAssignList();
    setTimeout(() => ge('assign-search').focus(), 200);
}

function closeAssignModal() { ge('modal-assign').classList.remove('visible'); assignTargetId = null; }

function renderAssignList() {
    const s = (ge('assign-search').value||'').toLowerCase();
    const todoArt = db.todo.find(a => a.fertigNr === assignTargetId); if (!todoArt) return;
    const targetWords = todoArt.name.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 2);
    const scored = db.lose.map(a => {
        let score = 0;
        a.name.toLowerCase().split(/[\s,.-]+/).filter(w=>w.length>2).forEach(w => { if(targetWords.includes(w)) score++; });
        return { ...a, score };
    }).sort((a,b) => b.score - a.score);
    const filtered = s ? scored.filter(a => (a.fertigNr||'').toLowerCase().includes(s)||(a.name||'').toLowerCase().includes(s)) : scored;
    let first = true;
    ge('assign-list').innerHTML = filtered.map(a => {
        const isBest = a.score > 0 && first;
        if (a.score > 0) first = false;
        return `<div class="assign-item${isBest?' best':''}" onclick="confirmAssign('${esc(a.fertigNr)}')">
            <div class="assign-item-nr">${esc(a.fertigNr)}${isBest?' ⭐ Bester Treffer':''}</div>
            <div class="assign-item-name">${esc(a.name)}</div>
        </div>`;
    }).join('') || '<div style="padding:20px;text-align:center;color:var(--muted);">Keine Treffer</div>';
}

function confirmAssign(loseId) {
    const idx = db.todo.findIndex(a => a.fertigNr === assignTargetId); if (idx === -1) return;
    const art = db.todo.splice(idx, 1)[0];
    art.nr = loseId.trim();
    art.originalName = art.name;
    const appName = (ge('assign-app-name').value||'').trim() || art.name;
    art.name = appName + ' (' + art.fertigNr + ')';
    if (!art.suppliers) art.suppliers = [];
    db.articles.push(art);
    artLastAction = { from: null, to: 'done', id: art.fertigNr };
    ge('undo-bar').classList.remove('hidden');
    ge('undo-text').textContent = art.fertigNr + ' zugeordnet';
    closeAssignModal();
    renderAll();
}

// ── LIEFERANTEN ──────────────────────────────────────────────
function renderLieferanten() {
    const s = (ge('sup-search')?.value||'').toLowerCase();
    const list = ge('sup-list'); if (!list) return;
    const del = new Set((db.deletedSuppliers||[]).map(x=>String(x).trim()));
    const sups = (db.suppliers||[]).filter(x=>x && !del.has(String(x).trim())).sort();
    const filtered = s ? sups.filter(x=>x.toLowerCase().includes(s)) : sups;
    if (!filtered.length) { list.innerHTML = '<div class="empty"><div class="empty-icon">🚚</div><div class="empty-text">Keine Lieferanten angelegt</div></div>'; return; }
    list.innerHTML = filtered.map(sup => {
        const key = encodeURIComponent(sup);
        const lines = getSupLines(sup);
        const linesText = lines.length ? lines.join('\n') : '';
        return `<div class="sup-card" id="sup-${key}">
            <div class="sup-card-head">
                <span class="sup-card-name" id="sup-lbl-${key}">${esc(sup)}</span>
                <div class="sup-card-actions">
                    <button class="btn btn-sm" style="background:#e3f2fd;color:#1565c0;" onclick="toggleSupLines('${key}')">📋</button>
                    <button class="btn btn-sm" style="background:#f3e5f5;color:#6a1b9a;" onclick="showSupStats('${esc(sup)}')">📊</button>
                    <button class="btn btn-sm" style="background:#ffc107;color:#333;" onclick="editSupInline('${key}','${esc(sup)}')">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSup('${esc(sup)}')">🗑️</button>
                </div>
            </div>
            <div class="sup-lines-wrap" id="sup-lines-${key}">
                <label class="form-label">Warenlinien (eine pro Zeile)</label>
                <textarea id="sup-lines-ta-${key}" rows="4" placeholder="Linie 1&#10;Linie 2&#10;...">${esc(linesText)}</textarea>
                <div style="margin-top:8px;"><button class="btn btn-primary btn-sm" onclick="saveSupLines('${key}','${esc(sup)}')">Warenlinien speichern</button></div>
            </div>
        </div>`;
    }).join('');
}

function toggleSupLines(key) {
    const el = ge('sup-lines-' + key);
    if (el) el.classList.toggle('open');
}

function saveSupLines(key, name) {
    const ta = ge('sup-lines-ta-' + key); if (!ta) return;
    const lines = ta.value.split('\n').map(l=>l.trim()).filter(Boolean);
    const decoded = decodeURIComponent(name);
    setSupLines(decoded, lines);
    renderAll();
}

function editSupInline(key, name) {
    const lbl = ge('sup-lbl-' + key); if (!lbl) return;
    const decoded = decodeURIComponent(name);
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = decoded; inp.style.cssText = 'flex:1;font-size:15px;';
    lbl.replaceWith(inp);
    inp.focus();
    inp.onblur = () => confirmSupRename(key, decoded, inp.value.trim());
    inp.onkeydown = e => { if(e.key==='Enter') inp.blur(); if(e.key==='Escape'){inp.value=decoded;inp.blur();} };
}

function confirmSupRename(key, oldName, newName) {
    if (!newName || newName === oldName) { renderLieferanten(); return; }
    if (db.suppliers.includes(newName)) { alert('Dieser Lieferant existiert bereits!'); renderLieferanten(); return; }
    const idx = db.suppliers.indexOf(oldName);
    if (idx !== -1) db.suppliers[idx] = newName;
    db.articles.forEach(a => { if(a.suppliers) a.suppliers = a.suppliers.map(s=>s===oldName?newName:s); });
    const oldLines = getSupLines(oldName);
    if (oldLines.length) { setSupLines(oldName, []); setSupLines(newName, oldLines); }
    renderAll();
}

function saveSupplier() {
    const n = (ge('new-sup-name')?.value||'').trim();
    if (!n) return alert('Bitte Namen eingeben!');
    if ((db.suppliers||[]).includes(n)) return alert('Lieferant existiert bereits!');
    if (!db.suppliers) db.suppliers = [];
    db.suppliers.push(n);
    ge('new-sup-name').value = '';
    if (!Array.isArray(db.deletedSuppliers)) db.deletedSuppliers = [];
    db.deletedSuppliers = db.deletedSuppliers.filter(s => s !== n);
    renderAll();
}

function deleteSup(name) {
    const decoded = decodeURIComponent(name);
    if (!confirm(`Lieferant "${decoded}" löschen?`)) return;
    if (!db.deletedSuppliers) db.deletedSuppliers = [];
    db.suppliers = (db.suppliers||[]).filter(s=>s!==decoded);
    if (!db.deletedSuppliers.includes(decoded)) db.deletedSuppliers.push(decoded);
    db.articles.forEach(a => { if(a.suppliers) a.suppliers = a.suppliers.filter(s=>s!==decoded); });
    renderAll();
}

function showSupStats(name) {
    const recs = (db.deliveries||[]).filter(d=>d.name===name);
    const byLine = {}; let total = 0;
    recs.forEach(r => {
        const kg = Number(r.kg||0); if (!kg) return;
        const line = (r.line && String(r.line).trim()) ? r.line.trim() : 'Gemischt';
        byLine[line] = (byLine[line]||0) + kg; total += kg;
    });
    const keys = Object.keys(byLine).sort((a,b)=>byLine[b]-byLine[a]);
    let html = `<h4 style="margin-bottom:10px;">${esc(name)}</h4>`;
    if (!keys.length) { html += '<p style="color:var(--muted);">Noch keine Sendungen.</p>'; }
    else {
        html += `<table style="width:100%;border-collapse:collapse;">
            ${keys.map(line=>`<tr><td style="padding:8px;border-bottom:1px solid #f0f2f5;">${esc(line)}</td><td style="padding:8px;border-bottom:1px solid #f0f2f5;text-align:right;font-weight:700;">${byLine[line].toFixed(2).replace('.',',')} kg</td></tr>`).join('')}
            <tr style="background:var(--primary-light);font-weight:800;"><td style="padding:8px;">Gesamt (${recs.length})</td><td style="padding:8px;text-align:right;">${total.toFixed(2).replace('.',',')} kg</td></tr>
        </table>`;
    }
    ge('ov-sup-stats-title').textContent = '📊 ' + name;
    ge('ov-sup-stats-body').innerHTML = html;
    openOv('ov-sup-stats');
}

// ── BRIEFING ─────────────────────────────────────────────────
function renderBriefing() {
    const b = db.teamDayBrief || {};
    const dateEl = ge('brief-date'); const msgEl = ge('brief-msg');
    if (dateEl && document.activeElement !== dateEl) dateEl.value = b.date || ccTodayISO();
    if (msgEl && document.activeElement !== msgEl) msgEl.value = b.message || '';

    const tasks = b.tasks || [];
    ge('brief-tasks').innerHTML = tasks.length ? tasks.map((t,i) => `
        <div class="check-item${t.done?' done':''}">
            <input type="checkbox" ${t.done?'checked':''} onchange="toggleBriefTask(${i})">
            <input type="text" class="check-item-text" style="background:none;border:none;border-bottom:1px solid #e5e7eb;border-radius:0;padding:4px;" value="${esc(t.text||'')}" onchange="updateBriefTaskText(${i},this.value)">
            <button class="check-item-del" onclick="deleteBriefTask(${i})">×</button>
        </div>`).join('') : '<p style="color:var(--muted);font-size:13px;padding:8px 0;">Noch keine Aufgaben.</p>';

    const tpl = db.checklistMorningTemplate || [];
    ge('checklist-tpl').innerHTML = tpl.length ? tpl.map((t,i) => `
        <div class="check-item">
            <span style="color:var(--muted);font-size:12px;min-width:20px;">${i+1}.</span>
            <input type="text" class="check-item-text" style="background:none;border:none;border-bottom:1px solid #e5e7eb;border-radius:0;padding:4px;" value="${esc(t.text||'')}" onchange="updateChecklistTplText(${i},this.value)">
            <button class="check-item-del" onclick="deleteChecklistTpl(${i})">×</button>
        </div>`).join('') : '<p style="color:var(--muted);font-size:13px;padding:8px 0;">Noch keine Routinen.</p>';
}

function saveBriefField(field, val) {
    if (!db.teamDayBrief) db.teamDayBrief = { date: ccTodayISO(), message: '', tasks: [] };
    db.teamDayBrief[field] = val;
    saveDb();
}

function setBriefingToday() {
    if (!db.teamDayBrief) db.teamDayBrief = { date: ccTodayISO(), message: '', tasks: [] };
    db.teamDayBrief.date = ccTodayISO();
    renderBriefing(); saveDb();
}

function addBriefTask() {
    const inp = ge('new-brief-task'); const text = (inp?.value||'').trim();
    if (!text) return;
    if (!db.teamDayBrief) db.teamDayBrief = { date: ccTodayISO(), message: '', tasks: [] };
    db.teamDayBrief.tasks.push({ id: 'bt'+Date.now(), text, done: false });
    inp.value = '';
    renderBriefing(); saveDb();
}

function deleteBriefTask(i) { db.teamDayBrief.tasks.splice(i,1); renderBriefing(); saveDb(); }
function toggleBriefTask(i) { const t=db.teamDayBrief.tasks[i]; if(t) t.done=!t.done; renderBriefing(); saveDb(); }
function updateBriefTaskText(i,v) { if(db.teamDayBrief.tasks[i]) db.teamDayBrief.tasks[i].text=v.trim(); saveDb(); }

function addChecklistItem() {
    const inp = ge('new-checklist-item'); const text = (inp?.value||'').trim();
    if (!text) return;
    if (!Array.isArray(db.checklistMorningTemplate)) db.checklistMorningTemplate = [];
    db.checklistMorningTemplate.push({ id: 'm'+Date.now(), text });
    inp.value = '';
    renderBriefing(); saveDb();
}

function deleteChecklistTpl(i) { if(!confirm('Routine entfernen?')) return; db.checklistMorningTemplate.splice(i,1); renderBriefing(); saveDb(); }
function updateChecklistTplText(i,v) { if(db.checklistMorningTemplate[i]) db.checklistMorningTemplate[i].text=v.trim(); saveDb(); }

// ── AUSWERTUNG (gemeinsame Basis Erfassung + Statistik) ───────
function syncAuswertungDb() {
    if (typeof ensureDatenKonsistenz === 'function') ensureDatenKonsistenz(db);
    else if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
}

function fmtKg(kg, dash) {
    const n = parseFloat(kg) || 0;
    if (n <= 0) return dash !== undefined ? dash : '–';
    return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function renderExUnsBar(exportKg, unsKg) {
    const ex = parseFloat(exportKg) || 0;
    const uns = parseFloat(unsKg) || 0;
    const sum = ex + uns;
    if (sum <= 0) return '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Export/Uns: noch keine Sortier-Wiegescheine.</div>';
    const exPct = Math.round((ex / sum) * 100);
    const exW = Math.max(exPct, ex > 0 ? 10 : 0);
    return `<div class="exuns-bar">
        <div class="exuns-head"><span class="col-ex">Export ${fmtKg(ex)} kg (${exPct}%)</span><span class="col-uns">Uns ${fmtKg(uns)} kg (${100 - exPct}%)</span></div>
        <div class="exuns-track"><div class="exuns-ex" style="width:${exW}%;">${ex > 0 ? 'EX' : ''}</div><div class="exuns-uns">${uns > 0 ? 'UNS' : ''}</div></div>
    </div>`;
}

function renderLieferantenTableMobile(rows, title) {
    if (!rows || !rows.length) {
        return `<div class="card-title">${title || 'Lieferanten'}</div><div style="padding:12px;color:var(--muted);font-size:13px;">Keine Daten.</div>`;
    }
    const sum = rows.reduce((a, r) => ({
        sortiertKg: a.sortiertKg + (r.sortiertKg || 0),
        exportKg: a.exportKg + (r.exportKg || 0), unsKg: a.unsKg + (r.unsKg || 0), gesamtKg: a.gesamtKg + (r.gesamtKg || 0)
    }), { sortiertKg: 0, exportKg: 0, unsKg: 0, gesamtKg: 0 });
    return `<div class="card-title">${title || 'Lieferanten'}</div>
        <div class="aus-table-wrap"><table class="aus-table"><thead><tr>
            <th>Lieferant</th><th>Sort.</th><th>Export</th><th>Uns</th><th style="color:#888;">N/Z</th><th>Gesamt</th>
        </tr></thead><tbody>
        ${rows.map((r) => {
            const nz = Math.max(0, (r.gesamtKg||0) - (r.exportKg||0) - (r.unsKg||0));
            return `<tr>
            <td>${esc(r.name)}</td>
            <td class="col-sort">${fmtKg(r.sortiertKg)}</td>
            <td class="col-ex">${fmtKg(r.exportKg)}</td>
            <td class="col-uns">${fmtKg(r.unsKg)}</td>
            <td style="color:#888;">${nz > 0 ? fmtKg(nz) : '–'}</td>
            <td class="col-ges">${fmtKg(r.gesamtKg)}</td>
        </tr>`;}).join('')}
        <tr class="sum-row">
            <td>Σ Summe</td>
            <td class="col-sort">${fmtKg(sum.sortiertKg)}</td>
            <td class="col-ex">${fmtKg(sum.exportKg)}</td>
            <td class="col-uns">${fmtKg(sum.unsKg)}</td>
            <td style="color:#888;font-weight:700;">${fmtKg(Math.max(0,(sum.gesamtKg||0)-(sum.exportKg||0)-(sum.unsKg||0)))}</td>
            <td class="col-ges">${fmtKg(sum.gesamtKg)}</td>
        </tr></tbody></table></div>`;
}

function renderIntegrityBox(elId, datenListe) {
    const el = ge(elId); if (!el) return;
    syncAuswertungDb();
    const issues = typeof pruefeDatenIntegritaet === 'function' ? pruefeDatenIntegritaet(db, datenListe) : [];
    if (!issues.length) {
        el.innerHTML = '<div class="integrity-box integrity-ok">✅ Daten konsistent — alle Quellen (Handy, manuell, Cloud) sind abgeglichen.</div>';
        return;
    }
    const warns = issues.filter((i) => i.level === 'warn');
    el.innerHTML = `<div class="integrity-box integrity-warn">
        <strong>⚠️ Datenprüfung (${issues.length})</strong>
        <button class="btn btn-sm btn-primary" style="float:right;margin-top:-4px;" onclick="repairDataIntegrity()">🔧 Reparieren</button>
        <ul class="integrity-list">${issues.slice(0, 8).map((i) => `<li>${esc(i.text)}</li>`).join('')}${issues.length > 8 ? `<li>… +${issues.length - 8} weitere</li>` : ''}</ul>
        ${warns.length ? '<div style="margin-top:6px;font-size:11px;">Tipp: Cloud laden, dann „Reparieren“.</div>' : ''}
    </div>`;
}

function repairDataIntegrity() {
    if (typeof repariereDatenIntegritaet === 'function') repariereDatenIntegritaet(db);
    else syncAuswertungDb();
    saveDb();
    renderAll();
    showToast('✅ Daten abgeglichen');
}

function renderTagesKpiGrid(elId, team) {
    const el = ge(elId); if (!el) return;
    const sortKg = team.sortiertKg > 0 ? team.sortiertKg : team.gesamtKg;
    el.innerHTML = `
        <div class="kpi-card c1"><div class="kpi-val">${fmtKg(sortKg, '0')}</div><div class="kpi-lbl">kg Sortiert (Handy)</div></div>
        <div class="kpi-card c4"><div class="kpi-val">${fmtKg(team.exportKg, '0')}</div><div class="kpi-lbl">kg Export</div></div>
        <div class="kpi-card c5"><div class="kpi-val">${fmtKg(team.unsKg, '0')}</div><div class="kpi-lbl">kg Uns</div></div>
        <div class="kpi-card c6"><div class="kpi-val">${team.proKopf > 0 ? fmtKg(team.proKopf, '–') : '–'}</div><div class="kpi-lbl">kg / Kopf</div></div>`;
}

function savePersonalForDatum(datum, rawVal) {
    if (!datum) return;
    const val = parseFloat(rawVal);
    if (isNaN(val) || val < 0) return alert('Bitte gültige Dezimalzahl (z.B. 3.5).');
    if (typeof setTeamPersonalAnzahl === 'function') {
        setTeamPersonalAnzahl(db.teamTagesMengen, db.dailyStaff, datum, val);
    } else {
        if (!db.teamTagesMengen) db.teamTagesMengen = {};
        if (!db.teamTagesMengen[datum]) db.teamTagesMengen[datum] = { personalAnzahl: 0, gesamtKg: 0, exportKg: 0, unsKg: 0 };
        db.teamTagesMengen[datum].personalAnzahl = val;
        if (!db.dailyStaff) db.dailyStaff = {};
        db.dailyStaff[datum] = val;
    }
    renderAll();
}

// ── ERFASSUNG ────────────────────────────────────────────────
let editingDelId = null;

function isHandySortierEntry(del) {
    return del && (del.source === 'sortieren_tag' || del.source === 'sortieren');
}

function deliveryDisplayName(d) {
    if (d.source === 'sortieren_tag') return '📱 Sortieren (Handy) — Gesamtgewicht';
    if (d.source === 'sortieren') return '📱 ' + (d.name || 'Unbekannt');
    return d.line ? `${d.name} · ${d.line}` : d.name;
}

function deliveryErfassungStatus(del) {
    const sum = (del.workerShares || []).reduce((acc, v) => acc + (parseFloat(v.kg) || 0), 0);
    const kg = parseFloat(del.kg) || 0;
    if (del.isFullySorted || sum >= kg) return { done: true, label: 'Vollständig', color: 'var(--success)' };
    if (isHandySortierEntry(del) && sum === 0) return { done: true, label: 'Ohne Zuweisung', color: '#666' };
    return { done: false, label: 'Noch offen: ' + (kg - sum).toFixed(2) + ' kg', color: 'var(--warn)' };
}

function saveErfPersonal() {
    const datum = ge('erf-date')?.value;
    savePersonalForDatum(datum, ge('erf-personal')?.value);
}

function renderErfassung() {
    if (typeof refreshSortierFromKombi === 'function') refreshSortierFromKombi();
    const sup = ge('erf-sup'); if (!sup) return;
    const curSup = sup.value;
    sup.innerHTML = (db.suppliers||[]).sort().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (curSup && (db.suppliers||[]).includes(curSup)) sup.value = curSup;
    sup.onchange = () => updateErfLineSelect();
    updateErfLineSelect();
    renderErfassungList();
}

function renderErfassungSummary(datum) {
    syncAuswertungDb();
    const team = typeof teamTagesAnzeigeAusDb === 'function'
        ? teamTagesAnzeigeAusDb(db, datum)
        : teamTagesAnzeige(db.teamTagesMengen, db.dailyStaff, db.deliveries || [], datum);
    const pEl = ge('erf-personal');
    if (pEl) pEl.value = team.personalAnzahl > 0 ? team.personalAnzahl : '';
    renderTagesKpiGrid('erf-summary-kpis', team);
    const exEl = ge('erf-exuns-bar');
    if (exEl) exEl.innerHTML = renderExUnsBar(team.exportKg, team.unsKg);
    const liefEl = ge('erf-lief-table-wrap');
    if (liefEl) {
        const rows = typeof lieferantenAuswertungFuerDatum === 'function' ? lieferantenAuswertungFuerDatum(db, datum) : [];
        liefEl.innerHTML = renderLieferantenTableMobile(rows, 'Lieferanten — Gesamtgewicht pro Tag');
    }
    renderIntegrityBox('erf-integrity', [datum]);
}

function updateErfLineSelect() {
    const sup = ge('erf-sup'); const wrap = ge('erf-line-wrap'); const sel = ge('erf-line');
    if (!sup || !wrap || !sel) return;
    const lines = getSupLines(sup.value);
    if (!lines.length) { wrap.style.display='none'; return; }
    wrap.style.display = 'block';
    sel.innerHTML = '<option value="">— Gemischt —</option>' + lines.map(l=>`<option value="${esc(l)}">${esc(l)}</option>`).join('');
}

function saveDelivery() {
    const d = ge('erf-date')?.value;
    const s = ge('erf-sup')?.value;
    const k = parseFloat(ge('erf-kg')?.value||'');
    const lineWrap = ge('erf-line-wrap');
    const line = (lineWrap && lineWrap.style.display!=='none' && ge('erf-line')?.value) ? ge('erf-line').value : '';
    if (!d || !s || !k) return alert('Bitte Datum, Lieferant und Gewicht eingeben.');
    if (!db.deliveries) db.deliveries = [];
    const entry = { id: Date.now().toString(), date: d, name: s, kg: k, workerShares: [], source: 'manuell' };
    if (line) entry.line = line;
    db.deliveries.push(entry);
    ge('erf-kg').value = '';
    saveDb();
    renderErfassungSummary(d);
    renderErfassungList();
}

function getHandyEntriesForDate(datum) {
    if (typeof refreshSortierFromKombi === 'function') refreshSortierFromKombi();
    syncAuswertungDb();
    if (typeof getHandySortierEntriesFuerDatum === 'function') {
        return getHandySortierEntriesFuerDatum(db, datum);
    }
    return (db.deliveries || []).filter((x) => x.date === datum && x.source === 'sortieren');
}

function renderErfassungList() {
    const dateEl = ge('erf-date'); if (!dateEl) return;
    const datum = dateEl.value;
    const list = ge('erf-list'); if (!list) return;
    renderErfassungSummary(datum);
    if (typeof persistHandyEntriesToDeliveries === 'function') persistHandyEntriesToDeliveries(db, datum);

    const handyEntries = getHandyEntriesForDate(datum);
    const manuelleEntries = (db.deliveries || [])
        .filter((x) => x.date === datum && !isHandySortierEntry(x))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de') || (parseFloat(b.kg) - parseFloat(a.kg)));

    let html = '';
    html += '<div style="font-size:12px;font-weight:700;color:#2e7d32;margin-bottom:8px;">📱 Vom Handy — Sortieren → Drucken (Gesamt pro Lieferant)</div>';
    if (!handyEntries.length) {
        html += '<div style="padding:12px;color:var(--muted);font-size:13px;background:#f5f5f5;border-radius:10px;margin-bottom:12px;">Keine Druck-Daten für dieses Datum. Rechner-App: Sortieren → Drucken. Anderes Gerät? ☁️ Cloud laden.</div>';
    } else {
        html += handyEntries.map((del) => {
            const st = deliveryErfassungStatus(del);
            const shareCount = (del.workerShares || []).length;
            return `<div class="del-card" style="border-left-color:#2e7d32;background:#f1f8f4;" onclick="openDelEdit('${del.id}')">
                <div class="del-card-row">
                    <span class="del-card-name">${esc(deliveryDisplayName(del))}</span>
                    <span class="del-card-kg">${del.kg} kg</span>
                </div>
                <div class="del-card-status" style="color:${st.color};">${st.label}${shareCount ? ' · ' + shareCount + ' MA' : ''}</div>
            </div>`;
        }).join('');
    }

    html += '<div style="font-size:12px;font-weight:700;color:var(--primary);margin:16px 0 8px;">📝 Manuelle Eingabe (nur PC)</div>';
    if (!manuelleEntries.length) {
        html += '<div style="padding:12px;color:var(--muted);font-size:13px;">Keine manuellen Eingänge für dieses Datum.</div>';
    } else {
        html += manuelleEntries.map((del) => {
            const st = deliveryErfassungStatus(del);
            const shareCount = (del.workerShares || []).length;
            return `<div class="del-card" style="border-left-color:${st.color};" onclick="openDelEdit('${del.id}')">
                <div class="del-card-row">
                    <span class="del-card-name">${esc(deliveryDisplayName(del))}</span>
                    <span class="del-card-kg">${del.kg} kg</span>
                </div>
                <div class="del-card-status" style="color:${st.color};">${st.label} · ${shareCount} MA</div>
            </div>`;
        }).join('');
    }
    list.innerHTML = html;

    // Open deliveries — sortieren direkt aus buchungen (alle Daten), LKW aus db.deliveries
    const openList = ge('erf-open-list'); if (!openList) return;
    const sortierenOpen = [];
    if (typeof sammleAlleErfassungsDaten === 'function' && typeof getHandySortierEntriesFuerDatum === 'function') {
        sammleAlleErfassungsDaten(db).forEach(d => {
            getHandySortierEntriesFuerDatum(db, d).forEach(entry => {
                const sum = (entry.workerShares || []).reduce((a, v) => a + (parseFloat(v.kg) || 0), 0);
                const kg = parseFloat(entry.kg) || 0;
                if (!entry.isFullySorted && sum < kg) sortierenOpen.push(entry);
            });
        });
    }
    const manuelleOpen = (db.deliveries || [])
        .filter(del => !isHandySortierEntry(del))
        .filter(del => {
            const sum = (del.workerShares || []).reduce((a, v) => a + (parseFloat(v.kg) || 0), 0);
            return sum < (parseFloat(del.kg) || 0) && !del.isFullySorted;
        });
    const openDels = [...sortierenOpen, ...manuelleOpen].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!openDels.length) {
        openList.innerHTML = '<div style="background:#e8f5e9;border-radius:10px;padding:14px;text-align:center;color:var(--success);font-weight:700;">✅ Keine offenen Posten!</div>';
    } else {
        openList.innerHTML = openDels.map(del => {
            const sum = (del.workerShares || []).reduce((a, v) => a + (parseFloat(v.kg) || 0), 0);
            const kg = parseFloat(del.kg) || 0;
            const rem = kg - sum;
            const dt = new Date(del.date).toLocaleDateString('de-DE');
            const isSortier = isHandySortierEntry(del);
            const borderColor = isSortier ? '#2e7d32' : 'var(--warn)';
            const badge = isSortier ? ' <span style="font-size:10px;background:#e8f5e9;color:#2e7d32;padding:1px 5px;border-radius:4px;">Sortieren</span>' : '';
            const name = del.line ? `${del.name} · ${del.line}` : del.name;
            return `<div class="del-card" style="border-left-color:${borderColor};" onclick="openDelEdit('${del.id}')">
                <div class="del-card-row">
                    <span class="del-card-name">${esc(name)}${badge}</span>
                    <span style="font-size:11px;color:var(--muted);">${dt}</span>
                </div>
                <div class="del-card-status" style="color:${isSortier ? '#2e7d32' : 'var(--warn)'};">${rem.toFixed(1)} kg offen von ${kg.toLocaleString('de-DE')} kg</div>
            </div>`;
        }).join('');
    }
}

function openDelEdit(id) {
    syncAuswertungDb();
    const del = typeof resolveSortierDeliveryInDb === 'function'
        ? resolveSortierDeliveryInDb(db, id)
        : (db.deliveries || []).find((x) => x.id === id);
    if (!del) return;
    editingDelId = del.id;
    const name = del.line ? `${del.name} · ${del.line}` : del.name;
    ge('ov-del-name').textContent = esc(name);
    ge('ov-del-date').value = del.date;
    ge('ov-del-kg').readOnly = del.source === 'sortieren' || del.source === 'sortieren_tag';
    ge('ov-del-kg').value = del.kg;
    ge('ov-del-sorted').checked = !!del.isFullySorted;
    ge('ov-del-worker').innerHTML = (db.workers||[]).map(w=>`<option value="${esc(w)}">${esc(w)}</option>`).join('');
    updateDelShares();
    openOv('ov-del');
}

function updateDelShares() {
    const del = (db.deliveries||[]).find(x=>x.id===editingDelId); if (!del) return;
    const shares = del.workerShares||[];
    const sum = shares.reduce((a,v)=>a+v.kg,0);
    const open = Math.max(0, del.kg-sum);
    ge('ov-del-open').textContent = open.toFixed(2);
    ge('ov-del-wkg').value = open > 0 ? parseFloat(open.toFixed(2)) : '';
    ge('ov-del-shares').innerHTML = shares.map((s,i) => {
        const color = getWorkerColor(s.name);
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:white;margin-bottom:6px;border-radius:8px;border:1px solid #e5e7eb;">
            <span style="font-weight:700;color:${color};">${esc(s.name)}</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:800;">${s.kg} kg</span>
                <button onclick="removeShare(${i})" style="background:none;border:none;color:var(--danger);font-size:22px;cursor:pointer;line-height:1;">×</button>
            </div>
        </div>`;
    }).join('');
}

function toggleDeliveryFullySorted() {
    const del = (db.deliveries||[]).find(x=>x.id===editingDelId); if (!del) return;
    del.isFullySorted = ge('ov-del-sorted').checked;
    renderAll(); updateDelShares();
}

function addWorkerShare() {
    const del = (db.deliveries||[]).find(x=>x.id===editingDelId); if (!del) return;
    const worker = ge('ov-del-worker')?.value;
    let kg = parseFloat(ge('ov-del-wkg')?.value||'');
    if (!worker) return alert('Bitte Mitarbeiter wählen.');
    if (isNaN(kg)||kg<=0) return alert('Bitte gültiges Gewicht eingeben.');
    if (!del.workerShares) del.workerShares = [];
    del.workerShares.push({ name: worker, kg });
    renderAll(); updateDelShares();
}

function removeShare(i) {
    const del = (db.deliveries||[]).find(x=>x.id===editingDelId); if (!del||!del.workerShares) return;
    del.workerShares.splice(i,1);
    renderAll(); updateDelShares();
}

function saveDeliveryEdit() {
    const del = (db.deliveries||[]).find(x=>x.id===editingDelId); if (!del) return;
    const newKg = parseFloat(ge('ov-del-kg')?.value||'');
    const newDate = ge('ov-del-date')?.value;
    if (newKg > 0 && newDate) { del.kg = newKg; del.date = newDate; }
    closeOv('ov-del');
    renderAll();
}

let _delConfirmPending = false;
function deleteDeliveryConfirm() {
    const btn = document.getElementById('btn-del-confirm');
    if (!_delConfirmPending) {
        _delConfirmPending = true;
        if (btn) { btn.textContent = 'Sicher?'; btn.style.background = '#b71c1c'; }
        setTimeout(() => {
            _delConfirmPending = false;
            if (btn) { btn.textContent = '🗑️'; btn.style.background = ''; }
        }, 3000);
        return;
    }
    _delConfirmPending = false;
    if (btn) { btn.textContent = '🗑️'; btn.style.background = ''; }
    db.deliveries = (db.deliveries||[]).filter(x=>x.id!==editingDelId);
    closeOv('ov-del');
    renderAll();
}

// ── STATISTIKEN ──────────────────────────────────────────────
let statMode = 'woche';
let statsWeekOffset = 0;
let statsMonthOffset = 0;

function switchStatMode(mode) { statMode = mode; renderStats(); }
function changeWeek(dir) { statsWeekOffset += dir; renderStats(); }
function changeMonth(dir) { statsMonthOffset += dir; renderStats(); }
function statsNav(dir) { if (statMode === 'monat') changeMonth(dir); else changeWeek(dir); }

function trendPfeil(curr, prev) {
    if (!prev || prev <= 0) return '';
    const diff = Math.round(((curr - prev) / prev) * 100);
    if (Math.abs(diff) < 2) return '<span class="trend-flat">→ ±0%</span>';
    return curr > prev
        ? `<span class="trend-up">↑ +${diff}%</span>`
        : `<span class="trend-down">↓ ${diff}%</span>`;
}

function renderWochenVergleich() {
    const currDays = getDatesForWeekOffset(statsWeekOffset);
    const prevDays = getDatesForWeekOffset(statsWeekOffset - 1);
    const curr = typeof teamZeitraumMetrikenAusDb === 'function' ? teamZeitraumMetrikenAusDb(db, currDays) : { tage: [], summeExport: 0, summeUns: 0, proKopf: 0 };
    const prev = typeof teamZeitraumMetrikenAusDb === 'function' ? teamZeitraumMetrikenAusDb(db, prevDays) : { tage: [], summeExport: 0, summeUns: 0, proKopf: 0 };
    const currSort = curr.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
    const prevSort = prev.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
    const exPctC = currSort > 0 ? Math.round((curr.summeExport / currSort) * 100) : 0;
    const exPctP = prevSort > 0 ? Math.round((prev.summeExport / prevSort) * 100) : 0;
    return `<div class="ana-vergleich">
        <div class="ana-vergleich-title">📊 Wochen-Vergleich — aktuelle Woche vs. Vorwoche</div>
        <div class="ana-vkpi-row">
            <div class="ana-vkpi">
                <div class="ana-vkpi-label">Sortiert gesamt</div>
                <div class="ana-vkpi-curr">${fmtKg(currSort)} kg</div>
                <div class="ana-vkpi-prev">Vorwoche: ${fmtKg(prevSort)} kg ${trendPfeil(currSort, prevSort)}</div>
            </div>
            <div class="ana-vkpi">
                <div class="ana-vkpi-label">Export-Quote</div>
                <div class="ana-vkpi-curr">${exPctC}%</div>
                <div class="ana-vkpi-prev">Vorwoche: ${exPctP}% ${trendPfeil(exPctC, exPctP)}</div>
            </div>
            <div class="ana-vkpi">
                <div class="ana-vkpi-label">∅ kg / Kopf / Tag</div>
                <div class="ana-vkpi-curr">${curr.proKopf > 0 ? fmtKg(curr.proKopf) : '–'}</div>
                <div class="ana-vkpi-prev">Vorwoche: ${prev.proKopf > 0 ? fmtKg(prev.proKopf) : '–'} ${trendPfeil(curr.proKopf, prev.proKopf)}</div>
            </div>
        </div>
    </div>`;
}

function getDatesForWeekOffset(offset) {
    let curr = new Date(); let first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1); let monday = new Date(curr.setDate(first + (offset * 7)));
    let days = []; for (let i = 0; i < 7; i++) { let d = new Date(monday); d.setDate(monday.getDate() + i); days.push(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]); }
    return days;
}

function getISOWeekNumber(d) {
    let date = new Date(d.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7); let week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function anaDatumLabel(iso) {
    if (!iso) return '–';
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function chefPlanungsHinweis(team, referenzProKopf) {
    const p = team.personalAnzahl; const pk = team.proKopf; const gesamt = team.gesamtKg;
    if (p > 0 && pk > 0 && gesamt > 0) {
        const persStr = Number(p) % 1 === 0 ? String(p) : String(p).replace('.', ',');
        return `Mit <b>${persStr} Personen</b> im Versand → <b>ca. ${pk.toLocaleString('de-DE')} kg pro Kopf</b> (heute ${gesamt.toLocaleString('de-DE')} kg gesamt).`;
    }
    if (referenzProKopf > 0) return `Ø der aktuellen Woche: <b>ca. ${referenzProKopf.toLocaleString('de-DE')} kg pro Kopf</b> — Personal pro Tag eintragen.`;
    return 'Personal im Versand eintragen (z.&nbsp;B. 3,5) — dann siehst du <b>kg pro Kopf</b> für die Planung.';
}

function teamPersonalInputHtml(datum, personalAnzahl, narrow) {
    const v = personalAnzahl > 0 ? personalAnzahl : '';
    const w = narrow ? '70px' : '120px';
    return `<input type="number" step="0.25" min="0" value="${v}" placeholder="–" style="width:${w};text-align:center;" onchange="saveTeamPersonalForDate('${datum}',this.value)">`;
}

function saveTeamPersonalForDate(datum, rawVal) {
    if (!db.teamTagesMengen || typeof db.teamTagesMengen !== 'object') db.teamTagesMengen = {};
    if (!db.dailyStaff) db.dailyStaff = {};
    const d = datum || document.getElementById('stats-datum')?.value || ccTodayISO();
    const val = parseFloat(rawVal !== undefined ? rawVal : document.getElementById('stats-personal-heute')?.value);
    if (isNaN(val) || val < 0) return alert('Bitte gültige Dezimalzahl eingeben (z.B. 3.5).');
    setTeamPersonalAnzahl(db.teamTagesMengen, db.dailyStaff, d, val);
    syncTeamTagesGesamtKg(db.teamTagesMengen, db.deliveries || [], d);
    saveDb();
    renderStats();
}

function onStatsDatumChange() {
    const d = document.getElementById('stats-datum')?.value;
    if (!d) return;
    const inp = document.getElementById('stats-personal-heute');
    if (inp && db.teamTagesMengen) {
        const team = typeof teamTagesAnzeigeAusDb === 'function' ? teamTagesAnzeigeAusDb(db, d) : { personalAnzahl: 0 };
        inp.value = team.personalAnzahl > 0 ? team.personalAnzahl : '';
    }
}

function nzKg(gesamt, ex, uns) { return Math.max(0, (parseFloat(gesamt) || 0) - (parseFloat(ex) || 0) - (parseFloat(uns) || 0)); }

function renderAnaKpiRow(team) {
    const sortKg = team.sortiertKg > 0 ? team.sortiertKg : team.gesamtKg;
    const nz = Math.max(0, team.gesamtKg - (parseFloat(team.exportKg) || 0) - (parseFloat(team.unsKg) || 0));
    return `
    <div class="ana-kpi-row">
        <div class="ana-kpi kpi-gesamt"><div class="val">${fmtKg(sortKg)}</div><div class="unit">kg</div><div class="cap">Sortiert (Handy)</div></div>
        <div class="ana-kpi kpi-ex"><div class="val">${fmtKg(team.exportKg)}</div><div class="unit">kg</div><div class="cap">Export</div></div>
        <div class="ana-kpi kpi-uns"><div class="val">${fmtKg(team.unsKg)}</div><div class="unit">kg</div><div class="cap">Uns</div></div>
        ${nz > 1 ? `<div class="ana-kpi" style="background:#f5f5f5;"><div class="val" style="color:#888;">${fmtKg(nz)}</div><div class="unit">kg</div><div class="cap" style="color:#888;">Nicht zugeordnet</div></div>` : ''}
        <div class="ana-kpi kpi-kopf"><div class="val">${team.proKopf > 0 ? fmtKg(team.proKopf) : '–'}</div><div class="unit">kg</div><div class="cap">pro Kopf</div></div>
    </div>`;
}

function renderExUnsSplitBar(exportKg, unsKg, gesamtKg) {
    const ex = parseFloat(exportKg) || 0; const uns = parseFloat(unsKg) || 0; const gesamt = parseFloat(gesamtKg) || 0;
    const nz = Math.max(0, gesamt - ex - uns); const sum = ex + uns + nz;
    if (sum <= 0) return '<div class="ana-empty" style="padding:16px;">Noch keine Sortier-Daten mit Export/Uns für diesen Zeitraum.</div>';
    const exPct = Math.round((ex / sum) * 100); const unsPct = Math.round((uns / sum) * 100); const nzPct = 100 - exPct - unsPct;
    return `
    <div class="ana-split">
        <div class="ana-split-head">
            <span class="ex-lbl">Export ${fmtKg(ex)} kg (${exPct}%)</span>
            <span class="uns-lbl">Uns ${fmtKg(uns)} kg (${unsPct}%)</span>
            ${nz > 0 ? `<span style="color:#888;font-size:11px;">N/Z ${fmtKg(nz)} kg (${nzPct}%)</span>` : ''}
        </div>
        <div class="ana-split-bar">
            <div class="ana-split-ex" style="width:${exPct}%;">${ex > 0 ? 'EX' : ''}</div>
            <div class="ana-split-uns" style="width:${unsPct}%;">${uns > 0 ? 'UNS' : ''}</div>
            ${nz > 0 ? `<div style="flex:${nzPct};background:#ddd;display:flex;align-items:center;justify-content:center;font-size:10px;color:#888;">N/Z</div>` : ''}
        </div>
    </div>`;
}

function renderLieferantenTabelle(rows) {
    if (!rows || !rows.length) return '<div class="ana-empty">Keine Lieferanten-Daten für diesen Zeitraum.</div>';
    const s = rows.reduce((acc, r) => { acc.sortiertKg += r.sortiertKg; acc.exportKg += r.exportKg; acc.unsKg += r.unsKg; acc.gesamtKg += r.gesamtKg; return acc; }, { sortiertKg: 0, exportKg: 0, unsKg: 0, gesamtKg: 0 });
    let html = `<div class="ana-table-wrap"><table class="ana-table"><thead><tr>
        <th>Lieferant</th><th>Sortiert</th><th>Export</th><th>Uns</th><th style="color:#888;">N/Z</th><th>Gesamt</th>
    </tr></thead><tbody>`;
    rows.forEach((r) => {
        const nz = nzKg(r.gesamtKg, r.exportKg, r.unsKg);
        html += `<tr><td>${esc(String(r.name))}</td><td class="col-sort">${fmtKg(r.sortiertKg)}</td><td class="col-ex">${fmtKg(r.exportKg)}</td><td class="col-uns">${fmtKg(r.unsKg)}</td><td style="color:#888;">${nz > 0 ? fmtKg(nz) : '–'}</td><td class="col-gesamt">${fmtKg(r.gesamtKg)}</td></tr>`;
    });
    const sNz = nzKg(s.gesamtKg, s.exportKg, s.unsKg);
    html += `<tr class="ana-sum"><td>Σ Summe</td><td class="col-sort">${fmtKg(s.sortiertKg)}</td><td class="col-ex">${fmtKg(s.exportKg)}</td><td class="col-uns">${fmtKg(s.unsKg)}</td><td style="color:#888;">${sNz > 0 ? fmtKg(sNz) : '–'}</td><td class="col-gesamt">${fmtKg(s.gesamtKg)}</td></tr></tbody></table></div>`;
    return html;
}

function renderSortierBuchungenFuerDatum(datum) {
    const alle = (db.teamSortierBuchungen || []).filter(b => b.datum === datum);
    const deleted = db.deletedSortierBuchungen || [];
    const aktiv = alle.filter(b => !deleted.includes(b.sessionKey + '|' + b.datum));
    if (!aktiv.length) return '<div style="color:#888;font-size:13px;padding:8px 0;">Keine Buchungen für dieses Datum.</div>';
    return `<div class="ana-table-wrap"><table class="ana-table" style="min-width:unset;"><thead><tr>
        <th style="text-align:left;">Lieferant</th><th style="text-align:left;">Sorte</th><th>kg</th><th></th>
    </tr></thead><tbody>${aktiv.map(b => `<tr>
        <td style="text-align:left;">${esc(b.lief || '–')}</td>
        <td style="text-align:left;color:#555;">${esc(b.sorte || '–')}</td>
        <td>${parseFloat(b.gebuchtKg || 0).toLocaleString('de-DE')}</td>
        <td><button onclick="deleteSortierBuchung('${b.sessionKey}','${b.datum}')" style="background:#e53935;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">🗑️</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function deleteSortierBuchung(sessionKey, datum) {
    if (!confirm('Buchung wirklich löschen? Sie wird auch aus der Cloud entfernt.')) return;
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    const key = sessionKey + '|' + datum;
    if (!db.deletedSortierBuchungen.includes(key)) db.deletedSortierBuchungen.push(key);
    db.teamSortierBuchungen = (db.teamSortierBuchungen || []).filter(b => !(b.sessionKey === sessionKey && b.datum === datum));
    saveDb();
    renderStats();
    if (typeof pushCloud === 'function') pushCloud();
}

function filterSortierBuchungen() {
    const q = (document.getElementById('sortier-buchungen-suche')?.value || '').toLowerCase().trim();
    const datum = document.getElementById('stats-datum')?.value || ccTodayISO();
    const alle = (db.teamSortierBuchungen || []).filter(b => b.datum === datum);
    const deleted = db.deletedSortierBuchungen || [];
    let aktiv = alle.filter(b => !deleted.includes(b.sessionKey + '|' + b.datum));
    if (q) aktiv = aktiv.filter(b => (b.lief || '').toLowerCase().includes(q) || (b.sorte || '').toLowerCase().includes(q));
    const el = document.getElementById('sortier-buchungen-liste');
    if (!el) return;
    if (!aktiv.length) { el.innerHTML = '<div style="color:#888;font-size:13px;padding:8px 0;">Keine Buchungen gefunden.</div>'; return; }
    el.innerHTML = `<div class="ana-table-wrap"><table class="ana-table" style="min-width:unset;"><thead><tr>
        <th style="text-align:left;">Lieferant</th><th style="text-align:left;">Sorte</th><th>kg</th><th></th>
    </tr></thead><tbody>${aktiv.map(b => `<tr>
        <td style="text-align:left;">${esc(b.lief || '–')}</td>
        <td style="text-align:left;color:#555;">${esc(b.sorte || '–')}</td>
        <td>${parseFloat(b.gebuchtKg || 0).toLocaleString('de-DE')}</td>
        <td><button onclick="deleteSortierBuchung('${b.sessionKey}','${b.datum}')" style="background:#e53935;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">🗑️</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderTeamWeeklyOverview() {
    const days = getDatesForWeekOffset(statsWeekOffset);
    const firstDayObj = new Date(days[0]);
    const weekNum = getISOWeekNumber(firstDayObj);
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const metriken = typeof teamZeitraumMetrikenAusDb === 'function'
        ? teamZeitraumMetrikenAusDb(db, days)
        : { tage: [], summeKg: 0, summeExport: 0, summeUns: 0, summePersonal: 0, proKopf: 0 };
    const summeSort = metriken.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
    const maxKg = Math.max(...metriken.tage.map((t) => t.sortiertKg || t.gesamtKg || 0));
    let html = `
    <div class="ana-section-h">
        <h3>Wochenübersicht</h3>
        <div class="ana-period-nav">
            <button class="btn-black" onclick="changeWeek(-1)">◀</button>
            <strong>KW ${weekNum} · ${firstDayObj.getFullYear()}</strong>
            <button class="btn-black" onclick="changeWeek(1)">▶</button>
        </div>
    </div>
    ${renderWochenVergleich()}
    ${renderExUnsSplitBar(metriken.summeExport, metriken.summeUns, metriken.summeKg)}
    <div class="ana-table-wrap"><table class="ana-table"><thead><tr>
        <th>Tag</th><th>Sortiert</th><th>Personal</th><th>kg/Kopf</th><th>Export</th><th>Uns</th><th style="color:#888;">N/Z</th>
    </tr></thead><tbody>`;
    metriken.tage.forEach((t, i) => {
        const sortKg = t.sortiertKg > 0 ? t.sortiertKg : t.gesamtKg;
        const tnz = nzKg(t.gesamtKg, t.exportKg, t.unsKg);
        const isBest = maxKg > 0 && sortKg === maxKg;
        const bestClass = isBest ? ' class="best-day"' : '';
        const click = sortKg > 0 ? ` style="cursor:pointer;" onclick="document.getElementById('stats-datum').value='${t.datum}';onStatsDatumChange();renderStats();"` : '';
        html += `<tr${bestClass}${click}><td>${dayNames[i]} <small style="color:#888;">${t.datum.split('-')[2]}.${t.datum.split('-')[1]}</small></td><td class="col-sort">${fmtKg(sortKg)}</td><td>${teamPersonalInputHtml(t.datum, t.personalAnzahl, true)}</td><td>${t.proKopf > 0 ? fmtKg(t.proKopf) : '–'}</td><td class="col-ex">${fmtKg(t.exportKg)}</td><td class="col-uns">${fmtKg(t.unsKg)}</td><td style="color:#888;">${tnz > 0 ? fmtKg(tnz) : '–'}</td></tr>`;
    });
    const wNz = nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns);
    html += `<tr class="ana-sum"><td>Σ Woche</td><td class="col-sort">${fmtKg(summeSort)}</td><td>${metriken.summePersonal || '–'}</td><td>${metriken.proKopf > 0 ? fmtKg(metriken.proKopf) : '–'}</td><td class="col-ex">${fmtKg(metriken.summeExport)}</td><td class="col-uns">${fmtKg(metriken.summeUns)}</td><td style="color:#888;">${wNz > 0 ? fmtKg(wNz) : '–'}</td></tr></tbody></table></div>`;
    return html;
}

function renderTeamMonthlyOverview() {
    let curr = new Date(); curr.setMonth(curr.getMonth() + statsMonthOffset);
    const monthName = curr.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const targetMonth = curr.getMonth() + 1; const targetYear = curr.getFullYear();
    const daysInMonth = []; const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    for (let d = 1; d <= lastDay; d++) { const iso = new Date(targetYear, targetMonth - 1, d); daysInMonth.push(new Date(iso.getTime() - iso.getTimezoneOffset() * 60000).toISOString().split('T')[0]); }
    const metriken = typeof teamZeitraumMetrikenAusDb === 'function'
        ? teamZeitraumMetrikenAusDb(db, daysInMonth)
        : { tage: [], summeKg: 0, summeExport: 0, summeUns: 0, summePersonal: 0, proKopf: 0 };
    const aktiveTage = metriken.tage.filter((t) => t.gesamtKg > 0 || t.personalAnzahl > 0);
    const summeSort = metriken.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
    let html = `
    <div class="ana-section-h">
        <h3>Monatsübersicht</h3>
        <div class="ana-period-nav">
            <button class="btn-black" onclick="changeMonth(-1)">◀</button>
            <strong>${monthName}</strong>
            <button class="btn-black" onclick="changeMonth(1)">▶</button>
        </div>
    </div>
    <div class="ana-kpi-row" style="margin-bottom:16px;">
        <div class="ana-kpi kpi-gesamt"><div class="val">${fmtKg(summeSort)}</div><div class="unit">kg</div><div class="cap">Sortiert (Handy)</div></div>
        <div class="ana-kpi kpi-ex"><div class="val">${fmtKg(metriken.summeExport)}</div><div class="unit">kg</div><div class="cap">Export</div></div>
        <div class="ana-kpi kpi-uns"><div class="val">${fmtKg(metriken.summeUns)}</div><div class="unit">kg</div><div class="cap">Uns</div></div>
        <div class="ana-kpi" style="background:#f5f5f5;"><div class="val" style="color:#888;">${fmtKg(nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns))}</div><div class="unit" style="color:#888;">kg</div><div class="cap" style="color:#888;">N/Z</div></div>
        <div class="ana-kpi kpi-kopf"><div class="val">${metriken.proKopf > 0 ? fmtKg(metriken.proKopf) : '–'}</div><div class="unit">kg</div><div class="cap">Ø pro Kopf</div></div>
    </div>
    ${renderExUnsSplitBar(metriken.summeExport, metriken.summeUns, metriken.summeKg)}
    <div class="ana-table-wrap"><table class="ana-table"><thead><tr>
        <th>Datum</th><th>Sortiert</th><th>Personal</th><th>kg/Kopf</th><th>Export</th><th>Uns</th><th style="color:#888;">N/Z</th>
    </tr></thead><tbody>`;
    if (!aktiveTage.length) {
        html += `<tr><td colspan="7" class="ana-empty">Keine Tagesdaten in diesem Monat.</td></tr>`;
    } else {
        aktiveTage.forEach((t) => {
            const sortKg = t.sortiertKg > 0 ? t.sortiertKg : t.gesamtKg;
            const tnz = nzKg(t.gesamtKg, t.exportKg, t.unsKg);
            html += `<tr style="cursor:pointer;" onclick="document.getElementById('stats-datum').value='${t.datum}';onStatsDatumChange();renderStats();"><td>${new Date(t.datum).toLocaleDateString('de-DE')}</td><td class="col-sort">${fmtKg(sortKg)}</td><td>${teamPersonalInputHtml(t.datum, t.personalAnzahl, true)}</td><td>${t.proKopf > 0 ? fmtKg(t.proKopf) : '–'}</td><td class="col-ex">${fmtKg(t.exportKg)}</td><td class="col-uns">${fmtKg(t.unsKg)}</td><td style="color:#888;">${tnz > 0 ? fmtKg(tnz) : '–'}</td></tr>`;
        });
    }
    const mNz = nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns);
    html += `<tr class="ana-sum"><td>Gesamt ${monthName}</td><td class="col-sort">${fmtKg(summeSort)}</td><td>${metriken.summePersonal || '–'}</td><td>${metriken.proKopf > 0 ? fmtKg(metriken.proKopf) : '–'}</td><td class="col-ex">${fmtKg(metriken.summeExport)}</td><td class="col-uns">${fmtKg(metriken.summeUns)}</td><td style="color:#888;">${mNz > 0 ? fmtKg(mNz) : '–'}</td></tr></tbody></table></div>`;
    return html;
}

function renderStats() {
    if (typeof refreshSortierFromKombi === 'function') refreshSortierFromKombi();
    syncAuswertungDb();
    const container = ge('stats-container'); if (!container) return;
    if (!db.deliveries) db.deliveries = [];
    if (!db.teamTagesMengen || typeof db.teamTagesMengen !== 'object') db.teamTagesMengen = {};
    if (!db.dailyStaff) db.dailyStaff = {};
    if (typeof migriereTeamAusDailyStaff === 'function') migriereTeamAusDailyStaff(db.teamTagesMengen, db.dailyStaff);

    const today = ccTodayISO();
    const selDatum = document.getElementById('stats-datum')?.value || today;
    const tagTeam = typeof teamTagesAnzeigeAusDb === 'function'
        ? teamTagesAnzeigeAusDb(db, selDatum)
        : { personalAnzahl: 0, gesamtKg: 0, sortiertKg: 0, exportKg: 0, unsKg: 0, proKopf: 0 };
    const personalVal = tagTeam.personalAnzahl > 0 ? tagTeam.personalAnzahl : '';
    const wochenMetriken = typeof teamZeitraumMetrikenAusDb === 'function'
        ? teamZeitraumMetrikenAusDb(db, getDatesForWeekOffset(statsWeekOffset)) : { proKopf: 0 };
    const lieferantenTag = typeof lieferantenAuswertungFuerDatum === 'function'
        ? lieferantenAuswertungFuerDatum(db, selDatum) : [];

    const modeWoche = statMode === 'woche' ? 'active' : '';
    const modeMonat = statMode === 'monat' ? 'active' : '';
    const periodHtml = statMode === 'woche' ? renderTeamWeeklyOverview() : renderTeamMonthlyOverview();

    let periodLieferantenHtml = '';
    if (statMode === 'woche') {
        const days = getDatesForWeekOffset(statsWeekOffset);
        const rows = typeof zeitraumLieferantenAuswertung === 'function' ? zeitraumLieferantenAuswertung(db, days) : [];
        const first = new Date(days[0]);
        periodLieferantenHtml = `<div class="card"><div class="ana-section-h"><h3>Lieferanten — gesamte Woche</h3><span>KW ${getISOWeekNumber(first)}</span></div>${renderLieferantenTabelle(rows)}</div>`;
    } else {
        let curr = new Date(); curr.setMonth(curr.getMonth() + statsMonthOffset);
        const tm = curr.getMonth() + 1; const ty = curr.getFullYear();
        const dim = []; const ld = new Date(ty, tm, 0).getDate();
        for (let d = 1; d <= ld; d++) { const iso = new Date(ty, tm - 1, d); dim.push(new Date(iso.getTime() - iso.getTimezoneOffset() * 60000).toISOString().split('T')[0]); }
        const rows = typeof zeitraumLieferantenAuswertung === 'function' ? zeitraumLieferantenAuswertung(db, dim) : [];
        periodLieferantenHtml = `<div class="card"><div class="ana-section-h"><h3>Lieferanten — gesamter Monat</h3><span>${curr.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}</span></div>${renderLieferantenTabelle(rows)}</div>`;
    }

    container.innerHTML = `
    <div class="ana-toolbar">
        <div class="ana-toolbar-group">
            <div>
                <label>Tag auswählen</label>
                <input type="date" id="stats-datum" value="${selDatum}" onchange="onStatsDatumChange();renderStats();" style="min-width:150px;">
            </div>
            <div>
                <label>Personal im Versand</label>
                <input type="number" id="stats-personal-heute" step="0.25" min="0" value="${personalVal}" placeholder="z.B. 3,5" style="width:100px;">
            </div>
            <button class="btn btn-save" onclick="saveTeamPersonalForDate()" style="margin-bottom:1px;">💾 Speichern</button>
        </div>
        <div class="ana-mode-tabs">
            <button type="button" class="ana-mode-tab ${modeWoche}" onclick="switchStatMode('woche')">Woche</button>
            <button type="button" class="ana-mode-tab ${modeMonat}" onclick="switchStatMode('monat')">Monat</button>
        </div>
    </div>

    <div class="card">
        <div class="ana-section-h">
            <h3>Tagesauswertung — ${anaDatumLabel(selDatum)}</h3>
            <span>Personal: <b>${tagTeam.personalAnzahl || '–'}</b></span>
        </div>
        <div class="ana-chef">${chefPlanungsHinweis(tagTeam, wochenMetriken.proKopf || 0)}</div>
        ${renderAnaKpiRow(tagTeam)}
        ${renderExUnsSplitBar(tagTeam.exportKg, tagTeam.unsKg, tagTeam.gesamtKg)}
        <div class="ana-section-h" style="margin-top:8px;">
            <h3>Wer schickt wie viel?</h3>
            <span>Sortiert (Handy), Export/Uns aus Wiegescheinen</span>
        </div>
        ${renderLieferantenTabelle(lieferantenTag)}
    </div>

    <div class="card">${periodHtml}</div>
    ${periodLieferantenHtml}

    <div class="card">
        <div class="ana-section-h">
            <h3>📱 Sortier-Buchungen — ${anaDatumLabel(selDatum)}</h3>
            <span style="font-size:12px;color:#888;">Einzelne Buchungen löschen</span>
        </div>
        <input type="text" id="sortier-buchungen-suche" placeholder="🔍 Lieferant oder Sorte suchen…" oninput="filterSortierBuchungen()" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:10px;">
        <div id="sortier-buchungen-liste">${renderSortierBuchungenFuerDatum(selDatum)}</div>
    </div>
    <div id="stats-integrity" style="margin-top:8px;"></div>`;

    const intDates = statMode === 'woche' ? getDatesForWeekOffset(statsWeekOffset) : (() => {
        let c = new Date(); c.setMonth(c.getMonth() + statsMonthOffset);
        const tm = c.getMonth() + 1; const ty = c.getFullYear(); const dim = [];
        for (let d = 1; d <= new Date(ty, tm, 0).getDate(); d++) { const iso = new Date(ty, tm - 1, d); dim.push(new Date(iso.getTime() - iso.getTimezoneOffset() * 60000).toISOString().split('T')[0]); }
        return dim;
    })();
    renderIntegrityBox('stats-integrity', intDates);
}

function runStatsSearch() {
    syncAuswertungDb();
    const s = (ge('stats-search')?.value||'').trim().toLowerCase();
    const res = ge('stats-search-results'); if (!res) return;
    if (!s) { res.innerHTML = '<p style="color:var(--muted);font-size:13px;">Suchbegriff eingeben…</p>'; return; }
    const hits = (db.deliveries||[]).filter(d =>
        (d.name||'').toLowerCase().includes(s) || (d.line||'').toLowerCase().includes(s)
    ).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20);
    if (!hits.length) { res.innerHTML = '<p style="color:var(--muted);">Keine Treffer.</p>'; return; }
    res.innerHTML = hits.map(d => `<div style="padding:10px;border-bottom:1px solid #f0f2f5;display:flex;justify-content:space-between;">
        <div><strong>${esc(d.name)}</strong>${d.line?` · ${esc(d.line)}`:''}<br><small style="color:var(--muted);">${d.date}</small></div>
        <strong>${(parseFloat(d.kg)||0).toLocaleString('de-DE',{maximumFractionDigits:1})} kg</strong>
    </div>`).join('');
}

// ── SORTIMENTE ────────────────────────────────────────────────
let sortMode = 'sup';
let sortSelected = null;

function setSortMode(mode) {
    sortMode = mode;
    ge('sortab-sup')?.classList.toggle('active', mode==='sup');
    ge('sortab-art')?.classList.toggle('active', mode==='art');
    sortSelected = null;
    ge('sort-left-title').textContent = mode==='sup' ? 'Lieferant wählen' : 'Artikel wählen';
    ge('sort-right-title').textContent = mode==='sup' ? 'Artikel zuweisen' : 'Lieferanten zuweisen';
    renderSortLeft(); renderSortRight();
}

function renderSortimente() { setSortMode(sortMode); }

function renderSortLeft() {
    const s = (ge('sort-left-search')?.value||'').toLowerCase();
    const list = ge('sort-left-list'); if (!list) return;
    let items = sortMode==='sup' ? (db.suppliers||[]).sort() : (db.articles||[]).map(a=>a.name||a.fertigNr).sort();
    if (s) items = items.filter(x=>x.toLowerCase().includes(s));
    list.innerHTML = items.map(x=>`<div class="list-item" style="cursor:pointer;${sortSelected===x?'background:var(--primary-light);':''}" onclick="selectSortLeft('${esc(x)}')">
        <span style="font-weight:600;">${esc(x)}</span>
        ${sortSelected===x?'<span style="color:var(--primary);">✓</span>':''}
    </div>`).join('') || '<div class="empty" style="padding:20px;">Keine Einträge</div>';
}

function selectSortLeft(name) { sortSelected = decodeURIComponent(name); renderSortLeft(); renderSortRight(); }

function renderSortRight() {
    const s = (ge('sort-right-search')?.value||'').toLowerCase();
    const onlyAssigned = ge('sort-only-assigned')?.checked;
    const list = ge('sort-right-list'); if (!list) return;
    if (!sortSelected) { list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);">Zuerst links wählen</div>'; return; }

    let items;
    if (sortMode==='sup') {
        items = (db.articles||[]).map(a => ({
            key: a.fertigNr||a.name, label: a.name||a.fertigNr,
            assigned: (a.suppliers||[]).includes(sortSelected)
        }));
    } else {
        const art = (db.articles||[]).find(a=>a.name===sortSelected||a.fertigNr===sortSelected);
        items = (db.suppliers||[]).sort().map(sup => ({
            key: sup, label: sup,
            assigned: art ? (art.suppliers||[]).includes(sup) : false
        }));
    }
    if (s) items = items.filter(x=>x.label.toLowerCase().includes(s));
    if (onlyAssigned) items = items.filter(x=>x.assigned);
    list.innerHTML = items.map(x=>`<div class="list-item" style="cursor:pointer;" onclick="toggleSortAssign('${esc(x.key)}')">
        <span style="flex:1;">${esc(x.label)}</span>
        <span style="font-size:20px;">${x.assigned?'<span style="color:var(--success);">✓</span>':'<span style="color:#e5e7eb;">○</span>'}</span>
    </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--muted);">Keine Einträge</div>';
}

function toggleSortAssign(key) {
    if (!sortSelected) return;
    const decodedKey = decodeURIComponent(key);
    if (sortMode==='sup') {
        const art = (db.articles||[]).find(a=>a.fertigNr===decodedKey||a.name===decodedKey);
        if (!art) return;
        if (!art.suppliers) art.suppliers = [];
        const idx = art.suppliers.indexOf(sortSelected);
        if (idx===-1) art.suppliers.push(sortSelected);
        else art.suppliers.splice(idx,1);
    } else {
        const art = (db.articles||[]).find(a=>a.name===sortSelected||a.fertigNr===sortSelected);
        if (!art) return;
        if (!art.suppliers) art.suppliers = [];
        const idx = art.suppliers.indexOf(decodedKey);
        if (idx===-1) art.suppliers.push(decodedKey);
        else art.suppliers.splice(idx,1);
    }
    saveDb(); renderSortRight();
}

// ── NÖLKE ─────────────────────────────────────────────────────
let editNoelkeIdx = null;

function renderNoelke() {
    const s = (ge('noelke-search')?.value||'').toLowerCase();
    const list = ge('noelke-list'); if (!list) return;
    const items = db.noelkeItems||[];
    const filtered = s ? items.filter(x=>(x.val||'').toLowerCase().includes(s)) : items;
    if (!filtered.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Noch keine Produkte</div></div>';
        return;
    }
    list.innerHTML = filtered.map((item,i) => {
        const realIdx = items.indexOf(item);
        return `<div class="noelke-item">
            <div class="noelke-item-text">${esc(item.val||'')}</div>
            <div class="noelke-actions">
                <button class="btn btn-sm" style="background:#ff9800;" onclick="openNoelkeEdit(${realIdx})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteNoelke(${realIdx})">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function openNoelkeAdd() { editNoelkeIdx = null; ge('ov-noelke-title').textContent = 'Neues Produkt'; ge('ov-noelke-val').value = ''; ge('ov-noelke-idx').value = ''; openOv('ov-noelke'); }
function openNoelkeEdit(i) { editNoelkeIdx = i; ge('ov-noelke-title').textContent = 'Produkt bearbeiten'; ge('ov-noelke-val').value = (db.noelkeItems||[])[i]?.val||''; ge('ov-noelke-idx').value = i; openOv('ov-noelke'); }

function saveNoelkeEdit() {
    const val = (ge('ov-noelke-val')?.value||'').trim();
    if (!val) return alert('Bitte Produktzeile eingeben.');
    if (!db.noelkeItems) db.noelkeItems = [];
    if (editNoelkeIdx !== null && editNoelkeIdx >= 0) {
        db.noelkeItems[editNoelkeIdx] = { id: db.noelkeItems[editNoelkeIdx]?.id||'nk'+Date.now(), val };
    } else {
        db.noelkeItems.push({ id: 'nk'+Date.now(), val });
    }
    closeOv('ov-noelke');
    renderNoelke(); saveDb();
}

function deleteNoelke(i) { if(!confirm('Produkt löschen?')) return; db.noelkeItems.splice(i,1); renderNoelke(); saveDb(); }

// ── SONDERPOSTEN ─────────────────────────────────────────────
let editSonderId = null;

function renderSonderposten() {
    const s = (ge('sonder-search')?.value||'').toLowerCase();
    const list = ge('sonder-list'); if (!list) return;
    const items = db.sonderTemplates||[];
    const filtered = s ? items.filter(x=>(x.name||'').toLowerCase().includes(s)||(x.ean||'').toLowerCase().includes(s)) : items;
    if (!filtered.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">Keine Vorlagen</div></div>';
        return;
    }
    list.innerHTML = filtered.map(t => {
        const stke2 = t.stke2||0; const stk = t.stk||0; const reihe = t.reihe||0;
        const reihen = t.reihen||0; const krtlage = t.krtlage||0; const lagen = t.lagen||0;
        const e2total = stke2 > 0 ? Math.round(stke2) : (stk*krtlage*lagen||0);
        return `<div class="sonder-card">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
                <div class="sonder-name">${esc(t.name||'?')}</div>
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm" style="background:#ff9800;" onclick="openSonderEdit('${esc(t.id)}')">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSonderById('${esc(t.id)}')">🗑️</button>
                </div>
            </div>
            ${t.ean?`<div style="font-size:11px;color:var(--muted);margin-bottom:8px;">EAN: ${esc(t.ean)}</div>`:''}
            <div class="sonder-fields">
                <div class="sonder-field"><div class="sonder-field-val">${t.kg||'—'}</div><div class="sonder-field-lbl">kg/Stk</div></div>
                <div class="sonder-field"><div class="sonder-field-val">${stk||'—'}</div><div class="sonder-field-lbl">Stk/Krt</div></div>
                <div class="sonder-field"><div class="sonder-field-val">${e2total||'—'}</div><div class="sonder-field-lbl">Stk/E2</div></div>
                <div class="sonder-field"><div class="sonder-field-val">${lagen||'—'}</div><div class="sonder-field-lbl">Lagen</div></div>
            </div>
        </div>`;
    }).join('');
}

function openSonderEdit(id) {
    editSonderId = id;
    const tpl = id ? (db.sonderTemplates||[]).find(t=>t.id===id) : null;
    ge('ov-sonder-title').textContent = tpl ? 'Vorlage bearbeiten' : 'Neue Vorlage';
    ge('ov-sonder-id').value = id || '';
    ge('ov-s-name').value = tpl?.name||'';
    ge('ov-s-ean').value = tpl?.ean||'';
    ge('ov-s-kg').value = tpl?.kg||'';
    ge('ov-s-stk').value = tpl?.stk||'';
    ge('ov-s-reihe').value = tpl?.reihe||'';
    ge('ov-s-reihen').value = tpl?.reihen||'';
    ge('ov-s-krtlage').value = tpl?.krtlage||'';
    ge('ov-s-lagen').value = tpl?.lagen||'';
    ge('ov-s-stke2').value = tpl?.stke2||'';
    ge('ov-sonder-del-btn').style.display = tpl ? 'flex' : 'none';
    openOv('ov-sonder');
}

function saveSonderEdit() {
    const name = (ge('ov-s-name')?.value||'').trim();
    if (!name) return alert('Bitte einen Namen eingeben.');
    if (!db.sonderTemplates) db.sonderTemplates = [];
    const data = {
        id: editSonderId || 'st'+Date.now(),
        name,
        ean: ge('ov-s-ean')?.value||'',
        kg: parseFloat(ge('ov-s-kg')?.value||0)||0,
        stk: parseInt(ge('ov-s-stk')?.value||0)||0,
        reihe: parseInt(ge('ov-s-reihe')?.value||0)||0,
        reihen: parseInt(ge('ov-s-reihen')?.value||0)||0,
        krtlage: parseInt(ge('ov-s-krtlage')?.value||0)||0,
        lagen: parseInt(ge('ov-s-lagen')?.value||0)||0,
        stke2: parseInt(ge('ov-s-stke2')?.value||0)||0
    };
    if (editSonderId) {
        const idx = db.sonderTemplates.findIndex(t=>t.id===editSonderId);
        if (idx !== -1) db.sonderTemplates[idx] = data;
        else db.sonderTemplates.push(data);
    } else { db.sonderTemplates.push(data); }
    closeOv('ov-sonder');
    renderSonderposten(); saveDb();
}

function deleteSonder() {
    if (!confirm('Vorlage löschen?')) return;
    db.sonderTemplates = (db.sonderTemplates||[]).filter(t=>t.id!==editSonderId);
    closeOv('ov-sonder');
    renderSonderposten(); saveDb();
}

function deleteSonderById(id) {
    if (!confirm('Vorlage löschen?')) return;
    db.sonderTemplates = (db.sonderTemplates||[]).filter(t=>t.id!==id);
    renderSonderposten(); saveDb();
}
