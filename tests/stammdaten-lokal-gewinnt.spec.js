// Regressionswache: Loeschen und Bearbeiten im Control Center muessen halten.
//
// Hintergrund (2026-08-18): pushToCloud() und pullFromCloud() (control-center-core.js) haben
// Cloud-Eintraege, die lokal fehlten, wieder an die lokale Liste ANGEHAENGT — fuer
// savedProdukteRaw (Noelke-Katalog) und workers. Folgen:
//   Loeschen  -> der Eintrag fehlt lokal, genau das holte ihn zurueck (76 -> 75 -> 76).
//   Bearbeiten-> verglichen wurde der ganze Text; die alte Fassung galt als "lokal nicht
//                vorhanden" und wurde angehaengt (76 -> 77, alte Fassung wieder da).
// Beide Listen werden im Control Center gepflegt, deshalb gewinnt beim Speichern jetzt der
// lokale Stand. Dazu gehoert zwingend der Leer-Schutz: ein PC mit leerer Liste darf den vollen
// Cloud-Bestand nicht loeschen — sonst waere der Fehler nur getauscht.
//
// Kunden gehoeren ausdruecklich NICHT dazu: dafuer gibt es im Control Center keine Oberflaeche,
// angelegt werden sie am Tablet (js/logistik.js addCustomer). Dort bleibt es beim
// Zusammenfuehren — der letzte Test in dieser Gruppe wacht darueber.
const { test, expect } = require('@playwright/test');
const { blockCloud, unlockRechner } = require('./helpers');

const NOELKE = [
  '[Nr. 1] Mortadella 3kg | EAN: 4018905502350',
  '[Nr. 2] Bierschinken 2,5kg | EAN: 4018905502367',
  '[Nr. 3] Leberkäse 1kg | EAN: 4018905502374'
];

/** Lokaler Stand im Control Center (localStorage-Key logistik_offline_db, siehe window.onload). */
function lokalerStand(ueberschreibung) {
  return Object.assign({
    suppliers: ['Nölke'],
    articles: [{ fertigNr: '100', name: 'Testartikel (100)', suppliers: ['Nölke'] }],
    workers: ['Robert', 'Dominik'],
    customers: ['Edeka', 'Rewe'],
    savedProdukteRaw: NOELKE.slice(),
    sonderTemplates: [{ id: '1', name: 'Vorlage A' }],
    deliveries: []
  }, ueberschreibung || {});
}

async function seedeLokal(page, stand) {
  await page.addInitScript((s) => {
    localStorage.setItem('logistik_offline_db', JSON.stringify(s));
  }, stand);
}

/**
 * Faengt alle Cloud-Aufrufe ab (nach blockCloud registriert, greift deshalb zuerst).
 * GET liefert den uebergebenen Cloud-Stand, Schreibzugriffe werden nur eingesammelt.
 * Zurueck kommt die Liste der Schreibzugriffe auf die Hauptzeile ("main").
 */
async function cloudMitStand(page, cloudStand) {
  const geschrieben = [];
  await page.route('**://*.supabase.co/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (_) { /* egal */ }
      if (body.key === 'main') geschrieben.push(body.data || {});
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ data: cloudStand }])
    });
  });
  return geschrieben;
}

async function waitForAppReady(page) {
  await expect(page.locator('#db-status')).not.toHaveText('Lade Datenbank…', { timeout: 10000 });
}

