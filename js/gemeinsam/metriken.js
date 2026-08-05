/** Gemeinsame Metrik- und Artikel-Typ-Hilfen (Logistik, Rechner, Control-Center). */

function personalAnzahlAusTag(dailyStaff, datum) {
    if (!dailyStaff || datum == null) return 0;
    const v = dailyStaff[datum];
    if (v == null || v === '') return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

function mengeProKopf(gesamtKg, personalAnzahl) {
    const kg = parseFloat(gesamtKg) || 0;
    const p = parseFloat(personalAnzahl) || 0;
    if (p <= 0) return 0;
    return Math.round(kg / p);
}

function teamTagAusMengen(teamTagesMengen, datum) {
    if (!teamTagesMengen || datum == null) return null;
    const t = teamTagesMengen[datum];
    return t && typeof t === 'object' ? t : null;
}

function personalAusTeamTag(teamTagesMengen, dailyStaff, datum) {
    const tag = teamTagAusMengen(teamTagesMengen, datum);
    if (tag && tag.personalAnzahl != null && tag.personalAnzahl !== '') {
        const n = parseFloat(tag.personalAnzahl);
        if (!isNaN(n) && n > 0) return n;
    }
    return personalAnzahlAusTag(dailyStaff, datum);
}

function gesamtKgFuerDatum(deliveries, datum) {
    if (!Array.isArray(deliveries) || !datum) return 0;
    return deliveries
        .filter((d) => d.date === datum && d.source !== 'sortieren')
        .reduce((a, b) => a + (parseFloat(b.kg) || 0), 0);
}

/** Summe aller Lieferungen eines Tages (LKW + Sortiert) — entspricht „Erfassung Heute“. */
function gesamtKgAlleDeliveries(deliveries, datum) {
    if (!Array.isArray(deliveries) || !datum) return 0;
    return deliveries
        .filter((d) => d.date === datum && d.source !== 'sortieren_tag')
        .reduce((a, b) => a + (parseFloat(b.kg) || 0), 0);
}

function lkwKgFuerDatum(deliveries, datum) {
    if (!Array.isArray(deliveries) || !datum) return 0;
    return deliveries
        .filter((d) => d.date === datum && d.source !== 'sortieren' && d.source !== 'sortieren_tag')
        .reduce((a, b) => a + (parseFloat(b.kg) || 0), 0);
}

function isSortierDelivery(d) {
    return d && (d.source === 'sortieren' || d.source === 'sortieren_tag');
}

function isLkwManuellDelivery(d) {
    return d && !isSortierDelivery(d);
}

/** Nur Handy-Sortier-Einträge gehören in die Cloud — LKW bleibt lokal am PC. */
function deliveriesFuerCloudSync(list) {
    return (list || []).filter(isSortierDelivery);
}

function mergeLieferungenCloudMitLokalLkw(lokal, cloud) {
    const lkwLokal = (lokal || []).filter(isLkwManuellDelivery);
    const sortLokal = (lokal || []).filter(isSortierDelivery);
    const sortCloud = deliveriesFuerCloudSync(cloud);
    const sortMerged = typeof mergeLieferungen === 'function'
        ? mergeLieferungen(sortLokal, sortCloud)
        : [...sortLokal, ...sortCloud];
    return [...lkwLokal, ...sortMerged];
}

function sortiertKgAusDeliveries(deliveries, datum) {
    if (!Array.isArray(deliveries) || !datum) return 0;
    return deliveries
        .filter((d) => d.date === datum && d.source === 'sortieren')
        .reduce((a, b) => a + (parseFloat(b.kg) || 0), 0);
}

function sortierenSummeFuerDatum(buchungen, teamTagesMengen, datum, deletedKeys, articles, artikelMarkt) {
    let gesamtKg = 0;
    let exportKg = 0;
    let unsKg = 0;
    filterDeletedSortierBuchungen(buchungen || [], deletedKeys)
        .filter((b) => buchungDatumPasst(b, datum))
        .forEach((b) => {
            const kg = parseFloat(b.gebuchtKg) || 0;
            if (kg <= 0) return;
            gesamtKg += kg;
            const fertigNr = fertigNrAusSorte(b.sorte, articles);
            const marktTyp = artikelMarktTyp(fertigNr, b.sorte, artikelMarkt);
            if (marktTyp === 'export') exportKg += kg;
            else unsKg += kg;
        });
    if (teamTagesMengen && teamTagesMengen[datum]) {
        const t = teamTagesMengen[datum];
        if (gesamtKg <= 0) {
            gesamtKg = parseFloat(t.gesamtKg) || 0;
            exportKg = parseFloat(t.exportKg) || 0;
            unsKg = parseFloat(t.unsKg) || 0;
        } else if (exportKg === 0 && (parseFloat(t.exportKg) || 0) > 0) {
            // Buchungen vorhanden aber kein Export → artikelMarkt fehlt in Cloud.
            // Gespeicherte Tagessumme hat die richtige Aufteilung → verwenden.
            exportKg = parseFloat(t.exportKg) || 0;
            unsKg = parseFloat(t.unsKg) || 0;
        }
    }
    return { gesamtKg, exportKg, unsKg };
}

/** kg pro Lieferant aus Sortier-Buchungen (für Tages-Erfassung Anzeige). */
/** Handy-Einträge für Erfassung: Buchungen + Zuweisungen aus deliveries. */
function getHandySortierEntriesFuerDatum(db, datum) {
    if (!db || !datum) return [];
    datum = normalizeDatumIso(datum);
    if (typeof hydrateSortierBuchungenInDb === 'function') hydrateSortierBuchungenInDb(db);
    const alleBuch = typeof sortierBuchungenMitCloudCache === 'function'
        ? sortierBuchungenMitCloudCache(db)
        : (db.teamSortierBuchungen || []);
    const byName = new Map();
    sortierenLieferantenFuerDatum(alleBuch, datum, db.deletedSortierBuchungen).forEach(({ name, kg }) => {
        const n = String(name || '').trim() || 'Unbekannt';
        const id = sortierenLieferantDeliveryId(datum, n);
        const existingDel = (db.deliveries || []).find(d => d.id === id);
        const entryDate = existingDel?.date || datum;
        byName.set(n, { id, date: entryDate, name: n, kg, source: 'sortieren', workerShares: [] });
    });
    (db.deliveries || []).filter((x) => normalizeDatumIso(x.date) === datum && (x.source === 'sortieren' || x.source === 'sortieren_tag')).forEach((d) => {
        const n = d.source === 'sortieren_tag'
            ? '__gesamt__'
            : (String(d.name || '').trim() || 'Unbekannt');
        if (byName.has(n)) {
            const ex = byName.get(n);
            ex.id = d.id;
            ex.workerShares = d.workerShares || ex.workerShares;
            if ((parseFloat(d.kg) || 0) > (parseFloat(ex.kg) || 0)) ex.kg = d.kg;
            if (d.exportKg != null) ex.exportKg = d.exportKg;
            if (d.unsKg != null) ex.unsKg = d.unsKg;
        } else {
            byName.set(n, d);
        }
    });
    if (byName.size === 0 && Array.isArray(window._lastCloudBuchungen) && window._lastCloudBuchungen.length) {
        sortierenLieferantenFuerDatum(window._lastCloudBuchungen, datum, db.deletedSortierBuchungen || []).forEach(({ name, kg }) => {
            const n = String(name || '').trim() || 'Unbekannt';
            const id = sortierenLieferantDeliveryId(datum, n);
            byName.set(n, { id, date: datum, name: n, kg, source: 'sortieren', workerShares: [], _ausCloud: true });
        });
    }
    return Array.from(byName.values())
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de') || (parseFloat(b.kg) - parseFloat(a.kg)));
}

/** Angezeigte Handy-Zeilen in db.deliveries übernehmen (für Zuweisungs-Dialog). */
function persistHandyEntriesToDeliveries(db, datum) {
    if (!db || !datum) return;
    datum = normalizeDatumIso(datum);
    if (!db.deliveries) db.deliveries = [];
    if (Array.isArray(window._lastCloudBuchungen) && window._lastCloudBuchungen.length
        && typeof applyCloudSortierBuchungen === 'function') {
        applyCloudSortierBuchungen(db, window._lastCloudBuchungen);
    }
    const handy = typeof getHandySortierEntriesFuerDatum === 'function'
        ? getHandySortierEntriesFuerDatum(db, datum)
        : [];
    handy.forEach((h) => {
        if (!h?.id) return;
        let del = db.deliveries.find((d) => d.id === h.id);
        if (!del) {
            const row = {
                id: h.id,
                date: h.date || datum,
                name: h.name || 'Unbekannt',
                kg: parseFloat(h.kg) || 0,
                source: h.source || 'sortieren',
                workerShares: Array.isArray(h.workerShares) ? [...h.workerShares] : []
            };
            if (h.exportKg != null) row.exportKg = h.exportKg;
            if (h.unsKg != null) row.unsKg = h.unsKg;
            db.deliveries.push(row);
            return;
        }
        if (del.source === 'sortieren' || del.source === 'sortieren_tag') {
            const hKg = parseFloat(h.kg) || 0;
            if (hKg > (parseFloat(del.kg) || 0)) del.kg = hKg;
        }
    });
}

function resolveSortierDeliveryInDb(db, id) {
    if (!db || !id) return null;
    if (!db.deliveries) db.deliveries = [];
    let del = db.deliveries.find((d) => d.id === id);
    if (del) return del;
    const m = String(id).match(/^sort_lief_(\d{4}-\d{2}-\d{2})_/);
    if (m) persistHandyEntriesToDeliveries(db, m[1]);
    else if (typeof sammleAlleErfassungsDaten === 'function') {
        sammleAlleErfassungsDaten(db).forEach((d) => persistHandyEntriesToDeliveries(db, d));
    }
    return db.deliveries.find((d) => d.id === id) || null;
}

function sortierenLieferantenFuerDatum(buchungen, datum, deletedKeys) {
    const map = {};
    filterDeletedSortierBuchungen(buchungen || [], deletedKeys)
        .filter((b) => buchungDatumPasst(b, datum))
        .forEach((b) => {
            const kg = parseFloat(b.gebuchtKg) || 0;
            if (kg <= 0) return;
            const name = String(b.lief || '').trim() || 'Unbekannt';
            map[name] = (map[name] || 0) + kg;
        });
    return Object.keys(map)
        .sort((a, b) => map[b] - map[a] || a.localeCompare(b, 'de'))
        .map((name) => ({ name, kg: map[name] }));
}

function sortierenLieferantenHtml(supplierKg) {
    if (!Array.isArray(supplierKg) || !supplierKg.length) return '';
    return supplierKg.map((s) => {
        const kg = (parseFloat(s.kg) || 0).toLocaleString('de-DE');
        const name = String(s.name || '').replace(/</g, '&lt;');
        return `<span style="display:inline-block; margin:3px 8px 3px 0; padding:3px 10px; background:#e8f5e9; border-radius:6px; font-size:12px; color:#1b5e20;"><b>${name}</b> ${kg} kg</span>`;
    }).join('');
}

function sortierenLieferantenLabel(supplierKg) {
    if (!Array.isArray(supplierKg) || !supplierKg.length) return '';
    return supplierKg.map((s) => `${s.name} ${(parseFloat(s.kg) || 0).toLocaleString('de-DE')} kg`).join(' · ');
}

function teamTagesAnzeige(teamTagesMengen, dailyStaff, deliveries, datum) {
    const tag = teamTagAusMengen(teamTagesMengen, datum);
    const personalAnzahl = personalAusTeamTag(teamTagesMengen, dailyStaff, datum);
    let sortiertKg = sortiertKgAusDeliveries(deliveries, datum);
    const exportKg = tag ? (parseFloat(tag.exportKg) || 0) : 0;
    const unsKg = tag ? (parseFloat(tag.unsKg) || 0) : 0;
    if (sortiertKg <= 0 && tag) {
        const tagKg = parseFloat(tag.gesamtKg) || 0;
        if (tagKg > 0) sortiertKg = tagKg;
    }
    const gesamtKg = sortiertKg;
    return {
        personalAnzahl,
        gesamtKg,
        lkwKg: 0,
        sortiertKg,
        exportKg,
        unsKg,
        proKopf: mengeProKopf(gesamtKg, personalAnzahl),
        hatTeamEintrag: !!tag
    };
}

/** Lieferanten-Aufschlüsselung: LKW-Eingang, Sortiert (Drucken), Export, Uns pro Lieferant. */
function lieferantenAuswertungFuerDatum(db, datum) {
    if (!datum) return [];
    const deliveries = db.deliveries || [];
    const articles = db.articles || [];
    const artikelMarkt = db.artikelMarkt || {};
    const deletedKeys = db.deletedSortierBuchungen || [];
    const map = {};

    function ensure(name) {
        const key = name || 'Unbekannt';
        if (!map[key]) {
            map[key] = { name: key, lkwKg: 0, sortiertKg: 0, exportKg: 0, unsKg: 0, gesamtKg: 0 };
        }
        return map[key];
    }

    // Sortiert — Quelle: Rechner „Sortieren → Drucken“ (teamSortierBuchungen)
    filterDeletedSortierBuchungen(db.teamSortierBuchungen || [], deletedKeys)
        .filter((b) => buchungDatumPasst(b, datum))
        .forEach((b) => {
            const kg = parseFloat(b.gebuchtKg) || 0;
            if (kg <= 0) return;
            const row = ensure(String(b.lief || '').trim() || 'Unbekannt');
            row.sortiertKg += kg;
            row.gesamtKg += kg;
            const fertigNr = fertigNrAusSorte(b.sorte, articles);
            const marktTyp = artikelMarktTyp(fertigNr, b.sorte, artikelMarkt);
            if (marktTyp === 'export') row.exportKg += kg;
            else row.unsKg += kg;
        });

    // Fallback: Sortier-Deliveries wenn keine Buchungen (ältere Daten)
    const hatBuchungen = filterDeletedSortierBuchungen(db.teamSortierBuchungen || [], deletedKeys).some((b) => buchungDatumPasst(b, datum));
    if (!hatBuchungen) {
        deliveries.filter((d) => d.date === datum && d.source === 'sortieren').forEach((d) => {
            const kg = parseFloat(d.kg) || 0;
            if (kg <= 0) return;
            const row = ensure(String(d.name || '').trim() || 'Unbekannt');
            row.sortiertKg += kg;
            row.gesamtKg += kg;
        });
    }

    // Manuelle LKW-Einträge (ohne Handy) → erscheinen als N/Z pro Lieferant
    deliveries.filter((d) => normalizeDatumIso(d.date) === normalizeDatumIso(datum) && !isSortierDelivery(d)).forEach((d) => {
        const kg = parseFloat(d.kg) || 0;
        if (kg <= 0) return;
        const row = ensure(String(d.name || '').trim() || 'Unbekannt');
        row.lkwKg += kg;
        row.gesamtKg += kg;
    });

    return Object.values(map)
        .filter((r) => r.gesamtKg > 0 || r.exportKg > 0 || r.unsKg > 0)
        .sort((a, b) => b.gesamtKg - a.gesamtKg || a.name.localeCompare(b.name, 'de'));
}

function zeitraumLieferantenAuswertung(db, datenListe) {
    const summen = {};
    (datenListe || []).forEach((datum) => {
        lieferantenAuswertungFuerDatum(db, datum).forEach((r) => {
            if (!summen[r.name]) {
                summen[r.name] = { name: r.name, lkwKg: 0, sortiertKg: 0, exportKg: 0, unsKg: 0, gesamtKg: 0 };
            }
            const t = summen[r.name];
            t.lkwKg += r.lkwKg;
            t.sortiertKg += r.sortiertKg;
            t.exportKg += r.exportKg;
            t.unsKg += r.unsKg;
            t.gesamtKg += r.gesamtKg;
        });
    });
    return Object.values(summen).sort((a, b) => b.gesamtKg - a.gesamtKg || a.name.localeCompare(b.name, 'de'));
}

function setTeamPersonalAnzahl(teamTagesMengen, dailyStaff, datum, personalAnzahl) {
    if (!teamTagesMengen) teamTagesMengen = {};
    const n = parseFloat(personalAnzahl);
    const val = isNaN(n) ? 0 : n;
    if (!teamTagesMengen[datum]) teamTagesMengen[datum] = leererTeamTagesEintrag();
    teamTagesMengen[datum].personalAnzahl = val;
    if (dailyStaff) dailyStaff[datum] = val;
    return teamTagesMengen;
}

function syncTeamTagesGesamtKg(teamTagesMengen, deliveries, datum) {
    if (!teamTagesMengen) teamTagesMengen = {};
    const kg = sortiertKgAusDeliveries(deliveries, datum);
    if (!teamTagesMengen[datum]) teamTagesMengen[datum] = leererTeamTagesEintrag();
    const exp = parseFloat(teamTagesMengen[datum].exportKg) || 0;
    const uns = parseFloat(teamTagesMengen[datum].unsKg) || 0;
    if (exp + uns > 0) return teamTagesMengen;
    teamTagesMengen[datum].gesamtKg = kg;
    return teamTagesMengen;
}

/** Sortier-Buchungen aus kombi_logistik_db + logistik_offline_db mergen — leeren Stand nicht überschreiben. */
function hydrateSortierBuchungenInDb(db) {
    if (!db) return;
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    try {
        const kombi = typeof ladeLogistikDb === 'function' ? ladeLogistikDb() : {};
        const offline = typeof ladeOfflineDb === 'function' ? ladeOfflineDb() : {};
        db.deletedSortierBuchungen = mergeDeletedSortierKeys(
            db.deletedSortierBuchungen,
            mergeDeletedSortierKeys(kombi.deletedSortierBuchungen, offline.deletedSortierBuchungen)
        );
        let merged = db.teamSortierBuchungen || [];
        [kombi.teamSortierBuchungen, offline.teamSortierBuchungen].forEach((src) => {
            merged = mergeTeamSortierBuchungen(merged, asSortierBuchungenArray(src), db.deletedSortierBuchungen);
        });
        db.teamSortierBuchungen = merged;
        if (kombi.teamTagesMengen && typeof mergeTeamTagesMengen === 'function') {
            db.teamTagesMengen = mergeTeamTagesMengen(db.teamTagesMengen || {}, kombi.teamTagesMengen);
        }
    } catch (e) { /* ignore */ }
}

/** Lokales Upload-Payload mit Cloud-Stand verschmelzen (verhindert versehentliches Löschen). */
function mergeLogistikPayloadMitCloud(localPayload, cloudData) {
    const payload = { ...(localPayload || {}) };
    const cloud = cloudData || {};
    const del = mergeDeletedSortierKeys(payload.deletedSortierBuchungen, cloud.deletedSortierBuchungen);
    payload.deletedSortierBuchungen = del;
    payload.teamSortierBuchungen = mergeTeamSortierBuchungen(
        asSortierBuchungenArray(payload.teamSortierBuchungen),
        asSortierBuchungenArray(cloud.teamSortierBuchungen),
        del
    );
    if (cloud.deliveries != null) {
        payload.deliveries = mergeLieferungenCloudMitLokalLkw(payload.deliveries || [], cloud.deliveries);
    } else if (Array.isArray(payload.deliveries)) {
        payload.deliveries = [...(payload.deliveries || []).filter(isLkwManuellDelivery), ...deliveriesFuerCloudSync(payload.deliveries)];
    }
    if (cloud.teamTagesMengen && typeof mergeTeamTagesMengen === 'function') {
        payload.teamTagesMengen = mergeTeamTagesMengen(payload.teamTagesMengen || {}, cloud.teamTagesMengen);
    }
    // Sortiment-Zuweisungen (suppliers) aus der Cloud sichern — werden nur vom Control Center gesetzt.
    // Verhindert, dass Auto-Sync vom Handy die PC-Zuweisungen überschreibt.
    if (Array.isArray(cloud.articles) && cloud.articles.length > 0) {
        const localArticles = payload.articles || [];
        const cloudMap = new Map(cloud.articles.map(a => [a.fertigNr, a]));
        const localMap = new Map(localArticles.map(a => [a.fertigNr, a]));
        const merged = localArticles.map(a => {
            const ca = cloudMap.get(a.fertigNr);
            if (!ca || !Array.isArray(ca.suppliers) || ca.suppliers.length === 0) return a;
            const localSups = new Set(a.suppliers || []);
            const mergedSups = [...localSups];
            ca.suppliers.forEach(s => { if (!localSups.has(s)) mergedSups.push(s); });
            return { ...a, suppliers: mergedSups };
        });
        // Artikel die nur in der Cloud existieren (vom Control Center hinzugefügt) ebenfalls übernehmen
        cloud.articles.forEach(ca => { if (!localMap.has(ca.fertigNr)) merged.push(ca); });
        payload.articles = merged;
    }
    return payload;
}

function asSortierBuchungenArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return Object.values(raw);
    return [];
}

