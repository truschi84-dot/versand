// TAGESEXPORT LOGIK
// =========================================================================

const TIERART_LISTE = ['Schwein', 'Geflügel', 'Rind', 'TK Geflügel', 'TK Schwein'];
const TIERART_FARBEN = {
    'Schwein':      { bg: '#fff3b0', text: '#7a6000', border: '#f0c000' },
    'Geflügel':     { bg: '#ffe49a', text: '#7a4500', border: '#e0a000' },
    'Rind':         { bg: '#c8f0c8', text: '#1a5c1a', border: '#4caf50' },
    'TK Geflügel':  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    'TK Schwein':   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
};

function initTagesexportTab() {
    const datePicker = document.getElementById('te-datum');
    if (datePicker && !datePicker.value) {
        datePicker.value = new Date().toISOString().slice(0, 10);
    }
    renderTagesexport();
}

function renderTagesexport() {
    const datum = document.getElementById('te-datum').value;
    if (!datum) return;

    const summen = berechneSortierExportNachTierart(datum);
    const container = document.getElementById('te-eingaben');
    if (!container) return;

    container.innerHTML = TIERART_LISTE.map(tierart => {
        const farbe = TIERART_FARBEN[tierart];
        const sortiertKg = summen[tierart] || 0;
        const manId = `te-manuell-${tierart.replace(/\s/g, '_')}`;
        return `
        <div style="background:${farbe.bg}; border:2px solid ${farbe.border}; border-radius:10px; padding:14px 18px; margin-bottom:12px;">
            <div style="font-weight:700; font-size:15px; color:${farbe.text}; margin-bottom:10px;">${tierart}</div>
            <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
                <div style="flex:1; min-width:140px;">
                    <div style="font-size:11px; font-weight:600; color:${farbe.text}; margin-bottom:4px;">Aus Sortierung (Export)</div>
                    <div style="font-size:20px; font-weight:700; color:${farbe.text};">${sortiertKg > 0 ? sortiertKg.toFixed(0) + ' kg' : '—'}</div>
                </div>
                <div style="flex:1; min-width:140px;">
                    <div style="font-size:11px; font-weight:600; color:${farbe.text}; margin-bottom:4px;">Manuell (zusätzlich)</div>
                    <input type="number" id="${manId}" placeholder="0" min="0" step="1"
                        style="width:100%; padding:8px 10px; border:1px solid ${farbe.border}; border-radius:6px; font-size:16px; font-weight:700; background:white; color:#333;"
                        oninput="aktualisiereTagesexportSumme()">
                </div>
                <div style="flex:1; min-width:120px; text-align:right;">
                    <div style="font-size:11px; font-weight:600; color:${farbe.text}; margin-bottom:4px;">Gesamt</div>
                    <div id="te-sum-${tierart.replace(/\s/g, '_')}" style="font-size:22px; font-weight:800; color:${farbe.text};">${sortiertKg > 0 ? sortiertKg.toFixed(0) : '0'} kg</div>
                </div>
            </div>
        </div>`;
    }).join('');

    aktualisiereTagesexportSumme();
}

function aktualisiereTagesexportSumme() {
    const datum = document.getElementById('te-datum').value;
    const summen = berechneSortierExportNachTierart(datum);
    let gesamtAll = 0;

    TIERART_LISTE.forEach(tierart => {
        const key = tierart.replace(/\s/g, '_');
        const manEl = document.getElementById(`te-manuell-${key}`);
        const sumEl = document.getElementById(`te-sum-${key}`);
        const sortiert = summen[tierart] || 0;
        const manuell = manEl ? (parseFloat(manEl.value) || 0) : 0;
        const gesamt = sortiert + manuell;
        if (sumEl) sumEl.textContent = gesamt.toFixed(0) + ' kg';
        gesamtAll += gesamt;
    });

    const gesamtEl = document.getElementById('te-gesamt');
    if (gesamtEl) gesamtEl.textContent = gesamtAll.toFixed(0) + ' kg';
}

