// ======================= DRUCK FUNKTIONEN & ZEBRA =======================

function getNextEtikettenNr() {
    let nr = parseInt(localStorage.getItem('etikettenNr') || '0') + 1;
    localStorage.setItem('etikettenNr', nr);
    return nr;
}

function printSelectedZebraLabels() {
    let checkboxes = document.querySelectorAll('.print-noelke-cb:checked');
    if (checkboxes.length === 0) { alert("⚠️ Bitte hake zuerst die Artikel in der Liste an, die du drucken möchtest!"); return; }
    
    checkboxes.forEach((cb, index) => {
        let entryIndex = parseInt(cb.getAttribute('data-index'));
        let entry = entriesNoelke[entryIndex];
        if (entry) {
            let totalBoxes = entry.e2 || 1;
            let kgPerBox = entry.kg / totalBoxes;
            for (let i = 0; i < totalBoxes; i++) {
                setTimeout(() => { executeZebraLabelPrint(entry.prod, entry.mhd, 1, kgPerBox, entry.charge); }, (index * 500) + (i * 200));
            }
        }
    });
    showToast("🦓 Etiketten an den Drucker gesendet!", "success");
}

function executeZebraLabelPrint(prodString, mhd, e2, kg, charge) {
    let now = new Date();
    let dateStr = now.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'});
    let timeStr = now.toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'});
    
    let defaultArtNr = (typeof getAppSetting === 'function') ? getAppSetting('noelkeDefaultArtNr', 'NÖLKE') : "NÖLKE";
    let topNr = defaultArtNr;
    let eanNr = defaultArtNr;
    let artName = prodString;

    let eanMatch = artName.match(/\s*\|\s*EAN:\s*(\d+)/i);
    if (eanMatch) {
        eanNr = eanMatch[1];
        artName = artName.replace(eanMatch[0], '').trim();
    }

    let nrMatch = artName.match(/^\[?Nr\.?\s*([A-Za-z0-9]+)\]?\s*-?\s*(.*)/i) || artName.match(/^([A-Za-z0-9]+)\s*-\s*(.*)/);
    if (nrMatch) {
        topNr = nrMatch[1];
        artName = nrMatch[2].trim();
    }

    if (eanNr === defaultArtNr && topNr.length >= 8) eanNr = topNr;
    if (topNr === defaultArtNr && eanNr !== defaultArtNr) topNr = eanNr;

    let einheit = "E2";
    const config = getLeergutConfig();
    if(config.length > 0) einheit = config[0].name;

    let chargeToPrint = charge || "C-" + Date.now().toString().slice(-6);
    let gewichtStr = parseFloat(kg).toFixed(2);
    let etikettenNr = getNextEtikettenNr();
    let barcodeData = `Nr:${etikettenNr}|Art-Nr:${eanNr}|Name:${artName}|Datum:${dateStr}|Zeit:${timeStr}|Charge:${chargeToPrint}|MHD:${mhd}|Gewicht:${gewichtStr}kg|Menge:${e2}|Einheit:${einheit}`;

    let defaultZpl = "^XA\n^LL640\n^PW880\n^FO30,30^A0N,30,30^FDVerp-Tag^FS\n^FO220,30^A0N,30,30^FD{dateStr}^FS\n^FO500,30^A0N,30,30^FDUhrzeit^FS\n^FO680,30^A0N,30,30^FD{timeStr}^FS\n^FO30,80^GB820,2,2^FS\n^FO30,100^A0N,50,50^FD{topNr}^FS\n^FO580,100^A0N,35,35^FDNr. {etikettenNr}^FS\n^FO30,165^FB580,2,0,L,0^A0N,35,35^FD{artName}^FS\n^FO30,250^A0N,28,28^FDEAN: {eanNr}^FS\n^FO30,290^A0N,28,28^FDCharge: {charge}^FS\n^FO30,330^A0N,28,28^FDMHD: {mhd}^FS\n^FO30,370^A0N,28,28^FDEinheit: {einheit}^FS\n^FO640,170^BXN,4,200,0,0,1^FD{barcodeData}^FS\n^FO30,420^GB480,160,2^FS\n^FO45,435^A0N,30,30^FDGewicht^FS\n^FO45,490^A0N,80,80^FD{gewichtStr} kg^FS\n^FO540,420^GB310,160,2^FS\n^FO555,435^A0N,30,30^FDMenge^FS\n^FO555,490^A0N,80,80^FD{menge}^FS\n^FO30,610^GB820,2,2^FS\n^XZ";
    
    let zplTemplate = defaultZpl; // Ignoriert den veralteten Speicher und erzwingt das Layout ohne 'Nr.'

    let zpl = zplTemplate
        .replace(/\{dateStr\}/g, dateStr)
        .replace(/\{timeStr\}/g, timeStr)
        .replace(/\{topNr\}/g, topNr)
        .replace(/\{eanNr\}/g, eanNr)
        .replace(/\{artName\}/g, artName)
        .replace(/\{charge\}/g, chargeToPrint)
        .replace(/\{mhd\}/g, mhd)
        .replace(/\{gewichtStr\}/g, gewichtStr.replace('.', ','))
        .replace(/\{etikettenNr\}/g, etikettenNr)
        .replace(/\{menge\}/g, e2)
        .replace(/\{einheit\}/g, einheit)
        .replace(/\{e2\}/g, e2)
        .replace(/\{barcodeData\}/g, barcodeData);

    let printerIP = "192.168.211.40"; 
    if (typeof getAppSetting === 'function') printerIP = getAppSetting('printerIp', printerIP);
    if (typeof AndroidApp !== 'undefined' && AndroidApp.sendZplToPrinter) { AndroidApp.sendZplToPrinter(printerIP, zpl); } 
    else { fetch(`http://${printerIP}/pstprnt`, { method: 'POST', mode: 'no-cors', body: zpl }).catch(err => console.log("Zebra Print Error", err)); }
}

