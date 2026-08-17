# Skill: adb-install

Installs an APK on a connected Android device via ADB.

## Usage
`/adb-install` — installs Logistik APK (builds first if needed)
`/adb-install rechner` — installs Rechner/Versand APK
`/adb-install --no-build` — install without rebuilding

## ADB Path
`D:/Robert/Tresch-Firma/Android-SDK/platform-tools/adb.exe`

## Steps

1. Check ADB devices: `adb devices` — if none, tell user to connect phone + enable USB debugging
2. If build needed: run `/build-apk` first
3. Install APK: `adb install -r <apk-path>`
4. Confirm installation success

## Implementation

```bash
ADB="D:/Robert/Tresch-Firma/Android-SDK/platform-tools/adb.exe"

# Check connected devices
"$ADB" devices

# Install Logistik
"$ADB" install -r "D:/Robert/Tresch-Firma/AndroidStudioProjects/LogistikApp/app/build/outputs/apk/debug/app-debug.apk"

# Install Rechner
"$ADB" install -r "D:/Robert/Tresch-Firma/AndroidStudioProjects/Versand/app/build/outputs/apk/debug/app-debug.apk"
```

If device offline: ask user to check USB cable and enable "USB-Debugging" in Developer Options.
