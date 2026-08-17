// ======================= REKLAMATIONEN =======================

function openReklamationModal(preselectLief = null, prefilledWeight = null) {
    try {
        if(typeof editCloudReklamationKey !== 'undefined') editCloudReklamationKey = null;
        const title = document.getElementById('rek-modal-title'); if(title) title.innerText = "⚠️ Reklamation anlegen";
        const pBtn = document.getElementById('rek-print-btn'); if(pBtn) pBtn.style.display = 'block';
        const uBtn = document.getElementById('rek-update-btn'); if(uBtn) uBtn.style.display = 'none';
        const preview = document.getElementById('rek-foto-preview'); if(preview) preview.style.display = 'none';

        const modal = document.getElementById('reklamation-modal'); const now = new Date();
        document.getElementById('rek-datum').value = getLocalISO(); document.getElementById('rek-zeit').value = now.toTimeString().substring(0, 5);
        const liefSelect = document.getElementById('rek-lief'); liefSelect.innerHTML = '<option value="">Bitte wählen...</option>';
        const availableSuppliers = (typeof suppliers !== 'undefined') ? suppliers : (AppStorage.get('kombi_logistik_db', {}).suppliers || []);
        if (preselectLief && !availableSuppliers.includes(preselectLief)) liefSelect.innerHTML += `<option value="${preselectLief}">❗ [AUSGEWÄHLT] ${preselectLief}</option>`;
        availableSuppliers.forEach(s => { if (s === preselectLief) liefSelect.innerHTML += `<option value="${s}">❗ [AUSGEWÄHLT] ${s}</option>`; else liefSelect.innerHTML += `<option value="${s}">${s}</option>`; });
        if (preselectLief) liefSelect.value = preselectLief;
        
        const workerSelect = document.getElementById('rek-worker'); workerSelect.innerHTML = '<option value="">Bitte wählen...</option>';
        const availableWorkers = (typeof workers !== 'undefined') ? workers : (AppStorage.get('kombi_logistik_db', {}).workers || []);
        availableWorkers.forEach(w => workerSelect.innerHTML += `<option value="${w}">${w}</option>`);

        loadReklamationDraftForSupplier();
        if (prefilledWeight !== null) document.getElementById('rek-ist').value = parseFloat(prefilledWeight).toFixed(2);
        modal.style.display = 'flex';
    } catch(e) { console.error("Fehler in openReklamationModal", e); }
}

