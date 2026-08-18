// Playwright E2E-Tests fuer das Control Center (control/index.html).
//
// WICHTIG: blockCloud(page) wird in JEDEM Test als Erstes aufgerufen (siehe helpers.js).
// Das Control Center hat KEINEN PIN-Screen (anders als die Rechner-App) - verifiziert durch
// Lesen von control/index.html: kein #pin-overlay/#pin-input o.ae. auf dieser Seite, die App
// ist direkt unter /control/index.html erreichbar.
//
// DB-Persistenz: Beim Start liest control-center-core.js (window.onload) den Stand aus
// localStorage-Key "logistik_offline_db" (JSON, Form siehe `db`-Objekt am Kopf von
// control-center-core.js: { suppliers, articles, todo, lose, later, hidden, workers,
// workerColors, deliveries, teamSortierBuchungen, deletedSortierBuchungen, artikelMarkt,
// tierartZuordnung, ... }). Ohne vorhandenen localStorage-Eintrag startet die App mit den
// eingebauten Defaults (u.a. workers: ["Ahmed","Dominik","Robert","Julian","Alex"]).
//
// Fuer den Tagesexport-Regressionstest (Test 6) wird NICHT ueber localStorage geseedet,
// sondern das laufende globale `db`-Objekt per page.evaluate() direkt nach dem Laden
// manipuliert. Grund: window.onload ruft hydrateSortierBuchungenInDb() auf, das
// teamSortierBuchungen serverseitig korrekt gegen deletedSortierBuchungen im (richtigen)
// Format sessionKey|datum filtert (siehe js/gemeinsam/metriken.js mergeTeamSortierBuchungen
// -> istSortierBuchungGeloescht). Wuerde man ueber localStorage vor dem Laden seeden, wuerde
// dieser (korrekte) Merge-Schritt die geloeschte Buchung schon vor dem Rendern entfernen und
// der eigentliche Bug in berechneSortierExportNachTierart() (control-center-tagesexport.js)
// koennte gar nicht mehr beobachtet werden. Direktes Einspeisen ins bereits geladene `db`
// nach dem Start umgeht diesen Merge-Schritt und trifft die zu testende Funktion direkt.

const { test, expect } = require('@playwright/test');
const { blockCloud } = require('./helpers');

/** Wartet, bis die App fertig initialisiert ist (renderAll() im window.onload aktualisiert
 *  #db-status von "Lade Datenbank..." auf "Stand: ..."). */
async function waitForAppReady(page) {
  await expect(page.locator('#db-status')).not.toHaveText('Lade Datenbank…', { timeout: 10000 });
}

/** Klappt eine Sidebar-Nav-Gruppe auf (Verwaltung/Info/Einstellungen sind standardmaessig
 *  eingeklappt, siehe toggleNavGroup() in index.html). */
async function openNavGroup(page, groupId) {
  await page.locator(`#${groupId} .nav-group-header`).click();
  await expect(page.locator(`#${groupId} .nav-group-body`)).toBeVisible();
}

