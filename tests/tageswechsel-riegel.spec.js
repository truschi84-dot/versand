// Wache fuer den Tageswechsel-Riegel der Sortierliste (2026-08-18).
//
// Hintergrund: Ein Sortier-Eintrag hatte kein Datum. Gebucht wird beim Drucken mit dem
// Datum des Druck-Klicks, geleert wurde nur von Hand. Wer die Liste ueber Nacht stehen
// liess und am naechsten Tag noch einmal gedruckt hat, hat die Mengen von gestern ein
// zweites Mal gebucht -- die Auswertung fuer die Geschaeftsfuehrung war zu hoch.
//
// Zwei voneinander unabhaengige Riegel:
//   Schritt 2  pruefeTageswechselSortierung()  -- legt Altes beim Aufbau der Ansicht beiseite
//   Schritt 3  sortierungDrucken()             -- haelt Altes aus den Buchungsdaten heraus
// Der zweite Riegel wird hier bewusst auch ohne den ersten geprueft: er ist die
// eigentliche Geld-Sicherung und muss allein tragen.
//
// WICHTIG: Nichts wird geloescht. Beiseitegelegtes liegt in db.entriesSortUebertrag und
// muss ansehbar und als Nachdruck (ohne Buchung) druckbar bleiben.
//
// WICHTIG: blockCloud() vor dem Laden, damit kein Testlauf echte Firmendaten anfasst.

const { test, expect } = require('@playwright/test');
const { blockCloud, unlockRechner } = require('./helpers');

const RECHNER_KEY = 'kombi_rechner_db';
const LOGISTIK_KEY = 'kombi_logistik_db';

const LIEF = 'Testlieferant GmbH';

const SEED_LOGISTIK_DB = {
  suppliers: [LIEF],
  customers: ['Testkunde Spedition'],
  workers: ['Max Mustermann'],
  articles: [],
};

/** Dieselbe Rechnung wie getLocalISO() in js/script.js -- Ortszeit, kein UTC-Versatz. */
function heuteISO(tageZurueck = 0) {
  const d = new Date();
  d.setDate(d.getDate() - tageZurueck);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

/** Millisekunden-Zeitstempel wie Date.now() -- 12 Uhr mittags am gewuenschten Tag. */
function idVonTag(tageZurueck = 0) {
  const d = new Date();
  d.setDate(d.getDate() - tageZurueck);
  d.setHours(12, 0, 0, 0);
  return String(d.getTime());
}

/**
 * Ein Sortier-Eintrag wie addSort() ihn anlegt.
 * ohneDatum=true bildet den Altbestand nach: kein datum-Feld, nur die id als Zeitstempel.
 */
function sortEintrag({ tageZurueck = 0, sorte, netto, ohneDatum = false, id }) {
  const e = {
    id: id || idVonTag(tageZurueck),
    lief: LIEF,
    sorte,
    netto,
    leergut: {},
  };
  if (!ohneDatum) e.datum = heuteISO(tageZurueck);
  return e;
}

/**
 * Rechner-DB und Stammdaten hinterlegen. addInitScript laeuft bei jeder Navigation
 * erneut -- deshalb wird nur beim ersten Lauf geschrieben, sonst wuerde ein Neuladen
 * genau das ueberschreiben, was der Riegel eben veraendert hat.
 */
async function seedLocalData(page, entriesSort, entriesSortUebertrag) {
  await page.addInitScript(
    ({ logistik, rKey, lKey, sort, uebertrag }) => {
      if (window.localStorage.getItem('__riegel_seed_done') === '1') return;
      window.localStorage.setItem('__riegel_seed_done', '1');
      window.localStorage.setItem(lKey, JSON.stringify(logistik));
      const db = { entries: [], entriesSort: sort, entriesNoelke: [] };
      if (uebertrag) db.entriesSortUebertrag = uebertrag;
      window.localStorage.setItem(rKey, JSON.stringify(db));
    },
    {
      logistik: SEED_LOGISTIK_DB,
      rKey: RECHNER_KEY,
      lKey: LOGISTIK_KEY,
      sort: entriesSort,
      uebertrag: entriesSortUebertrag || null,
    }
  );
}

/**
 * Druck abfangen statt wirklich drucken: forcePrint wird ersetzt und legt das erzeugte
 * HTML in window.__gedruckt ab. So laesst sich pruefen, was auf dem Zettel steht.
 */
async function fangeDruckAb(page) {
  await page.addInitScript(() => {
    window.__gedruckt = [];
    const einbauen = () => {
      window.forcePrint = (dateiname, html) => {
        window.__gedruckt.push({ dateiname, html });
      };
    };
    window.addEventListener('DOMContentLoaded', einbauen);
    window.addEventListener('load', einbauen);
  });
}

async function closeChangelogIfOpen(page) {
  const modal = page.locator('#changelog-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Klasse, weiter!' }).click();
    await modal.waitFor({ state: 'hidden' });
  }
}

