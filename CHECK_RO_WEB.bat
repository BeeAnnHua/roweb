@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (py -3 tools\deep_health_check.py . & goto :done)
where python >nul 2>nul
if not errorlevel 1 (python tools\deep_health_check.py . & goto :done)
where python3 >nul 2>nul
if not errorlevel 1 (python3 tools\deep_health_check.py . & goto :done)
echo Python is required only for the optional deep health check.
echo The game itself can still start through START_RO_WEB.bat.
set "RC=1"
goto :pause
:done
set "RC=%ERRORLEVEL%"
:pause
echo.
if "%RC%"=="0" (echo RO_WEB health check passed.) else (echo RO_WEB health check found errors.)
pause
exit /b %RC%
