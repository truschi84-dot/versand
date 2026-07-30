# Project Structure Map — Tresch Kombi-App

## Haupt-Apps
| Datei | Zweck |
|-------|-------|
| `index.html` | Rechner-App (Mitarbeiter) |
| `logistik.html` | Logistik-App (Chef) — neu seit 2026-06-10 |
| `projekt/buero/control-center.html` | PC Control Center |

## JS-Module
| Datei | Gehört zu |
|-------|-----------|
| `js/script.js` | Geteilt — PIN, Cloud, App-Init |
| `js/cloud_auth.js` | Geteilt — Firebase Auth |
| `js/logistik.js` | Logistik-App |
| `js/rechner.js` | Rechner-App |
| `js/rechner_scanner.js` | Rechner — Barcode |
| `js/rechner_druck.js` | Rechner — Drucken |
| `js/rechner_reklamation.js` | Rechner — Reklamation |
| `js/rechner_leergut.js` | Rechner — Leergut |
| `js/team_brief.js` | Geteilt — Team |
| `js/druck_utils.js` | Geteilt — Druckhelfer |
| `js/gemeinsam/datenbank.js` | Nur Rechner (intern) |
| `js/gemeinsam/metriken.js` | Nur Rechner (intern) |
| `logistik/js/metriken.js` | Nur Logistik (eigene Kopie, nicht mit Rechner verschmelzen) |

## Versions-Dateien
- `js/script.js` → `WEB_BUILD_VERSION` (aktuell: 107)
- `app-version.json` → `webVersion`
- `app-update.json` → OTA-Update-Config

## Skills
- `.claude/skills/deploy/` — Deployen auf GitHub Pages
- `.claude/skills/test-apps/` — Beide Apps testen
- `.claude/skills/security-check/` — Secrets prüfen
- `.claude/skills/bump-version/` — Versionsnummern erhöhen

## Wichtige Regeln
- `app-secrets.json` → niemals committen
- Nach HTML-Änderungen `?v=XXX` erhöhen
- Immer beide Apps testen nach Änderungen