function buildNoelkeListData() {
    const daten = entriesNoelke;
    if (daten.length === 0) return null;
    let einheit = "E2";
    const config = getLeergutConfig();
    if (config.length > 0) einheit = config[0].name;
    const esc = (typeof escapePrintHtml === 'function')
        ? escapePrintHtml
        : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sortierteDaten = [...daten].sort((a, b) => a.prod.localeCompare(b.prod));
    const rows = sortierteDaten.map(item => ({
        "Produkt": item.prod,
        "MHD": item.mhd,
        "Menge": item.e2,
        "Einheit": einheit,
        "Gewicht (kg)": parseFloat(item.kg).toFixed(2).replace('.', ',')
    }));
    let printHtml = '<table><thead><tr><th>Produkt</th><th>MHD</th><th>Menge</th><th>Einheit</th><th>Gewicht (kg)</th></tr></thead><tbody>';
    rows.forEach(r => {
        printHtml += `<tr><td>${esc(r["Produkt"])}</td><td>${esc(r["MHD"])}</td><td>${esc(r["Menge"])}</td><td>${esc(r["Einheit"])}</td><td>${esc(r["Gewicht (kg)"])}</td></tr>`;
    });
    printHtml += '</tbody></table>';
    return { rows, printHtml, datum: new Date().toLocaleDateString('de-DE') };
}

function buildNoelkeShareText() {
    const data = buildNoelkeListData();
    if (!data) return null;
    const sep = '────────────────────────';
    const lines = [
        'NÖLKE LIEFERSCHEIN',
        'Tresch & Sohn · ' + data.datum,
        sep
    ];
    data.rows.forEach((r, i) => {
        lines.push('');
        lines.push((i + 1) + '. ' + r['Produkt']);
        lines.push('   MHD: ' + r['MHD'] + '  ·  ' + r['Menge'] + ' ' + r['Einheit'] + '  ·  ' + r['Gewicht (kg)'] + ' kg');
    });
    lines.push('');
    lines.push(sep);
    lines.push('Positionen: ' + data.rows.length);
    return { text: lines.join('\n'), subject: 'Nölke Liste ' + data.datum };
}

function shareNoelkeListePdf() {
    const share = buildNoelkeShareText();
    if (!share) { showToast('Liste ist leer!', 'warning'); return; }
    if (typeof sharePlainText === 'function' && sharePlainText(share.text, share.subject)) return;
    showToast('Teilen nicht verfügbar.', 'error');
}

function listeDrucken() {
    const data = buildNoelkeListData();
    if (!data) { showToast("Liste ist leer!", "warning"); return; }
    const html = data.printHtml;
    setTimeout(() => {
        if (typeof forcePrint === 'function') {
            forcePrint('Noelke_Liste', html);
        } else if (typeof printCleanDocument === 'function') {
            printCleanDocument({ title: 'Nölke Lieferschein', subtitle: 'Tresch & Sohn · ' + data.datum, bodyHtml: html });
        }
    }, 100);
}

