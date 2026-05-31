// =========================================================================
// 🤖 AI-REMINDER: WIR SIND IN DER BETA! 🤖
// AI-Notiz: Dies ist die Beta-Umgebung.
// Alle zukünftigen Anpassungen, Features und Fixes bitte strikt in den 
// *_beta.* Dateien durchführen, es sei denn, der Nutzer fordert explizit 
// ein Deployment ins Live-System.
// =========================================================================
let suppliers = [], customers = [], workers = [], deliveries = [], dailyStaff = {}, dailyAttendance = {}, workerColors = {}, articles = [], curId = null, curDate = null;
let todo = [], lose = [], later = [], hidden = [];
let activeV10Tab = 'todo', currentTargetId = null, lastAction = null, editingFertigId = null;
let assignMode = 'sup', assignSelectedTarget = null;
const getLocalISO = () => { let d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]; };

function loadLocalDB() {
    const val = AppStorage.get('kombi_logistik_db', {});
    suppliers = val.suppliers || []; 
    customers = val.customers || [];
    workers = val.workers || ["Ahmed", "Dominik", "Robert", "Julian", "Alex"]; 
    deliveries = val.deliveries ? (Array.isArray(val.deliveries) ? val.deliveries : Object.values(val.deliveries)) : []; 
    dailyStaff = val.dailyStaff || {}; 
    dailyAttendance = val.dailyAttendance || {}; 
    workerColors = val.workerColors || {"Ahmed":"#ff0000","Alex":"#0000ff","Dominik":"#ffff00","Julian":"#000000","Robert":"#00ff00"}; 
    articles = val.articles || [];
    todo = val.todo || [];
    lose = val.lose || [];
    later = val.later || [];
    hidden = val.hidden || [];
    renderApp1(); 
    if (typeof renderAnalysis === 'function') renderAnalysis();
    if (typeof updateLiefDropdowns === 'function') updateLiefDropdowns(); 
}

function saveLocalDB() { 
    const val = AppStorage.get('kombi_logistik_db', {});
    val.suppliers = suppliers;
    val.customers = customers;
    val.workers = workers;
    val.deliveries = deliveries;
    val.dailyStaff = dailyStaff;
    val.dailyAttendance = dailyAttendance;
    val.workerColors = workerColors;
    val.articles = articles;
    val.todo = todo;
    val.lose = lose;
    val.later = later;
    val.hidden = hidden;
    AppStorage.set('kombi_logistik_db', val); 
    renderApp1(); 
    if (typeof renderAnalysis === 'function') renderAnalysis(); 
    if (typeof updateLiefDropdowns === 'function') updateLiefDropdowns(); 
    if (typeof triggerAutoSync === 'function') triggerAutoSync();
}

function backupToCloud() {
    const btn = document.getElementById('firebase-backup-btn');
    if(btn) { btn.innerHTML = "⏳ Speichere in Cloud..."; btn.disabled = true; }
    
    saveLocalDB();
    
    // Beide Silos für die Cloud zusammenführen
    const lData = AppStorage.get('kombi_logistik_db', {});
    const rData = AppStorage.get('kombi_rechner_db', {});
    const combinedData = {
        suppliers: lData.suppliers || [],
        customers: lData.customers || [],
        articles: lData.articles || [],
        lose: lData.lose || [],
        todo: lData.todo || [],
        later: lData.later || [],
        hidden: lData.hidden || [],
        workers: lData.workers || [],
        deliveries: lData.deliveries || [],
        dailyStaff: lData.dailyStaff || {},
        dailyAttendance: lData.dailyAttendance || {},
        workerColors: lData.workerColors || {},
        settings: lData.settings || {},
        savedProdukteRaw: rData.savedProdukteRaw || [],
        sonderTemplates: rData.sonderTemplates || []
    };
    
    fetch(APP_CONFIG.CLOUD_URL + ".json", { 
        method: 'PUT', 
        body: JSON.stringify(combinedData), 
        headers: { 'Content-Type': 'application/json' }
    })
        .then(res => {
            if (!res.ok) throw new Error("Server Fehler");
            return res.json();
        })
        .then(() => {
            if(btn) { btn.innerHTML = '<span style="font-size:20px;">☁️</span> In Cloud sichern'; btn.disabled = false; }
            AppStorage.setRaw('logistik_last_backup_day', getLocalISO());
            closeBackupModal();
            if (typeof addAppCloudLog === 'function') addAppCloudLog("UPLOAD: Manuelles Backup gesichert [OK]");
            showToast("Erfolgreich in der Cloud gesichert!", "success");
        })
        .catch(e => {
            console.error("Backup Fehler:", e);
            if(btn) { btn.innerHTML = '<span style="font-size:20px;">☁️</span> In Cloud sichern'; btn.disabled = false; }
            if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Upload fehlgeschlagen - " + e.message);
            showToast("Fehler beim Sichern in der Cloud.", "error");
        });
}

function restoreFromCloud() {
    const btn = document.getElementById('firebase-restore-btn');
    if(btn) { btn.innerHTML = "⏳ Lade aus Cloud..."; btn.disabled = true; }
    
    fetch(APP_CONFIG.CLOUD_URL + ".json?t=" + Date.now())
        .then(res => {
            if (!res.ok) throw new Error("Server Fehler");
            return res.json();
        })
        .then(data => {
            if(btn) { btn.innerHTML = '<span style="font-size:20px;">🔄</span> Aus Cloud laden'; btn.disabled = false; }
            
            if (!data || Object.keys(data).length === 0) { showToast("Kein Backup gefunden.", "warning"); return; }
            
            // Daten aus der Cloud wieder sauber auf Logistik und Rechner aufteilen
            let lDb = AppStorage.get('kombi_logistik_db', {});
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
            
            let rDb = AppStorage.get('kombi_rechner_db', {});
            if (Array.isArray(data.savedProdukteRaw)) rDb.savedProdukteRaw = data.savedProdukteRaw;
            if (Array.isArray(data.sonderTemplates)) rDb.sonderTemplates = data.sonderTemplates;
            AppStorage.set('kombi_rechner_db', rDb);
            
            loadLocalDB(); // Logistik UI updaten
            if(typeof loadRechnerData === 'function') loadRechnerData(); // Rechner UI updaten
            
            if (typeof addAppCloudLog === 'function') addAppCloudLog("DOWNLOAD: Daten aus Cloud geladen [OK]");
            showToast("Daten erfolgreich geladen!", "success");
        })
        .catch(e => {
            if(btn) { btn.innerHTML = '<span style="font-size:20px;">🔄</span> Aus Cloud laden'; btn.disabled = false; }
            if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Download fehlgeschlagen - " + e.message);
            showToast("Fehler beim Laden.", "error");
        });
}

function checkBackupReminder() { const now = new Date(); if (now.getHours() >= 5 && AppStorage.getRaw('logistik_last_backup_day') !== getLocalISO()) { document.getElementById('backupReminderModal').style.display = "flex"; } }
function closeBackupModal() { document.getElementById('backupReminderModal').style.display = "none"; AppStorage.setRaw('logistik_last_backup_day', getLocalISO()); }
function getWColor(name) { return workerColors[name] || "#cccccc"; }
function updateWorkerColor(name, color) { workerColors[name] = color; saveLocalDB(); }
function selectWorkerForShare(w, el) {
    const parent = el.parentElement; parent.querySelectorAll('.worker-tag-btn').forEach(b => { b.style.background = '#eee'; b.style.color = '#000'; });
    el.style.background = getWColor(w); el.style.color = '#fff'; parent.dataset.value = w;
}

