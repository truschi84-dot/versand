// =========================================================================
// 🤖 AI-REMINDER: WIR SIND IN DER BETA! 🤖
// AI-Notiz: Dies ist die Beta-Umgebung.
// Alle zukünftigen Anpassungen, Features und Fixes bitte strikt in den 
// *_beta.* Dateien durchführen, es sei denn, der Nutzer fordert explizit 
// ein Deployment ins Live-System.
// =========================================================================
// ======================= LEERGUT ASSISTENT & LADEPLAN =======================

function setLgMode(mode) {
    const btnZ = document.getElementById('btn-lg-mode-zaehler');
    const btnL = document.getElementById('btn-lg-mode-laden');
    const divZ = document.getElementById('lg-mode-zaehler');
    const divL = document.getElementById('lg-mode-laden');
    
    if(mode === 'zaehler') {
        btnZ.style.background = 'var(--primary)'; btnZ.style.color = 'white'; btnZ.style.border = 'none'; btnZ.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        btnL.style.background = '#f5f5f5'; btnL.style.color = '#555'; btnL.style.border = '1px solid #ccc'; btnL.style.boxShadow = 'none';
        divZ.style.display = 'block'; divL.style.display = 'none';
    } else {
        btnL.style.background = '#f39c12'; btnL.style.color = 'white'; btnL.style.border = 'none'; btnL.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        btnZ.style.background = '#f5f5f5'; btnZ.style.color = '#555'; btnZ.style.border = '1px solid #ccc'; btnZ.style.boxShadow = 'none';
        divZ.style.display = 'none'; divL.style.display = 'block';
    }
}