async function setupApp(page, entriesSort, entriesSortUebertrag) {
  await seedLocalData(page, entriesSort, entriesSortUebertrag);
  await fangeDruckAb(page);
  await blockCloud(page);
  await unlockRechner(page);
}

/**
 * Arbeitsliste im Speicher (das, was gedruckt und gebucht wuerde).
 * entriesSort ist ein top-level "let" und liegt deshalb NICHT an window -- der Zugriff
 * muss ueber den blossen Namen laufen, sonst kommt still eine leere Liste zurueck.
 */
async function leseEntriesSort(page) {
  return page.evaluate(() => entriesSort);
}

/** Beiseitegelegte Liste aus der Rechner-DB. */
async function leseUebertrag(page) {
  return page.evaluate(() => window.ladeSortierUebertrag());
}

/** Tages-Summe aller gebuchten Sortier-Mengen fuer heute. */
async function gebuchteSummeHeute(page) {
  return page.evaluate(() => {
    const lDb = window.ladeLogistikDb();
    const heute = window.getLocalISO();
    const eintrag = (lDb.teamTagesMengen || {})[heute];
    return eintrag ? parseFloat(eintrag.gesamtKg) || 0 : 0;
  });
}

/** In den Sortier-Tab wechseln -- der Uebertrag-Hinweis steht dort und ist sonst zugeklappt. */
async function oeffneSortierTab(page) {
  await page.evaluate(() => switchTab('sort'));
}

/** Wiegeschein drucken und warten, bis die Buchung durch ist. */
async function druckeWiegeschein(page) {
  await page.evaluate(() => window.sortierungDrucken());
  await page.waitForTimeout(600);
}

