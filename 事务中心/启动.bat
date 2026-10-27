@echo off
setlocal
cd /d "%~dp0"

rem Open the first HTML file in this folder with the default browser.
rem ASCII-only on purpose: cmd.exe may misread non-ASCII literals in .bat files.
for %%F in ("*.html") do (
  start "" "%%~fF"
  exit /b 0
)

echo.
echo  [ERROR] No .html file found in this folder.
echo          Keep this .bat next to the app's .html file.
echo.
pause
exit /b 1
