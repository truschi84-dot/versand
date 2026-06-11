// ARTIKEL LOGIK
// =========================================================================
let activeMarktFilter = 'all';

function v10ActionSelectHtml(actions, dataAttrs) {
    const opts = actions.map((a) => `<option value="${a.v}">${a.l}</option>`).join('');
    const attrs = Object.entries(dataAttrs || {}).map(([k, v]) => ` data-${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
    return `<select class="v10-action-select no-print"${attrs} onchange="execV10Action(this)"><option value="">⚙ Aktion…</option>${opts}</select>`;
}

function execV10Action(sel) {
    const action = sel.value;
    sel.value = '';
    if (!action) return;
    const id = sel.dataset.id;
    const tab = sel.dataset.tab;
    const idx = sel.dataset.idx != null ? parseInt(sel.dataset.idx, 10) : null;
    if (tab === 'todo') {
        if (action === 'edit') openEditPoolModal(id, 'todo');
        else if (action === 'lose') toLose(id);
        else if (action === 'ok') openModal(id);
        else if (action === 'later') toLater(id);
        else if (action === 'hidden') toHidden(id);
        else if (action === 'delete') deleteArticle(id, 'todo');
    } else if (tab === 'later') {
        if (action === 'edit') openEditPoolModal(id, 'later');
        else if (action === 'restore') restoreFromPool(id, 'later');
        else if (action === 'delete') deleteArticle(id, 'later');
    } else if (tab === 'done' && idx != null && !isNaN(idx)) {
        if (action === 'edit') openEditFertigModal(idx);
        else if (action === 'delete') unassign(idx);
    } else if (tab === 'hidden') {
        if (action === 'edit') openEditPoolModal(id, 'hidden');
        else if (action === 'restore') restoreFromPool(id, 'hidden');
        else if (action === 'delete') deleteArticle(id, 'hidden');
    }
}

function getArtikelMarktValue(fertigNr) {
    if (fertigNr == null || fertigNr === '') return '';
    const key = String(fertigNr);
    const v = (db.artikelMarkt || {})[key];
    return v === 'export' || v === 'uns' ? v : '';
}

function setArtikelMarkt(fertigNr, value) {
    if (fertigNr == null || fertigNr === '') return;
    if (!db.artikelMarkt) db.artikelMarkt = {};
    const key = String(fertigNr);
    if (value === 'export' || value === 'uns') db.artikelMarkt[key] = value;
    else delete db.artikelMarkt[key];
    renderAll();
    renderV10Table();
}

function setMarktFilter(filter) {
    activeMarktFilter = filter;
    document.querySelectorAll('.markt-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
    renderV10Table();
}

function matchesMarktFilter(fertigNr) {
    const markt = getArtikelMarktValue(fertigNr);
    if (activeMarktFilter === 'uns') return markt === 'uns';
    if (activeMarktFilter === 'export') return markt === 'export';
    if (activeMarktFilter === 'unassigned') return markt === '';
    return true;
}

function marktSelectHtml(fertigNr) {
    const cur = getArtikelMarktValue(fertigNr);
    const esc = String(fertigNr).replace(/'/g, "\\'");
    return `<select onchange="setArtikelMarkt('${esc}', this.value)" style="padding:6px 8px; border-radius:6px; border:1px solid #ccc; font-size:13px; min-width:100px;">
        <option value="" ${cur === '' ? 'selected' : ''}>—</option>
        <option value="uns" ${cur === 'uns' ? 'selected' : ''}>Uns</option>
        <option value="export" ${cur === 'export' ? 'selected' : ''}>Export</option>
    </select>`;
}

/** Einmal-Migration beim CC-Start: fehlende Einträge aus Artikelname raten. */
function migrateArtikelMarktFromNames() {
    if (!db.artikelMarkt) db.artikelMarkt = {};
    const pools = ['articles', 'todo', 'later', 'hidden', 'lose'];
    pools.forEach(pool => {
        (db[pool] || []).forEach(a => {
            if (!a || a.fertigNr == null) return;
            const key = String(a.fertigNr);
            if (db.artikelMarkt[key] === 'export' || db.artikelMarkt[key] === 'uns') return;
            db.artikelMarkt[key] = artikelMarktTyp(a.fertigNr, a.name, null) === 'export' ? 'export' : 'uns';
        });
    });
}

function saveNewFertigArticle() {
    const nr = document.getElementById('create-fertig-nr').value.trim();
    const name = document.getElementById('create-fertig-name').value.trim();
    if(!nr || !name) return alert("Bitte Fertig-Nr. und Bezeichnung eingeben!");
    if(db.todo.some(a => a.fertigNr === nr) || db.articles.some(a => a.fertigNr === nr)) return alert("Diese Fertig-Nummer existiert bereits!");
    
    db.todo.push({ fertigNr: nr, name: name, nr: "", suppliers: [] });
    const marktEl = document.getElementById('create-fertig-markt');
    const marktVal = marktEl ? marktEl.value : '';
    if (marktVal === 'export' || marktVal === 'uns') {
        if (!db.artikelMarkt) db.artikelMarkt = {};
        db.artikelMarkt[nr] = marktVal;
    }
    document.getElementById('create-fertig-nr').value = '';
    document.getElementById('create-fertig-name').value = '';
    if (marktEl) marktEl.value = '';
    renderAll(); renderV10Table();
    alert("✅ Fertig-Artikel erfolgreich zum Reiter 'Offen' hinzugefügt!");
}

function saveNewLoseArticle() {
    const loseNr = document.getElementById('create-lose-nr').value.trim();
    const name = document.getElementById('create-lose-name').value.trim();
    if(!loseNr || !name) return alert("Bitte Lose-Nr. und Bezeichnung eingeben!");
    if(db.lose.some(a => a.fertigNr === loseNr)) return alert("Diese Lose-Nummer existiert bereits!");
    
    db.lose.push({ fertigNr: loseNr, name: name, nr: "", suppliers: [] });
    document.getElementById('create-lose-nr').value = '';
    document.getElementById('create-lose-name').value = '';
    renderAll(); renderLosePool();
    alert("✅ Artikel erfolgreich zum Lose-Pool (Rohware) hinzugefügt!");
}

function deleteArticle(id, poolType) {
    if(!confirm("Möchtest du diesen Artikel wirklich ENDGÜLTIG aus dem System löschen?")) return;
    let pool = poolType === 'todo' ? db.todo : poolType === 'later' ? db.later : poolType === 'hidden' ? db.hidden : db.lose;
    if (pool) {
        const idx = pool.findIndex(a => a.fertigNr === id);
        if (idx !== -1) { pool.splice(idx, 1); renderAll(); renderV10Table(); if(poolType === 'lose') renderLosePool(); }
    }
}

function switchV10Tab(tabName) {
    activeV10Tab = tabName;
    document.querySelectorAll('.v10-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-'+tabName).classList.add('active');
    document.getElementById('searchInput').value = '';
    const marktBar = document.getElementById('markt-filter-bar');
    if (marktBar) marktBar.style.display = tabName === 'done' ? 'flex' : 'none';
    renderV10Table();
}

function getV10ExportData() {
    const tabLabels = { todo: 'Offen', later: 'Später', done: 'Fertig', hidden: 'Versteckt' };
    const title = 'Artikelliste (' + tabLabels[activeV10Tab] + ')';
    let headers = [], rows = [];
    if (activeV10Tab === 'todo') {
        headers = ['Fertig-Nr.', 'Bezeichnung'];
        rows = (db.todo || []).map(a => [a.fertigNr || '-', a.name || '-']);
    } else if (activeV10Tab === 'later') {
        headers = ['Fertig-Nr.', 'Bezeichnung'];
        rows = (db.later || []).map(a => [a.fertigNr || '-', a.name || '-']);
    } else if (activeV10Tab === 'done') {
        headers = ['Lose-Nr.', 'Fertig-Nr.', 'Markt', 'Name für App', 'Originalbezeichnung'];
        rows = [...(db.articles || [])].sort((a, b) => (parseInt(a.fertigNr) || 0) - (parseInt(b.fertigNr) || 0))
            .map(a => {
                const m = getArtikelMarktValue(a.fertigNr);
                return [a.nr || '-', a.fertigNr || '-', m === 'export' ? 'Export' : m === 'uns' ? 'Uns' : '—', a.name || '-', a.originalName || '-'];
            });
    } else if (activeV10Tab === 'hidden') {
        headers = ['Fertig-Nr.', 'Bezeichnung'];
        rows = (db.hidden || []).map(a => [a.fertigNr || '-', a.name || '-']);
    }
    return { title, headers, rows, tabKey: tabLabels[activeV10Tab] };
}

function printV10List() {
    const d = getV10ExportData();
    if (!d.rows.length) return alert('Die Liste ist noch leer!');
    printTableDocument({ title: d.title, subtitle: 'Tresch & Sohn - PC Control Center', headers: d.headers, rows: d.rows });
}

function exportV10Excel() {
    const d = getV10ExportData();
    if (!d.rows.length) return alert('Die Liste ist noch leer!');
    const objRows = d.rows.map(r => {
        const o = {};
        d.headers.forEach((h, i) => { o[h] = r[i]; });
        return o;
    });
    downloadExcelSheet(objRows, 'Artikel', 'Artikelliste_' + d.tabKey + '_' + new Date().toISOString().split('T')[0] + '.xlsx');
}

function renderV10Table() {
    const thead = document.getElementById('v10-tableHead'); const tbody = document.getElementById('v10-tableBody'); const s = document.getElementById('searchInput').value.toUpperCase();
    thead.innerHTML = ''; tbody.innerHTML = '';

    if (activeV10Tab === 'todo') {
        document.getElementById('print-header-text').innerHTML = "Artikelliste (Offen) - Tresch & Sohn";
        thead.innerHTML = `<tr><th style="width:90px;">Fertig-Nr.</th><th>Bezeichnung</th><th style="width:120px;">Aktion</th></tr>`;
        db.todo.forEach((art) => {
            if ((art.fertigNr || '').includes(s) || (art.name || '').toUpperCase().includes(s)) {
                const tr = document.createElement('tr');
                const actions = v10ActionSelectHtml([
                    { v: 'edit', l: '✏️ Bearbeiten' },
                    { v: 'ok', l: '✅ Zuordnen (OK)' },
                    { v: 'lose', l: '→ Lose-Pool' },
                    { v: 'later', l: '→ Später' },
                    { v: 'hidden', l: '→ Versteckt' },
                    { v: 'delete', l: '🗑️ Löschen' }
                ], { id: art.fertigNr, tab: 'todo' });
                tr.innerHTML = `<td><strong>${art.fertigNr}</strong></td><td class="v10-name-cell" title="${(art.name || '').replace(/"/g, '&quot;')}">${art.name}</td><td>${actions}</td>`;
                tbody.appendChild(tr);
            }
        });
    } else if (activeV10Tab === 'later') {
        document.getElementById('print-header-text').innerHTML = "Artikelliste (Später) - Tresch & Sohn";
        thead.innerHTML = `<tr><th style="width:90px;">Fertig-Nr.</th><th>Bezeichnung</th><th style="width:120px;">Aktion</th></tr>`;
        db.later.forEach((art) => {
            if ((art.fertigNr || '').includes(s) || (art.name || '').toUpperCase().includes(s)) {
                const tr = document.createElement('tr');
                const actions = v10ActionSelectHtml([
                    { v: 'edit', l: '✏️ Bearbeiten' },
                    { v: 'restore', l: '↩ Jetzt bearbeiten' },
                    { v: 'delete', l: '🗑️ Löschen' }
                ], { id: art.fertigNr, tab: 'later' });
                tr.innerHTML = `<td style="color:#17a2b8;"><strong>${art.fertigNr}</strong></td><td class="v10-name-cell" style="color:#17a2b8;" title="${(art.name || '').replace(/"/g, '&quot;')}">${art.name}</td><td>${actions}</td>`;
                tbody.appendChild(tr);
            }
        });
    } else if (activeV10Tab === 'done') {
        document.getElementById('print-header-text').innerHTML = "Artikelliste (Fertig) - Tresch & Sohn";
        thead.innerHTML = `<tr><th style="width:75px;">Lose</th><th style="width:75px;">Fertig</th><th style="width:95px;">Markt</th><th>Name</th><th style="width:120px;">Aktion</th></tr>`;
        db.articles.forEach((art, i) => {
            if (!matchesMarktFilter(art.fertigNr)) return;
            if ((art.nr || '').includes(s) || (art.name || '').toUpperCase().includes(s) || (art.fertigNr || '').includes(s)) {
                const tr = document.createElement('tr');
                const origHint = art.originalName ? ` title="Original: ${art.originalName.replace(/"/g, '&quot;')}"` : '';
                const actions = v10ActionSelectHtml([
                    { v: 'edit', l: '✏️ Bearbeiten' },
                    { v: 'delete', l: '🗑️ Zuordnung lösen' }
                ], { id: art.fertigNr || '', tab: 'done', idx: i });
                tr.innerHTML = `<td><strong style="color:var(--success);">${art.nr || ''}</strong></td><td>${art.fertigNr || ''}</td><td>${marktSelectHtml(art.fertigNr)}</td><td class="v10-name-cell"${origHint}>${art.name}</td><td>${actions}</td>`;
                tbody.appendChild(tr);
            }
        });
    } else if (activeV10Tab === 'hidden') {
        document.getElementById('print-header-text').innerHTML = "Artikelliste (Versteckt) - Tresch & Sohn";
        thead.innerHTML = `<tr><th style="width:90px;">Fertig-Nr.</th><th>Bezeichnung</th><th style="width:120px;">Aktion</th></tr>`;
        db.hidden.forEach((art) => {
            if ((art.fertigNr || '').includes(s) || (art.name || '').toUpperCase().includes(s)) {
                const tr = document.createElement('tr');
                const actions = v10ActionSelectHtml([
                    { v: 'edit', l: '✏️ Bearbeiten' },
                    { v: 'restore', l: '👁 Einblenden' },
                    { v: 'delete', l: '🗑️ Löschen' }
                ], { id: art.fertigNr, tab: 'hidden' });
                tr.innerHTML = `<td style="color:#999;"><strong>${art.fertigNr}</strong></td><td class="v10-name-cell" style="color:#999;" title="${(art.name || '').replace(/"/g, '&quot;')}">${art.name}</td><td>${actions}</td>`;
                tbody.appendChild(tr);
            }
        });
    }
    updateStats();
}

