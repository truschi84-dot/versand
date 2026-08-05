# Bekannte Wiederkehrende Fehler — Tresch Apps

Diese Datei dokumentiert Fehler die mehrfach aufgetreten sind.
**Vor jeder Änderung hier nachschauen!**

---

## 🔴 Scroll-Lock nach Menü öffnen (Rechner-App)

**Symptom:** Nach dem Öffnen/Schließen des Burger-Menüs scrollt die restliche Seite nicht mehr.

**Ursache:** `body.menu-open { overflow: hidden; touch-action: none; }` in `index.html` — sperrt den ganzen Body, nicht nur den Drawer.

**Fix:** `overflow: hidden` aus `body.menu-open` entfernen. Der Drawer sperrt sich selbst intern. Nur `touch-action: none` darf für das Overlay bleiben wenn nötig.

**Datei:** `index.html` Zeile ~27

**Zuletzt aufgetreten:** Build 114, Build 117

---

## 🔴 Scroll-Lock in Logistik (Bottom Sheet)

**Symptom:** Nach dem Öffnen eines Bottom Sheets in der Logistik-App scrollt die Seite darunter nicht mehr.

**Ursache:** `applyLogistikDocumentScroll()` setzte `overflow: hidden` auf document — blieb hängen unabhängig vom Bottom-Sheet-Status.

**Fix:** `applyLogistikDocumentScroll()` komplett entfernt (Build 114). Kein `overflow: hidden` auf Document/Body in Logistik setzen.

**Datei:** `logistik/js/app.js`

**Zuletzt aufgetreten:** Build 114

---

## 🔴 APK enthält veraltete Web-Dateien

**Symptom:** Installierte APK zeigt alte App-Version, Supabase/neue Features fehlen.

**Ursache:** `AndroidStudioProjects/Versand/app/src/main/assets/` war nicht synchronisiert — Gradle packt was da liegt.

**Fix:** Immer vor APK-Build syncen: Web-Dateien aus `Tresch-Apps/` → `assets/`. Niemals direkt in `assets/` entwickeln.

**Zuletzt aufgetreten:** Build 116/117

---

## 🔴 app-secrets.json in Android assets gelandet

**Symptom:** Geheime Datei wurde in APK eingepackt.

**Ursache:** Beim Sync wurde der komplette Tresch-Apps-Ordner inkl. Secrets kopiert.

**Fix:** Nach Sync immer `Remove-Item "$dst\js\app-secrets.json"` ausführen. Assets-Ordner darf NIEMALS `app-secrets.json` enthalten.

**Zuletzt aufgetreten:** Juni 2026

---

## 🟡 Doppelbuchung bei Artikel-Sync (Rechner)

**Symptom:** Verwaiste Buchungen mit gleicher FertigNr werden doppelt gezählt.

**Fix:** Build 115 — verwaiste Buchungen bei Artikel-Sync bereinigen.

**Datei:** `js/rechner.js`

---

## 🟡 Sitzungs-ID Sortierung — 2x selber Lieferant am gleichen Tag

**Symptom:** Wenn ein Lieferant zweimal am selben Tag sortiert wird (mit Reset dazwischen), zählt die 2. Session falsch.

**Status:** Build 115 gefixt mit Sitzungs-ID für Sortierung.

---

## 🆕 Offene Funde aus Code-Review 2026-07-14 (noch NICHT behoben)

Vollständiger Review von Rechner-App (`js/rechner*.js`) und Control Center (`control/`) via Claude Code. Noch nicht gefixt — Robert hat um Absprache vor Umsetzung gebeten.

### 🔴 Leergut-Zähler wachsen unbegrenzt (Rechner)
**Datei:** `js/rechner.js:608` (renderLKW), analog `renderSort()` ~702-716, `openEditLKW()`/`openEditSort()` ~812-854
**Ursache:** `let lgMap = e.leergut || {}` klont das Objekt nicht — bei jedem Re-Render werden e2/he/h1/eu erneut auf dasselbe Objekt addiert und persistiert.
**Fix-Ansatz:** Klonen wie in `rechner_druck.js` (`{...item.leergut}`).

### 🔴 Gelöschte Sortier-Buchungen tauchen im Tagesexport wieder auf (Control)
**Datei:** `control/js/control-center-tagesexport.js:137`
**Ursache:** `berechneSortierExportNachTierart()` prüft `b.id || datum|lief|sorte` gegen `deletedSortierBuchungen`, das aber überall sonst im Format `sessionKey|datum` gespeichert wird (siehe `control-center-stats.js:776`, `metriken.js:550`) — matcht nie.
**Fix-Ansatz:** Key-Format auf `b.sessionKey + '|' + b.datum` vereinheitlichen.

