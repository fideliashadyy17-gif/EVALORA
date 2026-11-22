@echo off
setlocal
set "VERSION=1.1.0"
set "ARTIFACT=EVALORA-Secure-Browser-%VERSION%-Setup.exe"
set "RELEASE_URL=https://github.com/fideliashadyy17-gif/EVALORA/releases/latest/download/%ARTIFACT%"
set "TARGET=%TEMP%\%ARTIFACT%"
set "CHECKSUM=%TARGET%.sha256"
title EVALORA Secure Exam Browser Installer

echo Downloading the official EVALORA Secure Exam Browser %VERSION% installer...
where curl.exe >nul 2>&1
if errorlevel 1 (
  echo curl.exe is required on Windows 10/11. Download the installer from the EVALORA Secure Browser page.
  pause
  exit /b 1
)
curl.exe --fail --location --silent --show-error "%RELEASE_URL%" --output "%TARGET%"
if errorlevel 1 (
  echo Installer download failed. Please retry from https://evalora-edu.online/download/secure-browser
  pause
  exit /b 1
)
curl.exe --fail --location --silent --show-error "%RELEASE_URL%.sha256" --output "%CHECKSUM%"
if errorlevel 1 (
  echo Installer checksum download failed. Refusing to execute an unverified file.
  del /q "%TARGET%" 2>nul
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "$expected=((Get-Content -Raw '%CHECKSUM%').Trim() -split '\s+')[0].ToLowerInvariant(); $actual=(Get-FileHash '%TARGET%' -Algorithm SHA256).Hash.ToLowerInvariant(); if ($actual -ne $expected) { exit 1 }"
if errorlevel 1 (
  echo Installer checksum verification failed. Refusing to execute the file.
  del /q "%TARGET%" "%CHECKSUM%" 2>nul
  pause
  exit /b 1
)
echo Verified SHA-256. Launching the official EVALORA installer. Follow the installation prompts.
start /wait "" "%TARGET%"
set "RESULT=%ERRORLEVEL%"
if exist "%TARGET%" del /q "%TARGET%"
if exist "%CHECKSUM%" del /q "%CHECKSUM%"
exit /b %RESULT%
