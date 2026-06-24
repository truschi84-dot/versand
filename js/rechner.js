function formatMHD(el) {
    let val = el.value.replace(/[^\d]/g, '');
    if (val.length > 4) val = val.substring(0, 4);
    if (val.length > 2) el.value = val.substring(0, 2) + '.' + val.substring(2);
    else el.value = val;
}

let entries = [], entriesSort = [], entriesNoelke = [], morningTasks = [], adhocTasks = [];
let sonderTemplates = [];
let reklamationDrafts = {};
let customTabEntries = {};
let selectedSorte = "", selectedNoelke = "", isSonderMode = false, currentSearchType = "";
let isSonderModeSort = false;

let activeSorteFilter = 'all'; 

// ======================= DB & SYNC =======================

function loadRechnerData() {
    try {
        const db = ladeRechnerDb();
        entries = db.entries || []; entriesSort = db.entriesSort || []; entriesNoelke = db.entriesNoelke || [];
        sonderTemplates = db.sonderTemplates || [];
        reklamationDrafts = db.reklamationDrafts || {};
        morningTasks = db.morningTasks || [];
        adhocTasks = db.adhocTasks || [];
        customTabEntries = db.customTabEntries || {};
        if (typeof syncMorningChecklistFromTemplate === 'function') syncMorningChecklistFromTemplate();
        
        if(typeof buildAppUI === 'function') buildAppUI();
        if(typeof updateLiefDropdowns === 'function') updateLiefDropdowns();

        if(typeof renderLKW === 'function') { renderLKW(); renderSort(); renderNoelke(); loadBrandenburgData(); }
    } catch(e) { console.error("Fehler in loadRechnerData", e); }
}

function saveRechnerDB() {
    try {
        const db = ladeRechnerDb();
        db.entries = entries; db.entriesSort = entriesSort; db.entriesNoelke = entriesNoelke;
        db.sonderTemplates = sonderTemplates;
        db.reklamationDrafts = reklamationDrafts;
        db.morningTasks = morningTasks;
        db.adhocTasks = adhocTasks;
        const today = typeof getLocalISO === 'function' ? getLocalISO() : new Date().toISOString().split('T')[0];
        const daily = db.checklistDaily || { date: today, morningDone: {}, morningPhotos: {} };
        daily.date = today;
        daily.morningDone = daily.morningDone || {};
        daily.morningPhotos = daily.morningPhotos || {};
        (morningTasks || []).forEach(t => {
            if (!t.id) return;
            daily.morningDone[t.id] = !!t.done;
            if (t.photo) daily.morningPhotos[t.id] = t.photo;
            else delete daily.morningPhotos[t.id];
        });
        db.checklistDaily = daily;
        db.customTabEntries = customTabEntries;
        speichereRechnerDb(db);
        if (typeof triggerAutoSync === 'function') triggerAutoSync('rechner');
    } catch(e) { console.error("Fehler in saveRechnerDB", e); }
}

async function loadAllFromCloud(silent) {
    if (!requireAppAuth()) return;
    if (await shouldSkipCloudOnWeb(!!silent)) return;
    const btn = document.getElementById('global-sync-btn');
    if(btn) btn.classList.add('sync-active');
    try {
        const res = await cloudFetch(APP_CONFIG.CLOUD_URL + ".json?t=" + Date.now());
        const data = await res.json();
        if(data) {
            if (data.settings && typeof revokeSessionIfPinChanged === 'function' && revokeSessionIfPinChanged(data.settings)) return;
            if (typeof applyRechnerStammdatenFromCloud === 'function') applyRechnerStammdatenFromCloud(data);
            if (typeof loadLocalDB === 'function') loadLocalDB();
            if (typeof loadRechnerData === 'function') loadRechnerData();
            if (typeof updateLiefDropdowns === 'function') updateLiefDropdowns();
            if (typeof refreshWarenlinieSelects === 'function') refreshWarenlinieSelects();
            if (typeof addAppCloudLog === 'function') addAppCloudLog("DOWNLOAD: Stammdaten aus Cloud [OK]");
            if (!silent) showToast("Lieferanten, Sorten & Nölke-Produkte geladen!", "success");
        }
    } catch(e) { 
        console.error(e);
        if (e && e.code === 'GITHUB_NO_CLOUD') {
            if (typeof addAppCloudLog === 'function') addAppCloudLog('INFO: GitHub-Vorschau ohne Cloud (APK/USB hat Zugang)');
            if(btn) btn.classList.remove('sync-active');
            return;
        }
        const msg = (typeof getCloudSetupHint === 'function' && /Cloud-Zugang|Firebase-Login|nicht konfiguriert/i.test(String(e.message || '')))
            ? e.message
            : ('Cloud-Fehler: ' + (e.message || 'Netzwerk'));
        if (!silent) showToast(msg.length > 120 ? 'Cloud-Fehler – siehe Cloud-Log' : msg, 'error'); 
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Listen-Update fehlgeschlagen - " + (e.message || msg));
    }
    if(btn) btn.classList.remove('sync-active');
}

function updateLiefDropdowns() {
    try {
        const db = AppStorage.get('kombi_logistik_db', {});
        let sups = db.suppliers || [];
        let custs = db.customers || [];
        if (!Array.isArray(sups)) sups = [];
        if (!Array.isArray(custs)) custs = [];
        const html = sups.sort().map(s => `<option value="${s}">${s}</option>`).join('');
        if(document.getElementById('lief')) document.getElementById('lief').innerHTML = html;
        if(document.getElementById('lief-sort')) document.getElementById('lief-sort').innerHTML = html;
        if(document.getElementById('edit-lief')) document.getElementById('edit-lief').innerHTML = html;

        let allOptions = [...new Set(custs)].sort();
        if(document.getElementById('kunde-datalist')) document.getElementById('kunde-datalist').innerHTML = allOptions.map(s => `<option value="${s}">`).join('');
        if (typeof updateLkwSupplierLineSelect === 'function') updateLkwSupplierLineSelect();
    } catch(e) { console.error("Fehler in updateLiefDropdowns", e); }
}

function getSupplierLinesForLief(name) {
    const db = AppStorage.get('kombi_logistik_db', {});
    if (typeof isSupplierLinesCleared === 'function' && isSupplierLinesCleared(db.supplierLinesCleared, name)) return [];
    const lines = typeof lookupSupplierLines === 'function'
        ? lookupSupplierLines(db.supplierLines, name, db.supplierLinesCleared)
        : (db.supplierLines && db.supplierLines[name]);
    return Array.isArray(lines) ? lines.filter(l => String(l).trim()) : [];
}

function updateLkwSupplierLineSelect() {
    if (typeof ensureWarenlinieUi === 'function') ensureWarenlinieUi();
    const liefEl = document.getElementById('lief');
    const wrap = document.getElementById('lkw-supplier-line-wrap');
    const sel = document.getElementById('lkw-supplier-line');
    if (!liefEl || !wrap || !sel) return;
    const lines = getSupplierLinesForLief(liefEl.value);
    if (!lines.length) {
        wrap.style.display = 'none';
        sel.innerHTML = '';
        return;
    }
    wrap.style.display = 'block';
    sel.innerHTML = '<option value="">— Gemischt / optional —</option>' + lines.map(l => `<option value="${String(l).replace(/"/g, '&quot;')}">${l}</option>`).join('');
}

function lkwEntryLabel(e) {
    if (!e) return '';
    return e.line ? `${e.lief} · ${e.line}` : e.lief;
}

function aggregateByWarenlinie(records, weightKey) {
    const byLine = {};
    let total = 0;
    (records || []).forEach(r => {
        const kg = Number(r[weightKey] || r.kg || r.netto || 0);
        if (!kg) return;
        const line = (r.line && String(r.line).trim()) ? String(r.line).trim() : 'Gemischt / ohne Linie';
        byLine[line] = (byLine[line] || 0) + kg;
        total += kg;
    });
    return { byLine, total, count: (records || []).length };
}

function renderSupplierDetailTable(byLine, total, count) {
    const keys = Object.keys(byLine).sort((a, b) => {
        if (a.startsWith('Gemischt')) return 1;
        if (b.startsWith('Gemischt')) return -1;
        return byLine[b] - byLine[a];
    });
    if (!keys.length) return '<p style="color:#888; text-align:center; padding:12px 0;">Noch keine Einträge mit Gewicht.</p>';
    let html = '<table style="width:100%; border-collapse:collapse; font-size:14px;"><thead><tr style="background:#f0f4fa;"><th style="text-align:left; padding:8px;">Warenlinie</th><th style="text-align:right; padding:8px;">kg</th></tr></thead><tbody>';
    keys.forEach(line => {
        html += `<tr><td style="padding:8px; border-bottom:1px solid #eee;">${line}</td><td style="padding:8px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${byLine[line].toFixed(2).replace('.', ',')}</td></tr>`;
    });
    html += `<tr style="background:#e8f0fa; font-weight:bold;"><td style="padding:10px 8px;">Gesamt (${count} Einträge)</td><td style="padding:10px 8px; text-align:right;">${total.toFixed(2).replace('.', ',')} kg</td></tr></tbody></table>`;
    return html;
}

function closeSupplierDetailModal() {
    const m = document.getElementById('supplier-detail-modal');
    if (m) m.style.display = 'none';
}

function openSupplierLkwDetail(lief) {
    const modal = document.getElementById('supplier-detail-modal');
    if (!modal) return;
    const recs = entries.filter(e => e.lief === lief);
    const agg = aggregateByWarenlinie(recs, 'netto');
    document.getElementById('supplier-detail-title').textContent = '🚛 ' + lief;
    document.getElementById('supplier-detail-sub').textContent = 'Aktuelle LKW-Liste · Aufschlüsselung nach Warenlinie';
    document.getElementById('supplier-detail-body').innerHTML = renderSupplierDetailTable(agg.byLine, agg.total, agg.count);
    modal.style.display = 'flex';
}

