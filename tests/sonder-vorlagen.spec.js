// Regressionswache fuer die Sonderposten-Vorlagen.
//
// Regel (2026-08-18): Die Handys duerfen Vorlagen ANLEGEN. Aendern und Loeschen macht nur das
// Buero im Control Center. Dazu gehoeren drei Aenderungen, die diese Tests festhalten:
//
//   1. getRechnerStammdatenCloudPayload() (js/script.js) schickt keine Lieferantenlisten mehr
//      hoch. Die Handys lesen sie nur; hochgeschickt haben sie damit nur ihren womoeglich alten
//      Stand — ein im Buero geloeschter Lieferant stand danach wieder in der Liste.
//   2. Die beiden Sync-Wege (applyRechnerStammdatenFromCloud, applyLogistikFullFromCloud) haben
//      die Vorlagen frueher hart ersetzt. Eine gerade am Handy angelegte, noch nicht hochgeladene
//      Vorlage war damit beim naechsten Sync weg. Jetzt wird nach id zusammengefuehrt.
//   3. deletedSonderTemplates ist die Grabstein-Liste dazu (Vorbild: deletedSuppliers). Ohne sie
//      kaeme jede im Buero geloeschte Vorlage von jedem Handy zurueck.
const { test, expect } = require('@playwright/test');
const { blockCloud, unlockRechner } = require('./helpers');

/** Legt am Handy eine Vorlage ueber die echte Oberflaeche an und gibt ihre id zurueck. */
async function vorlageAmHandyAnlegen(page, name, ean) {
  return page.evaluate(({ n, e }) => {
    openSearchModal('sonder-tpl');
    openSonderTplModal(true);
    document.getElementById('tpl-name').value = n;
    document.getElementById('tpl-ean').value = e;
    document.getElementById('tpl-kg').value = '2.5';
    document.getElementById('tpl-stk').value = '10';
    saveSonderTplFromModal();
    const rDb = JSON.parse(localStorage.getItem('kombi_rechner_db') || '{}');
    const tpl = (rDb.sonderTemplates || []).find((t) => t.name === n);
    return tpl ? tpl.id : null;
  }, { n: name, e: ean });
}

/** Vorlagen so, wie sie im lokalen Speicher des Handys stehen. */
async function vorlagenAmHandy(page) {
  return page.evaluate(() => {
    const rDb = JSON.parse(localStorage.getItem('kombi_rechner_db') || '{}');
    return (rDb.sonderTemplates || []).map((t) => ({ id: t.id, name: t.name }));
  });
}

test.describe('Rechner-App - Vorlagen anlegen darf das Handy', () => {
  test('Eine am Handy angelegte Vorlage steht in der Cloud-Payload', async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);

    const id = await vorlageAmHandyAnlegen(page, 'Krakauer Handy', '4001234567890');
    expect(id).toBeTruthy();

    const payload = await page.evaluate(() => getRechnerStammdatenCloudPayload());
    expect(payload.sonderTemplates.map((t) => t.name)).toContain('Krakauer Handy');
  });

  test('Die Handy-Payload enthaelt nur noch sonderTemplates — keine Lieferantenlisten', async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);

    const schluessel = await page.evaluate(() => Object.keys(getRechnerStammdatenCloudPayload()));

    // Genau ein Schluessel: alles andere wuerde einen alten Stand in die Cloud zurueckschreiben.
    expect(schluessel).toEqual(['sonderTemplates']);
    ['suppliers', 'supplierLines', 'supplierLinesCleared', 'supplierNumbers', 'deletedSuppliers']
      .forEach((k) => expect(schluessel).not.toContain(k));
    // Loeschen darf das Handy nicht — die Grabstein-Liste gehoert deshalb nicht in die Payload.
    expect(schluessel).not.toContain('deletedSonderTemplates');
  });
});

