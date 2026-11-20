import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  try {
    const ps1Path = path.join(process.cwd(), "public", "downloads", "EVALORA-Lockdown-Launcher.ps1");
    if (fs.existsSync(ps1Path)) {
      const content = fs.readFileSync(ps1Path, "utf-8");
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  } catch (e) {
    console.error("Failed to read lockdown install script:", e);
  }

  // Fallback inline script
  const fallback = `$TargetDir = "$env:LOCALAPPDATA\\EVALORA-Lockdown"
if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null }
$LauncherPath = "$TargetDir\\evalora-launcher.cmd"
Set-Content -Path $LauncherPath -Value '@echo off\`nstart "" "https://evalora-six.vercel.app/exam-access"' -Force
$RegPath = "HKCU:\\Software\\Classes\\evalora-lockdown"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value "URL:EVALORA Lockdown Protocol" -Force
Set-ItemProperty -Path $RegPath -Name "URL Protocol" -Value "" -Force
New-Item -Path "$RegPath\\shell\\open\\command" -Force | Out-Null
Set-ItemProperty -Path "$RegPath\\shell\\open\\command" -Name "(Default)" -Value "\`"$LauncherPath\`" \`"%1\`"" -Force
Write-Host "EVALORA Secure Browser registered successfully!" -ForegroundColor Green`;

  return new NextResponse(fallback, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
