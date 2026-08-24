// Regressionswache fuer das PIN-Kartenhaus der Rechner-App.
//
// Hintergrund (2026-08-18): getLogistikFullCloudPayload() hat adminPin, logistikPin und
// pinVersion vor dem Hochladen aus den Einstellungen entfernt (safeSettings), den REST des
// settings-Blocks aber weiter mitgeschickt. SupabaseSync.patch() fuehrt nur auf oberster
// Ebene zusammen ({...current, ...daten}) und settings steht nicht in
// SUPABASE_LEER_SCHUTZ_KEYS — jeder stille Handy-Sync hat den settings-Block in der Cloud
// also KOMPLETT ersetzt und damit alle drei PIN-Felder daraus geworfen.
// Dass trotzdem niemand ausgesperrt wurde, hing allein an der fest verdrahteten PIN in
// APP_CONFIG: validateAdminPin() las im Cloud-Zweig "settings?.adminPin ?? APP_CONFIG.ADMIN_PIN"
// und fragte den Zwischenspeicher dort nie. Faellt die Konstante spaeter weg, steht morgens
// um 6 die ganze Schicht vor einer gesperrten App.
//
// Test 1 ist der Kern: ein Handy-Sync darf die PINs in der Cloud nicht mehr anfassen.
// Test 2-6 wachen ueber die Rueckfallkette Cloud -> Zwischenspeicher -> Konstante, in
// BEIDEN Zweigen und ohne dass die Pruefung dabei weich wird.
// Test 7 wacht darueber, dass eine in der Cloud fehlende und spaeter wiederkehrende
// pinVersion keine Loeschung der lokalen Daten ausloest (wipeLocalFirmData raeumt auch
// logistik_offline_db weg — genau der Datenverlust, den wir sonst ueberall verhindern).
const { test, expect } = require('@playwright/test');
const { blockCloud, unlockRechner, RECHNER_PIN } = require('./helpers');

// Reine Testwerte. Die echten PINs stehen NICHT in dieser Datei: wo gegen die eingebaute
// Konstante geprueft wird, wird sie in der Seite selbst aus APP_CONFIG gelesen (Test 5).
const PIN_AUS_CLOUD = '777777';
const PIN_AUS_SPEICHER = '888888';
const PIN_FALSCH = '123456';

/**
 * Cloud-Nachbau MIT Gedaechtnis fuer die Sammelzeile "main": was geschrieben wird, kommt
 * beim naechsten Lesen zurueck. Nur so laesst sich pruefen, was ein Handy-Sync in der Cloud
 * HINTERLAESST — und genau darum geht es hier. zustand.stand darf der Test zwischendurch
 * austauschen (Test 7 nimmt der Cloud die pinVersion weg und gibt sie zurueck).
 * Wird NACH blockCloud() registriert und greift deshalb zuerst; blockCloud bleibt das
 * Sicherheitsnetz gegen jeden Zugriff auf die echte Firmen-Cloud.
 */
async function cloudMitSpeicher(page, startStand) {
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
    const istHauptzeile = /key=eq\.main(&|$)/.test(req.url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(istHauptzeile ? [{ data: zustand.stand }] : [])
    });
  });
  return zustand;
}

/**
 * Kein Netz: weder Cloud noch die oeffentliche Ersatzdatei antworten.
 * app-settings-public.json ist der zweite Weg in fetchSettingsForPinCheck() — ohne diese
 * Sperre waere "offline" im Test gar kein Offline.
 */
async function ohneNetz(page) {
  await page.route('**://*.supabase.co/**', (route) => route.abort());
  await page.route('**/app-settings-public.json**', (route) => route.abort());
}

/** Zwischenspeicher des Geraets vorbelegen (kombi_logistik_db.settings). */
async function speicherStand(page, settings) {
  await page.addInitScript((s) => {
    localStorage.setItem('kombi_logistik_db', JSON.stringify(s ? { settings: s } : {}));
  }, settings || null);
}