function switchTab(tabId) {
    try {
        document.querySelectorAll('#app2_wrapper .tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('#app2_wrapper .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#drawer2 .drawer-item.menu-tab').forEach(b => b.classList.remove('active'));
        
        let activeContent = document.getElementById('tab-' + tabId);
        let activeMenuItem = document.getElementById('menu-tab-' + tabId);
        let activeButton = document.getElementById('btn-tab-' + tabId);
        
        if (activeContent) activeContent.classList.add('active');
        if (tabId === 'checklist' && typeof initChecklist === 'function') initChecklist();
        if (tabId === 'brandenburg' && typeof loadBrandenburgData === 'function') loadBrandenburgData();
        if (activeMenuItem) activeMenuItem.classList.add('active');
        if (activeButton) activeButton.classList.add('active');
    } catch(e) { console.error("Fehler in switchTab", e); }
}

function toggleMenuApp2(s) {
    const drawer = document.getElementById('drawer2');
    const overlay = document.getElementById('overlay2');
    const open = !!s;
    document.body.classList.toggle('menu-open', open);
    if (open) {
        document.body.style.position = 'fixed';
        document.body.style.top = `-${window.scrollY}px`;
        document.body.style.width = '100%';
    } else {
        const scrollY = parseInt(document.body.style.top || '0') * -1;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
    }
    if (overlay) overlay.style.display = open ? 'block' : 'none';
    if (!drawer) return;
    if (open) {
        drawer.style.display = 'block';
        drawer.style.removeProperty('pointer-events');
        drawer.style.removeProperty('visibility');
        drawer.style.removeProperty('transform');
        requestAnimationFrame(() => drawer.classList.add('open'));
    } else {
        drawer.classList.remove('open');
        drawer.style.display = 'none';
    }
}
function switchTabAndCloseMenu(tabId) {
    if (typeof switchTab === 'function') switchTab(tabId);
    toggleMenuApp2(false);
}

// ======================= MODAL SEARCH =======================

let searchModalViewportBound = false;

function updateSearchModalViewport() {
    const modal = document.getElementById('search-modal');
    if (!modal) return;
    if (modal.style.display === 'none') {
        modal.style.top = '';
        modal.style.left = '';
        modal.style.width = '';
        modal.style.height = '';
        const content = modal.querySelector('.search-modal-content');
        if (content) content.style.maxHeight = '';
        return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const pad = 6;
    modal.style.top = vv.offsetTop + 'px';
    modal.style.left = vv.offsetLeft + 'px';
    modal.style.width = vv.width + 'px';
    modal.style.height = vv.height + 'px';
    const content = modal.querySelector('.search-modal-content');
    if (content) content.style.maxHeight = Math.max(200, vv.height - pad * 2) + 'px';
}

function bindSearchModalViewport() {
    if (searchModalViewportBound || !window.visualViewport) return;
    searchModalViewportBound = true;
    const onVvChange = () => updateSearchModalViewport();
    window.visualViewport.addEventListener('resize', onVvChange);
    window.visualViewport.addEventListener('scroll', onVvChange);
}

function openSearchModal(type) {
    try {
        currentSearchType = type; document.getElementById('search-modal').style.display = 'flex';
        bindSearchModalViewport();
        updateSearchModalViewport();
        document.getElementById('modal-search-input').value = ""; document.getElementById('modal-title').innerText = type === 'sorte' ? "Sorte wählen" : "Produkt wählen";
        
        const filterBar = document.getElementById('modal-sorte-filter-bar');
        if(filterBar) {
            if(type === 'sorte') { filterBar.style.display = 'flex'; setSorteFilter('all'); } 
            else { filterBar.style.display = 'none'; }
        }

        const sonderFilterBar = document.getElementById('modal-sonder-filter-bar');
        if (sonderFilterBar) {
            if(type === 'sonder-tpl' || type === 'sonder-tpl-sort') {
                sonderFilterBar.style.display = 'block';
                const lDb = AppStorage.get('kombi_logistik_db', {});
                const sups = lDb.suppliers || [];
                const filterSelect = document.getElementById('modal-sonder-lief-filter');
                filterSelect.innerHTML = '<option value="ALL">🌐 Alle Vorlagen anzeigen</option><option value="GLOBAL">⭐ Nur Globale Vorlagen (Ohne Lieferant)</option>' + sups.sort().map(s => `<option value="${s}">🏢 Vorlagen von: ${s}</option>`).join('');
                
                let currentTabLief = type === 'sonder-tpl-sort' ? (document.getElementById('lief-sort')?document.getElementById('lief-sort').value:"") : (document.getElementById('lief')?document.getElementById('lief').value:"");
                if (currentTabLief && sups.includes(currentTabLief)) { filterSelect.value = currentTabLief; } 
                else { filterSelect.value = 'ALL'; }
            } else {
                sonderFilterBar.style.display = 'none';
            }
        }

        if(type === 'sonder-tpl' || type === 'sonder-tpl-sort') {
            document.getElementById('modal-title').innerText = "Vorlage wählen";
            document.getElementById('search-action-btn').style.display = 'block';
            document.getElementById('search-action-btn').innerHTML = '<button onclick="openSonderTplModal(true)" style="width:100%; padding:10px; background:var(--sonder); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:16px;">➕ Neue Vorlage anlegen</button>';
        } else { document.getElementById('search-action-btn').style.display = 'none'; }
        
        filterResults();
        const searchInput = document.getElementById('modal-search-input');
        setTimeout(() => {
            if (searchInput) searchInput.focus({ preventScroll: true });
            updateSearchModalViewport();
            setTimeout(updateSearchModalViewport, 400);
        }, 100);
    } catch(e) { console.error("Fehler in openSearchModal", e); }
}

function setSorteFilter(filterType) {
    try {
        activeSorteFilter = filterType;
        ['all', 'uns', 'exp'].forEach(id => {
            const btn = document.getElementById('filter-btn-' + id);
            if(btn) { btn.style.background = '#f4f6f9'; btn.style.color = '#555'; }
        });
        const activeBtn = document.getElementById('filter-btn-' + filterType);
        if(activeBtn) { activeBtn.style.background = '#004b93'; activeBtn.style.color = 'white'; }
        filterResults();
    } catch(e) { console.error("Fehler in setSorteFilter", e); }
}

function closeSearchModal() {
    document.getElementById('search-modal').style.display = 'none';
    updateSearchModalViewport();
}

function filterResults() {
    try {
        const qRaw = document.getElementById('modal-search-input').value;
        const q = qRaw.toLowerCase(); 
        let html = "";
        
        let gs1Data = parseGS1(qRaw);
        
        if(currentSearchType === 'sorte') {
            const lValue = document.getElementById('lief-sort') ? document.getElementById('lief-sort').value : "";
            const l = lValue ? lValue.trim().toLowerCase() : "";
            
            const lDb = ladeLogistikDb();
            const articles = Array.isArray(lDb.articles) ? lDb.articles : [];
            const loseList = Array.isArray(lDb.lose) ? lDb.lose : [];
            const artikelMarkt = lDb.artikelMarkt || {};
            let matchingArticles = [];
            
            articles.forEach(a => {
                let matchesLief = false;
                if (!l) { matchesLief = true; } 
                else {
                    if (a.suppliers && Array.isArray(a.suppliers)) { matchesLief = a.suppliers.some(s => s && typeof s === 'string' && s.trim().toLowerCase() === l); } 
                    else if (a.lief) { matchesLief = (a.lief.trim().toLowerCase() === l); }
                    if (!matchesLief && a.name && a.name.toLowerCase().includes(l)) { matchesLief = true; }
                }
                
                if (matchesLief) {
                    const isExport = artikelMarktTyp(a.fertigNr, a.name, artikelMarkt) === 'export';
                    
                    let matchesTypeFilter = true;
                    if (activeSorteFilter === 'uns' && isExport) matchesTypeFilter = false;
                    if (activeSorteFilter === 'exp' && !isExport) matchesTypeFilter = false;

                    if (matchesTypeFilter) {
                        let disp = (a.nr || '') + " - " + (a.name || ''); 
                        if (gs1Data) {
                            if (a.nr === gs1Data.ean || a.nr === gs1Data.gtin || disp.toLowerCase().includes(gs1Data.ean)) { matchingArticles.push(a); }
                        } else if (disp.toLowerCase().includes(q)) { matchingArticles.push(a); }
                    }
                }
            });

            html = matchingArticles.map(a => {
                let dispName = (a.nr || '') + " - " + (a.name || '');
                let loseName = "";
                if(a.nr) {
                    let foundLose = loseList.find(loseArt => loseArt.fertigNr === a.nr);
                    if(foundLose && foundLose.name) { loseName = ` | ${foundLose.name}`; }
                }
                let subText = a.nr ? `<br><small style="color:#777; font-size:11px; font-weight:normal;">📦 Rohware: ${a.nr}${loseName}</small>` : '';
                return `<div class="result-item" style="font-weight:bold; line-height:1.4;" onclick="selectResult('${dispName.replace(/'/g, "\\'")}')">${dispName}${subText}</div>`;
            }).join('');
            
        } else if(currentSearchType === 'sonder-tpl' || currentSearchType === 'sonder-tpl-sort') {
            let res = [];
            const sonderFilterVal = document.getElementById('modal-sonder-lief-filter') ? document.getElementById('modal-sonder-lief-filter').value : 'ALL';
            
            let filteredTemplates = sonderTemplates.filter(t => {
                if (sonderFilterVal === 'ALL') return true;
                if (sonderFilterVal === 'GLOBAL') return (!t.lief || t.lief.trim() === "");
                return t.lief === sonderFilterVal || !t.lief || t.lief.trim() === "";
            });
            if (gs1Data) { res = filteredTemplates.filter(t => t.ean === gs1Data.gtin || t.ean === gs1Data.ean); } 
            else { res = filteredTemplates.filter(t => t.name.toLowerCase().includes(q) || (t.ean && t.ean.includes(q)) || (t.lief && t.lief.toLowerCase().includes(q))); }
            
            html = res.map(t => {
                let mhdParam = gs1Data && gs1Data.mhd ? `'${gs1Data.mhd}'` : 'null';
                let liefStr = t.lief ? ` | Von: ${t.lief}` : '';
                return `<div class="result-item" style="display:flex; justify-content:space-between; align-items:center;" onclick="selectResult('${t.id}', ${mhdParam})"><div><b style="color:var(--primary);">${t.name}</b> <br><small style="color:#777;">EAN: ${t.ean || '-'}${liefStr}</small></div><div onclick="deleteSonderTemplate(event, '${t.id}')" style="color:var(--danger); font-size:20px; padding:10px;">🗑️</div></div>`;
            }).join('');
            
        } else {
            const rDb = AppStorage.get('kombi_rechner_db', {});
            const produkte = Array.isArray(rDb.savedProdukteRaw) ? rDb.savedProdukteRaw : [];
            let res = [];
            if (gs1Data) { res = produkte.filter(p => p.includes(gs1Data.gtin) || p.includes(gs1Data.ean)); }
            else { res = produkte.filter(p => p.toLowerCase().includes(q)); }
            res.sort((a, b) => {
                const na = parseInt((a.match(/^\[(\d+)\]/) || [])[1] ?? 'Infinity');
                const nb = parseInt((b.match(/^\[(\d+)\]/) || [])[1] ?? 'Infinity');
                return na - nb;
            });
            html = res.map(p => `<div class="result-item" onclick="selectResult('${p.replace(/'/g, "\\'")}')">${p}</div>`).join('');
        }
        document.getElementById('modal-results').innerHTML = html || '<div style="padding:20px; color:#999;">Nichts gefunden...</div>';
        updateSearchModalViewport();
    } catch(e) { console.error("Fehler in filterResults", e); }
}

function deleteSonderTemplate(e, id) {
    e.stopPropagation();
    if(confirm("Vorlage wirklich löschen?")) { sonderTemplates = sonderTemplates.filter(t => t.id !== id); saveRechnerDB(); filterResults(); }
}

// ======================= APP / UI LOGIK =======================

function selectResult(val, mhd = null) {
    if(currentSearchType === 'sorte') { selectedSorte = val; document.getElementById('selected-sorte-display').innerText = val; document.getElementById('selected-sorte-display').style.background = "#e3f2fd"; }
    else if(currentSearchType === 'sonder-tpl' || currentSearchType === 'sonder-tpl-sort') {
        const tpl = sonderTemplates.find(t => t.id === val);
        if(tpl) {
            let suffix = currentSearchType === 'sonder-tpl-sort' ? '-sort' : '';
            document.getElementById('selected-sonder-tpl' + suffix).innerText = tpl.name;
            document.getElementById('selected-sonder-tpl' + suffix).style.background = "#fff3e0";
            document.getElementById('s-reihe' + suffix).value = tpl.s_reihe || "";
            document.getElementById('s-reihen' + suffix).value = tpl.s_reihen || "";
            document.getElementById('s-krtlage' + suffix).value = tpl.s_krtlage || "";
            document.getElementById('s-lagen' + suffix).value = tpl.s_lagen || "";
            document.getElementById('s-stk' + suffix).value = tpl.s_stk || "";
            document.getElementById('s-kg' + suffix).value = tpl.s_kg || "";
            document.getElementById('s-stke2' + suffix).value = tpl.s_stke2 || "";
            const herkunftInput = document.getElementById('s-herkunft' + suffix); if(herkunftInput && tpl.lief) herkunftInput.value = tpl.lief;
            if(suffix === '-sort') calcSonderSort(); else calcSonder();
            
            if (mhd) {
                const mhdInput = document.getElementById('s-mhd' + suffix);
                if(mhdInput) { mhdInput.value = mhd; showToast(`MHD ${mhd} übernommen!`, "success"); }
            }
        }
    }
    else { selectedNoelke = val; document.getElementById('selected-noelke-display').innerText = val; document.getElementById('selected-noelke-display').style.background = "#e8f5e9"; }
    closeSearchModal();
}

function openSonderTplModal(empty = false) {
    document.getElementById('search-modal').style.display = 'none';
    let suffix = (typeof isSonderModeSort !== 'undefined' && isSonderModeSort) ? '-sort' : '';
    
    let liefSelect = document.getElementById('tpl-lief');
    if(liefSelect) {
        const lDb = AppStorage.get('kombi_logistik_db', {}); const sups = lDb.suppliers || [];
        liefSelect.innerHTML = '<option value="">🌐 Für alle (Global)</option>' + sups.sort().map(s => `<option value="${s}">${s}</option>`).join('');
    }
    
    if(empty) {
        ['tpl-name','tpl-ean','tpl-lief','tpl-reihe','tpl-reihen','tpl-krtlage','tpl-lagen','tpl-stke2','tpl-stk','tpl-kg'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
        if(document.getElementById('tpl-variabel')) document.getElementById('tpl-variabel').checked = false;
            
        const searchInput = document.getElementById('modal-search-input');
        if (searchInput && searchInput.value) {
            const tplEan = document.getElementById('tpl-ean');
            if (tplEan) { tplEan.value = searchInput.value; searchInput.value = ''; setTimeout(() => tplEan.dispatchEvent(new Event('input')), 100); }
        }
    } else {
        document.getElementById('tpl-name').value = ''; document.getElementById('tpl-ean').value = '';
        let currentHerkunft = document.getElementById('s-herkunft' + suffix);
        if(document.getElementById('tpl-lief')) document.getElementById('tpl-lief').value = currentHerkunft ? currentHerkunft.value : '';
        document.getElementById('tpl-reihe').value = document.getElementById('s-reihe' + suffix).value;
        document.getElementById('tpl-reihen').value = document.getElementById('s-reihen' + suffix).value;
        document.getElementById('tpl-krtlage').value = document.getElementById('s-krtlage' + suffix).value;
        document.getElementById('tpl-lagen').value = document.getElementById('s-lagen' + suffix).value;
        document.getElementById('tpl-stk').value = document.getElementById('s-stk' + suffix).value;
        document.getElementById('tpl-kg').value = document.getElementById('s-kg' + suffix).value;
        document.getElementById('tpl-stke2').value = document.getElementById('s-stke2' + suffix).value;
        if(document.getElementById('tpl-variabel')) document.getElementById('tpl-variabel').checked = false;
    }
    document.getElementById('sonder-tpl-modal').style.display = 'flex';
}

function saveSonderTplFromModal() {
    const name = document.getElementById('tpl-name').value.trim(); const ean = document.getElementById('tpl-ean').value.trim(); const lief = document.getElementById('tpl-lief') ? document.getElementById('tpl-lief').value.trim() : '';
    const s_reihe = document.getElementById('tpl-reihe').value; const s_reihen = document.getElementById('tpl-reihen').value; const s_lagen = document.getElementById('tpl-lagen').value;
    const s_krtlage = document.getElementById('tpl-krtlage').value;
    const s_stk = document.getElementById('tpl-stk').value; const s_kg = document.getElementById('tpl-kg').value; const s_stke2 = document.getElementById('tpl-stke2').value;
    
    if(!name) { showToast("Bitte einen Namen vergeben!", "warning"); return; }
    
    const isVariabel = document.getElementById('tpl-variabel') && document.getElementById('tpl-variabel').checked;
    if(!isVariabel) {
        if(!s_kg) { showToast("Bitte kg/Stück ausfüllen!", "warning"); return; }
        if(!s_stk && !s_stke2) { showToast("Bitte entweder Stk/Krt oder Stk/E2 ausfüllen!", "warning"); return; }
    }
    
    const tpl = { id: Date.now().toString(), name, ean, lief, s_reihe, s_reihen, s_krtlage, s_lagen, s_stk, s_kg, s_stke2 };
    sonderTemplates.push(tpl); saveRechnerDB();
    document.getElementById('sonder-tpl-modal').style.display = 'none';
    
    let suffix = (typeof isSonderModeSort !== 'undefined' && isSonderModeSort) ? '-sort' : '';
    document.getElementById('s-reihe' + suffix).value = s_reihe; document.getElementById('s-reihen' + suffix).value = s_reihen; document.getElementById('s-krtlage' + suffix).value = s_krtlage; document.getElementById('s-lagen' + suffix).value = s_lagen;
    document.getElementById('s-stk' + suffix).value = s_stk; document.getElementById('s-kg' + suffix).value = s_kg; document.getElementById('s-stke2' + suffix).value = s_stke2;
    const herkunftInput = document.getElementById('s-herkunft' + suffix); if(herkunftInput && tpl.lief) herkunftInput.value = tpl.lief;
    if(suffix === '-sort') calcSonderSort(); else calcSonder();
    
    document.getElementById('selected-sonder-tpl' + suffix).innerText = name;
    document.getElementById('selected-sonder-tpl' + suffix).style.background = "#fff3e0";
    showToast("Vorlage gespeichert!", "success");
}

function resetSorteSelection() {
    selectedSorte = "";
    const disp = document.getElementById('selected-sorte-display');
    if (disp) { disp.innerText = "Bitte Sorte wählen..."; disp.style.background = "#fff"; }
}
function toggleSonderMode() { isSonderMode = !isSonderMode; document.getElementById('sonder-box').style.display = isSonderMode ? 'block' : 'none'; }
function toggleSonderModeSort() { 
    isSonderModeSort = !isSonderModeSort; 
    document.getElementById('sonder-box-sort').style.display = isSonderModeSort ? 'block' : 'none'; 
    document.getElementById('normal-box-sort').style.display = isSonderModeSort ? 'none' : 'block';
}

function calcSonder() {
    const r = parseFloat(document.getElementById('s-reihe').value)||0, rh = parseFloat(document.getElementById('s-reihen').value)||0, kl = parseFloat(document.getElementById('s-krtlage').value)||0, l = parseFloat(document.getElementById('s-lagen').value)||0, e = parseFloat(document.getElementById('s-einzel').value)||0, sk = parseFloat(document.getElementById('s-stk').value)||0, g = parseFloat(document.getElementById('s-kg').value)||0, ek = parseFloat(document.getElementById('s-e2kisten').value)||0, se2 = parseFloat(document.getElementById('s-stke2').value)||0;
    const brutto = document.getElementById('s-brutto') ? (parseFloat(document.getElementById('s-brutto').value.replace(',','.'))||0) : 0;
    let kartonsProLage = kl > 0 ? kl : (r * (rh > 0 ? rh : 1));
    let kTotal = (kartonsProLage * (l > 0 ? l : 1)) + e; let stkTotal = (kTotal * sk) + (ek * se2);
    
    let primaryLgWeight = 2;
    try { const config = getLeergutConfig(); if (config.length > 0) primaryLgWeight = config[0].weight; } catch(err){}
    
    if (brutto > 0) { document.getElementById('s-res').value = (brutto - (ek * primaryLgWeight)).toFixed(2).replace('.',',') + " kg"; }
    else { document.getElementById('s-res').value = (stkTotal * g).toFixed(2).replace('.',',') + " kg"; }
}

function calcSonderSort() {
    const r = parseFloat(document.getElementById('s-reihe-sort').value)||0, rh = parseFloat(document.getElementById('s-reihen-sort').value)||0, kl = parseFloat(document.getElementById('s-krtlage-sort').value)||0, l = parseFloat(document.getElementById('s-lagen-sort').value)||0, e = parseFloat(document.getElementById('s-einzel-sort').value)||0, sk = parseFloat(document.getElementById('s-stk-sort').value)||0, g = parseFloat(document.getElementById('s-kg-sort').value)||0, ek = parseFloat(document.getElementById('s-e2kisten-sort').value)||0, se2 = parseFloat(document.getElementById('s-stke2-sort').value)||0;
    const brutto = document.getElementById('s-brutto-sort') ? (parseFloat(document.getElementById('s-brutto-sort').value.replace(',','.'))||0) : 0;
    let kartonsProLage = kl > 0 ? kl : (r * (rh > 0 ? rh : 1));
    let kTotal = (kartonsProLage * (l > 0 ? l : 1)) + e; let stkTotal = (kTotal * sk) + (ek * se2);
    
    let primaryLgWeight = 2;
    try { const config = getLeergutConfig(); if (config.length > 0) primaryLgWeight = config[0].weight; } catch(err){}
    
    if (brutto > 0) { document.getElementById('s-res-sort').value = (brutto - (ek * primaryLgWeight)).toFixed(2).replace('.',',') + " kg"; }
    else { document.getElementById('s-res-sort').value = (stkTotal * g).toFixed(2).replace('.',',') + " kg"; }
}

function addPal() {
    const lief = document.getElementById('lief').value;
    const lineWrap = document.getElementById('lkw-supplier-line-wrap');
    const lineEl = document.getElementById('lkw-supplier-line');
    const line = (lineWrap && lineWrap.style.display !== 'none' && lineEl && lineEl.value) ? lineEl.value : '';
    let p = { id: Date.now().toString(), lief, type: isSonderMode?'sonder':'normal' };
    if (line) p.line = line;
    if(isSonderMode) {
        const r = parseFloat(document.getElementById('s-reihe').value)||0, rh = parseFloat(document.getElementById('s-reihen').value)||0, kl = parseFloat(document.getElementById('s-krtlage').value)||0, l = parseFloat(document.getElementById('s-lagen').value)||0, e = parseFloat(document.getElementById('s-einzel').value)||0;
        const ek = parseInt(document.getElementById('s-e2kisten').value)||0;
        p.netto = parseFloat(document.getElementById('s-res').value.replace(',','.')); let kartonsProLage = kl > 0 ? kl : (r * (rh > 0 ? rh : 1)); p.kart = (kartonsProLage * (l > 0 ? l : 1)) + e; 
        p.mhd = document.getElementById('s-mhd').value; p.herkunft = document.getElementById('s-herkunft') ? document.getElementById('s-herkunft').value : ""; p.e2 = ek;
        let leergutData = {}; if(ek > 0) { try { const config = getLeergutConfig(); let primaryLgName = config.length > 0 ? config[0].name : "E2"; leergutData[primaryLgName] = ek; } catch(err) { leergutData['E2'] = ek; } }
        p.leergut = leergutData;
        toggleSonderMode();
        ["s-brutto","s-reihe","s-reihen","s-krtlage","s-lagen","s-einzel","s-e2kisten","s-stke2","s-stk","s-kg","s-res","s-mhd","s-herkunft"].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ""; });
        document.getElementById('selected-sonder-tpl').innerText = "Vorlage wählen / scannen...";
        document.getElementById('selected-sonder-tpl').style.background = "#fff";
    } else {
        let b = parseFloat(document.getElementById('bru').value)||0;
        let leergutData = {}; let tare = 0; let detailsArr = [];
        const config = getLeergutConfig();
        const cb = document.getElementById('no-pal-cb-lkw');
        const isNoPal = cb ? cb.checked : false;
        config.forEach(lg => {
            let count = parseInt(document.getElementById('lkw_' + lg.id).value)||0;
            if(count > 0) { leergutData[lg.name] = count; tare += count * lg.weight; detailsArr.push(`${count} ${lg.name}`); }
            let isPal = lg.weight >= 15 && lg.weight <= 25;
            let defaultVal = (isPal && !isNoPal && lg.name.toUpperCase().includes('H1')) ? '1' : '';
            const el = document.getElementById('lkw_' + lg.id);
            if(el) el.value = defaultVal;
        });
    p.netto = parseFloat((b - tare).toFixed(2)); p.leergut = leergutData;
        p.details = `${b}kg Brutto` + (detailsArr.length ? ` | ${detailsArr.join(', ')}` : '');
        document.getElementById('bru').value = ""; 
    }
    entries.push(p); saveRechnerDB(); renderLKW();
}

function deleteLkwEntry(index) {
    if(confirm("Diesen Eintrag wirklich löschen?")) { entries.splice(index, 1); saveRechnerDB(); renderLKW(); showToast('Gelöscht', 'success'); }
}

function renderLKW() {
    let stats = {}, tKart=0;
    const config = getLeergutConfig();
    let totals = {}; config.forEach(lg => totals[lg.name] = 0);
    
    entries.forEach(e => { 
        if(!stats[e.lief]) stats[e.lief] = {n:0, kart:0, leergut:{}};
        stats[e.lief].n += e.netto; stats[e.lief].kart += (e.kart||0); tKart+=(e.kart||0);
        
        let lgMap = e.leergut || {};
        if(e.e2) lgMap['E2'] = (lgMap['E2']||0) + e.e2;
        if(e.he) lgMap['Herta'] = (lgMap['Herta']||0) + e.he;
        if(e.h1) lgMap['H1'] = (lgMap['H1']||0) + e.h1;
        if(e.eu) lgMap['Euro'] = (lgMap['Euro']||0) + e.eu;
        
        for(let key in lgMap) {
            stats[e.lief].leergut[key] = (stats[e.lief].leergut[key]||0) + lgMap[key];
            totals[key] = (totals[key]||0) + lgMap[key];
        }
    });
    
    let html = '<div class="summary-card"><div class="summary-title">Lieferanten-Übersicht</div><p style="font-size:11px; color:#666; margin:-4px 0 8px;">Antippen für Warenlinien-Details</p>';
    for(let l in stats) {
        let info = []; 
        for(let key in stats[l].leergut) { if(stats[l].leergut[key] > 0) info.push(`${stats[l].leergut[key]} ${key}`); }
        if(stats[l].kart) info.push(stats[l].kart+' Krt');
        const safeL = l.replace(/'/g, "\\'");
        html += `<div class="sup-item-box" style="cursor:pointer;" onclick="openSupplierLkwDetail('${safeL}')" title="Warenlinien anzeigen">
            <span><b>${l}</b></span> 
            <span class="sup-leergut-inline">${info.join(', ')}</span> 
            <div style="display:flex; align-items:center; gap:5px;">
                <span class="sup-weight-tag">${stats[l].n.toFixed(2).replace('.',',')} kg</span>
                <button onclick="event.stopPropagation(); openReklamationModal('${safeL}', ${stats[l].n})" style="background:#ffc107; color:black; border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer;" title="Reklamation erfassen">❗</button>
            </div>
        </div>`;
    }
    html += '</div>';
    let gridHtml = ''; for(let key in totals) { if(totals[key] > 0 || config.some(c => c.name === key)) gridHtml += `<span>${key}: ${totals[key]}</span>`; }
    html += `<div class="leergut-card"><div class="leergut-title">Gesamt-Überblick LKW</div><div class="leergut-grid">${gridHtml}<span style="color:var(--sonder)">Kartons: ${tKart}</span></div></div>`;
    document.getElementById('list').innerHTML = html + entries.map((e,i) => {
        let details = e.type==='sonder' ? `Sonderp. | MHD: ${e.mhd||'-'} | Von: ${e.herkunft||'-'}${e.e2 ? ` | ${e.e2} E2` : ''}` : e.details;
        return `<div class="swipe-wrap" style="margin: 0 10px 8px 10px;"><div class="swipe-bg" onclick="deleteLkwEntry(${i})"><span>🗑️</span></div><div class="palette-card swipeable" onclick="openEditLKW(${i})" style="margin: 0;"><div style="flex:1"><b>${e.type==='sonder'?'📦 ':''}${lkwEntryLabel(e)}</b><div class="entry-sub"> ${details}</div></div><div style="display:flex; align-items:center; gap:10px;"><span style="font-weight:bold;">${e.netto.toFixed(2).replace('.',',')} kg</span></div></div></div>`;
    }).reverse().join('');
}

function addSort() {
    if(isSonderModeSort) {
        const r = parseFloat(document.getElementById('s-reihe-sort').value)||0, rh = parseFloat(document.getElementById('s-reihen-sort').value)||0, kl = parseFloat(document.getElementById('s-krtlage-sort').value)||0, l = parseFloat(document.getElementById('s-lagen-sort').value)||0, e = parseFloat(document.getElementById('s-einzel-sort').value)||0;
        const ek = parseInt(document.getElementById('s-e2kisten-sort').value)||0;
        const netto = parseFloat(document.getElementById('s-res-sort').value.replace(',','.')); let kartonsProLage = kl > 0 ? kl : (r * (rh > 0 ? rh : 1)); 
        let kart = (kartonsProLage * (l > 0 ? l : 1)) + e; let mhd = document.getElementById('s-mhd-sort').value; let herkunft = document.getElementById('s-herkunft-sort') ? document.getElementById('s-herkunft-sort').value : "";
        let leergutData = {}; if(ek > 0) { try { const config = getLeergutConfig(); let primaryLgName = config.length > 0 ? config[0].name : "E2"; leergutData[primaryLgName] = ek; } catch(err) { leergutData['E2'] = ek; } }
        let sorteName = document.getElementById('selected-sonder-tpl-sort').innerText; if(sorteName === "Vorlage wählen / scannen...") sorteName = "Sonderposten";
        
        entriesSort.push({ id: Date.now().toString(), lief: document.getElementById('lief-sort').value, sorte: sorteName, netto: netto, leergut: leergutData, e2: ek, kart: kart, mhd: mhd, herkunft: herkunft, type: 'sonder' });
        
        toggleSonderModeSort();
        ["s-brutto-sort","s-reihe-sort","s-reihen-sort","s-krtlage-sort","s-lagen-sort","s-einzel-sort","s-e2kisten-sort","s-stke2-sort","s-stk-sort","s-kg-sort","s-res-sort","s-mhd-sort","s-herkunft-sort"].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ""; });
        document.getElementById('selected-sonder-tpl-sort').innerText = "Vorlage wählen / scannen..."; document.getElementById('selected-sonder-tpl-sort').style.background = "#fff";
        saveRechnerDB(); renderSort();
        return;
    }

    if(!selectedSorte) return;
    let b = parseFloat(document.getElementById('bru-sort').value)||0;
    let leergutData = {}; let tare = 0;
    const config = getLeergutConfig();
    const cb = document.getElementById('no-pal-cb-sort');
    const isNoPal = cb ? cb.checked : false;
    config.forEach(lg => {
        let count = parseInt(document.getElementById('sort_' + lg.id).value)||0;
        if(count > 0) { leergutData[lg.name] = count; tare += count * lg.weight; }
        let isPal = lg.weight >= 15 && lg.weight <= 25;
            let defaultVal = (isPal && !isNoPal && lg.name.toUpperCase().includes('H1')) ? '1' : '';
        const el = document.getElementById('sort_' + lg.id);
        if (el) el.value = defaultVal;
    });
    
    let netto = parseFloat((b - tare).toFixed(2));
    entriesSort.push({ id: Date.now().toString(), lief: document.getElementById('lief-sort').value, sorte: selectedSorte, netto, leergut: leergutData });
    saveRechnerDB(); renderSort();
    document.getElementById("bru-sort").value = "";
    resetSorteSelection();
}

