# Skill: bump-version

## Trigger
Wenn der Nutzer "version erhöhen", "neue version", "build nummer", "/bump-version" sagt.

## Was dieser Skill macht
Erhöht alle Versionsnummern synchron — damit der Browser keine alten Dateien cached.

## Dateien die aktualisiert werden müssen

| Datei | Was ändern |
|-------|-----------|
| `js/script.js` | `WEB_BUILD_VERSION = XXX` (Zeile ~14) |
| `app-version.json` | `"webVersion": XXX` |
| `index.html` | Alle `?v=XXX` in script/link Tags |
| `logistik.html` | Alle `?v=XXX` in script/link Tags |

## Schritte

### 1. Aktuelle Version lesen
```
Grep WEB_BUILD_VERSION in js/script.js
Read app-version.json
```

### 2. Neue Version berechnen
Aktuelle Version + 1

### 3. Alle Stellen aktualisieren
- `js/script.js`: `WEB_BUILD_VERSION = <neu>`
- `app-version.json`: `"webVersion": <neu>`
- `index.html`: alle `?v=<alt>` → `?v=<neu>` (nur in script/link src Attributen)
- `logistik.html`: alle `?v=<alt>` → `?v=<neu>`

### 4. Bestätigung
"Version von XXX auf YYY erhöht in 4 Dateien."

## Hinweis
Dieser Skill ändert KEINEN funktionalen Code — nur Versionsnummern.
Nach bump-version immer noch testen + deployen.
