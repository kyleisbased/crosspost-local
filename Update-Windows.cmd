@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" "scripts\update.mjs" %*
) else (
  node "scripts\update.mjs" %*
)
pause
