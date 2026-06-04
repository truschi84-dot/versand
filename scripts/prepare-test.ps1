# Nur lokal vorbereiten + Büro-Server – KEIN GitHub-Push
# Am Handy testen, erst danach: publish-github.ps1 -PushToGitHub
param([switch]$BumpVersion)

$Root = Split-Path -Parent $PSScriptRoot
if ($BumpVersion) {
    & (Join-Path $Root "scripts\publish-github.ps1") -BumpVersion -LocalOnly
} else {
    Write-Host "Keine Versionserhoehung. Dateien im Ordner assets sind bereit."
}
Write-Host ""
Write-Host "=== Test auf DEINEM Handy (ohne GitHub) ==="
Write-Host "1) Gleiches WLAN wie dieser Laptop"
Write-Host "2) Server starten (falls nicht laeuft): scripts\restart-buero-server.ps1"
Write-Host "3) Am Handy: Menue -> App-Update pruefen ODER im Browser:"
Write-Host "   http://192.168.2.204:8080/index.html"
Write-Host "4) Scanner testen. APK: einmal scripts\deploy-android.ps1 fuer eingebaute Dateien"
Write-Host "5) Wenn alles OK: publish-github.ps1 -PushToGitHub -Message \"...\""
Write-Host ""
