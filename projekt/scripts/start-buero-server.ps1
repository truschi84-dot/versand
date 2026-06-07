# Firmen-WLAN: App vom Laptop ausliefern (Handys im gleichen Netz)
$ProjektRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjektRoot
Write-Host "Starte Buero-Server (Port 8080). Fenster offen lassen!"
Write-Host "IP steht gleich unten – in app-update.json als officeWebBaseUrl eintragen."
Write-Host "PC Admin: http://localhost:8080/projekt/pc/control-center.html"
Write-Host ""
node server.js
