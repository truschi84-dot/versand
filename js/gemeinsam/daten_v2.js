// =====================================================================
//  DATENSCHICHT v2  —  die Brücke zwischen neuem Modell und alter App
//  Stand: 2026-08-20
//
//  WARUM DIESE DATEI STATT EINES UMBAUS
//  ------------------------------------
//  Im Control Center greifen über 4.000 Zeilen auf das eine Objekt `db`
//  zu (db.articles, db.todo, db.savedProdukteRaw …). Die alle umzu-
//  schreiben wäre ein Umbau bei laufendem Betrieb mit vielen Stellen,
//  an denen etwas kaputtgehen kann.
//
//  Stattdessen bleibt `db` genau so, wie es ist. Nur woher es kommt und
//  wohin es geht, ändert sich:
//
//     früher:  ein 1,55-MB-Paket rauf und runter, wer zuletzt drückt gewinnt
//     jetzt:   einzelne Datensätze über /api/daten, Änderungen kommen von selbst
//
//  Diese Datei übersetzt in beide Richtungen. Sie ist die einzige Stelle,
//  die beide Welten kennt — überall sonst bleibt alles beim Alten.
//
//  DREI AUFGABEN
//  -------------
//   1. ladeAllesV2()        holt den Bestand und baut daraus `db`
//   2. schreibeV2(...)      schreibt EINEN Datensatz (kein Paket)
//   3. starteLiveV2()       hört mit und pflegt Änderungen in `db` ein
//
//  Solange DatenV2.aktiv false ist, tut diese Datei gar nichts — die App
//  läuft dann unverändert über den alten Weg. Damit lässt sich die
//  Umstellung anschalten und im Zweifel wieder ausschalten.
// =====================================================================

'use strict';

