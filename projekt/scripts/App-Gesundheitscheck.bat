@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js fehlt - bitte installieren ^(wie fuer Control Center^).
    pause
    exit /b 1
)
node scripts\app-gesundheitscheck.js --html
echo.
pause
