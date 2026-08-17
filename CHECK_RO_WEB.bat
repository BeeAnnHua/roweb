@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (node tools\test_v0_9_88b11_code_health.js . & goto :done)
echo Node.js is required only for the optional V0.9.88B11 health check.
echo The game itself can still start through START_RO_WEB.bat.
set "RC=1"
goto :pause
:done
set "RC=%ERRORLEVEL%"
:pause
echo.
if "%RC%"=="0" (echo RO_WEB V0.9.88B11 health check passed.) else (echo RO_WEB V0.9.88B11 health check found errors.)
pause
exit /b %RC%
