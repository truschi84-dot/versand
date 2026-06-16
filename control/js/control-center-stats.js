let statMode = 'woche';
let statsMonthOffset = 0;
let showWorkerMatrix = false;

function ensureTeamTagesMengen() {
    if (!db.teamTagesMengen || typeof db.teamTagesMengen !== 'object') db.teamTagesMengen = {};
    if (!db.dailyStaff) db.dailyStaff = {};
    migriereTeamAusDailyStaff(db.teamTagesMengen, db.dailyStaff);
}

function teamPersonalInputHtml(datum, personalAnzahl, narrow) {
    const v = personalAnzahl > 0 ? personalAnzahl : '';
    const w = narrow ? '70px' : '120px';
    return `<input type="number" step="0.25" min="0" value="${v}" placeholder="–" title="Personal im Versand am ${datum.split('-').reverse().join('.')}" style="width:${w}; text-align:center;" onchange="saveTeamPersonalForDate('${datum}', this.value)">`;
}

function chefPlanungsHinweis(team, referenzProKopf) {
    const p = team.personalAnzahl;
    const pk = team.proKopf;
    const gesamt = team.gesamtKg;
    if (p > 0 && pk > 0 && gesamt > 0) {
        const persStr = Number(p) % 1 === 0 ? String(p) : String(p).replace('.', ',');
        return `Mit <b>${persStr} Personen</b> im Versand → <b>ca. ${pk.toLocaleString('de-DE')} kg pro Kopf</b> (heute ${gesamt.toLocaleString('de-DE')} kg gesamt).`;
    }
    if (referenzProKopf > 0) {
        return `Ø der aktuellen Woche: <b>ca. ${referenzProKopf.toLocaleString('de-DE')} kg pro Kopf</b> — Personal pro Tag unten eintragen.`;
    }
    return 'Personal im Versand eintragen (z.&nbsp;B. 3,5) — dann siehst du <b>kg pro Kopf</b> für die Planung gegenüber dem Chef.';
}

function onTeamPersonalDatumChange() {
    ensureTeamTagesMengen();
    const d = document.getElementById('team-personal-datum')?.value;
    if (!d) return;
    const team = typeof teamTagesAnzeigeAusDb === 'function'
        ? teamTagesAnzeigeAusDb(db, d)
        : teamTagesAnzeige(db.teamTagesMengen, db.dailyStaff, db.deliveries || [], d);
    const inp = document.getElementById('team-personal-heute');
    if (inp) inp.value = team.personalAnzahl > 0 ? team.personalAnzahl : '';
}

function saveTeamPersonalForDate(datum, rawVal) {
    ensureTeamTagesMengen();
    const d = datum || document.getElementById('team-personal-datum')?.value || ccTodayISO();
    let val;
    if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
        val = parseFloat(rawVal);
    } else {
        val = parseFloat(document.getElementById('team-personal-heute')?.value);
    }
    if (isNaN(val) || val < 0) return alert('Bitte gültige Dezimalzahl eingeben (z.B. 3.5).');
    setTeamPersonalAnzahl(db.teamTagesMengen, db.dailyStaff, d, val);
    syncTeamTagesGesamtKg(db.teamTagesMengen, db.deliveries || [], d);
    renderAll();
    renderTeamDashboard();
    const dateInp = document.getElementById('team-personal-datum');
    if (dateInp && !datum) dateInp.value = d;
    const stickyStatus = document.getElementById('sticky-status');
    if (stickyStatus) {
        stickyStatus.textContent = 'Personal Versand ' + d.split('-').reverse().join('.') + ': ' + val + ' · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
}

function saveTeamPersonalToday() {
    saveTeamPersonalForDate();
}

function toggleWorkerMatrix() {
    showWorkerMatrix = !showWorkerMatrix;
    const box = document.getElementById('worker-stats-container');
    const btn = document.getElementById('btn-toggle-worker-matrix');
    if (box) box.style.display = showWorkerMatrix ? 'block' : 'none';
    if (btn) btn.textContent = showWorkerMatrix ? '👤 Matrix ausblenden' : '👤 Einzel-Matrix';
    if (showWorkerMatrix) renderWorkerMatrixOnly();
}

function getStatsExportData() {
    ensureTeamTagesMengen();
    if (!db.deliveries) db.deliveries = [];
    if (!db.dailyAttendance) db.dailyAttendance = {};
    if (!db.dailyStaff) db.dailyStaff = {};

    if (showWorkerMatrix) return getWorkerStatsExportData();

    if (statMode === 'woche') {
        const days = getDatesForWeekOffset(statsWeekOffset);
        const firstDayObj = new Date(days[0]);
        const weekNum = getISOWeekNumber(firstDayObj);
        const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
        const metriken = typeof teamZeitraumMetrikenAusDb === 'function'
            ? teamZeitraumMetrikenAusDb(db, days)
            : teamZeitraumMetriken(db.teamTagesMengen, db.dailyStaff, db.deliveries, days);
        const headers = ['Tag', 'Datum', 'Personal', 'Sortiert (kg)', 'kg/Kopf', 'Export (kg)', 'Uns (kg)', 'N/Z (kg)'];
        const rows = metriken.tage.map((t, i) => {
            const sortKg = t.sortiertKg > 0 ? t.sortiertKg : t.gesamtKg;
            const tnz = nzKg(t.gesamtKg, t.exportKg, t.unsKg);
            return [dayNames[i], t.datum.split('-').reverse().join('.'), t.personalAnzahl || '-',
                sortKg > 0 ? sortKg.toLocaleString('de-DE') : '-',
                t.proKopf > 0 ? t.proKopf.toLocaleString('de-DE') : '-',
                t.exportKg > 0 ? t.exportKg.toLocaleString('de-DE') : '-',
                t.unsKg > 0 ? t.unsKg.toLocaleString('de-DE') : '-',
                tnz > 0 ? tnz.toLocaleString('de-DE') : '-'];
        });
        const summeSort = metriken.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
        const wNz = nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns);
        rows.push(['Σ KW', '', metriken.summePersonal, summeSort || '-', metriken.proKopf, metriken.summeExport || '-', metriken.summeUns || '-', wNz || '-']);
        return { title: 'Team-Effizienz KW ' + weekNum + ' (' + firstDayObj.getFullYear() + ')', headers, rows, landscape: true, fileKey: 'Team_KW' + weekNum };
    }

    let curr = new Date();
    curr.setMonth(curr.getMonth() + statsMonthOffset);
    const monthName = curr.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const targetMonth = curr.getMonth() + 1;
    const targetYear = curr.getFullYear();
    const daysInMonth = [];
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
        const iso = new Date(targetYear, targetMonth - 1, d);
        daysInMonth.push(new Date(iso.getTime() - iso.getTimezoneOffset() * 60000).toISOString().split('T')[0]);
    }
    const metriken = typeof teamZeitraumMetrikenAusDb === 'function'
        ? teamZeitraumMetrikenAusDb(db, daysInMonth)
        : teamZeitraumMetriken(db.teamTagesMengen, db.dailyStaff, db.deliveries, daysInMonth);
    const headers = ['Datum', 'Personal', 'Sortiert (kg)', 'kg/Kopf', 'Export (kg)', 'Uns (kg)', 'N/Z (kg)'];
    const rows = metriken.tage
        .filter((t) => t.gesamtKg > 0 || t.personalAnzahl > 0)
        .map((t) => {
            const sortKg = t.sortiertKg > 0 ? t.sortiertKg : t.gesamtKg;
            const tnz = nzKg(t.gesamtKg, t.exportKg, t.unsKg);
            return [new Date(t.datum).toLocaleDateString('de-DE'), t.personalAnzahl || '-',
                sortKg.toLocaleString('de-DE'),
                t.proKopf > 0 ? t.proKopf.toLocaleString('de-DE') : '-',
                t.exportKg > 0 ? t.exportKg.toLocaleString('de-DE') : '-',
                t.unsKg > 0 ? t.unsKg.toLocaleString('de-DE') : '-',
                tnz > 0 ? tnz.toLocaleString('de-DE') : '-'];
        });
    const summeSort = metriken.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
    const mNz2 = nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns);
    rows.push(['Gesamt ' + monthName, metriken.summePersonal, summeSort || '-', metriken.proKopf, metriken.summeExport || '-', metriken.summeUns || '-', mNz2 || '-']);
    return { title: 'Team-Effizienz ' + monthName, headers, rows, landscape: false, fileKey: 'Team_' + monthName.replace(/\s+/g, '_') };
}