function renderApp1() {
    const selDate = document.getElementById('selectedWorkDate') ? document.getElementById('selectedWorkDate').value : null; 
    if(!selDate) return;
    
    let allSups = [...suppliers].sort();
    if(document.getElementById('supplierSelect')) document.getElementById('supplierSelect').innerHTML = allSups.map(s => `<option value="${s}">${s}</option>`).join('');
    
    const mwSelect = document.getElementById('modalWorkerSelect');
    if(mwSelect) {
        let container = mwSelect;
        if(mwSelect.tagName === 'SELECT') { container = document.createElement('div'); container.id = 'modalWorkerSelect'; mwSelect.parentNode.replaceChild(container, mwSelect); }
        container.innerHTML = workers.map((w, i) => `<div class="worker-tag-btn" onclick="selectWorkerForShare('${w}', this)" style="padding:8px 15px; background:${i===0?getWColor(w):'#eee'}; color:${i===0?'#fff':'#000'}; border-radius:20px; cursor:pointer; display:inline-block; margin:5px; font-weight:bold; border:1px solid #ccc; box-shadow:0 1px 3px rgba(0,0,0,0.1); transition:all 0.2s;">${w}</div>`).join(''); 
        container.dataset.value = workers[0] || '';
    }

    if(document.getElementById('artSupplierCheckboxes')) { document.getElementById('artSupplierCheckboxes').innerHTML = allSups.map(s => `<label style="display:flex; align-items:center; gap:5px; background:#fff; padding:5px 10px; border:1px solid #ddd; border-radius:15px; font-size:12px; cursor:pointer;"><input type="checkbox" value="${s}" class="art-sup-cb" style="width:auto; margin:0;"> ${s}</label>`).join(''); }
    if(document.getElementById('workerCheckboxes')) { document.getElementById('workerCheckboxes').innerHTML = workers.map(w => `<label style="display:flex; align-items:center; gap:5px; background:#fff; padding:5px 10px; border:1px solid #ddd; border-radius:15px; font-size:12px; cursor:pointer;"><input type="checkbox" value="${w}" class="worker-cb" style="width:auto; margin:0;"> ${w}</label>`).join(''); }
    
    
    if(document.getElementById('worList')) {
        document.getElementById('worList').innerHTML = workers.map((w,i) => `
        <div class="swipe-wrap" style="margin-bottom:0; border-radius:0;">
            <div class="swipe-bg" onclick="workers.splice(${i},1); saveLocalDB(); showToast('Mitarbeiter entfernt', 'success');"><span>🗑️</span></div>
            <div class="worker-list-item swipeable"><div style="display:flex; align-items:center; gap:15px;"><div class="color-preview" style="background:${getWColor(w)}"><input type="color" value="${getWColor(w)}" onchange="updateWorkerColor('${w}', this.value)"></div><b style="font-size:16px;">${w}</b></div></div>
        </div>`).join('');
    }

    if(document.getElementById('pageArticles') && document.getElementById('pageArticles').classList.contains('active')) {
        renderV10Table();
    }
    if(document.getElementById('pageSortimente') && document.getElementById('pageSortimente').classList.contains('active')) {
        if(assignSelectedTarget === null) {
            renderAssignLeft();
            renderAssignRight();
        }
    }

    if(document.getElementById('supList')) {
        document.getElementById('supList').innerHTML = suppliers.map((s,i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border-color, #eee); background: var(--bg-card, white);">
            <div style="font-size: 16px; font-weight: bold; color: #333;">${s}</div>
            <div style="display: flex; gap: 8px;">
                <button onclick="openEditSupModal('${s}')" style="background: var(--info-bg, #e3f2fd); border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 16px;">✏️</button>
                <button onclick="deleteSupplier('${s}')" style="background: var(--danger-bg, #ffebee); border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 16px;">🗑️</button>
            </div>
        </div>`).join('');
    }

    if(document.getElementById('custList')) {
        document.getElementById('custList').innerHTML = customers.map((c,i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border-color, #eee); background: var(--bg-card, white);">
            <div style="font-size: 16px; font-weight: bold; color: #333;">${c}</div>
            <div style="display: flex; gap: 8px;">
                <button onclick="openEditCustModal('${c}')" style="background: var(--info-bg, #e3f2fd); border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 16px;">✏️</button>
                <button onclick="deleteCustomer('${c}')" style="background: var(--danger-bg, #ffebee); border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 16px;">🗑️</button>
            </div>
        </div>`).join('');
    }

    const filtered = deliveries.filter(d => d.date === selDate);
    if(document.getElementById('todayLog')) {
        document.getElementById('todayLog').innerHTML = filtered.length > 0 ? filtered.map(d => {
            const sum = (d.workerShares || []).reduce((s,v) => s + v.kg, 0);
            return `<div class="card" style="border-left:5px solid ${(sum >= d.kg || d.isFullySorted) ? 'var(--success)' : 'var(--warning)'}; cursor:pointer;" onclick="openEditModal('${d.id}')"><div style="display:flex; justify-content:space-between;"><b>${d.name}</b> <span>${d.kg.toLocaleString()} kg</span></div></div>`;
        }).join('') : '<p style="color:#999; text-align:center;">Keine Daten für dieses Datum</p>';
    }
    
    const grouped = {};
    deliveries.forEach(d => { if(!grouped[d.date]) grouped[d.date] = { kg: 0, items: [] }; grouped[d.date].kg += d.kg; grouped[d.date].items.push(d); });
    const sorted = Object.keys(grouped).sort((a,b) => new Date(b) - new Date(a));
    const jCont = document.getElementById('journalContainer'); const sBody = document.getElementById('summaryTableBody');
    if(jCont) jCont.innerHTML = ""; if(sBody) sBody.innerHTML = "";
    sorted.forEach(d => {
        const p = parseFloat(dailyStaff[d]) || 0; const tot = grouped[d].kg; const avg = p > 0 ? Math.round(tot/p) : 0;
        let rows = grouped[d].items.map(i => `<tr><td style="padding:8px 0; border-bottom:1px solid var(--border-color, #eee);"><b>${i.name}</b><br>${(i.workerShares || []).map(ws => `<span class="worker-tag" style="background:${getWColor(ws.name)}">${ws.name} (${ws.kg})</span>`).join('')}</td><td style="text-align:right; padding:8px 0; border-bottom:1px solid var(--border-color, #eee);">${i.kg.toLocaleString()} kg</td></tr>`).join('');
        if(jCont) jCont.innerHTML += `<div style="margin-top:10px; font-weight:bold; font-size:12px; color:var(--text-color-secondary, #555);">📅 ${new Date(d).toLocaleDateString()}</div><div class="day-summary-card" onclick="openDayModal('${d}')"><div class="stat-box"><label style="font-size:10px;">Pers</label><b>${p}</b></div><div class="stat-box"><label style="font-size:10px;">Ø/Kopf</label><b>${avg}</b></div><div class="stat-box"><label style="font-size:10px;">Gesamt</label><b>${tot.toLocaleString()}</b></div></div><table style="width:100%; border-collapse:collapse; font-size:12px;">${rows}</table>`;
        if(sBody) sBody.innerHTML += `<tr onclick="navTo('today'); document.getElementById('selectedWorkDate').value='${d}'; renderApp1();" style="cursor:pointer;"><td style="padding:10px; border-bottom:1px solid var(--border-color, #eee);">${new Date(d).toLocaleDateString()}</td><td align="center" style="border-bottom:1px solid var(--border-color, #eee);">${p}</td><td align="center" style="border-bottom:1px solid var(--border-color, #eee);">${avg}</td><td align="right" style="padding:10px; border-bottom:1px solid var(--border-color, #eee);">${tot.toLocaleString()} kg</td></tr>`;
    });

    const openDeliveries = deliveries.filter(d => {
        const sum = (d.workerShares || []).reduce((s,v) => s + v.kg, 0);
        return sum < d.kg && !d.isFullySorted;
    }).sort((a,b) => new Date(a.date) - new Date(b.date));

    if(document.getElementById('globalOpenLog')) {
        document.getElementById('globalOpenLog').innerHTML = openDeliveries.length > 0 ? openDeliveries.map(d => {
            const sum = (d.workerShares || []).reduce((s,v) => s + v.kg, 0);
            const openKg = parseFloat((d.kg - sum).toFixed(2));
            return `<div class="card" style="border-left:5px solid var(--warning); cursor:pointer; margin-bottom: 8px; padding: 10px;" onclick="openEditModal('${d.id}')">
                <div style="display:flex; justify-content:space-between; align-items: center;">
                    <div>
                        <b>${d.name}</b><br>
                        <small style="color:#666;">LKW vom ${new Date(d.date).toLocaleDateString('de-DE')}</small>
                    </div>
                    <div style="text-align:right;">
                        <span style="color:var(--warning); font-weight:bold;">${openKg.toLocaleString()} kg offen</span><br>
                        <small style="color:#999;">von ${d.kg} kg</small>
                    </div>
                </div>
            </div>`;
        }).join('') : '<p style="color:var(--success); font-weight:bold; text-align:center;">✅ Alles restlos sortiert!</p>';
    }

    if(curId) updateShareList();
}

function openEditSupModal(name) { document.getElementById('edit-sup-old-name').value = name; document.getElementById('edit-sup-new-name').value = name; document.getElementById('edit-sup-modal').style.display = 'flex'; }
function saveSupplierEdit() {
    const oldName = document.getElementById('edit-sup-old-name').value; const newName = document.getElementById('edit-sup-new-name').value.trim();
    if (!newName || suppliers.includes(newName)) return;
    suppliers = suppliers.map(s => s === oldName ? newName : s);
    articles.forEach(art => { if(art.suppliers) { art.suppliers = art.suppliers.map(s => s === oldName ? newName : s); } });
    saveLocalDB(); document.getElementById('edit-sup-modal').style.display = 'none'; showToast("Lieferant umbenannt!", "success");
}
function deleteSupplier(name) { if (confirm(`Lieferant "${name}" wirklich löschen?`)) { suppliers = suppliers.filter(s => s !== name); saveLocalDB(); showToast("Lieferant gelöscht!", "success"); } }

function openEditCustModal(name) { 
    const newName = prompt("Kunde umbenennen:", name);
    if(newName && newName.trim() !== "" && newName !== name) {
        customers = customers.map(c => c === name ? newName.trim() : c);
        saveLocalDB(); showToast("Kunde umbenannt!", "success");
    }
}
function addCustomer() { const n = document.getElementById('newCust').value; if(n){ customers.push(n); saveLocalDB(); document.getElementById('newCust').value=""; showToast("Kunde gespeichert", "success"); } }
function deleteCustomer(name) { if (confirm(`Kunden "${name}" wirklich löschen?`)) { customers = customers.filter(c => c !== name); saveLocalDB(); showToast("Kunde gelöscht!", "success"); } }

let currentWeekOffset = 0; 
function getDatesForWeekOffset(offset) {
    let curr = new Date(); let first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1); let monday = new Date(curr.setDate(first + (offset * 7)));
    let days = []; for(let i=0; i<7; i++) { let d = new Date(monday); d.setDate(monday.getDate() + i); days.push(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]); }
    return days;
}
function getISOWeekNumber(d) {
    let date = new Date(d.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7); let week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
function changeWeek(dir) { currentWeekOffset += dir; renderAnalysis(); }

function renderAnalysis() {
    const container = document.getElementById('analysisContainer'); if(!container) return;
    const days = getDatesForWeekOffset(currentWeekOffset); const firstDayObj = new Date(days[0]); const weekNum = getISOWeekNumber(firstDayObj);
    document.getElementById('weekTitle').innerText = `KW ${weekNum} (${firstDayObj.getFullYear()})`;
    let html = `<table class="analysis-table"><tr><th class="worker-col">Name</th>`; const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    days.forEach((d, index) => {
        let staffCountDisplay = dailyStaff[d] ? parseFloat(dailyStaff[d]) : 0; let staffCountCalc = staffCountDisplay > 0 ? staffCountDisplay : 1; let dailySum = deliveries.filter(x=>x.date===d).reduce((a,b)=>a+b.kg,0);
        html += `<th>${dayNames[index]}<br>${d.split('-')[2]}.${d.split('-')[1]}<div style="color:#666; font-size:10px; margin-top:4px; font-weight:normal;">👥 ${staffCountDisplay}</div><div style="color:var(--primary); font-size:10px; margin-top:2px;">Ø ${Math.round(dailySum/staffCountCalc)}</div></th>`;
    });
    html += `<th>Gesamt Ø<br><small style="font-weight:normal">(auf 1 Tag)</small></th></tr>`;
    workers.forEach(w => {
        html += `<tr><td class="worker-col" style="color:${getWColor(w)}">● ${w}</td>`; let workerTotalKg = 0; let workerWorkedDays = 0; 
        days.forEach(d => {
            let dayKg = 0; deliveries.forEach(del => { (del.workerShares || []).forEach(ws => { let wsDate = ws.date || del.date; if(ws.name === w && wsDate === d) dayKg += ws.kg; }); });
            let dayFactor = (dailyAttendance[d] && dailyAttendance[d][w]) ? dailyAttendance[d][w] : 0;
            workerTotalKg += dayKg; 
            if(dayFactor > 0) { workerWorkedDays += dayFactor; } else if (dayKg > 0) { workerWorkedDays += 1; }
            if(dayKg > 0 || dayFactor > 0) { html += `<td style="color:${dayKg > 0 ? '#000' : '#888'}">${dayKg > 0 ? dayKg.toLocaleString() : '-'}${dayFactor > 0 && dayFactor < 1 ? `<div style="font-size:9px; color:#e65100; margin-top:2px;">${dayFactor} T</div>` : ''}</td>`; } 
            else { html += `<td style="color:#ccc">-</td>`; }
        });
        let trueAverage = workerWorkedDays > 0 ? Math.round(workerTotalKg / workerWorkedDays) : 0; html += `<td style="background:#f0f7ff; color:var(--primary)">${trueAverage > 0 ? trueAverage.toLocaleString() : 0}</td></tr>`;
    });
    container.innerHTML = html + `</table>`;
}

function saveDelivery() {
    const k = parseFloat(document.getElementById('weightInput').value), s = document.getElementById('supplierSelect').value, d = document.getElementById('selectedWorkDate').value;
    if(k && s && d) { 
        const id = Date.now().toString(); 
        let workerShares = [];
        const checkedWorkers = Array.from(document.querySelectorAll('.worker-cb:checked')).map(cb => cb.value);
        if(checkedWorkers.length > 0) {
            const kgPerWorker = parseFloat((k / checkedWorkers.length).toFixed(2));
            checkedWorkers.forEach(w => workerShares.push({ name: w, kg: kgPerWorker }));
            document.querySelectorAll('.worker-cb:checked').forEach(cb => cb.checked = false);
        }
        deliveries.push({ id, date: d, name: s, kg: k, workerShares }); document.getElementById('weightInput').value=""; saveLocalDB(); showToast("Gespeichert!");
    }
}

function openEditModal(id) { 
    curId = id; const e = deliveries.find(x => x.id === id); if(!e) return; 
    document.getElementById('logModalTitle').innerText = e.name; 
    document.getElementById('editTotalKg').value = e.kg; 
    const dInput = document.getElementById('editTotalDate'); if(dInput) dInput.value = e.date;
    const sInput = document.getElementById('modalDateInput'); if(sInput) sInput.value = getLocalISO();
    const fsCb = document.getElementById('modalFullySortedCb'); if(fsCb) fsCb.checked = !!e.isFullySorted;
    updateShareList(); 
    document.getElementById('editModal').style.display="flex"; 
}

function toggleFullySorted() {
    const e = deliveries.find(x => x.id === curId); if(!e) return;
    const cb = document.getElementById('modalFullySortedCb');
    if(cb) { e.isFullySorted = cb.checked; saveLocalDB(); updateShareList(); renderApp1(); }
}

function updateShareList() {
    const e = deliveries.find(x => x.id === curId); if(!e) return;
    const shares = e.workerShares || []; const dist = shares.reduce((s,v) => s + v.kg, 0);
    const openKg = parseFloat((e.kg - dist).toFixed(2));
    document.getElementById('openKgLabel').innerText = openKg.toLocaleString('de-DE', {minimumFractionDigits:0, maximumFractionDigits:2});
    document.getElementById('shareList').innerHTML = shares.map((s,i) => {
        let dateHtml = s.date && s.date !== e.date ? `<br><small style="color:var(--text-color-secondary, #888);">(Sortiert: ${new Date(s.date).toLocaleDateString('de-DE')})</small>` : '';
        return `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color-2, #f0f0f0); padding:10px; margin-bottom:5px; border-radius:5px; color:${getWColor(s.name)}"><div><b>${s.name}</b>${dateHtml}</div><div><b>${s.kg} kg</b> <span onclick="removeShare(${i})" style="color:red; font-size:20px; cursor:pointer; margin-left:10px;">×</span></div></div>`;
    }).join('');
    const kgInput = document.getElementById('modalKgInput');
    if(kgInput) { kgInput.value = (openKg > 0 && !e.isFullySorted) ? parseFloat(openKg.toFixed(2)) : ''; }
}
function addWorkerShare() {
    const mw = document.getElementById('modalWorkerSelect'); const n = mw ? (mw.tagName === 'SELECT' ? mw.value : mw.dataset.value) : '';
    const k = parseFloat(document.getElementById('modalKgInput').value); if(!k || !n) return;
    const e = deliveries.find(x => x.id === curId); const sDate = document.getElementById('modalDateInput') ? document.getElementById('modalDateInput').value : e.date;
    let s = [...(e.workerShares || [])]; s.push({name:n, kg:k, date: sDate}); e.workerShares = s; saveLocalDB(); updateShareList(); 
}
function addAllRemainingShare() {
    const mw = document.getElementById('modalWorkerSelect'); const n = mw ? (mw.tagName === 'SELECT' ? mw.value : mw.dataset.value) : '';
    const e = deliveries.find(x => x.id === curId);
    let s = [...(e.workerShares || [])]; const rest = parseFloat((e.kg - s.reduce((sum,v) => sum + v.kg, 0)).toFixed(2));
    const sDate = document.getElementById('modalDateInput') ? document.getElementById('modalDateInput').value : e.date;
    if(rest > 0 && n) { s.push({name:n, kg:rest, date: sDate}); e.workerShares = s; saveLocalDB(); updateShareList(); }
}
function removeShare(i) { const e = deliveries.find(x => x.id === curId); let s = [...(e.workerShares || [])]; s.splice(i,1); e.workerShares = s; saveLocalDB(); updateShareList(); }
function updateDeliveryData() { 
    const v = parseFloat(document.getElementById('editTotalKg').value); 
    const d = document.getElementById('editTotalDate') ? document.getElementById('editTotalDate').value : null;
    if(!isNaN(v)) { 
        const e = deliveries.find(x => x.id === curId); 
        if(e) { 
            e.kg = v; 
            if(d) e.date = d;
            saveLocalDB(); updateShareList(); showToast("Aktualisiert!", "success");
                closeModalApp1('editModal');
        } 
    } 
}
function deleteEntry() { customConfirm("Ganzen Eintrag löschen?", () => { deliveries = deliveries.filter(x => x.id !== curId); saveLocalDB(); closeModalApp1('editModal'); showToast("Eintrag gelöscht", "success"); }); }

function openDayModal(d) { 
    curDate = d; let att = dailyAttendance[d] || {}; let html = '';
    workers.forEach(w => {
        let val = att[w] !== undefined ? att[w] : 0;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border-color, #eee);"><span style="font-weight:bold; color:${getWColor(w)}; cursor:pointer; padding:5px 0;" onclick="toggleAtt('${w}')" title="Anwesenheit umschalten">● ${w}</span><select class="att-select" data-worker="${w}" onchange="calcAttTotal()" style="width:140px; margin-bottom:0; padding:8px; border-radius:6px; border:1px solid #ccc;"><option value="0" ${val==0?'selected':''}>Nicht da</option><option value="0.25" ${val==0.25?'selected':''}>0.25 (Viertel)</option><option value="0.5" ${val==0.5?'selected':''}>0.5 (Halb)</option><option value="0.75" ${val==0.75?'selected':''}>0.75 (Dreiviertel)</option><option value="1" ${val==1?'selected':''}>1.0 (Voll)</option></select></div>`;
    });
    document.getElementById('attendanceList').innerHTML = html; calcAttTotal(); document.getElementById('dayInfoModal').style.display="flex"; 
}
function toggleAtt(w) { let sel = document.querySelector(`.att-select[data-worker="${w}"]`); if(sel) { sel.value = (sel.value === '1') ? '0' : '1'; calcAttTotal(); } }
function calcAttTotal() { let total = 0; document.querySelectorAll('.att-select').forEach(s => total += parseFloat(s.value)); document.getElementById('attTotal').innerText = total; }
function saveAttendance() { let att = {}; let total = 0; document.querySelectorAll('.att-select').forEach(s => { let val = parseFloat(s.value); if(val > 0) { att[s.getAttribute('data-worker')] = val; total += val; } }); dailyAttendance[curDate] = att; dailyStaff[curDate] = total; saveLocalDB(); closeModalApp1('dayInfoModal'); if(typeof silentPushToCloud === 'function') silentPushToCloud(); }

function navTo(t) { 
    document.querySelectorAll('#app1_wrapper .page').forEach(p => p.classList.remove('active')); 
    document.querySelectorAll('#app1_wrapper .nav-item').forEach(n => n.classList.remove('active')); 
    const id = t.charAt(0).toUpperCase() + t.slice(1); 
    const pageEl = document.getElementById('page' + id); if (pageEl) pageEl.classList.add('active'); 
    const navEl = document.getElementById('nav' + id); if (navEl) navEl.classList.add('active'); 
    toggleMenuApp1(false);
    renderApp1(); // UI aktualisieren, wenn der Tab gewechselt wird
}

function toggleMenuApp1(s) { document.getElementById('drawer').classList.toggle('open', s); document.getElementById('overlay').style.display = s ? 'block' : 'none'; }
function closeModalApp1(m) { document.getElementById(m).style.display = "none"; if(m === 'editModal') curId = null; }
function addSupplier() { const n = document.getElementById('newSup').value; if(n){ suppliers.push(n); saveLocalDB(); document.getElementById('newSup').value=""; }}
function addWorker() { const n = document.getElementById('newWor').value; if(n){ workers.push(n); saveLocalDB(); document.getElementById('newWor').value=""; if(typeof silentPushToCloud === 'function') silentPushToCloud(); }}

let currentCloudReklamationen = {};
let editCloudReklamationKey = null;

function loadCloudReklamationen() {
    const list = document.getElementById('cloud-rek-list');
    if (!list) return;
    list.innerHTML = "⏳ Lade Daten aus der Cloud...";
    
    let cloudUrl = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.CLOUD_URL) ? APP_CONFIG.CLOUD_URL : "https://tresch-versand-default-rtdb.firebaseio.com/backup";
    let rekUrl = cloudUrl.replace('/backup', '/reklamationen');
    
    if (!navigator.onLine) {
        list.innerHTML = "❌ Keine Internetverbindung.";
        return;
    }

    fetch(rekUrl + ".json?t=" + Date.now())
        .then(res => res.json())
        .then(data => {
            currentCloudReklamationen = data || {};
            if (!data || Object.keys(data).length === 0) {
                list.innerHTML = "Keine Reklamationen in der Cloud gefunden.";
                return;
            }
            
            let html = "";
            let keys = Object.keys(data).sort((a,b) => {
                let da = new Date(data[a].datum + "T" + (data[a].zeit || "00:00")).getTime() || 0;
                let db = new Date(data[b].datum + "T" + (data[b].zeit || "00:00")).getTime() || 0;
                return db - da;
            });
            
            keys.forEach(key => {
                let r = data[key];
                html += `<div class="card" style="border-left: 5px solid #d32f2f; margin-bottom: 10px; padding: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <b style="font-size:16px;">${r.lief || 'Unbekannt'}</b><br>
                            <span style="font-size:12px; color:#666;">${r.datum ? new Date(r.datum).toLocaleDateString('de-DE') : '-'} ${r.zeit || ''} Uhr</span><br>
                            <span style="font-size:13px;"><b>Kat:</b> ${r.kategorie || '-'}</span><br>
                            <span style="font-size:13px;"><b>LS:</b> ${r.ls || '-'}</span>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button onclick="editCloudReklamation('${key}')" style="background:var(--info-bg, #e3f2fd); color:#1565c0; border:1px solid var(--info-border, #bbdefb); padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">✏️</button>
                            <button onclick="deleteCloudReklamation('${key}')" style="background:var(--danger-bg, #ffebee); color:#c62828; border:1px solid var(--danger-border, #ffcdd2); padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">🗑️</button>
                        </div>
                    </div>
                </div>`;
            });
            list.innerHTML = html;
        })
        .catch(e => {
            list.innerHTML = "❌ Fehler beim Laden der Daten.";
            console.error("Cloud Reklamationen laden Fehler:", e);
        });
}

