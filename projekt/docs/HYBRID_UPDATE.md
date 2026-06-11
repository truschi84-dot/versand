# Updates: Büro-WLAN + GitHub (Backup bleibt Firebase)

## Dein Plan – so passt es

| Situation | Update von | Stammdaten/Backup |
|-----------|------------|-------------------|
| **In der Firma**, Laptop im WLAN | Laptop (`server.js`) | Firebase (wie jetzt) |
| **Unterwegs / Urlaub**, Laptop dabei | **GitHub Pages** (`git push`) | Firebase (wie jetzt) |

Zwei getrennte Wege für **App-Code**. Cloud-Daten **nur** Firebase – nichts davon berührt.

---

## Ablauf in der Firma (WLAN)

1. Am Laptop im Ordner `assets`:

```powershell
powershell -File scripts\start-buero-server.ps1
```

2. In der Konsole erscheint z. B.  
   `WLAN: http://192.168.1.42:8080/index.html`

3. In **`app-update.json`** (und auf GitHub dieselbe Datei):

```json
{
  "webBaseUrl": "https://DEIN-USER.github.io/DEIN-REPO",
  "officeWebBaseUrl": "http://192.168.1.42:8080",
  "preferOfficeLan": true,
  "webVersion": 82
}
```

4. Handys im **gleichen WLAN** → App starten → laden vom Laptop (schnell, kein Internet nötig für den Code).

5. Nach Code-Änderung: `webVersion` in **`app-version.json`** auf dem Laptop erhöhen, App auf dem Handy neu starten.

**Windows-Firewall:** beim ersten Mal „Zugriff erlauben“ für Node.js im privaten Netz.

---

## Ablauf unterwegs (GitHub)

1. Code in Cursor ändern (am Laptop, überall mit Internet).

2. Hochladen:

```powershell
cd C:\Users\Trusc\Desktop\assets
git add .
git commit -m "App Update 82"
git push
```

3. GitHub Pages baut automatisch (1–2 Min.).

4. In **`app-update.json`** (im Repo):

```json
"webBaseUrl": "https://DEIN-USER.github.io/DEIN-REPO",
"webVersion": 82
```

5. Handys mit Internet → App neu starten → laden von GitHub.

Im Urlaub ist **`officeWebBaseUrl`** nicht erreichbar → App nutzt automatisch **`webBaseUrl`** (GitHub).

---

## GitHub einmal einrichten

1. Repo **versand** (bereits vorhanden): https://github.com/truschi84-dot/versand

2. Push mit `powershell -File scripts\publish-github.ps1` (siehe **GITHUB_PAGES.md**).

3. Repo → **Settings** → **Pages** → Source: Branch **main**, Ordner **/ (root)**.

4. URL: `https://truschi84-dot.github.io/versand`

5. **`app-shell.json`** in der APK (einmal deployen):

```json
{
  "configUrl": "https://truschi84-dot.github.io/versand/app-update.json",
  "webBaseUrl": "https://truschi84-dot.github.io/versand",
  "officeWebBaseUrl": "http://192.168.2.204:8080",
  "preferOfficeLan": true,
  "fallbackBundled": true
}
```

6. `powershell -File scripts\deploy-android.ps1` → einmal an alle Handys.

---

## Was die APK automatisch macht

1. Liest **`app-update.json`** von `configUrl` (deine GitHub-URL).
2. Wenn **`officeWebBaseUrl`** erreichbar (Laptop-Server läuft, gleiches WLAN) → App vom **Laptop**.
3. Sonst → App von **`webBaseUrl`** (GitHub).
4. Sonst → eingebaute APK-Dateien (offline).

Backup/Cloud: unverändert über Firebase in der App.

---

## IP des Laptops ändert sich?

- In der Firma: einmal pro Woche `officeWebBaseUrl` in `app-update.json` anpassen und **`git push`** (dauert 1 Min.), **oder**
- Feste IP für den Laptop im Router reservieren (empfohlen).

---

## Kurz-Checkliste

| | Firma | Urlaub |
|--|-------|--------|
| Laptop | `start-buero-server.ps1` | `git push` |
| Handys | WLAN + App neu starten | Internet + App neu starten |
| Firebase | nur Backup/Sync | nur Backup/Sync |
| Kosten | 0 € | 0 € (GitHub Pages Free) |
