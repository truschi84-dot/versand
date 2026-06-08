# Kombi-App: Web-Assets nach LogistikApp kopieren + installDebug per USB
# Kopiert NUR: index.html, manifest, sw.js, app-update/version, js/, css/, lib/, icons/
# Kopiert NICHT: projekt/, kaninchen/, pc/, dist/, backups-local/
$ErrorActionPreference = "Stop"
$ProjektRoot = Split-Path -Parent $PSScriptRoot
$AppRoot = Split-Path -Parent $ProjektRoot

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
    $cfgFile = Join-Path $ProjektRoot "deploy.config.json"
    if (-not (Test-Path $cfgFile)) {
        throw "Fehlt: deploy.config.json"
    }
    Get-Content $cfgFile -Raw | ConvertFrom-Json
}

function Write-EmbeddedSecrets($destJsDir) {
    $secretsPath = Join-Path $AppRoot "app-secrets.json"
    $outPath = Join-Path $destJsDir "cloud_secrets.embed.js"
    if (-not (Test-Path $secretsPath)) {
        Set-Content -Path $outPath -Value "window.__FIREBASE_SECRETS__=null;" -Encoding UTF8
        Write-Warning "app-secrets.json fehlt - Cloud-Zugang in APK nicht eingebettet."
        return
    }
    $cfg = Get-Content $secretsPath -Raw | ConvertFrom-Json
    $json = ($cfg | ConvertTo-Json -Compress)
    Set-Content -Path $outPath -Value "window.__FIREBASE_SECRETS__=$json;" -Encoding UTF8
    Write-Host "  + js/cloud_secrets.embed.js (Firebase-Zugang eingebettet)"
}

function Copy-WebAssets($projectRoot, $assetsRel) {
    $dest = Join-Path $projectRoot ($assetsRel -replace "/", "\")
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

    $rootFiles = @(
        "index.html", "manifest.webmanifest", "sw.js",
        "app-update.json", "app-version.json", "app-secrets.json"
    )
    $subDirs = @("js", "css", "lib", "icons")

    Write-Host "Kopiere Web-Dateien:"
    Write-Host "  Von: $AppRoot"
    Write-Host "  Nach: $dest"
    $count = 0

    foreach ($name in $rootFiles) {
        $src = Join-Path $AppRoot $name
        if (-not (Test-Path $src)) { continue }
        Copy-Item -Path $src -Destination (Join-Path $dest $name) -Force
        Write-Host "  + $name"
        $count++
    }

    foreach ($dir in $subDirs) {
        $srcDir = Join-Path $AppRoot $dir
        if (-not (Test-Path $srcDir)) { continue }
        $destDir = Join-Path $dest $dir
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        Get-ChildItem -Path $srcDir -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring($srcDir.Length + 1)
            if ($rel -eq "cloud_secrets.embed.js") { return }
            $target = Join-Path $destDir $rel
            $targetParent = Split-Path $target -Parent
            if (-not (Test-Path $targetParent)) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
            Copy-Item -Path $_.FullName -Destination $target -Force
            Write-Host "  + $dir/$rel"
            $count++
        }
    }

    $destJs = Join-Path $dest "js"
    if (Test-Path $destJs) { Write-EmbeddedSecrets $destJs }

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