function editCloudReklamation(key) {
    let r = currentCloudReklamationen[key];
    if (!r) return;
    editCloudReklamationKey = key;
    
    document.getElementById('rek-modal-title').innerText = "✏️ Reklamation bearbeiten";
    document.getElementById('rek-print-btn').style.display = 'none';
    document.getElementById('rek-update-btn').style.display = 'block';
    
    const liefSelect = document.getElementById('rek-lief'); 
    let foundLief = false;
    Array.from(liefSelect.options).forEach(opt => { if(opt.value === r.lief) foundLief = true; });
    if(!foundLief && r.lief) liefSelect.innerHTML += `<option value="${r.lief}">${r.lief}</option>`;
    
    const workerSelect = document.getElementById('rek-worker'); 
    let foundWorker = false;
    Array.from(workerSelect.options).forEach(opt => { if(opt.value === r.worker) foundWorker = true; });
    if(!foundWorker && r.worker) workerSelect.innerHTML += `<option value="${r.worker}">${r.worker}</option>`;
    
    document.getElementById('rek-datum').value = r.datum || '';
    document.getElementById('rek-zeit').value = r.zeit || '';
    document.getElementById('rek-lief').value = r.lief || '';
    document.getElementById('rek-ls').value = r.ls || '';
    document.getElementById('rek-worker').value = r.worker || '';
    document.getElementById('rek-kategorie').value = r.kategorie || '';
    document.getElementById('rek-temp').value = r.temp || '';
    document.getElementById('rek-mhd').value = r.mhd || '';
    document.getElementById('rek-soll').value = r.soll || '';
    document.getElementById('rek-ist').value = r.ist || '';
    document.getElementById('rek-leergut-soll').value = r.leergutSoll || '';
    document.getElementById('rek-leergut-ist').value = r.leergutIst || '';
    document.getElementById('rek-positionen').value = r.positionen || '';
    document.getElementById('rek-bemerkung').value = r.bemerkung || '';
    
    const fileInput = document.getElementById('rek-foto');
    if (fileInput) fileInput.value = '';
    
    const preview = document.getElementById('rek-foto-preview');
    if (r.photoBase64) {
        preview.innerHTML = `<img src="${r.photoBase64}" style="max-height: 100px; border-radius: 6px; border: 1px solid var(--border-color, #ccc); margin-top: 5px;"><br><small style="color:var(--text-color-secondary, #666);">(Aktuelles Foto. Ein neues Foto überschreibt dieses)</small>`;
        preview.style.display = 'block';
    } else {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }

    document.getElementById('reklamation-modal').style.display = 'flex';
}