/** ISO-Datum YYYY-MM-DD — auch aus DD.MM.YYYY (ältere Einträge). */
function normalizeDatumIso(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s;
}

function buchungDatumPasst(b, datum) {
    return normalizeDatumIso(b?.datum) === normalizeDatumIso(datum);
}

function normalizeSortierBuchungRecord(b) {
    if (!b || !b.datum) return null;
    const copy = { ...b, datum: normalizeDatumIso(b.datum) };
    if (!copy.datum) return null;
    if (!copy.sessionKey) {
        copy.sessionKey = typeof sortierungSessionKey === 'function'
            ? sortierungSessionKey(copy.lief, copy.sorte, copy.herkunft)
            : String(copy.id || copy.lief || 'legacy') + '|' + String(copy.sorte || '');
    }
    return copy;
}

/** Cloud-Buchungen reaktivieren, die lokal fälschlich als gelöscht markiert sind. */
function applyCloudSortierBuchungen(db, cloudBuchungen) {
    if (!db || !cloudBuchungen?.length) return;
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    cloudBuchungen.forEach((raw) => {
        const b = normalizeSortierBuchungRecord(raw);
        if (!b || !(parseFloat(b.gebuchtKg) > 0)) return;
        entferneDeletedKeysFuerBuchung(db, b);
        sortierLoeschenAufheben(db, b.datum, b.sessionKey);
    });
    db.teamSortierBuchungen = mergeTeamSortierBuchungen(
        db.teamSortierBuchungen || [],
        cloudBuchungen,
        db.deletedSortierBuchungen
    );
}

