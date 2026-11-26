@echo off
setlocal
set "game=%~dp0dist\play.html"
if not exist "%game%" (
  echo Build the game first: npm ci and npm run build
  pause
  exit /b 1
)
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if exist "%%~B" (
    start "" "%%~B" --new-window "%game%"
    exit /b 0
  )
)
start "" "%game%"