function updateCloudReklamation() {
    if (!editCloudReklamationKey) return;
    
    const datum = document.getElementById('rek-datum').value, zeit = document.getElementById('rek-zeit').value, lief = document.getElementById('rek-lief').value;
    const ls = document.getElementById('rek-ls').value, temp = document.getElementById('rek-temp').value, mhd = document.getElementById('rek-mhd').value;
    const worker = document.getElementById('rek-worker').value, kategorie = document.getElementById('rek-kategorie').value, soll = document.getElementById('rek-soll').value;
    const ist = document.getElementById('rek-ist').value, positionen = document.getElementById('rek-positionen').value.trim(), bemerkung = document.getElementById('rek-bemerkung').value;
    const leergutSoll = document.getElementById('rek-leergut-soll').value, leergutIst = document.getElementById('rek-leergut-ist').value;
    
    const fileInput = document.getElementById('rek-foto');
    const btn = document.getElementById('rek-update-btn'); if(btn) { btn.innerText = "⏳ Speichere..."; btn.disabled = true; }
    
    const doUpload = (photoBase64) => {
        const rekData = { datum, zeit, lief, ls, temp, mhd, worker, kategorie, soll, ist, leergutSoll, leergutIst, positionen, bemerkung, photoBase64 };
        let cloudUrl = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.CLOUD_URL) ? APP_CONFIG.CLOUD_URL : "https://tresch-versand-default-rtdb.firebaseio.com/backup";
        let rekUrl = cloudUrl.replace('/backup', '/reklamationen') + "/" + editCloudReklamationKey + ".json";
        fetch(rekUrl, { method: 'PUT', body: JSON.stringify(rekData), headers: { 'Content-Type': 'application/json' } }).then(res => {
            if(btn) { btn.innerText = "💾 Änderungen in Cloud speichern"; btn.disabled = false; }
            if(res.ok) { showToast("Aktualisiert!", "success"); document.getElementById('reklamation-modal').style.display = 'none'; loadCloudReklamationen(); editCloudReklamationKey = null; } 
            else { showToast("Fehler.", "error"); }
        }).catch(e => { if(btn) { btn.innerText = "💾 Änderungen in Cloud speichern"; btn.disabled = false; } showToast("Netzwerkfehler.", "error"); });
    };
    
    if (fileInput.files && fileInput.files[0] && typeof compressImageForReklamation === 'function') {
        showToast("Verarbeite Foto...", "warning");
        compressImageForReklamation(fileInput.files[0], doUpload);
    } else {
        let oldPhoto = currentCloudReklamationen[editCloudReklamationKey] ? currentCloudReklamationen[editCloudReklamationKey].photoBase64 : "";
        doUpload(oldPhoto);
    }
}