/**
 * Sitzungs-Anteil des Zusammenfuehr-Schluessels.
 * Leerer String = Altbestand ohne Sitzungskennung (vor Build 115) sowie der
 * Platzhalter 'default' — beide verhalten sich weiter wie bisher. (2026-08-05)
 */
function sortierBuchungSitzungTeil(b) {
    const s = b && b.sitzungId != null ? String(b.sitzungId).trim() : '';
    return s === 'default' ? '' : s;
}

/**
 * Entscheidet zwischen zwei Buchungen mit demselben Schluessel — unveraenderte Regeln:
 * 0 kg darf niemals ein echtes Gewicht ueberschreiben, sonst gewinnt der neuere
 * Druck-Zeitstempel (bei Gleichstand der spaeter gelesene Eintrag = lokal). (2026-08-05)
 */
function bessereSortierBuchung(prev, b) {
    const bKg = parseFloat(b.gebuchtKg) || 0;
    const prevKg = parseFloat(prev.gebuchtKg) || 0;
    if (bKg === 0 && prevKg > 0) return prev;
    if (prevKg === 0 && bKg > 0) return b;
    const tNew = b.letzterDruck ? Date.parse(b.letzterDruck) : 0;
    const tPrev = prev.letzterDruck ? Date.parse(prev.letzterDruck) : 0;
    return tNew >= tPrev ? b : prev;
}