function getWorkerStatsExportData() {
    if (!db.workers) db.workers = [];
    if (statMode === 'woche') {
        const days = getDatesForWeekOffset(statsWeekOffset);
        const firstDayObj = new Date(days[0]);
        const weekNum = getISOWeekNumber(firstDayObj);
        const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
        const headers = ['Name'].concat(dayNames.map((n, i) => n + ' ' + days[i].split('-')[2] + '.' + days[i].split('-')[1])).concat(['Gesamt Ø']);
        const rows = [];
        db.workers.forEach(w => {
            let workerTotalKg = 0, workerWorkedDays = 0;
            const row = [w];
            days.forEach(d => {
                let dayKg = 0;
                db.deliveries.filter(del => del.date === d).forEach(del => {
                    (del.entries || []).forEach(e => { if (e.workers && e.workers[w]) dayKg += (parseFloat(e.workers[w]) || 0); });
                });
                db.deliveries.forEach(del => {
                    (del.workerShares || []).forEach(ws => {
                        const wsDate = ws.date || del.date;
                        if (ws.name === w && wsDate === d) dayKg += (parseFloat(ws.kg) || 0);
                    });
                });
                const dayFactor = (db.dailyAttendance[d] && db.dailyAttendance[d][w]) ? parseFloat(db.dailyAttendance[d][w]) : 0;
                workerTotalKg += dayKg;
                if (dayFactor > 0) workerWorkedDays += dayFactor;
                else if (dayKg > 0) workerWorkedDays += 1;
                row.push(dayKg > 0 ? dayKg.toLocaleString('de-DE') : '-');
            });
            const trueAverage = workerWorkedDays > 0 ? Math.round(workerTotalKg / workerWorkedDays) : 0;
            row.push(trueAverage > 0 ? trueAverage.toLocaleString('de-DE') : '0');
            rows.push(row);
        });
        return { title: 'Mitarbeiter Leistung KW ' + weekNum + ' (' + firstDayObj.getFullYear() + ')', headers, rows, landscape: true, fileKey: 'KW' + weekNum };
    }

    let curr = new Date();
    curr.setMonth(curr.getMonth() + statsMonthOffset);
    const monthName = curr.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const targetMonth = curr.getMonth() + 1;
    const targetYear = curr.getFullYear();
    const headers = ['Mitarbeiter', 'Sortiertes Gewicht (kg)'];
    const workerSums = {};
    db.workers.forEach(w => { workerSums[w] = 0; });
    let totalMonthKg = 0;
    db.deliveries.forEach(del => {
        (del.workerShares || []).forEach(ws => {
            const sDate = ws.date || del.date;
            if (!sDate) return;
            const dParts = sDate.includes('-') ? sDate.split('-') : sDate.split('.');
            const dYear = sDate.includes('-') ? parseInt(dParts[0]) : parseInt(dParts[2]);
            const dMonth = parseInt(dParts[1]);
            if (dYear === targetYear && dMonth === targetMonth && workerSums[ws.name] !== undefined) {
                workerSums[ws.name] += (parseFloat(ws.kg) || 0);
                totalMonthKg += (parseFloat(ws.kg) || 0);
            }
        });
        (del.entries || []).forEach(e => {
            if (!del.date) return;
            const dParts = del.date.includes('-') ? del.date.split('-') : del.date.split('.');
            const dYear = del.date.includes('-') ? parseInt(dParts[0]) : parseInt(dParts[2]);
            const dMonth = parseInt(dParts[1]);
            if (dYear === targetYear && dMonth === targetMonth && e.workers) {
                for (const [n, wkg] of Object.entries(e.workers)) {
                    if (workerSums[n] !== undefined) {
                        workerSums[n] += (parseFloat(wkg) || 0);
                        totalMonthKg += (parseFloat(wkg) || 0);
                    }
                }
            }
        });
    });
    const rows = Object.keys(workerSums).sort((a, b) => workerSums[b] - workerSums[a])
        .map(w => [w, workerSums[w].toLocaleString('de-DE') + ' kg']);
    rows.push(['Gesamt für ' + monthName, totalMonthKg.toLocaleString('de-DE') + ' kg']);
    return { title: 'Mitarbeiter Leistung ' + monthName, headers, rows, landscape: false, fileKey: monthName.replace(/\s+/g, '_') };
}