### 🟡 Standard-Admin-PIN hart codiert (Control, Sicherheit)
**Datei:** `control/js/control-center-core.js` (Default und Fallback `ADMIN_PIN = db.settings.adminPin || <PIN>`)
**Risiko:** Die echte PIN lag offen im Quelltext, der öffentlich über GitHub Pages ausgeliefert wird — und griff, sobald das PIN-Feld je leer war.
**Status 2026-08-05:** Im Control Center durch die Konstante `DEFAULT_ADMIN_PIN` ersetzt; die echte PIN kommt nur noch aus den Cloud-Einstellungen. **Die PIN steht weiterhin an anderen Stellen im Repo** (u. a. `js/script.js`, `app-settings-public.json`, `projekt/pc/control-center.html`) — Robert hat das am 05.08. bewusst so belassen, weil die App künftig nur im Firmennetz läuft. Beim nächsten Aufräumen mit erledigen.
**Fix-Ansatz:** Fallback entfernen oder zumindest nicht im Klartext im Source belassen.

### 🟡 Weitere plausible, nicht einzeln verifizierte Funde
- `js/rechner.js:1061` — `getLeergutConfig()` zerlegt Komma-Dezimalwerte (z.B. "2,5") in der Leergut-Config falsch.
- `control/js/control-center-core.js:450` — Home-Dashboard summiert `workerShares.kg` ohne `parseFloat`, kann bei numerischen Strings zu String-Verkettung führen.
- `js/rechner.js:566` — Sonderposten-Nettogewicht ohne NaN-Prüfung vor dem Speichern.
- `control/js/control-center-artikel.js:124` — Duplikat-Prüfung für Fertig-/Lose-Nr prüft nicht alle 4 Pools.
- `control/js/control-center-lieferanten.js:201` — `Number()` statt `parseFloat()`, verwirft Komma-Dezimalwerte.
- `js/rechner.js:662` — `addSort()` bricht ohne Nutzer-Feedback ab, wenn keine Sorte gewählt ist.
- `js/rechner.js:530` — addPal/addSort, calcSonder/calcSonderSort, openEditLKW/openEditSort sind stark duplizierte Funktionspaare (Ursache dafür, dass obige Bugs oft nur in einer der zwei Kopien behoben werden).

---

## 🔴 index.html wirft JS-Fehler beim Laden — logistik.js fällt auf der Rechner-Seite komplett aus

**Gefunden:** 2026-07-14, beim Aufbau der Playwright-Testsuite (`tests/rechner.spec.js`, Test "index.html laedt ohne JavaScript-Fehler"), direkt reproduziert und bestätigt (kein Verdacht, verifizierter Fund).

**Symptom:** Bei JEDEM Laden von `index.html` wirft der Browser `SyntaxError: Identifier 'getLocalISO' has already been declared`. Dadurch bricht die Ausführung von `js/logistik.js` auf dieser Seite komplett ab — keine seiner Funktionen ist auf der Rechner-Seite verfügbar (getestet: `closeBackupModal` ist `undefined`).

**Ursache:** `index.html` lädt sowohl `js/script.js` (Zeile 751, deklariert `function getLocalISO() {...}`) als auch `js/logistik.js` (Zeile 758, deklariert `const getLocalISO = () => {...}` in Zeile 6) — zwei Top-Level-Deklarationen desselben Namens über mehrere `<script>`-Tags auf derselben Seite. Bei `const`/`let` (anders als bei `function`) wirft der Browser dafür einen SyntaxError, der die komplette Skript-Datei ab dieser Zeile blockiert.

Verstößt außerdem gegen die eigene Projektregel in `CLAUDE.md`: "Jede App bleibt eigenständig — kein gemeinsamer Code-Pfad zwischen Rechner ↔ Logistik" — `logistik.js` sollte laut Regel gar nicht erst in `index.html` eingebunden sein.

**Auswirkung:** Unklar, welche Rechner-Funktionalität konkret auf `logistik.js`-Funktionen auf dieser Seite angewiesen ist (z.B. Backup-Erinnerung `checkAndOfferBackup`) — die fallen derzeit still aus, ohne dass es im normalen Betrieb auffällt.

**Fix-Ansatz:** Klären, ob `js/logistik.js` in `index.html` überhaupt gebraucht wird (Projektregel sagt: nein). Falls nicht gebraucht: `<script src="js/logistik.js?v=135">` aus `index.html` entfernen. Falls doch gebraucht: die doppelte `getLocalISO`-Deklaration entfernen (z.B. in `logistik.js` die eigene Kopie löschen und die aus `script.js` mitbenutzen, da beide identisch sind).

**Status:** Noch NICHT gefixt — Robert muss entscheiden, ob/wie `logistik.js` auf der Rechner-Seite gebraucht wird, bevor gefixt wird.

**Regressionswache:** `tests/rechner.spec.js` → "index.html laedt ohne JavaScript-Fehler (script.js/logistik.js Konflikt)" (schlägt aktuell absichtlich fehl).
