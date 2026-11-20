@echo off
title EVALORA Secure Exam Browser — Setup
color 0A

echo ======================================================================
echo            EVALORA SECURE EXAM BROWSER - WINDOWS SETUP
echo ======================================================================
echo.
echo Setting up the secure examination environment on this computer...
echo.

set "TARGET_DIR=%LOCALAPPDATA%\EVALORA-Lockdown"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

:: Create the launcher script
(
echo @echo off
echo setlocal enabledelayedexpansion
echo set "EVALORA_BASE=https://evalora-six.vercel.app"
echo set "INPUT_URL=%%~1"
echo set "INVITE_TOKEN="
echo set "TARGET_PATH="
echo set "EXAM_CODE="
echo.
echo if not "!INPUT_URL!"=="" ^(
echo     if "!INPUT_URL:~0,24!"=="evalora-lockdown://join/" ^(
echo         for /f "tokens=3 delims=/? " %%%%a in ^("!INPUT_URL!"^) do ^(
echo             set "INVITE_TOKEN=%%%%a"
echo         ^)
echo     ^)
echo     set "URL_CLEAN=!INPUT_URL:?=" "!"
echo     set "URL_CLEAN=!URL_CLEAN:&=" "!"
echo     for %%%%p in ^(!URL_CLEAN!^) do ^(
echo         set "PARAM=%%%%~p"
echo         if "!PARAM:~0,6!"=="token=" set "INVITE_TOKEN=!PARAM:~6!"
echo         if "!PARAM:~0,7!"=="invite=" set "INVITE_TOKEN=!PARAM:~7!"
echo         if "!PARAM:~0,5!"=="path=" set "TARGET_PATH=!PARAM:~5!"
echo         if "!PARAM:~0,5!"=="exam=" set "EXAM_CODE=!PARAM:~5!"
echo         if "!PARAM:~0,5!"=="code=" set "EXAM_CODE=!PARAM:~5!"
echo     ^)
echo ^)
echo.
echo if not "!INVITE_TOKEN!"=="" ^(
echo     set "INVITE_TOKEN=!INVITE_TOKEN:/=!"
echo     set "INVITE_TOKEN=!INVITE_TOKEN:\=!"
echo ^)
echo if not "!EXAM_CODE!"=="" ^(
echo     set "EXAM_CODE=!EXAM_CODE:/=!"
echo     set "EXAM_CODE=!EXAM_CODE:\=!"
echo ^)
echo.
echo if not "!INVITE_TOKEN!"=="" ^(
echo     set "TARGET_URL=!EVALORA_BASE!/exam/join/!INVITE_TOKEN!?lockdown=1"
echo     if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&code=!EXAM_CODE!"
echo ^) else if not "!TARGET_PATH!"=="" ^(
echo     set "TARGET_URL=!EVALORA_BASE!!TARGET_PATH!"
echo     echo !TARGET_PATH! ^| findstr /i "\?" ^>nul
echo     if !ERRORLEVEL! EQU 0 ^(
echo         set "TARGET_URL=!TARGET_URL!^&lockdown=1"
echo     ^) else ^(
echo         set "TARGET_URL=!TARGET_URL!?lockdown=1"
echo     ^)
echo     if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&code=!EXAM_CODE!"
echo ^) else ^(
echo     set "TARGET_URL=!EVALORA_BASE!/exam-access?lockdown=1"
echo     if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&code=!EXAM_CODE!"
echo ^)
echo.
echo :: Check for Edge or Chrome executable to launch kiosk mode
echo if exist "%%ProgramFiles^(x86^)%%\Microsoft\Edge\Application\msedge.exe" ^(
echo     start "" "%%ProgramFiles^(x86^)%%\Microsoft\Edge\Application\msedge.exe" --app="!TARGET_URL!" --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 EVALORA-Secure-Browser/1.0.0" --kiosk --edge-kiosk-type=fullscreen --disable-pinch --no-first-run
echo     exit /b 0
echo ^)
echo if exist "%%ProgramFiles%%\Microsoft\Edge\Application\msedge.exe" ^(
echo     start "" "%%ProgramFiles%%\Microsoft\Edge\Application\msedge.exe" --app="!TARGET_URL!" --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 EVALORA-Secure-Browser/1.0.0" --kiosk --edge-kiosk-type=fullscreen --disable-pinch --no-first-run
echo     exit /b 0
echo ^)
echo if exist "%%ProgramFiles%%\Google\Chrome\Application\chrome.exe" ^(
echo     start "" "%%ProgramFiles%%\Google\Chrome\Application\chrome.exe" --app="!TARGET_URL!" --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 EVALORA-Secure-Browser/1.0.0" --kiosk --no-first-run
echo     exit /b 0
echo ^)
echo.
echo start "" "!TARGET_URL!"
) > "%TARGET_DIR%\evalora-launcher.cmd"

:: Register the evalora-lockdown:// protocol in HKCU
echo [1/3] Registering evalora-lockdown:// protocol handler...
reg add "HKCU\Software\Classes\evalora-lockdown" /ve /d "URL:EVALORA Lockdown Protocol" /f >nul
reg add "HKCU\Software\Classes\evalora-lockdown" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\evalora-lockdown\shell\open\command" /ve /d "\"%TARGET_DIR%\evalora-launcher.cmd\" \"%%1\"" /f >nul

:: Create desktop shortcut
echo [2/3] Creating Desktop Shortcut...
set "VBS_SCRIPT=%TEMP%\evalora_shortcut.vbs"
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = oWS.SpecialFolders^("Desktop"^) ^& "\EVALORA Secure Exam Browser.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "%TARGET_DIR%\evalora-launcher.cmd"
echo oLink.Description = "EVALORA Secure Exam Browser"
echo oLink.WorkingDirectory = "%TARGET_DIR%"
echo oLink.Save
) > "%VBS_SCRIPT%"
cscript //nologo "%VBS_SCRIPT%" >nul 2>&1
if exist "%VBS_SCRIPT%" del /f /q "%VBS_SCRIPT%" >nul 2>&1

echo [3/3] Verifying installation...
if exist "%TARGET_DIR%\evalora-launcher.cmd" (
    echo.
    echo ======================================================================
    echo   EVALORA Secure Exam Browser setup completed successfully!
    echo   You can now click "Launch in Secure Browser" on your examination page.
    echo ======================================================================
) else (
    echo.
    echo [ERROR] Setup encountered an issue creating the launcher.
)

echo.
pause