/**
 * Wiegeschein-Zeilen zusammenfassen: gleiche Lieferant/Sorte/Herkunft werden addiert.
 * Genau die Rechnung wie bisher -- nur herausgezogen, damit der Nachdruck der alten
 * Liste (siehe uebertragNachdruckDrucken) dieselbe Zusammenfassung benutzt.
 */
function aggregiereSortierDaten(daten) {
    let aggregatedDaten = [];
    daten.forEach(item => {
        let lgMap = item.leergut ? {...item.leergut} : {};
        // 2026-08-05: nicht mehr addieren -- Sonderposten speichern die Kistenzahl doppelt
        // (einmal als item.e2, einmal in item.leergut). Auf dem Wiegeschein stand dadurch
        // die doppelte Kistenzahl. item.e2 gewinnt, weil beim Bearbeiten nur das gepflegt wird.
        if(item.e2) lgMap['E2'] = item.e2;
        if(item.he) lgMap['Herta'] = item.he;
        if(item.h1) lgMap['H1'] = item.h1;
        if(item.eu) lgMap['Euro'] = item.eu;

        let existing = aggregatedDaten.find(x => x.lief === item.lief && x.sorte === item.sorte && x.herkunft === item.herkunft);
        if(existing) { existing.netto += item.netto; existing.count += 1; for(let k in lgMap) { existing.leergut[k] = (existing.leergut[k]||0) + lgMap[k]; } }
        else { aggregatedDaten.push({ lief: item.lief, sorte: item.sorte, netto: item.netto, leergut: lgMap, count: 1, herkunft: item.herkunft }); }
    });
    return aggregatedDaten;
}

/**
 * Druckbild des Palettenwiege-Scheins. datumText steht im Datums-Feld des Kopfes.
 * hinweis wird -- falls gesetzt -- auf JEDER Seite gross unter die Ueberschrift gesetzt;
 * damit traegt der Nachdruck der alten Liste seine Kennzeichnung auf jedem Blatt.
 */
