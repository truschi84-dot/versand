# Skill: sync-assets

Synchronisiert Web-Dateien aus Tresch-Apps nach Android assets/ — für USB-APK-Deploy.

## Usage
`/sync-assets` — synct beide Apps (Logistik + Rechner)
`/sync-assets logistik` — nur Logistik-App
`/sync-assets rechner` — nur Rechner/Versand-App

## Source → Destination

**Logistik:**
- Source: `C:/Users/Trusc/Desktop/Tresch-Apps/logistik/`
- Dest: `C:/Users/Trusc/AndroidStudioProjects/LogistikApp/app/src/main/assets/`
- Dateien: `index.html`, `manifest.webmanifest`, `js/*.js`, `icons/`

**Rechner (Versand):**
- Source: `C:/Users/Trusc/Desktop/Tresch-Apps/` (root)
- Dest: `C:/Users/Trusc/AndroidStudioProjects/Versand/app/src/main/assets/`
- Dateien: `index.html`, `js/`, `css/`, `icons/`

## Implementation

```bash
LOGISTIK_SRC="C:/Users/Trusc/Desktop/Tresch-Apps/logistik"
LOGISTIK_DST="C:/Users/Trusc/AndroidStudioProjects/LogistikApp/app/src/main/assets"
cp "$LOGISTIK_SRC/index.html" "$LOGISTIK_DST/"
cp "$LOGISTIK_SRC/manifest.webmanifest" "$LOGISTIK_DST/"
cp -r "$LOGISTIK_SRC/js/" "$LOGISTIK_DST/"
echo "Logistik Assets synchronisiert"
```

Nach sync: APK neu bauen mit `/build-apk logistik`.
Nur bei explizitem Deploy-Auftrag ausführen.