function loadReklamationDraftForSupplier() {
    const selectedLief = document.getElementById('rek-lief').value;
    if (selectedLief && reklamationDrafts[selectedLief]) {
        const draft = reklamationDrafts[selectedLief];
        document.getElementById('rek-ls').value = draft['rek-ls'] || ''; document.getElementById('rek-temp').value = draft['rek-temp'] || ''; document.getElementById('rek-mhd').value = draft['rek-mhd'] || '';
        document.getElementById('rek-kategorie').value = draft['rek-kategorie'] || ''; document.getElementById('rek-soll').value = draft['rek-soll'] || ''; document.getElementById('rek-ist').value = draft['rek-ist'] || '';
        document.getElementById('rek-positionen').value = draft['rek-positionen'] || ''; document.getElementById('rek-bemerkung').value = draft['rek-bemerkung'] || ''; document.getElementById('rek-worker').value = draft['rek-worker'] || '';
        document.getElementById('rek-leergut-soll').value = draft['rek-leergut-soll'] || ''; document.getElementById('rek-leergut-ist').value = draft['rek-leergut-ist'] || '';
    } else {
        ['rek-ls', 'rek-temp', 'rek-mhd', 'rek-kategorie', 'rek-soll', 'rek-ist', 'rek-positionen', 'rek-bemerkung', 'rek-leergut-soll', 'rek-leergut-ist'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
        const workerSelect = document.getElementById('rek-worker'); if(workerSelect) workerSelect.value = '';
    }
    const fileInput = document.getElementById('rek-foto'); if(fileInput) fileInput.value = '';
}

function saveReklamationDraft() {
    const lief = document.getElementById('rek-lief').value; if (!lief) return;
    reklamationDrafts[lief] = {
        'rek-ls': document.getElementById('rek-ls').value, 'rek-temp': document.getElementById('rek-temp').value, 'rek-mhd': document.getElementById('rek-mhd').value,
        'rek-kategorie': document.getElementById('rek-kategorie').value, 'rek-soll': document.getElementById('rek-soll').value, 'rek-ist': document.getElementById('rek-ist').value,
        'rek-positionen': document.getElementById('rek-positionen').value, 'rek-bemerkung': document.getElementById('rek-bemerkung').value, 'rek-worker': document.getElementById('rek-worker').value,
        'rek-leergut-soll': document.getElementById('rek-leergut-soll').value, 'rek-leergut-ist': document.getElementById('rek-leergut-ist').value
    }; saveRechnerDB();
}

function printReklamation() {
    try {
        const datum = document.getElementById('rek-datum').value; const zeit = document.getElementById('rek-zeit').value; const lief = document.getElementById('rek-lief').value;
        const ls = document.getElementById('rek-ls').value; const temp = document.getElementById('rek-temp').value; const mhd = document.getElementById('rek-mhd').value;
        const worker = document.getElementById('rek-worker').value; const kategorie = document.getElementById('rek-kategorie').value; const soll = document.getElementById('rek-soll').value;
        const ist = document.getElementById('rek-ist').value; const positionen = document.getElementById('rek-positionen').value.trim(); const bemerkung = document.getElementById('rek-bemerkung').value;
        const leergutSoll = document.getElementById('rek-leergut-soll').value; const leergutIst = document.getElementById('rek-leergut-ist').value;
        
        let fehlendeFelder = [];
        if (!lief) fehlendeFelder.push("Lieferant / Spedition"); if (!ls) fehlendeFelder.push("Lieferschein-Nr."); if (!worker) fehlendeFelder.push("Angenommen von"); if (!kategorie) fehlendeFelder.push("Mangel-Kategorie"); if (!positionen) fehlendeFelder.push("Betroffene Positionen / Details");
        if (kategorie === "Mindergewicht (Soll/Ist Abweichung)") { if (!soll) fehlendeFelder.push("Soll-Gewicht (kg)"); if (!ist) fehlendeFelder.push("Ist-Gewicht (kg)"); }
        if (kategorie === "Temperatur-Überschreitung (> 5°C)") { if (!temp) fehlendeFelder.push("Temperatur (°C)"); }
        if (kategorie === "MHD abgelaufen / zu kurzes MHD") { if (!mhd) fehlendeFelder.push("MHD (Datum)"); }
        if (kategorie === "Falsches Leergut") { if (!leergutSoll) fehlendeFelder.push("Soll Leergut"); if (!leergutIst) fehlendeFelder.push("Ist Leergut"); }

        if (fehlendeFelder.length > 0) { alert("❌ Fehler! Bitte fülle noch folgende Felder aus:\n\n- " + fehlendeFelder.join("\n- ")); return; }

        const fileInput = document.getElementById('rek-foto');
        if (fileInput.files && fileInput.files[0]) {
            showToast("Verarbeite Foto...", "warning");
            compressImageForReklamation(fileInput.files[0], function(base64Img) { finalizePrintReklamation(datum, zeit, lief, ls, temp, mhd, worker, kategorie, soll, ist, leergutSoll, leergutIst, positionen, bemerkung, base64Img); });
        } else { finalizePrintReklamation(datum, zeit, lief, ls, temp, mhd, worker, kategorie, soll, ist, leergutSoll, leergutIst, positionen, bemerkung, ""); }
    } catch(e) { console.error("Fehler in printReklamation", e); }
}

function compressImageForReklamation(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); const MAX_WIDTH = 800; let scaleSize = 1;
            if (img.width > MAX_WIDTH) { scaleSize = MAX_WIDTH / img.width; }
            canvas.width = img.width * scaleSize; canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            callback(canvas.toDataURL('image/jpeg', 0.6)); 
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
}