/**
 * FEHLERBEHEBUNG 2026-08-05: Der Schluessel war nur sessionKey|datum. Wurde derselbe
 * Artikel desselben Lieferanten zweimal am selben Tag sortiert, hat der zweite
 * Sortiervorgang den ersten ueberschrieben (belegt: Ponnath 03.08.2026, 624 kg verloren).
 * Die bereits vorhandene sitzungId gehoert deshalb mit in den Schluessel.
 */
function mergeTeamSortierBuchungen(lokal, cloud, deletedKeys) {
    const delSet = new Set(deletedKeys || []);
    // sessionKey|datum -> Map(sitzungTeil -> Buchung)
    const gruppen = new Map();
    asSortierBuchungenArray(cloud).concat(asSortierBuchungenArray(lokal)).forEach((raw) => {
        const b = normalizeSortierBuchungRecord(raw);
        if (!b) return;
        if (istSortierBuchungGeloescht(b, delSet)) return;
        const basis = sortierBuchungMergeKey(b);
        if (!gruppen.has(basis)) gruppen.set(basis, new Map());
        const sitzungen = gruppen.get(basis);
        const sk = sortierBuchungSitzungTeil(b);
        const prev = sitzungen.get(sk);
        sitzungen.set(sk, { ...(prev ? bessereSortierBuchung(prev, b) : b) });
    });

    const result = [];
    gruppen.forEach((sitzungen) => {
        faltAltbestandOhneSitzung(sitzungen);
        sitzungen.forEach((b) => result.push(b));
    });
    return result;
}

/**
 * Altbestand ohne Sitzungskennung und Sitzungs-Eintraege mit gleichem sessionKey|datum
 * sind derselbe Vorgang, einmal alt und einmal neu gespeichert — sie duerfen nicht
 * doppelt gezaehlt werden. Der Altbestand faellt daher weg, sobald mindestens ein
 * Sitzungs-Eintrag ein echtes Gewicht hat. Steht dort ueberall 0 kg, bleibt das
 * echte Gewicht des Altbestands erhalten (0-kg-Regel). (2026-08-05)
 */
function faltAltbestandOhneSitzung(sitzungen) {
    if (!sitzungen.has('') || sitzungen.size < 2) return;
    const altKg = parseFloat(sitzungen.get('').gebuchtKg) || 0;
    const mitSitzung = [...sitzungen.keys()].filter((k) => k !== '');
    const echtesGewicht = mitSitzung.some((k) => (parseFloat(sitzungen.get(k).gebuchtKg) || 0) > 0);
    if (echtesGewicht || altKg <= 0) sitzungen.delete('');
    else mitSitzung.forEach((k) => sitzungen.delete(k));
}

function sortierBuchungMergeKey(b) {
    const datum = normalizeDatumIso(b?.datum) || String(b?.datum || '');
    return (b.sessionKey || '') + '|' + datum;
}

/** Lösch-Markierungen für eine Cloud-/Handy-Buchung entfernen (auch bei abweichendem Datumsformat). */
function entferneDeletedKeysFuerBuchung(db, b) {
    if (!db || !b || !Array.isArray(db.deletedSortierBuchungen)) return;
    const k = sortierBuchungMergeKey(b);
    const sk = String(b.sessionKey || '');
    const dIso = normalizeDatumIso(b.datum);
    db.deletedSortierBuchungen = db.deletedSortierBuchungen.filter((x) => {
        if (x === k) return false;
        const idx = String(x).indexOf('\0');
        if (idx < 0) return true;
        const xSk = x.slice(0, idx);
        const xDat = normalizeDatumIso(x.slice(idx + 1));
        return !(xSk === sk && xDat === dIso);
    });
}

/** Lokal + Cloud-Cache für Anzeige/Erfassung (ohne DB zu überschreiben). */
function sortierBuchungenMitCloudCache(db) {
    const lokal = db?.teamSortierBuchungen || [];
    const cloud = Array.isArray(window._lastCloudBuchungen) ? window._lastCloudBuchungen : [];
    if (!cloud.length) return lokal;
    return mergeTeamSortierBuchungen(lokal, cloud, db?.deletedSortierBuchungen || []);
}

/** Delivery-IDs, die als aktiv gelten (lokal, Cloud, Zuweisungen). */
function aktivSortierDeliveryIds(db) {
    const ids = new Set();
    const deleted = db?.deletedSortierBuchungen || [];
    [db?.teamSortierBuchungen, window._lastCloudBuchungen].forEach((src) => {
        filterDeletedSortierBuchungen(src || [], deleted)
            .filter((b) => (parseFloat(b.gebuchtKg) || 0) > 0 && b.datum)
            .forEach((b) => ids.add(sortierenLieferantDeliveryId(normalizeDatumIso(b.datum), b.lief)));
    });
    (db?.deliveries || []).forEach((d) => {
        if (d.source === 'sortieren' && d.id && (d.workerShares || []).length) ids.add(d.id);
    });
    return ids;
}

// 2026-08-05: Seit die Sitzungen getrennt gehalten werden, kann eine Sorte an einem Tag
// mehrere Buchungen haben (z.B. Ponnath morgens und nachmittags). Der alte Loeschschluessel
// "sessionKey|datum" trifft immer ALLE davon -- ein Klick haette beide geloescht.
// Neu gibt es zusaetzlich einen sitzungsgenauen Schluessel. Alte Loeschmarken bleiben
// gueltig und wirken weiterhin auf alle Sitzungen des Tages.
const SITZUNG_LOESCH_TRENNER = '#S#';

function sortierBuchungSitzungLoeschKey(b) {
    const s = typeof sortierBuchungSitzungTeil === 'function' ? sortierBuchungSitzungTeil(b) : '';
    return s ? sortierBuchungMergeKey(b) + SITZUNG_LOESCH_TRENNER + s : '';
}

function istSortierBuchungGeloescht(b, deletedKeys) {
    if (!b || !deletedKeys) return false;
    const set = deletedKeys instanceof Set ? deletedKeys : new Set(deletedKeys);
    if (set.has(sortierBuchungMergeKey(b))) return true;   // alte Marke: trifft alle Sitzungen des Tages
    const sk = sortierBuchungSitzungLoeschKey(b);
    return sk ? set.has(sk) : false;                        // neue Marke: trifft genau diese Sitzung
}

function filterDeletedSortierBuchungen(buchungen, deletedKeys) {
    if (!Array.isArray(buchungen)) return [];
    if (!deletedKeys || !deletedKeys.length) return buchungen;
    return buchungen.filter((b) => !istSortierBuchungGeloescht(b, deletedKeys));
}

// 2026-08-05: sitzungId ist optional. Ohne sie verhaelt sich die Funktion wie bisher
// (loescht alle Sitzungen des Tages), mit ihr wird genau eine Buchung markiert.
function sortierLoeschenMarkieren(db, datum, sessionKey, sitzungId) {
    if (!db || !datum || !sessionKey) return;
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    const basis = sortierBuchungMergeKey({ sessionKey, datum });
    const teil = typeof sortierBuchungSitzungTeil === 'function'
        ? sortierBuchungSitzungTeil({ sitzungId }) : (sitzungId || '');
    const k = teil ? basis + SITZUNG_LOESCH_TRENNER + teil : basis;
    if (!db.deletedSortierBuchungen.includes(k)) db.deletedSortierBuchungen.push(k);
}

function sortierLoeschenAufheben(db, datum, sessionKey) {
    if (!db || !Array.isArray(db.deletedSortierBuchungen) || !datum || !sessionKey) return;
    const k = sortierBuchungMergeKey({ sessionKey, datum });
    db.deletedSortierBuchungen = db.deletedSortierBuchungen.filter((x) => x !== k);
}

function bereinigeGeloeschteSortierDeliveries(db) {
    if (!db || !Array.isArray(db.deliveries)) return;
    db.deliveries = entferneSortierTagEintraege(db.deliveries);
    const activeIds = typeof aktivSortierDeliveryIds === 'function'
        ? aktivSortierDeliveryIds(db)
        : new Set();
    if (!activeIds.size) return;
    db.deliveries = db.deliveries.filter((d) => {
        if (d.source !== 'sortieren') return true;
        return activeIds.has(d.id);
    });
}

