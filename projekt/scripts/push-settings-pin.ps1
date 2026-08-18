# Einstellungen (PIN) direkt in Firebase Cloud schreiben
#
# 2026-08-18: Hier standen zwei echte PINs im Klartext -- als Vorgabewert fuer $LogistikPin
# und als Rueckfall fuer adminPin. Die Datei liegt in Git und wurde damit mit ausgeliefert.
# Beide Werte kommen jetzt beim Aufruf herein: nach $LogistikPin fragt PowerShell, wenn er
# fehlt; $AdminPin ist optional. Es gehoert KEINE echte PIN in diese Datei zurueck.
param(
    [Parameter(Mandatory = $true)]
    [string]$LogistikPin,
    [string]$AdminPin = "",
    [string]$SecretsPath = ""
)

$ErrorActionPreference = "Stop"
$ProjektRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Split-Path -Parent $ProjektRoot
$secretsFile = if ($SecretsPath) { $SecretsPath } else { Join-Path $AppRoot "app-secrets.json" }
$backupUrl = "https://tresch-versand-default-rtdb.firebaseio.com/backup"

if (-not (Test-Path $secretsFile)) { throw "Fehlt: $secretsFile" }
$secrets = Get-Content $secretsFile -Raw | ConvertFrom-Json
$authBody = @{
    email = $secrets.firebaseAuthEmail
    password = $secrets.firebaseAuthPassword
    returnSecureToken = $true
} | ConvertTo-Json
$auth = Invoke-RestMethod -Method Post `
    -Uri ("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + $secrets.firebaseApiKey) `
    -ContentType "application/json" -Body $authBody
$token = $auth.idToken

$settingsUrl = "$backupUrl/settings.json?auth=$token"
$settings = Invoke-RestMethod -Uri $settingsUrl
if (-not $settings) { $settings = @{} }

$oldPin = [string]$settings.logistikPin
$pinVersion = [int]($settings.pinVersion)
if ($pinVersion -lt 1) { $pinVersion = 1 }
if ($LogistikPin -and $LogistikPin -ne $oldPin) { $pinVersion++ }

$settings.logistikPin = $LogistikPin
$settings.pinVersion = $pinVersion
# adminPin nur setzen, wenn er beim Aufruf uebergeben wurde -- nie ein fester Wert von hier.
if (-not $settings.adminPin) {
    if ($AdminPin) { $settings.adminPin = $AdminPin }
    else { Write-Host "HINWEIS: adminPin fehlt in der Cloud und wurde nicht uebergeben (-AdminPin) - bleibt unveraendert." }
}

$body = $settings | ConvertTo-Json -Depth 10 -Compress
Invoke-RestMethod -Method Put -Uri $settingsUrl -ContentType "application/json" -Body $body | Out-Null

Write-Host "OK: logistikPin=$LogistikPin pinVersion=$pinVersion (vorher: $oldPin)"