function openEditFertigModal(idx) {
    const art = db.articles[idx]; if(!art) return; editingFertigId = idx; 
    document.getElementById('edit-fertig-lose').value = art.nr || ''; document.getElementById('edit-fertig-nr').value = art.fertigNr || ''; document.getElementById('edit-fertig-name').value = art.name || '';
    document.getElementById('edit-fertig-overlay').style.display = 'flex';
}
function closeEditFertigModal() { document.getElementById('edit-fertig-overlay').style.display = 'none'; editingFertigId = null; }

const POOL_EDIT_LABELS = { todo: 'Offener Artikel', later: 'Artikel (Später)', hidden: 'Versteckter Artikel', lose: 'Lose-Artikel' };

function openEditPoolModal(fertigNr, pool) {
    const art = (db[pool] || []).find(a => a.fertigNr === fertigNr);
    if (!art) return;
    editingPoolCtx = { pool, oldId: fertigNr };
    document.getElementById('edit-pool-title').innerText = POOL_EDIT_LABELS[pool] || 'Artikel bearbeiten';
    document.getElementById('edit-pool-nr').value = art.fertigNr || '';
    document.getElementById('edit-pool-name').value = art.name || '';
    document.getElementById('edit-pool-overlay').style.display = 'flex';
}
function closeEditPoolModal() { document.getElementById('edit-pool-overlay').style.display = 'none'; editingPoolCtx = null; }

