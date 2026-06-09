# Web-App: lokal vorbereiten; GitHub nur mit -PushToGitHub (nach Handy-Test)
param(
    [string]$Message = "",
    [switch]$BumpVersion,
    [switch]$PushToGitHub,
    [switch]$LocalOnly
)

$ErrorActionPreference = "Stop"
$ProjektRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Split-Path -Parent $ProjektRoot
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Bump-WebVersion {
    $verFile = Join-Path $AppRoot "app-version.json"
    if (-not (Test-Path $verFile)) { throw "Fehlt: app-version.json" }
    $ver = Get-Content $verFile -Raw | ConvertFrom-Json
    $newVer = [int]$ver.webVersion + 1
    $ver.webVersion = $newVer
    $ver.publishedAt = (Get-Date -Format "yyyy-MM-dd HH:mm")
    Write-Utf8NoBom $verFile (($ver | ConvertTo-Json) + "`n")
    Write-Host "app-version.json -> webVersion $newVer"

    $scriptPath = Join-Path $AppRoot "js\script.js"
    $js = [System.IO.File]::ReadAllText($scriptPath, $Utf8NoBom)
    $js = $js -replace 'const WEB_BUILD_VERSION = \d+;', "const WEB_BUILD_VERSION = $newVer;"
    Write-Utf8NoBom $scriptPath $js
    Write-Host "js/script.js -> WEB_BUILD_VERSION $newVer"

    $updatePath = Join-Path $AppRoot "app-update.json"
    if (Test-Path $updatePath) {
        $upd = Get-Content $updatePath -Raw | ConvertFrom-Json
        $upd.webVersion = $newVer
        Write-Utf8NoBom $updatePath (($upd | ConvertTo-Json -Depth 5) + "`n")
        Write-Host "app-update.json -> webVersion $newVer"
    }

    $indexPath = Join-Path $AppRoot "index.html"
    $idx = [System.IO.File]::ReadAllText($indexPath, $Utf8NoBom)
    $idx = $idx -replace 'css/style\.css\?v=\d+', "css/style.css?v=$newVer"
    $idx = $idx -replace 'js/script\.js\?v=\d+', "js/script.js?v=$newVer"
    $idx = $idx -replace 'lib/html5-qrcode\.min\.js\?v=\d+', "lib/html5-qrcode.min.js?v=$newVer"
    $idx = $idx -replace 'js/rechner_scanner\.js\?v=\d+', "js/rechner_scanner.js?v=$newVer"
    $idx = $idx -replace 'js/cloud_auth\.js\?v=\d+', "js/cloud_auth.js?v=$newVer"
    Write-Utf8NoBom $indexPath $idx
    Write-Host "index.html -> Cache ?v=$newVer"
    return $newVer
}

if ($LocalOnly -and -not $BumpVersion) { $BumpVersion = $false }

Push-Location $AppRoot
try {
    if ($BumpVersion) {
        $v = Bump-WebVersion
        if (-not $Message) { $Message = "App Update $v (lokal)" }
    }
    if (-not $Message) { $Message = "App Update $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

    # Nie Firebase-Secrets auf oeffentliches GitHub - nur Stub (APK/USB: deploy-android.ps1)
    $embedStub = "/** Stub fuer GitHub Pages - echte Zugangsdaten nur lokal/APK. */`nwindow.__FIREBASE_SECRETS__ = null;`n"
    Write-Utf8NoBom (Join-Path $AppRoot "js\cloud_secrets.embed.js") $embedStub

    # PINs fuer GitHub-Test (ohne Firebase-Auth) aus Cloud synchronisieren
    $syncPins = Join-Path $ProjektRoot "scripts\sync-public-pins.js"
    if (Test-Path $syncPins) {
        try {
            & node $syncPins
        } catch {
            Write-Warning "sync-public-pins fehlgeschlagen - app-settings-public.json evtl. veraltet."
        }
    }

    if (-not $PushToGitHub) {
        Write-Host ""
        Write-Host "=== Nur lokal - kein GitHub-Push ==="
        Write-Host "Test: projekt\scripts\restart-buero-server.ps1 -> http://192.168.2.204:8080"
        Write-Host "APK:  projekt\scripts\deploy-android.ps1"
        Write-Host 'Wenn OK: publish-github.ps1 -PushToGitHub -Message "..."'
        exit 0
    }

    git add .gitignore .nojekyll README.md projekt/ js/ css/ lib/ icons/
    git add app-update.json app-version.json app-settings-public.json manifest.webmanifest index.html sw.js js/cloud_secrets.embed.js
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