function mergeDeletedSortierKeys(lokal, cloud) {
    return [...new Set([...(lokal || []), ...(cloud || [])])];
}

function sortierungSessionKey(lief, sorte, herkunft) {
    return (lief || '') + '|' + (sorte || '') + '|' + (herkunft || '');
}

function sortierenDeliveryId(buchung) {
    if (buchung.deliveryId) return buchung.deliveryId;
    const sk = String(buchung.sessionKey || buchung.id || 'x').replace(/[^\w|.-]/g, '_').slice(0, 100);
    return 'sort_' + buchung.datum + '_' + sk;
}

/** Stabile ID: ein CC-Eintrag pro Lieferant und Tag. */
function sortierenLieferantDeliveryId(datum, liefName) {
    const name = String(liefName || '').trim() || 'Unbekannt';
    const safe = name.replace(/[^\w.-]/g, '_').slice(0, 80);
    return 'sort_lief_' + datum + '_' + safe;
}

function sortierenTagDeliveryId(datum) {
    return 'sort_tag_' + datum;
}

function entferneSortierTagEintraege(deliveries) {
    return (deliveries || []).filter((d) => d.source !== 'sortieren_tag');
}

/** @deprecated — alte Tagessumme; Einzeleintraege bleiben erhalten. */
function entferneAlteSortierEinzeleintraege(deliveries) {
    return deliveries || [];
}

/** Pro Lieferant und Tag ein CC-Eintrag (alle Sorten summiert) — einzeln zuweisbar. */
function syncSortierenBuchungenZuDeliveries(deliveries, buchungen, teamTagesMengen, deletedKeys, articles, artikelMarkt) {
    if (!Array.isArray(deliveries)) deliveries = [];
    deliveries = entferneSortierTagEintraege(deliveries);

    const active = filterDeletedSortierBuchungen(buchungen || [], deletedKeys);
    const groups = new Map();

    active.forEach((b) => {
        const kg = parseFloat(b.gebuchtKg) || 0;
        if (kg <= 0 || !b.datum) return;
        const lief = String(b.lief || '').trim() || 'Unbekannt';
        const key = b.datum + '\0' + lief;
        if (!groups.has(key)) {
            groups.set(key, { datum: b.datum, lief, kg: 0, exportKg: 0, unsKg: 0, buchungen: [] });
        }
        const g = groups.get(key);
        g.kg += kg;
        const fertigNr = fertigNrAusSorte(b.sorte, articles);
        const marktTyp = artikelMarktTyp(fertigNr, b.sorte, artikelMarkt);
        if (marktTyp === 'export') g.exportKg += kg;
        else g.unsKg += kg;
        g.buchungen.push(b);
    });

    const activeIds = new Set();

    groups.forEach((g) => {
        const id = sortierenLieferantDeliveryId(g.datum, g.lief);
        activeIds.add(id);
        g.buchungen.forEach((b) => { b.deliveryId = id; });

        let del = deliveries.find((d) => d.id === id);
        if (!del) {
            const mergedShares = [];
            deliveries.forEach((d) => {
                if (d.source !== 'sortieren' || d.date !== g.datum) return;
                if (String(d.name || '').trim() !== g.lief) return;
                (d.workerShares || []).forEach((ws) => mergedShares.push({ ...ws }));
            });
            if (mergedShares.length) del = { workerShares: mergedShares };
        }

        const patch = {
            id,
            date: g.datum,
            name: g.lief,
            kg: g.kg,
            exportKg: g.exportKg,
            unsKg: g.unsKg,
            source: 'sortieren',
            workerShares: del?.workerShares || []
        };
        if (del && del.id === id) Object.assign(del, patch);
        else deliveries.push({ ...patch, workerShares: del?.workerShares || [] });
    });

    return deliveries.filter((d) => {
        if (d.source !== 'sortieren') return true;
        if (activeIds.has(d.id)) return true;
        const lief = String(d.name || '').trim() || 'Unbekannt';
        const key = d.date + '\0' + lief;
        return !groups.has(key);
    });
}

function mergeLieferungen(lokal, cloud) {
    const normalize = (raw) => {
        if (Array.isArray(raw)) return raw.filter(Boolean);
        if (raw && typeof raw === 'object') {
            return Object.keys(raw)
                .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
                .map((k) => raw[k])
                .filter(Boolean);
        }
        return [];
    };
    const byId = new Map(normalize(lokal).map((d) => [String(d.id), { ...d }]));
    normalize(cloud).forEach((cd) => {
        if (!cd || cd.id == null) return;
        const id = String(cd.id);
        if (!byId.has(id)) {
            byId.set(id, { ...cd });
            return;
        }
        const ld = byId.get(id);
        const lShares = ld.workerShares || [];
        const cShares = cd.workerShares || [];
        byId.set(id, {
            ...cd,
            ...ld,
            kg: Math.max(parseFloat(ld.kg) || 0, parseFloat(cd.kg) || 0) || ld.kg || cd.kg,
            workerShares: lShares.length >= cShares.length ? lShares : cShares,
            isFullySorted: !!(ld.isFullySorted || cd.isFullySorted),
        });
    });
    return Array.from(byId.values());
}

/** Alias — erzeugt Einzeleintraege, keine Tagessumme mehr. */
function syncSortierenTagessummeZuDeliveries(deliveries, buchungen, teamTagesMengen, deletedKeys, articles, artikelMarkt) {
    return syncSortierenBuchungenZuDeliveries(
        deliveries, buchungen, teamTagesMengen, deletedKeys, articles, artikelMarkt
    );
}

function ensureSortierenDeliveries(db) {
    if (!db) return;
    bereinigeGeloeschteSortierDeliveries(db);
    if (!Array.isArray(db.deliveries)) db.deliveries = [];
    db.deliveries = syncSortierenBuchungenZuDeliveries(
        db.deliveries,
        db.teamSortierBuchungen || [],
        db.teamTagesMengen || {},
        db.deletedSortierBuchungen,
        db.articles || [],
        db.artikelMarkt || {}
    );
    bereinigeGeloeschteSortierDeliveries(db);
}

/** teamTagesMengen für ein Datum aus verbleibenden Wiegeschein-Buchungen neu berechnen. */
function rebuildTeamTagesMengenFuerDatum(db, datum) {
    if (!db || !datum) return;
    if (!db.teamTagesMengen) db.teamTagesMengen = {};
    const prev = db.teamTagesMengen[datum] || leererTeamTagesEintrag();
    const artikelMarkt = db.artikelMarkt || {};
    const articles = db.articles || [];
    let gesamtKg = 0;
    let exportKg = 0;
    let unsKg = 0;
    (filterDeletedSortierBuchungen(db.teamSortierBuchungen || [], db.deletedSortierBuchungen))
        .filter((b) => buchungDatumPasst(b, datum)).forEach((b) => {
        const kg = parseFloat(b.gebuchtKg) || 0;
        if (kg <= 0) return;
        gesamtKg += kg;
        const fertigNr = fertigNrAusSorte(b.sorte, articles);
        const marktTyp = artikelMarktTyp(fertigNr, b.sorte, artikelMarkt);
        if (marktTyp === 'export') exportKg += kg;
        else unsKg += kg;
    });
    db.teamTagesMengen[datum] = {
        personalAnzahl: prev.personalAnzahl || 0,
        gesamtKg,
        exportKg,
        unsKg
    };
}