test.describe('Rechner-App - Sync darf frische Vorlagen nicht wegwerfen', () => {
  test('Vorlage am Handy angelegt, Cloud kennt sie noch nicht: sie bleibt erhalten', async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);

    const id = await vorlageAmHandyAnlegen(page, 'Frisch am Handy', '4009876543210');

    // Der Sync-Knopf: die Cloud kennt nur ihre eigene Vorlage.
    await page.evaluate(() => applyRechnerStammdatenFromCloud({
      sonderTemplates: [{ id: 'cloud-1', name: 'Vorlage aus dem Buero' }]
    }));

    let namen = (await vorlagenAmHandy(page)).map((t) => t.name);
    expect(namen).toContain('Frisch am Handy');
    expect(namen).toContain('Vorlage aus dem Buero');

    // Derselbe Schutz auf dem Logistik-Weg (pullLogistikFromCloud).
    await page.evaluate(() => applyLogistikFullFromCloud({
      sonderTemplates: [{ id: 'cloud-2', name: 'Zweite aus dem Buero' }]
    }));

    namen = (await vorlagenAmHandy(page)).map((t) => t.name);
    expect(namen).toContain('Frisch am Handy');
    expect(namen).toContain('Vorlage aus dem Buero');
    expect(namen).toContain('Zweite aus dem Buero');

    // Bei gleicher id gewinnt die Cloud — gepflegt wird im Control Center.
    await page.evaluate((tplId) => applyRechnerStammdatenFromCloud({
      sonderTemplates: [{ id: tplId, name: 'Im Buero umbenannt' }]
    }), id);
    const nachUmbenennen = await vorlagenAmHandy(page);
    expect(nachUmbenennen.find((t) => t.id === id).name).toBe('Im Buero umbenannt');
    expect(nachUmbenennen.filter((t) => t.id === id)).toHaveLength(1);
  });

  test('Im Buero geloeschte Vorlage verschwindet und bleibt ueber mehrere Sync-Runden weg', async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);

    const id = await vorlageAmHandyAnlegen(page, 'Wird im Buero geloescht', '4005555555555');

    // Runde 1: die Cloud meldet die Vorlage als geloescht (Grabstein).
    await page.evaluate((tplId) => applyRechnerStammdatenFromCloud({
      sonderTemplates: [{ id: 'cloud-1', name: 'Vorlage aus dem Buero' }],
      deletedSonderTemplates: [tplId]
    }), id);

    let namen = (await vorlagenAmHandy(page)).map((t) => t.name);
    expect(namen).not.toContain('Wird im Buero geloescht');
    expect(namen).toContain('Vorlage aus dem Buero');

    // Runde 2: ein anderes Handy hat sie inzwischen wieder hochgeschickt — sie darf trotzdem
    // nicht zurueckkommen. Genau das ist der Fall, bei dem das Buero das Programm fuer kaputt haelt.
    await page.evaluate((tplId) => applyRechnerStammdatenFromCloud({
      sonderTemplates: [{ id: tplId, name: 'Wird im Buero geloescht' }, { id: 'cloud-1', name: 'Vorlage aus dem Buero' }],
      deletedSonderTemplates: [tplId]
    }), id);
    expect((await vorlagenAmHandy(page)).map((t) => t.name)).not.toContain('Wird im Buero geloescht');

    // Runde 3 ueber den Logistik-Weg, diesmal ohne Grabstein-Liste im Cloud-Stand: der lokal
    // gemerkte Stand muss reichen.
    await page.evaluate((tplId) => applyLogistikFullFromCloud({
      sonderTemplates: [{ id: tplId, name: 'Wird im Buero geloescht' }]
    }), id);
    expect((await vorlagenAmHandy(page)).map((t) => t.name)).not.toContain('Wird im Buero geloescht');
  });

  test('Am Handy gibt es keinen Loeschknopf fuer Vorlagen mehr', async ({ page }) => {
    await blockCloud(page);
    await unlockRechner(page);

    await vorlageAmHandyAnlegen(page, 'Nur zum Ansehen', '4001111111111');

    const stand = await page.evaluate(() => {
      openSearchModal('sonder-tpl');
      return {
        treffer: document.getElementById('modal-results').innerHTML,
        loeschFunktion: typeof window.deleteSonderTemplate
      };
    });

    // Die Vorlage steht in der Liste ...
    expect(stand.treffer).toContain('Nur zum Ansehen');
    // ... aber ohne Papierkorb und ohne Loesch-Funktion dahinter.
    expect(stand.treffer).not.toContain('🗑️');
    expect(stand.treffer).not.toContain('deleteSonderTemplate');
    expect(stand.loeschFunktion).toBe('undefined');
  });
});

