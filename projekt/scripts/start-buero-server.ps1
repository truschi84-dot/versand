# Firmen-WLAN: App vom Laptop ausliefern (Handys im gleichen Netz)
$ProjektRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjektRoot
Write-Host "=== Tresch Control Center ==="
Write-Host "Am einfachsten: Doppelklick Control-Center-Starten.bat"
Write-Host "  (startet Server + oeffnet Browser automatisch)"
Write-Host ""
Write-Host "Manuell: http://localhost:8080/projekt/pc/control-center.html"
Write-Host ""
node server.js