function printStatsList() {
    const d = getStatsExportData();
    if (!d.rows.length) return alert('Keine Statistik-Daten vorhanden!');
    printTableDocument({ title: d.title, subtitle: 'Tresch & Sohn - PC Control Center', headers: d.headers, rows: d.rows, landscape: d.landscape });
}

function exportStatsExcel() {
    const d = getStatsExportData();
    if (!d.rows.length) return alert('Keine Statistik-Daten vorhanden!');
    const objRows = d.rows.map(r => {
        const o = {};
        d.headers.forEach((h, i) => { o[h] = r[i]; });
        return o;
    });
    downloadExcelSheet(objRows, 'Statistik', 'Statistik_' + d.fileKey + '_' + new Date().toISOString().split('T')[0] + '.xlsx');
}

function runStatsQuery() {
    const q = document.getElementById('stats-query').value.toLowerCase().trim(); const res = document.getElementById('stats-results');
    if(!q) { res.innerHTML = '<p style="color:#999; margin:0;">Bitte Suchbegriff eingeben...</p>'; return; }
    let html = '';
    const foundArts = (db.articles||[]).filter(a => (a.name && a.name.toLowerCase().includes(q)) || (a.nr && a.nr.includes(q)) || (a.fertigNr && a.fertigNr.includes(q)) || (a.suppliers && a.suppliers.some(s => s.toLowerCase().includes(q))));
    if(foundArts.length > 0) {
        html += `<h4 style="color:var(--success); margin-top:0;">✅ Treffer in fertigen Artikeln (${foundArts.length})</h4><ul style="margin-bottom:20px;">`;
        foundArts.forEach(a => { const sup = (a.suppliers && a.suppliers.length > 0) ? a.suppliers.join(', ') : '<span style="color:red;">Kein Lieferant</span>'; html += `<li style="margin-bottom:8px;"><b>Lose: ${a.nr || '?'}</b> | ${a.name} <br><small style="color:#666;">Zugeordnet: ${sup}</small></li>`; });
        html += `</ul>`;
    }
    const foundTodo = (db.todo||[]).filter(a => (a.name && a.name.toLowerCase().includes(q)) || (a.fertigNr && a.fertigNr.includes(q)));
    if(foundTodo.length > 0) { html += `<h4 style="color:#c62828;">❌ Treffer in offenen Artikeln (${foundTodo.length})</h4><ul>`; foundTodo.forEach(a => html += `<li>Fertig-Nr: <b>${a.fertigNr}</b> | ${a.name}</li>`); html += `</ul>`; }
    res.innerHTML = html || '<p style="color:#c62828; font-weight:bold; margin:0;">Keine Treffer in der Datenbank gefunden.</p>';
}

function setStatMode(m) { statMode = m; renderWorkerStats(); }
function changeWeek(dir) { statsWeekOffset += dir; renderWorkerStats(); }
function changeMonth(dir) { statsMonthOffset += dir; renderWorkerStats(); }

function anaFmtKg(kg, dash) {
    const n = parseFloat(kg) || 0;
    if (n <= 0) return dash !== undefined ? dash : '–';
    return n.toLocaleString('de-DE');
}

function anaSelectedDatum() {
    return document.getElementById('team-personal-datum')?.value || ccTodayISO();
}