function poolArticleExists(nr, ignorePool, ignoreId) {
    const pools = ['todo', 'later', 'hidden', 'lose'];
    for (const p of pools) {
        if (p === ignorePool) {
            if ((db[p] || []).some(a => a.fertigNr !== ignoreId && a.fertigNr === nr)) return true;
        } else if ((db[p] || []).some(a => a.fertigNr === nr)) return true;
    }
    if ((db.articles || []).some(a => a.fertigNr === nr || a.nr === nr)) return true;
    return false;
}

function saveEditPool() {
    if (!editingPoolCtx) return;
    const art = (db[editingPoolCtx.pool] || []).find(a => a.fertigNr === editingPoolCtx.oldId);
    if (!art) { closeEditPoolModal(); return; }
    const newNr = document.getElementById('edit-pool-nr').value.trim();
    const newName = document.getElementById('edit-pool-name').value.trim();
    if (!newNr || !newName) return alert('Bitte Nummer und Bezeichnung ausfüllen.');
    if (newNr !== editingPoolCtx.oldId && poolArticleExists(newNr, editingPoolCtx.pool, editingPoolCtx.oldId)) {
        return alert('Diese Artikelnummer existiert bereits.');
    }
    art.fertigNr = newNr;
    art.name = newName;
    closeEditPoolModal();
    renderAll(); renderV10Table(); renderLosePool();
}

