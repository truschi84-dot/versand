function formatMHD(el) {
    let val = el.value.replace(/[^\d]/g, '');
    if (val.length > 4) val = val.substring(0, 4);
    if (val.length > 2) el.value = val.substring(0, 2) + '.' + val.substring(2);
    else el.value = val;
}

let entries = [], entriesSort = [], entriesNoelke = [];
let sonderTemplates = [];
let reklamationDrafts = {};
let customTabEntries = {};
let selectedSorte = "", selectedNoelke = "", isSonderMode = false, currentSearchType = "";
let isSonderModeSort = false;

let activeSorteFilter = 'all'; 

// ======================= DB & SYNC =======================

function loadRechnerData() {
    try {
        const db = AppStorage.get('kombi_rechner_db', {});
        entries = db.entries || []; entriesSort = db.entriesSort || []; entriesNoelke = db.entriesNoelke || [];
        sonderTemplates = db.sonderTemplates || [];
        reklamationDrafts = db.reklamationDrafts || {};
        customTabEntries = db.customTabEntries || {};
        
        if(typeof buildAppUI === 'function') buildAppUI();

        if(typeof renderLKW === 'function') { renderLKW(); renderSort(); renderNoelke(); }
    } catch(e) { console.error("Fehler in loadRechnerData", e); }
}

function saveRechnerDB() {
    try {
        const db = AppStorage.get('kombi_rechner_db', {});
        db.entries = entries; db.entriesSort = entriesSort; db.entriesNoelke = entriesNoelke;
        db.sonderTemplates = sonderTemplates;
        db.reklamationDrafts = reklamationDrafts;
        db.customTabEntries = customTabEntries;
        AppStorage.set('kombi_rechner_db', db);
        if (typeof triggerAutoSync === 'function') triggerAutoSync();
    } catch(e) { console.error("Fehler in saveRechnerDB", e); }
}

async function loadAllFromCloud() {
    const btn = document.getElementById('global-sync-btn');
    if(btn) btn.classList.add('sync-active');
    try {
        const res = await fetch(APP_CONFIG.CLOUD_URL + ".json?t=" + Date.now(), { credentials: 'omit' });
        const data = await res.json();
        if(data) {
            const lDb = AppStorage.get('kombi_logistik_db', {});
            if (Array.isArray(data.suppliers)) lDb.suppliers = data.suppliers;
            if (Array.isArray(data.customers)) lDb.customers = data.customers;
            if (Array.isArray(data.articles)) lDb.articles = data.articles;
            if (Array.isArray(data.lose)) lDb.lose = data.lose;
            if (Array.isArray(data.todo)) lDb.todo = data.todo;
            if (Array.isArray(data.later)) lDb.later = data.later;
            if (Array.isArray(data.hidden)) lDb.hidden = data.hidden;
            if (Array.isArray(data.workers)) lDb.workers = data.workers;
            if (Array.isArray(data.deliveries)) lDb.deliveries = data.deliveries;
            if (data.dailyStaff) lDb.dailyStaff = data.dailyStaff;
            if (data.dailyAttendance) lDb.dailyAttendance = data.dailyAttendance;
            if (data.workerColors) lDb.workerColors = data.workerColors;
            if (data.settings) lDb.settings = data.settings;
            AppStorage.set('kombi_logistik_db', lDb);
            
            const rDb = AppStorage.get('kombi_rechner_db', {});
            if (Array.isArray(data.savedProdukteRaw)) rDb.savedProdukteRaw = data.savedProdukteRaw;
            if (Array.isArray(data.sonderTemplates)) rDb.sonderTemplates = data.sonderTemplates;
            // +++ KI-NOTIZ: BITTE NICHT MEHR ÄNDERN! +++
            // Die Synchronisations-Logik steht fest:
            // - LKW (entries) -> synchron (auf allen Handys gleich)
            // - Sortieren (entriesSort) -> lokal
            // - Nölke (entriesNoelke) -> lokal
            // - Leergut -> lokal
            if (Array.isArray(data.entries)) rDb.entries = data.entries;
            AppStorage.set('kombi_rechner_db', rDb);
            
            if (typeof loadLocalDB === 'function') loadLocalDB(); 
            if (typeof loadRechnerData === 'function') loadRechnerData();
            updateLiefDropdowns(); 
            if (typeof addAppCloudLog === 'function') addAppCloudLog("DOWNLOAD: Listen aktualisiert [OK]");
            showToast("✅ Listen aktualisiert!", "success");
        }
    } catch(e) { 
        console.error(e); showToast("Cloud-Fehler", "error"); 
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Listen-Update fehlgeschlagen - " + e.message);
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
    } catch(e) { console.error("Fehler in updateLiefDropdowns", e); }
}

