// Regressionswache: zwei offene Control Center duerfen sich nicht mehr still ueberschreiben.
//
// Hintergrund (2026-08-18): supabase_sync.js schreibt zwar ein updated_at mit, prueft es aber
// nie — und der eigene Firmenserver (Server-Fertig\produktion\server.js, handleRest) kann
// weder select=updated_at noch bedingtes Schreiben. Bis der Datenumbau kommt (dann hat jeder
// Datensatz eine eigene Zeile), haelt diese Notbremse den Fall auf, der im Alltag zaehlt:
// Buero-PC laedt morgens, Robert aendert mittags am Laptop, Buero-PC speichert nachmittags
// darueber. Verglichen wird ein Fingerabdruck der Felder, die beim Voll-PUT blind gewinnen
// (SCHUTZ_FELDER in control-center-core.js).
const { test, expect } = require('@playwright/test');
const { blockCloud } = require('./helpers');

const NOELKE = ['[Nr. 1] Mortadella 3kg | EAN: 4018905502350'];

function lokalerStand() {
  return {
    suppliers: ['Nölke'],
    articles: [{ fertigNr: '100', name: 'Testartikel (100)', suppliers: ['Nölke'], gewicht: 1.5 }],
    workers: ['Robert', 'Dominik'],
    customers: ['Edeka'],
    savedProdukteRaw: NOELKE.slice(),
    sonderTemplates: [{ id: '1', name: 'Vorlage A' }],
    deliveries: []
  };
}

/** Objektschluessel umdrehen — bildet nach, dass die Datenbank die Reihenfolge nicht bewahrt. */
function verdreht(wert) {
  if (Array.isArray(wert)) return wert.map(verdreht);
  if (wert && typeof wert === 'object') {
    const neu = {};
    Object.keys(wert).reverse().forEach((k) => { neu[k] = verdreht(wert[k]); });
    return neu;
  }
  return wert;
}

/**
 * Cloud-Nachbau MIT Gedaechtnis: was geschrieben wird, kommt beim naechsten Lesen zurueck.
 * Nur so ist die Fehlalarm-Frage ueberhaupt pruefbar (zweimal speichern hintereinander).
 */
async function cloudMitGedaechtnis(page, startStand) {
  const zustand = { stand: startStand, schreibzugriffe: [] };
  await page.route('**://*.supabase.co/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (_) { /* egal */ }
      if (body.key === 'main') {
        zustand.schreibzugriffe.push(body.data || {});
        zustand.stand = body.data || {};
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    }
    // Absichtlich unbequem: Schluessel in umgekehrter Reihenfolge und ein Zahlwert als 1.50.
    // Genau so verhaelt sich jsonb in Postgres — kaeme der Fingerabdruck aus einem schlichten
    // JSON.stringify, gaebe es hier bei JEDEM Speichern Fehlalarm.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ data: verdreht(zustand.stand) }]).replace(/"gewicht":1\.5\b/g, '"gewicht":1.50')
    });
  });
  return zustand;
}

async function waitForAppReady(page) {
  await expect(page.locator('#db-status')).not.toHaveText('Lade Datenbank…', { timeout: 10000 });
}

async function starte(page, cloudStand) {
  await blockCloud(page);
  const zustand = await cloudMitGedaechtnis(page, cloudStand);
  await page.addInitScript((s) => { localStorage.setItem('logistik_offline_db', JSON.stringify(s)); }, lokalerStand());
  await page.goto('/control/index.html');
  await waitForAppReady(page);
  return zustand;
}