function saveEditFertig() {
    if(editingFertigId === null) return; const art = db.articles[editingFertigId];
    if(art) {
        art.nr = document.getElementById('edit-fertig-lose').value.trim(); art.fertigNr = document.getElementById('edit-fertig-nr').value.trim(); art.name = document.getElementById('edit-fertig-name').value.trim();
        if (lastAction && lastAction.pool === 'done') { lastAction = null; document.getElementById('undo-banner').style.display = 'none'; }
    }
    closeEditFertigModal(); renderAll(); renderV10Table();
}

function setLastAction(id, name, poolName) { lastAction = { id: id, name: name, pool: poolName }; document.getElementById('undo-text').innerText = `${id} - verschoben`; document.getElementById('undo-banner').style.display = 'flex'; }
function undoLastAction() {
    if (!lastAction) return;
    if (lastAction.pool === 'done') { const idx = db.articles.findIndex(a => a.fertigNr === lastAction.id); if(idx !== -1) unassign(idx, true); } 
    else { restoreFromPool(lastAction.id, lastAction.pool, true); }
    lastAction = null; document.getElementById('undo-banner').style.display = 'none';
}

function toLose(id) { const idx = db.todo.findIndex(a => a.fertigNr === id); if(idx === -1) return; const art = db.todo.splice(idx, 1)[0]; db.lose.push(art); setLastAction(art.fertigNr, art.name, 'lose'); renderAll(); renderV10Table(); renderLosePool(); }
function toHidden(id) { const idx = db.todo.findIndex(a => a.fertigNr === id); if(idx === -1) return; const art = db.todo.splice(idx, 1)[0]; db.hidden.push(art); setLastAction(art.fertigNr, art.name, 'hidden'); renderAll(); renderV10Table(); }
function toLater(id) { const idx = db.todo.findIndex(a => a.fertigNr === id); if(idx === -1) return; const art = db.todo.splice(idx, 1)[0]; db.later.push(art); setLastAction(art.fertigNr, art.name, 'later'); renderAll(); renderV10Table(); }