test.describe('Control Center - Stammdaten: lokaler Stand gewinnt beim Speichern', () => {
  test('Noelke-Eintrag bearbeiten: Liste bleibt gleich lang, die alte Fassung ist weg', async ({ page }) => {
    await blockCloud(page);
    const geschrieben = await cloudMitStand(page, { savedProdukteRaw: NOELKE.slice() });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await seedeLokal(page, lokalerStand());

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    // Tippfehler in der EAN korrigieren — genau der Fall, den Robert gemeldet hat.
    const alteFassung = NOELKE[0];
    const neueFassung = NOELKE[0].replace('4018905502350', '4018905502359');
    // 2026-08-20: Der Noelke-Katalog wird nicht mehr als eine Textzeile bearbeitet,
    // sondern in Einzelfeldern (die Nummer vergibt das Programm). Der Testfall bleibt
    // derselbe -- nur die EAN wird jetzt im EAN-Feld korrigiert statt in der Rohzeile.
    await page.evaluate(() => {
      openEditNoelkeModal(0);
      document.getElementById('edit-noelke-ean').value = '4018905502359';
      saveEditNoelke();
    });

    geschrieben.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => geschrieben.length).toBe(1);

    const lokal = await page.evaluate(() => db.savedProdukteRaw);
    expect(lokal).toHaveLength(NOELKE.length);
    expect(lokal).toContain(neueFassung);
    expect(lokal).not.toContain(alteFassung);

    // Und genau das geht auch in die Cloud — nicht die alte Fassung obendrauf.
    expect(geschrieben[0].savedProdukteRaw).toHaveLength(NOELKE.length);
    expect(geschrieben[0].savedProdukteRaw).not.toContain(alteFassung);
  });

  test('Noelke-Eintrag loeschen: bleibt weg, Liste ist um 1 kuerzer', async ({ page }) => {
    await blockCloud(page);
    const geschrieben = await cloudMitStand(page, { savedProdukteRaw: NOELKE.slice() });
    page.on('dialog', (d) => d.accept().catch(() => {}));   // confirm("Löschen?")
    await seedeLokal(page, lokalerStand());

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    const geloescht = NOELKE[1];
    await page.evaluate(() => deleteNoelke(1));
    expect(await page.evaluate(() => db.savedProdukteRaw.length)).toBe(NOELKE.length - 1);

    geschrieben.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => geschrieben.length).toBe(1);

    const lokal = await page.evaluate(() => db.savedProdukteRaw);
    expect(lokal).toHaveLength(NOELKE.length - 1);
    expect(lokal).not.toContain(geloescht);
    expect(geschrieben[0].savedProdukteRaw).toHaveLength(NOELKE.length - 1);
    expect(geschrieben[0].savedProdukteRaw).not.toContain(geloescht);
  });

  test('Mitarbeiter loeschen: kommt nicht aus der Cloud zurueck', async ({ page }) => {
    await blockCloud(page);
    // In der Cloud steht zusaetzlich "Uwe" — vom Tablet. Der lokale Stand gewinnt, also geht
    // ohne vorheriges "Abrufen" nur die PC-Liste hoch. Das ist die bewusste Entscheidung:
    // anders liesse sich ein Mitarbeiter ueberhaupt nicht loeschen.
    const geschrieben = await cloudMitStand(page, { workers: ['Robert', 'Dominik', 'Uwe'] });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await seedeLokal(page, lokalerStand());

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await page.evaluate(() => deleteWorker('Dominik'));
    geschrieben.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => geschrieben.length).toBe(1);

    expect(await page.evaluate(() => db.workers)).toEqual(['Robert']);
    expect(geschrieben[0].workers).toEqual(['Robert']);
  });

  test('Leerfall mit Rueckfrage: Bediener lehnt ab, der Cloud-Bestand bleibt', async ({ page }) => {
    await blockCloud(page);
    const geschrieben = await cloudMitStand(page, {
      savedProdukteRaw: NOELKE.slice(),
      workers: ['Robert', 'Dominik'],
      sonderTemplates: [{ id: '1', name: 'Vorlage A' }]
    });
    const meldungen = [];
    // Erst die normale Rueckfrage "System in der Cloud speichern?" bestaetigen, dann die
    // Warnung ablehnen.
    page.on('dialog', (d) => {
      meldungen.push(d.message());
      if (/WARNUNG/.test(d.message())) d.dismiss().catch(() => {});
      else d.accept().catch(() => {});
    });
    // articles bleibt gefuellt, sonst stuende die Artikel-Zeile mit in der Warnung und der
    // Test waere aus dem falschen Grund gruen.
    await seedeLokal(page, lokalerStand({ savedProdukteRaw: [], workers: [], sonderTemplates: [] }));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    geschrieben.length = 0;
    meldungen.length = 0;
    await page.evaluate(() => pushToCloud());

    // Kern der Wache: es geht NICHTS raus, der Cloud-Bestand bleibt unangetastet.
    expect(geschrieben).toEqual([]);
    await expect(page.locator('#db-status')).toHaveText('Speichern abgebrochen.');
    // Der Bediener erfaehrt, welche Listen betroffen sind.
    const text = meldungen.join(' | ');
    expect(text).toContain('Nölke-Produkte');
    expect(text).toContain('Mitarbeiter');
    expect(text).toContain('Sonder-Vorlagen');
    // Kunden stehen nicht mehr drin — die Liste wird beim Speichern gar nicht ueberschrieben.
    expect(text).not.toContain('Kunden');
  });

  test('Leerfall beim stillen Speichern: keine Rueckfrage aus dem Nichts, aber Abbruch mit Eintrag', async ({ page }) => {
    await blockCloud(page);
    // pushToCloud(true) laeuft ohne Zutun des Bedieners — z. B. aus deleteSortierBuchung
    // (control-center-stats.js). Eine Rueckfrage, die niemand ausgeloest hat, wird
    // weggeklickt; deshalb wird hier nicht gefragt, sondern abgebrochen.
    const geschrieben = await cloudMitStand(page, {
      savedProdukteRaw: NOELKE.slice(),
      workers: ['Robert', 'Dominik']
    });
    const meldungen = [];
    page.on('dialog', (d) => { meldungen.push(d.message()); d.accept().catch(() => {}); });
    await seedeLokal(page, lokalerStand({ savedProdukteRaw: [], workers: [] }));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    geschrieben.length = 0;
    meldungen.length = 0;
    await page.evaluate(() => pushToCloud(true));

    expect(geschrieben).toEqual([]);
    expect(meldungen).toEqual([]);
    await expect(page.locator('#db-status')).toContainText('Nicht in der Cloud gespeichert');
    await expect(page.locator('#sticky-status')).toContainText('Nicht in der Cloud gespeichert');
    const protokoll = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]').map((l) => l.action).join(' | ')
    );
    expect(protokoll).toContain('ABBRUCH: stiller Upload wegen leerer Listen');
  });

  test('Ein am Tablet angelegter Kunde ueberlebt das Speichern im Control Center', async ({ page }) => {
    await blockCloud(page);
    // "Netto" steht nur in der Cloud — im Control Center gibt es keine Kundenpflege, also darf
    // das Speichern die Liste nicht ersetzen. Sonst waere der Kunde ueberall weg, sobald das
    // Tablet das naechste Mal aus der Cloud liest (applyLogistikFullFromCloud macht Vollersatz).
    const geschrieben = await cloudMitStand(page, { customers: ['Edeka', 'Rewe', 'Netto'] });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await seedeLokal(page, lokalerStand());

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    geschrieben.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => geschrieben.length).toBe(1);

    expect(geschrieben[0].customers).toContain('Netto');
    expect(await page.evaluate(() => db.customers)).toContain('Netto');
  });

  test('Voller lokaler Stand: der Leer-Schutz haelt das Speichern nicht auf', async ({ page }) => {
    await blockCloud(page);
    const geschrieben = await cloudMitStand(page, { savedProdukteRaw: NOELKE.slice(), workers: ['Robert', 'Dominik'] });
    const meldungen = [];
    page.on('dialog', (d) => { meldungen.push(d.message()); d.accept().catch(() => {}); });
    await seedeLokal(page, lokalerStand());

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    geschrieben.length = 0;
    meldungen.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => geschrieben.length).toBe(1);

    expect(meldungen.join(' | ')).not.toContain('WARNUNG');
    expect(geschrieben[0].savedProdukteRaw).toHaveLength(NOELKE.length);
  });
});