let lgZaehlerState = {};
function initLgZaehler() {
    const config = getLeergutConfig().filter(lg => !lg.name.toLowerCase().includes('herta'));
    const container = document.getElementById('lg-zaehler-container');
    if(!container) return;
    
    let html = '';
    config.forEach(lg => {
        lgZaehlerState[lg.id] = { entladen: 0, geladen: 0 };
        html += `
        <div class="card" style="padding:0; overflow:hidden; border:2px solid var(--primary); margin-bottom:15px; border-radius:12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background:var(--primary); color:white; padding:10px; font-weight:bold; font-size:16px; text-align:center; display:flex; justify-content:center; align-items:center; gap:8px;">
                📦 ${lg.name}
            </div>
            <div style="display:flex;">
                <!-- Entladen -->
                <div style="flex:1; padding:15px; border-right:1px solid var(--border);">
                    <div style="font-size:11px; font-weight:bold; color:var(--success); text-align:center; margin-bottom:12px; text-transform:uppercase;">📥 Entladen</div>
                    
                    <div style="display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:12px;">
                        <button onclick="changeLgZaehler('${lg.id}', 'entladen', -1)" style="width:45px; height:45px; background:#ffebee; color:#c62828; border:none; border-radius:10px; font-size:24px; font-weight:bold; cursor:pointer;">-</button>
                        <input type="number" id="zaehler_entladen_${lg.id}" value="0" style="flex:1; min-width:0; height:45px; text-align:center; font-size:20px; font-weight:bold; border:2px solid #ccc; border-radius:10px; padding:0;" onchange="updateLgZaehlerState('${lg.id}', 'entladen')" onfocus="this.select()" inputmode="numeric">
                        <button onclick="changeLgZaehler('${lg.id}', 'entladen', 1)" style="width:45px; height:45px; background:#e8f5e9; color:#2e7d32; border:none; border-radius:10px; font-size:24px; font-weight:bold; cursor:pointer;">+</button>
                    </div>
                    
                    <div style="display:flex; gap:6px;">
                        <input type="number" id="quick_entladen_${lg.id}" placeholder="+Menge" onkeyup="if(event.key === 'Enter') quickAddMenge('${lg.id}', 'entladen')" style="flex:1; min-width:0; padding:10px 5px; border:1px solid #ccc; border-radius:8px; font-size:14px; text-align:center;" inputmode="numeric">
                        <button onclick="quickAddMenge('${lg.id}', 'entladen')" style="background:var(--success); color:white; border:none; border-radius:8px; font-weight:bold; padding:0 12px; font-size:13px; cursor:pointer;">Dazu</button>
                    </div>
                </div>

                <!-- Geladen -->
                <div style="flex:1; padding:15px;">
                    <div style="font-size:11px; font-weight:bold; color:var(--warning); text-align:center; margin-bottom:12px; text-transform:uppercase;">📤 Geladen</div>
                    
                    <div style="display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:12px;">
                        <button onclick="changeLgZaehler('${lg.id}', 'geladen', -1)" style="width:45px; height:45px; background:#ffebee; color:#c62828; border:none; border-radius:10px; font-size:24px; font-weight:bold; cursor:pointer;">-</button>
                        <input type="number" id="zaehler_geladen_${lg.id}" value="0" style="flex:1; min-width:0; height:45px; text-align:center; font-size:20px; font-weight:bold; border:2px solid #ccc; border-radius:10px; padding:0;" onchange="updateLgZaehlerState('${lg.id}', 'geladen')" onfocus="this.select()" inputmode="numeric">
                        <button onclick="changeLgZaehler('${lg.id}', 'geladen', 1)" style="width:45px; height:45px; background:#fff3e0; color:#e65100; border:none; border-radius:10px; font-size:24px; font-weight:bold; cursor:pointer;">+</button>
                    </div>
                    
                    <div style="display:flex; gap:6px;">
                        <input type="number" id="quick_geladen_${lg.id}" placeholder="+Menge" onkeyup="if(event.key === 'Enter') quickAddMenge('${lg.id}', 'geladen')" style="flex:1; min-width:0; padding:10px 5px; border:1px solid #ccc; border-radius:8px; font-size:14px; text-align:center;" inputmode="numeric">
                        <button onclick="quickAddMenge('${lg.id}', 'geladen')" style="background:var(--warning); color:white; border:none; border-radius:8px; font-weight:bold; padding:0 12px; font-size:13px; cursor:pointer;">Dazu</button>
                    </div>
                </div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function quickAddMenge(id, type) {
    const input = document.getElementById(`quick_${type}_${id}`);
    if(!input) return;
    const val = parseInt(input.value);
    if(!isNaN(val) && val !== 0) {
        changeLgZaehler(id, type, val);
        input.value = '';
    }
}

function changeLgZaehler(id, type, amount) {
    let input = document.getElementById(`zaehler_${type}_${id}`);
    if(!input) return;
    let val = parseInt(input.value) || 0;
    val += amount;
    if(val < 0) val = 0;
    input.value = val;
    if(!lgZaehlerState[id]) lgZaehlerState[id] = {entladen:0, geladen:0};
    lgZaehlerState[id][type] = val;
}

function updateLgZaehlerState(id, type) {
    let input = document.getElementById(`zaehler_${type}_${id}`);
    if(input) {
        if(!lgZaehlerState[id]) lgZaehlerState[id] = {entladen:0, geladen:0};
        lgZaehlerState[id][type] = parseInt(input.value) || 0;
    }
}

function resetLgZaehler() {
    if(!confirm("Zähler zurücksetzen?")) return;
    document.getElementById('lg-kunde').value = '';
    for(let id in lgZaehlerState) {
        lgZaehlerState[id] = { entladen: 0, geladen: 0 };
        let inputE = document.getElementById('zaehler_entladen_' + id); if(inputE) inputE.value = 0;
        let inputG = document.getElementById('zaehler_geladen_' + id); if(inputG) inputG.value = 0;
    }
}

function printLgZaehler() {
    const kunde = document.getElementById('lg-kunde').value.trim() || '___________________';
    const kennzeichen = '_________________________';
    
    const config = getLeergutConfig().filter(lg => !lg.name.toLowerCase().includes('herta'));
    let hasData = false;
    
    let printHtml = `
    <div style='padding: 5mm; font-family: Arial, sans-serif; background: white; color: black;'>
        <h2 style='text-align:center; color:black; margin-top:0; border-bottom: 2px solid black; padding-bottom: 10px;'>Leergut-Beleg</h2>
        <table style='width: 100%; margin-bottom: 20px; font-size: 16px; border:none;'>
            <tr>
                <td style='width: 60%; border:none;'><b>Kunde / Spedition:</b><br><span style='font-size: 18px;'>${kunde}</span></td>
                <td style='width: 40%; border:none;'><b>Kennzeichen:</b><br><span style='font-size: 18px;'>${kennzeichen}</span></td>
            </tr>
            <tr>
                <td colspan='2' style='padding-top: 15px; border:none;'><b>Datum / Zeit:</b> ${new Date().toLocaleDateString('de-DE')} - ${new Date().toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'})} Uhr</td>
            </tr>
        </table>
        <table style='width:100%; font-size:16px; border-collapse:collapse; text-align:center; margin-bottom:40px;'>
            <thead>
                <tr style='background:#f0f0f0;'>
                    <th style='padding:10px; border:1px solid #000; text-align:left;'>Leergut-Sorte</th>
                    <th style='padding:10px; border:1px solid #000;'>Entladen<br><small style='font-weight:normal;'>(Kunde bringt)</small></th>
                    <th style='padding:10px; border:1px solid #000;'>Geladen<br><small style='font-weight:normal;'>(Nimmt mit)</small></th>
                </tr>
            </thead>
            <tbody>
    `;
    
    config.forEach(lg => {
        let val = lgZaehlerState[lg.id] || {entladen:0, geladen:0};
        if(val.entladen > 0 || val.geladen > 0) {
            hasData = true;
            printHtml += `
            <tr>
                <td style="padding:10px; border:1px solid #000; text-align:left;"><b>${lg.name}</b></td>
                <td style="padding:10px; border:1px solid #000;">${val.entladen > 0 ? val.entladen : '-'}</td>
                <td style="padding:10px; border:1px solid #000;">${val.geladen > 0 ? val.geladen : '-'}</td>
            </tr>`;
        }
    });
    printHtml += "</tbody></table>";
    
    printHtml += `
        <div style='display:flex; justify-content:space-between; font-size:14px; margin-top: 60px;'>
            <div style='width:45%; border-top:1px solid black; text-align:center; padding-top:5px;'>Unterschrift Fahrer</div>
            <div style='width:45%; border-top:1px solid black; text-align:center; padding-top:5px;'>Unterschrift Tresch & Sohn</div>
        </div>
    </div>`;
    
    if(!hasData) { showToast("Kein Leergut gezählt!", "warning"); return; }
    
    document.getElementById("printArea").innerHTML = printHtml;
    let safeName = kunde !== '___________________' ? '_' + kunde.replace(/[^a-zA-Z0-9]/g, '') : '';
    setTimeout(() => { if (typeof forcePrint === 'function') { forcePrint('Leergut_Beleg' + safeName); } else { window.print(); } }, 400);
}

function importFromLKW() {
    const kunde = document.getElementById('lg-kunde').value.trim();
    if(!kunde) { showToast("Bitte zuerst oben den Kunden / Spedition eintragen!", "warning"); return; }
    
    let sumLeergut = {};
    let found = false;
    entries.forEach(e => {
        if(e.lief && e.lief.toLowerCase() === kunde.toLowerCase() && e.leergut) {
            found = true;
            for(let key in e.leergut) {
                sumLeergut[key] = (sumLeergut[key] || 0) + e.leergut[key];
            }
        }
    });
    
    if(!found) { showToast("Keine LKW-Einträge für diesen Kunden gefunden!", "warning"); return; }
    
    const config = getLeergutConfig();
    for(let key in sumLeergut) {
        let lgObj = config.find(c => c.name === key);
        if(lgObj) {
            if(!lgZaehlerState[lgObj.id]) lgZaehlerState[lgObj.id] = {entladen:0, geladen:0};
            lgZaehlerState[lgObj.id].entladen = sumLeergut[key];
            let input = document.getElementById('zaehler_entladen_' + lgObj.id);
            if(input) input.value = sumLeergut[key];
        }
    }
    showToast("Entladenes Leergut aus LKW-Liste übernommen!", "success");
}

function importFromLadeplan() {
    if(lpData.fullNeed === 0 && lpData.h1StackNeed === 0 && lpData.h1LooseNeed === 0 && lpData.euNeed === 0) {
        showToast("Bitte zuerst den Ladeplan berechnen!", "warning"); return;
    }
    
    const config = getLeergutConfig();
    let e2Obj = config.find(c => c.name === 'E2');
    let h1Obj = config.find(c => c.name.includes('H1'));
    let euObj = config.find(c => c.name.includes('Euro'));
    
    let e2PerPal = parseInt(document.getElementById('lg-e2-per-pal').value) || 40;
    let sollE2 = parseInt(document.getElementById('lg-soll-e2').value) || 0;
    let totalH1 = lpData.fullNeed + (sollE2 % e2PerPal > 0 ? 1 : 0) + (lpData.h1StackNeed * 15) + lpData.h1LooseNeed;
    
    if(e2Obj) { lgZaehlerState[e2Obj.id].geladen = sollE2; let input = document.getElementById('zaehler_geladen_' + e2Obj.id); if(input) input.value = sollE2; }
    if(h1Obj) { lgZaehlerState[h1Obj.id].geladen = totalH1; let input = document.getElementById('zaehler_geladen_' + h1Obj.id); if(input) input.value = totalH1; }
    if(euObj) { lgZaehlerState[euObj.id].geladen = lpData.euNeed; let input = document.getElementById('zaehler_geladen_' + euObj.id); if(input) input.value = lpData.euNeed; }
    
    showToast("Geladenes Leergut aus Ladeplan übernommen!", "success");
}

let lpData = { fullNeed:0, fullGot:0, h1StackNeed:0, h1StackGot:0, h1LooseNeed:0, h1LooseGot:0, euNeed:0, euGot:0 };

function calcLadePlan() {
    let sollE2 = parseInt(document.getElementById('lg-soll-e2').value) || 0;
    let sollH1 = parseInt(document.getElementById('lg-soll-h1').value) || 0;
    let sollEu = parseInt(document.getElementById('lg-soll-eu').value) || 0;
    let e2PerPal = parseInt(document.getElementById('lg-e2-per-pal').value) || 40;
    
    if(sollE2 === 0 && sollH1 === 0 && sollEu === 0) { showToast("Bitte Werte eingeben!", "warning"); return; }
    if(e2PerPal <= 0) e2PerPal = 40;
    
    let fullPal = Math.floor(sollE2 / e2PerPal);
    let remainder = sollE2 % e2PerPal;
    
    let totalH1UsedForE2 = fullPal + (remainder > 0 ? 1 : 0);
    let emptyH1 = sollH1 > totalH1UsedForE2 ? (sollH1 - totalH1UsedForE2) : 0;
    
    let emptyH1Stacks = Math.floor(emptyH1 / 15);
    let emptyH1Loose = emptyH1 % 15;

    lpData.fullNeed = fullPal; lpData.fullGot = 0;
    lpData.h1StackNeed = emptyH1Stacks; lpData.h1StackGot = 0;
    lpData.h1LooseNeed = emptyH1Loose; lpData.h1LooseGot = 0;
    lpData.euNeed = sollEu; lpData.euGot = 0;
    
    document.getElementById('lp-full-desc').innerText = `${fullPal}x volle Paletten (á ${e2PerPal} E2)`;
    document.getElementById('lp-full-count').innerText = `0 / ${fullPal}`;
    if(fullPal > 0) document.getElementById('lp-full-card').style.display = 'flex'; else document.getElementById('lp-full-card').style.display = 'none';
    
    if(remainder > 0) {
        document.getElementById('lp-partial-desc').innerText = `1x angebrochen (${remainder} Stk)`;
        document.getElementById('lp-partial-cb').checked = false;
        document.getElementById('lp-partial-card').style.display = 'flex';
    } else {
        document.getElementById('lp-partial-card').style.display = 'none';
    }
    
    if(emptyH1Stacks > 0) {
        document.getElementById('lp-h1stack-desc').innerText = `${emptyH1Stacks}x H1-Stapel (á 15)`;
        document.getElementById('lp-h1stack-count').innerText = `0 / ${emptyH1Stacks}`;
        document.getElementById('lp-h1stack-card').style.display = 'flex';
    } else { document.getElementById('lp-h1stack-card').style.display = 'none'; }

    if(emptyH1Loose > 0) {
        document.getElementById('lp-h1loose-desc').innerText = `${emptyH1Loose}x einzelne H1 (leer)`;
        document.getElementById('lp-h1loose-count').innerText = `0 / ${emptyH1Loose}`;
        document.getElementById('lp-h1loose-card').style.display = 'flex';
    } else { document.getElementById('lp-h1loose-card').style.display = 'none'; }

    if(sollEu > 0) {
        document.getElementById('lp-eu-desc').innerText = `${sollEu}x Euro-Paletten`;
        document.getElementById('lp-eu-count').innerText = `0 / ${sollEu}`;
        document.getElementById('lp-eu-card').style.display = 'flex';
    } else { document.getElementById('lp-eu-card').style.display = 'none'; }
    
    document.getElementById('ladeplan-result').style.display = 'block';
    showToast("Ladeplan berechnet!", "success");
}

function updateLadeProgress(type, amount) {
    if(type === 'full') {
        lpData.fullGot += amount;
        if(lpData.fullGot < 0) lpData.fullGot = 0;
        if(lpData.fullGot > lpData.fullNeed) lpData.fullGot = lpData.fullNeed;
        document.getElementById('lp-full-count').innerText = `${lpData.fullGot} / ${lpData.fullNeed}`;
        if(lpData.fullGot === lpData.fullNeed && lpData.fullNeed > 0) showToast("Alle vollen Paletten geladen!", "success");
    } else if(type === 'h1stack') {
        lpData.h1StackGot += amount;
        if(lpData.h1StackGot < 0) lpData.h1StackGot = 0;
        if(lpData.h1StackGot > lpData.h1StackNeed) lpData.h1StackGot = lpData.h1StackNeed;
        document.getElementById('lp-h1stack-count').innerText = `${lpData.h1StackGot} / ${lpData.h1StackNeed}`;
        if(lpData.h1StackGot === lpData.h1StackNeed && lpData.h1StackNeed > 0) showToast("Alle H1-Stapel geladen!", "success");
    } else if(type === 'h1loose') {
        lpData.h1LooseGot += amount;
        if(lpData.h1LooseGot < 0) lpData.h1LooseGot = 0;
        if(lpData.h1LooseGot > lpData.h1LooseNeed) lpData.h1LooseGot = lpData.h1LooseNeed;
        document.getElementById('lp-h1loose-count').innerText = `${lpData.h1LooseGot} / ${lpData.h1LooseNeed}`;
        if(lpData.h1LooseGot === lpData.h1LooseNeed && lpData.h1LooseNeed > 0) showToast("Alle einzelnen H1 geladen!", "success");
    } else if(type === 'eu') {
        lpData.euGot += amount;
        if(lpData.euGot < 0) lpData.euGot = 0;
        if(lpData.euGot > lpData.euNeed) lpData.euGot = lpData.euNeed;
        document.getElementById('lp-eu-count').innerText = `${lpData.euGot} / ${lpData.euNeed}`;
        if(lpData.euGot === lpData.euNeed && lpData.euNeed > 0) showToast("Alle Euro-Paletten geladen!", "success");
    }
}