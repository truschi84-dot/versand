# Web-App auf GitHub Pages (truschi84-dot/versand) – ohne Firebase
param(
    [string]$Message = "",
    [switch]$BumpVersion
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Bump-WebVersion {
    $verFile = Join-Path $Root "app-version.json"
    if (-not (Test-Path $verFile)) { throw "Fehlt: app-version.json" }
    $ver = Get-Content $verFile -Raw | ConvertFrom-Json
    $newVer = [int]$ver.webVersion + 1
    $ver.webVersion = $newVer
    $ver.publishedAt = (Get-Date -Format "yyyy-MM-dd HH:mm")
    $ver | ConvertTo-Json | Set-Content $verFile -Encoding UTF8
    Write-Host "app-version.json -> webVersion $newVer"

    $scriptPath = Join-Path $Root "script.js"
    $js = Get-Content $scriptPath -Raw
    $js = $js -replace 'const WEB_BUILD_VERSION = \d+;', "const WEB_BUILD_VERSION = $newVer;"
    Set-Content $scriptPath $js -Encoding UTF8 -NoNewline
    Write-Host "script.js -> WEB_BUILD_VERSION $newVer"

    $updatePath = Join-Path $Root "app-update.json"
    if (Test-Path $updatePath) {
        $upd = Get-Content $updatePath -Raw | ConvertFrom-Json
        $upd.webVersion = $newVer
        $upd | ConvertTo-Json -Depth 5 | Set-Content $updatePath -Encoding UTF8
        Write-Host "app-update.json -> webVersion $newVer"
    }

    $indexPath = Join-Path $Root "index.html"
    $idx = Get-Content $indexPath -Raw
    $idx = $idx -replace 'style\.css\?v=\d+', "style.css?v=$newVer"
    $idx = $idx -replace 'script\.js\?v=\d+', "script.js?v=$newVer"
    Set-Content $indexPath $idx -Encoding UTF8 -NoNewline
    Write-Host "index.html -> ?v=$newVer"
    return $newVer
}

Push-Location $Root
try {
    if ($BumpVersion) {
        $v = Bump-WebVersion
        if (-not $Message) { $Message = "App Update $v" }
    }
    if (-not $Message) { $Message = "App Update $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

    git add .gitignore .nojekyll GITHUB_PAGES.md HYBRID_UPDATE.md OTA_UPDATE.md IPHONE_SETUP.md
    git add TEST_WLAN_UPDATE.md UPDATE_HOSTING_ALTERNATIVEN.md FIREBASE_OTA_EINRICHTUNG.md
    git add ANDROID_APK.md ANDROID_DEPLOY.md WAS-DU-NOCH-TUN-MUSST.md
    git add app-shell.json app-update.json app-version.json app-config.example.json
    git add deploy.config.example.json manifest.webmanifest firebase.json .firebaserc
    git add server.js scripts/
    git add index.html script.js style.css logistik.js rechner.js rechner_scanner.js sw.js
    git add -u

    $status = git status --porcelain
    if (-not $status) {
        Write-Host "Nichts zu committen."
        exit 0
    }

    Write-Host "Commit: $Message"
    git commit -m $Message
    Write-Host "Push origin main ..."
    git push origin main
    Write-Host ""
    Write-Host "Fertig. In 1-2 Min testen:"
    Write-Host "  https://truschi84-dot.github.io/versand/app-update.json"
} finally {
    Pop-Location
}
