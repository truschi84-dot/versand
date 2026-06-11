# Kombi-App: Alles aus Cursor aufs Handy (USB)

Du brauchst **Android Studio nur noch für das erste Android-Projekt** (oder wenn du native Java/Kotlin änderst).  
Tägliche Web-Änderungen + Installation gehen aus **Cursor** mit einem Klick.

## Einmal einrichten

1. **USB-Debugging** am Handy aktivieren, per Kabel verbinden.
2. Datei anlegen: `deploy.config.json` (Kopie von `deploy.config.example.json`)
3. Darin den echten Pfad zu deinem Android-Studio-Projekt eintragen, z. B.:

```json
{
  "androidProject": "C:\\Users\\Trusc\\AndroidStudioProjects\\KombiWebView",
  "assetsPath": "app/src/main/assets",
  "gradleTask": "installDebug",
  "apkPath": "app/build/outputs/apk/debug/app-debug.apk"
}
```

`assetsPath` = Ordner, aus dem deine WebView `index.html` lädt (oft `app/src/main/assets`).

4. In Android Studio einmal **Run** aufs Handy – damit Gradle/SDK stimmen.

## Aus Cursor deployen

**Am einfachsten (Einsteiger):** Doppelklick auf  
`projekt/scripts/Control-Center-Starten.bat`  
→ Browser öffnet Control Center → Tab **„Updates & Deploy“** → Knöpfe für USB und GitHub.

**Terminal → Aufgabe ausführen:**

- **Kombi: Web kopieren + auf Handy installieren (USB)**  
  Kopiert alle Web-Dateien ins Android-Projekt und führt `gradlew installDebug` aus.

- **Kombi: Nur APK installieren (USB)**  
  Wenn du gerade in Android Studio gebaut hast, nur `adb install`.

Oder manuell:

```powershell
powershell -ExecutionPolicy Bypass -File projekt/scripts/deploy-android.ps1
```

## Ablauf (empfohlen)

### Updates **ohne** neue APK an alle (OTA)

1. Einmal Firebase Hosting + `app_config` einrichten → siehe **`OTA_UPDATE.md`**
2. Einmal neue APK-Shell per USB installieren
3. Bei Änderungen: Aufgabe **„Web online veroeffentlichen (OTA)“** oder `projekt/scripts/publish-ota.ps1`
4. Handys: App neu starten oder Update-Banner tippen

### Nur ein Gerät per USB (wie bisher)

1. In Cursor HTML/JS/CSS ändern  
2. Aufgabe **„Web kopieren + installieren“** starten  
3. App auf dem Handy öffnen – fertig  

Android Studio nur noch bei: neuem SDK, Signatur, nativer Bridge (`AndroidApp`), Permissions.

## Probleme

| Problem | Lösung |
|--------|--------|
| `adb nicht gefunden` | Android Studio → SDK Manager → **Android SDK Platform-Tools** |
| `kein Gerät` | USB-Debugging, Kabel, am Handy „Debugging erlauben“ bestätigen |
| `Gradle fehlgeschlagen` | Projekt einmal in Android Studio öffnen und bauen |
| Alte Version auf dem Handy | Skript erneut laufen lassen (`installDebug` überschreibt) |

## Nur Browser (ohne APK)

PC und Handy im gleichen WLAN: `http://<PC-IP>:8080` (Task: Webserver Port 8080).