function deleteCloudReklamation(key) {
    customConfirm("Möchtest du diese Reklamation wirklich dauerhaft aus der Cloud löschen?", () => {
        let cloudUrl = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.CLOUD_URL) ? APP_CONFIG.CLOUD_URL : "https://tresch-versand-default-rtdb.firebaseio.com/backup";
        let rekUrl = cloudUrl.replace('/backup', '/reklamationen');
        
        fetch(rekUrl + "/" + key + ".json", { method: 'DELETE' })
            .then(res => {
                if (res.ok) {
                    showToast("Reklamation gelöscht!", "success");
                    loadCloudReklamationen(); // Liste nach dem Löschen direkt neu laden
                } else {
                    showToast("Fehler beim Löschen.", "error");
                }
            })
            .catch(e => {
                showToast("Netzwerkfehler.", "error");
                console.error(e);
            });
    });
}

// ==========================================
// V10 ARTIKEL ZUORDNUNG
// ==========================================
function switchV10Tab(tabName) {
    activeV10Tab = tabName;
    document.querySelectorAll('.v10-tab-btn').forEach(b => { b.style.background = 'transparent'; b.style.color = '#555'; b.classList.remove('active'); b.style.boxShadow = 'none'; });
    const activeBtn = document.getElementById('tab-'+tabName);
    if(activeBtn) { activeBtn.classList.add('active'); activeBtn.style.background = 'var(--primary)'; activeBtn.style.color = 'white'; activeBtn.style.boxShadow = '0 4px 10px rgba(0,75,147,0.3)'; }
    const searchInput = document.getElementById('searchInput'); if(searchInput) searchInput.value = '';
    renderV10Table();
}