function baueWiegescheinHtml(aggregatedDaten, datumText, hinweis) {
    let lieferantenGruppen = {}; aggregatedDaten.forEach(item => { if(!lieferantenGruppen[item.lief]) lieferantenGruppen[item.lief] = []; lieferantenGruppen[item.lief].push(item); });

    let printHtml = `<style>table { width: 100%; border-collapse: collapse; table-layout: fixed; } td, th { border: 2px solid black; padding: 6px 10px; font-family: Arial, sans-serif; font-size: 15px; text-align: left; color: black; } .center-text { text-align: center !important; }</style>`;
    let lieferantenKeys = Object.keys(lieferantenGruppen); const MAX_ROWS = 12;
    let printJobs = [];
    lieferantenKeys.forEach(lief => {
        let artikelListe = lieferantenGruppen[lief]; let pagesForLief = [];
        for (let i = 0; i < artikelListe.length; i += MAX_ROWS) { pagesForLief.push(artikelListe.slice(i, i + MAX_ROWS)); }
        if (pagesForLief.length === 0) pagesForLief.push([]); printJobs.push({ lief: lief, pages: pagesForLief });
    });

    const hinweisHtml = hinweis
        ? `<div style="font-family: Arial, sans-serif; color: black; border: 3px solid black; padding: 8px 12px; margin: 0 0 15px 0; font-size: 18px; font-weight: bold;">${hinweis}</div>`
        : '';

    printJobs.forEach((job, jobIndex) => {
        job.pages.forEach((pageItems, pageIndex) => {
            let isVeryLastPage = (jobIndex === printJobs.length - 1) && (pageIndex === job.pages.length - 1);
            let breakStyle = isVeryLastPage ? "" : "page-break-after: always;";
            const _supNr = (AppStorage.get('kombi_logistik_db', {}).supplierNumbers || {})[job.lief] || '';
            const _supNrHtml = _supNr ? ` <span style="font-size:16px; font-weight:normal; color:#555;">(${_supNr})</span>` : '';
            printHtml += `<div style="width: 100%; padding: 10mm; padding-top: 60mm; box-sizing: border-box; ${breakStyle}"><h1 style="font-family: Arial, sans-serif; color: black; margin: 0 0 15px 0; font-size: 26px; text-align: left;">Palettenwiege-Schein</h1>${hinweisHtml}<table><tr><td colspan="2" style="width: 65%; vertical-align: top;"><span style="font-size: 12px; font-weight: bold; color: #555;">Lieferant:</span><br><span style="font-size: 28px; font-weight: bold;">${job.lief}</span>${_supNrHtml}</td><td style="width: 17.5%; vertical-align: top;"><span style="font-size: 12px; font-weight: bold; color: #555;">Datum:</span><br><span style="font-size: 16px;">${datumText}</span></td><td style="width: 17.5%; vertical-align: top;"><span style="font-size: 12px; font-weight: bold; color: #555;">Seite:</span><br><span style="font-size: 16px;">${pageIndex + 1} / ${job.pages.length}</span></td></tr><tr style="background-color: #f2f2f2;"><td colspan="2" style="font-weight: bold; font-size: 15px;">Artikel Bezeichnung:</td><td style="font-weight: bold; font-size: 15px;" class="center-text">Gewicht:</td><td style="font-weight: bold; font-size: 15px;" class="center-text">Kisten:</td></tr>`;
            pageItems.forEach(item => {
                let kistenArr = []; for(let k in item.leergut) { if(item.leergut[k] > 0) kistenArr.push(`${item.leergut[k]} ${k}`); }
                let kistenStr = kistenArr.length > 0 ? kistenArr.join(", ") : "-";
                let saubererName = item.sorte.replace(' (UNS)', '').replace(' (EX)', '');
                if (item.herkunft && item.herkunft.trim() !== "") { saubererName += ` <span style="font-size:12px; color:#555;">(Von: ${item.herkunft})</span>`; }
                let palettenHinweis = item.count > 1 ? ` <span style="font-weight:bold;">(${item.count} Pal.)</span>` : "";
                printHtml += `<tr><td colspan="2" style="height: 30px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px;">${saubererName}${palettenHinweis}</td><td class="center-text" style="font-size: 15px;">${item.netto.toFixed(2).replace('.',',')} kg</td><td class="center-text" style="font-size: 15px;">${kistenStr}</td></tr>`;
            });
            let filler = MAX_ROWS - pageItems.length; for(let i = 0; i < filler; i++) { printHtml += `<tr><td colspan="2" style="height: 30px;">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`; }
            printHtml += `</table></div>`;
        });
    });
    return printHtml;
}

function sortierungDrucken() {
    let alleDaten = entriesSort; if(alleDaten.length === 0) { showToast("Sortierungs-Liste leer!", "warning"); return; }

    // 2026-08-18: Zweiter Riegel gegen die Doppelbuchung am Folgetag -- bewusst UNABHAENGIG
    // vom Beiseitelegen in der Ansicht (pruefeTageswechselSortierung). Was nicht von heute
    // ist, wird gar nicht erst zusammengefasst und kann damit auch nicht gebucht werden.
    // Greift also auch dann, wenn Schritt 2 aus irgendeinem Grund nicht gelaufen ist.
    let daten = typeof istSortierEintragVonHeute === 'function'
        ? alleDaten.filter(e => istSortierEintragVonHeute(e))
        : alleDaten;
    const zurueckgehalten = alleDaten.length - daten.length;
    if (zurueckgehalten > 0) showToast(zurueckgehalten + " Eintr\u00e4ge fr\u00fcherer Tage werden nicht gebucht", "warning");
    if (daten.length === 0) { showToast("Keine heutigen Eintr\u00e4ge zum Drucken!", "warning"); return; }

    let aggregatedDaten = aggregiereSortierDaten(daten);

    if (typeof bucheTeamSortierungBeimDruck === 'function') {
        const sitzungId = typeof getSortierSitzungId === 'function' ? getSortierSitzungId() : 'default';
        bucheTeamSortierungBeimDruck(aggregatedDaten, sitzungId);
    } else if (typeof pushSortierNachDruckSilent === 'function') {
        setTimeout(() => pushSortierNachDruckSilent(), 800);
    }

    let heute = new Date().toLocaleDateString('de-DE');
    let printHtml = baueWiegescheinHtml(aggregatedDaten, heute, '');

    setTimeout(() => {
        if (typeof forcePrint === 'function') {
            forcePrint('Paletten_Wiegeschein', printHtml);
        } else if (typeof printCleanDocument === 'function') {
            printCleanDocument({ title: 'Palettenwiege-Schein', subtitle: 'Tresch & Sohn \u00b7 ' + heute, bodyHtml: printHtml });
        }
        setTimeout(() => {
            if (typeof pushSortierNachDruckSilent === 'function') pushSortierNachDruckSilent();
        }, 1500);
    }, 100);
}