function anaDatumLabel(iso) {
    if (!iso) return '–';
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderExUnsSplitBar(exportKg, unsKg, gesamtKg) {
    const ex = parseFloat(exportKg) || 0;
    const uns = parseFloat(unsKg) || 0;
    const gesamt = parseFloat(gesamtKg) || 0;
    const nz = Math.max(0, gesamt - ex - uns);
    const sum = ex + uns + nz;
    if (sum <= 0) {
        return '<div class="ana-empty" style="padding:16px;">Noch keine Sortier-Daten mit Export/Uns für diesen Zeitraum.</div>';
    }
    const exPct = Math.round((ex / sum) * 100);
    const unsPct = Math.round((uns / sum) * 100);
    const nzPct = 100 - exPct - unsPct;
    return `
    <div class="ana-split">
        <div class="ana-split-head">
            <span class="ex-lbl">Export ${anaFmtKg(ex)} kg (${exPct}%)</span>
            <span class="uns-lbl">Uns ${anaFmtKg(uns)} kg (${unsPct}%)</span>
            ${nz > 0 ? `<span style="color:#888;font-size:12px;">Nicht zugeordnet ${anaFmtKg(nz)} kg (${nzPct}%)</span>` : ''}
        </div>
        <div class="ana-split-bar">
            <div class="ana-split-ex" style="width:${exPct}%;">${ex > 0 ? 'EX' : ''}</div>
            <div class="ana-split-uns" style="width:${unsPct}%;">${uns > 0 ? 'UNS' : ''}</div>
            ${nz > 0 ? `<div style="flex:${nzPct};background:#ddd;display:flex;align-items:center;justify-content:center;font-size:10px;color:#888;">N/Z</div>` : ''}
        </div>
    </div>`;
}

function nzKg(gesamt, ex, uns) { return Math.max(0, (parseFloat(gesamt)||0) - (parseFloat(ex)||0) - (parseFloat(uns)||0)); }

function renderLieferantenTabelle(rows, summe) {
    if (!rows.length) {
        return '<div class="ana-empty">Keine Lieferanten-Daten für diesen Zeitraum.</div>';
    }
    const s = summe || rows.reduce((acc, r) => {
        acc.sortiertKg += r.sortiertKg; acc.exportKg += r.exportKg;
        acc.unsKg += r.unsKg; acc.gesamtKg += r.gesamtKg; return acc;
    }, { sortiertKg: 0, exportKg: 0, unsKg: 0, gesamtKg: 0 });

    let html = `<div class="ana-table-wrap"><table class="ana-table"><thead><tr>
        <th>Lieferant</th><th>Sortiert</th><th>Export</th><th>Uns</th><th style="color:#888;">N/Z</th><th>Gesamt</th>
    </tr></thead><tbody>`;
    rows.forEach((r) => {
        const nz = nzKg(r.gesamtKg, r.exportKg, r.unsKg);
        html += `<tr>
            <td>${String(r.name).replace(/</g, '&lt;')}</td>
            <td class="col-sort">${anaFmtKg(r.sortiertKg)}</td>
            <td class="col-ex">${anaFmtKg(r.exportKg)}</td>
            <td class="col-uns">${anaFmtKg(r.unsKg)}</td>
            <td style="color:#888;">${nz > 0 ? anaFmtKg(nz) : '–'}</td>
            <td class="col-gesamt">${anaFmtKg(r.gesamtKg)}</td>
        </tr>`;
    });
    const sNz = nzKg(s.gesamtKg, s.exportKg, s.unsKg);
    html += `<tr class="ana-sum">
        <td>Σ Summe</td>
        <td class="col-sort">${anaFmtKg(s.sortiertKg)}</td>
        <td class="col-ex">${anaFmtKg(s.exportKg)}</td>
        <td class="col-uns">${anaFmtKg(s.unsKg)}</td>
        <td style="color:#888;">${sNz > 0 ? anaFmtKg(sNz) : '–'}</td>
        <td class="col-gesamt">${anaFmtKg(s.gesamtKg)}</td>
    </tr></tbody></table></div>`;
    return html;
}

function renderAnaKpiRow(team) {
    const sortKg = team.sortiertKg > 0 ? team.sortiertKg : team.gesamtKg;
    const nz = Math.max(0, team.gesamtKg - (parseFloat(team.exportKg) || 0) - (parseFloat(team.unsKg) || 0));
    return `
    <div class="ana-kpi-row">
        <div class="ana-kpi kpi-gesamt"><div class="val">${anaFmtKg(sortKg)}</div><div class="unit">kg</div><div class="cap">Sortiert (Handy)</div></div>
        <div class="ana-kpi kpi-ex"><div class="val">${anaFmtKg(team.exportKg)}</div><div class="unit">kg</div><div class="cap">Export</div></div>
        <div class="ana-kpi kpi-uns"><div class="val">${anaFmtKg(team.unsKg)}</div><div class="unit">kg</div><div class="cap">Uns</div></div>
        ${nz > 1 ? `<div class="ana-kpi" style="background:#f5f5f5;"><div class="val" style="color:#888;">${anaFmtKg(nz)}</div><div class="unit">kg</div><div class="cap" style="color:#888;">Nicht zugeordnet</div></div>` : ''}
        <div class="ana-kpi kpi-kopf"><div class="val">${team.proKopf > 0 ? anaFmtKg(team.proKopf) : '–'}</div><div class="unit">kg</div><div class="cap">pro Kopf</div></div>
    </div>`;
}

function trendPfeil(curr, prev) {
    if (!prev || prev <= 0) return '';
    const diff = Math.round(((curr - prev) / prev) * 100);
    if (Math.abs(diff) < 2) return '<span class="trend-flat">→ ±0%</span>';
    return curr > prev
        ? `<span class="trend-up">↑ +${diff}%</span>`
        : `<span class="trend-down">↓ ${diff}%</span>`;
}

function renderWochenVergleich() {
    const currDays = getDatesForWeekOffset(statsWeekOffset);
    const prevDays = getDatesForWeekOffset(statsWeekOffset - 1);
    const curr = typeof teamZeitraumMetrikenAusDb === 'function' ? teamZeitraumMetrikenAusDb(db, currDays) : { tage: [], summeExport: 0, proKopf: 0 };
    const prev = typeof teamZeitraumMetrikenAusDb === 'function' ? teamZeitraumMetrikenAusDb(db, prevDays) : { tage: [], summeExport: 0, proKopf: 0 };
    const currSort = curr.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
    const prevSort = prev.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);
    const exPctC = currSort > 0 ? Math.round((curr.summeExport / currSort) * 100) : 0;
    const exPctP = prevSort > 0 ? Math.round((prev.summeExport / prevSort) * 100) : 0;
    return `
    <div class="ana-vergleich">
        <div class="ana-vergleich-title">📊 Wochen-Vergleich — aktuelle Woche vs. Vorwoche</div>
        <div class="ana-vkpi-row">
            <div class="ana-vkpi">
                <div class="ana-vkpi-label">Sortiert gesamt</div>
                <div class="ana-vkpi-curr">${anaFmtKg(currSort)} kg</div>
                <div class="ana-vkpi-prev">Vorwoche: ${anaFmtKg(prevSort)} kg ${trendPfeil(currSort, prevSort)}</div>
            </div>
            <div class="ana-vkpi">
                <div class="ana-vkpi-label">Export-Quote</div>
                <div class="ana-vkpi-curr">${exPctC}%</div>
                <div class="ana-vkpi-prev">Vorwoche: ${exPctP}% ${trendPfeil(exPctC, exPctP)}</div>
            </div>
            <div class="ana-vkpi">
                <div class="ana-vkpi-label">∅ kg / Kopf / Tag</div>
                <div class="ana-vkpi-curr">${curr.proKopf > 0 ? anaFmtKg(curr.proKopf) : '–'}</div>
                <div class="ana-vkpi-prev">Vorwoche: ${prev.proKopf > 0 ? anaFmtKg(prev.proKopf) : '–'} ${curr.proKopf > 0 && prev.proKopf > 0 ? trendPfeil(curr.proKopf, prev.proKopf) : ''}</div>
            </div>
        </div>
    </div>`;
}

function getDatesForWeekOffset(offset) {
    let curr = new Date(); let first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1); let monday = new Date(curr.setDate(first + (offset * 7)));
    let days = []; for(let i=0; i<7; i++) { let d = new Date(monday); d.setDate(monday.getDate() + i); days.push(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]); }
    return days;
}

