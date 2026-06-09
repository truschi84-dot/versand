# App-Gesundheitscheck - alle automatischen Pruefungen nach einem Update
$ProjektRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjektRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js fehlt - bitte installieren (wie fuer Control Center)."
    exit 1
}
& node (Join-Path $ProjektRoot "scripts\app-gesundheitscheck.js") --html
exit $LASTEXITCODE