/**
 * Nachdruck der beiseitegelegten Liste (db.entriesSortUebertrag).
 * Erzeugt einen normalen Wiegeschein, aber OHNE jede Buchung -- bucheTeamSortierungBeimDruck
 * wird hier bewusst nicht aufgerufen. Damit auf dem Papier niemand die Summe mit der
 * Auswertung verwechselt, traegt jedes Blatt die Kennzeichnung "nicht gebucht".
 */
function uebertragNachdruckDrucken() {
    const uebertrag = typeof ladeSortierUebertrag === 'function' ? ladeSortierUebertrag() : [];
    if (uebertrag.length === 0) { showToast("Kein \u00dcbertrag vorhanden!", "warning"); return; }

    const aggregatedDaten = aggregiereSortierDaten(uebertrag);

    // Datum der Eintraege, nicht das von heute -- der Zettel gehoert zum alten Tag.
    const tage = [];
    uebertrag.forEach(e => {
        const d = typeof datumVonSortierEintrag === 'function' ? datumVonSortierEintrag(e) : null;
        const txt = d ? d.split('-').reverse().join('.') : 'unbekannt';
        if (tage.indexOf(txt) === -1) tage.push(txt);
    });
    const datumText = tage.join(', ');
    const hinweis = 'Nachdruck vom ' + datumText + ' \u2014 nicht gebucht';

    const printHtml = baueWiegescheinHtml(aggregatedDaten, datumText, hinweis);

    setTimeout(() => {
        if (typeof forcePrint === 'function') {
            forcePrint('Paletten_Wiegeschein_Nachdruck', printHtml);
        } else if (typeof printCleanDocument === 'function') {
            printCleanDocument({ title: 'Palettenwiege-Schein (Nachdruck)', subtitle: hinweis, bodyHtml: printHtml });
        }
    }, 100);
}

function buildWiegescheinExcelRows() {
    let daten = entriesSort;
    if (daten.length === 0) return null;
    let aggregatedDaten = [];
    daten.forEach(item => {
        let lgMap = item.leergut ? {...item.leergut} : {};
        if (item.e2) lgMap['E2'] = (lgMap['E2'] || 0) + item.e2;
        if (item.he) lgMap['Herta'] = (lgMap['Herta'] || 0) + item.he;
        if (item.h1) lgMap['H1'] = (lgMap['H1'] || 0) + item.h1;
        if (item.eu) lgMap['Euro'] = (lgMap['Euro'] || 0) + item.eu;
        let existing = aggregatedDaten.find(x => x.lief === item.lief && x.sorte === item.sorte && x.herkunft === item.herkunft);
        if (existing) {
            existing.netto += item.netto; existing.count += 1;
            for (let k in lgMap) existing.leergut[k] = (existing.leergut[k] || 0) + lgMap[k];
        } else {
            aggregatedDaten.push({ lief: item.lief, sorte: item.sorte, netto: item.netto, leergut: lgMap, count: 1, herkunft: item.herkunft });
        }
    });
    return aggregatedDaten.map(item => {
        let kistenArr = [];
        for (let k in item.leergut) { if (item.leergut[k] > 0) kistenArr.push(`${item.leergut[k]} ${k}`); }
        return {
            "Lieferant": item.lief,
            "Artikel": item.sorte.replace(' (UNS)', '').replace(' (EX)', ''),
            "Herkunft": item.herkunft || '',
            "Gewicht (kg)": parseFloat(item.netto).toFixed(2).replace('.', ','),
            "Kisten": kistenArr.join(', ') || '-',
            "Paletten": item.count > 1 ? item.count : 1
        };
    });
}

function exportWiegescheinExcel() {
    const rows = buildWiegescheinExcelRows();
    if (!rows || rows.length === 0) { showToast("Sortierungs-Liste leer!", "warning"); return; }
    if (typeof downloadExcelSheet === 'function') {
        downloadExcelSheet(rows, 'Wiegeschein', 'Wiegeschein_' + new Date().toISOString().split('T')[0] + '.xlsx');
        showToast("Excel Download gestartet!", "success");
    }
}