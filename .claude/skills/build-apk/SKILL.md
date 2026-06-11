# Skill: build-apk

Builds the Android APK for Logistik or Rechner (Versand) app using Gradle.

## Usage
`/build-apk` — builds Logistik APK (default)
`/build-apk rechner` — builds Rechner/Versand APK
`/build-apk logistik release` — builds release variant

## Steps

1. Determine which project: "logistik" → `LogistikApp`, "rechner"/"versand" → `Versand`
2. Run Gradle assembleDebug (or assembleRelease)
3. Report APK path on success, show errors on failure

## Implementation

```bash
# Logistik Debug APK
cd "C:/Users/Trusc/AndroidStudioProjects/LogistikApp" && ./gradlew assembleDebug 2>&1 | tail -30

# Rechner Debug APK
cd "C:/Users/Trusc/AndroidStudioProjects/Versand" && ./gradlew assembleDebug 2>&1 | tail -30
```

APK output paths:
- Logistik Debug: `LogistikApp/app/build/outputs/apk/debug/app-debug.apk`
- Versand Debug: `Versand/app/build/outputs/apk/versand/debug/app-versand-debug.apk`

On success: show APK path + size. On error: show last 50 lines of Gradle output.