const DatenV2 = (function () {

    let basis = '';            // Adresse des Servers, z.B. http://192.168.211.23:8080
    let schluessel = '';       // Zugriffsschlüssel aus der Einrichtung
    let liveSteht  = false;    // steht der Live-Kanal WIRKLICH? (2026-08-20)
    let cloudModus = false;    // spricht die Gegenstelle PostgREST? (2026-08-21)
    let abrufTakt  = null;     // Ersatz fuer den Live-Kanal in der Cloud
    let beiSichtbar = null;    // holt nach, sobald das Fenster wieder vorn ist
    const ABRUF_MS = 4000;     // alle 4 Sekunden fragen -- ein winziger Abruf
    let geraet = 'unbekannt';  // steht später an jedem Datensatz
    let stand = 0;             // bei welcher laufenden Nummer sind wir
    let liveKanal = null;
    let beiAenderung = null;   // Rückruf, wenn sich etwas geändert hat

    // -----------------------------------------------------------------
    // Übersetzung: neue Tabellen  ->  altes db-Objekt
    //
    // Die Zuordnung ist das Gegenstück zu server/umstellung_v2.js. Wer
    // dort etwas ändert, muss es hier mitändern -- deshalb stehen die
    // Feldnamen bewusst offen nebeneinander statt in einer Schleife.
    // -----------------------------------------------------------------
    const ZUSTAND_ZU_LISTE = {
        zugeteilt: 'articles',
        offen:     'todo',
        lose:      'lose',
        spaeter:   'later',
        versteckt: 'hidden'
    };
    const LISTE_ZU_ZUSTAND = {
        articles: 'zugeteilt',
        todo:     'offen',
        lose:     'lose',
        later:    'spaeter',
        hidden:   'versteckt'
    };

    /** Baut die Nölke-Textzeile, die Scanner und Zebra-Etikett erwarten. */
    function noelkeZeile(p) {
        if (!p) return '';
        if (p.sondereintrag) return String(p.produkt || '');
        let t = '[Nr. ' + p.nr + '] ';
        const marke = String(p.marke || '').trim();
        t += marke ? marke + ' - ' + p.produkt : p.produkt;
        const g = String(p.groesse || '').trim();
        if (g) t += ' (' + g + ')';
        const e = String(p.ean || '').trim();
        if (e) t += ' | EAN: ' + e;
        return t;
    }

    /**
     * Aus dem Bestand der neuen Tabellen das gewohnte db-Objekt bauen.
     * Alles, was die App bisher gelesen hat, steht danach an derselben
     * Stelle wie vorher.
     */
    function bauDb(daten, zielDb) {
        const db = zielDb || {};

        // --- Artikel: eine Tabelle wird wieder zu fünf Listen ---------
        ['articles', 'todo', 'lose', 'later', 'hidden'].forEach(k => { db[k] = []; });
        db.artikelMarkt = {};
        db.tierartZuordnung = {};

        const liefProArtikel = {};
        (daten.artikel_lieferant || []).forEach(z => {
            (liefProArtikel[z.fertig_nr] = liefProArtikel[z.fertig_nr] || []).push(z.lieferant);
        });

        (daten.artikel || []).forEach(a => {
            const liste = ZUSTAND_ZU_LISTE[a.zustand] || 'todo';
            const eintrag = { fertigNr: a.fertig_nr, name: a.name, nr: a.roh_nr || '' };
            if (a.original_name) eintrag.originalName = a.original_name;
            if (liste === 'articles') eintrag.suppliers = liefProArtikel[a.fertig_nr] || [];
            db[liste].push(eintrag);
            if (a.markt) db.artikelMarkt[a.fertig_nr] = a.markt;
            if (a.tierart) db.tierartZuordnung[a.fertig_nr] = a.tierart;
        });

        // --- Nölke: aus Feldern wird wieder die Textzeile -------------
        const noelke = (daten.noelke_produkt || []).slice()
            .sort((x, y) => (x.sondereintrag ? 1 : 0) - (y.sondereintrag ? 1 : 0) || x.nr - y.nr);
        db.savedProdukteRaw = noelke.map(noelkeZeile);
        db.noelkeArtNr = {};
        noelke.forEach(p => { if (p.eigene_artikel_nr) db.noelkeArtNr[String(p.nr)] = p.eigene_artikel_nr; });

        // --- Stammdaten ----------------------------------------------
        db.suppliers = (daten.lieferant || []).map(l => l.name);
        db.supplierNumbers = {};
        (daten.lieferant || []).forEach(l => { if (l.nummer) db.supplierNumbers[l.name] = l.nummer; });
        db.supplierLines = {};
        (daten.lieferant_linie || []).forEach(z => {
            (db.supplierLines[z.lieferant] = db.supplierLines[z.lieferant] || []).push(z.linie);
        });

        db.workers = (daten.mitarbeiter || []).map(m => m.name);
        db.workerColors = {};
        (daten.mitarbeiter || []).forEach(m => { if (m.farbe) db.workerColors[m.name] = m.farbe; });

        db.customers = (daten.kunde || []).map(k => k.name);

        // --- Lieferungen mit ihren Anteilen --------------------------
        const anteile = {};
        (daten.lieferung_anteil || []).forEach(z => {
            (anteile[z.lieferung_id] = anteile[z.lieferung_id] || []).push({ name: z.mitarbeiter, kg: Number(z.kg) });
        });
        db.deliveries = (daten.lieferung || []).map(l => {
            const d = {
                id: l.id, date: l.datum, name: l.name, kg: Number(l.kg),
                source: l.quelle, isFullySorted: !!l.voll_sortiert,
                workerShares: anteile[l.id] || []
            };
            if (l.export_kg !== null && l.export_kg !== undefined) d.exportKg = Number(l.export_kg);
            if (l.uns_kg !== null && l.uns_kg !== undefined) d.unsKg = Number(l.uns_kg);
            return d;
        });

        // --- Sortier-Buchungen ---------------------------------------
        db.teamSortierBuchungen = (daten.sortier_buchung || []).map(b => ({
            id: b.id, datum: b.datum, lief: b.lieferant, sorte: b.sorte,
            sitzungId: b.sitzung_id, sessionKey: b.session_key, deliveryId: b.lieferung_id,
            gebuchtKg: b.gebucht_kg === null ? null : Number(b.gebucht_kg),
            letztesGewichtKg: b.letztes_gewicht_kg === null ? null : Number(b.letztes_gewicht_kg),
            letzterDruck: b.letzter_druck, herkunft: b.herkunft
        }));
        // Löschmarken gibt es im neuen Modell nicht mehr: gelöscht ist gelöscht,
        // die Zeile kommt gar nicht erst mit. Die Liste bleibt leer, damit die
        // bestehenden Filter im Programm weiterlaufen, ohne etwas wegzunehmen.
        db.deletedSortierBuchungen = [];
        db.deletedSuppliers = [];
        db.deletedSonderTemplates = [];
        db.deletedArticles = [];
        db.deletedNoelke = [];
        // 2026-08-21 dazugekommen. Sie werden hier genauso geleert wie die anderen:
        // was vom Server kommt, IST der Stand -- ein Grabstein von vorhin waere danach
        // gegenstandslos. Zwischen Loeschen und Schreiben passiert kein volles Laden
        // (der Live-Kanal pflegt nur einzelne Aenderungen ein), der Zettel ueberlebt
        // also genau so lange, wie er gebraucht wird.
        db.deletedWorkers = [];
        db.deletedLieferungen = [];

        // --- Sonder-Vorlagen -----------------------------------------
        db.sonderTemplates = (daten.sonder_vorlage || []).map(v => ({
            id: v.id, name: v.name, ean: v.ean, lief: v.lieferant,
            s_reihe: v.s_reihe, s_reihen: v.s_reihen, s_krtlage: v.s_krtlage,
            s_lagen: v.s_lagen, s_stk: v.s_stk, s_stke2: v.s_stke2, s_kg: v.s_kg
        }));

        // --- Tagesdaten ----------------------------------------------
        db.teamTagesMengen = {};
        db.dailyStaff = {};
        (daten.tages_summe || []).forEach(t => {
            db.teamTagesMengen[t.datum] = {
                gesamtKg: Number(t.gesamt_kg), exportKg: Number(t.export_kg),
                unsKg: Number(t.uns_kg), personalAnzahl: t.personal_anzahl
            };
            db.dailyStaff[t.datum] = t.personal_anzahl;
        });
        db.dailyAttendance = db.dailyAttendance || {};

        db.checklistMorningTemplate = (daten.checkliste_morgens || [])
            .slice().sort((a, b) => a.reihenfolge - b.reihenfolge)
            .map(p => ({ id: p.id, text: p.text }));

        const nachricht = (daten.tagesnachricht || [])[0];
        if (nachricht) db.teamDayBrief = { date: nachricht.datum, message: nachricht.nachricht || '', tasks: nachricht.aufgaben || [] };

        // --- Einstellungen und Firmendaten ---------------------------
        db.settings = db.settings || {};
        db.company = db.company || {};
        (daten.einstellung || []).forEach(e => {
            if (e.schluessel === 'firma.name')         db.company.name = e.wert;
            else if (e.schluessel === 'firma.farbe')   db.company.color = e.wert;
            else if (e.schluessel === 'firma.leergut') db.company.leergut = e.wert;
            else if (e.schluessel === 'firma.module')  { try { db.company.modules = JSON.parse(e.wert); } catch (x) { /* stehen lassen */ } }
            else {
                // Zahlen bleiben Zahlen, sonst rechnet die App mit Text weiter
                const n = Number(e.wert);
                db.settings[e.schluessel] = (e.wert !== '' && e.wert !== null && !Number.isNaN(n)
                                             && /^-?\d+(\.\d+)?$/.test(String(e.wert))) ? n : e.wert;
            }
        });

        return db;
    }

    // -----------------------------------------------------------------
    // Übersetzung: altes db-Objekt  ->  ein einzelner Datensatz
    // -----------------------------------------------------------------
    const NACH_TABELLE = {
        artikel: (a, liste) => ({
            fertig_nr: String(a.fertigNr),
            name: a.name,
            original_name: a.originalName || null,
            roh_nr: a.nr || null,
            zustand: LISTE_ZU_ZUSTAND[liste] || 'offen'
        }),
        noelke: (p) => ({
            nr: p.nr, marke: p.marke || null, produkt: p.produkt,
            groesse: p.groesse || null, ean: p.ean || null,
            eigene_artikel_nr: p.eigeneArtikelNr || null,
            sondereintrag: !!p.sondereintrag
        }),
        lieferant:   (l) => ({ name: l.name, nummer: l.nummer || null }),
        mitarbeiter: (m) => ({ name: m.name, farbe: m.farbe || null }),
        kunde:       (k) => ({ name: typeof k === 'string' ? k : k.name }),
        lieferung:   (d) => ({
            id: d.id, datum: d.date, name: d.name || null,
            kg: parseFloat(d.kg) || 0,
            export_kg: d.exportKg === undefined ? null : parseFloat(d.exportKg),
            uns_kg: d.unsKg === undefined ? null : parseFloat(d.unsKg),
            quelle: d.source || null, voll_sortiert: !!d.isFullySorted
        })
    };

    // -----------------------------------------------------------------
    // ZEILENGENAU TAUSCHEN
    //
    // Gegenstueck zu bauDb(): dort wird alles neu aufgebaut, hier nur das,
    // was sich geaendert hat. Eine geloeschte Zeile (geloescht_am gesetzt)
    // wird ausgetragen, alles andere ersetzt oder angehaengt.
    // -----------------------------------------------------------------

    /** Traegt einen Eintrag in eine Liste ein oder tauscht ihn aus. */
    function tauscheInListe(liste, schluesselFeld, wert, neuerEintrag) {
        const i = liste.findIndex(e => e && String(e[schluesselFeld]) === String(wert));
        if (neuerEintrag === null) { if (i > -1) liste.splice(i, 1); return; }
        if (i > -1) liste[i] = neuerEintrag; else liste.push(neuerEintrag);
    }

    /** Entfernt einen Artikel aus ALLEN fuenf Listen. */
    function nimmArtikelRaus(db, fertigNr) {
        ['articles', 'todo', 'lose', 'later', 'hidden'].forEach(k => {
            db[k] = (db[k] || []).filter(a => String(a.fertigNr) !== String(fertigNr));
        });
    }

    function patcheDb(db, inhalte) {
        // --- Artikel -------------------------------------------------
        (inhalte.artikel || []).forEach(a => {
            nimmArtikelRaus(db, a.fertig_nr);
            delete (db.artikelMarkt || {})[a.fertig_nr];
            delete (db.tierartZuordnung || {})[a.fertig_nr];
            if (a.geloescht_am) return;
            const liste = ZUSTAND_ZU_LISTE[a.zustand] || 'todo';
            const eintrag = { fertigNr: a.fertig_nr, name: a.name, nr: a.roh_nr || '' };
            if (a.original_name) eintrag.originalName = a.original_name;
            if (liste === 'articles') eintrag.suppliers = [];   // fuellt patcheZuordnungen
            (db[liste] = db[liste] || []).push(eintrag);
            if (a.markt) (db.artikelMarkt = db.artikelMarkt || {})[a.fertig_nr] = a.markt;
            if (a.tierart) (db.tierartZuordnung = db.tierartZuordnung || {})[a.fertig_nr] = a.tierart;
        });

        // --- Nölke: die Liste ist Text, also ueber die Nummer suchen --
        (inhalte.noelke_produkt || []).forEach(p => {
            db.savedProdukteRaw = db.savedProdukteRaw || [];
            const passt = (z) => {
                const m = String(z).match(/^\[\s*Nr\.\s*(\d+)\s*\]/i);
                return m ? Number(m[1]) === Number(p.nr) : false;
            };
            const i = db.savedProdukteRaw.findIndex(passt);
            if (p.geloescht_am) {
                if (i > -1) db.savedProdukteRaw.splice(i, 1);
                delete (db.noelkeArtNr || {})[String(p.nr)];
                return;
            }
            const zeile = noelkeZeile(p);
            if (i > -1) db.savedProdukteRaw[i] = zeile; else db.savedProdukteRaw.push(zeile);
            db.noelkeArtNr = db.noelkeArtNr || {};
            if (p.eigene_artikel_nr) db.noelkeArtNr[String(p.nr)] = p.eigene_artikel_nr;
            else delete db.noelkeArtNr[String(p.nr)];
        });

        // --- Stammdaten: reine Namenslisten --------------------------
        const namensListen = [
            ['lieferant', 'suppliers', 'name'],
            ['mitarbeiter', 'workers', 'name'],
            ['kunde', 'customers', 'name']
        ];
        namensListen.forEach(([tabelle, feld, schluessel]) => {
            (inhalte[tabelle] || []).forEach(z => {
                const name = z[schluessel];
                db[feld] = (db[feld] || []).filter(x => x !== name);
                if (!z.geloescht_am) db[feld].push(name);
                if (tabelle === 'lieferant') {
                    db.supplierNumbers = db.supplierNumbers || {};
                    if (!z.geloescht_am && z.nummer) db.supplierNumbers[name] = z.nummer;
                    else delete db.supplierNumbers[name];
                }
                if (tabelle === 'mitarbeiter') {
                    db.workerColors = db.workerColors || {};
                    if (!z.geloescht_am && z.farbe) db.workerColors[name] = z.farbe;
                    else delete db.workerColors[name];
                }
            });
        });

        // --- Lieferungen ---------------------------------------------
        (inhalte.lieferung || []).forEach(l => {
            db.deliveries = db.deliveries || [];
            if (l.geloescht_am) { tauscheInListe(db.deliveries, 'id', l.id, null); return; }
            const alt = db.deliveries.find(d => d.id === l.id);
            const neu = {
                id: l.id, date: l.datum, name: l.name, kg: Number(l.kg),
                source: l.quelle, isFullySorted: !!l.voll_sortiert,
                workerShares: alt ? (alt.workerShares || []) : []
            };
            if (l.export_kg !== null && l.export_kg !== undefined) neu.exportKg = Number(l.export_kg);
            if (l.uns_kg !== null && l.uns_kg !== undefined) neu.unsKg = Number(l.uns_kg);
            tauscheInListe(db.deliveries, 'id', l.id, neu);
        });

        // --- Sortier-Buchungen ---------------------------------------
        (inhalte.sortier_buchung || []).forEach(b => {
            db.teamSortierBuchungen = db.teamSortierBuchungen || [];
            if (b.geloescht_am) { tauscheInListe(db.teamSortierBuchungen, 'id', b.id, null); return; }
            tauscheInListe(db.teamSortierBuchungen, 'id', b.id, {
                id: b.id, datum: b.datum, lief: b.lieferant, sorte: b.sorte,
                sitzungId: b.sitzung_id, sessionKey: b.session_key, deliveryId: b.lieferung_id,
                gebuchtKg: b.gebucht_kg === null ? null : Number(b.gebucht_kg),
                letztesGewichtKg: b.letztes_gewicht_kg === null ? null : Number(b.letztes_gewicht_kg),
                letzterDruck: b.letzter_druck, herkunft: b.herkunft
            });
        });

        // --- Sonder-Vorlagen -----------------------------------------
        (inhalte.sonder_vorlage || []).forEach(v => {
            db.sonderTemplates = db.sonderTemplates || [];
            if (v.geloescht_am) { tauscheInListe(db.sonderTemplates, 'id', v.id, null); return; }
            tauscheInListe(db.sonderTemplates, 'id', v.id, {
                id: v.id, name: v.name, ean: v.ean, lief: v.lieferant,
                s_reihe: v.s_reihe, s_reihen: v.s_reihen, s_krtlage: v.s_krtlage,
                s_lagen: v.s_lagen, s_stk: v.s_stk, s_stke2: v.s_stke2, s_kg: v.s_kg
            });
        });

        // --- Tagessummen ---------------------------------------------
        (inhalte.tages_summe || []).forEach(t => {
            db.teamTagesMengen = db.teamTagesMengen || {};
            db.dailyStaff = db.dailyStaff || {};
            if (t.geloescht_am) { delete db.teamTagesMengen[t.datum]; delete db.dailyStaff[t.datum]; return; }
            db.teamTagesMengen[t.datum] = {
                gesamtKg: Number(t.gesamt_kg), exportKg: Number(t.export_kg),
                unsKg: Number(t.uns_kg), personalAnzahl: t.personal_anzahl
            };
            db.dailyStaff[t.datum] = t.personal_anzahl;
        });

        // --- Einstellungen -------------------------------------------
        (inhalte.einstellung || []).forEach(e => {
            db.settings = db.settings || {};
            db.company = db.company || {};
            if (e.schluessel === 'firma.name')         db.company.name = e.wert;
            else if (e.schluessel === 'firma.farbe')   db.company.color = e.wert;
            else if (e.schluessel === 'firma.leergut') db.company.leergut = e.wert;
            else if (e.schluessel === 'firma.module')  { try { db.company.modules = JSON.parse(e.wert); } catch (x) { /* stehen lassen */ } }
            else if (e.geloescht_am) delete db.settings[e.schluessel];
            else {
                const n = Number(e.wert);
                db.settings[e.schluessel] = (e.wert !== '' && e.wert !== null && !Number.isNaN(n)
                                             && /^-?\d+(\.\d+)?$/.test(String(e.wert))) ? n : e.wert;
            }
        });
    }

    /** Die drei Zuordnungstabellen frisch einsetzen (sie sind klein). */
    function patcheZuordnungen(db, zu) {
        if (zu.artikel_lieferant) {
            const proArtikel = {};
            zu.artikel_lieferant.forEach(z => { (proArtikel[z.fertig_nr] = proArtikel[z.fertig_nr] || []).push(z.lieferant); });
            (db.articles || []).forEach(a => { a.suppliers = proArtikel[a.fertigNr] || []; });
        }
        if (zu.lieferant_linie) {
            db.supplierLines = {};
            zu.lieferant_linie.forEach(z => { (db.supplierLines[z.lieferant] = db.supplierLines[z.lieferant] || []).push(z.linie); });
        }
        if (zu.lieferung_anteil) {
            const proLieferung = {};
            zu.lieferung_anteil.forEach(z => {
                (proLieferung[z.lieferung_id] = proLieferung[z.lieferung_id] || []).push({ name: z.mitarbeiter, kg: Number(z.kg) });
            });
            (db.deliveries || []).forEach(d => { d.workerShares = proLieferung[d.id] || []; });
        }
    }

    // -----------------------------------------------------------------
    // Schnappschuss: der Stand, gegen den beim Speichern verglichen wird.
    //
    // Bewusst flach und nur mit dem, was das Control Center wirklich
    // aendert. Alles hier drin wird beim Speichern verglichen -- was
    // fehlt, wuerde nie geschrieben.
    // -----------------------------------------------------------------
    let merker = null;

    function schnappschuss(db) {
        const s = { artikel: {}, noelke: {}, lieferanten: {}, mitarbeiter: {}, kunden: {},
                    lieferungen: {}, tage: {}, einstellungen: {},
                    // 2026-08-21 dazugekommen. Diese vier fehlten -- und dafuer gibt
                    // es Bedienknoepfe. Solange der Speichern-Knopf existierte, war
                    // das eine stille Luecke; seit daneben "Aenderungen gehen von
                    // selbst raus" steht, waere es eine Falschaussage: eingetippt,
                    // "gespeichert" gemeldet, beim naechsten Laden weg.
                    vorlagen: {}, checkliste: {}, nachrichten: {}, buchungen: {} };

        ['articles', 'todo', 'lose', 'later', 'hidden'].forEach(liste => {
            (db[liste] || []).forEach(a => {
                if (!a || !a.fertigNr) return;
                const nr = String(a.fertigNr);
                if (s.artikel[nr]) return;                 // in zwei Listen: die erste gewinnt
                s.artikel[nr] = {
                    name: a.name, originalName: a.originalName || null, nr: a.nr || '',
                    zustand: LISTE_ZU_ZUSTAND[liste],
                    markt: (db.artikelMarkt || {})[nr] || null,
                    tierart: (db.tierartZuordnung || {})[nr] || null,
                    lieferanten: (a.suppliers || []).slice().sort()
                };
            });
        });

        (db.savedProdukteRaw || []).forEach((zeile, i) => {
            const m = String(zeile).match(/^\[\s*Nr\.\s*(\d+)\s*\]\s*/i);
            if (!m) {
                // Sondereintrag ohne Nummer: bekommt eine gleichbleibende Ersatznummer
                // aus seiner Stelle in der Liste, damit er wiedererkannt wird.
                s.noelke['9' + String(900000 + i)] = { produkt: String(zeile).trim(), sondereintrag: true };
                return;
            }
            let rest = String(zeile).slice(m[0].length);
            let ean = '';
            const e = rest.match(/\s*\|\s*EAN:\s*(\d+)\s*$/i);
            if (e) { ean = e[1]; rest = rest.slice(0, e.index); }
            let groesse = '';
            const g = rest.match(/\s*\((\d+\s*g)\)\s*$/i);
            if (g) { groesse = g[1].replace(/\s+/g, ''); rest = rest.slice(0, g.index); }
            let marke = '', produkt = rest.trim();
            const t = produkt.indexOf(' - ');
            if (t > -1) { marke = produkt.slice(0, t).trim(); produkt = produkt.slice(t + 3).trim(); }
            s.noelke[m[1]] = { marke, produkt, groesse, ean,
                               eigeneArtNr: (db.noelkeArtNr || {})[m[1]] || null, sondereintrag: false };
        });

        (db.suppliers || []).forEach(l => { s.lieferanten[l] = { nummer: (db.supplierNumbers || {})[l] || null }; });
        (db.workers || []).forEach(w => { s.mitarbeiter[w] = { farbe: (db.workerColors || {})[w] || null }; });
        (db.customers || []).forEach(k => { s.kunden[k] = {}; });

        (db.deliveries || []).forEach(d => {
            if (!d || !d.id) return;
            s.lieferungen[d.id] = {
                datum: d.date, name: d.name || null, kg: parseFloat(d.kg) || 0,
                exportKg: d.exportKg === undefined ? null : parseFloat(d.exportKg),
                unsKg: d.unsKg === undefined ? null : parseFloat(d.unsKg),
                quelle: d.source || null, vollSortiert: !!d.isFullySorted,
                anteile: (d.workerShares || []).map(w => ({ mitarbeiter: w.name, kg: parseFloat(w.kg) || 0 }))
                          .sort((a, b) => String(a.mitarbeiter).localeCompare(String(b.mitarbeiter)))
            };
        });

        Object.entries(db.teamTagesMengen || {}).forEach(([tag, t]) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return;
            s.tage[tag] = {
                gesamtKg: parseFloat(t.gesamtKg) || 0, exportKg: parseFloat(t.exportKg) || 0,
                unsKg: parseFloat(t.unsKg) || 0,
                personal: parseInt((db.dailyStaff || {})[tag], 10) || parseInt(t.personalAnzahl, 10) || 0
            };
        });

        Object.entries(db.settings || {}).forEach(([k, v]) => { s.einstellungen[k] = String(v); });
        if (db.company) {
            s.einstellungen['firma.name']    = String(db.company.name || '');
            s.einstellungen['firma.farbe']   = String(db.company.color || '');
            s.einstellungen['firma.leergut'] = String(db.company.leergut || '');
            s.einstellungen['firma.module']  = JSON.stringify(db.company.modules || {});
        }
        // --- Sonder-Vorlagen (Scanner-Vorlagen der Rechner-App) ------
        (db.sonderTemplates || []).forEach(v => {
            if (!v || v.id == null) return;
            s.vorlagen[String(v.id)] = {
                name: String(v.name || ''), ean: v.ean || null, lieferant: v.lief || null,
                s_reihe: v.sReihe || null, s_reihen: v.sReihen || null,
                s_krtlage: v.sKrtLage || null, s_lagen: v.sLagen || null,
                s_stk: v.sStk || null, s_stke2: v.sStkE2 || null, s_kg: v.sKg || null
            };
        });

        // --- Checkliste morgens --------------------------------------
        (db.checklistMorningTemplate || []).forEach((z, i) => {
            const id = String((z && z.id) != null ? z.id : 'ck' + i);
            s.checkliste[id] = { text: String((z && z.text) || z || ''), reihenfolge: i };
        });

        // --- Tagesnachricht ans Team ---------------------------------
        const brief = db.teamDayBrief;
        if (brief && brief.date) {
            s.nachrichten[String(brief.date)] = {
                nachricht: brief.message || null,
                aufgaben: Array.isArray(brief.tasks) ? brief.tasks : []
            };
        }

        // --- Sortier-Buchungen ---------------------------------------
        // Angelegt werden sie von den Handys (ueber die Bruecke). Das Control
        // Center aendert sie nur -- vor allem beim Loeschen. Ohne sie hier
        // wirkte ein Loeschen im Buero ueberhaupt nicht.
        const wegMarken = new Set((db.deletedSortierBuchungen || []).map(String));
        (db.teamSortierBuchungen || []).forEach(b => {
            if (!b || !b.datum) return;
            const id = String(b.id || ((b.sessionKey || '') + '|' + b.datum));
            if (typeof istSortierBuchungGeloescht === 'function'
                && istSortierBuchungGeloescht(b, wegMarken)) return;
            s.buchungen[id] = {
                datum: b.datum, lieferant: b.lief || null, sorte: b.sorte || null,
                sitzung_id: b.sitzungId || null, session_key: b.sessionKey || null,
                lieferung_id: b.deliveryId || null,
                gebucht_kg: b.gebuchtKg == null ? null : Number(b.gebuchtKg),
                letztes_gewicht_kg: b.letztesGewichtKg == null ? null : Number(b.letztesGewichtKg),
                letzter_druck: b.letzterDruck || null, herkunft: b.herkunft || null
            };
        });

        return s;
    }

    // -----------------------------------------------------------------
    // Verbindung
    // -----------------------------------------------------------------
    // =====================================================================
    //  DIE ZWEITE BETRIEBSART — dieselbe App, andere Gegenstelle
    //  2026-08-21
    //
    //  Auf dem Firmenserver laeuft unsere eigene Schnittstelle (daten_api.js)
    //  unter /api/daten/…. In der Supabase-Cloud gibt es die nicht -- dort
    //  steht PostgREST, das je Tabelle eine eigene Adresse hat.
    //
    //  Statt die App an 13 Stellen umzubauen, wird nur HIER uebersetzt. Alles
    //  darueber (ladeAllesV2, schreibeAenderungenV2, …) bleibt Wort fuer Wort,
    //  wie es ist -- und laeuft damit auf beiden Gegenstellen gleich. Das ist
    //  wichtig, weil genau dieser Code beim Servertermin weiterlaufen soll:
    //  Was hier in der Cloud geprueft wird, ist derselbe Code, der spaeter auf
    //  dem Server laeuft. Nur die Uebersetzung darunter faellt dann weg.
    //
    //  DREI UNTERSCHIEDE, DIE MAN KENNEN MUSS
    //  --------------------------------------
    //   1. Unser Server buendelt. /alles liefert 15 Tabellen in einer Antwort,
    //      PostgREST braucht 15 Abrufe. Die werden hier gleichzeitig gestartet.
    //   2. Unser Server kennt das Geraet aus der Kopfzeile x-geraet und setzt
    //      geaendert_von selbst. Bei PostgREST muss es in die Daten hinein.
    //   3. Unser Server setzt beim Wiederanlegen geloescht_am zurueck. Ohne das
    //      bliebe ein wieder angelegter Datensatz als geloescht markiert --
    //      genau der Fall "Herta" vom selben Tag. Deshalb steht es unten
    //      ausdruecklich drin.
    // =====================================================================
    const CLOUD_TABELLEN = [
        'artikel', 'noelke_produkt', 'lieferant', 'mitarbeiter', 'kunde',
        'lieferung', 'sortier_buchung', 'sonder_vorlage', 'einstellung',
        'tages_summe', 'checkliste_morgens', 'tagesnachricht'
    ];
    const CLOUD_ZUORDNUNGEN = ['artikel_lieferant', 'lieferant_linie', 'lieferung_anteil'];

    function cloudKopf(zusatz) {
        return Object.assign({
            'apikey': schluessel,
            'Authorization': 'Bearer ' + schluessel,
            'Content-Type': 'application/json'
        }, zusatz || {});
    }

    /**
     * 2026-08-21, beim ersten Cloudtest aufgefallen und beinahe uebersehen:
     * PostgREST liefert von sich aus HOECHSTENS 1000 ZEILEN.
     *
     * Der erste Lauf holte 3.669 Sortier-Buchungen -- und lieferte 1.000. Ohne
     * Meldung, ohne Fehler, einfach abgeschnitten. Genau die Sorte Fehler, die
     * hier nie wieder passieren darf: Daten waeren verschwunden, und die Seite
     * haette munter weitergerechnet.
     *
     * Deshalb wird geblaettert, bis weniger als ein voller Block zurueckkommt.
     * Die Sortierung ist dabei Pflicht: ohne feste Reihenfolge koennte
     * zwischen zwei Bloecken dieselbe Zeile zweimal kommen und eine andere gar
     * nicht. Sortiert wird nach dem Primaerschluessel -- der ist eindeutig.
     */
    const CLOUD_SORTIERUNG = {
        artikel: 'fertig_nr', noelke_produkt: 'nr', lieferant: 'name',
        mitarbeiter: 'name', kunde: 'name', lieferung: 'id',
        sortier_buchung: 'id', sonder_vorlage: 'id', einstellung: 'schluessel',
        tages_summe: 'datum', checkliste_morgens: 'id', tagesnachricht: 'datum',
        aenderung: 'stand_nr',
        artikel_lieferant: 'fertig_nr,lieferant',
        lieferant_linie: 'lieferant,linie',
        lieferung_anteil: 'lieferung_id,mitarbeiter'
    };
    const CLOUD_BLOCK = 1000;

    async function cloudHolen(pfad) {
        const tabelle = pfad.split('?')[0];
        const sortierung = CLOUD_SORTIERUNG[tabelle];
        const trenner = pfad.indexOf('?') >= 0 ? '&' : '?';
        const hatOrder = pfad.indexOf('order=') >= 0;

        const alles = [];
        for (let versatz = 0; ; versatz += CLOUD_BLOCK) {
            let adresse = basis + '/rest/v1/' + pfad + trenner
                + 'limit=' + CLOUD_BLOCK + '&offset=' + versatz;
            if (sortierung && !hatOrder) adresse += '&order=' + sortierung;

            const antwort = await fetch(adresse, { headers: cloudKopf() });
            if (!antwort.ok) {
                const t = await antwort.text().catch(() => '');
                throw new Error('Cloud antwortet ' + antwort.status + (t ? ': ' + t.slice(0, 200) : ''));
            }
            const teil = await antwort.json();
            if (!Array.isArray(teil)) return teil;          // Einzelantwort, kein Blaettern
            alles.push(...teil);
            if (teil.length < CLOUD_BLOCK) return alles;    // letzter Block
        }
    }

    async function cloudSchreiben(pfad, methode, koerper, zusatzKopf) {
        const antwort = await fetch(basis + '/rest/v1/' + pfad, {
            method: methode,
            headers: cloudKopf(zusatzKopf),
            body: koerper === undefined ? undefined : JSON.stringify(koerper)
        });
        if (!antwort.ok) {
            const t = await antwort.text().catch(() => '');
            throw new Error('Cloud antwortet ' + antwort.status + (t ? ': ' + t.slice(0, 200) : ''));
        }
        return antwort.status === 204 ? {} : antwort.json().catch(() => ({}));
    }

    /** Hoechste laufende Nummer -- das Gegenstueck zu GET /api/daten/stand. */
    async function cloudStand() {
        const r = await cloudHolen('aenderung?select=stand_nr&order=stand_nr.desc&limit=1');
        return r.length ? Number(r[0].stand_nr) : 0;
    }

    /**
     * Uebersetzt einen Aufruf an unsere Schnittstelle in einen oder mehrere
     * PostgREST-Aufrufe. Die Antwort hat exakt dieselbe Form wie die unseres
     * Servers -- daran haengt, dass darueber nichts geaendert werden muss.
     */
    async function rufCloud(weg, o) {
        const pfad = weg.replace(/^\/api\/daten\/?/, '');
        const teile = pfad.split('?')[0].split('/').filter(Boolean);
        const methode = o.method || 'GET';

        // --- Wo stehen wir? ------------------------------------------
        if (methode === 'GET' && teile[0] === 'stand') {
            return { stand: await cloudStand() };
        }

        // --- Voller Bestand ------------------------------------------
        if (methode === 'GET' && teile[0] === 'alles') {
            const daten = {};
            const alle = CLOUD_TABELLEN.concat(CLOUD_ZUORDNUNGEN);
            // Gleichzeitig statt nacheinander: 15 Abrufe hintereinander waeren
            // ueber das Internet spuerbar langsam.
            const ergebnisse = await Promise.all(alle.map(t => cloudHolen(
                CLOUD_ZUORDNUNGEN.includes(t)
                    ? t + '?select=*'
                    : t + '?select=*&geloescht_am=is.null'
            )));
            alle.forEach((t, i) => { daten[t] = ergebnisse[i]; });
            return { stand: await cloudStand(), daten };
        }

        // --- Nur was sich geaendert hat -------------------------------
        if (methode === 'GET' && teile[0] === 'seit') {
            const seit = Number(teile[1]);
            const aenderungen = await cloudHolen(
                'aenderung?select=stand_nr,tabelle,datensatz_id,art,geaendert_am,geaendert_von'
                + '&stand_nr=gt.' + seit + '&order=stand_nr');
            const inhalte = {};
            const betroffen = [...new Set(aenderungen.map(a => a.tabelle))]
                .filter(t => CLOUD_TABELLEN.includes(t));
            // Auch Geloeschtes kommt mit -- sonst wuesste das Fenster nicht,
            // dass es die Zeile bei sich wegnehmen soll.
            const ergebnisse = await Promise.all(
                betroffen.map(t => cloudHolen(t + '?select=*&stand_nr=gt.' + seit)));
            betroffen.forEach((t, i) => { inhalte[t] = ergebnisse[i]; });
            const stand = aenderungen.length
                ? Number(aenderungen[aenderungen.length - 1].stand_nr) : seit;
            return { stand, aenderungen, inhalte };
        }

        // --- Die drei Zuordnungstabellen ------------------------------
        if (methode === 'GET' && teile[0] === 'zuordnungen') {
            const daten = {};
            const ergebnisse = await Promise.all(CLOUD_ZUORDNUNGEN.map(t => cloudHolen(t + '?select=*')));
            CLOUD_ZUORDNUNGEN.forEach((t, i) => { daten[t] = ergebnisse[i]; });
            return daten;
        }

        // --- Lieferanten eines Artikels / Anteile einer Lieferung -----
        // Beides ist "erst leeren, dann neu schreiben". Bei unserem Server
        // steckt das in einer Transaktion; hier laeuft es in zwei Schritten.
        // Das ist vertretbar, weil dazwischen nur diese eine Zuordnung leer
        // ist -- der Artikel selbst und alle Mengen bleiben unberuehrt.
        if (methode === 'POST' && teile[0] === 'artikel' && teile[2] === 'lieferanten') {
            const nr = decodeURIComponent(teile[1]);
            await cloudSchreiben('artikel_lieferant?fertig_nr=eq.' + encodeURIComponent(nr), 'DELETE');
            const liste = (o.body || []).map(l => ({ fertig_nr: nr, lieferant: l }));
            if (liste.length) await cloudSchreiben('artikel_lieferant', 'POST', liste,
                { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
            return {};
        }
        if (methode === 'POST' && teile[0] === 'lieferung' && teile[2] === 'anteile') {
            const id = decodeURIComponent(teile[1]);
            await cloudSchreiben('lieferung_anteil?lieferung_id=eq.' + encodeURIComponent(id), 'DELETE');
            const liste = (o.body || []).map(a => ({
                lieferung_id: id, mitarbeiter: a.name, kg: a.kg
            }));
            if (liste.length) await cloudSchreiben('lieferung_anteil', 'POST', liste,
                { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
            return {};
        }

        // --- Einen Datensatz anlegen oder aendern ---------------------
        if (methode === 'POST' && CLOUD_TABELLEN.includes(teile[0]) && teile.length === 1) {
            const zeile = Object.assign({}, o.body, {
                geaendert_von: geraet,
                // Wiederangelegtes ist nicht mehr geloescht. Ohne diese Zeile
                // bliebe der Grabstein stehen -- siehe Kopf dieses Abschnitts.
                geloescht_am: null
            });
            await cloudSchreiben(teile[0], 'POST', [zeile],
                { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
            return { stand: await cloudStand() };
        }

        // --- Loeschen heisst: Grabstein setzen ------------------------
        // Endgueltiges Loeschen ist in der Cloud durch die Zugriffsregeln
        // gesperrt. Gesetzt wird geloescht_am -- genau wie es unser Server tut.
        if (methode === 'DELETE' && CLOUD_TABELLEN.includes(teile[0]) && teile[1]) {
            const bau = TABELLEN_SCHLUESSEL[teile[0]];
            const id = decodeURIComponent(teile[1]);
            await cloudSchreiben(
                teile[0] + '?' + bau + '=eq.' + encodeURIComponent(id), 'PATCH',
                { geloescht_am: new Date().toISOString(), geaendert_von: geraet },
                { 'Prefer': 'return=minimal' });
            return { stand: await cloudStand() };
        }

        throw new Error('Dieser Weg ist in der Cloud-Betriebsart nicht vorgesehen: ' + methode + ' ' + weg);
    }

    /** Erste Spalte des Primaerschluessels je Tabelle -- fuers Loeschen. */
    const TABELLEN_SCHLUESSEL = {
        artikel: 'fertig_nr', noelke_produkt: 'nr', lieferant: 'name',
        mitarbeiter: 'name', kunde: 'name', lieferung: 'id',
        sortier_buchung: 'id', sonder_vorlage: 'id', einstellung: 'schluessel',
        tages_summe: 'datum', checkliste_morgens: 'id', tagesnachricht: 'datum'
    };

    async function ruf(weg, optionen) {
        const o = optionen || {};
        if (cloudModus) return rufCloud(weg, o);
        const antwort = await fetch(basis + weg, {
            method: o.method || 'GET',
            headers: Object.assign({
                'Content-Type': 'application/json',
                'x-geraet': geraet
            }, schluessel ? { 'x-zugriff': schluessel } : {}),
            body: o.body ? JSON.stringify(o.body) : undefined
        });
        if (!antwort.ok) {
            const t = await antwort.text().catch(() => '');
            throw new Error('Server antwortet ' + antwort.status + (t ? ': ' + t.slice(0, 200) : ''));
        }
        return antwort.json();
    }

    return {
        aktiv: false,
        get stand() { return stand; },
        get geraetName() { return geraet; },

        /** Einmalig beim Start einrichten. */
        einrichten(einstellungen) {
            basis = String(einstellungen.basis || '').replace(/\/+$/, '');
            schluessel = einstellungen.schluessel || '';
            geraet = einstellungen.geraet || 'unbekannt';
            beiAenderung = einstellungen.beiAenderung || null;
            // 2026-08-21: Zweite Betriebsart -- siehe "DIE ZWEITE BETRIEBSART"
            // weiter unten. true = die Cloud spricht PostgREST statt unserer
            // eigenen Schnittstelle.
            cloudModus = einstellungen.cloud === true;
            this.aktiv = !!basis;
            return this.aktiv;
        },

        /** Vollen Bestand holen und daraus das gewohnte db-Objekt bauen. */
        async ladeAllesV2(zielDb) {
            const antwort = await ruf('/api/daten/alles');
            stand = antwort.stand || 0;
            return bauDb(antwort.daten || {}, zielDb);
        },

        /**
         * Nur nachholen, was seit unserem Stand passiert ist -- und dabei
         * nur die betroffenen Zeilen austauschen.
         *
         * 2026-08-20: Hier stand zuerst "den ganzen Bestand neu holen".
         * Das war einfach, aber teuer (rund 2 MB je Aenderung) und hatte
         * einen unschoenen Nebeneffekt: das Neuaufbauen machte die
         * Zurechtrueckungen des Control Centers rueckgaengig, die es dann
         * beim naechsten Zeichnen erneut vornahm und erneut schickte.
         * Jetzt wird gezielt getauscht -- der Rest von `db` bleibt, wie er ist.
         */
        async holeNachV2(zielDb) {
            const antwort = await ruf('/api/daten/seit/' + stand);
            if (!antwort.aenderungen || !antwort.aenderungen.length) return null;
            stand = antwort.stand || stand;
            const inhalte = antwort.inhalte || {};

            const beruehrt = new Set(antwort.aenderungen.map(a => a.tabelle));
            patcheDb(zielDb, inhalte);

            // Zuordnungen haengen am Elternteil und stehen nicht in /seit.
            // Nur holen, wenn ein Elternteil dabei war.
            if (beruehrt.has('artikel') || beruehrt.has('lieferung') || beruehrt.has('lieferant')) {
                const zu = await ruf('/api/daten/zuordnungen');
                patcheZuordnungen(zielDb, zu);
            }
            return antwort.aenderungen;
        },

        /** EINEN Datensatz schreiben. Kein Paket, kein Überschreiben von Nachbarn. */
        async schreibeV2(art, datensatz, liste) {
            const bauer = NACH_TABELLE[art === 'noelke' ? 'noelke' : art];
            if (!bauer) throw new Error('Unbekannte Art: ' + art);
            const tabelle = art === 'noelke' ? 'noelke_produkt' : art;
            const antwort = await ruf('/api/daten/' + tabelle, { method: 'POST', body: bauer(datensatz, liste) });
            stand = antwort.stand || stand;
            return antwort;
        },

        /** EINEN Datensatz löschen -- setzt den Grabstein, wirft nichts weg. */
        async loescheV2(tabelle, id) {
            const antwort = await ruf('/api/daten/' + tabelle + '/' + encodeURIComponent(id), { method: 'DELETE' });
            stand = antwort.stand || stand;
            return antwort;
        },

        /**
         * Mithören. Ab hier kommen Änderungen von selbst an -- kein
         * "Aus Cloud laden", kein "In Cloud speichern".
         *
         * EventSource verbindet sich von allein wieder, wenn das Netz
         * kurz weg war. Beim Wiederkommen holen wir nach, was fehlt --
         * das ist genau die Stelle, an der ein Fenster nach der Pause
         * ZUERST liest und erst danach schreiben darf.
         */
        starteLiveV2(zielDb, beiLiveStatus) {
            if (!this.aktiv) return false;

            // -------------------------------------------------------------
            // 2026-08-21: In der Cloud gibt es unseren Live-Kanal nicht.
            //
            // Der Kanal auf dem Firmenserver haengt an pg_notify -- die
            // Datenbank weckt den Server, der Server weckt die Fenster. Ueber
            // PostgREST gibt es diesen Weg nicht.
            //
            // Statt dessen wird im Takt gefragt: "was ist seit meiner Nummer
            // passiert?" Das ist ein winziger Abruf (nur das Protokoll, meist
            // null Zeilen) und reicht fuer zwei, drei Leute im Buero voellig.
            //
            // Bewusst KEIN Realtime ueber WebSocket: das braeuchte die
            // Supabase-Bibliothek, und die darf in die Firmenserver-Fassung
            // nicht hinein -- der Server hat kein Internet. Ein Abruf im Takt
            // kostet nichts und faellt beim Servertermin ersatzlos weg.
            // -------------------------------------------------------------
            if (cloudModus) {
                if (abrufTakt) clearInterval(abrufTakt);
                if (beiSichtbar) document.removeEventListener('visibilitychange', beiSichtbar);
                let laeuft = false;
                const einmalFragen = async (auchImHintergrund) => {
                    // Im Hintergrund wird nicht gefragt -- ein Fenster, das seit
                    // Stunden hinter anderen liegt, muss die Leitung nicht belasten.
                    if (laeuft || (document.hidden && !auchImHintergrund)) return;
                    laeuft = true;
                    try {
                        const aenderungen = await this.holeNachV2(zielDb);
                        if (!liveSteht) { liveSteht = true; if (beiLiveStatus) beiLiveStatus(true); }
                        if (aenderungen && aenderungen.length && beiAenderung) beiAenderung(aenderungen);
                    } catch (e) {
                        // 2026-08-21: Der Grund MUSS sichtbar sein. Vorher stand
                        // hier nur "liveSteht = false" -- bei falschem Schluessel,
                        // fehlender Tabelle oder 401 sah man "Live-Kanal getrennt"
                        // und sonst nichts, auch nicht in der Konsole. Suchen im
                        // Dunkeln. Der EventSource-Zweig daneben macht es richtig.
                        console.warn('[DatenV2] Abruf fehlgeschlagen:', e && e.message ? e.message : e);
                        if (liveSteht && beiLiveStatus) beiLiveStatus(false);
                        liveSteht = false;
                    } finally { laeuft = false; }
                };
                // 2026-08-21, beim ersten Cloudtest aufgefallen: Der Takt schwieg,
                // weil das Fenster im Hintergrund lag. Richtig so -- aber dann muss
                // es beim Zurueckkommen SOFORT nachholen, nicht erst beim naechsten
                // Takt. Sonst tippt jemand in einem Fenster weiter, das seit Stunden
                // nichts mitbekommen hat. Genau davor schuetzt Riegel 1 der
                // Datenquelle ("erst laden, dann schreiben") -- der greift aber nur
                // beim Oeffnen, nicht beim Zurueckwechseln.
                beiSichtbar = () => { if (!document.hidden) einmalFragen(true); };
                document.addEventListener('visibilitychange', beiSichtbar);

                abrufTakt = setInterval(einmalFragen, ABRUF_MS);
                einmalFragen(true);      // beim Start einmal, auch wenn gerade verdeckt
                return true;
            }

            if (typeof EventSource === 'undefined') return false;
            if (liveKanal) { try { liveKanal.close(); } catch (e) { /* egal */ } }

            // 2026-08-20: Der Schluessel muss in die Adresse.
            // EventSource kann keine eigenen Kopfzeilen mitschicken -- ohne das
            // hier antwortet der Server mit 401 und der Kanal steht nie. Genau
            // das ist beim Scharfschalten der Testumgebung passiert: die Seite
            // meldete "Aenderungen kommen von selbst an", und nichts kam an.
            // Serverseite: daten_api.js, Abschnitt "Zugriffsschluessel pruefen".
            const adresse = basis + '/api/daten/live'
                + (schluessel ? '?zugriff=' + encodeURIComponent(schluessel) : '');
            liveKanal = new EventSource(adresse);

            // Ehrliche Rueckmeldung: erst wenn der Kanal WIRKLICH steht, darf
            // irgendwo "kommt von selbst an" stehen. Faellt er weg, muss das
            // sichtbar werden -- sonst tippt jemand weiter und glaubt, die
            // anderen sehen es.
            liveSteht = false;
            liveKanal.onopen  = () => { liveSteht = true;  if (beiLiveStatus) beiLiveStatus(true); };

            // 2026-08-20: Meldungen werden gebuendelt.
            //
            // Ohne das holt JEDE einzelne Meldung den vollen Bestand neu. Beim
            // ersten Testlauf kamen nach einer fremden Aenderung rund 20
            // Meldungen dicht hintereinander (das Control Center schreibt beim
            // Neuzeichnen ein paar Lieferungen zurecht) -- der Browser hat mit
            // ERR_INSUFFICIENT_RESOURCES aufgegeben.
            //
            // Jetzt wird nach der letzten Meldung kurz gewartet und dann EINMAL
            // nachgeholt. Aus 20 Abrufen wird einer.
            let sammelTimer = null;
            const nachholenGebuendelt = () => {
                if (sammelTimer) clearTimeout(sammelTimer);
                sammelTimer = setTimeout(async () => {
                    sammelTimer = null;
                    try {
                        const aenderungen = await this.holeNachV2(zielDb);
                        if (aenderungen && beiAenderung) beiAenderung(aenderungen);
                    } catch (e) {
                        console.warn('Live-Nachholen fehlgeschlagen:', e.message);
                    }
                }, 400);
            };
            liveKanal.onmessage = nachholenGebuendelt;
            liveKanal.onerror = () => {
                // EventSource versucht es von selbst wieder. Gemeldet wird es
                // trotzdem, damit niemand im Glauben weiterarbeitet, seine
                // Aenderungen kaemen bei den anderen an.
                if (liveSteht && beiLiveStatus) beiLiveStatus(false);
                liveSteht = false;
            };
            return true;
        },

        get liveSteht() { return liveSteht; },

        beendeLiveV2() {
            if (liveKanal) { try { liveKanal.close(); } catch (e) { /* egal */ } liveKanal = null; }
            if (abrufTakt) { clearInterval(abrufTakt); abrufTakt = null; }
            if (beiSichtbar) { document.removeEventListener('visibilitychange', beiSichtbar); beiSichtbar = null; }
            liveSteht = false;
        },

        // =============================================================
        // SCHREIBEN: erst vergleichen, dann nur das Geaenderte schicken
        //
        // Das Control Center aendert `db` an hundert Stellen und ruft
        // danach renderAll(). Es sagt nirgends, WAS sich geaendert hat.
        // Statt alle Stellen umzuschreiben, merkt sich die Datenschicht
        // den Stand nach dem Laden und vergleicht beim Speichern.
        //
        // Ergebnis: aus "1,55 MB hochladen" werden ein paar hundert Byte
        // fuer genau den einen Datensatz, den jemand angefasst hat.
        // =============================================================

        /** Nach dem Laden (und nach jedem Speichern) den Stand merken. */
        merkeStand(db) {
            merker = schnappschuss(db);
            return merker;
        },

        /**
         * Vergleicht den jetzigen Stand mit dem gemerkten und schreibt die
         * Unterschiede -- einzeln. Gibt zurueck, was geschrieben wurde.
         */
        /**
         * optionen.loeschen (Standard: FALSE)
         *
         * 2026-08-20, beim ersten Testlauf gefunden: Schon das OEFFNEN der
         * Seite hat zwei Lieferungen geloescht. Nicht weil jemand etwas
         * angeklickt haette -- das Control Center raeumt beim Start selbst
         * auf (ensureSortierenDeliveries, bereinigeGeloeschteSortierDeliveries),
         * und das automatische Speichern hat daraus echte Loeschungen gemacht.
         *
         * Deshalb: das automatische Speichern LOESCHT NIE. Es legt an und
         * aendert. Was nach Loeschen aussieht, wird nur gemeldet und erst
         * ausgefuehrt, wenn jemand ausdruecklich speichert. Sonst waere
         * genau das wieder da, was wir loswerden wollten: Daten
         * verschwinden, ohne dass jemand sie geloescht hat.
         */
        async schreibeAenderungenV2(db, optionen) {
            const opt = optionen || {};
            const jetzt = schnappschuss(db);
            const vorher = merker || {};
            const getan = [];
            const wuerdeLoeschen = [];

            // =============================================================
            // 2026-08-21: DER UNTERSCHIED ZWISCHEN "GELOESCHT" UND "FEHLT".
            //
            // Bis heute konnte diese Stelle beides nicht auseinanderhalten und
            // hat deshalb bei allem nachgefragt, was gegenueber dem letzten
            // Stand fehlte. Diese Rueckfrage steckte hinter dem Knopf "In
            // Cloud speichern" -- er war der einzige Weg, ueberhaupt etwas zu
            // loeschen.
            //
            // Dabei weiss das Programm es laengst: beim Loeschen wird ein
            // Grabstein gesetzt (db.deletedArticles, db.deletedSuppliers, …).
            // Das ist eine Absichtserklaerung. Fehlt der Grabstein, ist es kein
            // Loeschen, sondern eine Luecke -- und die wird nie angefasst.
            //
            //   Grabstein da   -> geht sofort raus, ohne Nachfrage
            //   kein Grabstein -> bleibt stehen, wird nur gemeldet
            //
            // Damit ist der Knopf ueberfluessig, ohne dass Loeschen unmoeglich
            // wird. Und es ist genau Roberts Regel: "Es ist Bloedsinn zu sagen,
            // meine Version hat weniger als deine, deswegen schmeiss ich die
            // raus." Weniger allein ist kein Grund. Ein Grabstein schon.
            // =============================================================
            const alsText = (liste) => new Set((Array.isArray(liste) ? liste : []).map(x => String(x).trim()).filter(Boolean));
            const grabstein = {
                artikel:        alsText(db.deletedArticles),
                // Die Noelke-Grabsteine stehen als "nr:38" bzw. "text:…" in der Liste
                // (siehe noelkeGrabsteinKey). Hier ist die Kennung die blanke Nummer,
                // deshalb wird das Praefix abgeschnitten. Ein "text:"-Grabstein hat
                // keine Nummer und kann hier folglich nichts loeschen -- richtig so:
                // ohne Nummer ist der Datensatz nicht eindeutig zuzuordnen.
                noelke_produkt: new Set([...alsText(db.deletedNoelke)]
                    .filter(k => k.startsWith('nr:'))
                    .map(k => k.slice(3))),
                lieferant:      alsText(db.deletedSuppliers),
                mitarbeiter:    alsText(db.deletedWorkers),
                kunde:          new Set(),      // im Control Center gibt es kein Kunden-Loeschen
                lieferung:      alsText(db.deletedLieferungen),
                // Sortier-Buchungen tragen ihre Loeschmarke schon lange selbst
                // (db.deletedSortierBuchungen, Format "sessionKey|datum").
                // Der Schnappschuss laesst geloeschte Buchungen bereits weg --
                // hier steht die Kennung, damit das Loeschen auch durchgeht.
                sortier_buchung: alsText(db.deletedSortierBuchungen),
                sonder_vorlage:  alsText(db.deletedSonderTemplates),
                // Checkliste und Tagesnachricht kennen kein Loeschen ueber einen
                // Grabstein -- dort wird die Zeile aus der Liste genommen und der
                // Rest neu geschrieben. Ohne Grabstein wird nichts geloescht.
                checkliste_morgens: new Set(),
                tagesnachricht:     new Set()
            };
            /** Darf dieser Datensatz jetzt geloescht werden? */
            const darfWeg = (tabelle, id) =>
                opt.loeschen === true || (grabstein[tabelle] && grabstein[tabelle].has(String(id).trim()));

            // --- Artikel (fuenf Listen + Markt + Tierart in einer Zeile) ---
            for (const [nr, a] of Object.entries(jetzt.artikel)) {
                const alt = (vorher.artikel || {})[nr];
                if (alt && JSON.stringify(alt) === JSON.stringify(a)) continue;
                await ruf('/api/daten/artikel', { method: 'POST', body: {
                    fertig_nr: nr, name: a.name, original_name: a.originalName || null,
                    roh_nr: a.nr || null, zustand: a.zustand,
                    markt: a.markt || null, tierart: a.tierart || null
                }});
                getan.push((alt ? 'geändert' : 'neu') + ': Artikel ' + nr);
                // Lieferanten des Artikels nur schicken, wenn sie sich unterscheiden
                if (!alt || JSON.stringify(alt.lieferanten) !== JSON.stringify(a.lieferanten)) {
                    await ruf('/api/daten/artikel/' + encodeURIComponent(nr) + '/lieferanten',
                              { method: 'POST', body: a.lieferanten });
                }
            }
            for (const nr of Object.keys(vorher.artikel || {})) {
                if (jetzt.artikel[nr]) continue;
                if (!darfWeg('artikel', nr)) { wuerdeLoeschen.push('Artikel ' + nr); jetzt.artikel[nr] = vorher.artikel[nr]; continue; }
                await this.loescheV2('artikel', nr);
                getan.push('gelöscht: Artikel ' + nr);
            }

            // --- Nölke-Katalog ---------------------------------------
            for (const [nr, p] of Object.entries(jetzt.noelke)) {
                const alt = (vorher.noelke || {})[nr];
                if (alt && JSON.stringify(alt) === JSON.stringify(p)) continue;
                await ruf('/api/daten/noelke_produkt', { method: 'POST', body: {
                    nr: Number(nr), marke: p.marke || null, produkt: p.produkt,
                    groesse: p.groesse || null, ean: p.ean || null,
                    eigene_artikel_nr: p.eigeneArtNr || null, sondereintrag: !!p.sondereintrag
                }});
                getan.push((alt ? 'geändert' : 'neu') + ': Nölke Nr. ' + nr);
            }
            for (const nr of Object.keys(vorher.noelke || {})) {
                if (jetzt.noelke[nr]) continue;
                if (!darfWeg('noelke_produkt', nr)) { wuerdeLoeschen.push('Nölke Nr. ' + nr); jetzt.noelke[nr] = vorher.noelke[nr]; continue; }
                await this.loescheV2('noelke_produkt', nr);
                getan.push('gelöscht: Nölke Nr. ' + nr);
            }

            // --- Einfache Listen: Lieferanten, Mitarbeiter, Kunden ----
            const einfach = [
                ['lieferant', 'lieferanten', (n, w) => ({ name: n, nummer: w.nummer || null })],
                ['mitarbeiter', 'mitarbeiter', (n, w) => ({ name: n, farbe: w.farbe || null })],
                ['kunde', 'kunden', (n) => ({ name: n })]
            ];
            for (const [tabelle, feld, bau] of einfach) {
                for (const [name, wert] of Object.entries(jetzt[feld])) {
                    const alt = (vorher[feld] || {})[name];
                    if (alt && JSON.stringify(alt) === JSON.stringify(wert)) continue;
                    await ruf('/api/daten/' + tabelle, { method: 'POST', body: bau(name, wert) });
                    getan.push((alt ? 'geändert' : 'neu') + ': ' + tabelle + ' ' + name);
                }
                for (const name of Object.keys(vorher[feld] || {})) {
                    if (jetzt[feld][name]) continue;
                    if (!darfWeg(tabelle, name)) { wuerdeLoeschen.push(tabelle + ' ' + name); jetzt[feld][name] = vorher[feld][name]; continue; }
                    await this.loescheV2(tabelle, name);
                    getan.push('gelöscht: ' + tabelle + ' ' + name);
                }
            }

            // =============================================================
            // 2026-08-21: MENGEN SCHRUMPFEN NICHT VON SELBST.
            //
            // Das Control Center rechnet beim OEFFNEN Lieferungen und
            // Tagessummen aus den Buchungen neu -- niemand hat etwas
            // angeklickt. Faellt dabei ein Wert kleiner aus als der
            // gespeicherte, war das bisher folgenlos: beim Hochladen nahm
            // mergeLieferungen() je Feld Math.max, ein kleinerer Wert kam gar
            // nicht erst durch (gemeinsam/metriken.js).
            //
            // Im neuen Schreibweg fehlte dieser Schutz -- und hier wird ohne
            // Knopfdruck gespeichert. Am echten Bestand nachgerechnet waeren
            // das 17 Lieferungen (-8.539 kg) und 13 Tagessummen (-81.533 kg)
            // gewesen, davon neun Tage auf glatt 0. Sieben Tage Anfang Juni
            // tragen Mengen, zu denen es ueberhaupt keine Buchungen gibt --
            // vermutlich von Hand eingetragen. Die waeren weg gewesen.
            //
            // Also dieselbe Regel wie im alten Weg: das automatische Speichern
            // darf eine Menge groesser machen, nie kleiner. Wer wirklich nach
            // unten korrigieren will, muss das an der Zahl selbst tun -- dann
            // steht der kleinere Wert schon in der Erfassung und wird nicht
            // erst beim Zeichnen errechnet.
            // =============================================================
            const nieKleiner = (neu, alt) => {
                const n = parseFloat(neu), a = parseFloat(alt);
                if (!Number.isFinite(a)) return neu;
                if (!Number.isFinite(n)) return alt;
                return n >= a ? neu : alt;
            };

            // --- Lieferungen samt Verteilung -------------------------
            for (const [id, d] of Object.entries(jetzt.lieferungen)) {
                const alt = (vorher.lieferungen || {})[id];
                if (alt && JSON.stringify(alt) === JSON.stringify(d)) continue;

                if (alt) {
                    d.kg       = nieKleiner(d.kg, alt.kg);
                    d.exportKg = nieKleiner(d.exportKg, alt.exportKg);
                    d.unsKg    = nieKleiner(d.unsKg, alt.unsKg);
                    // Nach dem Zurechtruecken kann der Unterschied verschwunden
                    // sein -- dann gibt es auch nichts zu schreiben.
                    if (JSON.stringify(alt) === JSON.stringify(d)) continue;
                }

                await ruf('/api/daten/lieferung', { method: 'POST', body: {
                    id, datum: d.datum, name: d.name || null, kg: d.kg,
                    export_kg: d.exportKg, uns_kg: d.unsKg,
                    quelle: d.quelle || null, voll_sortiert: !!d.vollSortiert
                }});
                getan.push((alt ? 'geändert' : 'neu') + ': Lieferung ' + id);
                if (!alt || JSON.stringify(alt.anteile) !== JSON.stringify(d.anteile)) {
                    await ruf('/api/daten/lieferung/' + encodeURIComponent(id) + '/anteile',
                              { method: 'POST', body: d.anteile });
                }
            }
            for (const id of Object.keys(vorher.lieferungen || {})) {
                if (jetzt.lieferungen[id]) continue;
                if (!darfWeg('lieferung', id)) { wuerdeLoeschen.push('Lieferung ' + id); jetzt.lieferungen[id] = vorher.lieferungen[id]; continue; }
                await this.loescheV2('lieferung', id);
                getan.push('gelöscht: Lieferung ' + id);
            }

            // --- Tagessummen, Einstellungen --------------------------
            for (const [tag, t] of Object.entries(jetzt.tage)) {
                const alt = (vorher.tage || {})[tag];
                if (alt && JSON.stringify(alt) === JSON.stringify(t)) continue;

                // Gleiche Regel wie bei den Lieferungen: das automatische
                // Speichern macht eine Tagesmenge nie kleiner. Hier ist es
                // sogar wichtiger -- rebuildTeamTagesMengenFuerDatum() setzt
                // einen Tag OHNE Buchungen glatt auf 0, und genau das trifft
                // die sieben handgetragenen Junitage.
                if (alt) {
                    t.gesamtKg = nieKleiner(t.gesamtKg, alt.gesamtKg);
                    t.exportKg = nieKleiner(t.exportKg, alt.exportKg);
                    t.unsKg    = nieKleiner(t.unsKg, alt.unsKg);
                    if (JSON.stringify(alt) === JSON.stringify(t)) continue;
                }

                await ruf('/api/daten/tages_summe', { method: 'POST', body: {
                    datum: tag, gesamt_kg: t.gesamtKg, export_kg: t.exportKg,
                    uns_kg: t.unsKg, personal_anzahl: t.personal
                }});
                getan.push((alt ? 'geändert' : 'neu') + ': Tagessumme ' + tag);
            }
            for (const [k, w] of Object.entries(jetzt.einstellungen)) {
                if ((vorher.einstellungen || {})[k] === w) continue;
                await ruf('/api/daten/einstellung', { method: 'POST', body: { schluessel: k, wert: w } });
                getan.push('Einstellung ' + k);
            }

            // --- Die vier, die bis zum 21.08. gar nicht geschrieben wurden ---
            // Sonder-Vorlagen, Checkliste, Tagesnachricht und Sortier-Buchungen.
            // Alle vier haben Bedienknoepfe und eine eigene Tabelle -- sie kamen
            // nur nie im Schnappschuss vor. Geloescht wird auch hier nur mit
            // Grabstein bzw. auf ausdrueckliche Ansage.
            const weitere = [
                ['sonder_vorlage',     'vorlagen',    'id',         (id, v) => ({ id, ...v })],
                ['checkliste_morgens', 'checkliste',  'id',         (id, v) => ({ id, ...v })],
                ['tagesnachricht',     'nachrichten', 'datum',      (id, v) => ({ datum: id, ...v })],
                ['sortier_buchung',    'buchungen',   'id',         (id, v) => ({ id, ...v })]
            ];
            for (const [tabelle, feld, , bau] of weitere) {
                for (const [id, wert] of Object.entries(jetzt[feld])) {
                    const alt = (vorher[feld] || {})[id];
                    if (alt && JSON.stringify(alt) === JSON.stringify(wert)) continue;
                    await ruf('/api/daten/' + tabelle, { method: 'POST', body: bau(id, wert) });
                    getan.push((alt ? 'geändert' : 'neu') + ': ' + tabelle + ' ' + id);
                }
                for (const id of Object.keys(vorher[feld] || {})) {
                    if (jetzt[feld][id]) continue;
                    if (!darfWeg(tabelle, id)) {
                        wuerdeLoeschen.push(tabelle + ' ' + id);
                        jetzt[feld][id] = vorher[feld][id];
                        continue;
                    }
                    await this.loescheV2(tabelle, id);
                    getan.push('gelöscht: ' + tabelle + ' ' + id);
                }
            }

            // 2026-08-21: Erledigte Grabsteine abnehmen.
            // Was hier geloescht wurde, ist beim Server angekommen -- der Zettel hat
            // seine Schuldigkeit getan. Bliebe er liegen, wuerde er beim naechsten
            // Durchgang eine Nummer treffen, die inzwischen jemand neu angelegt hat.
            // Genau das war der Fall "Herta" vom 21.08.2026.
            const abgeraeumt = [];
            const abnehmen = (feld, wert) => {
                if (!Array.isArray(db[feld])) return;
                const vor = db[feld].length;
                db[feld] = db[feld].filter(x => String(x).trim() !== String(wert).trim());
                if (db[feld].length !== vor) abgeraeumt.push(feld + ':' + wert);
            };
            getan.forEach(z => {
                const t = String(z);
                if (!t.startsWith('gelöscht: ')) return;
                const rest = t.slice(10);
                if (rest.startsWith('Artikel '))        abnehmen('deletedArticles', rest.slice(8));
                else if (rest.startsWith('Nölke Nr. ')) abnehmen('deletedNoelke', 'nr:' + rest.slice(10));
                else if (rest.startsWith('lieferant ')) abnehmen('deletedSuppliers', rest.slice(10));
                else if (rest.startsWith('mitarbeiter ')) abnehmen('deletedWorkers', rest.slice(12));
                else if (rest.startsWith('Lieferung '))  abnehmen('deletedLieferungen', rest.slice(10));
            });
            if (abgeraeumt.length) getan.push('Grabsteine abgeraeumt: ' + abgeraeumt.length);

            merker = jetzt;
            getan.wuerdeLoeschen = wuerdeLoeschen;
            return getan;
        },

        // fuer Tests und fuer die Umstellung sichtbar gemacht
        _bauDb: bauDb,
        _noelkeZeile: noelkeZeile,
        _schnappschuss: schnappschuss
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DatenV2;
