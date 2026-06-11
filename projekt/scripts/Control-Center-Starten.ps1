# Control Center: Server starten ODER Browser oeffnen wenn schon laeuft
$ErrorActionPreference = 'Continue'
$ProjektRoot = Split-Path -Parent $PSScriptRoot
$StatusUrl = 'http://127.0.0.1:8080/api/deploy/status'
$CcUrl = 'http://127.0.0.1:8080/projekt/pc/control-center.html#updates'

function Test-DeployServer {
    try {
        $r = Invoke-WebRequest -Uri $StatusUrl -UseBasicParsing -TimeoutSec 3
        $j = $r.Content | ConvertFrom-Json
        return ($null -ne $j.ok)
    } catch {
        return $false
    }
}

function Stop-Port8080 {
    $killed = $false
    try {
        $conns = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            $procId = $c.OwningProcess
            if ($procId -gt 0) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "Beendet Prozess auf Port 8080 (PID $procId)"
                $killed = $true
            }
        }
    } catch {
        # Fallback ohne Get-NetTCPConnection
        $lines = netstat -ano | Select-String ':8080\s+.*LISTENING'
        foreach ($line in $lines) {
            if ($line -match '\s(\d+)\s*$') {
                $procId = [int]$Matches[1]
                if ($procId -gt 0) {
                    taskkill /PID $procId /F 2>$null | Out-Null
                    Write-Host "Beendet Prozess auf Port 8080 (PID $procId)"
                    $killed = $true
                }
            }
        }
    }
    if ($killed) { Start-Sleep -Seconds 2 }
}

Write-Host ""
Write-Host "=== Tresch Control Center ==="
Write-Host ""

if (Test-DeployServer) {
    Write-Host "Server laeuft bereits (Deploy-API OK)."
    Start-Process $CcUrl
    Write-Host "Browser geoeffnet."
    exit 0
}

Write-Host "Server starten (Port 8080 war belegt oder alt)..."
Stop-Port8080

Start-Process cmd -ArgumentList @(
    '/k',
    "title Kombi Buero-Server - bitte offen lassen && cd /d `"$ProjektRoot`" && node server.js"
)

$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if (Test-DeployServer) {
        $ready = $true
        break
    }
}

Start-Process $CcUrl

if ($ready) {
    Write-Host ""
    Write-Host "Fertig! Control Center im Browser - Tab Updates und Deploy."
} else {
    Write-Host ""
    Write-Warning "Server startet noch - im Browser F5 druecken wenn Seite leer ist."
    Write-Host "Schwarzes Server-Fenster offen lassen!"
}

Write-Host ""