function unassign(idx, isUndo = false) {
    if(idx < 0 || idx >= db.articles.length) return; const art = db.articles.splice(idx, 1)[0];
    if(art.fertigNr) { art.nr = ""; } if(art.originalName) { art.name = art.originalName; } else { art.name = art.name.replace(/\s?\(\d+\)$/, ""); }
    db.todo.push(art); if (!isUndo && lastAction && lastAction.pool === 'done') { lastAction = null; document.getElementById('undo-banner').style.display = 'none'; }
    renderAll(); renderV10Table();
}

function restoreFromPool(id, poolType, isUndo = false) {
    let pool = poolType === 'lose' ? db.lose : poolType === 'hidden' ? db.hidden : db.later; const idx = pool.findIndex(a => a.fertigNr === id);
    if (idx !== -1) {
        const art = pool.splice(idx, 1)[0]; db.todo.push(art);
        if (!isUndo && lastAction && lastAction.id === art.fertigNr) { lastAction = null; document.getElementById('undo-banner').style.display = 'none'; }
        renderAll(); renderV10Table(); renderLosePool();
    }
}

function toggleLoseMenu() { document.getElementById('menu-lose').classList.toggle('open'); renderLosePool(); }
function renderLosePool() {
    const lc = document.getElementById('lose-pool-container'); if(!lc) return; const s = document.getElementById('searchLosePool').value.toLowerCase(); lc.innerHTML = '';
    db.lose.forEach(a => {
        if ((a.fertigNr || '').toLowerCase().includes(s) || (a.name || '').toLowerCase().includes(s)) {
            const d = document.createElement('div'); d.className = 'lose-item';
            d.innerHTML = `<div><strong>${a.fertigNr}</strong> - ${a.name}</div><div style="display:flex; gap:5px; margin-top:5px;"><button class="btn btn-save" style="flex:1; padding:6px; font-size:11px; background:#17a2b8;" onclick="openEditPoolModal('${a.fertigNr}', 'lose')">✏️</button><button class="btn btn-save" style="flex:1; padding:6px; font-size:11px;" onclick="restoreFromPool('${a.fertigNr}', 'lose')">↩ Zurück</button><button class="btn btn-save" style="background:#dc3545; padding:6px; font-size:11px;" onclick="deleteArticle('${a.fertigNr}', 'lose')">🗑️</button></div>`;
            lc.appendChild(d);
        }
    });
    updateStats();
}