function updateControlCenter() {
    try {
        let palStats = document.getElementById('stat-pal');
        if (palStats) {
            let controlCenterWindow = palStats.closest('.control-center') || palStats.parentElement.parentElement;
            if (controlCenterWindow) {
                controlCenterWindow.style.display = 'none';
            }
        }
    } catch(e) { console.error("Fehler im updateControlCenter", e); }
}

function renderSort() { 
    try {
        updateControlCenter(); 
        let listContainer = document.getElementById('list-sort');
        if (!listContainer || typeof entriesSort === 'undefined') return;

        listContainer.innerHTML = entriesSort.map((e,i) => {
            let lgMap = e.leergut || {};
            if(e.e2) lgMap['E2'] = (lgMap['E2']||0) + e.e2;
            if(e.he) lgMap['Herta'] = (lgMap['Herta']||0) + e.he;
            if(e.h1) lgMap['H1'] = (lgMap['H1']||0) + e.h1;
            if(e.eu) lgMap['Euro'] = (lgMap['Euro']||0) + e.eu;

            let tare = 0; let infoArr = [];
            const config = getLeergutConfig();
            for(let key in lgMap) {
                let conf = config.find(c => c.name === key);
                let w = conf ? conf.weight : (key==='E2'?2: key==='Herta'?2.5: key==='H1'?18: key==='Euro'?21: 0);
                tare += lgMap[key] * w;
                if(lgMap[key] > 0) infoArr.push(`${lgMap[key]} ${key}`);
            }
            
            let brutto = e.netto + tare;
            let infoStr = infoArr.length > 0 ? infoArr.join(', ') : 'Ohne Leergut';
            if(e.type === 'sonder') infoStr = `Sonderp. | MHD: ${e.mhd||'-'} | Von: ${e.herkunft||'-'}${e.e2 ? ` | ${e.e2} E2` : ''}`;
            
            return `<div class="swipe-wrap" style="margin: 0 10px 8px 10px;">
                <div class="swipe-bg" onclick="deleteSortEntry(${i})"><span>🗑️</span></div>
                <div class="palette-card swipeable" style="border-left-color:var(--accent); margin: 0;" onclick="openEditSort(${i})">
                    <div style="flex:1">
                        <b style="font-size: 15px;">${e.type==='sonder'?'📦 ':''}${e.sorte}</b>
                        <div class="entry-sub" style="font-size:11px; margin-top:4px;">Brutto: ${brutto.toFixed(2).replace('.',',')} kg &nbsp;|&nbsp; ${infoStr}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-weight:bold; font-size:16px;">${e.netto.toFixed(2).replace('.',',')} kg</span>
                    </div>
                </div>
            </div>`;
        }).reverse().join(''); 
    } catch(e) { console.error("Fehler in renderSort", e); }
}

function deleteSortEntry(index) {
    if(confirm("Eintrag löschen?")) { entriesSort.splice(index, 1); saveRechnerDB(); renderSort(); showToast('Gelöscht', 'success'); }
}

function addNoelkeLocal() {
    if(!selectedNoelke) { showToast("Bitte erst ein Produkt wählen!", "warning"); return; }
    let boxCountInput = parseInt(document.getElementById('n-e2').value);
    let boxCount = (isNaN(boxCountInput) || boxCountInput <= 0) ? 1 : boxCountInput; 
    let mhd = document.getElementById('n-mhd').value || "-";
    let bruttoKg = parseFloat(document.getElementById('n-kg').value.replace(',','.')) || 0;
    
    let primaryLgWeight = 2;
    try { const config = getLeergutConfig(); if (config.length > 0) primaryLgWeight = config[0].weight; } catch(err){}
    
    let nettoKg = parseFloat((bruttoKg - (boxCount * primaryLgWeight)).toFixed(2));
    const charge = document.getElementById('n-charge') ? document.getElementById('n-charge').value.trim() : "";
    
    entriesNoelke.push({ id: Date.now().toString(), prod: selectedNoelke, e2: boxCount, mhd: mhd, kg: nettoKg, charge: charge });
    saveRechnerDB(); renderNoelke();
    
    selectedNoelke = ""; document.getElementById('selected-noelke-display').innerText = "Produkt suchen..."; document.getElementById('selected-noelke-display').style.background = "#fff";
    ["n-e2","n-mhd","n-kg"].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ""; });
    showToast("Erfolgreich gespeichert!", "success");
}

function renderNoelke() { 
    const listEl = document.getElementById('list-noelke');
    if (!listEl) return;

    if (!entriesNoelke.length) {
        listEl.innerHTML = '<div class="noelke-empty-hint" style="text-align:center;padding:24px 16px;color:#666;font-size:13px;line-height:1.5;">Noch keine Einträge in der Liste.<br><span style="font-size:12px;color:#888;">Produkt wählen → „+ Speichern“ – dann erscheint links das Häkchen für Zebra-Etiketten.</span></div>';
        return;
    }

    let einheit = "E2";
    const config = getLeergutConfig();
    if(config.length > 0) einheit = config[0].name;

    listEl.innerHTML = entriesNoelke.map((e,i) => `
    <div class="swipe-wrap" style="margin: 0 10px 8px 10px;">
        <div class="swipe-bg" onclick="deleteNoelkeEntry(${i})"><span>🗑️</span></div>
        <div class="palette-card swipeable" style="border-left-color:#137333; margin: 0; display:flex; align-items:center; gap:12px; padding: 10px 15px;">
            <label class="noelke-cb-wrap" onclick="event.stopPropagation()" aria-label="Für Etikettendruck auswählen">
                <input type="checkbox" class="print-noelke-cb" data-index="${i}">
            </label>
            <div style="flex:1" onclick="openEditNoelke(${i})">
                <b style="font-size:14px;">${e.prod}</b>
                <div class="entry-sub" style="font-size:11px; margin-top:3px;">${e.e2} ${einheit} &nbsp;|&nbsp; MHD: ${e.mhd}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;" onclick="openEditNoelke(${i})">
                <span style="font-weight:bold; font-size:15px;">${e.kg.toFixed(2).replace('.',',')} kg</span>
            </div>
        </div>
    </div>`).reverse().join(''); 
}

function deleteNoelkeEntry(index) {
    if(confirm("Eintrag löschen?")) { entriesNoelke.splice(index, 1); saveRechnerDB(); renderNoelke(); showToast('Gelöscht', 'success'); }
}

function openEditLKW(i) {
    try {
        const e = entries[i]; document.getElementById('edit-index').value = i; document.getElementById('edit-type').value = 'lkw'; 
        document.getElementById('edit-lief-container').style.display = 'block'; document.getElementById('edit-lief').value = e.lief; document.getElementById('edit-sorte-container').style.display = 'none';
        if(e.type === 'sonder') { 
            document.getElementById('edit-normal-fields').style.display = 'none'; document.getElementById('edit-sonder-fields').style.display = 'block'; document.getElementById('edit-noelke-fields').style.display = 'none'; 
            document.getElementById('edit-sonder-netto').value = e.netto.toFixed(2); document.getElementById('edit-sonder-mhd').value = e.mhd || ''; document.getElementById('edit-sonder-herkunft').value = e.herkunft || '';
            document.getElementById('edit-sonder-e2').value = e.e2 || 0;
        } else { 
            document.getElementById('edit-normal-fields').style.display = 'block'; document.getElementById('edit-sonder-fields').style.display = 'none'; document.getElementById('edit-noelke-fields').style.display = 'none'; 
            
            const config = getLeergutConfig();
            config.forEach(lg => { let el = document.getElementById('edit_' + lg.id); if(el) el.value = ''; });
            
            let lgMap = e.leergut || {};
            if(e.e2) lgMap['E2'] = (lgMap['E2']||0) + e.e2; if(e.he) lgMap['Herta'] = (lgMap['Herta']||0) + e.he;
            if(e.h1) lgMap['H1'] = (lgMap['H1']||0) + e.h1; if(e.eu) lgMap['Euro'] = (lgMap['Euro']||0) + e.eu;
            
            let tare = 0;
            for(let key in lgMap) {
                let conf = config.find(c => c.name === key);
                if(conf) { let el = document.getElementById('edit_' + conf.id); if(el) el.value = lgMap[key] || ''; tare += lgMap[key] * conf.weight; } 
                else { let w = (key==='E2'?2: key==='Herta'?2.5: key==='H1'?18: key==='Euro'?21: 0); tare += lgMap[key] * w; }
            }
            
            let bru = e.netto + tare; 
            document.getElementById('edit-bru').value = bru.toFixed(2); 
        }
        document.getElementById('edit-modal').style.display = 'flex';
    } catch(e) { console.error("Fehler in openEditLKW", e); }
}

