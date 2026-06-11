# Handy updaten – ohne Cursor / ohne AI

Diese Anleitung ist für **Einsteiger**. Du brauchst **keinen** Cursor-Chat und **kein** Internet auf dem Handy.

---

## Was passiert beim Update?

1. Dein PC kopiert die Web-App-Dateien (`index.html`, `js/`, `css/` …) ins Android-Projekt
2. Der PC baut daraus eine APK und installiert sie **per USB** aufs Handy
3. **Kein Cursor-Limit** wird verbraucht (du klickst nur selbst)

---

## Einmal einrichten (nur 1×)

### A) Android-Projekt-Pfad

1. Im Ordner `projekt` liegt `deploy.config.example.json`
2. Kopiere sie zu **`projekt/deploy.config.json`**
3. Trage deinen echten Pfad ein, z. B.:

```json
{
  "androidProject": "C:\\Users\\Trusc\\AndroidStudioProjects\\LogistikApp",
  "assetsPath": "app/src/main/assets",
  "gradleTask": "installDebug",
  "apkPath": "app/build/outputs/apk/debug/app-debug.apk"
}
```

### B) Handy: USB-Debugging

1. Einstellungen → Über das Telefon → **7× auf Build-Nummer** tippen
2. Einstellungen → **Entwickleroptionen** → **USB-Debugging** einschalten
3. Handy per **USB-Kabel** an den PC

---

## Methode 1 – Am einfachsten (Doppelklick)

1. Handy per USB verbinden, Debugging erlauben
2. Doppelklick auf:

   **`projekt/scripts/Handy-Update.bat`**

3. Warten bis „Fertig!“ – App auf dem Handy öffnen

**Nur APK** (wenn du in Android Studio schon gebaut hast):

**`projekt/scripts/Handy-Update-nur-APK.bat`**

---

## Methode 2 – Control Center (mit Anzeige)

1. Doppelklick **`projekt/scripts/start-buero-server.ps1`** (Fenster offen lassen!)
2. Im Browser öffnen:  
   **http://localhost:8080/projekt/pc/control-center.html**
3. Links: **📱 Handy Update (USB)**
4. Status prüfen (Handy erkannt? config OK?)
5. **„Web kopieren + installieren“** klicken
6. Im Protokoll unten den Fortschritt lesen

---

## Methode 3 – Cursor Aufgabe (ohne AI-Chat)

1. Handy per USB
2. In Cursor: **Terminal → Aufgaben ausführen**
3. Wählen: **„Kombi: Web kopieren + auf Handy installieren (USB)“**

Das ist dasselbe wie die `.bat`-Datei – **0 AI-Anfragen**.

---

## Wann was?

| Situation | Was tun |
|-----------|---------|
| HTML/JS/CSS geändert (Buttons, Scanner, …) | **Handy-Update.bat** oder Control Center |
| Nur Kotlin/Android geändert | Erst Android Studio bauen, dann **nur APK** |
| Kein PC/USB, Handy unterwegs | OTA/GitHub (kostet Handy-Daten) |
| Control Center / Stammdaten | Speichern in Cloud wie bisher – **kein** APK nötig |

---

## Häufige Fehler

| Meldung | Lösung |
|---------|--------|
| `adb nicht gefunden` | Android Studio → SDK Manager → **Platform-Tools** installieren |
| `Kein Gerät` | USB-Kabel, Debugging an, „Debugging erlauben“ am Handy |
| `deploy.config.json fehlt` | Schritt „Einmal einrichten“ oben |
| Gradle-Fehler | Android Studio einmal öffnen und Projekt bauen |

---

## Cursor-Limit schonen

- Updates **selbst** per `.bat` oder Control Center
- AI nur für **neue Features** oder wenn etwas kaputt ist
- Viele kleine Chats verbrauchen mehr als ein gebündelter Auftrag
