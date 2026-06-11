# Skill: deploy

## Trigger
Wenn der Nutzer "deployen", "pushen", "veröffentlichen", "auf GitHub laden" oder "/deploy" sagt.

## Quelle vs. APK-Assets
- **Entwickeln nur in `Tresch-Apps/`** — das ist die einzige Quelle.
- `AndroidStudioProjects/.../assets/` wird **nicht** direkt bearbeitet; Kopie nur beim USB-Deploy (Backup, falls OTA/GitHub beim Test ausfällt).

## Apps getrennt
- Rechner, Logistik, Control Center: **eigenständig**, keine Code-Verschmelzung.
- Logistik-Fixes nur in `logistik/`; Rechner-Fixes nur im Rechner-Baum — nicht `js/gemeinsam/` nach Logistik kopieren.

## Was dieser Skill macht
1. Versionsnummer in `js/script.js` (WEB_BUILD_VERSION) um 1 erhöhen
2. Dieselbe Nummer in `app-version.json` (webVersion) aktualisieren
3. `?v=XXX` in `index.html` auf neue Nummer setzen
4. Logistik-Version in `logistik/index.html` (`?v=XXX`) und `app-version.json` (logistikVersion) erhöhen — NUR wenn Logistik-Dateien geändert wurden
5. Sicherheitscheck: `app-secrets.json` darf NICHT in git staged sein
6. Git commit + push

## Schritte

### 1. Aktuelle Version lesen
```
Read js/script.js → suche WEB_BUILD_VERSION
Read app-version.json → prüfe webVersion + logistikVersion
```

### 2. Secrets-Check (PFLICHT vor jedem Commit)
```powershell
git status --short
```
Wenn `app-secrets.json` in der Ausgabe steht → STOPP, Nutzer warnen.

### 3. Prüfen welche Apps geändert wurden
```powershell
git diff --name-only HEAD
```
- Dateien in `logistik/` geändert → logistikVersion erhöhen
- Dateien in `index.html`, `js/`, `css/` etc. → webVersion erhöhen

### 4. Rechner-App Version erhöhen (wenn geändert)
- `WEB_BUILD_VERSION` in `js/script.js` um 1 erhöhen
- `webVersion` in `app-version.json` auf gleichen Wert setzen
- alle `?v=XXX` in `index.html` auf neuen Wert setzen

### 5. Logistik-App Version erhöhen (wenn geändert)
- `logistikVersion` in `app-version.json` um 1 erhöhen
- `logistikLabel` auf `"1.X"` setzen (X = logistikVersion)
- `?v=XXX` in `logistik/index.html` bei `core.js` und `app.js` auf neuen Wert setzen

### 6. Commit und Push
```powershell
git add -A
git commit -m "App Update Build <neue_version>"
git push origin main
```

### 7. Bestätigung
Melde dem Nutzer:
- Rechner-App: Build-Nummer
- Logistik-App: Version + GitHub Pages URL: https://truschi84-dot.github.io/versand/logistik/
- Hinweis: Auf Handy → Browser öffnen → URL eingeben → "Zum Startbildschirm hinzufügen"

## Logistik-App separat auf Handy installieren
URL für Handys: `https://truschi84-dot.github.io/versand/logistik/`
- Chrome Android: Menü → "Zum Startbildschirm hinzufügen"
- Safari iOS: Teilen → "Zum Home-Bildschirm"
Die App hat ein eigenes Manifest (logistik/manifest.webmanifest) und erscheint als eigenständige App.

## Wichtig
- Niemals pushen wenn `app-secrets.json` staged ist
- Immer `git status` vor dem Commit zeigen
- Bei Fehler: nicht force-pushen, Fehler erklären
