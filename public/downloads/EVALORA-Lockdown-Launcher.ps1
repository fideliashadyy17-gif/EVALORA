$ErrorActionPreference = 'Stop'
$Version = '1.1.0'
$Artifact = "EVALORA-Secure-Browser-$Version-Setup.exe"
$ReleaseUrl = "https://github.com/fideliashadyy17-gif/EVALORA/releases/latest/download/$Artifact"
$Installer = Join-Path $env:TEMP $Artifact
$ChecksumFile = "$Installer.sha256"
Write-Host "Downloading EVALORA Secure Exam Browser $Version..." -ForegroundColor Cyan
try {
  Invoke-WebRequest -Uri $ReleaseUrl -OutFile $Installer -UseBasicParsing
  Invoke-WebRequest -Uri "$ReleaseUrl.sha256" -OutFile $ChecksumFile -UseBasicParsing
  if (-not (Test-Path $Installer) -or (Get-Item $Installer).Length -lt 20MB) {
    throw 'The download was not a complete Windows installer.'
  }
  $Expected = ((Get-Content -Raw $ChecksumFile).Trim() -split '\s+')[0].ToLowerInvariant()
  $Actual = (Get-FileHash $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) { throw 'Installer SHA-256 verification failed; refusing to execute the file.' }
  Write-Host 'SHA-256 verified. Starting the official Windows installer. Follow the setup prompts.' -ForegroundColor Green
  $Process = Start-Process -FilePath $Installer -Wait -PassThru
  exit $Process.ExitCode
} catch {
  Write-Error "EVALORA Secure Browser installation failed: $_"
  Write-Host 'Download the installer from https://evalora-six.vercel.app/download/secure-browser' -ForegroundColor Yellow
  exit 1
} finally {
  if (Test-Path $Installer) { Remove-Item $Installer -Force -ErrorAction SilentlyContinue }
  if (Test-Path $ChecksumFile) { Remove-Item $ChecksumFile -Force -ErrorAction SilentlyContinue }
}
