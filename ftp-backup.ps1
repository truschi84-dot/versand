# ftp-backup.ps1 — Tresch Apps FTP Backup
# Laedt alle Web-Dateien auf trusch.myddns.me hoch
# Ordner-Struktur: TreschApps-Backups/YYYY-MM-DD_BuildXXX/

$FTP_HOST   = "ftp://trusch.myddns.me"
$FTP_USER   = "anonymous"
$FTP_PASS   = ""
$ROOT_DIR   = "C:\Users\Trusc\Desktop\Tresch-Apps"
$FTP_BACKUP_ROOT = "Storage/TreschApps-Backups"

# Ordner und Dateien die NICHT hochgeladen werden
$EXCLUDE_DIRS = @(".git", "AndroidStudioProjects", "node_modules", ".claude", ".vscode")
$EXCLUDE_FILES = @("app-secrets.json", "backup.ab", "ftp-backup.ps1", "ftp-backup-server.ps1")
$EXCLUDE_PATTERNS = @("*.keystore", "*.jks", "google-services.json")

# Version aus js/script.js lesen
$scriptJs = Get-Content "$ROOT_DIR\js\script.js" -ErrorAction SilentlyContinue
$version = "UnknownBuild"
foreach ($line in $scriptJs) {
    if ($line -match "WEB_BUILD_VERSION\s*=\s*['""]?(\d+)['""]?") {
        $version = "Build$($Matches[1])"
        break
    }
}

$date = Get-Date -Format "yyyy-MM-dd"
$backupFolder = "$date`_$version"
$ftpTarget = "$FTP_HOST/$FTP_BACKUP_ROOT/$backupFolder"

Write-Host ""
Write-Host "===== Tresch Apps FTP Backup =====" -ForegroundColor Cyan
Write-Host "Version  : $version" -ForegroundColor Yellow
Write-Host "Datum    : $date" -ForegroundColor Yellow
Write-Host "Ziel-FTP : $ftpTarget" -ForegroundColor Yellow
Write-Host ""

function Test-FtpConnection() {
    Write-Host "Verbindungstest..." -ForegroundColor Cyan
    try {
        $req = [System.Net.FtpWebRequest]::Create($FTP_HOST)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
        $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $req.UsePassive = $true
        $req.UseBinary = $false
        $req.KeepAlive = $false
        $req.Timeout = 8000
        $resp = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $listing = $reader.ReadToEnd().Trim()
        $reader.Close(); $resp.Close()
        Write-Host "  FTP-Root erreichbar. Inhalt:" -ForegroundColor Green
        if ($listing) { $listing -split "`n" | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray } }
        else { Write-Host "    (leer)" -ForegroundColor Gray }
        return $true
    } catch {
        Write-Host "  FEHLER Verbindung: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Create-FtpDir($url) {
    try {
        $req = [System.Net.FtpWebRequest]::Create($url)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $req.UsePassive = $true
        $req.UseBinary = $true
        $req.KeepAlive = $false
        $resp = $req.GetResponse()
        $resp.Close()
        Write-Host "  Ordner erstellt: $url" -ForegroundColor DarkCyan
    } catch {
        $msg = $_.Exception.Message
        if ($msg -notmatch "550|File exists|already exists") {
            Write-Host "  Ordner-Warnung ($url): $msg" -ForegroundColor Yellow
        }
    }
}

function Upload-File($localPath, $ftpUrl) {
    try {
        $req = [System.Net.FtpWebRequest]::Create($ftpUrl)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $req.UsePassive = $true
        $req.UseBinary = $true
        $req.KeepAlive = $false

        $fileBytes = [System.IO.File]::ReadAllBytes($localPath)
        $req.ContentLength = $fileBytes.Length
        $stream = $req.GetRequestStream()
        $stream.Write($fileBytes, 0, $fileBytes.Length)
        $stream.Close()

        $resp = $req.GetResponse()
        $resp.Close()
        return $true
    } catch {
        Write-Host "  FEHLER: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Should-Exclude($name, $isDir) {
    if ($isDir) { return $EXCLUDE_DIRS -contains $name }
    if ($EXCLUDE_FILES -contains $name) { return $true }
    foreach ($pat in $EXCLUDE_PATTERNS) {
        if ($name -like $pat) { return $true }
    }
    return $false
}

function Backup-Dir($localDir, $ftpDir) {
    Create-FtpDir $ftpDir

    $items = Get-ChildItem -Path $localDir -Force
    foreach ($item in $items) {
        if (Should-Exclude $item.Name $item.PSIsContainer) {
            Write-Host "  SKIP: $($item.Name)" -ForegroundColor DarkGray
            continue
        }

        if ($item.PSIsContainer) {
            $relPath = $item.FullName.Substring($ROOT_DIR.Length).Replace("\", "/")
            Write-Host "  Ordner: $relPath" -ForegroundColor DarkCyan
            Backup-Dir $item.FullName "$ftpDir/$($item.Name)"
        } else {
            $relPath = $item.FullName.Substring($ROOT_DIR.Length).Replace("\", "/")
            $ok = Upload-File $item.FullName "$ftpDir/$($item.Name)"
            if ($ok) {
                Write-Host "  OK: $relPath" -ForegroundColor Green
            }
        }
    }
}

# Verbindungstest
if (-not (Test-FtpConnection)) {
    Write-Host "Abbruch: FTP-Server nicht erreichbar." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Basis-Ordner anlegen
Write-Host "Erstelle FTP-Ordner..." -ForegroundColor Cyan
Create-FtpDir "$FTP_HOST/$FTP_BACKUP_ROOT"
Create-FtpDir "$FTP_HOST/$FTP_BACKUP_ROOT/$backupFolder"
Write-Host ""

# Upload starten
Write-Host "Starte Upload..." -ForegroundColor Cyan
Write-Host ""
Backup-Dir $ROOT_DIR $ftpTarget

Write-Host ""
Write-Host "===== Fertig! =====" -ForegroundColor Green
Write-Host "Backup gespeichert unter: $FTP_BACKUP_ROOT/$backupFolder" -ForegroundColor Green
Write-Host ""
