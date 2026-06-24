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

// Manuelle Einzel-Einträge pro Tierart: { 'Schwein': [120, 85, 200], ... }
const teManuelleEintraege = {};
TIERART_LISTE.forEach(t => teManuelleEintraege[t] = []);

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
        const key = tierart.replace(/\s/g, '_');
        const eintraege = teManuelleEintraege[tierart] || [];
        const manSumme = eintraege.reduce((s, v) => s + v, 0);
        const gesamt = sortiertKg + manSumme;

        const eintragListe = eintraege.length > 0
            ? eintraege.map((v, i) => `<span style="display:inline-flex; align-items:center; background:white; border:1px solid ${farbe.border}; border-radius:20px; padding:3px 10px; font-size:13px; font-weight:700; color:${farbe.text}; margin:2px;">
                ${v} kg <button onclick="teManuellLoeschen('${tierart}',${i})" style="background:none; border:none; cursor:pointer; color:#999; font-size:14px; margin-left:4px; padding:0; line-height:1;">×</button>
              </span>`).join('')
            : `<span style="font-size:12px; color:#aaa;">Noch keine Einträge</span>`;

        return `
        <div style="background:${farbe.bg}; border:2px solid ${farbe.border}; border-radius:10px; padding:14px 18px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <div style="flex:0 0 auto; min-width:120px;">
                    <div style="font-weight:700; font-size:16px; color:${farbe.text}; margin-bottom:6px;">${tierart}</div>
                    <div style="font-size:11px; color:${farbe.text}; opacity:0.75;">Aus Sortierung</div>
                    <div style="font-size:18px; font-weight:700; color:${farbe.text};">${sortiertKg > 0 ? sortiertKg.toFixed(0) + ' kg' : '—'}</div>
                </div>
                <div style="flex:1; min-width:200px;">
                    <div style="font-size:11px; color:${farbe.text}; font-weight:600; margin-bottom:6px;">Manuell eingeben (Enter zum Hinzufügen)</div>
                    <input type="number" id="te-input-${key}" placeholder="kg eingeben…" min="0" step="1"
                        style="width:100%; padding:8px 12px; border:2px solid ${farbe.border}; border-radius:8px; font-size:15px; font-weight:700; background:white; color:#333; box-sizing:border-box;"
                        onkeydown="teKeyNav(event,'${tierart}')">
                    <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; min-height:28px;">${eintragListe}</div>
                </div>
                <div style="flex:0 0 auto; text-align:right; min-width:100px;">
                    <div style="font-size:11px; color:${farbe.text}; opacity:0.75;">Gesamt</div>
                    <div id="te-sum-${key}" style="font-size:24px; font-weight:800; color:${farbe.text};">${gesamt.toFixed(0)} kg</div>
                </div>
            </div>
        </div>`;
    }).join('');

    aktualisiereGesamtSumme();
}

function teKeyNav(event, tierart) {
    if (event.key === 'Enter') { teManuellHinzufuegen(tierart); event.preventDefault(); return; }
    const idx = TIERART_LISTE.indexOf(tierart);
    if (event.key === 'ArrowDown' && idx < TIERART_LISTE.length - 1) {
        event.preventDefault();
        const next = document.getElementById('te-input-' + TIERART_LISTE[idx + 1].replace(/\s/g, '_'));
        if (next) next.focus();
    } else if (event.key === 'ArrowUp' && idx > 0) {
        event.preventDefault();
        const prev = document.getElementById('te-input-' + TIERART_LISTE[idx - 1].replace(/\s/g, '_'));
        if (prev) prev.focus();
    }
}

function teManuellHinzufuegen(tierart) {
    const key = tierart.replace(/\s/g, '_');
    const input = document.getElementById(`te-input-${key}`);
    if (!input) return;
    const val = parseFloat(input.value);
    if (!val || val <= 0) { input.value = ''; return; }
    teManuelleEintraege[tierart].push(val);
    input.value = '';
    renderTagesexport();
    // Focus zurück auf das Inputfeld
    setTimeout(() => { const el = document.getElementById(`te-input-${key}`); if (el) el.focus(); }, 50);
}

function teManuellLoeschen(tierart, idx) {
    teManuelleEintraege[tierart].splice(idx, 1);
    renderTagesexport();
}

function aktualisiereGesamtSumme() {
    const datum = document.getElementById('te-datum').value;
    const summen = berechneSortierExportNachTierart(datum);
    let gesamtAll = 0;
    TIERART_LISTE.forEach(tierart => {
        const sortiert = summen[tierart] || 0;
        const manuell = (teManuelleEintraege[tierart] || []).reduce((s, v) => s + v, 0);
        gesamtAll += sortiert + manuell;
    });
    const el = document.getElementById('te-gesamt');
    if (el) el.textContent = gesamtAll.toFixed(0) + ' kg';
}