test.describe('Control Center - Grundgeruest', () => {
  test('App laedt ohne PIN-Sperre und zeigt Dashboard + Sidebar-Navigation', async ({ page }) => {
    await blockCloud(page);
    await page.goto('/control/index.html');
    await waitForAppReady(page);

    // Keine PIN-Sperre: Home-Tab ist sofort aktiv und sichtbar.
    await expect(page.locator('#tab-home')).toHaveClass(/active/);
    await expect(page.locator('#tab-home h1')).toHaveText('Übersicht');

    // Sidebar-Hauptpunkte vorhanden.
    // Build 142: der Kopf steht seit dem neuen Design zweizeilig - .brand "Tresch", .sub
    // "Control Center". Vorher stand beides zusammen in .brand.
    await expect(page.locator('.sidebar-header .brand')).toHaveText('Tresch');
    await expect(page.locator('.sidebar-header .sub')).toHaveText('Control Center');
    await expect(page.locator('.nav-item', { hasText: 'Übersicht' })).toBeVisible();
    await expect(page.locator('#group-verwaltung .nav-group-header')).toContainText('Verwaltung');
    await expect(page.locator('#nav-briefing')).toContainText('Tages-Briefing');
    await expect(page.locator('#group-info .nav-group-header')).toContainText('Info');
    await expect(page.locator('#group-einstellungen .nav-group-header')).toContainText('Einstellungen');

    // Dashboard-Statistik-Kacheln vorhanden (Werte sind Default-DB-abhaengig, nur Praesenz pruefen).
    await expect(page.locator('#home-stat-articles')).toBeVisible();
    await expect(page.locator('#home-stat-todo')).toBeVisible();
    await expect(page.locator('#home-stat-suppliers')).toBeVisible();
    await expect(page.locator('#home-stat-workers')).toBeVisible();
    await expect(page.locator('#home-stat-open-del')).toBeVisible();
  });

  test('Navigation zwischen den Haupt-Tabs (Artikel, Lieferanten, Mitarbeiter, Statistiken, Tagesexport)', async ({ page }) => {
    await blockCloud(page);
    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await openNavGroup(page, 'group-verwaltung');

    await page.locator('.nav-group-body .nav-item', { hasText: 'Artikel-Zuordnung' }).click();
    await expect(page.locator('#tab-artikel')).toHaveClass(/active/);
    await expect(page.locator('.v10-header h2')).toHaveText('Artikel-Zuordnung');

    await page.locator('.nav-group-body .nav-item', { hasText: 'Lieferanten' }).click();
    await expect(page.locator('#tab-lieferanten')).toHaveClass(/active/);
    await expect(page.locator('#tab-artikel')).not.toHaveClass(/active/);
    await expect(page.locator('#tab-lieferanten h1')).toContainText('Lieferanten verwalten');

    await page.locator('#nav-mitarbeiter').click();
    await expect(page.locator('#tab-mitarbeiter')).toHaveClass(/active/);
    await expect(page.locator('#tab-mitarbeiter h1')).toHaveText('Mitarbeiter');

    await openNavGroup(page, 'group-info');

    await page.locator('.nav-group-body .nav-item', { hasText: 'Statistiken' }).click();
    await expect(page.locator('#tab-stats')).toHaveClass(/active/);
    await expect(page.locator('#tab-stats h1')).toContainText('Versand-Analyse');

    await page.locator('.nav-group-body .nav-item', { hasText: 'Tagesexport' }).click();
    await expect(page.locator('#tab-tagesexport')).toHaveClass(/active/);
    await expect(page.locator('#tab-tagesexport h1')).toContainText('Tagesexport');
  });
});

