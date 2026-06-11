function ensureSupplierMeta() {
    if (!Array.isArray(db.deletedSuppliers)) db.deletedSuppliers = [];
    if (!Array.isArray(db.supplierLinesCleared)) db.supplierLinesCleared = [];
    if (!db.supplierLines || typeof db.supplierLines !== 'object') db.supplierLines = {};
    if (typeof reconcileSupplierLinesCleared === 'function') reconcileSupplierLinesCleared(db);
    if (typeof purgeClearedSupplierLines === 'function') {
        db.supplierLines = purgeClearedSupplierLines(db.supplierLines, db.supplierLinesCleared);
    } else if (typeof normalizeSupplierLinesForFirebase === 'function') {
        db.supplierLines = normalizeSupplierLinesForFirebase(db.supplierLines);
    }
}

function supDomKey(name) { return encodeURIComponent(name); }

function mergeSuppliersList(localArr, cloudArr) {
    ensureSupplierMeta();
    const deleted = new Set(db.deletedSuppliers.map(s => String(s).trim()).filter(Boolean));
    const merged = new Set((localArr || []).map(s => String(s).trim()).filter(s => s && !deleted.has(s)));
    (cloudArr || []).forEach(s => {
        const t = String(s || '').trim();
        if (t && !deleted.has(t)) merged.add(t);
    });
    return [...merged];
}

function mergeSupplierLinesClearedFromCloud(cloudCleared) {
    ensureSupplierMeta();
    if (!Array.isArray(cloudCleared)) return;
    if (typeof mergeSupplierLinesClearedLists === 'function') {
        db.supplierLinesCleared = mergeSupplierLinesClearedLists(db.supplierLinesCleared, cloudCleared);
    }
    if (typeof reconcileSupplierLinesCleared === 'function') reconcileSupplierLinesCleared(db);
}

function mergeSupplierLinesFromCloud(cloudLines) {
    ensureSupplierMeta();
    if (!cloudLines || typeof cloudLines !== 'object') {
        if (typeof purgeClearedSupplierLines === 'function') {
            db.supplierLines = purgeClearedSupplierLines(db.supplierLines, db.supplierLinesCleared);
        }
        return;
    }
    const normalized = typeof normalizeSupplierLinesForFirebase === 'function'
        ? normalizeSupplierLinesForFirebase(cloudLines)
        : cloudLines;
    Object.keys(normalized).forEach((safeKey) => {
        const cloud = normalized[safeKey];
        const name = typeof supplierNameFromLinesKey === 'function' ? supplierNameFromLinesKey(safeKey) : safeKey;
        if (typeof isSupplierLinesCleared === 'function' && isSupplierLinesCleared(db.supplierLinesCleared, name)) return;
        const local = typeof lookupSupplierLines === 'function'
            ? lookupSupplierLines(db.supplierLines, name, db.supplierLinesCleared)
            : db.supplierLines[safeKey];
        if (!Array.isArray(cloud) || cloud.length === 0) return;
        if (!Array.isArray(local) || local.length === 0) db.supplierLines[safeKey] = cloud.slice();
    });
    if (typeof reconcileSupplierLinesCleared === 'function') reconcileSupplierLinesCleared(db);
    if (typeof purgeClearedSupplierLines === 'function') {
        db.supplierLines = purgeClearedSupplierLines(db.supplierLines, db.supplierLinesCleared);
    } else if (typeof normalizeSupplierLinesForFirebase === 'function') {
        db.supplierLines = normalizeSupplierLinesForFirebase(db.supplierLines);
    }
}

function mergeDeletedSuppliersFromCloud(cloudDeleted) {
    ensureSupplierMeta();
    if (!Array.isArray(cloudDeleted)) return;
    const set = new Set(db.deletedSuppliers.map(s => String(s).trim()).filter(Boolean));
    cloudDeleted.forEach(s => { const t = String(s || '').trim(); if (t) set.add(t); });
    db.deletedSuppliers = [...set];
    db.suppliers = (db.suppliers || []).filter(s => !set.has(String(s).trim()));
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
    if ((del.source === 'sortieren' || del.source === 'sortieren_tag') && sum === 0) {
        return { done: true, label: 'Ohne Zuweisung', color: '#666' };
    }
    return { done: false, label: 'Noch offen: ' + (kg - sum).toFixed(2) + ' kg', color: 'var(--accent)' };
}

function isHandySortierEntry(del) {
    return del && (del.source === 'sortieren_tag' || del.source === 'sortieren');
}