function switchTab(tabId) {
    try {
        document.querySelectorAll('#app2_wrapper .tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('#app2_wrapper .tab-btn').forEach(b => b.classList.remove('active'));
        
        let activeContent = document.getElementById('tab-' + tabId);
        let activeButton = document.getElementById('btn-tab-' + tabId);
        
        if (activeContent) activeContent.classList.add('active');
        if (activeButton) activeButton.classList.add('active');
    } catch(e) { console.error("Fehler in switchTab", e); }
}

// ======================= MODAL SEARCH =======================

function openSearchModal(type) {
    try {
        currentSearchType = type; document.getElementById('search-modal').style.display = 'flex';
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
        setTimeout(() => document.getElementById('modal-search-input').focus(), 100);
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

function closeSearchModal() { document.getElementById('search-modal').style.display = 'none'; }

function filterResults() {
    try {
        const qRaw = document.getElementById('modal-search-input').value;
        const q = qRaw.toLowerCase(); 
        let html = "";
        
        let gs1Data = parseGS1(qRaw);
        
        if(currentSearchType === 'sorte') {
            const lValue = document.getElementById('lief-sort') ? document.getElementById('lief-sort').value : "";
            const l = lValue ? lValue.trim().toLowerCase() : "";
            
            const lDb = AppStorage.get('kombi_logistik_db', {});
            const articles = Array.isArray(lDb.articles) ? lDb.articles : [];
            const loseList = Array.isArray(lDb.lose) ? lDb.lose : []; 
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
                    const articleNameLower = (a.name || '').toLowerCase();
                    const isExport = articleNameLower.includes('exp') || articleNameLower.includes('ex');
                    
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
            html = res.map(p => `<div class="result-item" onclick="selectResult('${p.replace(/'/g, "\\'")}')">${p}</div>`).join('');
        }
        document.getElementById('modal-results').innerHTML = html || '<div style="padding:20px; color:#999;">Nichts gefunden...</div>';
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

function resetSorteSelection() { selectedSorte = ""; document.getElementById('selected-sorte-display').innerText = "Bitte Sorte wählen..."; document.getElementById('selected-sorte-display').style.background = "#fff"; }
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
    const lief = document.getElementById('lief').value; let p = { id: Date.now().toString(), lief, type: isSonderMode?'sonder':'normal' };
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
    
    let html = '<div class="summary-card"><div class="summary-title">Lieferanten-Übersicht</div>';
    for(let l in stats) {
        let info = []; 
        for(let key in stats[l].leergut) { if(stats[l].leergut[key] > 0) info.push(`${stats[l].leergut[key]} ${key}`); }
        if(stats[l].kart) info.push(stats[l].kart+' Krt');
        html += `<div class="sup-item-box">
            <span><b>${l}</b></span> 
            <span class="sup-leergut-inline">${info.join(', ')}</span> 
            <div style="display:flex; align-items:center; gap:5px;">
                <span class="sup-weight-tag">${stats[l].n.toFixed(2).replace('.',',')} kg</span>
                <button onclick="openReklamationModal('${l.replace(/'/g, "\\'")}', ${stats[l].n})" style="background:#ffc107; color:black; border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer;" title="Reklamation erfassen">❗</button>
            </div>
        </div>`;
    }
    html += '</div>';
    let gridHtml = ''; for(let key in totals) { if(totals[key] > 0 || config.some(c => c.name === key)) gridHtml += `<span>${key}: ${totals[key]}</span>`; }
    html += `<div class="leergut-card"><div class="leergut-title">Gesamt-Überblick LKW</div><div class="leergut-grid">${gridHtml}<span style="color:var(--sonder)">Kartons: ${tKart}</span></div></div>`;
    document.getElementById('list').innerHTML = html + entries.map((e,i) => {
        let details = e.type==='sonder' ? `Sonderp. | MHD: ${e.mhd||'-'} | Von: ${e.herkunft||'-'}${e.e2 ? ` | ${e.e2} E2` : ''}` : e.details;
        return `<div class="swipe-wrap" style="margin: 0 10px 8px 10px;"><div class="swipe-bg" onclick="deleteLkwEntry(${i})"><span>🗑️</span></div><div class="palette-card swipeable" onclick="openEditLKW(${i})" style="margin: 0;"><div style="flex:1"><b>${e.type==='sonder'?'📦 ':''}${e.lief}</b><div style="font-size:10px; color:#777; margin-top:3px;">${details}</div></div><div style="display:flex; align-items:center; gap:10px;"><span style="font-weight:bold;">${e.netto.toFixed(2).replace('.',',')} kg</span></div></div></div>`;
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
                        <div style="font-size:11px; color:#777; margin-top:4px;">Brutto: ${brutto.toFixed(2).replace('.',',')} kg &nbsp;|&nbsp; ${infoStr}</div>
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
    let einheit = "E2";
    const config = getLeergutConfig();
    if(config.length > 0) einheit = config[0].name;

    document.getElementById('list-noelke').innerHTML = entriesNoelke.map((e,i) => `
    <div class="swipe-wrap" style="margin: 0 10px 8px 10px;">
        <div class="swipe-bg" onclick="deleteNoelkeEntry(${i})"><span>🗑️</span></div>
        <div class="palette-card swipeable" style="border-left-color:#137333; margin: 0; display:flex; align-items:center; gap:12px; padding: 10px 15px;">
            <input type="checkbox" class="print-noelke-cb" data-index="${i}" style="width: 22px; height: 22px; cursor: pointer; margin:0;" onclick="event.stopPropagation()">
            <div style="flex:1" onclick="openEditNoelke(${i})">
                <b style="font-size:14px;">${e.prod}</b>
                <div style="font-size:11px; color:#777; margin-top:3px;">${e.e2} ${einheit} &nbsp;|&nbsp; MHD: ${e.mhd}</div>
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
function fullResetSort() { customConfirm("Sortierung löschen?", () => { entriesSort = []; saveRechnerDB(); renderSort(); showToast("Sortierung geleert", "success"); }); }
function fullResetNoelke() { 
    customConfirm("Nölke Eingaben & Liste löschen?", () => { 
        entriesNoelke = []; saveRechnerDB(); renderNoelke(); 
        ["n-e2","n-mhd","n-kg", "n-charge"].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ""; });
        showToast("Nölke Liste geleert", "success"); 
    }); 
}

function toggleCalc(s) { document.getElementById('calc-modal').style.display = s ? 'flex' : 'none'; }
function initCalc() { const btns = ['7','8','9','÷','4','5','6','×','1','2','3','−','0',',','+','=']; const cont = document.getElementById('c-grid-btns'); btns.forEach(b => { const el = document.createElement('button'); el.className = isNaN(b) && b !== ',' ? "c-btn c-op" : "c-btn"; if(b === '=') el.className = "c-btn c-op"; el.innerText = b; el.onclick = () => handleCalc(b); cont.appendChild(el); }); }
let isResultShown = false;
function handleCalc(b) { const d = document.getElementById('c-disp'); if(b === '=') { try { const expr = d.value.replace(/×/g,'*').replace(/÷/g,'/').replace(/,/g,'.'); d.value = new Function('return ' + expr)().toString().replace('.',','); isResultShown = true; } catch(e) { d.value = "Fehler"; } } else { if(d.value === "0" || isResultShown) { d.value = b; isResultShown = false; } else d.value += b; } }

// ======================= DYNAMISCHES LEERGUT KONFIGURATION =======================

function getLeergutConfig() {
    const lDb = AppStorage.get('kombi_logistik_db', {}); const company = lDb.company || {};
    const str = company.leergut || "E2:2.0, Herta:2.5, H1:18.0, Euro:21.0";
    return str.split(',').map((s, idx) => {
        let parts = s.split(':'); if(parts.length < 2) return null;
        return { id: 'lg_' + idx, name: parts[0].trim(), weight: parseFloat(parts[1]) || 0 };
    }).filter(lg => lg && lg.name && lg.weight > 0);
}

window.toggleNoPalDynamic = function(prefix) {
    const cb = document.getElementById('no-pal-cb-' + prefix);
    if(!cb) return;
    const isChecked = cb.checked;
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

        if (includeNoPal) {
            html += `<div style="margin: 8px 0; display: flex; align-items: center; gap: 8px; background: #ffebee; padding: 6px 10px; border-radius: 6px; border: 1px solid #ffcdd2;" onclick="document.getElementById('no-pal-cb-${prefix}').click()">
                <input type="checkbox" id="no-pal-cb-${prefix}" onchange="toggleNoPalDynamic('${prefix}')" onclick="event.stopPropagation()" style="width: 18px; height: 18px;">
                <label style="font-size: 11px; font-weight: bold; color: var(--danger); text-transform: uppercase;">Keine Palette</label>
            </div>`;
        }
        
        let buttonsHtml = "";
        if (prefix === 'lkw') {
            buttonsHtml = `<div style="display:flex; gap:5px; align-items:flex-end; padding-bottom:8px;">
                <button class="clear-btn" onclick="fullReset()">↺</button>
                <button class="sonder-toggle-btn" onclick="toggleSonderMode()">+ Sonderp.</button>
                <button class="add-btn" style="flex:1" onclick="addPal()">+ Speichern</button>
            </div>`;
        } else if (prefix === 'sort') {
            buttonsHtml = `<div style="display:flex; gap:5px; align-items:flex-end; padding-bottom:8px;">
                <button class="clear-btn" onclick="fullResetSort()">↺</button>
                <button class="sonder-toggle-btn" onclick="toggleSonderModeSort()">+ Sonderp.</button>
                <button class="add-btn" style="flex:1" onclick="addSort()">+ Speichern</button>
            </div>`;
        }

        let itemsInRow2 = lgConfig.slice(2, 4).length;
        if (itemsInRow2 > 0 || buttonsHtml !== "") {
            html += `<div class="grid-row-2" ${prefix === 'edit' ? 'style="margin-top: 10px;"' : ''}>`;
            lgConfig.slice(2, 4).forEach(lg => {
                let isPal = lg.weight >= 15 && lg.weight <= 25;
               let defaultVal = (isPal && prefix !== 'edit' && lg.name.toUpperCase().includes('H1')) ? '1' : '';
                html += `<div class="field"><label>${lg.name} (${lg.weight})</label><input type="number" id="${prefix}_${lg.id}" placeholder="0" value="${defaultVal}" data-ispal="${isPal}" inputmode="numeric" onfocus="this.select()"></div>`;
            });
            for(let i = itemsInRow2; i < 2; i++) { if (prefix !== 'edit') html += `<div class="field" style="visibility:hidden;"></div>`; }
            html += buttonsHtml;
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