@echo off
setlocal
title Learning Hub Updater
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

"%PS%" -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0updater.ps1" %*
set "CODE=%ERRORLEVEL%"

echo.
if not "%CODE%"=="0" (
  echo Update did not finish. Please read the messages above.
) else (
  echo Update finished.
)
pause
exit /b %CODE%
