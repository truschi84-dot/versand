// Wache fuer den gesicherten Leergut-Zaehler (js/rechner_leergut.js, 2026-08-18).
//
// Hintergrund: lgZaehlerState war eine reine Variable im Arbeitsspeicher. Sperrt sich das
// Handy, laedt die Seite neu oder startet die App neu, waren die gezaehlten Kisten weg --
// real passiert mit 120 Kisten. Der Stand liegt jetzt unter dem eigenen localStorage-
// Schluessel 'rechner_leergut_zaehler' (bewusst NICHT in der Rechner-DB, die wuerde per
// triggerAutoSync in die Cloud laufen).
//
// Die gefaehrlichste Stelle steht hier unter besonderer Wache: der geladene Stand muss
// nicht nur im Speicher, sondern auch in den EINGABEFELDERN stehen. Zeigt der Bildschirm
// 0 waehrend im Speicher 120 liegen, zaehlt der Mitarbeiter neu -- das waere schlimmer
// als der alte Zustand.
const { test, expect } = require('@playwright/test');
const { blockCloud, unlockRechner, RECHNER_PIN } = require('./helpers');

const SPEICHER_KEY = 'rechner_leergut_zaehler';

/** Dieselbe Rechnung wie getLocalISO() in js/script.js -- Ortszeit, kein UTC-Versatz. */
function heuteISO(tageZurueck = 0) {
  const d = new Date();
  d.setDate(d.getDate() - tageZurueck);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

const SEED_LOGISTIK_DB = {
  suppliers: ['Testlieferant GmbH'],
  customers: ['Testkunde Spedition'],
  workers: ['Max Mustermann'],
};

/**
 * Stammdaten seeden und optional einen vorgefundenen Zaehlstand hinterlegen.
 * rohSpeicher wird als Rohtext geschrieben, damit auch kaputter Inhalt testbar ist.
 * Ohne rohSpeicher wird der Schluessel NICHT angefasst -- addInitScript laeuft bei jeder
 * Navigation erneut und wuerde sonst beim Neuladen genau das loeschen, was geprueft wird.
 */
async function seedLocalData(page, rohSpeicher) {
  await page.addInitScript(({ logistik, key, roh }) => {
    window.localStorage.setItem('kombi_logistik_db', JSON.stringify(logistik));
    if (roh !== null) window.localStorage.setItem(key, roh);
  }, { logistik: SEED_LOGISTIK_DB, key: SPEICHER_KEY, roh: rohSpeicher === undefined ? null : rohSpeicher });
}

async function closeChangelogIfOpen(page) {
  const modal = page.locator('#changelog-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Klasse, weiter!' }).click();
    await modal.waitFor({ state: 'hidden' });
  }
}

async function setupApp(page, rohSpeicher) {
  await seedLocalData(page, rohSpeicher);
  await blockCloud(page);
  await unlockRechner(page);
  await closeChangelogIfOpen(page);
}

/**
 * Seite neu laden wie beim Handy nach Sperre/Neustart. Die PIN-Abfrage kommt in derselben
 * Sitzung nicht noch einmal -- wenn doch, wird sie hier beantwortet.
 */
async function ladeSeiteNeu(page) {
  await page.goto('/index.html');
  const pinInput = page.locator('#pin-input');
  if (await pinInput.isVisible().catch(() => false)) {
    await pinInput.fill(RECHNER_PIN);
    await page.locator('#pin-submit-btn').click();
  }
  await page.locator('#pin-protection-overlay').waitFor({ state: 'hidden' });
  await closeChangelogIfOpen(page);
}

/** Leergut-Tab ueber das Burger-Menue oeffnen und warten, bis der Zaehler aufgebaut ist. */
async function oeffneLeergut(page) {
  await page.locator('.burger').click();
  await page.locator('#menu-tab-leergut').click();
  await expect(page.locator('#tab-leergut')).toHaveClass(/active/);
  // lg_0 = E2, lg_2 = H1 (lg_1 = Herta wird im Zaehler ausgeblendet).
  await expect(page.locator('#zaehler_entladen_lg_0')).toBeVisible();
}

/** Gesicherter Stand, wie ihn saveLgZaehler() schreibt. */
function gesicherterStand(datum, kunde, state) {
  return JSON.stringify({ date: datum, kunde: kunde, state: state });
}

async function leseSpeicher(page) {
  return page.evaluate((key) => window.localStorage.getItem(key), SPEICHER_KEY);
}

async function leseState(page) {
  return page.evaluate(() => lgZaehlerState);
}

