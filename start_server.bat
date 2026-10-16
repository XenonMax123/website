@echo off
setlocal
cd /d "%~dp0"
title MyProgram Update-Server

echo Update-Server: http://127.0.0.1:5500/
echo Diesen Server mit Strg+C beenden oder das Fenster schliessen.
echo VS Code Five Server vorher auf Port 5500 stoppen.
echo.

if exist "%LocalAppData%\Programs\Python\Python314\python.exe" (
    "%LocalAppData%\Programs\Python\Python314\python.exe" -m http.server 5500 --bind 127.0.0.1 --directory "%~dp0."
    goto finished
)

where py >nul 2>&1
if not errorlevel 1 (
    py -3 -m http.server 5500 --bind 127.0.0.1 --directory "%~dp0."
    goto finished
)

where python >nul 2>&1
if not errorlevel 1 (
    python -m http.server 5500 --bind 127.0.0.1 --directory "%~dp0."
    goto finished
)

echo Python wurde nicht gefunden. Bitte Python installieren.

:finished
echo.
echo Server beendet. Falls der Start fehlgeschlagen ist, Fehlermeldung oben beachten.
pause