test.describe('Control Center - Artikel-Verwaltung', () => {
  test('Neuen Fertig-Artikel und Lose-Artikel anlegen', async ({ page }) => {
    await blockCloud(page);
    page.on('dialog', (d) => d.accept());
    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await openNavGroup(page, 'group-verwaltung');
    await page.locator('.nav-group-body .nav-item', { hasText: 'Artikel-Zuordnung' }).click();
    await expect(page.locator('#tab-artikel')).toHaveClass(/active/);

    // Fertig-Artikel anlegen (landet in saveNewFertigArticle() -> db.todo -> Reiter "Offen").
    await page.locator('#create-fertig-nr').fill('90501');
    await page.locator('#create-fertig-name').fill('E2E Test Fertig Artikel');
    await page.locator('.new-article-strip.fertig .btn-strip').click();

    await expect(page.locator('#tab-todo')).toHaveClass(/active/); // Reiter "Offen" ist Default
    await expect(page.locator('#v10-tableBody')).toContainText('90501');
    await expect(page.locator('#v10-tableBody')).toContainText('E2E Test Fertig Artikel');

    // Lose-Artikel anlegen (landet in saveNewLoseArticle() -> db.lose -> Lose-Pool-Menue).
    await page.locator('#create-lose-nr').fill('90502');
    await page.locator('#create-lose-name').fill('E2E Test Lose Artikel');
    await page.locator('.new-article-strip.lose .btn-strip').click();

    await page.locator('.btn-lose-menu').click(); // "🍔 Lose (n)" oeffnet den Lose-Pool
    await expect(page.locator('#menu-lose')).toHaveClass(/open/);
    await expect(page.locator('#lose-pool-container')).toContainText('90502');
    await expect(page.locator('#lose-pool-container')).toContainText('E2E Test Lose Artikel');
  });

  // BUG GUARD - erwartet AKTUELL FEHLZUSCHLAGEN.
  // Guard fuer KNOWN_BUGS.md: "Duplikat-Pruefung fuer Fertig-/Lose-Nr prueft nicht alle 4 Pools".
  // saveNewFertigArticle() (control-center-artikel.js:120) prueft nur db.todo + db.articles,
  // saveNewLoseArticle() (Zeile 140) prueft nur db.lose - beide ignorieren die jeweils anderen
  // Pools (todo/later/hidden/lose), anders als poolArticleExists() (Zeile 311), das korrekt
  // alle 4 Pools + db.articles prueft. Der folgende Test dokumentiert das GEWUENSCHTE Verhalten
  // (keine doppelten Fertig-/Lose-Nummern ueber alle Pools hinweg) und schlaegt deshalb mit dem
  // aktuellen Code fehl, bis der Bug behoben ist.
  test('BUG GUARD (erwartet aktuell fehlzuschlagen): Fertig-Nr darf nicht doppelt vergeben werden, auch wenn sie bereits im Lose-Pool existiert', async ({ page }) => {
    await blockCloud(page);
    const dialogMessages = [];
    page.on('dialog', async (d) => { dialogMessages.push(d.message()); await d.accept(); });
    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await openNavGroup(page, 'group-verwaltung');
    await page.locator('.nav-group-body .nav-item', { hasText: 'Artikel-Zuordnung' }).click();
    await expect(page.locator('#tab-artikel')).toHaveClass(/active/);

    const dupNr = 'DUPTEST01';

    // Zuerst als Lose-Artikel anlegen.
    await page.locator('#create-lose-nr').fill(dupNr);
    await page.locator('#create-lose-name').fill('Dup Test Lose');
    await page.locator('.new-article-strip.lose .btn-strip').click();

    // Danach denselben Nummern-Wert als Fertig-Artikel anzulegen versuchen.
    // GEWUENSCHT: Ablehnung per Alert ("... existiert bereits!"), kein Eintrag in db.todo.
    await page.locator('#create-fertig-nr').fill(dupNr);
    await page.locator('#create-fertig-name').fill('Dup Test Fertig');
    await page.locator('.new-article-strip.fertig .btn-strip').click();

    expect(dialogMessages.some((m) => m.includes('existiert bereits'))).toBe(true);
    await expect(page.locator('#v10-tableBody')).not.toContainText('Dup Test Fertig');
  });
});