function getISOWeekNumber(d) {
    let date = new Date(d.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7); let week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function renderWorkerStats() {
    renderTeamDashboard();
    if (showWorkerMatrix) renderWorkerMatrixOnly();
}

function renderTeamDashboard() {
    if (typeof syncSortierDatenFuerErfassung === 'function') syncSortierDatenFuerErfassung();
    ensureTeamTagesMengen();
    const container = document.getElementById('team-stats-container');
    if (!container) return;
    if (!db.deliveries) db.deliveries = [];

    const selDatum = anaSelectedDatum();
    const today = ccTodayISO();
    const tagTeam = typeof teamTagesAnzeigeAusDb === 'function'
        ? teamTagesAnzeigeAusDb(db, selDatum)
        : teamTagesAnzeige(db.teamTagesMengen, db.dailyStaff, db.deliveries, selDatum);
    const personalVal = tagTeam.personalAnzahl > 0 ? tagTeam.personalAnzahl : '';
    const wochenMetriken = typeof teamZeitraumMetrikenAusDb === 'function'
        ? teamZeitraumMetrikenAusDb(db, getDatesForWeekOffset(statsWeekOffset))
        : teamZeitraumMetriken(db.teamTagesMengen, db.dailyStaff, db.deliveries, getDatesForWeekOffset(statsWeekOffset));
    const chefHinweis = chefPlanungsHinweis(tagTeam, wochenMetriken.proKopf || 0);
    const lieferantenTag = typeof lieferantenAuswertungFuerDatum === 'function'
        ? lieferantenAuswertungFuerDatum(db, selDatum) : [];

    const modeWoche = statMode === 'woche' ? 'active' : '';
    const modeMonat = statMode === 'monat' ? 'active' : '';
    let periodHtml = statMode === 'woche' ? renderTeamWeeklyOverview() : renderTeamMonthlyOverview();
    let periodLieferantenHtml = '';
    if (statMode === 'woche') {
        const days = getDatesForWeekOffset(statsWeekOffset);
        const rows = typeof zeitraumLieferantenAuswertung === 'function' ? zeitraumLieferantenAuswertung(db, days) : [];
        const first = new Date(days[0]);
        periodLieferantenHtml = `
        <div class="ana-section card">
            <div class="ana-section-h"><h3>Lieferanten — gesamte Woche</h3><span>KW ${getISOWeekNumber(first)}</span></div>
            ${renderLieferantenTabelle(rows)}
        </div>`;
    } else {
        let curr = new Date();
        curr.setMonth(curr.getMonth() + statsMonthOffset);
        const targetMonth = curr.getMonth() + 1;
        const targetYear = curr.getFullYear();
        const daysInMonth = [];
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();
        for (let d = 1; d <= lastDay; d++) {
            const iso = new Date(targetYear, targetMonth - 1, d);
            daysInMonth.push(new Date(iso.getTime() - iso.getTimezoneOffset() * 60000).toISOString().split('T')[0]);
        }
        const rows = typeof zeitraumLieferantenAuswertung === 'function' ? zeitraumLieferantenAuswertung(db, daysInMonth) : [];
        periodLieferantenHtml = `
        <div class="ana-section card">
            <div class="ana-section-h"><h3>Lieferanten — gesamter Monat</h3><span>${curr.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}</span></div>
            ${renderLieferantenTabelle(rows)}
        </div>`;
    }

    container.innerHTML = `
    <div class="ana-toolbar no-print">
        <div class="ana-toolbar-group">
            <div>
                <label>Tag auswählen</label>
                <input type="date" id="team-personal-datum" value="${selDatum || today}" onchange="onTeamPersonalDatumChange(); renderWorkerStats();" style="min-width:150px;">
            </div>
            <div>
                <label>Personal im Versand</label>
                <input type="number" id="team-personal-heute" step="0.25" min="0" value="${personalVal}" placeholder="z.B. 3,5" style="width:100px;">
            </div>
            <button class="btn btn-save" onclick="saveTeamPersonalForDate()" style="margin-bottom:1px;">💾 Speichern</button>
        </div>
        <div class="ana-mode-tabs">
            <button type="button" class="ana-mode-tab ${modeWoche}" onclick="setStatMode('woche')">Woche</button>
            <button type="button" class="ana-mode-tab ${modeMonat}" onclick="setStatMode('monat')">Monat</button>
        </div>
    </div>

    <div class="card">
        <div class="ana-section-h">
            <h3>Tagesauswertung — ${anaDatumLabel(selDatum)}</h3>
            <span>Personal: <b>${tagTeam.personalAnzahl || '–'}</b></span>
        </div>
        <div class="ana-chef no-print"><b>📋 Für den Chef:</b> ${chefHinweis}</div>
        ${renderAnaKpiRow(tagTeam)}
        ${renderExUnsSplitBar(tagTeam.exportKg, tagTeam.unsKg, tagTeam.gesamtKg)}
        <div class="ana-section-h" style="margin-top:8px;">
            <h3>Wer schickt wie viel?</h3>
            <span>Sortiert (Handy), Export/Uns aus Wiegescheinen</span>
        </div>
        ${renderLieferantenTabelle(lieferantenTag)}
    </div>

    <div class="card">${periodHtml}</div>
    ${periodLieferantenHtml}

    <div class="card no-print">
        <div class="ana-section-h">
            <h3>📱 Sortier-Buchungen — ${anaDatumLabel(selDatum)}</h3>
            <span style="font-size:12px;color:#888;">Einzelne Buchungen löschen</span>
        </div>
        <input type="text" id="sortier-buchungen-suche" placeholder="🔍 Lieferant oder Sorte suchen…" oninput="filterSortierBuchungen()" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:10px;">
        <div id="sortier-buchungen-liste">${renderSortierBuchungenFuerDatum(selDatum)}</div>
    </div>`;
}

function renderTeamWeeklyOverview() {
    const days = getDatesForWeekOffset(statsWeekOffset);
    const firstDayObj = new Date(days[0]);
    const weekNum = getISOWeekNumber(firstDayObj);
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const metriken = typeof teamZeitraumMetrikenAusDb === 'function'
        ? teamZeitraumMetrikenAusDb(db, days)
        : teamZeitraumMetriken(db.teamTagesMengen, db.dailyStaff, db.deliveries, days);
    const summeSort = metriken.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);

    const maxKg = Math.max(...metriken.tage.map(t => t.sortiertKg || t.gesamtKg || 0));

    let html = `
    <div class="ana-section-h">
        <h3>Wochenübersicht</h3>
        <div class="ana-period-nav no-print">
            <button class="btn btn-black" onclick="changeWeek(-1)">◀</button>
            <strong>KW ${weekNum} · ${firstDayObj.getFullYear()}</strong>
            <button class="btn btn-black" onclick="changeWeek(1)">▶</button>
        </div>
    </div>
    ${renderWochenVergleich()}
    ${renderExUnsSplitBar(metriken.summeExport, metriken.summeUns, metriken.summeKg)}
    <div class="ana-table-wrap"><table class="ana-table"><thead><tr>
        <th>Tag</th><th>Sortiert</th><th>Personal</th><th>kg/Kopf</th><th>Export</th><th>Uns</th><th style="color:#888;">N/Z</th>
    </tr></thead><tbody>`;

    metriken.tage.forEach((t, i) => {
        const sortKg = t.sortiertKg > 0 ? t.sortiertKg : t.gesamtKg;
        const tnz = nzKg(t.gesamtKg, t.exportKg, t.unsKg);
        const isBest = sortKg > 0 && sortKg === maxKg;
        const click = sortKg > 0 ? ` onclick="document.getElementById('team-personal-datum').value='${t.datum}'; onTeamPersonalDatumChange(); renderWorkerStats();"` : '';
        html += `<tr class="${isBest ? 'best-day' : ''}" style="cursor:${sortKg > 0 ? 'pointer' : 'default'};"${click}>
            <td>${dayNames[i]} <small style="color:#888;">${t.datum.split('-')[2]}.${t.datum.split('-')[1]}</small></td>
            <td class="col-sort">${anaFmtKg(sortKg)}</td>
            <td>${teamPersonalInputHtml(t.datum, t.personalAnzahl, true)}</td>
            <td>${t.proKopf > 0 ? anaFmtKg(t.proKopf) : '–'}</td>
            <td class="col-ex">${anaFmtKg(t.exportKg)}</td>
            <td class="col-uns">${anaFmtKg(t.unsKg)}</td>
            <td style="color:#888;">${tnz > 0 ? anaFmtKg(tnz) : '–'}</td>
        </tr>`;
    });

    const wNz = nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns);
    html += `<tr class="ana-sum">
        <td>Σ Woche</td>
        <td class="col-sort">${anaFmtKg(summeSort)}</td>
        <td>${metriken.summePersonal || '–'}</td>
        <td>${metriken.proKopf > 0 ? anaFmtKg(metriken.proKopf) : '–'}</td>
        <td class="col-ex">${anaFmtKg(metriken.summeExport)}</td>
        <td class="col-uns">${anaFmtKg(metriken.summeUns)}</td>
        <td style="color:#888;">${wNz > 0 ? anaFmtKg(wNz) : '–'}</td>
    </tr></tbody></table></div>`;
    return html;
}

