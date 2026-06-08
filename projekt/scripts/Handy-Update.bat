@echo off
chcp 65001 >nul
title Tresch Kombi – Handy per USB updaten
echo.
echo ========================================
echo   Handy-Update (USB) – Web + APK
echo ========================================
echo.
echo Handy per USB verbinden, USB-Debugging an.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-android.ps1"
echo.
if errorlevel 1 (
    echo FEHLER – siehe Meldungen oben.
) else (
    echo Fertig! App auf dem Handy oeffnen.
)
echo.
pause
