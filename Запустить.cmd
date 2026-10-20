@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" server.cjs --open
) else (
  node server.cjs --open
)
pause
