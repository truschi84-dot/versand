// Playwright-Tests fuer die Rechner-App (index.html).
//
// WICHTIG: blockCloud() + unlockRechner() muessen in jedem Test zuerst laufen (siehe helpers.js).
// Zusaetzlich wird hier per addInitScript() eine kleine lokale Stammdaten-Basis
// (Lieferant, Artikel, Noelke-Produkt) in den localStorage geschrieben, BEVOR die Seite
// navigiert -- ohne Cloud-Zugriff waeren Lieferanten-/Sorten-Dropdowns sonst leer und
// die Erfassungs-Flows liessen sich nicht ueber echte UI-Interaktion durchspielen.

const { test, expect } = require('@playwright/test');
const { blockCloud, unlockRechner } = require('./helpers');

const SEED_LOGISTIK_DB = {
  suppliers: ['Testlieferant GmbH'],
  customers: ['Testkunde Spedition'],
  workers: ['Max Mustermann'],
  articles: [
    { nr: '1001', name: 'Testsorte Apfel', suppliers: ['Testlieferant GmbH'] },
  ],
};

const SEED_RECHNER_DB = {
  savedProdukteRaw: ['[9001] Testprodukt Noelke'],
};

async function seedLocalData(page) {
  await page.addInitScript(({ logistik, rechner }) => {
    window.localStorage.setItem('kombi_logistik_db', JSON.stringify(logistik));
    window.localStorage.setItem('kombi_rechner_db', JSON.stringify(rechner));
  }, { logistik: SEED_LOGISTIK_DB, rechner: SEED_RECHNER_DB });
}

async function closeChangelogIfOpen(page) {
  const modal = page.locator('#changelog-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Klasse, weiter!' }).click();
    await modal.waitFor({ state: 'hidden' });
  }
}

/** Gemeinsamer Einstieg fuer jeden Test: Cloud blocken, Stammdaten seeden, PIN entsperren. */
async function setupApp(page) {
  await seedLocalData(page);
  await blockCloud(page);
  await unlockRechner(page);
  await closeChangelogIfOpen(page);
}

/** Navigation ausschliesslich ueber das Burger-Menue (kein Tab-Balken im Rechner). */
async function openDrawerTab(page, tabId) {
  await page.locator('.burger').click();
  await page.locator('#menu-tab-' + tabId).click();
  await expect(page.locator('#tab-' + tabId)).toHaveClass(/active/);
}