function renderTeamMonthlyOverview() {
    let curr = new Date();
    curr.setMonth(curr.getMonth() + statsMonthOffset);
    const monthName = curr.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const targetMonth = curr.getMonth() + 1;
    const targetYear = curr.getFullYear();
    const daysInMonth = [];
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
        const iso = new Date(targetYear, targetMonth - 1, d);
        daysInMonth.push(new Date(iso.getTime() - iso.getTimezoneOffset() * 60000).toISOString().split('T')[0]);
    }
    const metriken = typeof teamZeitraumMetrikenAusDb === 'function'
        ? teamZeitraumMetrikenAusDb(db, daysInMonth)
        : teamZeitraumMetriken(db.teamTagesMengen, db.dailyStaff, db.deliveries, daysInMonth);
    const aktiveTage = metriken.tage.filter((t) => t.gesamtKg > 0 || t.personalAnzahl > 0);

    const summeSort = metriken.tage.reduce((a, t) => a + (t.sortiertKg || t.gesamtKg || 0), 0);

    let html = `
    <div class="ana-section-h">
        <h3>Monatsübersicht</h3>
        <div class="ana-period-nav no-print">
            <button class="btn btn-black" onclick="changeMonth(-1)">◀</button>
            <strong>${monthName}</strong>
            <button class="btn btn-black" onclick="changeMonth(1)">▶</button>
        </div>
    </div>
    <div class="ana-kpi-row" style="margin-bottom:16px;">
        <div class="ana-kpi kpi-gesamt"><div class="val">${anaFmtKg(summeSort)}</div><div class="unit">kg</div><div class="cap">Sortiert (Handy)</div></div>
        <div class="ana-kpi kpi-ex"><div class="val">${anaFmtKg(metriken.summeExport)}</div><div class="unit">kg</div><div class="cap">Export</div></div>
        <div class="ana-kpi kpi-uns"><div class="val">${anaFmtKg(metriken.summeUns)}</div><div class="unit">kg</div><div class="cap">Uns</div></div>
        <div class="ana-kpi" style="background:#f5f5f5;"><div class="val" style="color:#888;">${anaFmtKg(nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns))}</div><div class="unit" style="color:#888;">kg</div><div class="cap" style="color:#888;">N/Z</div></div>
        <div class="ana-kpi kpi-kopf"><div class="val">${metriken.proKopf > 0 ? anaFmtKg(metriken.proKopf) : '–'}</div><div class="unit">kg</div><div class="cap">Ø pro Kopf</div></div>
    </div>
    ${renderExUnsSplitBar(metriken.summeExport, metriken.summeUns, metriken.summeKg)}
    <div class="ana-table-wrap"><table class="ana-table"><thead><tr>
        <th>Datum</th><th>Sortiert</th><th>Personal</th><th>kg/Kopf</th><th>Export</th><th>Uns</th><th style="color:#888;">N/Z</th>
    </tr></thead><tbody>`;

    if (!aktiveTage.length) {
        html += `<tr><td colspan="7" class="ana-empty">Keine Tagesdaten in diesem Monat.</td></tr>`;
    } else {
        aktiveTage.forEach((t) => {
            const sortKg = t.sortiertKg > 0 ? t.sortiertKg : t.gesamtKg;
            const tnz = nzKg(t.gesamtKg, t.exportKg, t.unsKg);
            html += `<tr style="cursor:pointer;" onclick="document.getElementById('team-personal-datum').value='${t.datum}'; onTeamPersonalDatumChange(); renderWorkerStats();">
                <td>${new Date(t.datum).toLocaleDateString('de-DE')}</td>
                <td class="col-sort">${anaFmtKg(sortKg)}</td>
                <td>${teamPersonalInputHtml(t.datum, t.personalAnzahl, true)}</td>
                <td>${t.proKopf > 0 ? anaFmtKg(t.proKopf) : '–'}</td>
                <td class="col-ex">${anaFmtKg(t.exportKg)}</td>
                <td class="col-uns">${anaFmtKg(t.unsKg)}</td>
                <td style="color:#888;">${tnz > 0 ? anaFmtKg(tnz) : '–'}</td>
            </tr>`;
        });
    }

    const mNz = nzKg(metriken.summeKg, metriken.summeExport, metriken.summeUns);
    html += `<tr class="ana-sum">
        <td>Gesamt ${monthName}</td>
        <td class="col-sort">${anaFmtKg(summeSort)}</td>
        <td>${metriken.summePersonal || '–'}</td>
        <td>${metriken.proKopf > 0 ? anaFmtKg(metriken.proKopf) : '–'}</td>
        <td class="col-ex">${anaFmtKg(metriken.summeExport)}</td>
        <td class="col-uns">${anaFmtKg(metriken.summeUns)}</td>
        <td style="color:#888;">${mNz > 0 ? anaFmtKg(mNz) : '–'}</td>
    </tr></tbody></table></div>`;
    return html;
}

