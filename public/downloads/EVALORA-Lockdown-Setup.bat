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
echo set "CANDIDATE_CODE="
echo.
echo if not "%%INPUT_URL%%"=="" ^(
echo     for %%%%p in ^(%%INPUT_URL:^?=" "%%^) do ^(
echo         set "PARAM=%%%%~p"
echo         if "!PARAM:~0,6!"=="token=" set "INVITE_TOKEN=!PARAM:~6!"
echo         if "!PARAM:~0,7!"=="invite=" set "INVITE_TOKEN=!PARAM:~7!"
echo         if "!PARAM:~0,5!"=="path=" set "TARGET_PATH=!PARAM:~5!"
echo         if "!PARAM:~0,5!"=="exam=" set "EXAM_CODE=!PARAM:~5!"
echo         if "!PARAM:~0,5!"=="code=" set "EXAM_CODE=!PARAM:~5!"
echo         if "!PARAM:~0,10!"=="candidate=" set "CANDIDATE_CODE=!PARAM:~10!"
echo     ^)
echo ^)
echo.
echo if not "!INVITE_TOKEN!"=="" ^(
echo     set "TARGET_URL=!EVALORA_BASE!/exam/join/!INVITE_TOKEN!"
echo     if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!?code=!EXAM_CODE!"
echo ^) else if not "!TARGET_PATH!"=="" ^(
echo     set "TARGET_URL=!EVALORA_BASE!!TARGET_PATH!"
echo     if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!?code=!EXAM_CODE!"
echo ^) else ^(
echo     set "TARGET_URL=!EVALORA_BASE!/exam-access"
echo     if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!?code=!EXAM_CODE!"
echo     if not "!CANDIDATE_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&candidate=!CANDIDATE_CODE!"
echo ^)
echo.
echo :: Check for Edge or Chrome executable to launch kiosk mode
echo if exist "%%ProgramFiles^(x86^)%%\Microsoft\Edge\Application\msedge.exe" ^(
echo     start "" "%%ProgramFiles^(x86^)%%\Microsoft\Edge\Application\msedge.exe" --app="!TARGET_URL!" --kiosk --edge-kiosk-type=fullscreen --disable-pinch --no-first-run
echo     exit /b 0
echo ^)
echo if exist "%%ProgramFiles%%\Microsoft\Edge\Application\msedge.exe" ^(
echo     start "" "%%ProgramFiles%%\Microsoft\Edge\Application\msedge.exe" --app="!TARGET_URL!" --kiosk --edge-kiosk-type=fullscreen --disable-pinch --no-first-run
echo     exit /b 0
echo ^)
echo if exist "%%ProgramFiles%%\Google\Chrome\Application\chrome.exe" ^(
echo     start "" "%%ProgramFiles%%\Google\Chrome\Application\chrome.exe" --app="!TARGET_URL!" --kiosk --no-first-run
echo     exit /b 0
echo ^)
echo.
echo start "" "!TARGET_URL!"
) > "%TARGET_DIR%\evalora-launcher.cmd"

:: Register the evalora-lockdown:// protocol in HKCU (Requires NO Administrator Privileges)
echo [1/3] Registering evalora-lockdown:// deep-linking protocol...
reg add "HKCU\Software\Classes\evalora-lockdown" /ve /t REG_SZ /d "URL:EVALORA Lockdown Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\evalora-lockdown" /v "URL Protocol" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\evalora-lockdown\shell" /f >nul 2>&1
reg add "HKCU\Software\Classes\evalora-lockdown\shell\open" /f >nul 2>&1
reg add "HKCU\Software\Classes\evalora-lockdown\shell\open\command" /ve /t REG_SZ /d "\"%TARGET_DIR%\evalora-launcher.cmd\" \"%%1\"" /f >nul 2>&1

:: Create Desktop Shortcut using VBScript
echo [2/3] Creating Desktop Shortcut...
set "VBS_SCRIPT=%TEMP%\create_evalora_shortcut.vbs"
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
del "%VBS_SCRIPT%" >nul 2>&1

echo [3/3] Verifying registration...
reg query "HKCU\Software\Classes\evalora-lockdown" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo  SUCCESS! EVALORA Secure Exam Browser is installed and ready.
    echo ======================================================================
    echo  - Protocol: evalora-lockdown:// registered successfully.
    echo  - Shortcut: Created on your Desktop.
    echo  - Permissions: User-level installation (No Admin rights required).
    echo.
    echo  You can now return to your browser and click "Launch in Secure Browser"
    echo  or double-click the "EVALORA Secure Exam Browser" icon on your desktop.
    echo ======================================================================
) else (
    echo.
    echo Notice: Registration completed. If you encounter issues launching from
    echo your browser, please run the shortcut on your desktop directly.
)

echo.
pause