test.describe('Rechner-App - PIN-Rueckfallkette und Cloud-Einstellungen', () => {
  test('KERN: ein stiller Handy-Sync laesst adminPin, logistikPin und pinVersion in der Cloud stehen', async ({ page }) => {
    await blockCloud(page);
    const cloudSettings = {
      printerIp: '192.168.0.99',
      notificationUrl: 'https://example.invalid/melden',
      inactivityTimeout: 0,
      noelkeDefaultArtNr: 'TEST',
      logistikPin: RECHNER_PIN,
      adminPin: PIN_AUS_CLOUD,
      pinVersion: 2
    };
    const zustand = await cloudMitSpeicher(page, {
      settings: { ...cloudSettings },
      suppliers: ['Noelke'],
      customers: ['Edeka']
    });
    // Entscheidend: das Handy hat die Einstellungen OHNE PINs im lokalen Speicher liegen —
    // genau so kommen sie ueber applyLogistikFullFromCloud() an. Frueher baute
    // getLogistikFullCloudPayload() daraus ein settings-Objekt ohne die drei PIN-Felder und
    // ersetzte damit den Cloud-Block. Ohne diese Vorbelegung waere safeSettings leer gewesen
    // und der Test aus dem falschen Grund gruen.
    await speicherStand(page, { printerIp: '192.168.0.99', noelkeDefaultArtNr: 'TEST' });

    await unlockRechner(page);
    zustand.schreibzugriffe.length = 0;
    await page.evaluate(() => silentPushLogistikToCloud());

    await expect.poll(() => zustand.schreibzugriffe.length, { timeout: 10000 }).toBeGreaterThan(0);
    // Der Kern: die Cloud haelt die PINs nach dem Sync unveraendert.
    expect(zustand.stand.settings).toBeTruthy();
    expect(zustand.stand.settings.adminPin).toBe(PIN_AUS_CLOUD);
    expect(zustand.stand.settings.logistikPin).toBe(RECHNER_PIN);
    expect(zustand.stand.settings.pinVersion).toBe(2);
    // Und die uebrigen Einstellungen sind auch nicht beschaedigt.
    expect(zustand.stand.settings.printerIp).toBe('192.168.0.99');
    // Kein einziger Schreibzugriff darf den settings-Block veraendern.
    zustand.schreibzugriffe.forEach((daten) => {
      expect(daten.settings).toEqual(cloudSettings);
    });
  });

  test('Cloud liefert Einstellungen MIT PIN: die Cloud-PIN gilt, eine abweichende im Zwischenspeicher nicht', async ({ page }) => {
    await blockCloud(page);
    await cloudMitSpeicher(page, {
      settings: { logistikPin: PIN_AUS_CLOUD, adminPin: PIN_AUS_CLOUD, pinVersion: 2, printerIp: '192.168.0.99' }
    });
    await speicherStand(page, { logistikPin: PIN_AUS_SPEICHER, adminPin: PIN_AUS_SPEICHER, pinVersion: 2 });
    await page.goto('/index.html');

    // Reihenfolge ist Absicht: validateAdminPin() ruft cacheSettingsPins() als Erstes auf und
    // ueberschreibt den Zwischenspeicher mit dem Cloud-Wert. Die alte Speicher-PIN muss
    // deshalb VORHER abgefragt werden, sonst waere die Frage gar nicht mehr gestellt.
    expect(await page.evaluate((p) => validateAdminPin(p), PIN_AUS_SPEICHER)).toBe(false);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_AUS_SPEICHER)).toBe(false);
    expect(await page.evaluate((p) => validateAdminPin(p), PIN_FALSCH)).toBe(false);
    expect(await page.evaluate((p) => validateAdminPin(p), PIN_AUS_CLOUD)).toBe(true);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_AUS_CLOUD)).toBe(true);
  });

  test('Cloud liefert Einstellungen OHNE PIN: der Zwischenspeicher greift', async ({ page }) => {
    await blockCloud(page);
    // Genau der Stand, den die Handys heute in der Cloud hinterlassen haben: settings ist da,
    // die drei PIN-Felder fehlen.
    await cloudMitSpeicher(page, { settings: { printerIp: '192.168.0.99', inactivityTimeout: 0 } });
    await speicherStand(page, { logistikPin: PIN_AUS_SPEICHER, adminPin: PIN_AUS_SPEICHER, pinVersion: 2 });
    await page.goto('/index.html');

    expect(await page.evaluate((p) => validateAdminPin(p), PIN_FALSCH)).toBe(false);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_FALSCH)).toBe(false);
    expect(await page.evaluate((p) => validateAdminPin(p), PIN_AUS_SPEICHER)).toBe(true);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_AUS_SPEICHER)).toBe(true);
  });

  test('Cloud liefert gar nichts (offline): der Zwischenspeicher greift', async ({ page }) => {
    await blockCloud(page);
    await ohneNetz(page);
    await speicherStand(page, { logistikPin: PIN_AUS_SPEICHER, adminPin: PIN_AUS_SPEICHER, pinVersion: 2 });
    await page.goto('/index.html');

    expect(await page.evaluate((p) => validateAdminPin(p), PIN_FALSCH)).toBe(false);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_FALSCH)).toBe(false);
    expect(await page.evaluate((p) => validateAdminPin(p), PIN_AUS_SPEICHER)).toBe(true);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_AUS_SPEICHER)).toBe(true);
  });

  test('Weder Cloud noch Zwischenspeicher (frisch installiert, ohne Netz): die eingebaute PIN greift', async ({ page }) => {
    await blockCloud(page);
    await ohneNetz(page);
    await speicherStand(page, null);
    await page.goto('/index.html');

    // Die echten Werte werden in der Seite gelesen — sie gehoeren nicht in diese Datei.
    const konstanten = await page.evaluate(() => ({ admin: APP_CONFIG.ADMIN_PIN, logistik: APP_CONFIG.LOGISTIK_PIN }));
    expect(await page.evaluate((p) => validateAdminPin(p), PIN_FALSCH)).toBe(false);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_FALSCH)).toBe(false);
    expect(await page.evaluate((p) => validateAdminPin(p), konstanten.admin)).toBe(true);
    expect(await page.evaluate((p) => validatePinAndUnlock(p), konstanten.logistik)).toBe(true);
  });

  test('Falsche PIN wird in JEDER der vier Lagen abgelehnt', async ({ page }) => {
    await blockCloud(page);
    const zustand = await cloudMitSpeicher(page, { settings: { adminPin: PIN_AUS_CLOUD, logistikPin: PIN_AUS_CLOUD } });
    await speicherStand(page, { adminPin: PIN_AUS_SPEICHER, logistikPin: PIN_AUS_SPEICHER });

    const lagen = [
      { name: 'Cloud mit PIN', stand: { settings: { adminPin: PIN_AUS_CLOUD, logistikPin: PIN_AUS_CLOUD } } },
      { name: 'Cloud ohne PIN', stand: { settings: { printerIp: '192.168.0.99' } } },
      { name: 'Cloud ohne settings', stand: { suppliers: ['Noelke'] } },
      { name: 'Cloud leer', stand: {} }
    ];
    for (const lage of lagen) {
      zustand.stand = lage.stand;
      await page.goto('/index.html');
      expect(await page.evaluate((p) => validateAdminPin(p), PIN_FALSCH), lage.name).toBe(false);
      expect(await page.evaluate((p) => validatePinAndUnlock(p), PIN_FALSCH), lage.name).toBe(false);
      // Leere Eingabe ist ebenfalls keine PIN — auch dann nicht, wenn in der Cloud gar
      // keine steht.
      expect(await page.evaluate(() => validateAdminPin('')), lage.name).toBe(false);
      expect(await page.evaluate(() => validatePinAndUnlock('')), lage.name).toBe(false);
    }
  });

  test('pinVersion verschwindet aus der Cloud und kommt zurueck: KEINE Loeschung der lokalen Daten', async ({ page }) => {
    await blockCloud(page);
    const zustand = await cloudMitSpeicher(page, {
      settings: { logistikPin: RECHNER_PIN, adminPin: PIN_AUS_CLOUD, pinVersion: 2 },
      suppliers: ['Noelke']
    });
    await page.addInitScript(() => {
      localStorage.setItem('kombi_logistik_db', JSON.stringify({ settings: { printerIp: '192.168.0.99' }, suppliers: ['Noelke'] }));
      // Der Offline-Puffer ist das, was bei einem Fehlalarm verloren ginge.
      localStorage.setItem('logistik_offline_db', JSON.stringify({ eintraege: [{ id: 1 }] }));
    });

    await unlockRechner(page);
    expect(await page.evaluate(() => localStorage.getItem('app_pin_version'))).toBe('2');

    const nochDa = () => page.evaluate(() => ({
      auth: localStorage.getItem('app_authenticated'),
      offline: localStorage.getItem('logistik_offline_db'),
      logistik: localStorage.getItem('kombi_logistik_db'),
      version: localStorage.getItem('app_pin_version')
    }));

    // 1. pinVersion faellt aus der Cloud (der Zustand, den die Handy-Syncs erzeugt haben).
    zustand.stand = { settings: { printerIp: '192.168.0.99' }, suppliers: ['Noelke'] };
    expect(await page.evaluate(() => verifySessionStillValid())).toBe(true);
    let stand = await nochDa();
    expect(stand.auth).toBe('true');
    expect(stand.offline).not.toBeNull();
    expect(stand.logistik).not.toBeNull();
    expect(stand.version).toBe('2');

    // 2. pinVersion kommt unveraendert zurueck (Control Center speichert die Einstellungen neu).
    zustand.stand = { settings: { logistikPin: RECHNER_PIN, adminPin: PIN_AUS_CLOUD, pinVersion: 2 }, suppliers: ['Noelke'] };
    expect(await page.evaluate(() => verifySessionStillValid())).toBe(true);
    stand = await nochDa();
    expect(stand.auth).toBe('true');
    expect(stand.offline).not.toBeNull();
    expect(stand.version).toBe('2');

    // Gegenprobe, damit dieser Test nicht aus Bequemlichkeit gruen ist: bei einer ECHTEN
    // PIN-Aenderung (hoehere pinVersion) MUSS der Entzug weiter greifen.
    zustand.stand = { settings: { logistikPin: RECHNER_PIN, adminPin: PIN_AUS_CLOUD, pinVersion: 3 }, suppliers: ['Noelke'] };
    expect(await page.evaluate(() => verifySessionStillValid())).toBe(false);
    stand = await nochDa();
    expect(stand.auth).toBeNull();
    expect(stand.offline).toBeNull();
  });
});