test.describe('Leergut-Zaehler wird gesichert', () => {
  test('Gezaehlte Kisten ueberleben das Neuladen -- im Speicher UND in den Eingabefeldern', async ({ page }) => {
    await setupApp(page);
    await oeffneLeergut(page);

    await page.fill('#lg-kunde', 'Testkunde Spedition');
    await page.locator('#lg-kunde').blur();

    // 120 E2 entladen ueber "+Menge / Dazu" (changeLgZaehler)
    await page.fill('#quick_entladen_lg_0', '120');
    await page.locator('#tab-leergut').getByRole('button', { name: 'Dazu' }).first().click();
    await expect(page.locator('#zaehler_entladen_lg_0')).toHaveValue('120');

    // 7 H1 geladen ueber direkte Eingabe (updateLgZaehlerState)
    await page.fill('#zaehler_geladen_lg_2', '7');
    await page.locator('#zaehler_geladen_lg_2').blur();

    // App neu starten: Seite neu laden, Leergut wieder oeffnen
    await ladeSeiteNeu(page);
    await oeffneLeergut(page);

    // Das ist die eigentliche Falle: der Bildschirm muss die Zahlen zeigen.
    await expect(page.locator('#zaehler_entladen_lg_0')).toHaveValue('120');
    await expect(page.locator('#zaehler_geladen_lg_2')).toHaveValue('7');
    await expect(page.locator('#lg-kunde')).toHaveValue('Testkunde Spedition');

    // ... und Speicher und Bildschirm muessen dasselbe sagen.
    const state = await leseState(page);
    expect(state.lg_0.entladen).toBe(120);
    expect(state.lg_2.geladen).toBe(7);
  });

  test('Stand von gestern wird verworfen -- der heutige Beleg startet bei 0', async ({ page }) => {
    const gestern = gesicherterStand(heuteISO(1), 'Testkunde Spedition', {
      lg_0: { entladen: 120, geladen: 0 },
    });
    await setupApp(page, gestern);
    await oeffneLeergut(page);

    await expect(page.locator('#zaehler_entladen_lg_0')).toHaveValue('0');
    await expect(page.locator('#lg-kunde')).toHaveValue('');
    const state = await leseState(page);
    expect(state.lg_0).toEqual({ entladen: 0, geladen: 0 });
    // Der alte Zettel bleibt nicht liegen.
    expect(await leseSpeicher(page)).toBeNull();
  });

  test('Stand eines anderen Kunden wird nicht auf den offenen Beleg gezogen', async ({ page }) => {
    const fremd = gesicherterStand(heuteISO(), 'Kunde A GmbH', {
      lg_0: { entladen: 120, geladen: 0 },
    });
    await setupApp(page, fremd);
    await oeffneLeergut(page);

    // Im Feld steht jetzt ein anderer Kunde -- danach wird der Zaehler neu aufgebaut.
    // Direkt per evaluate, damit kein Blur dazwischenfunkt und der Fall eindeutig bleibt.
    await page.evaluate(() => {
      document.getElementById('lg-kunde').value = 'Kunde B Spedition';
      initLgZaehler();
    });

    await expect(page.locator('#zaehler_entladen_lg_0')).toHaveValue('0');
    const state = await leseState(page);
    expect(state.lg_0).toEqual({ entladen: 0, geladen: 0 });
  });

  test('Reset leert Zaehler und gesicherten Stand', async ({ page }) => {
    await setupApp(page);
    await oeffneLeergut(page);

    await page.fill('#zaehler_entladen_lg_0', '42');
    await page.locator('#zaehler_entladen_lg_0').blur();
    expect(await leseSpeicher(page)).not.toBeNull();

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('#tab-leergut').getByRole('button', { name: 'Reset' }).click();

    await expect(page.locator('#zaehler_entladen_lg_0')).toHaveValue('0');
    await expect(page.locator('#lg-kunde')).toHaveValue('');
    const state = await leseState(page);
    expect(state.lg_0).toEqual({ entladen: 0, geladen: 0 });
    expect(await leseSpeicher(page)).toBeNull();
  });

  test('Drucken leert den Zaehler NICHT -- nach dem Beleg wird oft noch korrigiert', async ({ page }) => {
    await setupApp(page);
    await oeffneLeergut(page);

    await page.fill('#lg-kunde', 'Testkunde Spedition');
    await page.locator('#lg-kunde').blur();
    await page.fill('#zaehler_entladen_lg_0', '120');
    await page.locator('#zaehler_entladen_lg_0').blur();

    // Druckfenster abfangen, damit im Test kein echtes Fenster aufgeht.
    await page.evaluate(() => {
      window.open = () => ({
        document: { open() {}, write() {}, close() {} },
        print() {}, close() {},
      });
    });
    await page.locator('#tab-leergut').getByRole('button', { name: 'Drucken' }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('#zaehler_entladen_lg_0')).toHaveValue('120');
    const state = await leseState(page);
    expect(state.lg_0.entladen).toBe(120);
    const gespeichert = JSON.parse(await leseSpeicher(page));
    expect(gespeichert.state.lg_0.entladen).toBe(120);
  });

  test('Kaputter gesicherter Stand legt die Leergut-Ansicht nicht lahm', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setupApp(page, '{"date": kaputt,,,');
    await oeffneLeergut(page);

    await expect(page.locator('#zaehler_entladen_lg_0')).toHaveValue('0');
    await expect(page.locator('#zaehler_geladen_lg_2')).toHaveValue('0');
    const state = await leseState(page);
    expect(state.lg_0).toEqual({ entladen: 0, geladen: 0 });
    expect(await leseSpeicher(page)).toBeNull();
    expect(pageErrors).toEqual([]);
  });
});
