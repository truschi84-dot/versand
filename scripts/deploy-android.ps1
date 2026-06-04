# Kombi-App: Web-Assets nach LogistikApp kopieren + installDebug per USB
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Get-AdbPath {
    if ($env:ANDROID_HOME) {
        $p = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
        if (Test-Path $p) { return $p }
    }
    $local = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    if (Test-Path $local) { return $local }
    throw "adb nicht gefunden (Android SDK Platform-Tools installieren)."
}

function Get-Config {
    $cfgFile = Join-Path $Root "deploy.config.json"
    if (-not (Test-Path $cfgFile)) {
        throw "Fehlt: deploy.config.json"
    }
    Get-Content $cfgFile -Raw | ConvertFrom-Json
}

function Copy-WebAssets($projectRoot, $assetsRel) {
    $dest = Join-Path $projectRoot ($assetsRel -replace "/", "\")
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

    $includeExt = @(".html", ".js", ".css", ".json", ".webmanifest", ".png", ".jpg", ".svg", ".ico", ".webp", ".woff", ".woff2")
    $excludeNames = @(
        "deploy.config.json", "deploy.config.example.json",
        "server.js", "control test.html", "test-checklist.html",
        "Checkliste.html", "checklistearbeit", "checklistearbeit.html"
    )

    Write-Host "Kopiere Web-Dateien:"
    Write-Host "  Von: $Root"
    Write-Host "  Nach: $dest"
    $count = 0
    Get-ChildItem -Path $Root -File | ForEach-Object {
        if ($excludeNames -contains $_.Name) { return }
        if ($includeExt -notcontains $_.Extension.ToLower()) { return }
        Copy-Item -Path $_.FullName -Destination (Join-Path $dest $_.Name) -Force
        Write-Host "  + $($_.Name)"
        $count++
    }
    $iconsSrc = Join-Path $Root "icons"
    if (Test-Path $iconsSrc) {
        $iconsDest = Join-Path $dest "icons"
        New-Item -ItemType Directory -Path $iconsDest -Force | Out-Null
        Get-ChildItem -Path $iconsSrc -File | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination (Join-Path $iconsDest $_.Name) -Force
            Write-Host "  + icons/$($_.Name)"
            $count++
        }
    }
    if ($count -eq 0) { throw "Keine Dateien kopiert - Quellordner pruefen." }
}

function Set-JavaHomeIfNeeded {
    if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) { return }
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jbr"
    )
    foreach ($jbr in $candidates) {
        if (Test-Path "$jbr\bin\java.exe") {
            $env:JAVA_HOME = $jbr
            $env:PATH = "$jbr\bin;" + $env:PATH
            Write-Host "JAVA_HOME: $jbr"
            return
        }
    }
    throw "JAVA_HOME fehlt. Android Studio JBR nicht gefunden."
}

function Invoke-GradleInstall($projectRoot, $task) {
    $gradlew = Join-Path $projectRoot "gradlew.bat"
    if (-not (Test-Path $gradlew)) { throw "gradlew.bat nicht in: $projectRoot" }
    Set-JavaHomeIfNeeded
    Push-Location $projectRoot
    try {
        Write-Host "Gradle: $task ..."
        & $gradlew $task --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "Gradle Exit $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

$cfg = Get-Config
$project = $cfg.androidProject.TrimEnd("\")
if (-not (Test-Path $project)) { throw "Projekt nicht gefunden: $project" }

$assetsPath = if ($cfg.assetsPath) { $cfg.assetsPath } else { "app/src/main/assets" }
$gradleTask = if ($cfg.gradleTask) { $cfg.gradleTask } else { "installDebug" }

Copy-WebAssets $project $assetsPath

$adb = Get-AdbPath
$devices = (& $adb devices) | Select-String "device$"
if (-not $devices) {
    Write-Warning "Kein Handy per USB erkannt - baue nur APK (assembleDebug)."
    Invoke-GradleInstall $project "assembleDebug"
    $apk = Join-Path $project (($cfg.apkPath -replace "/", "\"))
    Write-Host "APK fertig: $apk"
    Write-Host "Wenn Handy verbunden: Aufgabe 'Nur APK installieren' oder: adb install -r `"$apk`""
    exit 0
}

Invoke-GradleInstall $project $gradleTask
Write-Host ""
Write-Host "Verbundene Geraete:"
& $adb devices
Write-Host ""
Write-Host "Fertig - App auf dem Handy installiert."
