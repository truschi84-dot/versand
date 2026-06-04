# Firebase OTA – Schritt für Schritt (bestehendes Konto)

Projekt in der App: **`tresch-versand-default`**  
(Backup-URL: `https://tresch-versand-default-rtdb.firebaseio.com/backup`)

Zwei Dinge in Firebase:

1. **Hosting** = die Web-App-Dateien (HTML/JS/CSS) – wie ein kleiner Webserver, **Free Tier** reicht.
2. **Realtime Database → `app_config`** = sagt der APK, **welche URL** und **welche Versionsnummer** gilt.

Der Handy-Speicher wird **nicht** voll, weil der alte Service Worker deaktiviert ist (siehe `OTA_UPDATE.md`).

---

## Teil 1: Firebase Hosting (einmalig)

### 1. Firebase CLI installieren

PowerShell:

```powershell
npm install -g firebase-tools
firebase login
```

Browser öffnet sich → mit dem **gleichen Google-Konto** anmelden wie in der Firebase Console.

### 2. Hosting aktivieren (Console)

1. https://console.firebase.google.com  
2. Projekt **tresch-versand-default** wählen  
3. Links **Build** → **Hosting** → **Erste Schritte** / **Get started**  
4. Wizard kannst du **überspringen** – die Datei `firebase.json` liegt schon im Ordner `assets`.

### 3. Erstes Deploy vom PC

```powershell
cd C:\Users\Trusc\Desktop\assets
firebase deploy --only hosting
```

Am Ende steht etwas wie:

`Hosting URL: https://tresch-versand-default.web.app`

**Diese URL merken** – das ist deine `webBaseUrl`.

Test im Browser: `https://tresch-versand-default.web.app/index.html`  
→ Kombi-App sollte erscheinen.

---

## Teil 2: `app_config` in der Realtime Database

Die APK liest beim Start:

`https://tresch-versand-default-rtdb.firebaseio.com/app_config.json`

### Variante A – Firebase Console (einfach)

1. Console → **Realtime Database** → Tab **Daten**  
2. Wenn noch nichts da ist: Datenbank **im Testmodus** oder mit bestehenden Regeln (Backup-Pfad kennst du schon).  
3. Neuer Knoten (Root-Ebene):

| Feld | Wert |
|------|------|
| `app_config` | (Objekt) |
| → `webBaseUrl` | `https://tresch-versand-default.web.app` |
| → `webVersion` | `81` |
| → `minApkVersion` | `1` |

**Wichtig:** `webBaseUrl` **ohne** Schrägstrich am Ende.

### Variante B – per PowerShell (ein Zeiler)

```powershell
$body = '{"webBaseUrl":"https://tresch-versand-default.web.app","webVersion":81,"minApkVersion":1}'
Invoke-RestMethod -Uri "https://tresch-versand-default-rtdb.firebaseio.com/app_config.json" -Method Put -Body $body -ContentType "application/json"
```

Falls **403 Forbidden**: unter Realtime Database → **Regeln** Lesezugriff für `app_config` erlauben, z. B.:

```json
{
  "rules": {
    "backup": { ".read": true, ".write": true },
    "app_config": { ".read": true, ".write": false }
  }
}
```

(Schreiben nur du in der Console – Handys nur lesen.)

---

## Teil 3: `deploy.config.json` auf dem PC

```json
{
  "androidProject": "C:\\Users\\Trusc\\AndroidStudioProjects\\LogistikApp",
  "assetsPath": "app/src/main/assets",
  "gradleTask": "installDebug",
  "apkPath": "app/build/outputs/apk/debug/app-debug.apk",
  "webBaseUrl": "https://tresch-versand-default.web.app"
}
```

`webBaseUrl` = dieselbe URL wie in `app_config`.

---

## Teil 4: APK einmal an alle (danach selten)

```powershell
powershell -File C:\Users\Trusc\Desktop\assets\scripts\deploy-android.ps1
```

Die Shell lädt dann online von Hosting, offline aus der eingebauten APK.

---

## Alltag: nur Web ändern, keine neue APK

1. HTML/JS/CSS in Cursor ändern  
2. Veröffentlichen:

```powershell
powershell -File C:\Users\Trusc\Desktop\assets\scripts\publish-ota.ps1
```

Das Skript erhöht `webVersion`, deployt Hosting und aktualisiert `app_config` (wenn `webBaseUrl` in `deploy.config.json` steht).

3. Handys: App **komplett schließen** und neu öffnen – oder gelben Banner „Neues Update“ tippen.

---

## Kosten?

| Leistung | Free Tier (typisch) |
|----------|---------------------|
| Hosting Speicher | 10 GB (ihr braucht ~5–15 MB) |
| Hosting Traffic | 10 GB/Monat |
| RTDB `app_config` | ein paar Bytes |

Für ein kleines Team: **praktisch 0 €**. Kosten erst bei sehr viel Traffic.

---

## Probleme

| Symptom | Lösung |
|---------|--------|
| `firebase` unbekannt | `npm install -g firebase-tools` |
| Falsches Projekt | `.firebaserc` prüfen → `tresch-versand-default` |
| App lädt alte Version | Menü → **App-Cache leeren**, oder `webVersion` in `app_config` erhöhen |
| App bleibt offline-APK | `webBaseUrl` leer oder kein Internet → `app_config` prüfen |
| 403 bei `app_config` | Datenbank-Regeln: `.read: true` für `app_config` |

---

## Nur testen, ohne alle umzustellen

`webBaseUrl` in `app_config` **leer lassen** oder Knoten löschen → APK nutzt eingebaute Dateien.  
Hosting kann trotzdem deployt sein (Browser-Test).