test.describe('Control Center - Schreibschutz gegen fremde Änderungen', () => {
  test('Ein anderes Gerät hat zwischendurch geschrieben: kein Schreibvorgang, Meldung, lokaler Stand bleibt', async ({ page }) => {
    const meldungen = [];
    page.on('dialog', (d) => { meldungen.push(d.message()); d.accept().catch(() => {}); });
    const cloud = await starte(page, { articles: [{ fertigNr: '100', name: 'Testartikel (100)' }], savedProdukteRaw: NOELKE.slice() });

    // "Aus Cloud laden" — ab jetzt kennt dieser PC den Cloud-Stand.
    await page.evaluate(() => pullFromCloud());
    await expect.poll(() => meldungen.length).toBeGreaterThan(0);

    // Robert aendert hier etwas ...
    await page.evaluate(() => { db.savedProdukteRaw.push('[Nr. 2] Neu vom PC'); });
    // ... waehrend am anderen Geraet eine Sorte dazukommt.
    cloud.stand = {
      articles: [{ fertigNr: '100', name: 'Testartikel (100)' }, { fertigNr: '200', name: 'Vom Laptop (200)' }],
      savedProdukteRaw: NOELKE.slice()
    };

    cloud.schreibzugriffe.length = 0;
    meldungen.length = 0;
    await page.evaluate(() => pushToCloud());

    // Kern der Wache: es geht NICHTS raus.
    expect(cloud.schreibzugriffe).toEqual([]);
    const text = meldungen.join(' | ');
    expect(text).toContain('NICHT GESPEICHERT');
    expect(text).toContain('Sorten');                       // sagt, WAS sich geaendert hat
    expect(text).toContain('Aus Cloud laden');              // sagt, was zu tun ist
    await expect(page.locator('#db-status')).toContainText('an einem anderen Gerät geändert');
    // Die eigene Aenderung ist nicht verloren — weder im Speicher noch auf der Platte.
    expect(await page.evaluate(() => db.savedProdukteRaw)).toContain('[Nr. 2] Neu vom PC');
    const offline = await page.evaluate(() => JSON.parse(localStorage.getItem('logistik_offline_db') || '{}'));
    expect(offline.savedProdukteRaw).toContain('[Nr. 2] Neu vom PC');
  });

  test('Stand unverändert: wird ganz normal geschrieben', async ({ page }) => {
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const cloud = await starte(page, { articles: [{ fertigNr: '100', name: 'Testartikel (100)' }], savedProdukteRaw: NOELKE.slice() });

    await page.evaluate(() => pullFromCloud());
    await page.evaluate(() => { db.savedProdukteRaw.push('[Nr. 2] Neu vom PC'); });

    cloud.schreibzugriffe.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => cloud.schreibzugriffe.length).toBe(1);
    expect(cloud.schreibzugriffe[0].savedProdukteRaw).toContain('[Nr. 2] Neu vom PC');
  });

  test('Kein Fehlalarm: zweimal hintereinander speichern geht beim zweiten Mal durch', async ({ page }) => {
    page.on('dialog', (d) => d.accept().catch(() => {}));
    // Der Nachbau gibt das Gespeicherte zurueck — aber mit umgedrehter Schluesselreihenfolge
    // und 1.50 statt 1.5, so wie es die Datenbank tut. Ein zu strenger Vergleich (schlichtes
    // JSON.stringify) wuerde hier bei jedem zweiten Speichern Fehlalarm schlagen.
    const cloud = await starte(page, { articles: [{ fertigNr: '100', name: 'Testartikel (100)' }], savedProdukteRaw: NOELKE.slice() });

    cloud.schreibzugriffe.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => cloud.schreibzugriffe.length).toBe(1);

    await page.evaluate(() => { db.savedProdukteRaw.push('[Nr. 3] Zweite Runde'); });
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => cloud.schreibzugriffe.length).toBe(2);
    expect(cloud.schreibzugriffe[1].savedProdukteRaw).toContain('[Nr. 3] Zweite Runde');
    await expect(page.locator('#db-status')).toHaveText('Mit Cloud synchronisiert.');
  });

  test('Einstellungen speichern und danach System speichern: geht durch, kein falscher Alarm', async ({ page }) => {
    // pushSettingsToCloud ersetzt settings in der HAUPTZEILE (supabaseCloudFetch: isSettings ->
    // patch('main', { settings })). settings ist ein Schutzfeld. Ohne Nachzug im Merker haette
    // der Schreibschutz die eigene Aenderung von eben fuer eine fremde gehalten und das
    // naechste Speichern blockiert — bei einem voellig normalen Arbeitsschritt.
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const cloud = await starte(page, {
      articles: [{ fertigNr: '100', name: 'Testartikel (100)', gewicht: 1.5 }],
      savedProdukteRaw: NOELKE.slice(),
      settings: { printerIp: '192.168.1.50' }
    });

    await page.evaluate(() => pullFromCloud());

    // Drucker-IP aendern und speichern — der ganz normale Knopf im Einstellungen-Tab.
    await page.evaluate(() => {
      document.getElementById('set-printer-ip').value = '192.168.1.99';
      return saveSystemSettings();
    });
    expect(await page.evaluate(() => db.settings.printerIp)).toBe('192.168.1.99');

    cloud.schreibzugriffe.length = 0;
    await page.evaluate(() => pushToCloud(true));

    // Kern: das System-Speichern laeuft durch.
    await expect.poll(() => cloud.schreibzugriffe.length).toBe(1);
    await expect(page.locator('#db-status')).toHaveText('Mit Cloud synchronisiert.');
    expect(cloud.schreibzugriffe[0].settings.printerIp).toBe('192.168.1.99');
  });

  test('Stiller Aufruf bei fremder Änderung: keine Rückfrage, aber Protokoll und Statuszeile', async ({ page }) => {
    const meldungen = [];
    page.on('dialog', (d) => { meldungen.push(d.message()); d.accept().catch(() => {}); });
    const cloud = await starte(page, { articles: [{ fertigNr: '100', name: 'Testartikel (100)' }], savedProdukteRaw: NOELKE.slice() });

    await page.evaluate(() => pullFromCloud());
    cloud.stand = { articles: [{ fertigNr: '100', name: 'Umbenannt am Laptop (100)' }], savedProdukteRaw: NOELKE.slice() };

    cloud.schreibzugriffe.length = 0;
    meldungen.length = 0;
    // So ruft deleteSortierBuchung (control-center-stats.js) auf.
    await page.evaluate(() => pushToCloud(true));

    expect(cloud.schreibzugriffe).toEqual([]);
    expect(meldungen).toEqual([]);
    await expect(page.locator('#db-status')).toContainText('an einem anderen Gerät geändert');
    await expect(page.locator('#sticky-status')).toContainText('Nicht in der Cloud gespeichert');
    const protokoll = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]').map((l) => l.action).join(' | ')
    );
    expect(protokoll).toContain('Cloud-Stand von anderem Gerät geändert');
  });
});