function openModal(targetId) {
    if (db.lose.length === 0) return alert("Der Lose-Pool ist leer!"); currentTargetId = targetId; const art = db.todo.find(a => a.fertigNr === targetId); if(!art) return;
    document.getElementById('modal-target-name').innerText = art.name; document.getElementById('custom-app-name').value = art.name; document.getElementById('modalSearch').value = ''; document.getElementById('modal-overlay').style.display = 'flex';
    renderModalList(); setTimeout(() => { document.getElementById('modalSearch').focus(); }, 100);
}
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; currentTargetId = null; }

function renderModalList() {
    const c = document.getElementById('modal-list-container'); const s = document.getElementById('modalSearch').value.toLowerCase(); c.innerHTML = '';
    const todoArt = db.todo.find(a => a.fertigNr === currentTargetId); if(!todoArt) return;
    const targetWords = todoArt.name.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 2);
    let scoredList = db.lose.map(art => {
        let score = 0; art.name.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 2).forEach(w => { if (targetWords.includes(w)) score++; });
        return { ...art, score: score };
    }).sort((a, b) => b.score - a.score);
    let hasBestMatch = false;
    scoredList.forEach(art => {
        if ((art.fertigNr || '').toLowerCase().includes(s) || (art.name || '').toLowerCase().includes(s)) {
            const div = document.createElement('div'); div.className = 'modal-list-item';
            let badge = (art.score > 0 && !hasBestMatch) ? `<span style="background: #28a745; color: white; padding: 3px 6px; border-radius: 4px; font-size: 11px; float: right;">⭐ Treffer</span>` : '';
            if (art.score > 0 && !hasBestMatch) { hasBestMatch = true; div.style.borderLeft = "4px solid #28a745"; div.style.backgroundColor = "#e8f5e9"; }
            div.innerHTML = `<strong>${art.fertigNr}</strong> - ${art.name} ${badge}`; div.onclick = () => confirmAssign(art.fertigNr); c.appendChild(div);
        }
    });
}

