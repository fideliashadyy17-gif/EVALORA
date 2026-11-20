# EVALORA Secure Exam Browser — PowerShell Setup & Protocol Registrer
# Windows 10 / Windows 11 Native Setup (Zero Administrator Rights Required)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "          EVALORA SECURE EXAM BROWSER - WINDOWS SETUP                 " -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$TargetDir = "$env:LOCALAPPDATA\EVALORA-Lockdown"
if (-not (Test-Path -Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$LauncherPath = "$TargetDir\evalora-launcher.cmd"
$LauncherContent = @"
@echo off
setlocal enabledelayedexpansion
set "EVALORA_BASE=https://evalora-six.vercel.app"
set "INPUT_URL=%~1"
set "INVITE_TOKEN="
set "TARGET_PATH="
set "EXAM_CODE="
set "CANDIDATE_CODE="

if not "!INPUT_URL!"=="" (
    if "!INPUT_URL:~0,24!"=="evalora-lockdown://join/" (
        for /f "tokens=3 delims=/? " %%a in ("!INPUT_URL!") do (
            set "INVITE_TOKEN=%%a"
        )
    )
    set "URL_CLEAN=!INPUT_URL:?=" "!"
    set "URL_CLEAN=!URL_CLEAN:&=" "!"
    for %%p in (!URL_CLEAN!) do (
        set "PARAM=%%~p"
        if "!PARAM:~0,6!"=="token=" set "INVITE_TOKEN=!PARAM:~6!"
        if "!PARAM:~0,7!"=="invite=" set "INVITE_TOKEN=!PARAM:~7!"
        if "!PARAM:~0,5!"=="path=" set "TARGET_PATH=!PARAM:~5!"
        if "!PARAM:~0,5!"=="exam=" set "EXAM_CODE=!PARAM:~5!"
        if "!PARAM:~0,5!"=="code=" set "EXAM_CODE=!PARAM:~5!"
        if "!PARAM:~0,10!"=="candidate=" set "CANDIDATE_CODE=!PARAM:~10!"
    )
)

if not "!INVITE_TOKEN!"=="" (
    set "INVITE_TOKEN=!INVITE_TOKEN:/=!"
    set "INVITE_TOKEN=!INVITE_TOKEN:\=!"
)
if not "!EXAM_CODE!"=="" (
    set "EXAM_CODE=!EXAM_CODE:/=!"
    set "EXAM_CODE=!EXAM_CODE:\=!"
)

if not "!INVITE_TOKEN!"=="" (
    set "TARGET_URL=!EVALORA_BASE!/exam/join/!INVITE_TOKEN!?lockdown=1"
    if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&code=!EXAM_CODE!"
) else if not "!TARGET_PATH!"=="" (
    set "TARGET_URL=!EVALORA_BASE!!TARGET_PATH!"
    echo !TARGET_PATH! | findstr /i "\?" >nul
    if !ERRORLEVEL! EQU 0 (
        set "TARGET_URL=!TARGET_URL!^&lockdown=1"
    ) else (
        set "TARGET_URL=!TARGET_URL!?lockdown=1"
    )
    if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&code=!EXAM_CODE!"
) else (
    set "TARGET_URL=!EVALORA_BASE!/exam-access?lockdown=1"
    if not "!EXAM_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&code=!EXAM_CODE!"
    if not "!CANDIDATE_CODE!"=="" set "TARGET_URL=!TARGET_URL!^&candidate=!CANDIDATE_CODE!"
)

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="!TARGET_URL!" --kiosk --edge-kiosk-type=fullscreen --disable-pinch --no-first-run
    exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="!TARGET_URL!" --kiosk --edge-kiosk-type=fullscreen --disable-pinch --no-first-run
    exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="!TARGET_URL!" --kiosk --no-first-run
    exit /b 0
)

start "" "!TARGET_URL!"
"@

Set-Content -Path $LauncherPath -Value $LauncherContent -Force

# Register evalora-lockdown:// in HKCU (Current User - No Elevation Needed)
Write-Host "[1/3] Registering evalora-lockdown:// protocol handler in HKCU..." -ForegroundColor Yellow
$RegPath = "HKCU:\Software\Classes\evalora-lockdown"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value "URL:EVALORA Lockdown Protocol" -Force
Set-ItemProperty -Path $RegPath -Name "URL Protocol" -Value "" -Force
New-Item -Path "$RegPath\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$RegPath\shell\open\command" -Name "(Default)" -Value "`"$LauncherPath`" `"%1`"" -Force

# Create Desktop Shortcut
Write-Host "[2/3] Creating Desktop Shortcut..." -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\EVALORA Secure Exam Browser.lnk")
$Shortcut.TargetPath = $LauncherPath
$Shortcut.Description = "EVALORA Secure Exam Browser"
$Shortcut.WorkingDirectory = $TargetDir
$Shortcut.Save()

Write-Host "[3/3] Installation verified successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Setup completed! You can now click 'Launch in Secure Browser' on    " -ForegroundColor White
Write-Host "  your exam check-in page or launch from your desktop.                " -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
