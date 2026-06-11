# Skill: security-check

## Trigger
Wenn der Nutzer "sicherheit prüfen", "secrets prüfen", "safe to push", "/security-check" sagt,
oder AUTOMATISCH vor jedem git push/commit.

## Was dieser Skill macht
Prüft ob versehentlich Passwörter oder API-Keys in den Code gerutscht sind.

## Schritte

### 1. Git-Status prüfen
```powershell
git status --short
git diff --cached --name-only
```
→ Wenn `app-secrets.json` dabei ist: **SOFORT STOPP + Warnung**

### 2. Staged Dateien auf Secrets scannen
```powershell
git diff --cached
```
Suche nach diesen Mustern in den Änderungen:
- `firebaseApiKey`
- `firebaseAuthPassword`
- `firebaseAuthEmail`
- `AIza` (Google API Key Präfix)
- `password` oder `passwort` (Kleinschreibung ignorieren)

### 3. .gitignore prüfen
```
Read .gitignore
```
Folgende Einträge MÜSSEN vorhanden sein:
- `app-secrets.json`
- `js/cloud_secrets.embed.js` (optional aber empfohlen)

### 4. Öffentliche Dateien prüfen
Prüfe `app-settings-public.json` — darf nur PINs und URLs enthalten, keine Passwörter.

### 5. Bericht ausgeben
- ✅ Alles sicher → kurze Bestätigung
- ❌ Problem gefunden → genaue Stelle nennen + Lösung vorschlagen

## Bei Fund eines Secrets
1. Datei aus git staging entfernen: `git reset HEAD <datei>`
2. `.gitignore` aktualisieren
3. Nutzer informieren das Passwort zu ändern