function renderWorkerMatrixOnly() {
    if (statMode === 'woche') renderWeeklyMatrix();
    else renderMonthlyOverview();
}

function renderWeeklyMatrix() {
    const container = document.getElementById('worker-stats-container'); if(!container) return;
    if (!db.deliveries) db.deliveries = []; if (!db.workers) db.workers = [];
    if (!db.dailyAttendance) db.dailyAttendance = {}; if (!db.dailyStaff) db.dailyStaff = {};

    const days = getDatesForWeekOffset(statsWeekOffset); 
    const firstDayObj = new Date(days[0]); const weekNum = getISOWeekNumber(firstDayObj);
    
    let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
        <h3 style="margin:0;">Mitarbeiter Leistung (Wochenansicht)</h3>
        <div class="no-print" style="display:flex; align-items:center; gap:15px;">
            <button class="btn btn-black" onclick="changeWeek(-1)">◀ Letzte Woche</button>
            <strong style="font-size:16px;">KW ${weekNum} (${firstDayObj.getFullYear()})</strong>
            <button class="btn btn-black" onclick="changeWeek(1)">Nächste Woche ▶</button>
        </div>
    </div>
    <div class="print-only" style="font-size:18px; font-weight:bold; margin-bottom:15px;">KW ${weekNum} (${firstDayObj.getFullYear()})</div>
    <div style="overflow-x: auto;">
    <table class="supplier-table" style="width:100%; border-collapse:collapse; text-align:center;">
        <thead><tr style="background:#f8f9fa;"><th style="text-align:left;">Name</th>`;
    
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    days.forEach((d, index) => {
        const team = teamTagesAnzeige(db.teamTagesMengen, db.dailyStaff, db.deliveries, d);
        const tagSum = typeof summeGewichtKgProTag === 'function'
            ? summeGewichtKgProTag(db.deliveries, d)
            : gesamtKgFuerDatum(db.deliveries, d);
        const zugew = typeof summeWorkerKgProTag === 'function' ? summeWorkerKgProTag(db.deliveries, d) : 0;
        let meta = `👥 ${team.personalAnzahl || '–'} · Σ ${tagSum.toLocaleString('de-DE')} kg`;
        if (zugew > 0 && Math.abs(zugew - tagSum) > 1) meta += `<br><span style="font-size:9px;">zugew. ${zugew.toLocaleString('de-DE')} kg</span>`;
        html += `<th style="text-align:center;">${dayNames[index]}<br><small style="font-weight:normal;">${d.split('-')[2]}.${d.split('-')[1]}</small><br><div class="no-print" style="font-size:10px; color:#666; font-weight:normal; margin-top:4px; line-height:1.35;">${meta}</div></th>`;
    });
    
    html += `<th style="text-align:center;">Gesamt Ø<br><small style="font-weight:normal">(auf 1 Tag)</small></th></tr></thead><tbody>`;
    
    db.workers.forEach(w => {
        let color = db.workerColors && db.workerColors[w] ? db.workerColors[w] : '#333';
        html += `<tr><td style="text-align:left; font-weight:bold; color:${color}">● ${w}</td>`; 
        let workerTotalKg = 0; let workerWorkedDays = 0; 
        days.forEach(d => {
            let dayKg = 0; 
            db.deliveries.filter(del => del.date === d).forEach(del => { 
                (del.entries || []).forEach(e => { if(e.workers && e.workers[w]) dayKg += (parseFloat(e.workers[w])||0); });
            });
        db.deliveries.forEach(del => { (del.workerShares || []).forEach(ws => { let wsDate = ws.date || del.date; if (ws.name === w && wsDate === d) { dayKg += (parseFloat(ws.kg)||0); } }); });
            let dayFactor = (db.dailyAttendance[d] && db.dailyAttendance[d][w]) ? parseFloat(db.dailyAttendance[d][w]) : 0;
            workerTotalKg += dayKg; if(dayFactor > 0) { workerWorkedDays += dayFactor; } else if (dayKg > 0) { workerWorkedDays += 1; }
            
            if (dayKg > 0 || dayFactor > 0) {
                let factorHtml = (dayFactor > 0 && dayFactor < 1) ? '<div class="no-print" style="font-size:10px; color:#e65100; margin-top:2px;">' + dayFactor + ' T</div>' : '';
                let kgHtml = dayKg > 0 ? dayKg.toLocaleString('de-DE') : '-';
                let colColor = dayKg > 0 ? '#000' : '#888';
                html += '<td style="color:' + colColor + '; text-align:center;">' + kgHtml + factorHtml + '</td>';
            } else {
                html += '<td style="color:#ccc; text-align:center;">-</td>';
            }
        });
        let trueAverage = workerWorkedDays > 0 ? Math.round(workerTotalKg / workerWorkedDays) : 0; 
        html += `<td style="background:#e3f2fd; color:var(--primary); font-weight:bold; text-align:center;">${trueAverage > 0 ? trueAverage.toLocaleString('de-DE') : 0}</td></tr>`;
    });
    html += `</tbody></table></div>`; container.innerHTML = html;
}

function renderMonthlyOverview() {
    const container = document.getElementById('worker-stats-container'); if(!container) return;
    if (!db.deliveries) db.deliveries = []; if (!db.workers) db.workers = [];
    
    let curr = new Date(); curr.setMonth(curr.getMonth() + statsMonthOffset);
    let monthName = curr.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    let targetMonth = curr.getMonth() + 1; let targetYear = curr.getFullYear();
    
    let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
        <h3 style="margin:0;">Mitarbeiter Leistung (Monatsansicht)</h3>
        <div class="no-print" style="display:flex; align-items:center; gap:15px;">
            <button class="btn btn-black" onclick="changeMonth(-1)">◀ Letzter Monat</button>
            <strong style="font-size:16px;">${monthName}</strong>
            <button class="btn btn-black" onclick="changeMonth(1)">Nächster Monat ▶</button>
        </div>
    </div>
    <div class="print-only" style="font-size:18px; font-weight:bold; margin-bottom:15px;">${monthName}</div>
    <table class="supplier-table" style="width:100%; border-collapse:collapse; text-align:left;">
        <thead><tr style="background:#f8f9fa;"><th>Mitarbeiter</th><th style="text-align:right;">Sortiertes Gewicht (kg)</th></tr></thead>
        <tbody>`;
        
    let totalMonthKg = 0; let workerSums = {}; db.workers.forEach(w => workerSums[w] = 0);
    
    db.deliveries.forEach(del => {
    (del.workerShares || []).forEach(ws => { 
        let sDate = ws.date || del.date; if(!sDate) return;
        let dParts = sDate.includes('-') ? sDate.split('-') : sDate.split('.');
        let dYear = sDate.includes('-') ? parseInt(dParts[0]) : parseInt(dParts[2]);
        let dMonth = parseInt(dParts[1]);
        if (dYear === targetYear && dMonth === targetMonth) { if (workerSums[ws.name] !== undefined) { workerSums[ws.name] += (parseFloat(ws.kg) || 0); totalMonthKg += (parseFloat(ws.kg) || 0); } } 
    });
    (del.entries || []).forEach(e => { 
        if(!del.date) return; let dParts = del.date.includes('-') ? del.date.split('-') : del.date.split('.'); let dYear = del.date.includes('-') ? parseInt(dParts[0]) : parseInt(dParts[2]); let dMonth = parseInt(dParts[1]);
        if (dYear === targetYear && dMonth === targetMonth) { if (e.workers) { for (const [n, wkg] of Object.entries(e.workers)) { if (workerSums[n] !== undefined) { workerSums[n] += (parseFloat(wkg) || 0); totalMonthKg += (parseFloat(wkg) || 0); } } } }
    });
    });
    
    let sortedWorkers = Object.keys(workerSums).sort((a,b) => workerSums[b] - workerSums[a]);
    sortedWorkers.forEach(w => { let color = db.workerColors && db.workerColors[w] ? db.workerColors[w] : '#333'; html += `<tr><td style="font-weight:bold; color:${color}">● ${w}</td><td style="text-align:right;">${workerSums[w].toLocaleString('de-DE')} kg</td></tr>`; });
    
    html += `<tr style="background:#fdfd96; font-weight:bold;"><td>Gesamt für ${monthName}</td><td style="text-align:right;">${totalMonthKg.toLocaleString('de-DE')} kg</td></tr></tbody></table>`;
    container.innerHTML = html;
}

