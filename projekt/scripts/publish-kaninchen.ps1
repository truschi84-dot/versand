# Nur Kaninchen-Seite auf GitHub Pages - OHNE App-Version / Kombi-App anzufassen
param(
    [string]$Message = "Kaninchen-Futterplan",
    [switch]$PushToGitHub
)

$ErrorActionPreference = "Stop"
$ProjektRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Split-Path -Parent $ProjektRoot

Push-Location $AppRoot
try {
    $files = @("kaninchen.html", "kaninchen/index.html", "kaninchen/manifest.webmanifest", "kaninchen/sw.js", "kaninchen/icons/kaninchen-icon-192.png", "projekt/docs/KANINCHEN_ONLINE.md")
    foreach ($f in $files) {
        if (-not (Test-Path (Join-Path $AppRoot $f))) {
            throw "Fehlt: $f"
        }
    }

    if (-not $PushToGitHub) {
        Write-Host ""
        Write-Host "=== Kaninchen - nur lokal / Vorschau ==="
        Write-Host "Browser: http://localhost:8080/kaninchen/"
        Write-Host ""
        Write-Host "Online:"
        Write-Host '  publish-kaninchen.ps1 -PushToGitHub -Message "Kaninchen online"'
        Write-Host ""
        Write-Host "Live-URL:"
        Write-Host "  https://truschi84-dot.github.io/versand/kaninchen/"
        exit 0
    }

    git add kaninchen.html kaninchen/ projekt/docs/KANINCHEN_ONLINE.md projekt/scripts/publish-kaninchen.ps1 projekt/scripts/generate-kaninchen-icons.ps1
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "Nichts zu committen."
        exit 0
    }

    Write-Host "Commit: $Message"
    git commit -m $Message
    Write-Host "Push origin main ..."
    git push origin main
    Write-Host ""
    Write-Host "WhatsApp-Link:"
    Write-Host "  https://truschi84-dot.github.io/versand/kaninchen/"
    Write-Host "Kombi-App bleibt unveraendert."
} finally {
    Pop-Location
}
