@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
call npm run setup
if errorlevel 1 goto failed
echo Setup complete. Open Start-Windows.cmd to launch Crosspost.
pause
exit /b 0
:failed
echo Setup did not finish. Check your internet connection and the error above.
pause
exit /b 1
