# App-Updates ohne Firebase (Backup bleibt getrennt)

## Zwei getrennte Systeme

| System | Aufgabe | Wo |
|--------|---------|-----|
| **Update-Server** | HTML, JS, CSS + `app-update.json` | Beliebig (siehe unten) |
| **Backup/Cloud** | Lieferungen, Stammdaten | Firebase `/backup` (unverändert) |

Die APK lädt **Code** vom Update-Server.  
`backupToCloud()` / `loadAllFromCloud()` nutzen weiter nur `APP_CONFIG.CLOUD_URL` → Firebase.

Kein gemeinsames Kontingent, kein Risiko für dein Backup-JSON durch Updates.

---

## Wie es technisch funktioniert

```text
[Update-Server]                    [Firebase RTDB]
  index.html                         /backup  ← eure Daten
  script.js, style.css …             (nur Cloud-Sync)
  app-update.json  ← winzig
       ↑
   APK/WebView lädt beim Start die URL aus app-update.json:
   { "webBaseUrl": "https://…", "webVersion": 82 }
```

1. Du legst Dateien auf **irgendeinen HTTPS-Server**.
2. `app-update.json` enthält URL + Versionsnummer (ein paar Byte).
3. APK liest das (einmal pro Start) → lädt `webBaseUrl/index.html`.
4. Backup läuft **parallel** nur über Firebase.

---

## Alternativen zu Firebase Hosting

| Anbieter | Kosten | Schwierigkeit | Gut für |
|----------|--------|---------------|---------|
| **GitHub Pages** | 0 € | mittel | Kleine Teams, öffentliches Repo oder privat |
| **Cloudflare Pages** | 0 € | mittel | Schnell, viel Traffic im Free Tier |
| **Netlify** | 0 € (Limit) | einfach | Drag & Drop oder Git |
| **Vercel** | 0 € (Limit) | einfach | wie Netlify |
| **Eigener PC / NAS** | 0 € | einfach | Nur Büro-WLAN (`server.js`) |
| **Firmen-Webspace** (IONOS, Strato, …) | oft schon da | einfach | FTP Upload von `assets` |
| **Firebase Hosting** | 0 € (Limit) | einfach | wenn du alles bei Google lassen willst |

**CDN** (Excel, QR-Code) bleibt wie jetzt bei jsdelivr/unpkg – nicht beim Update-Host.

---

## Empfehlung: komplett ohne Firebase für Updates

### Variante A – GitHub Pages (0 €, getrennt vom Backup)

1. Repo auf GitHub (privat möglich).
2. Ordner `assets` als Pages-Quelle oder Unterordner `docs/`.
3. Dateien hochladen inkl. `app-update.json`:

```json
{
  "webBaseUrl": "https://DEIN-USER.github.io/DEIN-REPO",
  "webVersion": 81
}
```

4. In der APK einmal `app-shell.json` anpassen:

```json
{
  "configUrl": "https://DEIN-USER.github.io/DEIN-REPO/app-update.json",
  "webBaseUrl": "",
  "fallbackBundled": true
}
```

5. `deploy-android.ps1` einmal → fertig.

**Backup:** bleibt `https://tresch-versand-default-rtdb.firebaseio.com/backup` – **keine Änderung**.

### Variante B – Nur Büro (0 €, kein Internet-Host)

```powershell
node server.js
```

`app-update.json` auf dem PC oder in `app-shell.json`:

```json
"configUrl": "http://192.168.1.XX:8080/app-update.json"
```

Handys im WLAN laden Updates; unterwegs → APK-Fallback.

### Variante C – Firmen-Webspace (FTP)

Alle `.html`, `.js`, `.css`, `app-version.json`, `app-update.json` per FTP in einen Unterordner, z. B.  
`https://www.tresch.de/app/`

`app-update.json`:

```json
{
  "webBaseUrl": "https://www.tresch.de/app",
  "webVersion": 81
}
```

---

## Nach jeder Änderung am Code

1. `webVersion` in `app-update.json` erhöhen (und `app-version.json`).
2. Dateien auf **deinen** Update-Server kopieren (FTP / Git push / `firebase deploy` – egal).
3. Handys: App neu starten.

Skript nur für Firebase: `publish-ota.ps1`.  
Für GitHub/FTP: manuell oder eigenes kleines Kopier-Skript.

---

## Was du in Firebase **nicht** brauchst

- ❌ Firebase Hosting (optional)
- ❌ `app_config` in der Realtime Database (optional)

Du brauchst Firebase **nur noch** für `/backup` (und Reklamationen-Pfad), wie bisher.

---

## Im Code (Stand jetzt)

- Läuft die App schon von **HTTPS** (z. B. GitHub Pages), prüft sie Updates über  
  `https://gleiche-domain/app-update.json` (nicht Firebase).
- Läuft sie aus der **APK** (`file://`), nutzt sie `configUrl` aus `app-shell.json`  
  (kann auf **beliebige** JSON-URL zeigen – nicht nur Firebase).

`app-update.json` im Projektroot mit hochladen, wenn du einen externen Host nutzt.
