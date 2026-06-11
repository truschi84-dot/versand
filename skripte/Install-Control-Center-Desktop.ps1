# Desktop-Verknuepfung "Tresch Apps" anlegen
$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot
$Starter = Join-Path $AppRoot 'START.bat'
$Desktop = [Environment]::GetFolderPath('Desktop')
$LinkPath = Join-Path $Desktop 'Tresch Apps.lnk'

if (-not (Test-Path $Starter)) {
    Write-Error "Fehlt: $Starter"
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($LinkPath)
$sc.TargetPath = $Starter
$sc.WorkingDirectory = $AppRoot
$sc.Description = 'Tresch Apps - Server, Control Center, USB-Update'
$sc.WindowStyle = 1
$sc.Save()

Write-Host ""
Write-Host "Fertig! Desktop-Verknuepfung:"
Write-Host "  $LinkPath"
Write-Host ""
Write-Host "Doppelklick startet Server-Fenster + Browser."
Write-Host ""