test.describe('Tageswechsel-Riegel Sortierung', () => {
  test.beforeEach(async ({ page }) => {
    await blockCloud(page);
  });

  test('Liste von gestern: beim Oeffnen leer, Uebertrag gefuellt, genau EINE Meldung', async ({ page }) => {
    const gestern = [
      sortEintrag({ tageZurueck: 1, sorte: 'Artikel A', netto: 100, id: '1' + idVonTag(1).slice(1) }),
      sortEintrag({ tageZurueck: 1, sorte: 'Artikel B', netto: 200, id: String(Number(idVonTag(1)) + 1) }),
    ];
    await setupApp(page, gestern);
    await closeChangelogIfOpen(page);

    // Die Arbeitsliste ist leer -- nichts davon kann noch einmal gebucht werden.
    expect(await leseEntriesSort(page)).toHaveLength(0);

    // Aber nichts ist verloren: alles liegt im Uebertrag.
    const uebertrag = await leseUebertrag(page);
    expect(uebertrag).toHaveLength(2);
    expect(uebertrag.map((e) => e.netto).sort((a, b) => a - b)).toEqual([100, 200]);

    // Genau EINE Meldung, kein Meldungs-Gewitter.
    const meldung = page.locator('#sortier-tageswechsel-modal');
    await expect(meldung).toBeVisible();
    await expect(page.locator('#sortier-tageswechsel-text')).toContainText('beiseitegelegt');
    await expect(page.locator('#sortier-tageswechsel-text')).toContainText('NICHT noch einmal gebucht');
    await expect(page.locator('#sortier-tageswechsel-ok-btn')).toHaveText('Verstanden');
    await expect(page.locator('#sortier-tageswechsel-ansehen-btn')).toHaveText('Alte Liste ansehen');

    // Ein zweiter Aufbau der Ansicht darf die Meldung NICHT erneut bringen.
    await page.locator('#sortier-tageswechsel-ok-btn').click();
    await expect(meldung).toBeHidden();
    await page.evaluate(() => window.loadRechnerData());
    await expect(meldung).toBeHidden();
    expect(await leseUebertrag(page)).toHaveLength(2);
  });

  test('Meldung weggeklickt und sofort gedruckt: nur die heutigen Eintraege werden gebucht', async ({ page }) => {
    const gemischt = [
      sortEintrag({ tageZurueck: 1, sorte: 'Artikel Gestern', netto: 500 }),
      sortEintrag({ tageZurueck: 0, sorte: 'Artikel Heute', netto: 70, id: String(Number(idVonTag(0)) + 5) }),
    ];
    await setupApp(page, gemischt);
    await closeChangelogIfOpen(page);
    await page.locator('#sortier-tageswechsel-ok-btn').click();

    expect(await gebuchteSummeHeute(page)).toBe(0);
    await druckeWiegeschein(page);

    // Nur die 70 kg von heute -- die 500 kg von gestern bleiben draussen.
    expect(await gebuchteSummeHeute(page)).toBe(70);
  });

  test('Altbestand ohne datum-Feld: id von gestern wird als "von gestern" erkannt', async ({ page }) => {
    const altbestand = [
      sortEintrag({ tageZurueck: 1, sorte: 'Alter Eintrag', netto: 333, ohneDatum: true }),
    ];
    await setupApp(page, altbestand);
    await closeChangelogIfOpen(page);

    // Die Rekonstruktion aus der id muss exakt sein -- ohne Datenwanderung.
    const erkannt = await page.evaluate(
      (e) => ({
        datum: window.datumVonSortierEintrag(e),
        heute: window.istSortierEintragVonHeute(e),
      }),
      altbestand[0]
    );
    expect(erkannt.datum).toBe(heuteISO(1));
    expect(erkannt.heute).toBe(false);

    expect(await leseEntriesSort(page)).toHaveLength(0);
    expect(await leseUebertrag(page)).toHaveLength(1);
    await expect(page.locator('#sortier-tageswechsel-modal')).toBeVisible();

    // Ein Eintrag ohne datum UND ohne brauchbare id gilt als alt, niemals als heute.
    const ohneAlles = await page.evaluate(() =>
      window.istSortierEintragVonHeute({ id: 'abc', sorte: 'X', netto: 1 })
    );
    expect(ohneAlles).toBe(false);
  });

  test('normaler Tag ohne Wechsel: keine Meldung, kein Beiseitelegen', async ({ page }) => {
    const heute = [
      sortEintrag({ tageZurueck: 0, sorte: 'Artikel A', netto: 100 }),
      sortEintrag({ tageZurueck: 0, sorte: 'Artikel B', netto: 250, id: String(Number(idVonTag(0)) + 3) }),
    ];
    await setupApp(page, heute);
    await closeChangelogIfOpen(page);

    await expect(page.locator('#sortier-tageswechsel-modal')).toBeHidden();
    expect(await leseEntriesSort(page)).toHaveLength(2);
    expect(await leseUebertrag(page)).toHaveLength(0);
    await oeffneSortierTab(page);
    await expect(page.locator('#sortier-uebertrag-hinweis')).toBeHidden();
    expect(await page.locator('#sortier-uebertrag-hinweis').innerHTML()).toBe('');

    // Und es wird ganz normal alles gebucht.
    await druckeWiegeschein(page);
    expect(await gebuchteSummeHeute(page)).toBe(350);
  });

  test('zweimal am selben Tag drucken erzeugt keine Doppelbuchung (Delta-Logik)', async ({ page }) => {
    const heute = [sortEintrag({ tageZurueck: 0, sorte: 'Artikel A', netto: 400 })];
    await setupApp(page, heute);
    await closeChangelogIfOpen(page);

    await druckeWiegeschein(page);
    expect(await gebuchteSummeHeute(page)).toBe(400);

    await druckeWiegeschein(page);
    expect(await gebuchteSummeHeute(page)).toBe(400);

    // Kommt eine Palette dazu, wird nur die Differenz nachgebucht.
    await page.evaluate(() => {
      entriesSort.push({
        id: String(Date.now()),
        datum: window.getLocalISO(),
        lief: entriesSort[0].lief,
        sorte: 'Artikel A',
        netto: 100,
        leergut: {},
      });
      window.saveRechnerDB();
    });
    await druckeWiegeschein(page);
    expect(await gebuchteSummeHeute(page)).toBe(500);
  });

  test('die Leeren-Taste arbeitet wie vorher', async ({ page }) => {
    const heute = [
      sortEintrag({ tageZurueck: 0, sorte: 'Artikel A', netto: 100 }),
      sortEintrag({ tageZurueck: 0, sorte: 'Artikel B', netto: 200, id: String(Number(idVonTag(0)) + 7) }),
    ];
    await setupApp(page, heute);
    await closeChangelogIfOpen(page);
    expect(await leseEntriesSort(page)).toHaveLength(2);

    const sitzungVorher = await page.evaluate(() => window.getSortierSitzungId());
    await page.evaluate(() => window.fullResetSort());
    await page.locator('#confirm-yes-btn').click();

    expect(await leseEntriesSort(page)).toHaveLength(0);
    // Neue Sitzung wie bisher -- sonst wuerden neue Mengen gegen alte Buchungen verrechnet.
    const sitzungNachher = await page.evaluate(() => window.getSortierSitzungId());
    expect(sitzungNachher).not.toBe(sitzungVorher);
    // Die Leeren-Taste legt bewusst NICHTS in den Uebertrag -- das war schon immer so.
    expect(await leseUebertrag(page)).toHaveLength(0);
  });

  test('Nachdruck der alten Liste: keine Buchung, Kennzeichnung steht auf dem Ausdruck', async ({ page }) => {
    const gestern = [sortEintrag({ tageZurueck: 1, sorte: 'Artikel Gestern', netto: 800 })];
    await setupApp(page, gestern);
    await closeChangelogIfOpen(page);

    // Weg zur alten Liste ueber die Meldung ...
    await page.locator('#sortier-tageswechsel-ansehen-btn').click();
    await expect(page.locator('#sortier-uebertrag-modal')).toBeVisible();
    await expect(page.locator('#sortier-uebertrag-liste')).toContainText('Artikel Gestern');

    const vorher = await gebuchteSummeHeute(page);
    await page.evaluate(() => window.uebertragNachdruckDrucken());
    await page.waitForTimeout(600);

    const drucke = await page.evaluate(() => window.__gedruckt);
    expect(drucke).toHaveLength(1);
    // Die Kennzeichnung muss auf dem Papier stehen, sonst passt die Summe nicht zur Auswertung.
    expect(drucke[0].html).toContain('Nachdruck vom');
    expect(drucke[0].html).toContain('nicht gebucht');
    expect(drucke[0].html).toContain(heuteISO(1).split('-').reverse().join('.'));
    expect(drucke[0].html).toContain('800,00 kg');

    // Und vor allem: kein Kilo mehr in der Auswertung.
    expect(await gebuchteSummeHeute(page)).toBe(vorher);

    // ... und der Weg dorthin bleibt auch spaeter offen, nicht nur direkt nach der Meldung.
    await page.locator('#sortier-uebertrag-modal').evaluate((el) => (el.style.display = 'none'));
    await oeffneSortierTab(page);
    await expect(page.locator('#sortier-uebertrag-hinweis')).toBeVisible();
    await page.locator('#sortier-uebertrag-hinweis button').click();
    await expect(page.locator('#sortier-uebertrag-modal')).toBeVisible();

    // Wegraeumen erst nach Rueckfrage -- danach ist der Uebertrag erledigt.
    await page.evaluate(() => window.sortierUebertragWegraeumen());
    await page.locator('#confirm-yes-btn').click();
    expect(await leseUebertrag(page)).toHaveLength(0);
    await expect(page.locator('#sortier-uebertrag-hinweis')).toBeHidden();
  });

  test('zwei Tage nicht geleert: der aeltere Uebertrag geht nicht verloren', async ({ page }) => {
    // Vorgestern liegt schon im Uebertrag, gestern kommt jetzt dazu.
    const alterUebertrag = [
      sortEintrag({ tageZurueck: 2, sorte: 'Artikel Vorgestern', netto: 111 }),
    ];
    const gestern = [
      sortEintrag({ tageZurueck: 1, sorte: 'Artikel Gestern', netto: 222 }),
    ];
    await setupApp(page, gestern, alterUebertrag);
    await closeChangelogIfOpen(page);

    const uebertrag = await leseUebertrag(page);
    expect(uebertrag).toHaveLength(2);
    const sorten = uebertrag.map((e) => e.sorte).sort();
    expect(sorten).toEqual(['Artikel Gestern', 'Artikel Vorgestern']);
    expect(await leseEntriesSort(page)).toHaveLength(0);

    // Mehrfacher Aufbau der Ansicht darf nichts verdoppeln.
    await page.evaluate(() => window.loadRechnerData());
    await page.evaluate(() => window.loadRechnerData());
    expect(await leseUebertrag(page)).toHaveLength(2);

    // Beide Tage stehen auch auf dem Nachdruck.
    await page.evaluate(() => window.uebertragNachdruckDrucken());
    await page.waitForTimeout(600);
    const drucke = await page.evaluate(() => window.__gedruckt);
    expect(drucke[0].html).toContain('111,00 kg');
    expect(drucke[0].html).toContain('222,00 kg');
  });

  test('zweiter Riegel traegt allein: alter Eintrag wird beim Drucken nicht gebucht', async ({ page }) => {
    // Schritt 2 wird hier bewusst uebersprungen -- geprueft wird nur der Riegel im Druck.
    const heute = [sortEintrag({ tageZurueck: 0, sorte: 'Artikel Heute', netto: 60 })];
    await setupApp(page, heute);
    await closeChangelogIfOpen(page);

    // Alten Eintrag NACH dem Aufbau der Ansicht in die Arbeitsliste schmuggeln.
    await page.evaluate((alt) => entriesSort.push(alt), sortEintrag({ tageZurueck: 1, sorte: 'Artikel Gestern', netto: 900 }));
    expect(await leseEntriesSort(page)).toHaveLength(2);

    await druckeWiegeschein(page);

    // Nur die 60 kg von heute -- der zweite Riegel haelt die 900 kg heraus.
    expect(await gebuchteSummeHeute(page)).toBe(60);
    const drucke = await page.evaluate(() => window.__gedruckt);
    expect(drucke[0].html).toContain('60,00 kg');
    expect(drucke[0].html).not.toContain('900,00 kg');
  });

  // -------------------------------------------------------------------------
  // 2026-08-18, nachgemessen von Rico: Schritt 2 hat mitten am Tag eine NEUE Sitzung
  // angelegt. Die Sitzungs-ID ist aber der Schluessel, an dem bucheTeamSortierungBeimDruck()
  // erkennt, was an diesem Tag schon gebucht wurde -- ein Wechsel setzt den Zaehler auf 0,
  // der naechste Druck bucht die volle Menge ein zweites Mal.
  // -------------------------------------------------------------------------

  test('Handy lief ueber Nacht: Sync-Knopf mitten am Tag erzeugt keine Doppelbuchung', async ({ page }) => {
    // Beim Start stehen nur heutige Eintraege da -- der Riegel greift also noch nicht.
    const heute = [sortEintrag({ tageZurueck: 0, sorte: 'Artikel A', netto: 500 })];
    await setupApp(page, heute);
    await closeChangelogIfOpen(page);
    await expect(page.locator('#sortier-tageswechsel-modal')).toBeHidden();

    // Das Handy lief ueber Nacht durch: die Liste von gestern steht noch in der Arbeitsliste,
    // weil pruefeTageswechselSortierung() seit dem Datumswechsel nicht mehr gelaufen ist.
    await page.evaluate(
      (alt) => { entriesSort.unshift(alt); window.saveRechnerDB(); },
      sortEintrag({ tageZurueck: 1, sorte: 'Artikel Gestern', netto: 900 })
    );

    // Erster Druck: nur die 500 kg von heute, der zweite Riegel haelt die 900 kg heraus.
    await druckeWiegeschein(page);
    expect(await gebuchteSummeHeute(page)).toBe(500);
    const sitzungVorher = await page.evaluate(() => window.getSortierSitzungId());

    // Der Sync-Knopf mitten am Tag: loadRechnerData() laeuft erneut, findet den alten Eintrag
    // und legt ihn beiseite. Die Sitzungs-ID muss dabei stehen bleiben.
    await page.evaluate(() => window.loadRechnerData());
    await page.locator('#sortier-tageswechsel-ok-btn').click();
    expect(await page.evaluate(() => window.getSortierSitzungId())).toBe(sitzungVorher);
    // Beiseitegelegt wird trotzdem -- nichts geht verloren.
    expect(await leseUebertrag(page)).toHaveLength(1);
    expect(await leseEntriesSort(page)).toHaveLength(1);

    // Zweiter Druck ohne neue Ware: es darf KEIN Kilo dazukommen (vorher: 1000 kg).
    await druckeWiegeschein(page);
    expect(await gebuchteSummeHeute(page)).toBe(500);

    // Weiter erfassen und noch einmal drucken: nur die Differenz wird nachgebucht.
    await page.evaluate(() => {
      entriesSort.push({
        id: String(Date.now()),
        datum: window.getLocalISO(),
        lief: entriesSort[0].lief,
        sorte: 'Artikel A',
        netto: 200,
        leergut: {},
      });
      window.saveRechnerDB();
    });
    await druckeWiegeschein(page);
    expect(await gebuchteSummeHeute(page)).toBe(700);
  });

  test('loadRechnerData() mehrfach am selben Tag: die Sitzungs-ID bleibt stabil', async ({ page }) => {
    const heute = [sortEintrag({ tageZurueck: 0, sorte: 'Artikel A', netto: 300 })];
    await setupApp(page, heute);
    await closeChangelogIfOpen(page);

    // Sechs Stellen rufen loadRechnerData() mitten am Tag auf (Sync-Knopf, Auto-Sync,
    // LKW Empfangen, "Aus Cloud laden", Notfall-Wiederherstellung, Entsperren).
    const sitzung = await page.evaluate(() => window.getSortierSitzungId());
    await page.evaluate(() => { window.loadRechnerData(); window.loadRechnerData(); window.loadRechnerData(); });
    expect(await page.evaluate(() => window.getSortierSitzungId())).toBe(sitzung);

    // Auch mit einem alten Eintrag dazwischen: beiseitegelegt wird er, die Sitzung bleibt.
    await page.evaluate(
      (alt) => { entriesSort.push(alt); window.saveRechnerDB(); },
      sortEintrag({ tageZurueck: 2, sorte: 'Artikel Vorgestern', netto: 50 })
    );
    await page.evaluate(() => window.loadRechnerData());
    await page.locator('#sortier-tageswechsel-ok-btn').click();
    await page.evaluate(() => window.loadRechnerData());
    expect(await page.evaluate(() => window.getSortierSitzungId())).toBe(sitzung);
    expect(await leseUebertrag(page)).toHaveLength(1);
    expect(await leseEntriesSort(page)).toHaveLength(1);
  });
});
