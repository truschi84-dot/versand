# Skill: apk-full

Kompletter APK-Zyklus: Assets sync → Gradle Build → ADB Install — ein Befehl für alles.

## Usage
`/apk-full` — Logistik: sync + build + install
`/apk-full rechner` — Rechner: sync + build + install
`/apk-full --no-install` — nur sync + build (kein Handy nötig)

## Ablauf

1. **Assets sync** — Web-Dateien nach Android assets/ kopieren
2. **Gradle Build** — APK bauen (`assembleDebug`)
3. **ADB Check** — Gerät verbunden?
4. **ADB Install** — APK auf Handy installieren
5. **Bestätigung** — App-Version auf Gerät prüfen

## Implementation

Schritt 1 ist **`/sync-assets control`** — die Kopierliste steht dort und nur dort.
Die Tablet-APK (`LogistikApp`) enthält das **Control Center** aus `control\`, nicht
einen Ordner `logistik\` (den gibt es im Repo nicht). Gleiche Liste wie
`copyLogistikWebAssets()` in `server.js`.

```bash
ADB="D:/Robert/Tresch-Firma/Android-SDK/platform-tools/adb.exe"

# 1. Sync: /sync-assets control (PowerShell-Block aus jenem Skill ausführen)

# 2. Build
cd "D:/Robert/Tresch-Firma/AndroidStudioProjects/LogistikApp"
./gradlew assembleDebug

# 3. Install
"$ADB" install -r "app/build/outputs/apk/debug/app-debug.apk"

# 4. Bestätigung
"$ADB" shell pm list packages | grep logistik
```

## Fehlerbehandlung
- Gradle Fehler → zeige letzte 50 Build-Zeilen
- Kein Gerät → Hinweis: USB-Kabel + USB-Debugging einschalten
- Install fehlgeschlagen → zeige ADB Fehlercode