test.describe('Control Center - Lieferanten-Statistik', () => {
  test('Lieferanten-Statistik-Modal rendert ohne JS-Fehler', async ({ page }) => {
    await blockCloud(page);
    page.on('dialog', (d) => d.accept());
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(String(err)));
    page.on('console', (msg) => { if (msg.type() === 'error') jsErrors.push(msg.text()); });

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await openNavGroup(page, 'group-verwaltung');
    await page.locator('.nav-group-body .nav-item', { hasText: 'Lieferanten' }).click();
    await expect(page.locator('#tab-lieferanten')).toHaveClass(/active/);

    const supplierName = 'E2E Test Lieferant';
    await page.locator('#new-sup-name').fill(supplierName);
    await page.locator('.lief-add-card button', { hasText: 'Hinzufügen' }).click();

    await expect(page.locator('#sup-body')).toContainText(supplierName);

    // Fresh test context => genau ein Lieferant vorhanden, daher genuegt ein direkter Klick
    // auf den (einzigen) Statistik-Button innerhalb der Lieferanten-Liste.
    await page.locator('#sup-body').getByText('📊 Statistik').click();
    await expect(page.locator('#supplier-stats-overlay')).toBeVisible();
    await expect(page.locator('#supplier-stats-title')).toContainText(supplierName);

    await page.locator('#supplier-stats-overlay button', { hasText: 'Schließen' }).click();
    await expect(page.locator('#supplier-stats-overlay')).toBeHidden();

    expect(jsErrors, `Unerwartete JS-Fehler: ${jsErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Control Center - Mitarbeiter', () => {
  test('Mitarbeiter-Tab zeigt die konfigurierte Team-Liste', async ({ page }) => {
    await blockCloud(page);
    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await openNavGroup(page, 'group-verwaltung');
    await page.locator('#nav-mitarbeiter').click();
    await expect(page.locator('#tab-mitarbeiter')).toHaveClass(/active/);

    // Ohne localStorage-Vorbelegung startet die App mit den eingebauten Default-Mitarbeitern
    // (siehe control-center-core.js: db.workers = ["Ahmed","Dominik","Robert","Julian","Alex"]).
    await expect(page.locator('#worker-count')).toHaveText('5');
    const workerBody = page.locator('#worker-body');
    for (const name of ['Ahmed', 'Dominik', 'Robert', 'Julian', 'Alex']) {
      await expect(workerBody).toContainText(name);
    }
    await expect(page.locator('#worker-empty-hint')).toBeHidden();
  });
});

test.describe('Control Center - Tagesexport', () => {
  // BUG GUARD - erwartet AKTUELL FEHLZUSCHLAGEN.
  // Guard fuer KNOWN_BUGS.md: "Gelöschte Sortier-Buchungen tauchen im Tagesexport wieder auf".
  // berechneSortierExportNachTierart() (control-center-tagesexport.js:118) baut den
  // Loesch-Vergleichsschluessel als `b.id || datum|lief|sorte`, waehrend das restliche System
  // (deleteSortierBuchung in control-center-stats.js:773, sortierBuchungMergeKey in
  // js/gemeinsam/metriken.js:491) konsistent `sessionKey + '|' + datum` verwendet. Dadurch
  // matcht eine als geloescht markierte Buchung dort nie und wird trotzdem in die Tagesexport-
  // Summe eingerechnet. Dieser Test seeded eine Buchung + den dazugehoerigen KORREKTEN
  // Loeschschluessel und erwartet, dass ihr kg-Wert NICHT mitgezaehlt wird - das schlaegt mit
  // dem aktuellen Code fehl (zeigt 100 kg statt 0 kg), bis der Bug behoben ist.
  test('BUG GUARD (erwartet aktuell fehlzuschlagen): geloeschte Sortier-Buchung darf nicht in Tagesexport-Summe erscheinen', async ({ page }) => {
    await blockCloud(page);
    await page.goto('/control/index.html');
    await waitForAppReady(page);

    const todayIso = await page.evaluate(() => new Date().toISOString().slice(0, 10));

    // Direkt ins bereits initialisierte `db`-Objekt seeden (siehe Erklaerung am Dateikopf,
    // warum hier NICHT ueber localStorage vor dem Laden geseedet wird).
    await page.evaluate((datum) => {
      const fertigNr = '99999';
      const sessionKey = 'e2e-test-session-1';
      db.tierartZuordnung = db.tierartZuordnung || {};
      db.tierartZuordnung[fertigNr] = 'Schwein';
      db.artikelMarkt = db.artikelMarkt || {};
      db.artikelMarkt[fertigNr] = 'export';
      db.teamSortierBuchungen = db.teamSortierBuchungen || [];
      db.teamSortierBuchungen.push({
        sessionKey,
        datum,
        fertigNr,
        gebuchtKg: 100,
        lief: 'E2E Test Lieferant',
        sorte: 'E2E Test Sorte',
      });
      // Kanonisches/korrektes Loeschschluessel-Format (sessionKey|datum) - siehe
      // control-center-stats.js deleteSortierBuchung() und metriken.js sortierBuchungMergeKey().
      db.deletedSortierBuchungen = db.deletedSortierBuchungen || [];
      db.deletedSortierBuchungen.push(sessionKey + '|' + datum);
    }, todayIso);

    await openNavGroup(page, 'group-info');
    await page.locator('.nav-group-body .nav-item', { hasText: 'Tagesexport' }).click();
    await expect(page.locator('#tab-tagesexport')).toHaveClass(/active/);

    // GEWUENSCHT: die geloeschte Buchung darf ihre 100kg nicht zur Tierart "Schwein" beitragen.
    await expect(page.locator('#te-sum-Schwein')).toHaveText('0 kg');
  });
});
