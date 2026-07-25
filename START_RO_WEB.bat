@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%/"

call :is_listening
if "%LISTENING%"=="1" goto :open

where py >nul 2>nul
if not errorlevel 1 (
  start "RO_WEB Server" /D "%~dp0" cmd /k "py -3 -m http.server %PORT% --bind 127.0.0.1"
  goto :wait
)
where python >nul 2>nul
if not errorlevel 1 (
  start "RO_WEB Server" /D "%~dp0" cmd /k "python -m http.server %PORT% --bind 127.0.0.1"
  goto :wait
)
where python3 >nul 2>nul
if not errorlevel 1 (
  start "RO_WEB Server" /D "%~dp0" cmd /k "python3 -m http.server %PORT% --bind 127.0.0.1"
  goto :wait
)
where powershell.exe >nul 2>nul
if not errorlevel 1 (
  start "RO_WEB Server" /D "%~dp0" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\ro_web_server.ps1" -Port %PORT% -Root "%~dp0"
  goto :wait
)

echo.
echo RO_WEB could not find Python or Windows PowerShell.
echo Open this folder in VS Code and use Live Server instead.
echo.
pause
exit /b 1

:wait
for /L %%I in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  call :is_listening
  if "!LISTENING!"=="1" goto :open
)
echo.
echo The local server did not start on port %PORT%.
echo Check the RO_WEB Server window for the error message.
echo.
pause
exit /b 1

:open
start "" "%URL%"
exit /b 0

:is_listening
set "LISTENING=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do set "LISTENING=1"
exit /b 0