function getSupplierLines(name) {
    ensureSupplierMeta();
    if (typeof isSupplierLinesCleared === 'function' && isSupplierLinesCleared(db.supplierLinesCleared, name)) return [];
    const lines = typeof lookupSupplierLines === 'function'
        ? lookupSupplierLines(db.supplierLines, name, db.supplierLinesCleared)
        : db.supplierLines[name];
    return Array.isArray(lines) ? lines.filter(l => String(l).trim()) : [];
}

function setSupplierLinesForName(name, lines) {
    ensureSupplierMeta();
    const safeKey = typeof supplierLinesSafeKey === 'function' ? supplierLinesSafeKey(name) : name;
    Object.keys(db.supplierLines).forEach((k) => {
        if (typeof supplierNameFromLinesKey === 'function' && supplierNamesMatch(supplierNameFromLinesKey(k), name) && k !== safeKey) {
            delete db.supplierLines[k];
        }
    });
    if (name !== safeKey && db.supplierLines[name] !== undefined) delete db.supplierLines[name];
    const cleaned = (lines || []).map((l) => String(l).trim()).filter(Boolean);
    if (cleaned.length) {
        db.supplierLines[safeKey] = cleaned;
        if (typeof unmarkSupplierLinesCleared === 'function') unmarkSupplierLinesCleared(db, name);
    } else {
        delete db.supplierLines[safeKey];
        if (typeof markSupplierLinesCleared === 'function') markSupplierLinesCleared(db, name);
    }
    if (typeof reconcileSupplierLinesCleared === 'function') reconcileSupplierLinesCleared(db);
}

function renderSupplierStatsTable(byLine, total, count) {
    const keys = Object.keys(byLine).sort((a, b) => {
        if (a.startsWith('Gemischt')) return 1;
        if (b.startsWith('Gemischt')) return -1;
        return byLine[b] - byLine[a];
    });
    if (!keys.length) return '<p style="color:#888; padding:12px 0;">Noch keine erfassten Sendungen.</p>';
    let html = '<table style="width:100%; border-collapse:collapse;"><thead><tr style="background:#f0f4fa;"><th style="text-align:left; padding:8px;">Warenlinie</th><th style="text-align:right; padding:8px;">kg gesamt</th></tr></thead><tbody>';
    keys.forEach(line => {
        html += `<tr><td style="padding:8px; border-bottom:1px solid #eee;">${line}</td><td style="padding:8px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${byLine[line].toFixed(2).replace('.', ',')}</td></tr>`;
    });
    html += `<tr style="background:#e8f0fa; font-weight:bold;"><td style="padding:10px 8px;">Gesamt (${count} Einträge)</td><td style="padding:10px 8px; text-align:right;">${total.toFixed(2).replace('.', ',')} kg</td></tr></tbody></table>`;
    return html;
}

function collectSupplierWeightRecords(name) {
    const recs = [];
    (db.deliveries || []).filter(d => d.name === name).forEach(d => {
        recs.push({ kg: d.kg, line: d.line, date: d.date });
    });
    (db.entries || []).filter(e => e.lief === name).forEach(e => {
        recs.push({ kg: e.netto, line: e.line, date: e.date || null });
    });
    return recs;
}

function aggregateSupplierByLine(records) {
    const byLine = {};
    let total = 0;
    records.forEach(r => {
        const kg = Number(r.kg || 0);
        if (!kg) return;
        const line = (r.line && String(r.line).trim()) ? String(r.line).trim() : 'Gemischt / ohne Linie';
        byLine[line] = (byLine[line] || 0) + kg;
        total += kg;
    });
    return { byLine, total, count: records.length };
}

function closeSupplierStatsModal() {
    const el = document.getElementById('supplier-stats-overlay');
    if (el) el.style.display = 'none';
}

function showSupplierStats(name) {
    const recs = collectSupplierWeightRecords(name);
    const agg = aggregateSupplierByLine(recs);
    const dates = recs.map(r => r.date).filter(Boolean).sort();
    const from = dates.length ? dates[0] : null;
    const to = dates.length ? dates[dates.length - 1] : null;
    let sub = recs.length ? `${recs.length} erfasste Sendungen` : 'Noch keine Sendungen in der Datenbank';
    if (from && to) {
        const fmt = d => new Date(d).toLocaleDateString('de-DE');
        sub += from === to ? ` · ${fmt(from)}` : ` · ${fmt(from)} – ${fmt(to)}`;
    }
    document.getElementById('supplier-stats-title').textContent = '📊 ' + name;
    document.getElementById('supplier-stats-sub').textContent = sub;
    document.getElementById('supplier-stats-body').innerHTML = renderSupplierStatsTable(agg.byLine, agg.total, agg.count);
    document.getElementById('supplier-stats-overlay').style.display = 'flex';
}

