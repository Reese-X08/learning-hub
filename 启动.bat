@echo off
setlocal
title Learning Hub
cd /d "%~dp0"

set "PORT=4173"
rem HOST=127.0.0.1 means this machine only. Use 0.0.0.0 to allow phones on the same WiFi.
set "HOST=127.0.0.1"
set "URL=http://127.0.0.1:%PORT%/"
set "NODE_BIN="
set "OLDPID="

echo.
echo  ==================================================
echo    Learning Hub
echo  ==================================================
echo.

rem ---- [1/5] find the Node runtime -------------------------
echo  [1/5] looking for Node runtime ...
rem local.bat holds machine-specific paths and is never committed
if exist "%~dp0local.bat" call "%~dp0local.bat"
if not defined NODE_BIN where node >nul 2>nul && set "NODE_BIN=node"
if not defined NODE_BIN if exist "%~dp0node\node.exe" set "NODE_BIN=%~dp0node\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_BIN if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_BIN goto :no_node
echo        found: %NODE_BIN%

rem ---- first run: create the empty data file -------------------
if exist "data\db.json" goto :have_data
if not exist "data\db.template.json" goto :have_data
copy "data\db.template.json" "data\db.json" >nul
echo        first run: created an empty data file

:have_data

rem ---- [2/5] stop the previous server (so code updates apply) ----
echo  [2/5] checking port %PORT% ...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do if not defined OLDPID set "OLDPID=%%P"
if not defined OLDPID goto :start_server
echo        old server is running (PID %OLDPID%), stopping it ...
taskkill /f /pid %OLDPID% >nul 2>nul
if errorlevel 1 (
  echo        could not stop it - will reuse the running one
) else (
  echo        stopped
)
ping -n 2 127.0.0.1 >nul

rem ---- [3/5] start the local server ------------------------
:start_server
echo  [3/5] starting local server ...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%NODE_BIN%' -ArgumentList 'server.js' -WorkingDirectory '%CD%' -WindowStyle Hidden"
if errorlevel 1 goto :start_failed

rem ---- [4/5] wait until it answers -------------------------
echo  [4/5] waiting for the server to answer ...
set /a WAIT_TRIES=0
:wait_loop
set /a WAIT_TRIES+=1
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 goto :ready
if %WAIT_TRIES% geq 15 goto :no_server
ping -n 2 127.0.0.1 >nul
goto :wait_loop

:ready
echo        server is ready

rem ---- [5/5] open the window -------------------------------
echo  [5/5] opening the window ...
set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" goto :no_browser

start "" "%BROWSER%" --app=%URL%
echo        opened %URL%
echo.
echo  Done. This window closes in 3 seconds.
ping -n 4 127.0.0.1 >nul
exit /b 0

:no_node
echo.
echo  [ERROR] Node runtime not found.
echo          If this is the portable package, the "node" folder is missing.
echo          Otherwise install Node.js from https://nodejs.org/
echo.
pause
exit /b 1

:start_failed
echo.
echo  [ERROR] Could not start the local server.
echo          Try running this file as administrator, or check antivirus logs.
echo.
pause
exit /b 1

:no_server
echo.
echo  [ERROR] The server did not answer on port %PORT%.
echo          Something else may be using that port.
echo          Try changing PORT at the top of this file.
echo.
pause
exit /b 1

:no_browser
echo.
echo  [ERROR] Edge / Chrome not found in the default location.
echo          Open this address manually in any browser:
echo          %URL%
echo.
pause
exit /b 1
