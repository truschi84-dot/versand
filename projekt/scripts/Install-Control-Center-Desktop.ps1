# Legt eine Verknuepfung auf dem Desktop an (aendert nichts an der App)
$ErrorActionPreference = 'Stop'
$ScriptsDir = $PSScriptRoot
$Starter = Join-Path $ScriptsDir 'Control-Center-Starten.bat'
$Desktop = [Environment]::GetFolderPath('Desktop')
$LinkPath = Join-Path $Desktop 'Tresch Control Center.lnk'

if (-not (Test-Path $Starter)) {
    Write-Error "Fehlt: $Starter"
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($LinkPath)
$sc.TargetPath = $Starter
$sc.WorkingDirectory = $ScriptsDir
$sc.Description = 'Tresch Control Center - Verwaltung, USB-Update, GitHub'
$sc.WindowStyle = 1
$sc.Save()

Write-Host ""
Write-Host "Fertig! Auf dem Desktop:"
Write-Host "  $LinkPath"
Write-Host ""
Write-Host "Doppelklick startet Server + oeffnet Control Center im Browser."
Write-Host ""