function toggleSupplierLinesPanel(name) {
    const key = supDomKey(name);
    const row = document.getElementById('sup-lines-' + key);
    if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

function saveSupplierLinesFromText(name) {
    ensureSupplierMeta();
    const key = supDomKey(name);
    const ta = document.getElementById('sup-lines-ta-' + key);
    if (!ta) return;
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    setSupplierLinesForName(name, lines);
    renderAll();
}

function updateAdminSupplierLineSelect() {
    const sup = document.getElementById('admin-supplier');
    const wrap = document.getElementById('admin-supplier-line-wrap');
    const sel = document.getElementById('admin-supplier-line');
    if (!sup || !wrap || !sel) return;
    const lines = getSupplierLines(sup.value);
    if (!lines.length) { wrap.style.display = 'none'; sel.innerHTML = ''; return; }
    wrap.style.display = 'block';
    sel.innerHTML = '<option value="">— Gemischt / optional —</option>' + lines.map(l => `<option value="${l.replace(/"/g, '&quot;')}">${l}</option>`).join('');
}

function inlineEditSupplier(oldName) {
    const key = supDomKey(oldName);
    document.getElementById(`sup-label-${key}`).style.display = 'none';
    document.getElementById(`sup-edit-input-${key}`).style.display = 'inline-block';
    document.getElementById(`btn-edit-sup-${key}`).style.display = 'none';
    document.getElementById(`btn-save-sup-${key}`).style.display = 'inline-block';
    document.getElementById(`sup-edit-input-${key}`).focus();
}

function inlineSaveSupplier(oldName) {
    const key = supDomKey(oldName);
    let newName = document.getElementById(`sup-edit-input-${key}`).value.trim();
    
    if(!newName) {
        alert("Der Lieferantenname darf nicht leer sein!");
        return;
    }

    if(newName !== oldName && db.suppliers.includes(newName)) {
        alert("Ein Lieferant mit diesem Namen existiert bereits!");
        return;
    }

    const idx = db.suppliers.indexOf(oldName);
    if(idx !== -1) { db.suppliers[idx] = newName; }

    db.articles.forEach(art => {
        if(art.suppliers && Array.isArray(art.suppliers)) {
            art.suppliers = art.suppliers.map(s => s === oldName ? newName : s);
        }
    });

    ensureSupplierMeta();
    const oldLines = getSupplierLines(oldName);
    if (typeof migrateSupplierLinesClearedRename === 'function') migrateSupplierLinesClearedRename(db, oldName, newName);
    if (oldLines.length) {
        setSupplierLinesForName(oldName, []);
        setSupplierLinesForName(newName, oldLines);
    }
    db.deletedSuppliers = db.deletedSuppliers.map(s => s === oldName ? newName : s);

    renderAll();
    alert(`✅ Lieferant erfolgreich geändert von "${oldName}" zu "${newName}"!`);
}

function cleanAllSuppliersDatabase() {
    if(!confirm("Möchtest du jetzt alle Lieferantennamen im gesamten System automatisch von störenden Leerzeichen am Ende befreien? Dies repariert alle Übertragungsfehler!")) return;
    
    db.suppliers = (db.suppliers || []).map(s => s.trim()).filter(s => s !== "");
    db.suppliers = [...new Set(db.suppliers)];

    db.articles.forEach(art => {
        if(art.suppliers && Array.isArray(art.suppliers)) {
            art.suppliers = art.suppliers.map(s => s.trim()).filter(s => s !== "");
            art.suppliers = [...new Set(art.suppliers)];
        }
    });

    renderAll();
    alert("✨ Datenbank erfolgreich bereinigt! Alle Leerzeichen-Tippfehler wurden restlos entfernt.");
}

function saveSupplier() { 
    const n = document.getElementById('new-sup-name').value.trim();
    if(!n) return alert("Bitte einen Namen eingeben!");
    if(db.suppliers.includes(n)) return alert("Dieser Lieferant existiert bereits!");
    
    db.suppliers.push(n); 
    document.getElementById('new-sup-name').value = ''; 
    renderAll(); 
}

function deleteSupplier(n) { 
    if(confirm(`Möchtest du den Lieferanten "${n}" wirklich löschen?\n\nHinweis: Nach dem Löschen bitte „In Cloud speichern“, damit er nicht wieder aus der Cloud kommt.`)) { 
        ensureSupplierMeta();
        db.suppliers = db.suppliers.filter(s => s !== n); 
        if (!db.deletedSuppliers.includes(n)) db.deletedSuppliers.push(n);
        setSupplierLinesForName(n, []);
        db.articles.forEach(art => { if(art.suppliers) art.suppliers = art.suppliers.filter(s => s !== n); });
        renderAll();
    } 
}
