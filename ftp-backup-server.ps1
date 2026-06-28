# ftp-backup-server.ps1 — HTTP-Wrapper fuer ftp-backup.ps1
# Startet einen lokalen HTTP-Server auf http://localhost:8766
# Browser kann /start (POST) und /status (GET) aufrufen
# Einmalig starten: .\ftp-backup-server.ps1

$PORT = 8766
# PSScriptRoot kann leer sein wenn per Job/Start-Process gestartet — Fallback auf bekannten Pfad
$_root  = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\Users\Trusc\Desktop\Tresch-Apps" }
$SCRIPT = Join-Path $_root "ftp-backup.ps1"

$state = [hashtable]::Synchronized(@{
    Running = $false
    Proc    = $null
    LogFile = ""
    ErrFile = ""
    Success = $null
})

function Send-Json($res, $json, $code = 200) {
    $res.StatusCode = $code
    $res.ContentType = "application/json; charset=utf-8"
    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
    $res.ContentLength64 = $buf.Length
    $res.OutputStream.Write($buf, 0, $buf.Length)
    $res.Close()
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$PORT/")
try {
    $listener.Start()
} catch {
    Write-Host "FEHLER: Port $PORT ist belegt. Laeuft der Server bereits?" -ForegroundColor Red
    Write-Host "Tipp: Get-Process -Name powershell | Stop-Process" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "  FTP Backup Server gestartet" -ForegroundColor Green
Write-Host "  URL   : http://localhost:$PORT/" -ForegroundColor Cyan
Write-Host "  Skript: $SCRIPT" -ForegroundColor Gray
Write-Host "  CTRL+C zum Beenden" -ForegroundColor Gray
Write-Host ""

while ($listener.IsListening) {
    try { $ctx = $listener.GetContext() } catch { break }

    $req  = $ctx.Request
    $res  = $ctx.Response
    $path = $req.Url.AbsolutePath
    $meth = $req.HttpMethod

    # Preflight
    if ($meth -eq "OPTIONS") {
        $res.Headers.Add("Access-Control-Allow-Origin", "*")
        $res.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
        $res.StatusCode = 200
        $res.Close()
        continue
    }

    # GET /ping
    if ($path -eq "/ping") {
        Send-Json $res '{"ok":true}'
        continue
    }

    # GET /status
    if ($path -eq "/status") {
        # Prozess-Status aktualisieren
        if ($state.Running -and $state.Proc -ne $null -and $state.Proc.HasExited) {
            $state.Running = $false
            $state.Success = ($state.Proc.ExitCode -eq 0)
        }

        # Log-Datei lesen
        $logLines = @()
        if ($state.LogFile -and (Test-Path $state.LogFile)) {
            $logLines = @(Get-Content $state.LogFile -Encoding UTF8 -ErrorAction SilentlyContinue)
        }
        if ($state.ErrFile -and (Test-Path $state.ErrFile)) {
            $errLines = @(Get-Content $state.ErrFile -Encoding UTF8 -ErrorAction SilentlyContinue)
            if ($errLines.Count -gt 0) { $logLines += $errLines }
        }

        $obj = [ordered]@{
            running = [bool]$state.Running
            log     = $logLines
            success = $state.Success
        }
        Send-Json $res ($obj | ConvertTo-Json -Depth 3 -Compress)
        continue
    }

    # POST /start
    if ($path -eq "/start" -and $meth -eq "POST") {
        if ($state.Running) {
            Send-Json $res '{"ok":false,"reason":"already_running"}'
            continue
        }

        $logFile = Join-Path $env:TEMP "ftp-backup-out.log"
        $errFile = Join-Path $env:TEMP "ftp-backup-err.log"
        Remove-Item $logFile -ErrorAction SilentlyContinue
        Remove-Item $errFile -ErrorAction SilentlyContinue

        $state.LogFile = $logFile
        $state.ErrFile = $errFile
        $state.Running = $true
        $state.Success = $null

        $state.Proc = Start-Process powershell.exe -ArgumentList @(
            "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", "`"$SCRIPT`""
        ) -RedirectStandardOutput $logFile `
          -RedirectStandardError  $errFile `
          -NoNewWindow -PassThru

        Write-Host "  Backup gestartet (PID $($state.Proc.Id))" -ForegroundColor Yellow
        Send-Json $res '{"ok":true,"started":true}'
        continue
    }

    Send-Json $res '{"error":"not found"}' 404
}

$listener.Stop()
Write-Host "Server beendet." -ForegroundColor Gray
