# GitHub Pages – Kombi-App (`versand`)

## Deine URLs (fest)

| Zweck | URL |
|--------|-----|
| App im Browser | https://truschi84-dot.github.io/versand/index.html |
| OTA-Konfiguration | https://truschi84-dot.github.io/versand/app-update.json |
| `configUrl` in der APK | dieselbe `app-update.json`-URL |

Repo: https://github.com/truschi84-dot/versand

---

## Wichtig: erst testen, dann GitHub

**Nicht** sofort pushen – sonst haben alle Handys/iPhones die halbfertige Version.

```powershell
# 1) Lokal + WLAN testen (kein Push)
powershell -File scripts\restart-buero-server.ps1
# Handy: http://192.168.2.204:8080 oder Menü „App-Update prüfen“ (nur wenn app-update.json schon höher ist)

# 2) APK mit aktuellem Stand (optional, für Scanner offline in der APK)
powershell -File scripts\deploy-android.ps1

# 3) Erst wenn alles auf DEINEM Handy OK:
powershell -File scripts\publish-github.ps1 -PushToGitHub -Message "App Update 93"
```

Version nur lokal erhöhen (ohne GitHub):

```powershell
powershell -File scripts\publish-github.ps1 -BumpVersion
```

Nach `git push` wartest du **1–2 Minuten**. Kollegen: Menü **„App-Update prüfen“** – **kein** Abruf beim Neustart, nur auf Knopf.

**APK:** Startet aus eingebauter Version; GitHub/Büro-Laptop nur nach **App-Update prüfen** → **Jetzt installieren**. Gelegentlich `deploy-android.ps1`, damit die eingebaute Version nicht zu alt wird.

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