// =========================================================================
// Sortier-Buchungen Verwaltung (Löschen)
// =========================================================================

function renderSortierBuchungenFuerDatum(datum) {
    const alle = (db.teamSortierBuchungen || []).filter(b => b.datum === datum);
    const deleted = db.deletedSortierBuchungen || [];
    const aktiv = alle.filter(b => !deleted.includes(b.sessionKey + '|' + b.datum));
    if (!aktiv.length) return '<div style="color:#888;font-size:13px;padding:8px 0;">Keine Buchungen für dieses Datum.</div>';
    return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f5f5f5;">
            <th style="padding:6px 8px;text-align:left;">Lieferant</th>
            <th style="padding:6px 8px;text-align:left;">Sorte</th>
            <th style="padding:6px 8px;text-align:right;">kg</th>
            <th style="padding:6px 8px;"></th>
        </tr></thead>
        <tbody>${aktiv.map(b => `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 8px;">${b.lief || '–'}</td>
            <td style="padding:6px 8px;color:#555;">${b.sorte || '–'}</td>
            <td style="padding:6px 8px;text-align:right;font-weight:bold;">${parseFloat(b.gebuchtKg || 0).toLocaleString('de-DE')}</td>
            <td style="padding:6px 8px;text-align:right;">
                <button onclick="deleteSortierBuchung('${b.sessionKey}','${b.datum}')" style="background:#e53935;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">🗑️ Löschen</button>
            </td>
        </tr>`).join('')}</tbody>
    </table>`;
}

function deleteSortierBuchung(sessionKey, datum) {
    if (!confirm('Buchung wirklich löschen? Sie wird auch aus der Cloud entfernt.')) return;
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    const key = sessionKey + '|' + datum;
    if (!db.deletedSortierBuchungen.includes(key)) db.deletedSortierBuchungen.push(key);
    db.teamSortierBuchungen = (db.teamSortierBuchungen || []).filter(b => !(b.sessionKey === sessionKey && b.datum === datum));
    localStorage.setItem('logistik_offline_db', JSON.stringify(db));
    renderWorkerStats();
    if (typeof pushToCloud === 'function') pushToCloud(true);
}

function renderBuchungenVerwaltung(datum) {
    const el = document.getElementById('sortier-buchungen-liste');
    if (el) el.innerHTML = renderSortierBuchungenFuerDatum(datum);
}

function filterSortierBuchungen() {
    const q = (document.getElementById('sortier-buchungen-suche')?.value || '').toLowerCase().trim();
    const datum = anaSelectedDatum();
    const alle = (db.teamSortierBuchungen || []).filter(b => b.datum === datum);
    const deleted = db.deletedSortierBuchungen || [];
    let aktiv = alle.filter(b => !deleted.includes(b.sessionKey + '|' + b.datum));
    if (q) aktiv = aktiv.filter(b => (b.lief || '').toLowerCase().includes(q) || (b.sorte || '').toLowerCase().includes(q));
    const el = document.getElementById('sortier-buchungen-liste');
    if (!el) return;
    if (!aktiv.length) { el.innerHTML = '<div style="color:#888;font-size:13px;padding:8px 0;">Keine Buchungen gefunden.</div>'; return; }
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f5f5f5;">
            <th style="padding:6px 8px;text-align:left;">Lieferant</th>
            <th style="padding:6px 8px;text-align:left;">Sorte</th>
            <th style="padding:6px 8px;text-align:right;">kg</th>
            <th style="padding:6px 8px;"></th>
        </tr></thead>
        <tbody>${aktiv.map(b => `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 8px;">${b.lief || '–'}</td>
            <td style="padding:6px 8px;color:#555;">${b.sorte || '–'}</td>
            <td style="padding:6px 8px;text-align:right;font-weight:bold;">${parseFloat(b.gebuchtKg || 0).toLocaleString('de-DE')}</td>
            <td style="padding:6px 8px;text-align:right;">
                <button onclick="deleteSortierBuchung('${b.sessionKey}','${b.datum}')" style="background:#e53935;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">🗑️ Löschen</button>
            </td>
        </tr>`).join('')}</tbody>
    </table>`;
}
