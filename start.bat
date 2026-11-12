@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Your Library - starting
echo ============================================

REM --- Start external dependencies (manga server) ---
echo [1/2] Starting Suwayomi (manga server) ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\suwayomi.ps1" -Action start
REM Suwayomi runs in the background; if it is missing, the app still launches below.

echo [2/2] Launching the app ...
set "EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%EXE%" (
  echo [init] Electron binary not found. Running "pnpm start" instead...
  call pnpm start
  exit /b %errorlevel%
)
start "" "%EXE%" "%~dp0electron\main.cjs"
endlocal
