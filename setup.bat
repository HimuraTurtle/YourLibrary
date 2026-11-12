@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Your Library - first-run setup
echo ============================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install Node.js, then run: npm install -g pnpm
  pause
  exit /b 1
)

echo [1/4] Installing Node dependencies ...
call pnpm install
if errorlevel 1 ( echo [ERROR] pnpm install failed & pause & exit /b 1 )

set "EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%EXE%" (
  echo [2/4] Downloading Electron ...
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  call node node_modules\electron\install.js
  if errorlevel 1 ( echo [ERROR] Electron download failed & pause & exit /b 1 )
) else (
  echo [2/4] Electron ready
)

echo [3/4] Creating data folders ...
if not exist "books" mkdir books
if not exist "papers" mkdir papers
if not exist "manga" mkdir manga

echo [4/4] Setting up Suwayomi (manga server) ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-suwayomi.ps1"

echo.
echo ============================================
echo   Done! Double-click start.bat to launch.
echo ============================================
pause
endlocal