/** Wiegeschein-Eintrag in CC löschen — inkl. zugrunde liegender Buchung (sonst sofort wieder da). */
function entferneSortierenAusDb(db, del) {
    if (!db || !del) return;

    if (del.source === 'sortieren_tag') {
        const datum = del.date;
        if (Array.isArray(db.teamSortierBuchungen) && datum) {
            db.teamSortierBuchungen.forEach((b) => {
                if (b.datum === datum && b.sessionKey) sortierLoeschenMarkieren(db, b.datum, b.sessionKey);
            });
            /* FEHLERBEHEBUNG: Das verfrühte Filtern hat dazu geführt, dass gelöschte Einträge nach einem Cloud-Sync wieder erschienen sind. */
            /*
            db.teamSortierBuchungen = filterDeletedSortierBuchungen(
                db.teamSortierBuchungen,
                db.deletedSortierBuchungen
            );
            */
        }
        if (datum) rebuildTeamTagesMengenFuerDatum(db, datum);
        bereinigeGeloeschteSortierDeliveries(db);
        return;
    }

    if (del.source !== 'sortieren') return;
    const datum = del.date;
    const liefName = String(del.name || '').trim();

    if (Array.isArray(db.teamSortierBuchungen) && datum && liefName) {
        db.teamSortierBuchungen.forEach((b) => {
            if (b.datum !== datum) return;
            if (String(b.lief || '').trim() !== liefName) return;
            if (b.sessionKey) sortierLoeschenMarkieren(db, b.datum, b.sessionKey);
        });
        /* FEHLERBEHEBUNG: Siehe oben. Das Filtern erfolgt jetzt nur noch bei der Anzeige/im Merge, nicht mehr direkt in der Datenquelle. */
        /*
        db.teamSortierBuchungen = filterDeletedSortierBuchungen(
            db.teamSortierBuchungen,
            db.deletedSortierBuchungen
        );
        */
    }
    bereinigeGeloeschteSortierDeliveries(db);
    if (datum) rebuildTeamTagesMengenFuerDatum(db, datum);
}

function fertigNrAusSorte(sorte, articles) {
    const s = (sorte || '').trim();
    if (!s) return null;
    // Klammer-ID am Ende hat Vorrang: "70714 - Hähnchenbrust Classic Pon Ex (80080)" → 80080
    const endMatch = s.match(/\((\d+)\)\s*$/);
    if (endMatch) return endMatch[1];
    const nrMatch = s.match(/^(\d+)\s*-\s*/);
    if (nrMatch) {
        if (Array.isArray(articles)) {
            const hit = articles.find(a => String(a.nr || '') === nrMatch[1] || String(a.fertigNr || '') === nrMatch[1]);
            if (hit) return hit.fertigNr || hit.nr || nrMatch[1];
        }
        return nrMatch[1];
    }
    const clean = s.replace(/\s*\(UNS\)\s*/gi, '').replace(/\s*\(EX\)\s*/gi, '').trim();
    if (!Array.isArray(articles)) return null;
    const hit = articles.find((a) => {
        const disp = ((a.nr || '') + ' - ' + (a.name || '')).trim();
        return disp === s || (a.name && (a.name === clean || a.name === s));
    });
    return hit ? (hit.fertigNr || hit.nr || null) : null;
}

async function bucheTeamSortierungBeimDruck(aggregatedDaten, sitzungId) {
    if (!Array.isArray(aggregatedDaten) || aggregatedDaten.length === 0) return false;
    const heute = typeof getLocalISO === 'function' ? getLocalISO() : new Date().toISOString().split('T')[0];
    const jetzt = new Date().toISOString();
    const aktSitzung = sitzungId || 'default';

    const lDb = typeof ladeLogistikDb === 'function' ? ladeLogistikDb() : {};
    const artikelMarkt = lDb.artikelMarkt || {};
    const articles = lDb.articles || [];
    let teamTagesMengen = lDb.teamTagesMengen || {};
    if (!teamTagesMengen[heute]) teamTagesMengen[heute] = leererTeamTagesEintrag();

    if (!Array.isArray(lDb.deletedSortierBuchungen)) lDb.deletedSortierBuchungen = [];

    const offline = typeof ladeOfflineDb === 'function' ? ladeOfflineDb() : {};
    lDb.deletedSortierBuchungen = mergeDeletedSortierKeys(lDb.deletedSortierBuchungen, offline.deletedSortierBuchungen);
    let buchungen = mergeTeamSortierBuchungen(
        lDb.teamSortierBuchungen || [],
        offline.teamSortierBuchungen || [],
        lDb.deletedSortierBuchungen
    );
    let geaendert = false;

    // Verwenden von Promise.all, um alle Supabase-Einfügungen parallel zu verarbeiten
    // und sicherzustellen, dass die Funktion asynchron ist.
    const supabasePromises = aggregatedDaten.map(async (item) => {
        const sessionKey = sortierungSessionKey(item.lief, item.sorte, item.herkunft);
        const aktuellesGewicht = parseFloat(item.netto) || 0;
        // Buchung nur innerhalb derselben Sitzung suchen → verschiedene Lieferungen am selben Tag bleiben getrennt
        let buchung = buchungen.find((b) => b.sessionKey === sessionKey && b.datum === heute && (b.sitzungId || 'default') === aktSitzung);

        // --- NEU: Daten in Supabase speichern ---
        if (window.supabase && aktuellesGewicht > 0) {
            const fertigNr = fertigNrAusSorte(item.sorte, articles);
            const marktTyp = artikelMarktTyp(fertigNr, item.sorte, artikelMarkt);
            
            const supabaseEvent = {
                source: 'rechner-sortierung',
                created_at: new Date().toISOString(),
                supplier_id: item.lief || 'Unbekannt',
                article_id: item.sorte || 'Unbekannt', // Oder eine spezifischere Artikel-ID
                kisten: null, // Falls Kisten nicht aus 'item' verfügbar sind
                gewicht: aktuellesGewicht,
                markt_typ: marktTyp === 'export' ? 'export' : (marktTyp === 'inland' ? 'inland' : 'nv'),
                comment: `Sortierung vom Rechner, Session: ${sessionKey}`
            };

            try {
                const { error } = await window.supabase
                    .from('statistic_events')
                    .insert([supabaseEvent]);
                if (error) {
                    console.error('Fehler beim Speichern des Statistik-Events in Supabase:', error);
                } else {
                    // console.log('Statistik-Event erfolgreich in Supabase gespeichert:', supabaseEvent);
                }
            } catch (e) {
                console.error('Ausnahme beim Speichern des Statistik-Events in Supabase:', e);
            }
        }
        // --- ENDE NEU ---

        // Duplikat-Bereinigung: wenn Artikel-Name durch Sync geändert wurde entsteht ein
        // verwaister Eintrag mit anderem sessionKey aber gleicher FertigNr+Lief+Herkunft (nur in derselben Sitzung).
        // Nur über Katalog-Lookup — kein Regex-Fallback, damit Artikel mit gleicher Lieferantennummer
        // (z.B. mehrere 70730-Artikel) sich nicht gegenseitig nullen.
        const katalogHit = articles.find((a) => {
            const disp = ((a.nr || '') + ' - ' + (a.name || '')).trim();
            const clean = (item.sorte || '').replace(/\s*\(UNS\)\s*/gi, '').replace(/\s*\(EX\)\s*/gi, '').trim();
            return disp === item.sorte || (a.name && (a.name === clean || a.name === item.sorte));
        });
        const fertigNr = katalogHit ? (katalogHit.fertigNr || katalogHit.nr || null) : null;
        // Cleanup nur wenn Artikel eindeutig im Katalog und echtes Gewicht vorhanden
        if (fertigNr && articles.length > 0 && aktuellesGewicht > 0) {
            buchungen.forEach((b) => {
                if (b.datum !== heute || b.sessionKey === sessionKey) return;
                if ((b.sitzungId || 'default') !== aktSitzung) return; // andere Sitzung → nicht anfassen
                if ((b.lief || '') !== (item.lief || '') || (b.herkunft || '') !== (item.herkunft || '')) return;
                const altHit = articles.find((a) => {
                    const disp = ((a.nr || '') + ' - ' + (a.name || '')).trim();
                    const clean = (b.sorte || '').replace(/\s*\(UNS\)\s*/gi, '').replace(/\s*\(EX\)\s*/gi, '').trim();
                    return disp === b.sorte || (a.name && (a.name === clean || a.name === b.sorte));
                });
                const altFertigNr = altHit ? (altHit.fertigNr || altHit.nr || null) : null;
                if (!altFertigNr || altFertigNr !== fertigNr) return;
                const altKg = parseFloat(b.gebuchtKg) || 0;
                if (altKg <= 0) return;
                const altTyp = artikelMarktTyp(altFertigNr, b.sorte, artikelMarkt);
                teamTagesMengen[heute].gesamtKg = Math.max(0, (parseFloat(teamTagesMengen[heute].gesamtKg) || 0) - altKg);
                if (altTyp === 'export') {
                    teamTagesMengen[heute].exportKg = Math.max(0, (parseFloat(teamTagesMengen[heute].exportKg) || 0) - altKg);
                } else {
                    teamTagesMengen[heute].unsKg = Math.max(0, (parseFloat(teamTagesMengen[heute].unsKg) || 0) - altKg);
                }
                b.gebuchtKg = 0;
                b.letztesGewichtKg = 0;
                b.letzterDruck = jetzt;
                geaendert = true;
            });
        }

        const bereitsGebuchtKg = buchung ? (parseFloat(buchung.gebuchtKg) || 0) : 0;
        const delta = aktuellesGewicht - bereitsGebuchtKg;
        if (!delta) {
            if (buchung) {
                buchung.letzterDruck = jetzt;
                geaendert = true;
            }
            return;
        }

        sortierLoeschenAufheben(lDb, heute, sessionKey);
        teamTagesMengen[heute].gesamtKg = (parseFloat(teamTagesMengen[heute].gesamtKg) || 0) + delta;
        const marktTyp = artikelMarktTyp(fertigNr, item.sorte, artikelMarkt);
        if (marktTyp === 'export') {
            teamTagesMengen[heute].exportKg = (parseFloat(teamTagesMengen[heute].exportKg) || 0) + delta;
        } else {
            teamTagesMengen[heute].unsKg = (parseFloat(teamTagesMengen[heute].unsKg) || 0) + delta;
        }

        if (buchung) {
            buchung.gebuchtKg = aktuellesGewicht;
            buchung.letztesGewichtKg = aktuellesGewicht;
            buchung.letzterDruck = jetzt;
        } else {
            buchungen.push({
                id: Date.now().toString() + '_' + Math.random().toString(36).slice(2, 7),
                sessionKey,
                sitzungId: aktSitzung,
                datum: heute,
                lief: item.lief || '',
                sorte: item.sorte || '',
                herkunft: item.herkunft || '',
                gebuchtKg: aktuellesGewicht,
                letztesGewichtKg: aktuellesGewicht,
                letzterDruck: jetzt
            });
        }
        geaendert = true;
    });

    // Warten, bis alle Supabase-Operationen abgeschlossen sind
    await Promise.all(supabasePromises);

    if (!geaendert && supabasePromises.length === 0) { // Nur wenn wirklich nichts geändert wurde und keine Supabase-Events
        if (typeof pushSortierNachDruckSilent === 'function') pushSortierNachDruckSilent();
        return false;
    }

    lDb.teamTagesMengen = teamTagesMengen;
    lDb.teamSortierBuchungen = buchungen;
    lDb.deliveries = syncSortierenBuchungenZuDeliveries(
        lDb.deliveries || [],
        buchungen,
        teamTagesMengen,
        lDb.deletedSortierBuchungen,
        articles,
        artikelMarkt
    );
    bereinigeGeloeschteSortierDeliveries(lDb);
    if (typeof speichereLogistikDb === 'function') speichereLogistikDb(lDb);

    if (typeof patchOfflineDb === 'function') {
        patchOfflineDb({
            teamTagesMengen,
            teamSortierBuchungen: buchungen,
            deliveries: lDb.deliveries,
            deletedSortierBuchungen: lDb.deletedSortierBuchungen
        });
    }

    if (typeof pushSortierNachDruckSilent === 'function') pushSortierNachDruckSilent();
    else if (typeof triggerAutoSync === 'function') triggerAutoSync('logistik');
    return true;
}