function berechneSortierExportNachTierart(datum) {
    const result = {};
    TIERART_LISTE.forEach(t => result[t] = 0);

    if (!datum || !db) return result;

    const articles = db.articles || [];
    const artikelMarkt = db.artikelMarkt || {};
    const tierartZuordnung = db.tierartZuordnung || {};
    const deletedKeys = db.deletedSortierBuchungen || [];

    const buchungen = (db.teamSortierBuchungen || []).filter(b => {
        if (!b || !b.datum) return false;
        if (b.datum !== datum) return false;
        const bKey = b.id || (b.datum + '|' + b.lief + '|' + (b.sorte || ''));
        return !deletedKeys.includes(bKey);
    });

    buchungen.forEach(b => {
        const kg = parseFloat(b.kg) || 0;
        if (kg <= 0) return;

        // Tierart über fertigNr bestimmen
        const fertigNr = fertigNrAusSorteBuchung(b.sorte, articles);
        const marktTyp = fertigNr ? (artikelMarkt[String(fertigNr)] || '') : '';
        if (marktTyp !== 'export') return;

        const tierart = fertigNr ? (tierartZuordnung[String(fertigNr)] || '') : '';
        if (tierart && result[tierart] !== undefined) {
            result[tierart] += kg;
        }
    });

    return result;
}

function fertigNrAusSorteBuchung(sorte, articles) {
    if (!sorte || !articles || !articles.length) return null;
    const q = sorte.toLowerCase().trim();
    const hit = articles.find(a => {
        const disp = (a.name || '').toLowerCase();
        return disp === q || disp.includes(q) || q.includes(disp.substring(0, Math.min(disp.length, 8)));
    });
    return hit ? (hit.fertigNr || hit.nr || null) : null;
}

function getTagesexportDaten() {
    const datum = document.getElementById('te-datum').value;
    const summen = berechneSortierExportNachTierart(datum);
    return TIERART_LISTE.map(tierart => {
        const key = tierart.replace(/\s/g, '_');
        const manEl = document.getElementById(`te-manuell-${key}`);
        const sortiert = summen[tierart] || 0;
        const manuell = manEl ? (parseFloat(manEl.value) || 0) : 0;
        return { tierart, sortiert, manuell, gesamt: sortiert + manuell };
    });
}

function exportTagesexportExcel() {
    const datum = document.getElementById('te-datum').value;
    const daten = getTagesexportDaten();
    const gesamt = daten.reduce((s, d) => s + d.gesamt, 0);

    const datumDE = datum ? datum.split('-').reverse().join('.') : '';

    // SheetJS (XLSX) verwenden falls vorhanden, sonst CSV
    if (typeof XLSX !== 'undefined') {
        const wb = XLSX.utils.book_new();
        const wsData = [
            ['BM', datumDE],
            [],
            ['Tierart', 'Sortierung (kg)', 'Manuell (kg)', 'Gesamt (kg)'],
            ...daten.map(d => [d.tierart, d.sortiert || 0, d.manuell || 0, d.gesamt || 0]),
            [],
            ['BM GESAMT', '', '', gesamt]
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Tagesexport');
        XLSX.writeFile(wb, `Tagesexport_${datum}.xlsx`);
    } else {
        // CSV-Fallback
        const lines = [
            `BM;${datumDE}`,
            '',
            'Tierart;Sortierung (kg);Manuell (kg);Gesamt (kg)',
            ...daten.map(d => `${d.tierart};${(d.sortiert||0).toFixed(0)};${(d.manuell||0).toFixed(0)};${(d.gesamt||0).toFixed(0)}`),
            '',
            `BM GESAMT;;;${gesamt.toFixed(0)}`
        ];
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Tagesexport_${datum}.csv`; a.click();
        URL.revokeObjectURL(url);
    }
}

function shareTagesexportWhatsapp() {
    const datum = document.getElementById('te-datum').value;
    const daten = getTagesexportDaten();
    const gesamt = daten.reduce((s, d) => s + d.gesamt, 0);
    const datumDE = datum ? datum.split('-').reverse().join('.') : '';

    const zeilen = daten
        .filter(d => d.gesamt > 0)
        .map(d => `${d.tierart}: *${d.gesamt.toFixed(0)} kg*`)
        .join('\n');

    const text = `📦 *Tagesexport ${datumDE}*\n\n${zeilen}\n\n*BM Gesamt: ${gesamt.toFixed(0)} kg*`;

    if (navigator.share) {
        navigator.share({ text });
    } else {
        const url = 'https://wa.me/?text=' + encodeURIComponent(text);
        window.open(url, '_blank');
    }
}
