// =====================================================================
//  DATENQUELLE — der Schalter zwischen altem und neuem Weg
//  Stand: 2026-08-20
//
//  Diese Datei ist die einzige Stelle, an der das Control Center von der
//  Cloud (ein 1,55-MB-Paket) auf die neue Schnittstelle (ein Datensatz)
//  umgestellt wird.
//
//  WICHTIG: Sie tut nichts, solange in control/daten-v2.json nicht
//  "aktiv": true steht. Ohne den Schalter laeuft alles unveraendert --
//  und wenn etwas nicht passt, legt man ihn zurueck und ist wieder da,
//  wo man vorher war.
//
//  WAS SICH BEIM UMLEGEN AENDERT
//  -----------------------------
//   • Beim Start wird der Bestand vom Server geholt statt aus der Cloud
//   • Aenderungen gehen als EINZELNE Datensaetze raus, nicht als Paket
//   • Aenderungen von anderen kommen VON SELBST an -- kein "Aus Cloud laden"
//   • Seit 21.08.2026 sind BEIDE Knoepfe weg — "In Cloud speichern" und
//     "Neu laden". Gespeichert wird von selbst, Fremdes kommt ueber den
//     Live-Kanal, und Loeschen laeuft ueber die Grabsteine. Der alte Stand
//     dieser Zeile lautete (jetzt ueberholt):
//   • "In Cloud speichern" wird nicht mehr gebraucht (Knopf bleibt, tut
//     aber dasselbe wie das automatische Speichern)
//
//  ZWEI RIEGEL, DIE HIER DRINSTECKEN
//  ---------------------------------
//   1. ERST LADEN, DANN SCHREIBEN. Vor dem ersten erfolgreichen Laden
//      wird nichts geschrieben. Damit kann ein Fenster, das nach Stunden
//      aufwacht, nichts mit einem alten Stand ueberschreiben.
//   2. KEIN STILLER RUECKFALL. Ist der Server nicht erreichbar, wird das
//      sichtbar gemeldet und NICHT heimlich auf die Cloud zurueckgeschaltet
//      -- sonst laegen die Aenderungen hinterher an zwei verschiedenen Orten.
// =====================================================================

