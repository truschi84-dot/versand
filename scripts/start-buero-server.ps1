# Firmen-WLAN: App vom Laptop ausliefern (Handys im gleichen Netz)
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
Write-Host "Starte Buero-Server (Port 8080). Fenster offen lassen!"
Write-Host "IP steht gleich unten – in app-update.json als officeWebBaseUrl eintragen."
Write-Host ""
node server.js