// ---------------------------------------------------------------------------
// Control Center: dort wird geloescht — und der Grabstein muss mitgeschrieben werden.
// ---------------------------------------------------------------------------

function lokalerStand(ueberschreibung) {
  return Object.assign({
    suppliers: ['Nölke', 'Willms'],
    articles: [{ fertigNr: '100', name: 'Testartikel (100)', suppliers: ['Nölke'] }],
    workers: ['Robert', 'Dominik'],
    customers: ['Edeka'],
    savedProdukteRaw: ['[Nr. 1] Mortadella 3kg | EAN: 4018905502350'],
    sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }, { id: 'tpl-2', name: 'Vorlage B' }],
    deliveries: []
  }, ueberschreibung || {});
}

async function seedeLokal(page, stand) {
  await page.addInitScript((s) => {
    localStorage.setItem('logistik_offline_db', JSON.stringify(s));
  }, stand);
}

/** GET liefert den Cloud-Stand, Schreibzugriffe auf die Hauptzeile werden eingesammelt. */
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

test.describe('Control Center - Vorlage loeschen hinterlaesst einen Grabstein', () => {
  test('Geloeschte Vorlage landet in deletedSonderTemplates und geht so in die Cloud', async ({ page }) => {
    await blockCloud(page);
    const geschrieben = await cloudMitStand(page, {
      sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }, { id: 'tpl-2', name: 'Vorlage B' }]
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await seedeLokal(page, lokalerStand());

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await page.evaluate(() => {
      adminEditSonderTpl('tpl-2');
      adminDeleteSonderTpl();
    });

    const nachLoeschen = await page.evaluate(() => ({
      vorlagen: db.sonderTemplates.map((t) => t.id),
      grabsteine: db.deletedSonderTemplates
    }));
    expect(nachLoeschen.vorlagen).toEqual(['tpl-1']);
    expect(nachLoeschen.grabsteine).toContain('tpl-2');

    geschrieben.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => geschrieben.length).toBe(1);

    // Nur so erfaehrt das naechste Handy, dass die Vorlage weg ist.
    expect(geschrieben[0].deletedSonderTemplates).toContain('tpl-2');
    expect((geschrieben[0].sonderTemplates || []).map((t) => t.id)).not.toContain('tpl-2');
  });

  test('Aus der Cloud kommt die geloeschte Vorlage beim Abrufen nicht zurueck', async ({ page }) => {
    await blockCloud(page);
    // Ein Handy hat die geloeschte Vorlage noch und schickt sie weiter hoch.
    await cloudMitStand(page, {
      sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }, { id: 'tpl-2', name: 'Vorlage B' }],
      deletedSonderTemplates: ['tpl-2']
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await seedeLokal(page, lokalerStand({
      sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }],
      deletedSonderTemplates: ['tpl-2']
    }));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await page.evaluate(() => pullFromCloud());
    await expect.poll(() => page.evaluate(() => db.sonderTemplates.map((t) => t.id))).toEqual(['tpl-1']);
  });

  // 2026-08-18: Gibt es nur EINE Vorlage und das Buero loescht sie, ist die lokale Liste leer
  // und die Cloud gefuellt -- der Leerlisten-Riegel schlug an. Wer die Rueckfrage abbrach, lud
  // auch den Grabstein nicht hoch: Vorlage im Buero weg, auf allen Handys fuer immer da.
  test('Letzte Vorlage geloescht: der Leerlisten-Riegel laesst die gewollte Leerung durch', async ({ page }) => {
    await blockCloud(page);
    const geschrieben = await cloudMitStand(page, {
      sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }]
    });
    const meldungen = [];
    page.on('dialog', (d) => { meldungen.push(d.message()); d.accept().catch(() => {}); });
    await seedeLokal(page, lokalerStand({ sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }] }));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await page.evaluate(() => { adminEditSonderTpl('tpl-1'); adminDeleteSonderTpl(); });
    expect(await page.evaluate(() => db.sonderTemplates)).toEqual([]);
    expect(await page.evaluate(() => db.deletedSonderTemplates)).toContain('tpl-1');

    // Stiller Weg (pushToCloud(true)): frueher kommentarlos abgebrochen, der Grabstein blieb liegen.
    geschrieben.length = 0;
    meldungen.length = 0;
    await page.evaluate(() => pushToCloud(true));
    await expect.poll(() => geschrieben.length).toBe(1);
    expect(geschrieben[0].deletedSonderTemplates).toContain('tpl-1');
    expect(geschrieben[0].sonderTemplates).toEqual([]);

    // Im Protokoll steht, warum der Riegel bewusst nicht gegriffen hat.
    const protokoll = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]').map((l) => l.action).join(' | '));
    expect(protokoll).toContain('Leerlisten-Riegel greift bewusst nicht');
  });

  // Derselbe Fall auf dem Weg mit Rueckfrage. Bewusst eine eigene Seite: nach einem Schreiben
  // merkt sich das Control Center den neuen Cloud-Stand, der Nachbau hier liefert aber weiter
  // den alten — ein zweites Speichern auf derselben Seite scheitert dann am Schreibschutz.
  test('Letzte Vorlage geloescht: beim Speichern mit Rueckfrage kommt keine Warnung mehr', async ({ page }) => {
    await blockCloud(page);
    const geschrieben = await cloudMitStand(page, {
      sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }]
    });
    const meldungen = [];
    page.on('dialog', (d) => { meldungen.push(d.message()); d.accept().catch(() => {}); });
    await seedeLokal(page, lokalerStand({ sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }] }));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    await page.evaluate(() => { adminEditSonderTpl('tpl-1'); adminDeleteSonderTpl(); });

    geschrieben.length = 0;
    meldungen.length = 0;
    await page.evaluate(() => pushToCloud());
    await expect.poll(() => geschrieben.length).toBe(1);
    // Frueher stand hier "werden in der Cloud GELOESCHT. Wirklich ueberschreiben?" -- wer da
    // abbrach, lud auch den Grabstein nicht hoch.
    expect(meldungen.join(' | ')).not.toContain('WARNUNG');
    expect(geschrieben[0].deletedSonderTemplates).toContain('tpl-1');
  });

  test('Vorlage fehlt ohne Grabstein: der Riegel bleibt scharf', async ({ page }) => {
    await blockCloud(page);
    // In der Cloud stehen zwei Vorlagen, lokal ist die Liste leer -- aber nur fuer eine gibt es
    // einen Grabstein. "tpl-9" koennte gerade erst von einem Handy angelegt worden sein: dann
    // waere die leere Liste ein Datenverlust und kein gewolltes Loeschen.
    const geschrieben = await cloudMitStand(page, {
      sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }, { id: 'tpl-9', name: 'Vom Handy' }]
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await seedeLokal(page, lokalerStand({ sonderTemplates: [], deletedSonderTemplates: ['tpl-1'] }));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    geschrieben.length = 0;
    await page.evaluate(() => pushToCloud(true));
    expect(geschrieben).toEqual([]);
    const protokoll = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]').map((l) => l.action).join(' | '));
    expect(protokoll).toContain('ABBRUCH: stiller Upload wegen leerer Listen');
  });

  test('Andere geschuetzte Listen bleiben ohne Grabstein scharf', async ({ page }) => {
    await blockCloud(page);
    // Nur sonderTemplates hat eine Grabstein-Liste. Fuer Mitarbeiter darf die Ausnahme nicht
    // gelten -- auch dann nicht, wenn zufaellig Vorlagen-Grabsteine vorhanden sind.
    const geschrieben = await cloudMitStand(page, {
      workers: ['Robert', 'Dominik'],
      sonderTemplates: [{ id: 'tpl-1', name: 'Vorlage A' }]
    });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await seedeLokal(page, lokalerStand({ workers: [], sonderTemplates: [], deletedSonderTemplates: ['tpl-1'] }));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    geschrieben.length = 0;
    await page.evaluate(() => pushToCloud(true));
    expect(geschrieben).toEqual([]);
    const protokoll = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]').map((l) => l.action).join(' | '));
    expect(protokoll).toContain('Mitarbeiter');
  });
});

