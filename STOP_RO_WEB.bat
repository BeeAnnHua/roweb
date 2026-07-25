@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "PORT=8000"
set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%P /F >nul 2>nul
)
if "!FOUND!"=="1" (
  echo RO_WEB server on port %PORT% was stopped.
) else (
  echo No RO_WEB server was listening on port %PORT%.
)
timeout /t 2 /nobreak >nul
endlocal
