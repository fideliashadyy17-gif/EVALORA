import { computeLockdownSignature, generateLockdownChallenge } from "@/lib/lockdown";
import { NextResponse } from "next/server";

function isAuthorizedClient(request: Request): boolean {
  const userAgent = request.headers.get("user-agent") || "";
  const isSecureBrowserUserAgent = userAgent.includes("EVALORA-Secure-Browser");
  const secureHeader = request.headers.get("x-evalora-secure-browser") === "1";
  return isSecureBrowserUserAgent || secureHeader;
}

export async function GET(request: Request) {
  if (!isAuthorizedClient(request)) {
    return NextResponse.json(
      { error: "Attestation challenge is only available to the EVALORA Secure Exam Application." },
      { status: 403 },
    );
  }
  const url = new URL(request.url);
  const examCode = (url.searchParams.get("code") || url.searchParams.get("exam") || "EVALORA").trim().toUpperCase();
  const rawPlatform = (url.searchParams.get("platform") || "win32").toLowerCase();
  const platform = ["win32", "darwin", "linux"].includes(rawPlatform) ? rawPlatform : "win32";
  const nonce = generateLockdownChallenge();
  const timestamp = Date.now();
  const signature = computeLockdownSignature(timestamp, examCode, platform, "1.0.0", nonce);

  return NextResponse.json({
    timestamp,
    exam_code: examCode,
    platform,
    app_version: "1.0.0",
    signature,
    nonce,
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedClient(request)) {
    return NextResponse.json(
      { error: "Attestation challenge is only available to the EVALORA Secure Exam Application." },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const examCode = (typeof body?.exam_code === "string" ? body.exam_code : "EVALORA").trim().toUpperCase();
  const rawPlatform = typeof body?.platform === "string" ? body.platform.toLowerCase() : "win32";
  const platform = ["win32", "darwin", "linux"].includes(rawPlatform) ? rawPlatform : "win32";
  const nonce = generateLockdownChallenge();
  const timestamp = Date.now();
  const signature = computeLockdownSignature(timestamp, examCode, platform, "1.0.0", nonce);

  return NextResponse.json({
    timestamp,
    exam_code: examCode,
    platform,
    app_version: "1.0.0",
    signature,
    nonce,
  });
}