// ---------------------------------------------------------------------------
// Regressionswache zu Teil A: der Lieferanten-Weg vom Handy zurueck in die Cloud.
// ---------------------------------------------------------------------------

test.describe('Rechner-App - geloeschter Lieferant kommt nicht ueber das Handy zurueck', () => {
  test('Handy-Sync schreibt keine Lieferantenlisten in die Cloud', async ({ page }) => {
    await blockCloud(page);

    // Cloud = Stand des Bueros: "Willms" ist geloescht. Das Handy hat ihn lokal noch.
    const cloudStand = { suppliers: ['Nölke'], deletedSuppliers: ['Willms'], sonderTemplates: [] };
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

    await page.addInitScript(() => {
      localStorage.setItem('kombi_logistik_db', JSON.stringify({
        suppliers: ['Nölke', 'Willms'],
        articles: [],
        workers: []
      }));
    });
    await unlockRechner(page);

    geschrieben.length = 0;
    await page.evaluate(() => silentPushRechnerStammdatenToCloud());
    await expect.poll(() => geschrieben.length).toBe(1);

    // Kern der Wache: der Cloud-Stand behaelt seine Lieferantenliste, "Willms" bleibt geloescht.
    expect(geschrieben[0].suppliers).toEqual(['Nölke']);
    expect(geschrieben[0].deletedSuppliers).toEqual(['Willms']);

    // Und in der Gegenrichtung raeumt der Sync die Liste am Handy auf.
    await page.evaluate((stand) => applyRechnerStammdatenFromCloud(stand), cloudStand);
    const amHandy = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('kombi_logistik_db') || '{}').suppliers);
    expect(amHandy).toEqual(['Nölke']);
  });

  // 2026-08-18: Das Echo war nur auf EINEM von zwei Wegen weg. getLogistikFullCloudPayload()
  // (silentPushLogistikToCloud, backupToCloud, manualCloudPush) schickte die Lieferantenlisten
  // weiter hoch -- samt der Grabsteinliste deletedSuppliers. Ein Geraet mit altem Stand
  // ueberschrieb sie damit in der Cloud mit seiner eigenen, kuerzeren: der geloeschte Lieferant
  // war zurueck UND der Loeschmerker weg.
  test('Auch der zweite PATCH-Weg laesst die Lieferantenlisten in der Cloud in Ruhe', async ({ page }) => {
    await blockCloud(page);

    // Cloud = Stand des Bueros: "Willms" ist geloescht und im Grabstein vermerkt.
    const cloudStand = {
      suppliers: ['Nölke'],
      deletedSuppliers: ['Willms'],
      supplierLines: { 'Nölke': ['Linie 1'] },
      supplierLinesCleared: ['Herta'],
      supplierNumbers: { 'Nölke': '4711' },
      sonderTemplates: []
    };
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

    // Das Handy hat einen alten Stand: "Willms" steht noch drin, sein Grabstein ist leer.
    await page.addInitScript(() => {
      localStorage.setItem('kombi_logistik_db', JSON.stringify({
        suppliers: ['Nölke', 'Willms'],
        deletedSuppliers: [],
        supplierLines: {},
        supplierLinesCleared: [],
        supplierNumbers: {},
        articles: [],
        workers: []
      }));
    });
    await unlockRechner(page);

    const schluessel = await page.evaluate(() => Object.keys(getLogistikFullCloudPayload()));
    ['suppliers', 'supplierLines', 'supplierLinesCleared', 'supplierNumbers', 'deletedSuppliers']
      .forEach((k) => expect(schluessel).not.toContain(k));
    // workers, customers und articles bleiben bewusst drin -- eigene Entscheidung, siehe Notiz.
    expect(schluessel).toContain('articles');

    geschrieben.length = 0;
    await page.evaluate(() => silentPushLogistikToCloud());
    await expect.poll(() => geschrieben.length).toBeGreaterThan(0);
    const letzte = geschrieben[geschrieben.length - 1];

    // Kern der Wache: die Grabsteinliste in der Cloud bleibt vollstaendig ...
    expect(letzte.deletedSuppliers).toEqual(['Willms']);
    // ... und "Willms" kommt nicht ueber das Handy in die Lieferantenliste zurueck.
    expect(letzte.suppliers).toEqual(['Nölke']);
    expect(letzte.supplierNumbers).toEqual({ 'Nölke': '4711' });
    expect(letzte.supplierLines).toEqual({ 'Nölke': ['Linie 1'] });
    expect(letzte.supplierLinesCleared).toEqual(['Herta']);
  });
});