function openEditSort(i) {
    try {
        const e = entriesSort[i]; document.getElementById('edit-index').value = i; document.getElementById('edit-type').value = 'sort'; 
        document.getElementById('edit-lief-container').style.display = 'block'; document.getElementById('edit-lief').value = e.lief; document.getElementById('edit-sorte-container').style.display = 'block'; 
        populateEditSorteDropdown(e.lief, e.sorte, 'sort');
        if(e.type === 'sonder') {
            document.getElementById('edit-normal-fields').style.display = 'none'; document.getElementById('edit-sonder-fields').style.display = 'block'; document.getElementById('edit-noelke-fields').style.display = 'none'; 
            document.getElementById('edit-sonder-netto').value = e.netto.toFixed(2); document.getElementById('edit-sonder-mhd').value = e.mhd || ''; document.getElementById('edit-sonder-herkunft').value = e.herkunft || '';
            document.getElementById('edit-sonder-e2').value = e.e2 || 0;
        } else {
            document.getElementById('edit-normal-fields').style.display = 'block'; document.getElementById('edit-sonder-fields').style.display = 'none'; document.getElementById('edit-noelke-fields').style.display = 'none'; 
            
            const config = getLeergutConfig();
            config.forEach(lg => { let el = document.getElementById('edit_' + lg.id); if(el) el.value = ''; });
            
            let lgMap = e.leergut || {};
            if(e.e2) lgMap['E2'] = (lgMap['E2']||0) + e.e2; if(e.he) lgMap['Herta'] = (lgMap['Herta']||0) + e.he;
            if(e.h1) lgMap['H1'] = (lgMap['H1']||0) + e.h1; if(e.eu) lgMap['Euro'] = (lgMap['Euro']||0) + e.eu;
            
            let tare = 0;
            for(let key in lgMap) {
                let conf = config.find(c => c.name === key);
                if(conf) { let el = document.getElementById('edit_' + conf.id); if(el) el.value = lgMap[key] || ''; tare += lgMap[key] * conf.weight; } 
                else { let w = (key==='E2'?2: key==='Herta'?2.5: key==='H1'?18: key==='Euro'?21: 0); tare += lgMap[key] * w; }
            }
            
            let bru = e.netto + tare; 
            document.getElementById('edit-bru').value = bru.toFixed(2); 
        }
        document.getElementById('edit-modal').style.display = 'flex';
    } catch(e) { console.error("Fehler in openEditSort", e); }
}

function openEditNoelke(i) {
    try {
        const e = entriesNoelke[i]; document.getElementById('edit-index').value = i; document.getElementById('edit-type').value = 'noelke'; 
        document.getElementById('edit-lief-container').style.display = 'none'; document.getElementById('edit-sorte-container').style.display = 'block'; 
        populateEditSorteDropdown(null, e.prod, 'noelke');
        document.getElementById('edit-normal-fields').style.display = 'none'; document.getElementById('edit-sonder-fields').style.display = 'none'; document.getElementById('edit-noelke-fields').style.display = 'block';
        document.getElementById('edit-n-e2').value = e.e2 || 0; document.getElementById('edit-n-mhd').value = e.mhd || '';
        
        let primaryLgWeight = 2;
        try { const config = getLeergutConfig(); if (config.length > 0) primaryLgWeight = config[0].weight; } catch(err){}
        let brutto = e.kg + ((e.e2 || 0) * primaryLgWeight); document.getElementById('edit-n-kg').value = brutto.toFixed(2); 
        document.getElementById('edit-modal').style.display = 'flex';
    } catch(e) { console.error("Fehler in openEditNoelke", e); }
}

function populateEditSorteDropdown(lief, currentValue, type) {
    const selectEl = document.getElementById('edit-sorte');
    if (!selectEl) return;
    let options = [];

    if (type === 'sort') {
        const lDb = AppStorage.get('kombi_logistik_db', {});
        const articles = Array.isArray(lDb.articles) ? lDb.articles : [];
        let l = lief ? lief.trim().toLowerCase() : "";

        articles.forEach(a => {
            let matchesLief = false;
            if (!l) matchesLief = true;
            else {
                if (a.suppliers && Array.isArray(a.suppliers)) { matchesLief = a.suppliers.some(s => s && typeof s === 'string' && s.trim().toLowerCase() === l); }
                else if (a.lief) { matchesLief = (a.lief.trim().toLowerCase() === l); }
                if (!matchesLief && a.name && a.name.toLowerCase().includes(l)) { matchesLief = true; }
            }
            if (matchesLief) options.push((a.nr || '') + " - " + (a.name || ''));
        });
    } else if (type === 'noelke') {
        const rDb = AppStorage.get('kombi_rechner_db', {});
        options = Array.isArray(rDb.savedProdukteRaw) ? rDb.savedProdukteRaw : [];
    }

    if (currentValue && !options.includes(currentValue)) options.unshift(currentValue);
    options = [...new Set(options)].sort();
    selectEl.innerHTML = options.map(o => `<option value="${o.replace(/"/g, '&quot;')}">${o}</option>`).join('');
    selectEl.value = currentValue || "";
}

function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }

function saveEdit() {
    try {
        const i = parseInt(document.getElementById('edit-index').value); const type = document.getElementById('edit-type').value;
        const config = getLeergutConfig();
        
        if(type === 'lkw') {
            let e = entries[i]; e.lief = document.getElementById('edit-lief').value;
            if(e.type === 'sonder') { e.netto = parseFloat(document.getElementById('edit-sonder-netto').value.replace(',','.')); e.mhd = document.getElementById('edit-sonder-mhd').value; e.herkunft = document.getElementById('edit-sonder-herkunft').value; e.e2 = parseInt(document.getElementById('edit-sonder-e2').value)||0; } 
            else { 
                let b = parseFloat(document.getElementById('edit-bru').value)||0;
                let leergutData = {}; let tare = 0; let detailsArr = [];
                config.forEach(lg => {
                    let count = parseInt(document.getElementById('edit_' + lg.id).value)||0;
                    if(count > 0) { leergutData[lg.name] = count; tare += count * lg.weight; detailsArr.push(`${count} ${lg.name}`); }
                });
                e.netto = parseFloat((b - tare).toFixed(2)); e.leergut = leergutData; e.e2 = 0; e.he = 0; e.h1 = 0; e.eu = 0; 
                e.details = `${b}kg Brutto` + (detailsArr.length ? ` | ${detailsArr.join(', ')}` : '');
            }
            saveRechnerDB(); renderLKW();
        } else if(type === 'sort') {
            let e = entriesSort[i]; e.lief = document.getElementById('edit-lief').value; e.sorte = document.getElementById('edit-sorte').value;
            if(e.type === 'sonder') { e.netto = parseFloat(document.getElementById('edit-sonder-netto').value.replace(',','.')); e.mhd = document.getElementById('edit-sonder-mhd').value; e.herkunft = document.getElementById('edit-sonder-herkunft').value; e.e2 = parseInt(document.getElementById('edit-sonder-e2').value)||0; } 
            else { 
                let b = parseFloat(document.getElementById('edit-bru').value)||0;
                let leergutData = {}; let tare = 0;
                config.forEach(lg => { let count = parseInt(document.getElementById('edit_' + lg.id).value)||0; if(count > 0) { leergutData[lg.name] = count; tare += count * lg.weight; } });
                e.netto = parseFloat((b - tare).toFixed(2)); e.leergut = leergutData; e.e2 = 0; e.he = 0; e.h1 = 0; e.eu = 0; 
            }
            saveRechnerDB(); renderSort();
        } else if(type === 'noelke') {
            let e = entriesNoelke[i]; e.prod = document.getElementById('edit-sorte').value; e.e2 = parseInt(document.getElementById('edit-n-e2').value)||0; e.mhd = document.getElementById('edit-n-mhd').value; 
            let editBrutto = parseFloat(document.getElementById('edit-n-kg').value.replace(',','.'))||0; 
            let primaryLgWeight = config.length > 0 ? config[0].weight : 2;
            e.kg = parseFloat((editBrutto - (e.e2 * primaryLgWeight)).toFixed(2));
            saveRechnerDB(); renderNoelke();
        }
        closeEditModal();
    } catch(e) { console.error("Fehler in saveEdit", e); }
}

function fullReset() { customConfirm("LKW Liste löschen?", () => { entries = []; reklamationDrafts = {}; saveRechnerDB(); renderLKW(); showToast("LKW Liste geleert", "success"); }); }
function fullResetSort() { customConfirm("Sortierung löschen?", () => { entriesSort = []; neueSortierSitzung(); saveRechnerDB(); renderSort(); showToast("Sortierung geleert", "success"); }); }
function neueSortierSitzung() { const id = Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6); if (typeof AppStorage !== 'undefined') AppStorage.setRaw('sortier_sitzung_id', id); return id; }
function getSortierSitzungId() { const id = typeof AppStorage !== 'undefined' ? AppStorage.getRaw('sortier_sitzung_id') : null; if (id) return id; return neueSortierSitzung(); }
function fullResetNoelke() { 
    customConfirm("Nölke Eingaben & Liste löschen?", () => { 
        entriesNoelke = []; saveRechnerDB(); renderNoelke(); 
        ["n-e2","n-mhd","n-kg", "n-charge"].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ""; });
        showToast("Nölke Liste geleert", "success"); 
    }); 
}

function toggleCalc(s) {
    const el = document.getElementById('calc-modal');
    if (!el) return;
    el.style.display = s ? 'flex' : 'none';
    if (s) clearCalc();
}
function clearCalc() {
    const d = document.getElementById('c-disp');
    if (d) d.value = '0';
    calcResultShown = false;
}
function initCalc() {
    const btns = ['7','8','9','÷','4','5','6','×','1','2','3','-','0',',','+','='];
    const cont = document.getElementById('c-grid-btns');
    if (!cont || cont.dataset.init === '1') return;
    cont.dataset.init = '1';
    cont.innerHTML = '';
    btns.forEach(b => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = (isNaN(b) && b !== ',') ? 'c-btn c-op' : 'c-btn';
        if (b === '=') el.className = 'c-btn c-op c-eq';
        el.textContent = b;
        el.onclick = () => handleCalc(b);
        cont.appendChild(el);
    });
}
let calcResultShown = false;

function normalizeCalcExpr(raw) {
    return String(raw || '')
        .replace(/\u2212/g, '-')
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/,/g, '.')
        .replace(/\s+/g, '');
}

function formatCalcResult(num) {
    if (!Number.isFinite(num)) throw new Error('invalid');
    const rounded = Math.round(num * 1e10) / 1e10;
    let s = String(rounded);
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s.replace('.', ',');
}

function handleCalc(b) {
    const d = document.getElementById('c-disp');
    if (!d) return;

    if (b === 'C' || b === 'c') { clearCalc(); return; }

    if (b === '=') {
        try {
            let expr = normalizeCalcExpr(d.value);
            if (!expr || expr === '-' || expr === '+') { d.value = '0'; calcResultShown = true; return; }
            if (!/^[\d.+\-*/]+$/.test(expr)) throw new Error('invalid');
            const result = Function('"use strict";return (' + expr + ')')();
            d.value = formatCalcResult(result);
            calcResultShown = true;
        } catch (_) {
            d.value = 'Fehler';
            calcResultShown = true;
        }
        return;
    }

    const isDigit = /^\d$/.test(b);
    const isOp = '+-×÷'.includes(b);

    if (d.value === 'Fehler' || calcResultShown) {
        if (isDigit) d.value = b;
        else if (b === ',') d.value = '0,';
        else if (b === '-') d.value = '-';
        else if (isOp && b !== '-') d.value = '0' + b;
        else return;
        calcResultShown = false;
        return;
    }

    const last = d.value.slice(-1);
    const lastIsOp = /[+\-×÷]/.test(last);

    if (d.value === '0' && isDigit) { d.value = b; return; }
    if (d.value === '0' && b === ',') { d.value = '0,'; return; }
    if (d.value === '0' && b === '-') { d.value = '-'; return; }
    if (d.value === '0' && isOp) { return; }

    if (isOp && lastIsOp) {
        d.value = d.value.slice(0, -1) + b;
        return;
    }

    d.value += b;
}

// ======================= DYNAMISCHES LEERGUT KONFIGURATION =======================

function getLeergutConfig() {
    const lDb = AppStorage.get('kombi_logistik_db', {}); const company = lDb.company || {};
    const str = company.leergut || (typeof DEFAULT_LEERGUT_CONFIG !== 'undefined' ? DEFAULT_LEERGUT_CONFIG : "E2:2.0, Herta:2.5, H1:18.0, Euro:21.0");
    return str.split(',').map((s, idx) => {
        let parts = s.split(':'); if(parts.length < 2) return null;
        return { id: 'lg_' + idx, name: parts[0].trim(), weight: parseFloat(parts[1]) || 0 };
    }).filter(lg => lg && lg.name && lg.weight > 0);
}

window.toggleNoPalDynamic = function(prefix) {
    const cb = document.getElementById('no-pal-cb-' + prefix);
    if(!cb) return;
    const isChecked = cb.checked;
    const strip = cb.closest('.no-pal-strip');
    if (strip) strip.classList.toggle('is-active', isChecked);
    const config = getLeergutConfig();
    config.slice(2).forEach(lg => {
        const input = document.getElementById(prefix + '_' + lg.id);
        if (input && input.dataset.ispal === 'true') {
            input.value = isChecked ? "" : (lg.name.toUpperCase().includes('H1') ? "1" : "");
            input.disabled = isChecked;
            input.style.background = isChecked ? "#ffebee" : "#fafafa";
        }
    });
};

// ======================= DYNAMISCHER APP-AUFBAU (SAAS) =======================