function finalizePrintReklamation(datum, zeit, lief, ls, temp, mhd, worker, kategorie, soll, ist, leergutSoll, leergutIst, positionen, bemerkung, photoBase64) {
    const printArea = document.getElementById('printArea'); if (!printArea) return;
    let photoHtml = photoBase64 ? `<div style="margin-top: 15px; text-align: left;"><b style="font-size: 11px; color: #666; text-transform: uppercase; display:block; margin-bottom:6px;">Dokumentiertes Beweisfoto:</b><img src="${photoBase64}" style="max-height: 180px; border: 2px solid #d32f2f; border-radius: 6px;"></div>` : "";
    let tempRow = temp ? `<tr><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Gemessene Temp.:</td><td colspan="3" style="padding: 8px; border: 1px solid #bbb; font-weight: bold; color: ${parseFloat(temp) > 5 ? '#d32f2f' : '#137333'};">${temp} °C</td></tr>` : '';
    let mhdRow = mhd ? `<tr><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Betroffenes MHD:</td><td colspan="3" style="padding: 8px; border: 1px solid #bbb; font-weight: bold; color: #d32f2f;">${mhd}</td></tr>` : '';
    let gewichtRow = (soll || ist) ? `<tr><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Soll-Gewicht:</td><td style="padding: 8px; border: 1px solid #bbb; width: 28%;">${soll ? soll + ' kg' : '<i>-</i>'}</td><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Ist-Gewicht:</td><td style="padding: 8px; border: 1px solid #bbb; width: 28%; font-weight: bold; color: #d32f2f;">${ist ? ist + ' kg' : '<i>-</i>'}</td></tr>` : '';
    let leergutRow = (leergutSoll || leergutIst) ? `<tr><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Soll Leergut:</td><td style="padding: 8px; border: 1px solid #bbb; width: 28%;">${leergutSoll ? leergutSoll : '<i>-</i>'}</td><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Ist Leergut:</td><td style="padding: 8px; border: 1px solid #bbb; width: 28%; font-weight: bold; color: #d32f2f;">${leergutIst ? leergutIst : '<i>-</i>'}</td></tr>` : '';
    let bemerkungBlock = bemerkung ? `<div style="border: 1px solid #ccc; border-radius: 8px; padding: 15px; background: #f9f9f9; margin-bottom: 10px;"><b style="font-size: 12px; color: #555; text-transform: uppercase; display: block; margin-bottom: 6px;">Allgemeine Bemerkung / Zustand:</b><p style="margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; color: #000;">${bemerkung}</p></div>` : '';

    const generateOfficialBlock = (titelZusatz) => `
        <div style="font-family: Arial, sans-serif; color: #222; background: #fff; padding: 20px; box-sizing: border-box; min-height: 90%; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <table style="width: 100%; border-collapse: collapse; border-bottom: 4px solid #d32f2f; padding-bottom: 8px; margin-bottom: 20px;">
                    <tr><td><h2 style="margin: 0; color: #d32f2f; font-size: 24px; letter-spacing: 0.5px; font-weight: bold;">⚠️ REKLAMATION / MÄNGELBERICHT</h2><p style="margin: 4px 0 0 0; font-size: 12px; color: #555; font-weight: bold;">Tresch & Sohn Qualitätsmanagement</p></td>
                        <td style="text-align: right; vertical-align: top;"><span style="font-size: 11px; font-weight: bold; background: #d32f2f; color: white; padding: 4px 10px; border-radius: 4px; text-transform: uppercase; display: inline-block;">${titelZusatz}</span></td>
                    </tr>
                </table>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 15px;">
                    <tr><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Datum / Zeit:</td><td style="padding: 8px; border: 1px solid #bbb; width: 28%;">${datum} — ${zeit} Uhr</td><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold; width: 22%;">Lieferant:</td><td style="padding: 8px; border: 1px solid #bbb; width: 28%; font-weight: bold; color: #004b93;">${lief}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold;">Lieferschein-Nr:</td><td style="padding: 8px; border: 1px solid #bbb;">${ls}</td><td style="padding: 8px; border: 1px solid #bbb; background: #f5f5f5; font-weight: bold;">Prüfer (Logistik):</td><td style="padding: 8px; border: 1px solid #bbb;">${worker}</td></tr>
                    ${tempRow}
                </table>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                    <tr><td style="padding: 8px; border: 1px solid #bbb; background: #fff5f5; font-weight: bold; color: #d32f2f; width: 22%;">Art des Mangels:</td><td colspan="3" style="padding: 8px; border: 1px solid #bbb; font-weight: bold; color: #d32f2f;">${kategorie}</td></tr>
            ${mhdRow} ${gewichtRow} ${leergutRow}
                </table>
                <div style="border: 1px solid #d32f2f; border-radius: 8px; padding: 15px; background: #fff5f5; margin-bottom: 10px;"><b style="font-size: 12px; color: #d32f2f; text-transform: uppercase; display: block; margin-bottom: 6px;">Betroffene Positionen / Abweichungen:</b><p style="margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; color: #000;">${positionen}</p></div>
                ${bemerkungBlock} ${photoHtml}
            </div>
            <table style="width: 100%; margin-top: 50px; font-size: 12px;"><tr><td style="width: 45%; border-top: 1px solid #444; text-align: center; padding-top: 5px;">Unterschrift Chauffeur / Spedition</td><td style="width: 10%;"></td><td style="width: 45%; border-top: 1px solid #444; text-align: center; padding-top: 5px;">Unterschrift Tresch Logistik</td></tr></table>
        </div>`;
    const printHtml = generateOfficialBlock("Kopie Spedition / Fahrer") + "<div style='page-break-after: always;'></div>" + generateOfficialBlock("Kopie Tresch & Sohn");
    
    const rekData = { datum, zeit, lief, ls, temp, mhd, worker, kategorie, soll, ist, leergutSoll, leergutIst, positionen, bemerkung, photoBase64 };
    let cloudUrl = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.CLOUD_URL) ? APP_CONFIG.CLOUD_URL : "https://tresch-versand-default-rtdb.firebaseio.com/backup";
    let rekUrl = cloudUrl.replace('/backup', '/reklamationen');
    
    if (typeof requireAppAuth === 'function' && !requireAppAuth()) return;
    cloudFetch(rekUrl + ".json", { method: 'POST', body: JSON.stringify(rekData), headers: { 'Content-Type': 'application/json' } })
    .then((res) => {
        // 2026-08-17: res.ok wurde nicht geprueft — bei Status >= 400 lief dieser Zweig trotzdem
        // und warf den Entwurf weg. Der Entwurf bleibt jetzt stehen, bis er wirklich oben ist.
        if (!res.ok) throw new Error('Status ' + res.status);
        delete reklamationDrafts[lief]; saveRechnerDB();
        if (typeof addAppCloudLog === 'function') addAppCloudLog("UPLOAD: Reklamation in QM-Archiv gesichert [OK]");
    }).catch(e => {
        if (typeof addAppCloudLog === 'function') addAppCloudLog("FEHLER: Reklamation Upload fehlgeschlagen - " + ((e && e.message) || ''));
        if (typeof showToast === 'function') showToast('Reklamation nicht in die Cloud gesichert — Entwurf bleibt erhalten.', 'warning');
    });

    setTimeout(() => {
        if (typeof forcePrint === 'function') {
            forcePrint('Reklamation_' + lief.replace(/\s+/g, '_'), printHtml);
        } else if (typeof printCleanDocument === 'function') {
            printCleanDocument({ title: 'Reklamation / Mängelbericht', subtitle: lief + ' · ' + datum, bodyHtml: printHtml });
        }
    }, 300);
}