(function () {
    'use strict';

    let einstellungen = null;
    let bereit = false;         // erst nach erfolgreichem Laden true
    let speicherTimer = null;
    let laeuftGeradeEinSchreiben = false;

    // 2026-08-20, im ersten Testlauf aufgefallen: Der Browser hat sich mit
    // ERR_INSUFFICIENT_RESOURCES verschluckt -- eine RUECKKOPPLUNG.
    //
    //   Live-Meldung  ->  renderAll()  ->  automatisch speichern
    //        ^                                     |
    //        +------------- Live-Meldung ----------+
    //
    // Das Neuzeichnen nach einer fremden Aenderung darf also NICHT als
    // "der Bediener hat etwas geaendert" gelten. Solange dieser Merker
    // steht, wird nichts geschrieben.
    let pflegeGeradeFremdeAenderungEin = false;

    // -----------------------------------------------------------------
    function status(text, art) {
        const el = document.getElementById('sticky-status');
        if (el) el.textContent = text;
        const db2 = document.getElementById('db-status');
        if (db2 && art === 'start') db2.innerText = text;
        if (art === 'fehler') console.warn('[Datenquelle]', text);
    }

    /**
     * 2026-08-21: Der Hinweis neben den Knoepfen stimmt im neuen Betrieb nicht mehr.
     *
     * In control/index.html steht fest verdrahtet: "Lokal heisst: nur auf diesem PC.
     * Erst mit In Cloud speichern sehen die Tablets die Aenderung." Das ist richtig,
     * solange der Schalter aus ist -- dann gibt es kein automatisches Speichern und
     * der Knopf ist der einzige Weg nach draussen.
     *
     * Mit umgelegtem Schalter ist es FALSCH: Aenderungen gehen von selbst raus. Der
     * Satz stand aber weiter da und hat genau die Frage erzeugt, wofuer man die
     * beiden Knoepfe dann ueberhaupt noch braucht. Derselbe Fehlertyp wie beim
     * Live-Kanal: die Oberflaeche behauptet etwas, das nicht mehr gilt.
     *
     * Der Text wird deshalb hier umgeschrieben -- und nur hier, damit der
     * Echtbetrieb mit ausgeschaltetem Schalter unveraendert bleibt.
     *
     * Nachtrag vom selben Tag: hier stand bis eben "In Cloud speichern brauchst
     * du nur zum Loeschen". Das stimmt auch nicht mehr -- der Knopf ist weg,
     * seit die Schreibschicht die Grabsteine auswertet und selbst weiss, was
     * bewusst geloescht wurde. Ein Satz ueber einen Knopf, den es nicht mehr
     * gibt, ist genau die Sorte Falschaussage, die wir hier abstellen wollen.
     */
    function hinweisAnpassen() {
        const el = document.querySelector('#sticky-save-bar .schiene-hinweis');
        if (!el) return;
        el.innerHTML = 'Änderungen gehen <b>von selbst</b> raus, und was andere ändern, '
            + 'kommt von selbst an — keine Knöpfe mehr. '
            + 'Was du hier <b>löschst</b>, verschwindet auch beim Server; was auf diesem PC '
            + 'nur <b>fehlt</b>, wird nie angefasst.';
    }

    function adresse() {
        const b = String((einstellungen && einstellungen.basis) || '').trim().replace(/\/+$/, '');
        if (b) return b;
        return location.origin;   // dieselbe Maschine, von der diese Seite kommt
    }

    // -----------------------------------------------------------------
    // Start
    // -----------------------------------------------------------------
    async function starten() {
        try {
            const antwort = await fetch('daten-v2.json?t=' + Date.now(), { cache: 'no-store' });
            if (!antwort.ok) return;                 // keine Datei = alter Weg, ohne Meldung
            einstellungen = await antwort.json();
        } catch (e) { return; }

        if (!einstellungen || einstellungen.aktiv !== true) return;   // Schalter aus

        const ok = DatenV2.einrichten({
            basis: adresse(),
            schluessel: einstellungen.zugriff || '',
            geraet: einstellungen.geraet || 'unbekannt',
            // 2026-08-21: true = die Gegenstelle ist die Supabase-Cloud
            // (PostgREST) statt unseres eigenen Servers. Siehe daten_v2.js,
            // Abschnitt "DIE ZWEITE BETRIEBSART".
            cloud: einstellungen.cloud === true,
            beiAenderung: (aenderungen) => {
                // Die eigenen Schreibvorgaenge kommen ueber den Live-Kanal auch
                // wieder hier an. Eingepflegt werden sie (schadet nicht), aber
                // gemeldet wird nur, was WIRKLICH von woanders kommt -- sonst
                // stuende da "1 Aenderung von dir selbst uebernommen".
                const fremde = aenderungen.filter(a => a.geaendert_von !== DatenV2.geraetName);
                const wer = [...new Set(fremde.map(a => a.geaendert_von).filter(Boolean))];
                pflegeGeradeFremdeAenderungEin = true;
                try {
                    if (typeof renderAll === 'function') renderAll();
                    if (typeof renderV10Table === 'function') renderV10Table();
                    DatenV2.merkeStand(db);
                } finally {
                    pflegeGeradeFremdeAenderungEin = false;
                }
                // Erst zeichnen, DANN melden: renderAll() schreibt selbst in die
                // Statuszeile und wuerde die Meldung sonst gleich wieder loeschen.
                if (fremde.length) {
                    status('🔄 ' + fremde.length + ' Änderung' + (fremde.length === 1 ? '' : 'en')
                           + (wer.length ? ' von ' + wer.join(', ') : '') + ' übernommen · '
                           + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
                }
            }
        });
        if (!ok) return;

        status('Hole den Bestand vom Server …', 'start');
        try {
            await DatenV2.ladeAllesV2(db);
            DatenV2.merkeStand(db);
            bereit = true;
        } catch (e) {
            // Riegel 2: nicht heimlich zurueckschalten.
            status('⚠️ Server nicht erreichbar (' + e.message + ') — es wird NICHTS gespeichert, '
                 + 'damit nichts an zwei Stellen liegt. Bitte Verbindung prüfen und Seite neu laden.', 'fehler');
            return;
        }

        umleiten();
        hinweisAnpassen();          // 2026-08-21: der Text neben den Knoepfen, siehe oben
        if (typeof renderAll === 'function') renderAll();
        if (typeof renderV10Table === 'function') renderV10Table();

        // 2026-08-20: Der Live-Kanal wird jetzt gemeldet, wenn er WIRKLICH steht.
        // Vorher stand hier sofort "Aenderungen kommen von selbst an" -- auch
        // dann, wenn der Kanal gar nicht zustande kam (siehe daten_api.js,
        // EventSource und der Zugriffsschluessel). Eine gruene Meldung ueber
        // etwas, das nicht laeuft, ist schlimmer als gar keine.
        DatenV2.starteLiveV2(db, (steht) => {
            if (steht) {
                status('✅ Verbunden · Stand ' + DatenV2.stand + ' · Änderungen kommen von selbst an');
            } else {
                status('⚠️ Verbunden · Stand ' + DatenV2.stand + ' · Live-Kanal getrennt — Änderungen von '
                     + 'anderen kommen gerade NICHT von selbst an. Seite neu laden (F5).', 'fehler');
            }
        });
        status('✅ Verbunden · Stand ' + DatenV2.stand + ' · Live-Kanal wird aufgebaut …');
        console.log('[Datenquelle] neue Schnittstelle aktiv,', adresse());
    }

    // -----------------------------------------------------------------
    // Die alten Cloud-Wege umbiegen
    // -----------------------------------------------------------------
    /**
     * 2026-08-21: Der Knopf "In Cloud speichern" verschwindet im neuen Betrieb.
     *
     * Er war nie ein Speichern-Knopf im eigentlichen Sinn -- gespeichert wird
     * seit dem Umbau von selbst. Uebrig war er nur noch als LOESCHEN-Knopf: das
     * automatische Speichern loescht nie, und die Rueckfrage dahinter war der
     * einzige Weg, etwas wirklich vom Server zu nehmen.
     *
     * Diese Rueckfrage gab es, weil die Schreibschicht nicht unterscheiden
     * konnte zwischen "bewusst geloescht" und "fehlt hier gerade". Seit sie die
     * Grabsteine auswertet (siehe daten_v2.js, darfWeg), weiss sie es -- und der
     * Knopf hat keine Aufgabe mehr.
     *
     * Er wird ausgeblendet, nicht entfernt: pushToCloud() bleibt aufrufbar
     * (Tests, alte Verweise, der Tablet-Zweig), und wer den Schalter in
     * daten-v2.json zurueckstellt, hat sofort wieder alles wie vorher.
     */
    function knopfVerstecken() {
        // "Neu laden" geht mit. Es holte den vollen Bestand ohne Seitenneuladen --
        // aber der Live-Kanal bringt Aenderungen ohnehin von selbst, und faellt der
        // aus, ist F5 der bessere Griff: das holt zusaetzlich frischen Programmcode.
        // Zwei Knoepfe, die beide "irgendwas mit Daten" tun, waren genau die
        // Verwirrung, die dieser Umbau abstellt.
        ['btn-in-cloud-speichern', 'btn-in-cloud-speichern-2',
         'btn-neu-laden', 'btn-neu-laden-2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        // Der Begleittext steht in hinweisAnpassen() -- bewusst an EINER Stelle,
        // sonst schreiben zwei Funktionen nacheinander in dasselbe Feld und
        // welche gewinnt, haengt an der Aufrufreihenfolge.
    }

    function umleiten() {
        knopfVerstecken();

        // Bleibt aufrufbar, auch wenn kein Knopf mehr daraufzeigt: schreibt sofort,
        // statt die 0,9 Sekunden abzuwarten. Loeschen laeuft jetzt ueber die
        // Grabsteine und braucht diesen Weg nicht mehr.
        window.pushToCloud = async function (still) {
            if (!bereit) { status('⚠️ Noch nichts geladen — es wird nicht gespeichert.', 'fehler'); return; }
            await jetztSchreiben(!still);
        };

        // "Aus Cloud laden" holt jetzt den aktuellen Stand vom Server.
        window.pullFromCloud = async function () {
            try {
                await DatenV2.ladeAllesV2(db);
                DatenV2.merkeStand(db);
                bereit = true;
                if (typeof renderAll === 'function') renderAll();
                if (typeof renderV10Table === 'function') renderV10Table();
                status('✅ Stand vom Server geholt · Nr. ' + DatenV2.stand);
            } catch (e) {
                status('⚠️ Konnte nicht laden: ' + e.message, 'fehler');
            }
        };

        // Nach jedem Zeichnen kurz warten und dann das Geaenderte schicken.
        // renderAll() laeuft bei jeder Aenderung -- die Wartezeit fasst eine
        // Klickfolge zu einem Schreibvorgang zusammen.
        if (einstellungen.automatischSpeichern !== false && typeof renderAll === 'function') {
            const altesRenderAll = window.renderAll;
            window.renderAll = function () {
                const r = altesRenderAll.apply(this, arguments);
                planeSchreiben();
                return r;
            };
        }
    }

    function planeSchreiben() {
        if (!bereit || pflegeGeradeFremdeAenderungEin) return;
        if (speicherTimer) clearTimeout(speicherTimer);
        speicherTimer = setTimeout(() => { jetztSchreiben(false); }, 900);
    }

    /**
     * mitMeldung = der Bediener hat selbst auf Speichern gedrueckt.
     * Nur dann darf ueberhaupt geloescht werden -- und auch dann erst
     * nach Rueckfrage. Beim automatischen Speichern wird nie geloescht:
     * beim ersten Testlauf hat schon das OEFFNEN der Seite zwei
     * Lieferungen entfernt, weil das Control Center beim Start selbst
     * aufraeumt. Genau das soll nie wieder passieren.
     */
    async function jetztSchreiben(mitMeldung) {
        if (!bereit || laeuftGeradeEinSchreiben) return;
        laeuftGeradeEinSchreiben = true;
        try {
            const getan = await DatenV2.schreibeAenderungenV2(db, { loeschen: false });

            // 2026-08-21: KEINE RUECKFRAGE MEHR.
            //
            // Was hier steht, ist nicht "geloescht", sondern "fehlt auf diesem PC".
            // Frueher wurde genau danach gefragt -- und damit der Bediener zur
            // Entscheidung gezwungen, die das Programm selbst nicht treffen wollte.
            // Genau daraus sind am 20. und 21.08. Daten verschwunden: einmal Ja
            // geklickt, und weg war, was ein anderes Fenster gerade angelegt hatte.
            //
            // Bewusst Geloeschtes braucht diesen Weg nicht mehr, es traegt einen
            // Grabstein und geht von selbst raus (siehe daten_v2.js, darfWeg).
            // Was hier uebrig bleibt, hat keinen -- und wird deshalb NIE geloescht,
            // sondern nur gemeldet. Der Bestand kann so nicht mehr schrumpfen,
            // ausser jemand loescht wirklich etwas.
            const offen = getan.wuerdeLoeschen || [];
            if (offen.length) {
                console.log('[Datenquelle] ' + offen.length + ' Eintrag/Einträge fehlen hier, '
                            + 'wurden aber NICHT gelöscht:', offen);
            }

            if (getan.length) {
                status('💾 gespeichert: ' + getan.slice(0, 3).join(', ')
                       + (getan.length > 3 ? ' und ' + (getan.length - 3) + ' weitere' : '')
                       + ' · ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
            } else if (mitMeldung) {
                status('Nichts zu speichern — alles schon auf dem Server.');
            }
        } catch (e) {
            status('⚠️ Nicht gespeichert: ' + e.message + ' — deine Änderung steht noch hier im Fenster.', 'fehler');
        } finally {
            laeuftGeradeEinSchreiben = false;
        }
    }

    // -----------------------------------------------------------------
    // Nach dem normalen Start dranhaengen (core.js setzt window.onload).
    // -----------------------------------------------------------------
    const vorher = window.onload;
    window.onload = function () {
        if (typeof vorher === 'function') vorher.apply(this, arguments);
        // einen Wimpernschlag warten, damit der normale Start durch ist
        setTimeout(starten, 50);
    };

    // Kommt das Fenster aus dem Schlaf, zuerst nachholen -- nie zuerst schreiben.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !bereit) return;
        DatenV2.holeNachV2(db).then(a => {
            if (!a) return;
            pflegeGeradeFremdeAenderungEin = true;
            try {
                if (typeof renderAll === 'function') renderAll();
                DatenV2.merkeStand(db);
            } finally { pflegeGeradeFremdeAenderungEin = false; }
            status('🔄 Beim Zurückkommen ' + a.length + ' Änderung(en) nachgeholt');
        }).catch(() => { /* der Live-Kanal versucht es ohnehin weiter */ });
    });
})();