function buildAppUI() {
    const lDb = AppStorage.get('kombi_logistik_db', {});
    const company = lDb.company || { name: "Tresch & Sohn", color: "#004b93", modules: { lkw:{active:true, name:"🚛 LKW"}, sort:{active:true, name:"📦 Sortierung"}, noelke:{active:true, name:"📝 Nölke"}, leergut:{active:true, name:"📥 Leergut"} }, customTabs: [] };

    const titleEl = document.querySelector('.head-title');
    if(titleEl) titleEl.innerText = company.name || "Logistik App";
    document.documentElement.style.setProperty('--primary', company.color || "#004b93");

    const syncDrawerTab = (menuId, mod, fallback) => {
        const el = document.getElementById(menuId);
        if (!el) return;
        const active = mod == null ? true : (typeof mod === 'object' ? mod.active !== false : mod !== false);
        if (!active) { el.style.display = 'none'; return; }
        el.style.display = '';
        const raw = (typeof mod === 'object' && mod.name) ? mod.name : fallback;
        let icon = '';
        let label = raw;
        const sp = raw.indexOf(' ');
        if (sp > 0 && sp <= 4) {
            icon = raw.slice(0, sp);
            label = raw.slice(sp + 1);
        }
        const iconEl = el.querySelector('.item-icon');
        const labelEl = el.querySelector('span:not(.item-icon):not(.update-available-chip):not(.menu-chip)');
        if (iconEl && icon) iconEl.textContent = icon;
        if (labelEl) labelEl.textContent = label;
    };
    syncDrawerTab('menu-tab-lkw', company.modules.lkw, '🚛 LKW');
    syncDrawerTab('menu-tab-sort', company.modules.sort, '📦 Sortierung');
    syncDrawerTab('menu-tab-noelke', company.modules.noelke, '📝 Nölke');
    syncDrawerTab('menu-tab-leergut', company.modules.leergut, '📥 Leergut');
    syncDrawerTab('menu-tab-brandenburg', company.modules.brandenburg, '🏭 Brandenburg');
    syncDrawerTab('menu-tab-checklist', company.modules.checklist, '📋 Checkliste');

    const tabBar = document.querySelector('.tab-wrapper');
    if (tabBar) {
        let tabsHtml = '';
        let isFirst = true;
        
        let lkwMod = company.modules.lkw || { active: true, name: '🚛 LKW' };
        if(lkwMod.active !== false) {
            tabsHtml += `<button class="tab-btn ${isFirst?'active':''}" id="btn-tab-lkw" onclick="switchTab('lkw')">${lkwMod.name || '🚛 LKW'}</button>`;
            isFirst = false;
        } else { const el = document.getElementById('tab-lkw'); if(el) el.style.display = 'none'; }
        
        let sortMod = company.modules.sort || { active: true, name: '📦 Sortierung' };
        if(sortMod.active !== false) {
            tabsHtml += `<button class="tab-btn ${isFirst?'active':''}" id="btn-tab-sort" onclick="switchTab('sort')">${sortMod.name || '📦 Sortierung'}</button>`;
            isFirst = false;
        } else { const el = document.getElementById('tab-sort'); if(el) el.style.display = 'none'; }
        
        let noelkeMod = company.modules.noelke || { active: true, name: '📝 Nölke' };
        if(noelkeMod.active !== false) {
            tabsHtml += `<button class="tab-btn ${isFirst?'active':''}" id="btn-tab-noelke" onclick="switchTab('noelke')">${noelkeMod.name || '📝 Nölke'}</button>`;
            isFirst = false;
        } else { const el = document.getElementById('tab-noelke'); if(el) el.style.display = 'none'; }
        
        let leergutMod = company.modules.leergut || { active: true, name: '📥 Leergut' };
        if(leergutMod.active !== false) {
            tabsHtml += `<button class="tab-btn ${isFirst?'active':''}" id="btn-tab-leergut" onclick="switchTab('leergut')">${leergutMod.name || '📥 Leergut'}</button>`;
            isFirst = false;
        } else { const el = document.getElementById('tab-leergut'); if(el) el.style.display = 'none'; }
        
        let bbMod = company.modules.brandenburg || { active: true, name: '🏭 Brandenburg' };
        if(bbMod.active !== false) {
            tabsHtml += `<button class="tab-btn ${isFirst?'active':''}" id="btn-tab-brandenburg" onclick="switchTab('brandenburg')">${bbMod.name || '🏭 Brandenburg'}</button>`;
            isFirst = false;
        } else { const el = document.getElementById('tab-brandenburg'); if(el) el.style.display = 'none'; }

        let checklistMod = company.modules.checklist || { active: true, name: '📋 Checkliste' };
        if(checklistMod.active !== false) {
            tabsHtml += `<button class="tab-btn ${isFirst?'active':''}" id="btn-tab-checklist" onclick="switchTab('checklist')">${checklistMod.name || '📋 Checkliste'}</button>`;
            isFirst = false;
        } else { const el = document.getElementById('tab-checklist'); if(el) el.style.display = 'none'; }

        (company.customTabs || []).forEach(t => {
            tabsHtml += `<button class="tab-btn ${isFirst?'active':''}" id="btn-tab-${t.id}" onclick="switchTab('${t.id}')">${t.name}</button>`;
            isFirst = false;
        });
        tabBar.innerHTML = tabsHtml;
    }

    const lgConfig = getLeergutConfig();
    const buildLgHtml = (prefix, includeNoPal) => {
        let bruId = prefix === 'edit' ? 'edit-bru' : (prefix === 'sort' ? 'bru-sort' : 'bru');
        let html = `
        <div class="grid-row-1" ${prefix === 'sort' ? 'style="margin-top:10px;"' : ''}>
            <div class="field"><label>Brutto</label>
                <div style="display:flex; gap:5px; height: 38px;">
                    <input type="number" id="${bruId}" placeholder="0" style="flex:1;" inputmode="decimal">
                    ${prefix !== 'edit' ? `<button id="mic-btn-${bruId}" onclick="startVoiceRecognition('${bruId}')" style="background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; width:45px; font-size:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.1);">🎤</button>` : ''}
                </div>
            </div>`;
        
        lgConfig.slice(0, 2).forEach(lg => { html += `<div class="field"><label>${lg.name} (${lg.weight})</label><input type="number" id="${prefix}_${lg.id}" placeholder="0" inputmode="numeric" onfocus="this.select()"></div>`; });
        let itemsInRow1 = lgConfig.slice(0, 2).length;
        for(let i = itemsInRow1; i < 2; i++) { html += `<div class="field" style="visibility:hidden;"></div>`; }
        html += `</div>`; 

        let buttonsHtml = "";
        if (prefix === 'lkw') {
            buttonsHtml = `<button class="clear-btn" onclick="fullReset()">↺</button>
                <button class="sonder-toggle-btn" onclick="toggleSonderMode()">+ Sonderp.</button>
                <button class="add-btn" style="flex:1" onclick="addPal()">+ Speichern</button>`;
        } else if (prefix === 'sort') {
            buttonsHtml = `<button class="clear-btn" onclick="fullResetSort()">↺</button>
                <button class="add-btn" style="flex:1" onclick="addSort()">+ Speichern</button>`;
        }

        let itemsInRow2 = lgConfig.slice(2, 4).length;
        if (itemsInRow2 > 0) {
            html += `<div class="grid-row-2 lg-grid-pal" ${prefix === 'edit' ? 'style="margin-top: 10px;"' : ''}>`;
            lgConfig.slice(2, 4).forEach(lg => {
                let isPal = lg.weight >= 15 && lg.weight <= 25;
               let defaultVal = (isPal && prefix !== 'edit' && lg.name.toUpperCase().includes('H1')) ? '1' : '';
                html += `<div class="field"><label>${lg.name} (${lg.weight})</label><input type="number" id="${prefix}_${lg.id}" placeholder="0" value="${defaultVal}" data-ispal="${isPal}" inputmode="numeric" onfocus="this.select()"></div>`;
            });
            for(let i = itemsInRow2; i < 2; i++) { if (prefix !== 'edit') html += `<div class="field" style="visibility:hidden;"></div>`; }
            html += `</div>`; 
            
            if (lgConfig.length > 4) {
                html += `<div class="grid-row-2" style="margin-top:10px;">`;
                lgConfig.slice(4).forEach(lg => {
                    let isPal = lg.weight >= 15 && lg.weight <= 25;
                   let defaultVal = (isPal && prefix !== 'edit' && lg.name.toUpperCase().includes('H1')) ? '1' : '';
                    html += `<div class="field"><label>${lg.name} (${lg.weight})</label><input type="number" id="${prefix}_${lg.id}" placeholder="0" value="${defaultVal}" data-ispal="${isPal}" inputmode="numeric" onfocus="this.select()"></div>`;
                });
                html += `</div>`;
            }
        }

        if (includeNoPal || buttonsHtml) {
            html += `<div class="lg-toolbar">`;
            if (includeNoPal) {
                html += `<label class="no-pal-strip" for="no-pal-cb-${prefix}">
                    <input type="checkbox" id="no-pal-cb-${prefix}" onchange="toggleNoPalDynamic('${prefix}')">
                    <span>Keine Palette</span>
                </label>`;
            }
            if (buttonsHtml) {
                html += `<div class="lg-toolbar-btns">${buttonsHtml}</div>`;
            }
            html += `</div>`;
        }
        return html;
    };
    let lkwCont = document.getElementById('dynamic-leergut-lkw'); if(lkwCont) lkwCont.innerHTML = buildLgHtml('lkw', true);
    let sortCont = document.getElementById('dynamic-leergut-sort'); if(sortCont) sortCont.innerHTML = buildLgHtml('sort', true);
    let editCont = document.getElementById('dynamic-leergut-edit'); if(editCont) editCont.innerHTML = buildLgHtml('edit', false);

    let primaryLgName = lgConfig.length > 0 ? lgConfig[0].name : "E2";
    const updateLabel = (id, text) => { 
        const input = document.getElementById(id); 
        if(input && input.previousElementSibling && input.previousElementSibling.tagName === 'LABEL') input.previousElementSibling.innerText = text;
    };
    updateLabel('s-e2kisten', primaryLgName + ' Kisten'); updateLabel('s-stke2', 'Stk / ' + primaryLgName);
    updateLabel('n-e2', primaryLgName + ' Kisten'); updateLabel('edit-n-e2', primaryLgName + ' Kisten');
    updateLabel('tpl-stke2', 'Stk/' + primaryLgName);
    const statE2 = document.getElementById('stat-e2'); if(statE2 && statE2.previousElementSibling) statE2.previousElementSibling.innerText = primaryLgName + ' Kisten';

    let ctc = document.getElementById('custom-tabs-container');
    if (ctc) {
        let customHtml = '';
        (company.customTabs || []).forEach(t => {
            customHtml += `<div id="tab-${t.id}" class="tab-content"><div class="input-area" style="border-top: 4px solid #9c27b0;"><div style="display:flex; flex-wrap:wrap; gap:10px;">`;
            t.fields.forEach((f, idx) => {
                let width = f.width === 'full' ? '100%' : 'calc(50% - 5px)';
                customHtml += `<div class="field" style="flex: 1 1 ${width}; min-width:140px;"><label>${f.label}</label>`;
                let inputId = `ct_${t.id}_f${idx}`;
                if(f.type === 'select-suppliers') {
                    customHtml += `<select id="${inputId}"><option value="">Wählen...</option>${(lDb.suppliers||[]).map(s=>`<option value="${s}">${s}</option>`).join('')}</select>`;
                } else if(f.type === 'select-workers') {
                    customHtml += `<select id="${inputId}"><option value="">Wählen...</option>${(lDb.workers||[]).map(w=>`<option value="${w}">${w}</option>`).join('')}</select>`;
                } else if(f.type === 'select-articles' || f.type === 'select-noelke') {
                    let opts = f.type === 'select-articles' ? (lDb.articles||[]).map(a=>a.name) : (lDb.savedProdukteRaw||[]);
                    customHtml += `<select id="${inputId}"><option value="">Wählen...</option>${opts.map(o=>`<option value="${o.replace(/"/g, '&quot;')}">${o}</option>`).join('')}</select>`;
                } else if(f.type === 'textarea') {
                    customHtml += `<textarea id="${inputId}" rows="2"></textarea>`;
                } else {
                    let inType = f.type==='number' ? 'number' : (f.type==='date' ? 'date' : 'text');
                    let flexGroup = (f.scan || f.mic) ? `<div style="display:flex; gap:5px; height:38px;"><input type="${inType}" id="${inputId}" style="flex:1;">` : `<input type="${inType}" id="${inputId}">`;
                    if(f.scan) flexGroup += `<button onclick="startBarcodeScanner('${inputId}')" style="background:#137333; color:white; border:none; border-radius:8px; cursor:pointer; width:45px; font-size:18px; display:flex; align-items:center; justify-content:center;">📷</button>`;
                    if(f.mic) flexGroup += `<button onclick="startVoiceRecognition('${inputId}')" style="background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; width:45px; font-size:18px; display:flex; align-items:center; justify-content:center;">🎤</button>`;
                    if(f.scan || f.mic) flexGroup += `</div>`;
                    customHtml += flexGroup;
                }
                customHtml += `</div>`;
            });
            customHtml += `</div><button class="add-btn" style="width:100%; margin-top:15px; background:#9c27b0;" onclick="saveCustomTabEntry('${t.id}')">+ ${t.name} speichern</button></div><div class="list-area" id="list-${t.id}"></div></div>`;
        });
        ctc.innerHTML = customHtml;
        (company.customTabs || []).forEach(t => renderCustomTab(t.id));
    }
    
    let firstActiveBtn = document.querySelector('.tab-btn.active');
    if(!firstActiveBtn) { let firstBtn = document.querySelector('.tab-btn'); if(firstBtn) firstBtn.click(); }
}

function saveCustomTabEntry(tabId) {
    const lDb = AppStorage.get('kombi_logistik_db', {}); const company = lDb.company || {};
    const tabDef = (company.customTabs || []).find(t => t.id === tabId); if (!tabDef) return;

    let entry = { _id: Date.now().toString(), _date: new Date().toISOString() }; let hasData = false;
    tabDef.fields.forEach((f, idx) => {
        let el = document.getElementById(`ct_${tabId}_f${idx}`);
        if (el) { entry[`f${idx}`] = el.value; if (el.value) hasData = true; }
    });

    if (!hasData) return showToast("Bitte Felder ausfüllen!", "warning");
    if (!customTabEntries[tabId]) customTabEntries[tabId] = [];
    customTabEntries[tabId].push(entry);
    
    saveRechnerDB(); renderCustomTab(tabId);
    
    tabDef.fields.forEach((f, idx) => { let el = document.getElementById(`ct_${tabId}_f${idx}`); if (el) el.value = ''; });
    showToast("Gespeichert!", "success");
}

function renderCustomTab(tabId) {
    const lDb = AppStorage.get('kombi_logistik_db', {}); const company = lDb.company || {};
    const tabDef = (company.customTabs || []).find(t => t.id === tabId); if (!tabDef) return;
    const listEl = document.getElementById(`list-${tabId}`); if (!listEl) return;

    const entriesForTab = customTabEntries[tabId] || [];
    listEl.innerHTML = entriesForTab.map((e, index) => {
        let detailsHtml = '';
        tabDef.fields.forEach((f, idx) => {
            if(e[`f${idx}`]) { detailsHtml += `<div style="font-size:12px; margin-top:4px;"><b>${f.label}:</b> <span style="color:#555;">${e[`f${idx}`]}</span></div>`; }
        });
        return `<div class="swipe-wrap" style="margin: 0 10px 8px 10px;">
            <div class="swipe-bg" onclick="deleteCustomTabEntry('${tabId}', ${index})"><span>🗑️</span></div>
            <div class="palette-card swipeable" style="border-left-color:#9c27b0; margin: 0; padding:12px;">
                <div style="flex:1;">
                    <b style="font-size:14px; color:#9c27b0;">Eintrag vom ${new Date(e._date).toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'})} Uhr</b>
                    <div style="margin-top:5px; border-top:1px solid #eee; padding-top:5px;">${detailsHtml}</div>
                </div>
            </div>
        </div>`;
    }).reverse().join('');
}

function deleteCustomTabEntry(tabId, index) { if(confirm("Eintrag löschen?")) { customTabEntries[tabId].splice(index, 1); saveRechnerDB(); renderCustomTab(tabId); showToast("Gelöscht", "success"); } }

// ======================= EVENT LISTENER =======================

document.addEventListener("DOMContentLoaded", () => {
    const rekModal = document.getElementById('reklamation-modal');
    if (rekModal) {
        rekModal.addEventListener('change', (e) => { if (e.target.id === 'rek-lief') loadReklamationDraftForSupplier(); else saveReklamationDraft(); });
        rekModal.addEventListener('input', (e) => { if (e.target.id !== 'rek-lief') saveReklamationDraft(); });
    }

    const tplEanInput = document.getElementById('tpl-ean');
    let eanDebounceTimer;
    if (tplEanInput) {
        tplEanInput.addEventListener('input', (e) => {
            clearTimeout(eanDebounceTimer);
            eanDebounceTimer = setTimeout(() => {
                const val = e.target.value.trim();
                if (val.length < 3) return;

                const gs1Data = parseGS1(val);
                let searchEan = gs1Data ? gs1Data.gtin : val;
                let altEan = gs1Data ? gs1Data.ean : val;

                if (gs1Data) e.target.value = gs1Data.gtin;
                
                const rDb = AppStorage.get('kombi_rechner_db', {});
                const produkte = Array.isArray(rDb.savedProdukteRaw) ? rDb.savedProdukteRaw : [];
                const lDb = AppStorage.get('kombi_logistik_db', {});
                const articles = Array.isArray(lDb.articles) ? lDb.articles : [];
                
                let foundName = "";
                let matchArt = articles.find(a => a.nr === searchEan || a.nr === altEan || (gs1Data && (a.nr === gs1Data.gtin || a.nr === gs1Data.ean)));
                if (matchArt) foundName = matchArt.name;
                else {
                    let matchProd = produkte.find(p => typeof p === 'string' && (p.includes(searchEan) || p.includes(altEan) || (gs1Data && (p.includes(gs1Data.gtin) || p.includes(gs1Data.ean)))));
                    if (matchProd) foundName = matchProd.replace(/^\d+\s*-\s*/, '').replace(/^\[?Nr\.?\s*\d+\]?\s*-?\s*(.*)/i, '');
                }
                
                if (foundName && document.getElementById('tpl-name').value === '') {
                    document.getElementById('tpl-name').value = foundName;
                    showToast("Artikelname gefunden und befüllt!", "success");
                }

                const existingTpl = sonderTemplates.find(t => t.ean === searchEan || t.ean === altEan || (gs1Data && (t.ean === gs1Data.gtin || t.ean === gs1Data.ean)));
                if (existingTpl && document.getElementById('tpl-kg').value === '') {
                    document.getElementById('tpl-reihe').value = existingTpl.s_reihe || ""; document.getElementById('tpl-reihen').value = existingTpl.s_reihen || "";
                    document.getElementById('tpl-krtlage').value = existingTpl.s_krtlage || ""; document.getElementById('tpl-lagen').value = existingTpl.s_lagen || "";
                    document.getElementById('tpl-stk').value = existingTpl.s_stk || ""; document.getElementById('tpl-kg').value = existingTpl.s_kg || ""; document.getElementById('tpl-stke2').value = existingTpl.s_stke2 || "";
                    showToast("Bestehende Vorlage geladen!", "info");
                }
            }, 400); 
        });
    }

    if(typeof initLgZaehler === 'function') setTimeout(initLgZaehler, 500);
});

