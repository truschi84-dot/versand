@echo off

cd /d "%~dp0"

title Tresch Apps Launcher



echo.

echo  ========================================

echo   Tresch Apps - Server starten

echo  ========================================

echo.



for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8080" ^| findstr "ABH"') do (

    taskkill /F /PID %%P >nul 2>&1

)

ping -n 2 127.0.0.1 >nul



start "Tresch Server - bitte offen lassen" cmd /k "cd /d %~dp0 && node server.js"



echo  Warte kurz auf Server...

ping -n 5 127.0.0.1 >nul



echo  Oeffne Browser...

start "" "http://localhost:8080/Start.html"



echo.

echo  Server laeuft!

echo  Fenster "Tresch Server" bitte OFFEN lassen

echo  App-Auswahl: http://localhost:8080/Start.html

echo.

pause