function renderV10Table() {
    const list = document.getElementById('v10-article-list'); if(!list) return;
    const sInput = document.getElementById('searchInput'); const s = sInput ? sInput.value.toUpperCase() : ''; let html = '';

    if (activeV10Tab === 'todo') {
        html = todo.map(art => {
            if ((art.fertigNr || '').includes(s) || (art.name || '').toUpperCase().includes(s)) {
                return `<div style="background:var(--bg-card, #fff); border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:var(--card-shadow, 0 4px 10px rgba(0,0,0,0.06)); border-left:6px solid #d32f2f; border-right:1px solid var(--border-color, #eee); border-top:1px solid var(--border-color, #eee); border-bottom:1px solid var(--border-color, #eee);">
                    <div style="font-size:15px; margin-bottom:12px;"><strong style="color:#d32f2f;">${art.fertigNr}</strong> <span style="color:var(--text-color, #444); font-weight:600;">- ${art.name}</span></div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        <button class="c-btn" style="background:#ffc107; color:#000; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="toLose('${art.fertigNr}')">🍔 Lose</button>
                        <button class="c-btn" style="background:#28a745; color:white; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="openModal('${art.fertigNr}')">✅ OK</button>
                        <button class="c-btn" style="background:#17a2b8; color:white; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="toLater('${art.fertigNr}')">⏳ Später</button>
                        <button class="c-btn" style="background:#6c757d; color:white; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="toHidden('${art.fertigNr}')">👁️ Versteck.</button>
                    </div>
                </div>`;
            } return '';
        }).join('');
    } else if (activeV10Tab === 'later') {
        html = later.map(art => {
            if ((art.fertigNr || '').includes(s) || (art.name || '').toUpperCase().includes(s)) {
                return `<div style="background:var(--bg-card, #fff); border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:var(--card-shadow, 0 4px 10px rgba(0,0,0,0.06)); border-left:6px solid #17a2b8; border-right:1px solid var(--border-color, #eee); border-top:1px solid var(--border-color, #eee); border-bottom:1px solid var(--border-color, #eee);">
                    <div style="font-size:15px; margin-bottom:12px;"><strong style="color:#17a2b8;">${art.fertigNr}</strong> <span style="color:var(--text-color, #444); font-weight:600;">- ${art.name}</span></div>
                    <div style="display:flex; gap:6px;">
                        <button class="c-btn" style="background:#0056b3; color:white; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="restoreFromPool('${art.fertigNr}', 'later')">🔄 Bearbeiten</button>
                        <button class="c-btn" style="background:#dc3545; color:white; padding:10px; border-radius:8px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="deleteArticle('${art.fertigNr}', 'later')">🗑️</button>
                    </div>
                </div>`;
            } return '';
        }).join('');
    } else if (activeV10Tab === 'done') {
        html = articles.map((art, i) => {
            if ((art.nr || '').includes(s) || (art.name || '').toUpperCase().includes(s) || (art.fertigNr || '').includes(s)) {
                const origName = art.originalName ? `<br><small style="color:var(--text-color-secondary, #888); font-weight:normal;">Original: ${art.originalName}</small>` : '';
                return `<div style="background:var(--bg-card, #fff); border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:var(--card-shadow, 0 4px 10px rgba(0,0,0,0.06)); border-left:6px solid #28a745; border-right:1px solid var(--border-color, #eee); border-top:1px solid var(--border-color, #eee); border-bottom:1px solid var(--border-color, #eee);">
                    <div style="font-size:15px; font-weight:bold; color:var(--success); margin-bottom:4px;">Lose-Nr: ${art.nr || 'Fehlt'}</div>
                    <div style="font-size:15px; font-weight:600; color:var(--text-color, #333); margin-bottom:12px;">${art.name}${origName}</div>
                    <div style="display:flex; gap:6px;">
                        <button class="c-btn" style="background:#17a2b8; color:white; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="openEditFertigModal(${i})">✏️ Bearbeiten</button>
                        <button class="c-btn" style="background:#dc3545; color:white; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="unassign(${i})">❌ Aufheben</button>
                    </div>
                </div>`;
            } return '';
        }).join('');
    } else if (activeV10Tab === 'hidden') {
        html = hidden.map(art => {
            if ((art.fertigNr || '').includes(s) || (art.name || '').toUpperCase().includes(s)) {
                return `<div style="background:var(--bg-card, #fff); border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:var(--card-shadow, 0 4px 10px rgba(0,0,0,0.06)); border-left:6px solid #999; border-right:1px solid var(--border-color, #eee); border-top:1px solid var(--border-color, #eee); border-bottom:1px solid var(--border-color, #eee);">
                    <div style="font-size:15px; margin-bottom:12px;"><strong style="color:var(--text-color-secondary, #999);">${art.fertigNr}</strong> <span style="color:var(--text-color-secondary, #888); font-weight:600;">- ${art.name}</span></div>
                    <div style="display:flex; gap:6px;">
                        <button class="c-btn" style="background:#0056b3; color:white; padding:10px; border-radius:8px; font-weight:bold; flex:1; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="restoreFromPool('${art.fertigNr}', 'hidden')">👁️ Einblenden</button>
                        <button class="c-btn" style="background:#dc3545; color:white; padding:10px; border-radius:8px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);" onclick="deleteArticle('${art.fertigNr}', 'hidden')">🗑️</button>
                    </div>
                </div>`;
            } return '';
        }).join('');
    }
    if(!html) html = '<div style="text-align:center; padding:30px; color:var(--text-color-secondary, #999); font-size:15px; background:var(--bg-color-2, #fafafa); border-radius:12px; border:1px dashed var(--border-color, #ddd);">Keine Einträge gefunden.</div>';
    list.innerHTML = html; updateV10Stats();
}

function saveNewFertigArticle() {
    const nr = document.getElementById('create-fertig-nr').value.trim(); const name = document.getElementById('create-fertig-name').value.trim();
    if(!nr || !name) return showToast("Bitte Fertig-Nr. und Bezeichnung eingeben!", "warning");
    if(todo.some(a => a.fertigNr === nr) || articles.some(a => a.fertigNr === nr)) return showToast("Diese Fertig-Nummer existiert bereits!", "error");
    todo.push({ fertigNr: nr, name: name, nr: "", suppliers: [] }); saveLocalDB();
    document.getElementById('create-fertig-nr').value = ''; document.getElementById('create-fertig-name').value = ''; renderV10Table(); showToast("Fertig-Artikel angelegt!", "success");
}

function saveNewLoseArticle() {
    const loseNr = document.getElementById('create-lose-nr').value.trim(); const name = document.getElementById('create-lose-name').value.trim();
    if(!loseNr || !name) return showToast("Bitte Lose-Nr. und Bezeichnung eingeben!", "warning");
    if(lose.some(a => a.fertigNr === loseNr)) return showToast("Diese Lose-Nummer existiert bereits!", "error");
    lose.push({ fertigNr: loseNr, name: name, nr: "", suppliers: [] }); saveLocalDB();
    document.getElementById('create-lose-nr').value = ''; document.getElementById('create-lose-name').value = ''; renderLosePool(); showToast("Lose-Artikel angelegt!", "success");
}

function deleteArticle(id, poolType) {
    customConfirm("Diesen Artikel wirklich ENDGÜLTIG aus dem System löschen?", () => {
        let pool = poolType === 'todo' ? todo : poolType === 'later' ? later : poolType === 'hidden' ? hidden : lose;
        const idx = pool.findIndex(a => a.fertigNr === id);
        if (idx !== -1) { pool.splice(idx, 1); saveLocalDB(); renderV10Table(); if(poolType === 'lose') renderLosePool(); showToast("Gelöscht!", "success"); }
    });
}