function migriereTeamAusDailyStaff(teamTagesMengen, dailyStaff) {
    if (!dailyStaff) return teamTagesMengen || {};
    if (!teamTagesMengen) teamTagesMengen = {};
    Object.keys(dailyStaff).forEach((datum) => {
        const p = personalAnzahlAusTag(dailyStaff, datum);
        if (p > 0) {
            if (!teamTagesMengen[datum]) teamTagesMengen[datum] = leererTeamTagesEintrag();
            if (!teamTagesMengen[datum].personalAnzahl) teamTagesMengen[datum].personalAnzahl = p;
        }
    });
    return teamTagesMengen;
}

function syncDailyStaffAusTeam(teamTagesMengen, dailyStaff) {
    if (!dailyStaff) dailyStaff = {};
    if (!teamTagesMengen) return dailyStaff;
    Object.keys(teamTagesMengen).forEach((datum) => {
        const p = teamTagesMengen[datum]?.personalAnzahl;
        if (p != null && p !== '') dailyStaff[datum] = parseFloat(p) || 0;
    });
    return dailyStaff;
}

/** Alle erfassten kg eines Tages (LKW + Wiegeschein). */
function summeGewichtKgProTag(deliveries, datum) {
    return gesamtKgFuerDatum(deliveries, datum);
}

/** Summe der zugewiesenen Mitarbeiter-kg — gleiche Logik wie CC-Mitarbeiter-Matrix. */
function summeWorkerKgProTag(deliveries, datum) {
    if (!Array.isArray(deliveries) || !datum) return 0;
    let total = 0;
    deliveries.filter((del) => del.date === datum).forEach((del) => {
        (del.entries || []).forEach((e) => {
            if (e.workers) {
                Object.values(e.workers).forEach((wkg) => { total += parseFloat(wkg) || 0; });
            }
        });
    });
    deliveries.forEach((del) => {
        (del.workerShares || []).forEach((ws) => {
            const wsDate = ws.date || del.date;
            if (wsDate === datum) total += parseFloat(ws.kg) || 0;
        });
    });
    return total;
}

function istExportArtikel(artikelName) {
    const name = (artikelName || '').toLowerCase();
    return name.includes('exp') || name.includes('ex');
}

function artikelMarktTyp(fertigNr, artikelName, artikelMarkt) {
    // Klammern-Nr am Ende hat Vorrang: "70730 - Koch TFB EX (80346)" → echte fertigNr 80346
    if (artikelMarkt && artikelName) {
        const m = String(artikelName).match(/\((\d+)\)\s*$/);
        if (m && artikelMarkt[m[1]] !== undefined) {
            const mapped = artikelMarkt[m[1]];
            if (mapped === 'export' || mapped === 'inland') return mapped;
            if (mapped === 'exp') return 'export';
            if (mapped === 'uns') return 'inland';
        }
    }
    if (artikelMarkt && fertigNr != null) {
        const key = String(fertigNr);
        const mapped = artikelMarkt[key] ?? artikelMarkt[fertigNr];
        if (mapped === 'export' || mapped === 'inland') return mapped;
        if (mapped === 'exp') return 'export';
        if (mapped === 'uns') return 'inland';
    }
    return istExportArtikel(artikelName) ? 'export' : 'inland';
}

function filterNachTyp(eintraege, typ, nameFeld, artikelMarkt) {
    if (!Array.isArray(eintraege)) return [];
    if (!typ || typ === 'all') return eintraege;
    const nf = nameFeld || 'name';
    return eintraege.filter((e) => {
        const marktTyp = artikelMarktTyp(e.fertigNr || e.nr, e[nf], artikelMarkt);
        if (typ === 'exp' || typ === 'export') return marktTyp === 'export';
        if (typ === 'uns' || typ === 'inland') return marktTyp === 'inland';
        return true;
    });
}

