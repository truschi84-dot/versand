# iPhone (Apple) – kostenlos, ohne App Store

Die **APK gibt es nur für Android**. Auf dem iPhone nutzt ihr **dieselbe Web-App** in **Safari** – als Icon auf dem Home-Bildschirm (PWA). **0 €**, kein Apple-Developer-Konto nötig.

**Backup/Cloud** bleibt **Firebase** – wie auf Android.

---

## Einmal pro iPhone (Kollegen)

1. Link öffnen in **Safari** (nicht nur Chrome), z. B.:
   - **GitHub Pages:** `https://DEIN-USER.github.io/DEIN-REPO/index.html` (empfohlen, HTTPS)
   - oder in der Firma im WLAN: `http://LAPTOP-IP:8080/index.html`

2. Unten **Teilen** (Viereck mit Pfeil) → **„Zum Home-Bildschirm“** / **„Zum Bildschirm“**.

3. Name **„Kombi App“** → **Hinzufügen**.

4. App wie gewohnt über das **Icon** starten (nicht Lesezeichen).

5. **PIN / Cloud** funktionieren wie auf Android (Internet für Firebase nötig).

---

## Updates

| Wo du bist | Was du tust | iPhones |
|------------|-------------|---------|
| **Firma + WLAN** | `start-buero-server.ps1` | Kollegen: Icon öffnen (lädt vom Laptop, wenn `app-update.json` / GitHub-Config passt) |
| **Unterwegs** | `git push` → GitHub | Kollegen: App schließen → Icon neu öffnen |

Android: APK/WLAN. iPhone: **keine APK** – nur Web-Update über dieselbe URL.

---

## Was auf dem iPhone anders ist

| Funktion | Android APK | iPhone (Safari/PWA) |
|----------|-------------|---------------------|
| Logistik, Rechner, Cloud | ✅ | ✅ |
| PIN, Firebase Backup | ✅ | ✅ |
| Barcode-Scanner | ✅ | ✅ (Kamera-Freigabe in Safari) |
| Druck (Systemdialog) | ✅ | ✅ (AirPrint / „Drucken“) |
| **ZPL-Etikettendrucker** (Netzwerk) | ✅ nativ | ⚠️ oft **nicht** (nur über Android-Bridge) |
| Spracheingabe Gewicht | ✅ nativ | ✅ meist über **Safari-Spracheingabe** |

Für reine Logistik/Rechner/Cloud reicht das iPhone völlig.

---

## HTTPS für iPhone (empfohlen)

Apple mag **HTTPS** für „Zum Home-Bildschirm“ und Kamera.

**Kostenlos:** GitHub Pages (siehe `HYBRID_UPDATE.md` / `FIREBASE_OTA_EINRICHTUNG.md`).

Nur `http://192.168…` im Büro geht oft auch, ist aber weniger zuverlässig als HTTPS über GitHub.

---

## Kurz-Anleitung für Kollegen (zum Weiterleiten)

> 1. Link in **Safari** öffnen.  
> 2. **Teilen** → **Zum Home-Bildschirm**.  
> 3. Fertig – App steht wie eine normale App.  
> 4. Bei „Neues Update“-Fenster: **Jetzt installieren** tippen.

---

## Was du **nicht** brauchst (und Geld kostet)

- ❌ Apple Developer Program (99 €/Jahr) – nur für echten App-Store oder native iOS-App
- ❌ Zweites Firebase-Abo – Backup bleibt dasselbe Konto

---

## Android + iPhone zusammen

| Gerät | Installation |
|-------|----------------|
| Android | APK einmal (USB) |
| iPhone | Link + „Zum Home-Bildschirm“ |

Beide können **dieselbe** GitHub-URL oder **dasselbe** Firmen-WLAN nutzen.
