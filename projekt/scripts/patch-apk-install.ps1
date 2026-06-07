# Web-Assets in vorhandene APK packen und per USB installieren (ohne Android Studio)
param(
    [string]$SourceApk = "",
    [string]$PackageName = "com.example.logistikapp"
)

$ErrorActionPreference = "Stop"
$ProjektRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Split-Path -Parent $ProjektRoot
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$apksigner = "$env:LOCALAPPDATA\Android\Sdk\build-tools\37.0.0\apksigner.bat"
$zipalign = "$env:LOCALAPPDATA\Android\Sdk\build-tools\37.0.0\zipalign.exe"
$debugKs = "$env:USERPROFILE\.android\debug.keystore"
$work = Join-Path $env:TEMP "kombi-apk-patch"
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-EmbeddedSecrets($destJsDir) {
    $secretsPath = Join-Path $AppRoot "app-secrets.json"
    $outPath = Join-Path $destJsDir "cloud_secrets.embed.js"
    if (-not (Test-Path $secretsPath)) {
        [System.IO.File]::WriteAllText($outPath, "window.__FIREBASE_SECRETS__=null;", $Utf8NoBom)
        return
    }
    $cfg = Get-Content $secretsPath -Raw | ConvertFrom-Json
    $json = ($cfg | ConvertTo-Json -Compress)
    [System.IO.File]::WriteAllText($outPath, "window.__FIREBASE_SECRETS__=$json;", $Utf8NoBom)
}

function Copy-AssetsTo($destAssets) {
    if (-not (Test-Path $destAssets)) { New-Item -ItemType Directory -Path $destAssets -Force | Out-Null }
    $rootFiles = @("index.html", "manifest.webmanifest", "sw.js", "app-update.json", "app-version.json", "app-shell.json")
    foreach ($name in $rootFiles) {
        $src = Join-Path $AppRoot $name
        if (-not (Test-Path $src)) { continue }
        Copy-Item $src (Join-Path $destAssets $name) -Force
    }
    $shellSrc = Join-Path $ProjektRoot "config\app-shell.json"
    if (Test-Path $shellSrc) { Copy-Item $shellSrc (Join-Path $destAssets "app-shell.json") -Force }
    foreach ($dir in @("js", "css", "lib", "icons")) {
        $srcDir = Join-Path $AppRoot $dir
        if (-not (Test-Path $srcDir)) { continue }
        $destDir = Join-Path $destAssets $dir
        if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
        Copy-Item $srcDir $destDir -Recurse -Force
    }
    Write-EmbeddedSecrets (Join-Path $destAssets "js")
}

function Update-ZipEntry($zipPath, $entryName, $filePath) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $mode = [System.IO.Compression.ZipArchiveMode]::Update
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, $mode)
    try {
        $existing = $zip.GetEntry($entryName)
        if ($existing) { $existing.Delete() }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $filePath, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    } finally {
        $zip.Dispose()
    }
}

if (-not (Test-Path $adb)) { throw "adb nicht gefunden." }
if (-not (Test-Path $apksigner)) { throw "apksigner nicht gefunden." }
if (-not (Test-Path $debugKs)) { throw "debug.keystore nicht gefunden." }

if (-not $SourceApk) {
    $distApk = Join-Path $ProjektRoot "dist\Tresch-Kombi-App.apk"
    $pulled = Join-Path $work "base.apk"
    if (Test-Path $distApk) { $SourceApk = $distApk }
    else {
        New-Item -ItemType Directory -Force -Path $work | Out-Null
        $pathLine = & $adb shell pm path $PackageName 2>$null
        if (-not $pathLine) { throw "Keine APK auf dem Handy ($PackageName) und keine dist-APK." }
        $remote = ($pathLine -replace "^package:", "").Trim()
        & $adb pull $remote $pulled | Out-Null
        $SourceApk = $pulled
    }
}
if (-not (Test-Path $SourceApk)) { throw "APK nicht gefunden: $SourceApk" }

Write-Host "Quelle: $SourceApk"
$outApk = Join-Path $work "patched.apk"
$alignedApk = Join-Path $work "aligned.apk"
New-Item -ItemType Directory -Force -Path $work | Out-Null
Copy-Item $SourceApk $outApk -Force

$staging = Join-Path $work "assets"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
Copy-AssetsTo $staging

Get-ChildItem $staging -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($staging.Length + 1).Replace("\", "/")
    $entry = "assets/$rel"
    Write-Host "  + $entry"
    Update-ZipEntry $outApk $entry $_.FullName
}

if (Test-Path $zipalign) {
    if (Test-Path $alignedApk) { Remove-Item $alignedApk -Force }
    & $zipalign -f 4 $outApk $alignedApk
    if ($LASTEXITCODE -eq 0) { $outApk = $alignedApk }
}

$signedApk = Join-Path $work "signed.apk"
if (Test-Path $signedApk) { Remove-Item $signedApk -Force }
Copy-Item $outApk $signedApk -Force
& $apksigner sign --ks $debugKs --ks-pass pass:android --key-pass pass:android --out $signedApk $outApk
if ($LASTEXITCODE -ne 0) { throw "apksigner fehlgeschlagen" }

Write-Host ""
Write-Host "Installiere auf Handy ..."
& $adb install -r $signedApk
if ($LASTEXITCODE -ne 0) { throw "adb install fehlgeschlagen" }
Write-Host "OK – App mit aktuellen Web-Dateien installiert."