// Die Kehrseite: die Handys schicken den Noelke-Katalog nicht mehr hoch (js/script.js,
// getLogistikFullCloudPayload + getRechnerStammdatenCloudPayload). Sie MUESSEN ihn aber
// weiter bekommen — sonst steht der Scanner ohne Produktliste da.
test.describe('Rechner-App - Kataloge kommen an, gehen aber nicht mehr hoch', () => {
  test('Noelke-Katalog und Sonder-Vorlagen aus der Cloud landen im lokalen Speicher', async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);

    const angekommen = await page.evaluate((noelke) => {
      applyRechnerStammdatenFromCloud({
        savedProdukteRaw: noelke,
        sonderTemplates: [{ id: '9', name: 'Vorlage aus der Cloud' }],
        articles: [{ fertigNr: '100', name: 'Testartikel (100)' }]
      });
      const rDb = AppStorage.get('kombi_rechner_db', {});
      const lDb = AppStorage.get('kombi_logistik_db', {});
      return {
        produkte: rDb.savedProdukteRaw,
        vorlagen: (rDb.sonderTemplates || []).map((t) => t.name),
        artikel: (lDb.articles || []).length
      };
    }, NOELKE);

    expect(angekommen.produkte).toEqual(NOELKE);
    expect(angekommen.vorlagen).toContain('Vorlage aus der Cloud');
    expect(angekommen.artikel).toBe(1);

    // Derselbe Weg fuer die Logistik-Seite (pullLogistikFromCloud).
    const ueberLogistik = await page.evaluate((noelke) => {
      applyLogistikFullFromCloud({ savedProdukteRaw: noelke });
      return AppStorage.get('kombi_rechner_db', {}).savedProdukteRaw;
    }, NOELKE);
    expect(ueberLogistik).toEqual(NOELKE);
  });

  test('Die Handy-Payloads enthalten savedProdukteRaw und articles nicht mehr', async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);

    const schluessel = await page.evaluate(() => ({
      logistik: Object.keys(getLogistikFullCloudPayload()),
      rechner: Object.keys(getRechnerStammdatenCloudPayload())
    }));

    expect(schluessel.logistik).not.toContain('savedProdukteRaw');
    expect(schluessel.rechner).not.toContain('savedProdukteRaw');
    // articles wird am Handy nur gelesen; ueber den Logistik-Weg (dort werden sie zugeordnet)
    // gehen sie weiterhin hoch — mit Abgleich, siehe mergeLogistikPayloadMitCloud.
    expect(schluessel.rechner).not.toContain('articles');
    expect(schluessel.logistik).toContain('articles');
  });
});
