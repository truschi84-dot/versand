# Web-App: lokal vorbereiten; GitHub nur mit -PushToGitHub (nach Handy-Test)
param(
    [string]$Message = "",
    [switch]$BumpVersion,
    [switch]$PushToGitHub,
    [switch]$LocalOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Bump-WebVersion {
    $verFile = Join-Path $Root "app-version.json"
    if (-not (Test-Path $verFile)) { throw "Fehlt: app-version.json" }
    $ver = Get-Content $verFile -Raw | ConvertFrom-Json
    $newVer = [int]$ver.webVersion + 1
    $ver.webVersion = $newVer
    $ver.publishedAt = (Get-Date -Format "yyyy-MM-dd HH:mm")
    Write-Utf8NoBom $verFile (($ver | ConvertTo-Json) + "`n")
    Write-Host "app-version.json -> webVersion $newVer"

    $scriptPath = Join-Path $Root "script.js"
    $js = [System.IO.File]::ReadAllText($scriptPath, $Utf8NoBom)
    $js = $js -replace 'const WEB_BUILD_VERSION = \d+;', "const WEB_BUILD_VERSION = $newVer;"
    Write-Utf8NoBom $scriptPath $js
    Write-Host "script.js -> WEB_BUILD_VERSION $newVer"

    $updatePath = Join-Path $Root "app-update.json"
    if (Test-Path $updatePath) {
        $upd = Get-Content $updatePath -Raw | ConvertFrom-Json
        $upd.webVersion = $newVer
        Write-Utf8NoBom $updatePath (($upd | ConvertTo-Json -Depth 5) + "`n")
        Write-Host "app-update.json -> webVersion $newVer"
    }

    $indexPath = Join-Path $Root "index.html"
    $idx = [System.IO.File]::ReadAllText($indexPath, $Utf8NoBom)
    $idx = $idx -replace 'style\.css\?v=\d+', "style.css?v=$newVer"
    $idx = $idx -replace 'script\.js\?v=\d+', "script.js?v=$newVer"
    $idx = $idx -replace 'html5-qrcode\.min\.js\?v=\d+', "html5-qrcode.min.js?v=$newVer"
    $idx = $idx -replace 'rechner_scanner\.js\?v=\d+', "rechner_scanner.js?v=$newVer"
    Write-Utf8NoBom $indexPath $idx
    Write-Host "index.html -> Cache ?v=$newVer"
    return $newVer
}

if ($LocalOnly -and -not $BumpVersion) { $BumpVersion = $false }

Push-Location $Root
try {
    if ($BumpVersion) {
        $v = Bump-WebVersion
        if (-not $Message) { $Message = "App Update $v (lokal)" }
    }
    if (-not $Message) { $Message = "App Update $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

    if (-not $PushToGitHub) {
        Write-Host ""
        Write-Host "=== Nur lokal - kein GitHub-Push ==="
        Write-Host "Test: scripts\restart-buero-server.ps1 -> http://192.168.2.204:8080"
        Write-Host "APK:  scripts\deploy-android.ps1"
        Write-Host 'Wenn OK: publish-github.ps1 -PushToGitHub -Message "..."'
        exit 0
    }

    git add .gitignore .nojekyll GITHUB_PAGES.md HYBRID_UPDATE.md OTA_UPDATE.md IPHONE_SETUP.md IPHONE_KOLLEGEN.md
    git add TEST_WLAN_UPDATE.md UPDATE_HOSTING_ALTERNATIVEN.md FIREBASE_OTA_EINRICHTUNG.md
    git add ANDROID_APK.md ANDROID_DEPLOY.md WAS-DU-NOCH-TUN-MUSST.md
    git add app-shell.json app-update.json app-version.json app-config.example.json
    git add deploy.config.example.json manifest.webmanifest firebase.json .firebaserc
    git add server.js scripts/
    git add html5-qrcode.min.js icons/
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
    Write-Host "Live in 1-2 Min: https://truschi84-dot.github.io/versand/app-update.json"
} finally {
    Pop-Location
}