// ======================= LEERGUT ZÄHLER RESET LOGIK =======================
window.clearLeergutInputs = function(prefix) {
    const lgConfig = getLeergutConfig();
    lgConfig.forEach(lg => {
        let el = document.getElementById(prefix + '_' + lg.id);
        if (el) {
            let isPal = lg.weight >= 15 && lg.weight <= 25;
            let defaultVal = (isPal && prefix !== 'edit' && lg.name.toUpperCase().includes('H1')) ? '1' : '';
            el.value = defaultVal;
        }
    });
    let bruId = prefix === 'sort' ? 'bru-sort' : 'bru';
    let bruEl = document.getElementById(bruId);
    if (bruEl) bruEl.value = '';
    
    const cb = document.getElementById('no-pal-cb-' + prefix);
    if(cb && cb.checked) { cb.click(); }
    
    showToast("Zähler geleert!", "success");
};

// ======================= BRANDENBURG WARENEINGANG =======================
let brandenburgState = { scans: [], entries: [], lastScan: null };
let editingBrandenburgIndex = null;
function isLikelyBrandenburgSscc(s) {
    if (!s || typeof s !== 'string') return false;
    const clean = s.replace(/\s|\[|\]|\]C1/g, '');
    return /^00\d{18}$/.test(clean) || /^\d{18}$/.test(clean);
}

function isLikelyBrandenburgGs1(s) {
    if (!s || typeof s !== 'string') return false;
    const clean = s.replace(/\s/g, '');
    if (/\(01\)|\(02\)|\(10\)|\(15\)|\(17\)|\(3302\)|\(400\)|\(401\)|\x1D/.test(clean)) return true;
    if (/^(00|01|02|10|15|17|3302|400|401|31\d)/.test(clean)) return true;
    return false;
}

function tryParseBrandenburgGs1(gs1Candidate) {
    if (!gs1Candidate || typeof gs1Candidate !== 'string') return null;
    let cleanText = gs1Candidate.replace(/\]C1/g, '').replace(/\[|\]/g, '').trim();
    if (!cleanText || isLikelyBrandenburgSscc(cleanText)) return null;
    const result = { charge: null, netto: 0, gtin: null, article: null };
    const parseAiValue = (ai, value) => {
        if (ai === '3302' && /^\d{6}$/.test(value)) { if (result.netto === 0) result.netto = parseInt(value, 10) / 100.0; return true; }
        if (/^31\d\d$/.test(ai) && /^\d{6}$/.test(value)) { const decimals = parseInt(ai.substring(2, 3), 10); if (result.netto === 0) result.netto = parseInt(value, 10) / Math.pow(10, decimals); return true; }
        if ((ai === '01' || ai === '02') && /^\d{14}$/.test(value)) { if (!result.gtin) result.gtin = value; if (!result.article) result.article = value; return true; }
        if (ai === '10') { let charge = value; const fncIndex = charge.indexOf(String.fromCharCode(29)); if (fncIndex !== -1) charge = charge.substring(0, fncIndex); charge = charge.replace(/^IDE/, ''); if (charge && !/due\s*charge/i.test(charge)) { if (!result.charge) result.charge = charge; return true; } }
        if ((ai === '400' || ai === '401') && value) { let article = value; const fncIndex = article.indexOf(String.fromCharCode(29)); if (fncIndex !== -1) article = article.substring(0, fncIndex); if (!result.article) result.article = article; return true; }
        if (ai === '01' && /^\d{7,13}$/.test(value)) { if (!result.article) result.article = value; return true; }
        return false;
    };
    if (cleanText.includes(String.fromCharCode(29))) { const parts = cleanText.split(String.fromCharCode(29)); for (const part of parts) { if (part.startsWith('01')) parseAiValue('01', part.substring(2)); else if (part.startsWith('10')) parseAiValue('10', part.substring(2)); else if (part.startsWith('3302')) parseAiValue('3302', part.substring(4)); } }
    const parenRegex = /\(((?:00|01|02|10|15|17|3302|31\d\d|400|401))\)([^\(\x1D]*)/g; let match;
    while ((match = parenRegex.exec(cleanText))) { parseAiValue(match[1], match[2]); }
    if (result.netto === 0) { const weightMatch = cleanText.match(/3302(\d{6})/); if (weightMatch) { parseAiValue('3302', weightMatch[1]); } }
    if (result.article || result.charge || result.gtin || result.netto > 0) return result;
    return null;
}

function normalizeBrandenburgEntry(raw) {
    if (!raw) return null;
    let entry = { type: 'AUTO', value: '' };
    if (typeof raw === 'string') { const m = raw.match(/^([A-Z0-9_-]+)\|([\s\S]+)$/); entry.value = m ? m[2] : raw; entry.type = m ? m[1] : 'AUTO'; } 
    else if (typeof raw === 'object') { entry.type = raw.type || 'AUTO'; entry.value = raw.value || ''; }
    entry.value = (entry.value || '').toString().trim(); if (!entry.value) return null;
    const type = entry.type.toString().toUpperCase();
    if (type === 'QR' || type === 'BC') { entry.type = type; return entry; }
    if (isLikelyBrandenburgSscc(entry.value)) { entry.type = 'BC'; return entry; }
    entry.type = isLikelyBrandenburgGs1(entry.value) ? 'QR' : 'BC'; return entry;
}

function processBrandenburgScanEntries(rawEntries) {
    const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
    const latestEntry = normalizeBrandenburgEntry(entries[entries.length - 1]);
    if (!latestEntry) return;
    if (brandenburgState.lastScan && brandenburgState.lastScan.value === latestEntry.value && (Date.now() - brandenburgState.lastScan.ts) < 1500) return;
    brandenburgState.lastScan = { value: latestEntry.value, ts: Date.now() };
    if (latestEntry.type !== 'QR') { showToast('Strichcode ignoriert. Bitte den QR-Code scannen.', 'info'); return; }
    const qrData = tryParseBrandenburgGs1(latestEntry.value);
    if (qrData && (qrData.article || qrData.gtin || qrData.charge)) {
        const article = qrData.article || qrData.gtin; const charge = qrData.charge;
        const isDark = document.body.classList.contains('dark-mode');
        document.getElementById('brandenburg-scan-status').innerText = '✅ QR-Code erkannt!';
        const statusEl = document.getElementById('brandenburg-scan-status');
        statusEl.style.background = isDark ? "var(--success-bg, #1c3b1c)" : "var(--success-bg, #e8f5e9)";
        statusEl.style.color = isDark ? "#66bb6a" : "#2e7d32";
        document.getElementById('bb-artikel').value = article || ''; document.getElementById('bb-charge').value = charge || '';
        document.getElementById('bb-netto-scan').value = '';
        ['bb-artikel', 'bb-charge', 'bb-netto-scan', 'bb-brutto', 'bb-leergut', 'bb-e2', 'bb-h1'].forEach(id => { const input = document.getElementById(id); if (input) { input.readOnly = false; input.disabled = false; input.style.background = ''; input.removeAttribute('readonly'); } });
        document.getElementById('brandenburg-data-form').style.display = 'block';
        showToast('Daten aus QR-Code extrahiert. Bitte Gewicht manuell eintragen.', 'success');
        if (typeof stopBarcodeScanner === 'function') { stopBarcodeScanner(); }
        brandenburgState.scans = [];
        setTimeout(() => { document.getElementById('bb-brutto')?.focus(); }, 300);
    } else { showToast('Keine gültigen Artikel- oder Chargendaten im QR-Code gefunden.', 'error'); resetBrandenburgScanner(); }
}

function handleBrandenburgScan(scannedText) { if (!scannedText) return; processBrandenburgScanEntries(scannedText); }

function getBrandenburgLsNummer() {
    const db = AppStorage.get('kombi_rechner_db', {});
    return (db.brandenburgLsNummer || '').toString().trim();
}

function saveBrandenburgLsNummer() {
    const el = document.getElementById('bb-ls-nummer');
    const db = AppStorage.get('kombi_rechner_db', {});
    db.brandenburgLsNummer = el ? el.value.trim() : '';
    AppStorage.set('kombi_rechner_db', db);
}

function calcBrandenburgTotals() {
    let totalBrutto = 0, totalNettoIst = 0, totalNettoSoll = 0;
    brandenburgState.entries.forEach(e => {
        totalBrutto += e.brutto || 0;
        totalNettoIst += e.nettoIst || 0;
        totalNettoSoll += e.nettoScan || 0;
    });
    return { totalBrutto, totalNettoIst, totalNettoSoll };
}

function buildBrandenburgTotalsHtml(forPrint) {
    const t = calcBrandenburgTotals();
    const totalDiff = t.totalNettoIst - t.totalNettoSoll;
    const diffColor = Math.abs(totalDiff) > 0.1 ? '#c62828' : '#1b5e20';
    const bg = forPrint ? '#e3f2fd' : 'var(--bg-color-2, #e3f2fd)';
    const border = forPrint ? '#90caf9' : 'var(--border-color, #90caf9)';
    return `<div style="background: ${bg}; padding: 15px; border-radius: 8px; border: 1px solid ${border}; margin-top: 20px; page-break-inside: avoid;">
        <div style="font-weight: bold; margin-bottom: 10px; text-align: center; text-transform: uppercase; font-size: 14px; color: #1565c0;">Gesamtgewichte</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:14px;"><span>Summe Brutto:</span><span style="font-weight:bold;">${t.totalBrutto.toFixed(2)} kg</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:14px;"><span>Summe Netto (Soll):</span><span style="font-weight:bold; color:#555;">${t.totalNettoSoll.toFixed(2)} kg</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:14px;"><span>Summe Netto (Ist):</span><span style="font-weight:bold; color:#1b5e20;">${t.totalNettoIst.toFixed(2)} kg</span></div>
        <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:1px solid ${border}; font-size:14px;"><span style="font-weight:bold;">Gesamtdifferenz:</span><span style="font-weight:bold; color:${diffColor};">${totalDiff.toFixed(2)} kg</span></div>
    </div>`;
}

function calcBrandenburgNetto() {
    const brutto = parseFloat(document.getElementById('bb-brutto').value.replace(',', '.')) || 0;
    const lgConfig = getLeergutConfig();
    const e2Config = lgConfig.find(lg => lg.name.toUpperCase() === 'E2'); const h1Config = lgConfig.find(lg => lg.name.toUpperCase() === 'H1');
    const e2Weight = e2Config ? e2Config.weight : 2.0; const h1Weight = h1Config ? h1Config.weight : 18.0;
    const e2Count = parseInt(document.getElementById('bb-e2').value) || 0; const h1Count = parseInt(document.getElementById('bb-h1').value) || 0;
    const leergut = (e2Count * e2Weight) + (h1Count * h1Weight);
    const leergutInput = document.getElementById('bb-leergut'); if (leergutInput) leergutInput.value = leergut.toFixed(2).replace('.', ',');
    let istNetto = brutto - leergut;
    const istNettoEl = document.getElementById('bb-netto-ist'); istNettoEl.value = istNetto.toFixed(2);
    const scanNetto = parseFloat(document.getElementById('bb-netto-scan').value) || 0;
    const diff = Math.abs(istNetto - scanNetto); const isDark = document.body.classList.contains('dark-mode');
    if (scanNetto > 0 && diff <= 0.1) { istNettoEl.style.color = "#2e7d32"; istNettoEl.style.background = isDark ? "var(--success-bg, #1c3b1c)" : "var(--success-bg, #e8f5e9)"; } 
    else if (scanNetto > 0) { istNettoEl.style.color = "#c62828"; istNettoEl.style.background = isDark ? "var(--danger-bg, #4d1f1f)" : "var(--danger-bg, #ffebee)"; } 
    else { istNettoEl.style.color = ""; istNettoEl.style.background = isDark ? 'var(--bg-disabled, #2c2c2c)' : 'var(--bg-disabled, #f0f2f5)'; }
}

function restoreBrandenburgButtons() {
    const saveBtn = document.getElementById('btn-save-brandenburg');
    const updateBtn = document.getElementById('btn-update-brandenburg');
    const cancelBtn = document.getElementById('btn-cancel-brandenburg');
    if (saveBtn) saveBtn.style.display = '';
    if (updateBtn) updateBtn.remove();
    if (cancelBtn) cancelBtn.remove();
}

function clearBrandenburgFormFields() {
    ['bb-artikel', 'bb-charge', 'bb-netto-scan', 'bb-brutto', 'bb-leergut', 'bb-netto-ist', 'bb-e2', 'bb-h1'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
            el.readOnly = false;
            el.disabled = false;
            el.style.background = '';
            el.removeAttribute('readonly');
        }
    });
    const scanInput = document.getElementById('brandenburg-scan-input');
    if (scanInput) scanInput.value = '';
    const isDark = document.body.classList.contains('dark-mode');
    const istNettoEl = document.getElementById('bb-netto-ist');
    if (istNettoEl) {
        istNettoEl.readOnly = true;
        istNettoEl.style.color = '';
        istNettoEl.style.background = isDark ? 'var(--bg-disabled, #2c2c2c)' : 'var(--bg-disabled, #f0f2f5)';
    }
    const leergutInput = document.getElementById('bb-leergut');
    if (leergutInput) {
        leergutInput.readOnly = true;
        leergutInput.style.background = isDark ? 'var(--bg-disabled, #2c2c2c)' : 'var(--bg-disabled, #f0f2f5)';
    }
    if (typeof calcBrandenburgNetto === 'function') calcBrandenburgNetto();
}

function resetBrandenburgForm(silent) {
    if (editingBrandenburgIndex !== null) editingBrandenburgIndex = null;
    if (typeof stopBarcodeScanner === 'function') stopBarcodeScanner();
    clearBrandenburgFormFields();
    restoreBrandenburgButtons();
    brandenburgState.scans = [];
    brandenburgState.lastScan = null;
    const scanStatusEl = document.getElementById('brandenburg-scan-status');
    if (scanStatusEl) {
        scanStatusEl.innerText = 'Bereit zum Scannen oder zur manuellen Eingabe.';
        scanStatusEl.style.background = 'var(--bg-color-2, #f0f2f5)';
        scanStatusEl.style.color = 'var(--text-color, #555)';
    }
    const form = document.getElementById('brandenburg-data-form');
    if (form) form.style.display = 'block';
    if (!silent) showToast('Eingabe zurückgesetzt', 'success');
}

function fullResetBrandenburg() {
    customConfirm('Alle Brandenburg-Paletten und Eingaben löschen?', () => {
        brandenburgState.entries = [];
        const db = AppStorage.get('kombi_rechner_db', {});
        db.brandenburg = [];
        AppStorage.set('kombi_rechner_db', db);
        resetBrandenburgForm(true);
        renderBrandenburgList();
        showToast('Brandenburg komplett geleert', 'success');
    });
}

function resetBrandenburgScanner() {
    resetBrandenburgForm();
    if (typeof startBarcodeScanner === 'function') startBarcodeScanner('brandenburg-scan-input');
    const scanStatusEl = document.getElementById('brandenburg-scan-status');
    if (scanStatusEl) { scanStatusEl.innerText = "Scanner wird gestartet..."; scanStatusEl.style.background = "var(--warning-bg, #fff3e0)"; scanStatusEl.style.color = "var(--warning-text, #e65100)"; }
}

function saveBrandenburgPalette() {
    if (editingBrandenburgIndex !== null) { showToast("Bitte erst die Bearbeitung abschließen.", "warning"); return; }
    let artikel = document.getElementById('bb-artikel').value; let charge = document.getElementById('bb-charge').value;
    let nettoScan = parseFloat(document.getElementById('bb-netto-scan').value) || 0; let brutto = parseFloat(document.getElementById('bb-brutto').value.replace(',','.')) || 0;
    let e2Count = parseInt(document.getElementById('bb-e2').value) || 0; let h1Count = parseInt(document.getElementById('bb-h1').value) || 0;
    let leergut = parseFloat(document.getElementById('bb-leergut').value.replace(',', '.')) || 0;
    let nettoIst = parseFloat(document.getElementById('bb-netto-ist').value) || 0;
    if(!brutto) { showToast("Bitte Bruttogewicht eingeben", "warning"); return; }
    
    brandenburgState.entries.push({ id: Date.now().toString(), artikel: artikel, charge: charge, nettoScan: nettoScan, brutto: brutto, leergut: leergut, leergutCounts: { e2: e2Count, h1: h1Count }, nettoIst: nettoIst, timestamp: new Date().toISOString() });
    let db = AppStorage.get('kombi_rechner_db', {}); db.brandenburg = brandenburgState.entries; AppStorage.set('kombi_rechner_db', db);
    renderBrandenburgList(); resetBrandenburgForm(); showToast("Palette gespeichert!", "success");
}

