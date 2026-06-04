# Einfaches Kaninchen-App-Icon (PNG) – Firmenlogo der Kombi-App wird nicht verwendet
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-KaninchenIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 46, 125, 50))

    $s = $size / 512.0
    $brushBody = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 248, 231))
    $brushEarIn = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 171, 145))
    $brushNose = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 244, 143, 177))
    $brushEye = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 27, 60, 36))

    # Koerper
    $g.FillEllipse($brushBody, [int](156 * $s), [int](300 * $s), [int](200 * $s), [int](170 * $s))
    # Kopf
    $g.FillEllipse($brushBody, [int](146 * $s), [int](148 * $s), [int](220 * $s), [int](200 * $s))
    # Ohren
    $g.FillEllipse($brushBody, [int](118 * $s), [int](52 * $s), [int](88 * $s), [int](168 * $s))
    $g.FillEllipse($brushBody, [int](306 * $s), [int](52 * $s), [int](88 * $s), [int](168 * $s))
    $g.FillEllipse($brushEarIn, [int](142 * $s), [int](88 * $s), [int](44 * $s), [int](118 * $s))
    $g.FillEllipse($brushEarIn, [int](326 * $s), [int](88 * $s), [int](44 * $s), [int](118 * $s))
    # Augen
    $g.FillEllipse($brushEye, [int](198 * $s), [int](228 * $s), [int](36 * $s), [int](44 * $s))
    $g.FillEllipse($brushEye, [int](278 * $s), [int](228 * $s), [int](36 * $s), [int](44 * $s))
    # Nase
    $g.FillEllipse($brushNose, [int](236 * $s), [int](286 * $s), [int](40 * $s), [int](32 * $s))
    # Wangen (dezent)
    $brushCheek = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 255, 138, 128))
    $g.FillEllipse($brushCheek, [int](168 * $s), [int](278 * $s), [int](52 * $s), [int](36 * $s))
    $g.FillEllipse($brushCheek, [int](292 * $s), [int](278 * $s), [int](52 * $s), [int](36 * $s))

    $g.Dispose()
    return $bmp
}

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "icons"
if (-not (Test-Path $iconDir)) { New-Item -ItemType Directory -Path $iconDir | Out-Null }

foreach ($size in @(180, 192, 512)) {
    $bmp = New-KaninchenIcon $size
    $path = Join-Path $iconDir "kaninchen-icon-$size.png"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "OK $path"
}