function confirmAssign(loseId) {
    const idx = db.todo.findIndex(a => a.fertigNr === currentTargetId); if(idx === -1) return;
    const art = db.todo.splice(idx, 1)[0]; art.nr = loseId.trim(); art.originalName = art.name; 
    const newAppName = document.getElementById('custom-app-name').value.trim() || art.name;
    art.name = `${newAppName} (${art.fertigNr})`; if(!art.suppliers) art.suppliers = [];
    db.articles.push(art); setLastAction(art.fertigNr, art.originalName, 'done'); closeModal(); renderAll(); renderV10Table();
}

function updateStats() {
    const total = db.todo.length + db.lose.length + db.later.length + db.hidden.length + db.articles.length;
    const h = db.articles.length + db.hidden.length; const p = total > 0 ? Math.round((h/total)*100) : 0;
    document.getElementById('progress-bar').style.width = p+'%'; document.getElementById('progress-text').innerText = p+'%';
    document.getElementById('count-todo').innerText = db.todo.length; document.getElementById('count-lose').innerText = db.lose.length;
    document.getElementById('count-later').innerText = db.later.length; document.getElementById('count-done').innerText = db.articles.length; document.getElementById('count-hidden').innerText = db.hidden.length;
}

// SORTIMENTE ZUWEISEN LOGIK
// =========================================================================
function setAssignMode(m) { assignMode = m; assignSelectedTarget = null; document.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.id === 'btn-mode-' + m)); renderAssignLeft(); renderAssignRight(); }

function renderAssignLeft() {
    const q = document.getElementById('assign-left-search').value.toLowerCase(); let h = '';
    if(assignMode === 'art') { db.articles.forEach((a, i) => { if((a.name||'').toLowerCase().includes(q) || (a.nr && a.nr.includes(q))) h += `<div class="selectable-item ${assignSelectedTarget===i?'active':''}" onclick="selectAssign(${i})"><span><b>${a.nr || '??'}</b> - ${a.name}</span></div>`; }); }
    else { db.suppliers.sort().forEach(s => { if(s.toLowerCase().includes(q)) h += `<div class="selectable-item ${assignSelectedTarget===s?'active':''}" onclick="selectAssign('${s}')">${s}</div>`; }); }
    document.getElementById('assign-left-list').innerHTML = h;
}
function selectAssign(t) { assignSelectedTarget = t; renderAssignRight(); renderAssignLeft(); }

function renderAssignRight() {
    const q = document.getElementById('assign-right-search').value.toLowerCase(); const onlyAssigned = document.getElementById('filter-assigned-only').checked; const list = document.getElementById('assign-right-list');
    if(assignSelectedTarget === null) { list.innerHTML = '<p style="padding:20px;">Wähle links...</p>'; return; }
    let h = '';
    if(assignMode === 'art') {
        const ass = db.articles[assignSelectedTarget].suppliers || [];
        db.suppliers.sort().forEach(s => { const isLinked = ass.includes(s); if(onlyAssigned && !isLinked) return; if(s.toLowerCase().includes(q)) h += `<label class="checkbox-item"><input type="checkbox" ${isLinked?'checked':''} onchange="toggleLink('${s}')"> ${s}</label>`; });
    } else {
        db.articles.forEach((a, i) => { const isLinked = (a.suppliers||[]).includes(assignSelectedTarget); if(onlyAssigned && !isLinked) return; if((a.name||'').toLowerCase().includes(q) || (a.nr && a.nr.includes(q))) h += `<label class="checkbox-item"><input type="checkbox" ${isLinked?'checked':''} onchange="toggleLink(${i})"> <span><b>${a.nr || '??'}</b> - ${a.name}</span></label>`; });
    }
    list.innerHTML = h || '<p style="padding:20px; color:#999;">Keine Treffer</p>';
}

function toggleLink(v) {
    let a = assignMode === 'art' ? db.articles[assignSelectedTarget] : db.articles[v]; if(!a.suppliers) a.suppliers = []; const t = assignMode === 'art' ? v : assignSelectedTarget;
    if(a.suppliers.includes(t)) a.suppliers = a.suppliers.filter(x => x !== t); else a.suppliers.push(t);
    renderAll(); renderAssignRight();
}
