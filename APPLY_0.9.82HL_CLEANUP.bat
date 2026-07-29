@echo off
setlocal
cd /d "%~dp0"
echo [RO_WEB 0.9.82HL] Cleaning previous HK root reports...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root=(Resolve-Path '.').Path; $list=Join-Path $root 'tools\DELETE_PATHS_0.9.82HL.txt'; if(!(Test-Path -LiteralPath $list)){throw 'Cleanup list not found.'}; $count=0; Get-Content -LiteralPath $list -Encoding UTF8 | ForEach-Object { $rel=$_.Trim(); if($rel){ $target=Join-Path $root ($rel -replace '/', '\'); if(Test-Path -LiteralPath $target){ Remove-Item -LiteralPath $target -Force -Recurse; $count++ } } }; Write-Host ('Removed ' + $count + ' old files.')"
if errorlevel 1 (
  echo Cleanup failed. Please keep this window and report the error.
  pause
  exit /b 1
)
echo Cleanup complete. The project now keeps the historical audit log through HK plus the latest HL reports.
pause
endlocal
