# WLAN-Update testen (zuhause oder in der Firma)

**Ziel:** Einmal am Laptop starten → **alle** Handys im gleichen WLAN bekommen die neue App – **ohne** USB pro Gerät.

Backup/Cloud bleibt Firebase (wie bisher).

---

## Einmalig: APK mit WLAN-Logik aufs Handy

```powershell
powershell -File C:\Users\Trusc\Desktop\assets\scripts\deploy-android.ps1
```

(Nur nötig, wenn diese Version noch nicht auf dem Handy ist.)

---

## Test zuhause (Laptop + Handy im Heim-WLAN)

### 1. Server starten

Aufgabe: **„Kombi: Büro-WLAN Server (Laptop)“**  
oder:

```powershell
cd C:\Users\Trusc\Desktop\assets
powershell -File scripts\start-buero-server.ps1
```

Fenster **offen lassen**. Es erscheint z. B.:

`WLAN: http://192.168.0.23:8080/index.html`

### 2. Handy

- Gleiches **WLAN** wie der Laptop (nicht nur Mobilfunk).
- Windows-Firewall: bei Abfrage **privates Netz** für Node erlauben.
- App **komplett schließen** und neu öffnen.

### 3. Erste Einrichtung Handy (nur einmal, wenn App noch vom USB-Bundle lädt)

In `app\src\main\assets\app-shell.json` (Android-Projekt) oder nach Kopie in `assets` + neu deployen:

```json
{
  "configUrl": "http://192.168.0.23:8080/app-update.json",
  "officeWebBaseUrl": "http://192.168.0.23:8080",
  "webBaseUrl": "",
  "fallbackBundled": true
}
```

IP = die aus Schritt 1. Dann nochmal `deploy-android.ps1` **nur auf dein Test-Handy**.

**Später in der Firma:** dieselbe IP-Logik, nur Firmen-IP eintragen (oder feste Laptop-IP im Router).

Ohne GitHub reicht für den Test: `configUrl` zeigt auf den Laptop (`app-update.json` wird vom Server mit ausgeliefert).

### 4. Neue Version testen

1. In `app-version.json` z. B. `"webVersion": 82`
2. In `index.html` sichtbare kleine Änderung (z. B. Untertitel)
3. App auf Handy **neu starten** (Server läuft noch)

→ Sollte die Änderung zeigen **ohne** USB.

---

## In der Firma (dein eigentliches Ziel)

| Schritt | Wer |
|---------|-----|
| 1 | Laptop im Firmen-WLAN, `start-buero-server.ps1` |
| 2 | `officeWebBaseUrl` = Firmen-IP des Laptops (in `app-update.json` auf GitHub **oder** einmal in APK `app-shell`) |
| 3 | Alle Mitarbeiter-Handys im **gleichen WLAN** |
| 4 | App neu starten | **Kein** Kabel pro Handy |

**Einmal** APK auf alle (oder GitHub + `configUrl`), danach nur noch Server starten + Version erhöhen.

---

## Handy lädt alte Version?

- Server läuft noch?
- Handy wirklich im WLAN (nicht nur LTE)?
- Menü Rechner → **App-Cache leeren**
- `webVersion` in `app-version.json` erhöht?

---

## Unterwegs (später)

`git push` → GitHub Pages. Dann brauchst du in der Firma den Laptop-Server **nicht** für Updates von unterwegs.