function toLose(id) { const idx = todo.findIndex(a => a.fertigNr === id); if(idx === -1) return; const art = todo.splice(idx, 1)[0]; lose.push(art); setLastAction(art.fertigNr, art.name, 'lose'); saveLocalDB(); renderV10Table(); renderLosePool(); }
function toHidden(id) { const idx = todo.findIndex(a => a.fertigNr === id); if(idx === -1) return; const art = todo.splice(idx, 1)[0]; hidden.push(art); setLastAction(art.fertigNr, art.name, 'hidden'); saveLocalDB(); renderV10Table(); }
function toLater(id) { const idx = todo.findIndex(a => a.fertigNr === id); if(idx === -1) return; const art = todo.splice(idx, 1)[0]; later.push(art); setLastAction(art.fertigNr, art.name, 'later'); saveLocalDB(); renderV10Table(); }
function unassign(idx, isUndo = false) {
    if(idx < 0 || idx >= articles.length) return; const art = articles.splice(idx, 1)[0];
    if(art.fertigNr) { art.nr = ""; } if(art.originalName) { art.name = art.originalName; } else { art.name = art.name.replace(/\s?\(\d+\)$/, ""); }
    todo.push(art); if (!isUndo && lastAction && lastAction.pool === 'done') { lastAction = null; document.getElementById('undo-banner').style.display = 'none'; }
    saveLocalDB(); renderV10Table();
}
function restoreFromPool(id, poolType, isUndo = false) {
    let pool = poolType === 'lose' ? lose : poolType === 'hidden' ? hidden : later; const idx = pool.findIndex(a => a.fertigNr === id);
    if (idx !== -1) {
        const art = pool.splice(idx, 1)[0]; todo.push(art);
        if (!isUndo && lastAction && lastAction.id === art.fertigNr) { lastAction = null; document.getElementById('undo-banner').style.display = 'none'; }
        saveLocalDB(); renderV10Table(); renderLosePool();
    }
}

function setLastAction(id, name, poolName) { lastAction = { id: id, name: name, pool: poolName }; document.getElementById('undo-text').innerText = `${id} verschoben`; document.getElementById('undo-banner').style.display = 'flex'; }
function undoLastAction() {
    if (!lastAction) return;
    if (lastAction.pool === 'done') { const idx = articles.findIndex(a => a.fertigNr === lastAction.id); if(idx !== -1) unassign(idx, true); } 
    else { restoreFromPool(lastAction.id, lastAction.pool, true); }
    lastAction = null; document.getElementById('undo-banner').style.display = 'none'; showToast("Rückgängig gemacht!", "success");
}

function toggleLoseMenu() { document.getElementById('menu-lose').classList.toggle('open'); renderLosePool(); }
function renderLosePool() {
    const lc = document.getElementById('lose-pool-container'); if(!lc) return; const s = document.getElementById('searchLosePool').value.toLowerCase(); lc.innerHTML = '';
    lose.forEach(a => {
        if ((a.fertigNr || '').toLowerCase().includes(s) || (a.name || '').toLowerCase().includes(s)) {
            const d = document.createElement('div');
            d.style.cssText = "background:var(--bg-card, #fff); border-radius:10px; padding:12px; margin-bottom:10px; border-left:5px solid #ffc107; border-right:1px solid var(--border-color, #eee); border-top:1px solid var(--border-color, #eee); border-bottom:1px solid var(--border-color, #eee); box-shadow:var(--card-shadow-sm, 0 2px 5px rgba(0,0,0,0.05));";
            d.innerHTML = `<div style="font-size:14px; margin-bottom:8px;"><strong style="color:#b38600;">${a.fertigNr}</strong> - <span style="color:var(--text-color, #444); font-weight:600;">${a.name}</span></div><div style="display:flex; gap:6px;"><button class="c-btn" style="background:var(--primary); color:white; flex:1; padding:8px; font-size:12px; border-radius:6px; font-weight:bold;" onclick="restoreFromPool('${a.fertigNr}', 'lose')">↩ Zurück</button><button class="c-btn" style="background:#dc3545; color:white; padding:8px; font-size:12px; border-radius:6px; font-weight:bold;" onclick="deleteArticle('${a.fertigNr}', 'lose')">🗑️</button></div>`;
            lc.appendChild(d);
        }
    }); updateV10Stats();
}

function openModal(targetId) {
    if (lose.length === 0) return showToast("Der Lose-Pool ist leer!", "warning"); currentTargetId = targetId; const art = todo.find(a => a.fertigNr === targetId); if(!art) return;
    document.getElementById('modal-target-name').innerText = art.name; document.getElementById('custom-app-name').value = art.name; document.getElementById('modalSearch').value = ''; document.getElementById('modal-overlay').style.display = 'flex';
    renderModalList(); setTimeout(() => { document.getElementById('modalSearch').focus(); }, 100);
}
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; currentTargetId = null; }

function renderModalList() {
    const c = document.getElementById('modal-list-container'); const s = document.getElementById('modalSearch').value.toLowerCase(); c.innerHTML = '';
    const todoArt = todo.find(a => a.fertigNr === currentTargetId); if(!todoArt) return;
    const targetWords = todoArt.name.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 2);
    let scoredList = lose.map(art => {
        let score = 0; art.name.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 2).forEach(w => { if (targetWords.includes(w)) score++; });
        return { ...art, score: score };
    }).sort((a, b) => b.score - a.score);
    let hasBestMatch = false;
    scoredList.forEach(art => {
        if ((art.fertigNr || '').toLowerCase().includes(s) || (art.name || '').toLowerCase().includes(s)) {
            const div = document.createElement('div');
            div.style.cssText = "background:var(--bg-card, #fff); border-radius:10px; padding:12px 15px; margin-bottom:8px; cursor:pointer; border:1px solid var(--border-color, #eee); box-shadow:var(--card-shadow-sm, 0 2px 4px rgba(0,0,0,0.03)); transition:all 0.2s; display:flex; align-items:center; justify-content:space-between;";
            let badge = (art.score > 0 && !hasBestMatch) ? `<span style="background:#28a745; color:white; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; box-shadow:0 2px 4px rgba(40,167,69,0.2);">⭐ Bester Treffer</span>` : '';
            if (art.score > 0 && !hasBestMatch) { hasBestMatch = true; div.style.borderLeft = "5px solid #28a745"; div.style.backgroundColor = "var(--success-bg, #f0fff4)"; div.style.borderColor = "var(--success-border, #c6f6d5)"; }
            div.innerHTML = `<div><strong style="color:var(--primary);">${art.fertigNr}</strong> <span style="color:var(--text-color, #444); font-weight:600;">- ${art.name}</span></div> ${badge}`; 
            div.onclick = () => confirmAssign(art.fertigNr); c.appendChild(div);
        }
    });
}

function confirmAssign(loseId) {
    const idx = todo.findIndex(a => a.fertigNr === currentTargetId); if(idx === -1) return;
    const art = todo.splice(idx, 1)[0]; art.nr = loseId.trim(); art.originalName = art.name; 
    const newAppName = document.getElementById('custom-app-name').value.trim() || art.name;
    art.name = `${newAppName} (${art.fertigNr})`; if(!art.suppliers) art.suppliers = [];
    articles.push(art); setLastAction(art.fertigNr, art.originalName, 'done'); saveLocalDB(); closeModal(); renderV10Table(); showToast("Zugeordnet!", "success");
}

function updateV10Stats() {
    const total = todo.length + lose.length + later.length + hidden.length + articles.length;
    const h = articles.length + hidden.length; const p = total > 0 ? Math.round((h/total)*100) : 0;
    document.getElementById('progress-bar').style.width = p+'%'; document.getElementById('progress-text').innerText = p+'%';
    document.getElementById('count-todo').innerText = todo.length; document.getElementById('count-lose').innerText = lose.length;
    document.getElementById('count-later').innerText = later.length; document.getElementById('count-done').innerText = articles.length; document.getElementById('count-hidden').innerText = hidden.length;
}

function openEditFertigModal(idx) {
    const art = articles[idx]; if(!art) return; editingFertigId = idx; 
    document.getElementById('edit-fertig-lose').value = art.nr || ''; document.getElementById('edit-fertig-nr').value = art.fertigNr || ''; document.getElementById('edit-fertig-name').value = art.name || '';
    document.getElementById('edit-fertig-overlay').style.display = 'flex';
}
function closeEditFertigModal() { document.getElementById('edit-fertig-overlay').style.display = 'none'; editingFertigId = null; }
function saveEditFertig() {
    if(editingFertigId === null) return; const art = articles[editingFertigId];
    if(art) {
        art.nr = document.getElementById('edit-fertig-lose').value.trim(); art.fertigNr = document.getElementById('edit-fertig-nr').value.trim(); art.name = document.getElementById('edit-fertig-name').value.trim();
        if (lastAction && lastAction.pool === 'done') { lastAction = null; document.getElementById('undo-banner').style.display = 'none'; }
    }
    saveLocalDB(); closeEditFertigModal(); renderV10Table(); showToast("Gespeichert!", "success");
}