function loadBrandenburgData() {
    let db = AppStorage.get('kombi_rechner_db', {}); brandenburgState.entries = db.brandenburg || []; renderBrandenburgList();
    const lsEl = document.getElementById('bb-ls-nummer'); if (lsEl) lsEl.value = getBrandenburgLsNummer();
    const form = document.getElementById('brandenburg-data-form'); if (form) form.style.display = 'block';
    ['bb-artikel', 'bb-charge', 'bb-netto-scan', 'bb-brutto', 'bb-e2', 'bb-h1'].forEach(id => { const input = document.getElementById(id); if (input) { input.readOnly = false; input.style.background = ''; input.removeAttribute('readonly'); } });
    const leergutInput = document.getElementById('bb-leergut'); if (leergutInput) { leergutInput.readOnly = true; leergutInput.style.background = 'var(--bg-disabled, #f0f2f5)'; leergutInput.placeholder = 'Auto'; }
    const scanStatusEl = document.getElementById('brandenburg-scan-status'); if (scanStatusEl) { scanStatusEl.innerText = "Bereit zum Scannen oder zur manuellen Eingabe."; scanStatusEl.style.background = "var(--bg-color-2, #f0f2f5)"; scanStatusEl.style.color = "var(--text-color, #555)"; }
    const container = document.getElementById('tab-brandenburg');
    if (container) {
        container.style.paddingBottom = '100px';
        if (!document.getElementById('brandenburg-scan-btn')) {
            const scanButton = document.createElement('button'); scanButton.id = 'brandenburg-scan-btn'; scanButton.innerHTML = '📷 QR-Code scannen';
            scanButton.style.cssText = "width: calc(100% - 20px); margin: 15px 10px 5px 10px; padding: 15px; font-size: 16px; background: #8e44ad; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;";
            scanButton.onclick = () => { if (typeof startBarcodeScanner === 'function') startBarcodeScanner('brandenburg-scan-input'); }; container.prepend(scanButton);
        }
        const saveButton = container.querySelector('.input-area .add-btn');
        if (saveButton && !document.getElementById('brandenburg-button-container')) {
            const buttonContainer = document.createElement('div'); buttonContainer.id = 'brandenburg-button-container';
            saveButton.parentNode.insertBefore(buttonContainer, saveButton); buttonContainer.appendChild(saveButton); saveButton.id = 'btn-save-brandenburg';
        }
    }
}

function renderBrandenburgList() {
    let countEl = document.getElementById('bb-counter'); if(countEl) countEl.innerText = brandenburgState.entries.length;
    let listEl = document.getElementById('list-brandenburg'); if(!listEl) return;
    listEl.innerHTML = brandenburgState.entries.map((e, index) => {
        let isOk = Math.abs(e.nettoIst - e.nettoScan) <= 0.1; let color = e.nettoScan > 0 ? (isOk ? "#2e7d32" : "#c62828") : "#8e44ad";
        let lgCounts = e.leergutCounts || {e2:0, h1:0}; let lgStr = [];
        if (lgCounts.e2 > 0) lgStr.push(`${lgCounts.e2} E2`); if (lgCounts.h1 > 0) lgStr.push(`${lgCounts.h1} H1`);
        return `<div class="swipe-wrap" style="margin: 0 10px 8px 10px;"><div class="swipe-bg" onclick="deleteBrandenburgEntry(${index})"><span>🗑️</span></div>
            <div class="palette-card swipeable" style="border-left-color:${color}; margin: 0; padding:12px;" onclick="editBrandenburgEntry(${index})">
                <div style="flex:1;"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><b style="font-size:14px; color:var(--brandenburg-color, #8e44ad); max-width: 80%;">${e.artikel || '-'}</b><span style="font-size: 20px; color: var(--text-color-secondary, #999);">✏️</span></div>
                    <div style="font-size:12px; color:var(--text-color-secondary, #777); margin-top:2px;">Charge: ${e.charge || '-'}</div>
                    <div style="margin-top:8px; border-top:1px solid var(--border-color, #eee); padding-top:8px; font-size:12px; color:var(--text-color, #555); display:flex; justify-content:space-between; flex-wrap:wrap; gap:5px;">
                        <span>Brutto: <b>${e.brutto.toFixed(2)} kg</b></span><span>Leergut: <b>${lgStr.join(', ') || '-'}</b></span><span>Netto: <b style="color:${color};">${e.nettoIst.toFixed(2)} kg</b></span>
                    </div></div></div></div>`;
    }).reverse().join('');
}

function deleteBrandenburgEntry(index) {
    customConfirm("Diesen Eintrag wirklich löschen?", () => {
        if (editingBrandenburgIndex === index) cancelBrandenburgEdit();
        brandenburgState.entries.splice(index, 1); let db = AppStorage.get('kombi_rechner_db', {}); db.brandenburg = brandenburgState.entries; AppStorage.set('kombi_rechner_db', db);
        renderBrandenburgList(); showToast("Gelöscht", "success");
        if (editingBrandenburgIndex !== null && editingBrandenburgIndex > index) editingBrandenburgIndex--;
    });
}

function editBrandenburgEntry(index) {
    if (editingBrandenburgIndex !== null) { showToast("Bitte erst die aktuelle Bearbeitung abschließen.", "warning"); return; }
    const entry = brandenburgState.entries[index]; if (!entry) return; editingBrandenburgIndex = index;
    document.getElementById('bb-artikel').value = entry.artikel || ''; document.getElementById('bb-charge').value = entry.charge || ''; document.getElementById('bb-netto-scan').value = entry.nettoScan || '';
    document.getElementById('bb-brutto').value = entry.brutto.toFixed(2).replace('.',','); document.getElementById('bb-e2').value = entry.leergutCounts?.e2 || '0'; document.getElementById('bb-h1').value = entry.leergutCounts?.h1 || '0';
    calcBrandenburgNetto();
    const tab = document.getElementById('tab-brandenburg');
    if (tab) tab.scrollTop = 0;
    const saveBtn = document.getElementById('btn-save-brandenburg');
    if (saveBtn) saveBtn.style.display = 'none';
    if (!document.getElementById('btn-update-brandenburg')) {
        const buttonContainer = document.getElementById('brandenburg-button-container') || saveBtn?.parentElement;
        if (buttonContainer) {
            const updateBtn = document.createElement('button');
            updateBtn.id = 'btn-update-brandenburg';
            updateBtn.className = 'add-btn';
            updateBtn.style.cssText = 'background: var(--warning); flex:2;';
            updateBtn.textContent = '💾 Änderungen speichern';
            updateBtn.onclick = () => updateBrandenburgEntry();
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'btn-cancel-brandenburg';
            cancelBtn.className = 'clear-btn';
            cancelBtn.textContent = 'Abbrechen';
            cancelBtn.onclick = () => cancelBrandenburgEdit();
            buttonContainer.appendChild(updateBtn);
            buttonContainer.appendChild(cancelBtn);
        }
    }
    showToast('Bearbeitungsmodus aktiv.', 'info');
}

function updateBrandenburgEntry() {
    if (editingBrandenburgIndex === null) return; const entry = brandenburgState.entries[editingBrandenburgIndex]; if (!entry) return;
    entry.artikel = document.getElementById('bb-artikel').value; entry.charge = document.getElementById('bb-charge').value;
    entry.nettoScan = parseFloat(document.getElementById('bb-netto-scan').value) || 0; entry.brutto = parseFloat(document.getElementById('bb-brutto').value.replace(',','.')) || 0;
    const e2Count = parseInt(document.getElementById('bb-e2').value) || 0; const h1Count = parseInt(document.getElementById('bb-h1').value) || 0;
    entry.leergutCounts = { e2: e2Count, h1: h1Count }; const lgConfig = getLeergutConfig(); const e2Weight = (lgConfig.find(lg => lg.name.toUpperCase() === 'E2') || {weight: 2.0}).weight; const h1Weight = (lgConfig.find(lg => lg.name.toUpperCase() === 'H1') || {weight: 18.0}).weight;
    entry.leergut = (e2Count * e2Weight) + (h1Count * h1Weight); entry.nettoIst = entry.brutto - entry.leergut;
    let db = AppStorage.get('kombi_rechner_db', {}); db.brandenburg = brandenburgState.entries; AppStorage.set('kombi_rechner_db', db);
    renderBrandenburgList(); cancelBrandenburgEdit(); showToast("Änderungen gespeichert!", "success");
}

function cancelBrandenburgEdit() {
    editingBrandenburgIndex = null;
    clearBrandenburgFormFields();
    restoreBrandenburgButtons();
    showToast('Bearbeitung abgebrochen', 'info');
}

function showBrandenburgSummary() {
    let content = document.getElementById('bb-summary-content'); if(!content) return;
    if(brandenburgState.entries.length === 0) { content.innerHTML = "<p style='text-align:center; color:var(--text-color-secondary, #999);'>Keine Daten erfasst.</p>"; document.getElementById('brandenburg-summary-modal').style.display = 'flex'; return; }
    let grouped = {};
    brandenburgState.entries.forEach(e => {
        const key = e.artikel || 'Unbekannter Artikel';
        if(!grouped[key]) { grouped[key] = { chargen: new Set(), nettoSollSum: 0, nettoIstSum: 0, e2Sum: 0, h1Sum: 0, count: 0, entries: [] }; }
        grouped[key].chargen.add(e.charge); grouped[key].nettoSollSum += e.nettoScan || 0; grouped[key].nettoIstSum += e.nettoIst;
        grouped[key].e2Sum += (e.leergutCounts ? e.leergutCounts.e2 : 0) || 0; grouped[key].h1Sum += (e.leergutCounts ? e.leergutCounts.h1 : 0) || 0;
        grouped[key].count++; grouped[key].entries.push(e);
    });
    let totalE2 = 0; let totalH1 = 0; brandenburgState.entries.forEach(e => { totalE2 += (e.leergutCounts ? e.leergutCounts.e2 : 0) || 0; totalH1 += (e.leergutCounts ? e.leergutCounts.h1 : 0) || 0; });
    const lsNummer = getBrandenburgLsNummer();
    let html = lsNummer ? `<div style="background: var(--bg-color-2, #f4f6f9); padding: 10px 12px; border-radius: 8px; margin-bottom: 15px; font-size: 14px;"><b>LS-Nummer:</b> ${lsNummer}</div>` : '';
    for(let art in grouped) { 
        let g = grouped[art]; let chargenList = Array.from(g.chargen).filter(c => c).join(', ');
        html += `<div style="border: 1px solid var(--border-color, #ddd); border-radius: 8px; margin-bottom: 20px; overflow: hidden;"><div style="background: var(--bg-color-2, #f4f6f9); padding: 10px; border-bottom: 1px solid var(--border-color, #ddd);"><div style="font-weight: bold; font-size: 16px;">${art}</div><div style="font-size: 12px; color: var(--text-color-secondary, #555);">${chargenList || '-'}</div></div><table style="width:100%; border-collapse: collapse;"><thead><tr style="font-size:11px; background: var(--bg-color-2, #fafafa);"><th style="padding: 6px; border-bottom: 1px solid var(--border-color, #ddd); text-align: left;">Brutto</th><th style="padding: 6px; border-bottom: 1px solid var(--border-color, #ddd); text-align: left;">Leergut</th><th style="padding: 6px; border-bottom: 1px solid var(--border-color, #ddd); text-align: right;">Netto (Soll)</th><th style="padding: 6px; border-bottom: 1px solid var(--border-color, #ddd); text-align: right; color: #2e7d32;">Netto (Ist)</th><th style="padding: 6px; border-bottom: 1px solid var(--border-color, #ddd); text-align: right;">Diff.</th></tr></thead><tbody>`;
        g.entries.forEach(entry => {
            let lgCounts = entry.leergutCounts || {e2:0, h1:0}; let lgStr = [];
            if (lgCounts.e2 > 0) lgStr.push(`${lgCounts.e2} E2`); if (lgCounts.h1 > 0) lgStr.push(`${lgCounts.h1} H1`);
            let diff = entry.nettoIst - (entry.nettoScan || 0); let diffColor = Math.abs(diff) > 0.1 ? '#c62828' : '#2e7d32'; if (entry.nettoScan === 0) diffColor = '#555';
            html += `<tr style="font-size: 13px;"><td style="padding: 6px; border-bottom: 1px solid var(--border-color, #eee);">${entry.brutto.toFixed(2)} kg</td><td style="padding: 6px; border-bottom: 1px solid var(--border-color, #eee);">${lgStr.join(', ') || '-'}</td><td style="padding: 6px; border-bottom: 1px solid var(--border-color, #eee); text-align: right;">${(entry.nettoScan || 0).toFixed(2)} kg</td><td style="padding: 6px; border-bottom: 1px solid var(--border-color, #eee); text-align: right;">${entry.nettoIst.toFixed(2)} kg</td><td style="padding: 6px; border-bottom: 1px solid var(--border-color, #eee); text-align: right; font-weight: bold; color: ${diffColor};">${diff.toFixed(2)} kg</td></tr>`;
        });
        html += `</tbody></table>`;
        let totalDiff = g.nettoIstSum - g.nettoSollSum; let totalDiffColor = Math.abs(totalDiff) > (g.count * 0.1) ? '#c62828' : '#1b5e20'; if (g.nettoSollSum === 0) totalDiffColor = '#1b5e20';
        html += `<div style="background: var(--success-bg, #e8f5e9); padding: 10px; font-size: 14px;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px solid var(--border-color, #ccc);"><span>Summe Netto (Soll):</span><span style="font-weight: bold; color: var(--text-color-secondary, #555);">${g.nettoSollSum.toFixed(2)} kg</span></div><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px solid var(--border-color, #ccc);"><span>Summe Netto (Ist):</span><span style="font-weight: bold; color: #1b5e20;">${g.nettoIstSum.toFixed(2)} kg</span></div><div style="display: flex; justify-content: space-between; align-items: center;"><span style="font-weight: bold;">Gesamtdifferenz:</span><span style="font-weight: bold; color: ${totalDiffColor};">${totalDiff.toFixed(2)} kg</span></div></div></div>`;
    }
    html += `<div style="background: var(--warning-bg, #fff3e0); padding: 15px; border-radius: 8px; border: 1px solid var(--warning-border, #ffe0b2); margin-top: 20px;"><div style="font-weight: bold; margin-bottom: 10px; text-align: center; text-transform: uppercase; font-size: 14px; color: var(--warning-text, #e65100);">Gesamt-Leergut</div><div style="display:flex; justify-content:space-around; font-size: 16px;"><span><b>E2 Kisten:</b> ${totalE2}</span><span><b>H1 Paletten:</b> ${totalH1}</span></div></div>`;
    html += buildBrandenburgTotalsHtml(false);
    content.innerHTML = html; document.getElementById('brandenburg-summary-modal').style.display = 'flex';
}

