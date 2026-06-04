# Web-App online stellen + Versionsnummer fuer OTA (Handys ohne neue APK)
# Voraussetzung: Firebase CLI (npm i -g firebase-tools), einmal: firebase login
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Get-Config {
    $cfgFile = Join-Path $Root "deploy.config.json"
    if (Test-Path $cfgFile) { return Get-Content $cfgFile -Raw | ConvertFrom-Json }
    return $null
}

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

$indexPath = Join-Path $Root "index.html"
$idx = [System.IO.File]::ReadAllText($indexPath, $Utf8NoBom)
$idx = $idx -replace 'style\.css\?v=\d+', "style.css?v=$newVer"
$idx = $idx -replace 'script\.js\?v=\d+', "script.js?v=$newVer"
Write-Utf8NoBom $indexPath $idx
Write-Host "index.html -> style/script ?v=$newVer"

$cfg = Get-Config
$webBase = $null
if ($cfg.webBaseUrl) { $webBase = $cfg.webBaseUrl.TrimEnd('/') }

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Warning "Firebase CLI nicht gefunden. Dateien sind vorbereitet."
    Write-Host "1) npm install -g firebase-tools && firebase login"
    Write-Host "2) firebase init hosting (Ordner: $Root, public: .)"
    Write-Host "3) deploy.config.json -> webBaseUrl eintragen (z.B. https://xxx.web.app)"
    Write-Host "4) Skript erneut ausfuehren ODER: firebase deploy --only hosting"
    Write-Host "5) Firebase RTDB: app_config.json setzen (siehe OTA_UPDATE.md)"
    exit 0
}

Push-Location $Root
try {
    Write-Host "Firebase Hosting deploy ..."
    firebase deploy --only hosting
} finally {
    Pop-Location
}

if ($webBase) {
    $appConfig = @{
        webBaseUrl = $webBase
        webVersion = $newVer
        minApkVersion = 1
    } | ConvertTo-Json -Compress
    $putUrl = "https://tresch-versand-default-rtdb.firebaseio.com/app_config.json"
    Write-Host "RTDB app_config aktualisieren ..."
    try {
        Invoke-RestMethod -Uri $putUrl -Method Put -Body $appConfig -ContentType "application/json"
        Write-Host "OK: $putUrl"
    } catch {
        Write-Warning "RTDB PUT fehlgeschlagen (Regeln?). Manuell setzen:"
        Write-Host $appConfig
    }
} else {
    Write-Warning "deploy.config.json ohne webBaseUrl – RTDB app_config bitte manuell setzen."
}

Write-Host ""
Write-Host "Fertig. Handys holen Update beim naechsten App-Start oder ueber Update-Banner."