// ==========================================
// SORTIMENTE ZUWEISEN (Logistik App)
// ==========================================
function setAssignMode(m) { assignMode = m; assignSelectedTarget = null; document.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.id === 'btn-mode-' + m)); renderAssignLeft(); renderAssignRight(); }

function renderAssignLeft() {
    const q = document.getElementById('assign-left-search').value.toLowerCase(); let h = '';
    if(assignMode === 'art') { articles.forEach((a, i) => { if((a.name||'').toLowerCase().includes(q) || (a.nr && a.nr.includes(q))) h += `<div style="padding:12px 15px; margin-bottom:8px; border-radius:10px; cursor:pointer; font-size:14px; border:1px solid ${assignSelectedTarget===i?'var(--info-border, #90caf9)':'var(--border-color, #eee)'}; background:${assignSelectedTarget===i?'var(--info-bg, #e3f2fd)':'var(--bg-card, #fff)'}; box-shadow:var(--card-shadow-sm, 0 2px 4px rgba(0,0,0,0.03)); transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;" onclick="selectAssign(${i})"><span style="color:var(--text-color, #444);"><b>${a.nr || '??'}</b> - <span style="font-weight:600;">${a.name}</span></span>${assignSelectedTarget===i?'<span style="color:#1565c0; font-weight:bold;">➔</span>':''}</div>`; }); }
    else { suppliers.sort().forEach(s => { if(s.toLowerCase().includes(q)) h += `<div style="padding:12px 15px; margin-bottom:8px; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600; border:1px solid ${assignSelectedTarget===s?'var(--info-border, #90caf9)':'var(--border-color, #eee)'}; background:${assignSelectedTarget===s?'var(--info-bg, #e3f2fd)':'var(--bg-card, #fff)'}; color:var(--text-color, #444); box-shadow:var(--card-shadow-sm, 0 2px 4px rgba(0,0,0,0.03)); transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;" onclick="selectAssign('${s}')"><span>${s}</span>${assignSelectedTarget===s?'<span style="color:#1565c0; font-weight:bold;">➔</span>':''}</div>`; }); }
    document.getElementById('assign-left-list').innerHTML = h;
}
function selectAssign(t) { assignSelectedTarget = t; renderAssignRight(); renderAssignLeft(); }

function renderAssignRight() {
    const q = document.getElementById('assign-right-search').value.toLowerCase(); const onlyAssigned = document.getElementById('filter-assigned-only').checked; const list = document.getElementById('assign-right-list');
    if(assignSelectedTarget === null) { list.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-color-secondary, #999); font-size:14px; background:var(--bg-color-2, #fafafa); border-radius:12px; border:1px dashed var(--border-color, #ccc);">Bitte wähle zuerst links einen Eintrag aus.</div>'; return; }
    let h = '';
    if(assignMode === 'art') {
        const ass = articles[assignSelectedTarget].suppliers || [];
        suppliers.sort().forEach(s => { const isLinked = ass.includes(s); if(onlyAssigned && !isLinked) return; if(s.toLowerCase().includes(q)) h += `<label style="display:flex; align-items:center; padding:12px 15px; margin-bottom:8px; border-radius:10px; border:1px solid ${isLinked?'var(--success-border, #a5d6a7)':'var(--border-color, #eee)'}; background:${isLinked?'var(--success-bg, #f0fff4)':'var(--bg-card, #fff)'}; box-shadow:var(--card-shadow-sm, 0 2px 4px rgba(0,0,0,0.03)); cursor:pointer; transition:all 0.2s;"><input type="checkbox" style="margin-right:12px; width:22px; height:22px; accent-color:#2e7d32; cursor:pointer;" ${isLinked?'checked':''} onchange="toggleLink('${s}')"> <span style="font-size:15px; color:${isLinked?'#2e7d32':'var(--text-color, #444)'}; font-weight:${isLinked?'bold':'600'};">${s}</span></label>`; });
    } else {
        articles.forEach((a, i) => { const isLinked = (a.suppliers||[]).includes(assignSelectedTarget); if(onlyAssigned && !isLinked) return; if((a.name||'').toLowerCase().includes(q) || (a.nr && a.nr.includes(q))) h += `<label style="display:flex; align-items:center; padding:12px 15px; margin-bottom:8px; border-radius:10px; border:1px solid ${isLinked?'var(--success-border, #a5d6a7)':'var(--border-color, #eee)'}; background:${isLinked?'var(--success-bg, #f0fff4)':'var(--bg-card, #fff)'}; box-shadow:var(--card-shadow-sm, 0 2px 4px rgba(0,0,0,0.03)); cursor:pointer; transition:all 0.2s;"><input type="checkbox" style="margin-right:12px; width:22px; height:22px; accent-color:#2e7d32; cursor:pointer;" ${isLinked?'checked':''} onchange="toggleLink(${i})"> <span style="font-size:14px; color:${isLinked?'#2e7d32':'var(--text-color, #444)'}; font-weight:${isLinked?'bold':'600'};"><b>${a.nr || '??'}</b> - ${a.name}</span></label>`; });
    }
    list.innerHTML = h || '<div style="padding:30px; color:var(--text-color-secondary, #999); text-align:center; background:var(--bg-color-2, #fafafa); border-radius:12px; border:1px dashed var(--border-color, #ccc);">Keine Treffer gefunden.</div>';
}

function toggleLink(v) {
    let a = assignMode === 'art' ? articles[assignSelectedTarget] : articles[v]; if(!a.suppliers) a.suppliers = []; const t = assignMode === 'art' ? v : assignSelectedTarget;
    if(a.suppliers.includes(t)) a.suppliers = a.suppliers.filter(x => x !== t); else a.suppliers.push(t);
    saveLocalDB(); renderAssignRight();
}
function exportLogistikToExcel() {
    if(deliveries.length === 0) { showToast("Keine Daten vorhanden!", "warning"); return; }
    let journalData = []; let sortedDeliveries = [...deliveries].sort((a,b) => new Date(b.date) - new Date(a.date));
    sortedDeliveries.forEach(d => { let workersStr = (d.workerShares || []).map(ws => `${ws.name} (${ws.kg} kg)`).join(', '); journalData.push({ "Datum": new Date(d.date).toLocaleDateString('de-DE'), "Lieferant": d.name, "Gewicht (kg)": d.kg, "Mitarbeiter": workersStr }); });
    const ws1 = XLSX.utils.json_to_sheet(journalData); ws1['!cols'] = [{wch: 12}, {wch: 25}, {wch: 15}, {wch: 40}];
    let summaryData = []; const grouped = {}; deliveries.forEach(d => { (d.workerShares || []).forEach(ws => { let sDate = ws.date || d.date; if(!grouped[sDate]) grouped[sDate] = { kg: 0 }; grouped[sDate].kg += ws.kg; }); });
    const sortedDates = Object.keys(grouped).sort((a,b) => new Date(b) - new Date(a));
    sortedDates.forEach(d => { const p = parseFloat(dailyStaff[d]) || 0; const tot = grouped[d].kg; const avg = p > 0 ? Math.round(tot/p) : 0; summaryData.push({ "Datum": new Date(d).toLocaleDateString('de-DE'), "Personal": p, "Ø pro Kopf (kg)": avg, "Gesamtgewicht (kg)": tot }); });
    const ws2 = XLSX.utils.json_to_sheet(summaryData); ws2['!cols'] = [{wch: 12}, {wch: 12}, {wch: 18}, {wch: 20}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws1, "Journal (Detail)"); XLSX.utils.book_append_sheet(wb, ws2, "Tages-Übersicht");
    XLSX.writeFile(wb, `Logistik_Export_${new Date().toISOString().split('T')[0]}.xlsx`); showToast("Excel Download gestartet!", "success");
}
