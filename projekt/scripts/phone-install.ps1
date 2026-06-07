# Nur APK installieren (ohne Dateien zu kopieren) – wenn Build schon in Android Studio lief
param(
    [string]$ApkPath = "",
    [string]$ProjectPath = ""
)

$ErrorActionPreference = "Stop"
$ProjektRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Split-Path -Parent $ProjektRoot

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if ($env:ANDROID_HOME) {
    $p = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
    if (Test-Path $p) { $adb = $p }
}
if (-not (Test-Path $adb)) { throw "adb nicht gefunden." }

if (-not $ApkPath) {
    $cfgFile = Join-Path $ProjektRoot "deploy.config.json"
    if (Test-Path $cfgFile) {
        $cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json
        $ProjectPath = $cfg.androidProject
        $ApkPath = Join-Path $ProjectPath ($cfg.apkPath -replace "/", "\")
    }
}
if (-not $ApkPath -or -not (Test-Path $ApkPath)) {
    throw "APK-Pfad angeben oder deploy.config.json mit apkPath pflegen."
}

Write-Host "Geräte:"
& $adb devices
Write-Host "Installiere: $ApkPath"
& $adb install -r $ApkPath
if ($LASTEXITCODE -ne 0) { throw "Installation fehlgeschlagen" }
Write-Host "OK – App auf dem Handy installiert."
