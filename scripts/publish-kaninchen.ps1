# Nur Kaninchen-Seite auf GitHub Pages - OHNE App-Version / Kombi-App anzufassen
param(
    [string]$Message = "Kaninchen-Futterplan",
    [switch]$PushToGitHub
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Push-Location $Root
try {
    $files = @("kaninchen.html", "KANINCHEN_ONLINE.md")
    foreach ($f in $files) {
        if (-not (Test-Path (Join-Path $Root $f))) {
            throw "Fehlt: $f"
        }
    }

    if (-not $PushToGitHub) {
        Write-Host ""
        Write-Host "=== Kaninchen - nur lokal / Vorschau ==="
        Write-Host "Browser: http://localhost:8080/kaninchen.html"
        Write-Host ""
        Write-Host "Online:"
        Write-Host '  publish-kaninchen.ps1 -PushToGitHub -Message "Kaninchen online"'
        Write-Host ""
        Write-Host "Live-URL:"
        Write-Host "  https://truschi84-dot.github.io/versand/kaninchen.html"
        exit 0
    }

    git add kaninchen.html KANINCHEN_ONLINE.md scripts/publish-kaninchen.ps1
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
    Write-Host "  https://truschi84-dot.github.io/versand/kaninchen.html"
    Write-Host "Kombi-App bleibt unveraendert."
} finally {
    Pop-Location
}