/** Tages-KPIs aus vollständiger DB (Deliveries + Sortier-Buchungen vom Drucken). */
function teamTagesAnzeigeAusDb(db, datum) {
    if (!db || !datum) return { personalAnzahl: 0, gesamtKg: 0, lkwKg: 0, sortiertKg: 0, exportKg: 0, unsKg: 0, proKopf: 0 };
    const personalAnzahl = personalAusTeamTag(db.teamTagesMengen, db.dailyStaff, datum);
    const sortSum = sortierenSummeFuerDatum(
        db.teamSortierBuchungen,
        db.teamTagesMengen,
        datum,
        db.deletedSortierBuchungen,
        db.articles,
        db.artikelMarkt
    );
    let sortiertKg = sortSum.gesamtKg;
    if (sortiertKg <= 0) sortiertKg = sortiertKgAusDeliveries(db.deliveries || [], datum);
    // Manuelle LKW-Einträge (ohne Handy erfasst) separat addieren → erscheinen als N/Z
    const manuellKg = lkwKgFuerDatum(db.deliveries || [], datum);
    const gesamtKg = sortiertKg + manuellKg;
    return {
        personalAnzahl,
        gesamtKg,
        lkwKg: manuellKg,
        sortiertKg,
        exportKg: sortSum.exportKg,
        unsKg: sortSum.unsKg,
        proKopf: mengeProKopf(gesamtKg, personalAnzahl),
        hatTeamEintrag: !!teamTagAusMengen(db.teamTagesMengen, datum)
    };
}

function teamZeitraumMetrikenAusDb(db, datenListe) {
    if (!db) {
        return { tage: [], summeKg: 0, summePersonal: 0, summeExport: 0, summeUns: 0, summeLkw: 0, summeSortiert: 0, proKopf: 0, tageMitDaten: 0 };
    }
    ensureDatenKonsistenz(db);
    return teamZeitraumMetriken(db.teamTagesMengen, db.dailyStaff, db.deliveries || [], datenListe || [], db);
}

function teamZeitraumMetriken(teamTagesMengen, dailyStaff, deliveries, datenListe, dbOptional) {
    let summeKg = 0;
    let summePersonal = 0;
    let summeExport = 0;
    let summeUns = 0;
    let summeLkw = 0;
    let summeSortiert = 0;
    let tageMitDaten = 0;
    const tage = (datenListe || []).map((datum) => {
        const a = dbOptional
            ? teamTagesAnzeigeAusDb(dbOptional, datum)
            : teamTagesAnzeige(teamTagesMengen, dailyStaff, deliveries, datum);
        if (a.gesamtKg > 0 || a.personalAnzahl > 0 || a.exportKg > 0 || a.unsKg > 0) {
            tageMitDaten++;
            summeKg += a.gesamtKg;
            summePersonal += a.personalAnzahl;
            summeExport += a.exportKg;
            summeUns += a.unsKg;
            summeLkw += a.lkwKg || 0;
            summeSortiert += a.sortiertKg || 0;
        }
        return { datum, ...a };
    });
    return {
        tage,
        summeKg,
        summePersonal,
        summeExport,
        summeUns,
        summeLkw,
        summeSortiert,
        proKopf: mengeProKopf(summeKg, summePersonal),
        tageMitDaten
    };
}

/** Datumsliste mit Sortier-Buchungen (neueste zuerst). */
function sortierBuchungenNachDatum(db) {
    const map = {};
    filterDeletedSortierBuchungen(db?.teamSortierBuchungen || [], db?.deletedSortierBuchungen)
        .forEach((b) => {
            if (!b?.datum) return;
            map[b.datum] = (map[b.datum] || 0) + 1;
        });
    return Object.keys(map).sort((a, b) => b.localeCompare(a)).map((datum) => ({ datum, count: map[datum] }));
}

function sammleAlleErfassungsDaten(db) {
    const dates = new Set();
    (db.deliveries || []).forEach((d) => { if (d.date && isSortierDelivery(d)) dates.add(normalizeDatumIso(d.date)); });
    filterDeletedSortierBuchungen(db.teamSortierBuchungen || [], db.deletedSortierBuchungen)
        .forEach((b) => { if (b.datum) dates.add(normalizeDatumIso(b.datum)); });
    Object.keys(db.teamTagesMengen || {}).forEach((d) => { if (d) dates.add(normalizeDatumIso(d)); });
    return [...dates].filter(Boolean).sort();
}

/** Sortier-Deliveries und teamTagesMengen mit Buchungen/Cloud abgleichen. */
function ensureDatenKonsistenz(db) {
    if (!db) return;
    if (!db.teamTagesMengen || typeof db.teamTagesMengen !== 'object') db.teamTagesMengen = {};
    if (!db.dailyStaff || typeof db.dailyStaff !== 'object') db.dailyStaff = {};
    if (!Array.isArray(db.teamSortierBuchungen)) db.teamSortierBuchungen = [];
    if (!Array.isArray(db.deletedSortierBuchungen)) db.deletedSortierBuchungen = [];
    if (!Array.isArray(db.deliveries)) db.deliveries = [];
    migriereTeamAusDailyStaff(db.teamTagesMengen, db.dailyStaff);
    if (typeof ensureSortierenDeliveries === 'function') ensureSortierenDeliveries(db);
    sammleAlleErfassungsDaten(db).forEach((datum) => {
        rebuildTeamTagesMengenFuerDatum(db, datum);
        const sort = sortierenSummeFuerDatum(
            db.teamSortierBuchungen, db.teamTagesMengen, datum,
            db.deletedSortierBuchungen, db.articles, db.artikelMarkt
        ).gesamtKg;
        const kg = sort > 0 ? sort : sortiertKgAusDeliveries(db.deliveries, datum);
        if (kg > 0) {
            if (!db.teamTagesMengen[datum]) db.teamTagesMengen[datum] = leererTeamTagesEintrag();
            db.teamTagesMengen[datum].gesamtKg = kg;
        }
    });
    if (typeof syncDailyStaffAusTeam === 'function') syncDailyStaffAusTeam(db.teamTagesMengen, db.dailyStaff);
}

/** Lücken und Abweichungen zwischen Buchungen und Erfassung erkennen. */
function pruefeDatenIntegritaet(db, datenListe) {
    const issues = [];
    if (!db) return issues;
    const dates = (datenListe && datenListe.length) ? datenListe : sammleAlleErfassungsDaten(db);
    dates.forEach((datum) => {
        const fromBuch = sortierenLieferantenFuerDatum(db.teamSortierBuchungen, datum, db.deletedSortierBuchungen);
        const fromDel = {};
        (db.deliveries || []).filter((d) => d.date === datum && d.source === 'sortieren').forEach((d) => {
            const n = String(d.name || '').trim() || 'Unbekannt';
            fromDel[n] = (fromDel[n] || 0) + (parseFloat(d.kg) || 0);
        });
        fromBuch.forEach(({ name, kg }) => {
            const delKg = fromDel[name] || 0;
            if (Math.abs(delKg - kg) > 0.5) {
                issues.push({
                    level: 'warn',
                    datum,
                    text: `${datum.split('-').reverse().join('.')}: „${name}" — Handy-Buchung ${kg.toLocaleString('de-DE')} kg, Erfassung ${delKg.toLocaleString('de-DE')} kg`
                });
            }
            delete fromDel[name];
        });
        Object.entries(fromDel).forEach(([name, kg]) => {
            if (kg > 0.5) {
                issues.push({
                    level: 'info',
                    datum,
                    text: `${datum.split('-').reverse().join('.')}: „${name}" — ${kg.toLocaleString('de-DE')} kg in Erfassung ohne Handy-Buchung`
                });
            }
        });
        const sortSum = sortierenSummeFuerDatum(
            db.teamSortierBuchungen, db.teamTagesMengen, datum,
            db.deletedSortierBuchungen, db.articles, db.artikelMarkt
        );
        const team = teamTagesAnzeigeAusDb(db, datum);
        if (sortSum.gesamtKg > 0 && (team.exportKg + team.unsKg) > 0 && Math.abs((team.exportKg + team.unsKg) - sortSum.gesamtKg) > 1) {
            issues.push({
                level: 'warn',
                datum,
                text: `${datum.split('-').reverse().join('.')}: Export+Uns (${team.exportKg + team.unsKg} kg) ≠ Sortiert-Summe (${sortSum.gesamtKg} kg)`
            });
        }
    });
    return issues;
}

function repariereDatenIntegritaet(db, datenListe) {
    if (!db) return { changed: false, issues: [] };
    const before = JSON.stringify(db.deliveries || []);
    ensureDatenKonsistenz(db);
    return {
        changed: before !== JSON.stringify(db.deliveries || []),
        issues: pruefeDatenIntegritaet(db, datenListe)
    };
}