test.describe('Rechner App', () => {
  test('index.html laedt ohne JavaScript-Fehler (script.js/logistik.js Konflikt)', async ({ page }) => {
    // Regressions-Wache fuer einen real gefundenen Bug: index.html laedt sowohl js/script.js
    // (deklariert "function getLocalISO()") als auch js/logistik.js (deklariert
    // "const getLocalISO = () => ..."). Zwei Top-Level-Deklarationen desselben Namens ueber
    // mehrere <script>-Tags hinweg werfen einen SyntaxError ("Identifier 'getLocalISO' has
    // already been declared"), wodurch js/logistik.js auf der Rechner-Seite komplett
    // ausfaellt (siehe KNOWN_BUGS.md). Dieser Test erwartet KEINE Fehler und schlaegt daher
    // aktuell absichtlich fehl, bis der Namenskonflikt behoben ist.
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await blockCloud(page);
    await seedLocalData(page);
    await unlockRechner(page);
    await page.waitForTimeout(500);
    expect(pageErrors).toEqual([]);
  });

  test('App entsperrt sich per PIN und zeigt die Haupt-Tabs im Menue', async ({ page }) => {
    await setupApp(page);

    await expect(page.locator('#pin-protection-overlay')).toBeHidden();
    await expect(page.locator('#tab-lkw')).toHaveClass(/active/);

    await page.locator('.burger').click();
    await expect(page.locator('#menu-tab-lkw')).toBeVisible();
    await expect(page.locator('#menu-tab-sort')).toBeVisible();
    await expect(page.locator('#menu-tab-noelke')).toBeVisible();
    await expect(page.locator('#menu-tab-leergut')).toBeVisible();
    await expect(page.locator('#menu-tab-brandenburg')).toBeVisible();
  });

  test('LKW-Erfassung: normaler Eintrag mit Lieferant, Gewicht und Leergut', async ({ page }) => {
    await setupApp(page);

    await page.selectOption('#lief', { label: 'Testlieferant GmbH' });
    await page.fill('#bru', '100');
    await page.fill('#lkw_lg_0', '5'); // E2
    await page.fill('#lkw_lg_2', '2'); // H1 (ueberschreibt den Standardwert 1)
    await page.locator('#tab-lkw').getByRole('button', { name: '+ Speichern' }).click();

    const firstEntry = page.locator('#list .swipe-wrap').first();
    await expect(firstEntry).toContainText('Testlieferant GmbH');
    // netto = 100 brutto - (5*2 E2 + 2*18 H1) = 100 - 46 = 54,00 kg
    await expect(firstEntry).toContainText('54,00 kg');
    await expect(firstEntry).toContainText('5 E2');
    await expect(firstEntry).toContainText('2 H1');

    const leergutInline = page.locator('#app2_wrapper .sup-leergut-inline').first();
    await expect(leergutInline).toContainText('5 E2');
    await expect(leergutInline).toContainText('2 H1');
  });

  test('Regression: Leergut-Zaehler waechst nicht bei mehrfachem Rendern (renderLKW)', async ({ page }) => {
    // Deckt einen realen Bug ab: renderLKW()/renderSort() haben frueher entry.leergut
    // direkt mutiert statt zu klonen, wodurch die Stueckzahlen bei jedem erneuten Rendern
    // weiter angewachsen sind. Dieser Test ist bewusst so geschrieben, dass er bei
    // ungefixtem Code fehlschlaegt -- das ist hier korrektes Verhalten.
    await setupApp(page);

    // Sonderposten-Eintrag mit 3x E2 anlegen (einziger Pfad, der den alten Bug ueberhaupt
    // sichtbar macht, da nur dort sowohl entry.leergut als auch das Alt-Feld entry.e2 gesetzt werden).
    await page.selectOption('#lief', { label: 'Testlieferant GmbH' });
    await page.locator('#tab-lkw').getByRole('button', { name: '+ Sonderp.' }).click();
    await page.fill('#s-e2kisten', '3');
    await page.fill('#s-brutto', '100');
    await page.locator('#tab-lkw').getByRole('button', { name: '+ Speichern' }).click();

    // Zweiten, leergut-freien Eintrag anlegen (sonder-Modus wird von addPal() automatisch
    // wieder verlassen). H1-Standardwert explizit leeren, damit dieser Eintrag wirklich kein
    // Leergut hat und die Messung sauber nur den Sonderposten-Eintrag betrifft.
    await page.fill('#lkw_lg_2', '');
    await page.fill('#bru', '50');
    await page.locator('#tab-lkw').getByRole('button', { name: '+ Speichern' }).click();

    const leergutInline = page.locator('#app2_wrapper .sup-leergut-inline').first();
    const textAfterAdding = (await leergutInline.innerText()).trim();
    expect(textAfterAdding).toBe('3 E2');

    // Realistischer Zweit-Trigger fuer renderLKW(): einen ANDEREN Eintrag (den zweiten,
    // leergut-freien) oeffnen und speichern -- das ruft renderLKW() erneut fuer die
    // komplette Liste auf, inklusive des Sonderposten-Eintrags.
    const newestCard = page.locator('#list .swipe-wrap').first().locator('.swipeable');
    await newestCard.click();
    await expect(page.locator('#edit-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.locator('#edit-modal')).toBeHidden();

    const textAfterSecondRender = (await leergutInline.innerText()).trim();
    expect(textAfterSecondRender).toBe(textAfterAdding);
    expect(textAfterSecondRender).toBe('3 E2');
  });

  test('Sortierung: Eintrag mit Lieferant, Sorte und Leergut erfassen', async ({ page }) => {
    await setupApp(page);
    await openDrawerTab(page, 'sort');

    await page.selectOption('#lief-sort', { label: 'Testlieferant GmbH' });
    await page.locator('#selected-sorte-display').click();
    await expect(page.locator('#search-modal')).toBeVisible();
    await page.locator('#modal-results .result-item', { hasText: 'Testsorte Apfel' }).click();
    await expect(page.locator('#search-modal')).toBeHidden();
    await expect(page.locator('#selected-sorte-display')).toContainText('1001 - Testsorte Apfel');

    await page.fill('#bru-sort', '60');
    await page.fill('#sort_lg_0', '4'); // E2, H1 bleibt beim Standardwert 1

    await page.locator('#tab-sort').getByRole('button', { name: '+ Speichern' }).click();

    const firstEntry = page.locator('#list-sort .swipe-wrap').first();
    await expect(firstEntry).toContainText('1001 - Testsorte Apfel');
    // netto = 60 - (4*2 E2 + 1*18 H1) = 60 - 26 = 34,00 kg
    await expect(firstEntry).toContainText('34,00 kg');
    await expect(firstEntry).toContainText('4 E2');
    await expect(firstEntry).toContainText('1 H1');
  });

  test('Leergut-Zaehler: hochzaehlen und ueber Reset wieder auf 0 setzen', async ({ page }) => {
    await setupApp(page);
    await openDrawerTab(page, 'leergut');

    const entladenE2 = page.locator('#zaehler_entladen_lg_0');
    await entladenE2.waitFor({ state: 'visible', timeout: 10000 });

    const plusBtn = page.locator("#lg-zaehler-container button[onclick=\"changeLgZaehler('lg_0', 'entladen', 1)\"]");
    await plusBtn.click();
    await plusBtn.click();
    await plusBtn.click();
    await expect(entladenE2).toHaveValue('3');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Reset' }).click();

    await expect(entladenE2).toHaveValue('0');
  });

  test('Noelke: Produkt aus Katalog erfassen', async ({ page }) => {
    await setupApp(page);
    await openDrawerTab(page, 'noelke');

    await page.locator('#selected-noelke-display').click();
    await expect(page.locator('#search-modal')).toBeVisible();
    await page.locator('#modal-results .result-item', { hasText: 'Testprodukt Noelke' }).click();
    await expect(page.locator('#selected-noelke-display')).toContainText('Testprodukt Noelke');

    await page.fill('#n-e2', '4');
    await page.fill('#n-kg', '50');
    await page.locator('#tab-noelke').getByRole('button', { name: '+ Speichern' }).click();

    const firstEntry = page.locator('#list-noelke .swipe-wrap').first();
    await expect(firstEntry).toContainText('Testprodukt Noelke');
    await expect(firstEntry).toContainText('4 E2');
    // netto = 50 brutto - (4 * 2kg Tara) = 42,00 kg
    await expect(firstEntry).toContainText('42,00 kg');
  });

  test('Brandenburg Wareneingang: Palette per simuliertem QR-Scan erfassen', async ({ page }) => {
    await setupApp(page);
    await openDrawerTab(page, 'brandenburg');

    // Echtes Scannen laeuft ueber die Kamera und ist in Playwright nicht sinnvoll simulierbar.
    // handleBrandenburgScan(text) ist exakt die Funktion, die die Scanner-Integration aufruft
    // (siehe oninput="handleBrandenburgScan(this.value)" auf #brandenburg-scan-input) -- das
    // direkte Aufrufen bildet also denselben Codepfad ab wie ein echter Scan.
    await page.evaluate(() => {
      window.handleBrandenburgScan('(01)04012345678901(10)CHG001(3302)001500');
    });

    await expect(page.locator('#brandenburg-data-form')).toBeVisible();
    await expect(page.locator('#bb-artikel')).toHaveValue('04012345678901');
    await expect(page.locator('#bb-charge')).toHaveValue('CHG001');

    await page.fill('#bb-ls-nummer', '12345678');
    await page.fill('#bb-brutto', '20');
    await page.fill('#bb-e2', '2');

    await page.getByRole('button', { name: '+ Palette speichern' }).click();

    await expect(page.locator('#bb-counter')).toHaveText('1');
    const firstEntry = page.locator('#list-brandenburg .swipe-wrap').first();
    await expect(firstEntry).toContainText('04012345678901');
    await expect(firstEntry).toContainText('Charge: CHG001');
  });

  test('Loeschen: LKW-Eintrag per Swipe entfernen (native confirm() bestaetigen)', async ({ page }) => {
    await setupApp(page);

    await page.selectOption('#lief', { label: 'Testlieferant GmbH' });
    await page.fill('#bru', '80');
    await page.fill('#lkw_lg_0', '1');
    await page.locator('#tab-lkw').getByRole('button', { name: '+ Speichern' }).click();

    const wrap = page.locator('#list .swipe-wrap').first();
    await expect(wrap).toContainText('Testlieferant GmbH');
    await expect(page.locator('#list .swipe-wrap')).toHaveCount(1);

    // Der .swipe-bg-Loeschbutton liegt permanent im DOM, ist aber von der .swipeable-Karte
    // (hoeherer z-index) ueberdeckt, bis der Nutzer per Touch/Maus nach links wischt -- ein
    // Klick (auch mit force:true) trifft an dieser Koordinate weiterhin die deckende Karte,
    // nicht den Button darunter (Browser-Hit-Testing respektiert die z-index-Stapelreihenfolge
    // unabhaengig von Playwright-Actionability-Checks). Deshalb hier direkt die Funktion
    // aufrufen, die der Klick auf .swipe-bg ausloesen wuerde (onclick="deleteLkwEntry(0)")
    // -- das testet die eigentliche Loeschlogik (confirm(), splice, Speichern, Re-Render),
    // ohne die Wisch-Geste pixelgenau nachbauen zu muessen.
    page.once('dialog', (dialog) => dialog.accept());
    await page.evaluate(() => deleteLkwEntry(0));

    await expect(page.locator('#list .swipe-wrap')).toHaveCount(0);
  });

  test('Druck-Vorschau: Wiegeschein oeffnet ohne JS-Fehler', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await setupApp(page);
    await openDrawerTab(page, 'sort');

    await page.selectOption('#lief-sort', { label: 'Testlieferant GmbH' });
    await page.locator('#selected-sorte-display').click();
    await page.locator('#modal-results .result-item', { hasText: 'Testsorte Apfel' }).click();
    await page.fill('#bru-sort', '60');
    await page.locator('#tab-sort').getByRole('button', { name: '+ Speichern' }).click();
    await expect(page.locator('#list-sort .swipe-wrap')).toHaveCount(1);

    const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    await page.getByRole('button', { name: 'Wiegeschein' }).click();
    const popup = await popupPromise;

    expect(popup).not.toBeNull();
    await expect(popup.locator('h1.doc-title')).toHaveText('Paletten Wiegeschein', { timeout: 2000 });

    expect(pageErrors).toEqual([]);
  });
});
