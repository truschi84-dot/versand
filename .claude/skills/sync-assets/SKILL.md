# Skill: sync-assets

Synchronisiert Web-Dateien aus Tresch-Apps nach Android assets/ — für USB-APK-Deploy.

## Usage
`/sync-assets` — synct beide Apps (Control + Rechner)
`/sync-assets control` — nur Control-App (Tablet)
`/sync-assets rechner` — nur Rechner/Versand-App

## Source → Destination

**Control (Tablet):**
- Source: `C:\Users\Trusc\Desktop\Tresch-Apps\control\`
- Dest: `C:\Users\Trusc\AndroidStudioProjects\LogistikApp\app\src\main\assets\`
- `control\index.html` → `assets\index.html` (mit Pfad-Patch: `../js/` → `js/`)
- `control\js\*.js` → `assets\js\*.js`
- Root `js\druck_utils.js` → `assets\js\druck_utils.js`
- Root `js\supabase_sync.js` → `assets\js\supabase_sync.js`
- Root `js\cloud_auth.js` → `assets\js\cloud_auth.js`
- Root `js\gemeinsam\` → `assets\js\gemeinsam\`

**Rechner (Versand):**
- Source: `C:\Users\Trusc\Desktop\Tresch-Apps\` (root)
- Dest: `C:\Users\Trusc\AndroidStudioProjects\Versand\app\src\main\assets\`
- `index.html`, `js\`, `css\`, `icons\`

## Implementation — Control

Führe diese PowerShell-Befehle aus (NICHT als Bash):

```powershell
$SRC  = "C:\Users\Trusc\Desktop\Tresch-Apps"
$DST  = "C:\Users\Trusc\AndroidStudioProjects\LogistikApp\app\src\main\assets"

# 1. assets\js\ anlegen
New-Item -ItemType Directory -Force "$DST\js" | Out-Null
New-Item -ItemType Directory -Force "$DST\js\gemeinsam" | Out-Null

# 2. index.html kopieren + Pfad-Patch: ../js/ → js/
(Get-Content "$SRC\control\index.html" -Encoding UTF8) `
    -replace '\.\./js/', 'js/' |
    Set-Content "$DST\index.html" -Encoding UTF8

# 3. Control-eigene JS-Dateien
Copy-Item "$SRC\control\js\*.js" "$DST\js\" -Force

# 4. Shared JS aus Root
Copy-Item "$SRC\js\druck_utils.js"    "$DST\js\" -Force
Copy-Item "$SRC\js\supabase_sync.js"  "$DST\js\" -Force
Copy-Item "$SRC\js\cloud_auth.js"     "$DST\js\" -Force
Copy-Item "$SRC\js\gemeinsam\*.js"    "$DST\js\gemeinsam\" -Force

Write-Host "Control Assets synchronisiert"
```

## Implementation — Rechner

```powershell
$SRC = "C:\Users\Trusc\Desktop\Tresch-Apps"
$DST = "C:\Users\Trusc\AndroidStudioProjects\Versand\app\src\main\assets"

Copy-Item "$SRC\index.html" "$DST\" -Force
Copy-Item "$SRC\js\"    "$DST\js\"    -Recurse -Force
Copy-Item "$SRC\css\"   "$DST\css\"   -Recurse -Force
Copy-Item "$SRC\icons\" "$DST\icons\" -Recurse -Force

Write-Host "Rechner Assets synchronisiert"
```

## Danach
APK bauen: `/build-apk logistik` (für Control) oder `/build-apk rechner`
Nur bei explizitem Deploy-Auftrag ausführen.
