// Regressionswache fuer den zerstoerenden Voll-PUT im Control Center.
//
// Hintergrund: pushToCloud() (control-center-core.js) liest zuerst den Cloud-Stand
// ("Smart Sync") und schreibt danach die KOMPLETTE Cloud-Zeile per PUT. In
// supabase_sync.js geht ein PUT ohne Unterschluessel auf SupabaseSync.upsert(), also
// eine Voll-Ersetzung der Zeile. Scheiterte das Lesen (401 nach Schluesselwechsel,
// 500/503, haengender Server -> Zeitlimit), lief der PUT trotzdem: alles, was nur in
// der Cloud stand (teamSortierBuchungen von den Handys, entries/LKW-Liste, workers,
// dailyAttendance, teamTagesMengen, deletedSortierBuchungen, Briefing-Status) war weg.
// Verschaerfend: deleteSortierBuchung() (control-center-stats.js) ruft pushToCloud(true),
// jedes Loeschen einer Sortier-Buchung loest den PUT also aus.
//
// Test 1 wacht darueber, dass bei fehlgeschlagenem Lesen NICHTS geschrieben wird.
// Test 2 wacht ueber die Gegenrichtung: eine rechtmaessig LEERE Cloud-Zeile
// (Erstbefuellung) darf das Speichern nicht blockieren.
const { test, expect } = require('@playwright/test');
const { blockCloud } = require('./helpers');

/** Wartet, bis die App fertig initialisiert ist (wie in control-center.spec.js). */
async function waitForAppReady(page) {
  await expect(page.locator('#db-status')).not.toHaveText('Lade Datenbank…', { timeout: 10000 });
}

/**
 * Faengt alle Cloud-Aufrufe ab. Schreibzugriffe (POST = upsert) werden nur gezaehlt und
 * bestaetigt, Lesezugriffe (GET) bekommen die uebergebene Antwort. Wird NACH blockCloud()
 * registriert und greift deshalb zuerst — blockCloud bleibt das Sicherheitsnetz, damit
 * unter keinen Umstaenden ein Aufruf an die echte Firmen-Cloud geht.
 */
async function cloudMitZaehler(page, leseAntwort) {
  const schreibzugriffe = [];
  await page.route('**://*.supabase.co/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      let key = '';
      try { key = JSON.parse(req.postData() || '{}').key || ''; } catch (_) { /* egal */ }
      schreibzugriffe.push({ methode: req.method(), key });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    }
    return leseAntwort(route);
  });
  return schreibzugriffe;
}

test.describe('Control Center - Schutz gegen zerstoerenden Cloud-PUT', () => {
  test('Cloud-Lesen scheitert (HTTP 500): es geht KEIN Schreibzugriff raus und der Bediener wird gewarnt', async ({ page }) => {
    await blockCloud(page);
    const schreibzugriffe = await cloudMitZaehler(page, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Serverfehler"}' })
    );

    const meldungen = [];
    page.on('dialog', (d) => { meldungen.push(d.message()); d.dismiss().catch(() => {}); });

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    // Erst ab hier zaehlt es: der Seitenstart selbst soll das Ergebnis nicht verfaelschen.
    schreibzugriffe.length = 0;
    meldungen.length = 0;
    await page.evaluate(() => pushToCloud(true));

    // Kern der Wache: keine Voll-Ersetzung der Cloud-Zeile.
    expect(schreibzugriffe).toEqual([]);
    // Der Abbruch ist sichtbar — nicht still.
    await expect(page.locator('#db-status')).toContainText('Cloud konnte nicht gelesen werden');
    await expect(page.locator('#sticky-status')).toContainText('Nicht in der Cloud gespeichert');
    expect(meldungen.join(' | ')).toContain('NICHTS geschrieben');
    // ... und steht im Protokoll.
    const protokoll = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('admin_cloud_logs') || '[]').map((l) => l.action).join(' | ')
    );
    expect(protokoll).toContain('ABBRUCH');
  });

  test('Cloud-Zeile ist leer (Erstbefuellung): der PUT laeuft trotzdem', async ({ page }) => {
    await blockCloud(page);
    // PostgREST antwortet bei "Zeile existiert nicht" mit 200 und leerer Liste.
    const schreibzugriffe = await cloudMitZaehler(page, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    page.on('dialog', (d) => d.dismiss().catch(() => {}));

    await page.goto('/control/index.html');
    await waitForAppReady(page);

    schreibzugriffe.length = 0;
    await page.evaluate(() => pushToCloud(true));

    await expect(page.locator('#db-status')).toContainText('Mit Cloud synchronisiert');
    expect(schreibzugriffe.some((s) => s.key === 'main')).toBe(true);
  });
});