function berechneSortierExportNachTierart(datum) {
    const result = {};
    TIERART_LISTE.forEach(t => result[t] = 0);

    if (!datum || !db) return result;

    const articles = db.articles || [];
    const tierartZuordnung = db.tierartZuordnung || {};
    const deletedKeys = db.deletedSortierBuchungen || [];

    const fertigNrZuTierart = {};
    Object.entries(tierartZuordnung).forEach(([nr, t]) => {
        if (TIERART_LISTE.includes(t)) fertigNrZuTierart[nr] = t;
    });

    const buchungen = (db.teamSortierBuchungen || []).filter(b => {
        if (!b || !b.datum) return false;
        const bDatum = b.datum.includes('.') ? b.datum.split('.').reverse().join('-') : b.datum;
        if (bDatum !== datum) return false;
        const bKey = b.id || (b.datum + '|' + (b.lief || '') + '|' + (b.sorte || ''));
        return !deletedKeys.includes(bKey);
    });

    const artikelMarkt = db.artikelMarkt || {};
    buchungen.forEach(b => {
        const kg = parseFloat(b.gebuchtKg || b.kg) || 0;
        if (kg <= 0) return;
        const fertigNr = b.fertigNr || b.artikelNr || fertigNrAusSorteBuchung(b.sorte, articles);
        if (!fertigNr) return;
        const tierart = fertigNrZuTierart[String(fertigNr)];
        const marktTyp = typeof artikelMarktTyp === 'function'
            ? artikelMarktTyp(fertigNr, b.sorte, artikelMarkt)
            : 'export';
        if (tierart && marktTyp === 'export') result[tierart] += kg;
    });

    return result;
}

function fertigNrAusSorteBuchung(sorte, articles) {
    if (typeof fertigNrAusSorte === 'function') return fertigNrAusSorte(sorte, articles);
    if (!sorte || !articles || !articles.length) return null;
    const q = sorte.toLowerCase().trim();
    let hit = articles.find(a => (a.name || '').toLowerCase() === q);
    if (!hit) hit = articles.find(a => {
        const n = (a.name || '').toLowerCase();
        return n.length > 4 && (q.includes(n) || n.includes(q));
    });
    return hit ? (hit.fertigNr || hit.nr || null) : null;
}

function getTagesexportDaten() {
    const datum = document.getElementById('te-datum').value;
    const summen = berechneSortierExportNachTierart(datum);
    return TIERART_LISTE.map(tierart => {
        const sortiert = summen[tierart] || 0;
        const manuell = (teManuelleEintraege[tierart] || []).reduce((s, v) => s + v, 0);
        return { tierart, sortiert, manuell, gesamt: sortiert + manuell };
    });
}

function exportTagesexportExcel() {
    const datum = document.getElementById('te-datum').value;
    const daten = getTagesexportDaten();
    const gesamt = daten.reduce((s, d) => s + d.gesamt, 0);
    const datumDE = datum ? datum.split('-').reverse().join('.') : '';

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
        const lines = [
            `BM;${datumDE}`, '',
            'Tierart;Sortierung (kg);Manuell (kg);Gesamt (kg)',
            ...daten.map(d => `${d.tierart};${(d.sortiert||0).toFixed(0)};${(d.manuell||0).toFixed(0)};${(d.gesamt||0).toFixed(0)}`),
            '', `BM GESAMT;;;${gesamt.toFixed(0)}`
        ];
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Tagesexport_${datum}.csv`; a.click();
        URL.revokeObjectURL(url);
    }
}

function shareTagesexportWhatsapp() {
    const datum = document.getElementById('te-datum').value;
    const daten = getTagesexportDaten();
    const gesamt = daten.reduce((s, d) => s + d.gesamt, 0);
    const datumDE = datum ? datum.split('-').reverse().join('.') : '';
    const zeilen = daten.filter(d => d.gesamt > 0).map(d => `${d.tierart}: *${d.gesamt.toFixed(0)} kg*`).join('\n');
    const text = `📦 *Tagesexport ${datumDE}*\n\n${zeilen}\n\n*BM Gesamt: ${gesamt.toFixed(0)} kg*`;
    if (navigator.share) { navigator.share({ text }); }
    else { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }
}

function debugTagesexport() {
    const datum = document.getElementById('te-datum').value;
    const articles = db.articles || [];
    const tz = db.tierartZuordnung || {};
    const heute = (db.teamSortierBuchungen || []).filter(b => {
        if (!b || !b.datum) return false;
        const bDatum = b.datum.includes('.') ? b.datum.split('.').reverse().join('-') : b.datum;
        return bDatum === datum;
    });
    const matches = heute.map(b => {
        const fnr = b.fertigNr || fertigNrAusSorteBuchung(b.sorte, articles);
        return { sorte: b.sorte, kg: b.gebuchtKg || b.kg, fertigNr: fnr, tierart: fnr ? tz[String(fnr)] : null };
    });
    const ohneMatch = matches.filter(m => !m.fertigNr);
    const ohneTierart = matches.filter(m => m.fertigNr && !m.tierart);
    const mitTierart = matches.filter(m => m.tierart);
    console.log('=== Tagesexport Debug ===', { mitTierart, ohneTierart, ohneMatch });
    alert(`Debug ${datum}:\n✅ Mit Tierart: ${mitTierart.length} Buchungen\n⚠️ Kein Tierart-Match: ${ohneTierart.length}\n❌ Kein Artikel-Match: ${ohneMatch.length}\n\nDetails → F12 Konsole`);
}
