# Skill: adb-logs

Liest ADB Logcat vom verbundenen Android-Gerät — zeigt App-Fehler, JavaScript-Exceptions und WebView-Crashes.

## Usage
`/adb-logs` — letzte 200 Zeilen Logcat (Logistik + Rechner App)
`/adb-logs crash` — nur Crashes und Exceptions
`/adb-logs logistik` — nur Logistik-App Logs
`/adb-logs rechner` — nur Rechner/Versand-App Logs
`/adb-logs live` — Live-Stream (5 Sekunden)

## ADB Path
`C:/Users/Trusc/AppData/Local/Android/Sdk/platform-tools/adb.exe`

## Implementation

```bash
ADB="C:/Users/Trusc/AppData/Local/Android/Sdk/platform-tools/adb.exe"

# Alle App-Logs (letzte 200 Zeilen, gefiltert auf relevante Tags)
"$ADB" logcat -d -t 200 | grep -iE "logistik|versand|AndroidRuntime|FATAL|Exception|WebView|JavaScript|chromium" 

# Nur Crashes
"$ADB" logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime|Process.*died"

# WebView JS Errors
"$ADB" logcat -d | grep -iE "JavaScript|chromium|WebView" | tail -50

# Live 5 Sekunden
timeout 5 "$ADB" logcat | grep -iE "logistik|versand|Exception|FATAL|WebView"
```

## Interpretation
- `FATAL EXCEPTION` → App-Crash, Java-Fehler
- `I chromium` → WebView/JavaScript Meldungen  
- `E AndroidRuntime` → kritische Fehler
- `ConsoleMessage` → console.log/error aus dem JS
