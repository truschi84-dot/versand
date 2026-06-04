# GitHub Pages – Kombi-App (`versand`)

## Deine URLs (fest)

| Zweck | URL |
|--------|-----|
| App im Browser | https://truschi84-dot.github.io/versand/index.html |
| OTA-Konfiguration | https://truschi84-dot.github.io/versand/app-update.json |
| `configUrl` in der APK | dieselbe `app-update.json`-URL |

Repo: https://github.com/truschi84-dot/versand

---

## Update online stellen (unterwegs / ohne Büro-Server)

```powershell
cd C:\Users\Trusc\Desktop\assets
powershell -File scripts\publish-github.ps1 -Message "App Update 90"
```

Optional Version erhöhen (script.js + index.html + app-version.json):

```powershell
powershell -File scripts\publish-github.ps1 -BumpVersion -Message "App Update 90"
```

Nach `git push` wartest du **1–2 Minuten**, dann lädt die App von GitHub (wenn kein Büro-WLAN erreichbar ist).

---

## Büro-WLAN (schneller, wie bisher)

```powershell
powershell -File scripts\start-buero-server.ps1
```

`app-update.json` enthält `officeWebBaseUrl` → Handys im gleichen WLAN bevorzugen den Laptop.

---

## APK einmal anpassen (wichtig)

`app-shell.json` muss **`configUrl`** auf GitHub zeigen (nicht nur die Laptop-IP), damit Handys unterwegs die aktuelle `app-update.json` lesen:

```powershell
powershell -File scripts\deploy-android.ps1
```

Ohne neue APK funktionieren Updates unterwegs nur, wenn die App schon von GitHub oder dem Laptop lädt – nicht aus alter eingebauter `configUrl`.

---

## Pages-Einstellung (falls die Seite 404 ist)

GitHub → Repo **versand** → **Settings** → **Pages** → Source: Branch **main**, Folder **/ (root)**.
