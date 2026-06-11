# Port 8080 freigeben und Büro-Server neu starten
$conns = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Beendet Prozess auf Port 8080 (PID $($c.OwningProcess))"
}
Start-Sleep -Seconds 1
$ProjektRoot = Split-Path -Parent $PSScriptRoot
Push-Location $ProjektRoot
node server.js
