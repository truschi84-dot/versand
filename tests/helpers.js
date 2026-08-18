// Gemeinsame Test-Helfer fuer Rechner-App und Control Center.
//
// WICHTIG: blockCloud() muss in JEDEM Test als Erstes aufgerufen werden.
// Sie verhindert, dass Testlaeufe echte Firmendaten in der produktiven
// Supabase-Cloud-Datenbank oder ueber die Deploy-API veraendern.
//
// Backend-Adresse zentral hier halten (nicht in den einzelnen Tests) --
// wenn nach dem Server-Umzug ins Firmen-Intranet ein anderes Backend
// verwendet wird, muss nur CLOUD_HOST_PATTERN angepasst werden.
const CLOUD_HOST_PATTERN = '**://*.supabase.co/**';
const DEPLOY_API_PATTERN = '**/api/deploy**';

const RECHNER_PIN = '3132';
// 2026-08-18: Hier stand die ECHTE Admin-PIN. tests/ wird auf GitHub Pages als ganz
// normales Verzeichnis mit ausgeliefert -- damit lag sie oeffentlich im Netz. Beide Werte
// sind jetzt reine Testwerte: die Tests blocken die Cloud (blockCloud) und setzen die
// Einstellungen, gegen die geprueft wird, ohnehin selbst.
// Es gehoert KEINE echte PIN in diese Datei zurueck.
const RECHNER_ADMIN_PIN = '999999';
const CONTROL_ADMIN_PIN = '0000';

/**
 * Blockt jeden Netzwerk-Aufruf zur echten Cloud-Datenbank und zur
 * Deploy-Schnittstelle. Der App-Code faengt das als Netzwerkfehler ab
 * und faellt auf lokale Daten zurueck (siehe fetchSettingsForPinCheck
 * in js/script.js) -- die App bleibt dadurch voll benutzbar, ohne dass
 * echte Firmendaten angefasst werden.
 */
async function blockCloud(page) {
  await page.route(CLOUD_HOST_PATTERN, (route) => route.abort());
  await page.route(DEPLOY_API_PATTERN, (route) => route.abort());
}

/** Rechner-App (index.html) entsperren -- Firmen-PIN. */
async function unlockRechner(page) {
  await page.goto('/index.html');
  const pinInput = page.locator('#pin-input');
  await pinInput.waitFor({ state: 'visible' });
  await pinInput.fill(RECHNER_PIN);
  await page.locator('#pin-submit-btn').click();
  await page.locator('#pin-protection-overlay').waitFor({ state: 'hidden' });
}

module.exports = {
  CLOUD_HOST_PATTERN,
  DEPLOY_API_PATTERN,
  RECHNER_PIN,
  RECHNER_ADMIN_PIN,
  CONTROL_ADMIN_PIN,
  blockCloud,
  unlockRechner,
};