function printBrandenburgSummary() {
    if (!brandenburgState.entries || brandenburgState.entries.length === 0) {
        showToast('Keine Einträge zum Drucken!', 'warning');
        return;
    }
    let now = new Date(), dateStr = now.toLocaleDateString('de-DE'), timeStr = now.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
    let grouped = {};
    brandenburgState.entries.forEach(e => {
        const key = e.artikel || 'Unbekannter Artikel';
        if(!grouped[key]) { grouped[key] = { chargen: new Set(), nettoSollSum: 0, nettoIstSum: 0, entries: [] }; }
        grouped[key].chargen.add(e.charge); grouped[key].nettoSollSum += e.nettoScan || 0; grouped[key].nettoIstSum += e.nettoIst; grouped[key].count = (grouped[key].count || 0) + 1; grouped[key].entries.push(e);
    });
    let totalE2 = 0; let totalH1 = 0; brandenburgState.entries.forEach(e => { totalE2 += (e.leergutCounts ? e.leergutCounts.e2 : 0) || 0; totalH1 += (e.leergutCounts ? e.leergutCounts.h1 : 0) || 0; });
    const lsNummer = getBrandenburgLsNummer();
    let html = `<div style="font-family: sans-serif; padding: 20px; max-width: 800px; margin: auto;"><h2 style="color: #333; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">Wareneingang Brandenburg</h2><div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px;"><div><b>Datum:</b> ${dateStr}</div><div><b>Uhrzeit:</b> ${timeStr}</div></div>${lsNummer ? `<div style="margin-bottom: 20px; font-size: 14px; padding: 10px; background: #f4f6f9; border-radius: 6px;"><b>LS-Nummer:</b> ${lsNummer}</div>` : ''}`;
    for(let art in grouped) { 
        let g = grouped[art]; let chargenList = Array.from(g.chargen).filter(c => c).join(', ');
        html += `<div style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 20px; overflow: hidden; page-break-inside: avoid;"><div style="background: #f4f6f9; padding: 10px; border-bottom: 1px solid #ddd;"><div style="font-weight: bold; font-size: 16px;">${art}</div><div style="font-size: 12px; color: #555;">Chargen: ${chargenList || '-'}</div></div><table style="width:100%; border-collapse: collapse; font-size: 13px;"><thead style="font-size:11px; background: #fafafa;"><tr style="font-size:11px; background: #fafafa;"><th style="padding: 6px; border-bottom: 1px solid #ddd; text-align: left;">Brutto</th><th style="padding: 6px; border-bottom: 1px solid #ddd; text-align: left;">Leergut</th><th style="padding: 6px; border-bottom: 1px solid #ddd; text-align: right;">Netto (Soll)</th><th style="padding: 6px; border-bottom: 1px solid #ddd; text-align: right;">Netto (Ist)</th><th style="padding: 6px; border-bottom: 1px solid #ddd; text-align: right;">Differenz</th></tr></thead><tbody>`;
        g.entries.forEach(entry => {
            let lgCounts = entry.leergutCounts || {e2:0, h1:0}; let lgStr = [];
            if (lgCounts.e2 > 0) lgStr.push(`${lgCounts.e2} E2`); if (lgCounts.h1 > 0) lgStr.push(`${lgCounts.h1} H1`);
            let diff = entry.nettoIst - (entry.nettoScan || 0); let diffColor = Math.abs(diff) > 0.1 ? '#c62828' : '#2e7d32'; if (entry.nettoScan === 0) diffColor = '#555';
            html += `<tr><td style="padding: 6px; border-bottom: 1px solid #eee;">${entry.brutto.toFixed(2)} kg</td><td style="padding: 6px; border-bottom: 1px solid #eee;">${lgStr.join(', ') || '-'}</td><td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${(entry.nettoScan || 0).toFixed(2)} kg</td><td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right;">${entry.nettoIst.toFixed(2)} kg</td><td style="padding: 6px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: ${diffColor};">${diff.toFixed(2)} kg</td></tr>`;
        });
        let totalDiff = g.nettoIstSum - g.nettoSollSum; let totalDiffColor = Math.abs(totalDiff) > (g.count * 0.1) ? '#c62828' : '#1b5e20'; if (g.nettoSollSum === 0) totalDiffColor = '#1b5e20';
        html += `</tbody></table><div style="background: #e8f5e9; padding: 10px; font-size: 14px; page-break-inside: avoid;"><table style="width: 100%; border-collapse: collapse; font-size: 14px;"><tbody><tr><td style="padding: 4px; font-weight: bold;">Summe Netto (Soll):</td><td style="padding: 4px; font-weight: bold; color: #555; text-align: right;">${g.nettoSollSum.toFixed(2)} kg</td></tr><tr><td style="padding: 4px; font-weight: bold;">Summe Netto (Ist):</td><td style="padding: 4px; font-weight: bold; color: #1b5e20; text-align: right;">${g.nettoIstSum.toFixed(2)} kg</td></tr><tr><td style="padding: 4px; font-weight: bold; border-top: 1px solid #ccc;">Gesamtdifferenz:</td><td style="padding: 4px; font-weight: bold; color: ${totalDiffColor}; text-align: right; border-top: 1px solid #ccc;">${totalDiff.toFixed(2)} kg</td></tr></tbody></table></div></div>`;
    }
    html += `<div style="background: #fff3e0; padding: 15px; border-radius: 8px; border: 1px solid #ffe0b2; margin-top: 20px; page-break-inside: avoid;"><div style="font-weight: bold; margin-bottom: 10px; text-align: center; text-transform: uppercase; font-size: 14px; color: #e65100;">Gesamt-Leergut</div><div style="display:flex; justify-content:space-around; font-size: 16px;"><span><b>E2 Kisten:</b> ${totalE2}</span><span><b>H1 Paletten:</b> ${totalH1}</span></div></div>`;
    html += buildBrandenburgTotalsHtml(true);
    html += `<div style="font-size: 10px; color: #777; text-align: center; margin-top: 50px;">Gedruckt mit Kombi-App</div></div>`;
    if (typeof forcePrint === 'function') {
        forcePrint('WE_Brandenburg_' + dateStr.replace(/\./g, ''), html);
    } else if (typeof printCleanDocument === 'function') {
        printCleanDocument({ title: 'Wareneingang Brandenburg', subtitle: dateStr + ' · ' + timeStr, bodyHtml: html });
    }
}

function exportBrandenburgExcel() {
    if (!brandenburgState.entries || brandenburgState.entries.length === 0) {
        showToast('Keine Einträge zum Exportieren!', 'warning');
        return;
    }
    const rows = brandenburgState.entries.map(e => {
        const lg = e.leergutCounts || { e2: 0, h1: 0 };
        const lgParts = [];
        if (lg.e2 > 0) lgParts.push(lg.e2 + ' E2');
        if (lg.h1 > 0) lgParts.push(lg.h1 + ' H1');
        return {
            "Artikel": e.artikel || '',
            "Charge": e.charge || '',
            "Brutto (kg)": parseFloat(e.brutto || 0).toFixed(2),
            "Leergut": lgParts.join(', ') || '-',
            "Netto Soll (kg)": parseFloat(e.nettoScan || 0).toFixed(2),
            "Netto Ist (kg)": parseFloat(e.nettoIst || 0).toFixed(2),
            "Differenz (kg)": (parseFloat(e.nettoIst || 0) - parseFloat(e.nettoScan || 0)).toFixed(2)
        };
    });
    if (typeof downloadExcelSheet === 'function') {
        downloadExcelSheet(rows, 'Brandenburg', 'WE_Brandenburg_' + new Date().toISOString().split('T')[0] + '.xlsx');
        showToast('Excel Download gestartet!', 'success');
    }
}

// ======================= CHECKLISTE (ARBEITS-ROUTINEN) =======================

function syncMorningChecklistFromTemplate() {
    const template = typeof getMorningChecklistTemplate === 'function'
        ? getMorningChecklistTemplate()
        : [];
    const db = AppStorage.get('kombi_rechner_db', {});
    const today = typeof getLocalISO === 'function' ? getLocalISO() : new Date().toISOString().split('T')[0];
    let daily = db.checklistDaily;
    if (!daily || daily.date !== today) {
        daily = { date: today, morningDone: {}, morningPhotos: {} };
    }
    morningTasks = template.map(t => ({
        id: t.id,
        text: t.text,
        done: !!(daily.morningDone && daily.morningDone[t.id]),
        photo: (daily.morningPhotos && daily.morningPhotos[t.id]) || null,
        fromTemplate: true
    }));
    db.checklistDaily = daily;
    db.morningTasks = morningTasks;
    AppStorage.set('kombi_rechner_db', db);
}

window.syncMorningChecklistFromTemplate = syncMorningChecklistFromTemplate;

window.switchChecklistTab = function(tabId) {
    document.querySelectorAll('.checklist-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.checklist-view').forEach(view => view.style.display = 'none');
    const activeBtn = document.getElementById('checklist-tab-' + tabId); const activeView = document.getElementById('checklist-view-' + tabId);
    if(activeBtn) activeBtn.classList.add('active'); if(activeView) activeView.style.display = 'block';
};

function initChecklist() {
    syncMorningChecklistFromTemplate();
    const formMorning = document.getElementById('form-morning');
    if (formMorning) formMorning.style.display = 'none';
    const formAdhoc = document.getElementById('form-adhoc');
    if (formAdhoc && !formAdhoc.hasAttribute('data-init')) { formAdhoc.addEventListener('submit', function(e) { e.preventDefault(); addAdhocTask(); }); formAdhoc.setAttribute('data-init', '1'); }
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn && !resetBtn.hasAttribute('data-init')) { resetBtn.addEventListener('click', function(e) { e.preventDefault(); resetMorningTasks(); }); resetBtn.setAttribute('data-init', '1'); }
    const micBtn = document.querySelector('#form-adhoc #mic-checklist');
    if (micBtn && !micBtn.hasAttribute('data-init')) { micBtn.addEventListener('click', function(e) { e.preventDefault(); if (typeof startVoiceRecognition === 'function') startVoiceRecognition('input-adhoc'); }); micBtn.setAttribute('data-init', '1'); }
    renderChecklist();
}

function renderChecklist() {
    const morningList = document.getElementById('morning-list'); const adhocList = document.getElementById('adhoc-list');
    if (!morningList || !adhocList) return;
    let fileInput = document.getElementById('task-photo-input');
    if (!fileInput) { fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.id = 'task-photo-input'; fileInput.accept = 'image/*'; fileInput.capture = 'environment'; fileInput.style.display = 'none'; fileInput.onchange = handleTaskPhotoUpload; document.body.appendChild(fileInput); }

    if (!morningTasks || morningTasks.length === 0) {
        const empty = document.getElementById('morning-empty'); if(empty) empty.style.display = 'block'; morningList.innerHTML = '';
    } else {
        const empty = document.getElementById('morning-empty'); if(empty) empty.style.display = 'none';
        let doneCount = 0;
        morningList.innerHTML = morningTasks.map((t, i) => {
            if (t.done) doneCount++;
            let bg = t.done ? 'var(--success-bg, #e8f5e9)' : 'var(--bg-card, #fff)'; let color = t.done ? 'var(--success, #2e7d32)' : 'var(--text-color, #333)'; let textDec = t.done ? 'line-through' : 'none';
            let photoIcon = t.photo ? `<span onclick="viewTaskPhoto('morning', ${i}); event.stopPropagation();" style="font-size:22px; color:var(--primary, #004b93); cursor:pointer; padding:5px;">🖼️</span>` : `<span onclick="triggerTaskPhoto('morning', ${i}); event.stopPropagation();" style="font-size:22px; filter:grayscale(1); opacity:0.3; cursor:pointer; padding:5px;">📷</span>`;
            return `<li style="margin: 0 0 5px 0;"><div class="checklist-task-row${t.done ? ' done' : ''}" onclick="toggleTask('morning', ${i})"><input type="checkbox" ${t.done ? 'checked' : ''} tabindex="-1" aria-hidden="true"><span class="checklist-task-text">${t.text}</span>${photoIcon}</div></li>`;
        }).join('');
        const total = morningTasks.length; const percent = total > 0 ? (doneCount / total) * 100 : 0;
        const progressEl = document.getElementById('checklist-progress-bar'); if (progressEl) progressEl.style.width = percent + '%';
        const progressText = document.getElementById('checklist-progress-text'); if (progressText) progressText.innerText = `${doneCount}/${total} erledigt`;
    }

    if (!adhocTasks || adhocTasks.length === 0) {
        const empty = document.getElementById('adhoc-empty'); if(empty) empty.style.display = 'block'; adhocList.innerHTML = '';
        let clearBtn = document.getElementById('clear-adhoc-btn'); if(clearBtn) clearBtn.remove();
    } else {
        const empty = document.getElementById('adhoc-empty'); if(empty) empty.style.display = 'none';
        adhocList.innerHTML = adhocTasks.map((t, i) => {
            let bg = t.done ? 'var(--success-bg, #e8f5e9)' : 'var(--bg-card, #fff)'; let color = t.done ? 'var(--success, #2e7d32)' : 'var(--text-color, #333)'; let textDec = t.done ? 'line-through' : 'none'; let borderCol = t.done ? 'var(--success, #2e7d32)' : 'var(--warning, #ff9800)';
            let photoIcon = t.photo ? `<span onclick="viewTaskPhoto('adhoc', ${i}); event.stopPropagation();" style="font-size:22px; color:var(--primary, #004b93); cursor:pointer; padding:5px;">🖼️</span>` : `<span onclick="triggerTaskPhoto('adhoc', ${i}); event.stopPropagation();" style="font-size:22px; filter:grayscale(1); opacity:0.3; cursor:pointer; padding:5px;">📷</span>`;
            return `<li class="swipe-wrap" style="margin: 0 0 10px 0;"><div class="swipe-bg" onclick="deleteAdhocTask(${i})"><span>🗑️</span></div><div class="palette-card swipeable checklist-task-row${t.done ? ' done' : ''}" onclick="toggleTask('adhoc', ${i})" style="margin: 0; padding:15px; border-left-color:${borderCol}; cursor:pointer;"><div style="flex:1; display:flex; align-items:center; gap:12px;"><input type="checkbox" ${t.done ? 'checked' : ''} tabindex="-1" aria-hidden="true"><span class="checklist-task-text">${t.text}</span>${photoIcon}</div></div></li>`;
        }).join('');
        if (adhocTasks.some(t => t.done)) { if (!document.getElementById('clear-adhoc-btn')) { const btn = document.createElement('button'); btn.id = 'clear-adhoc-btn'; btn.className = 'clear-btn'; btn.style.cssText = 'width:100%; padding:10px; font-size:14px; margin-top:15px;'; btn.innerText = '🧹 Erledigte Aufgaben ausblenden'; btn.onclick = clearDoneAdhocTasks; adhocList.parentNode.appendChild(btn); } } 
        else { let clearBtn = document.getElementById('clear-adhoc-btn'); if(clearBtn) clearBtn.remove(); }
    }
}

window.toggleTask = function(type, index) { if(type === 'morning') morningTasks[index].done = !morningTasks[index].done; else adhocTasks[index].done = !adhocTasks[index].done; saveRechnerDB(); renderChecklist(); };
window.addMorningTask = function() { showToast("Morgen-Routinen im Control Center bearbeiten", "warning"); };
window.deleteMorningTask = function() { showToast("Vorlage nur im Control Center änderbar", "warning"); };
window.addAdhocTask = function() { const input = document.getElementById('input-adhoc'); if(!input || !input.value.trim()) { showToast("Bitte Aufgabe eingeben", "warning"); return; } if(!adhocTasks) adhocTasks = []; adhocTasks.unshift({ id: Date.now().toString(), text: input.value.trim(), done: false }); input.value = ''; saveRechnerDB(); renderChecklist(); showToast("Aufgabe hinzugefügt", "success"); };
window.deleteAdhocTask = function(index) { adhocTasks.splice(index, 1); saveRechnerDB(); renderChecklist(); showToast("Aufgabe gelöscht", "success"); };
window.clearDoneAdhocTasks = function() { adhocTasks = adhocTasks.filter(t => !t.done); saveRechnerDB(); renderChecklist(); showToast("Aufgeräumt!", "success"); };

let currentPhotoTaskType = null; let currentPhotoTaskIndex = null;
window.triggerTaskPhoto = function(type, index) { currentPhotoTaskType = type; currentPhotoTaskIndex = index; const fi = document.getElementById('task-photo-input'); if(fi) fi.click(); };
window.handleTaskPhotoUpload = function(event) {
    const file = event.target.files[0]; if(!file) return; showToast("Verarbeite Foto...", "warning");
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); let ctx = canvas.getContext('2d'); let MAX_WIDTH = 800; let MAX_HEIGHT = 800; let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
            canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL('image/jpeg', 0.6);
            if(currentPhotoTaskType === 'morning') morningTasks[currentPhotoTaskIndex].photo = base64; else if(currentPhotoTaskType === 'adhoc') adhocTasks[currentPhotoTaskIndex].photo = base64;
            saveRechnerDB(); renderChecklist(); showToast("Foto gespeichert!", "success");
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
};
window.viewTaskPhoto = function(type, index) {
    let task = type === 'morning' ? morningTasks[index] : adhocTasks[index];
    if (task && task.photo) {
        let modal = document.getElementById('task-photo-modal');
        if (!modal) {
            modal = document.createElement('div'); modal.id = 'task-photo-modal';
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:100000; display:flex; justify-content:center; align-items:center; flex-direction:column; padding:20px; box-sizing:border-box;';
            modal.innerHTML = `<img id="task-photo-img" style="max-width:100%; max-height:80vh; border-radius:12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); object-fit:contain;"><div style="margin-top:20px; display:flex; gap:15px; width:100%; max-width:400px;"><button id="task-photo-close-btn" style="flex:1; padding:12px; background:#fff; color:#000; border:none; border-radius:8px; font-weight:bold; font-size:16px;">Schließen</button><button id="task-photo-delete-btn" style="flex:1; padding:12px; background:#dc3545; color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:16px;">🗑️ Löschen</button></div>`;
            document.body.appendChild(modal);
        }
        document.getElementById('task-photo-img').src = task.photo; document.getElementById('task-photo-close-btn').onclick = () => { modal.style.display = 'none'; };
        document.getElementById('task-photo-delete-btn').onclick = function() { customConfirm("Foto wirklich löschen?", () => { task.photo = null; saveRechnerDB(); renderChecklist(); modal.style.display = 'none'; showToast("Foto gelöscht", "success"); }); };
        modal.style.display = 'flex';
    }
};
window.resetMorningTasks = function() { customConfirm("Morgen-Routinen zurücksetzen?", () => { morningTasks.forEach(t => t.done = false); saveRechnerDB(); renderChecklist(); showToast("Routinen zurückgesetzt!", "success"); }); };

window.resetLadeProgress = function(silent) {
    document.querySelectorAll('[id$="-count"]').forEach(el => {
        if(el.id && el.id.startsWith('lp-')) {
            let total = el.innerText.split('/')[1] ? el.innerText.split('/')[1].trim() : '0';
            el.innerText = '0 / ' + total;
        }
    });
    const cb = document.getElementById('lp-partial-cb');
    if(cb) cb.checked = false;
    if(silent !== true) showToast("Lade-Fortschritt zurückgesetzt!", "success");
};

window.clearLadeAssiInputs = function() {
    ['lg-soll-e2', 'lg-soll-h1', 'lg-soll-eu'].forEach(id => {
        let el = document.getElementById(id);
        if(el) el.value = '';
    });
    let e2pal = document.getElementById('lg-e2-per-pal');
    if(e2pal) e2pal.value = '40';
    let resDiv = document.getElementById('ladeplan-result');
    if(resDiv) resDiv.style.display = 'none';
    resetLadeProgress(true);
    showToast("Lade-Assistent geleert!", "success");
};