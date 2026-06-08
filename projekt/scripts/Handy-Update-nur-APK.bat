@echo off
chcp 65001 >nul
title Tresch Kombi – Nur APK installieren
echo.
echo ========================================
echo   Nur APK installieren (USB)
echo   (wenn in Android Studio schon gebaut)
echo ========================================
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0phone-install.ps1"
echo.
pause
