import { computeLockdownSignature, generateLockdownChallenge } from "@/lib/lockdown";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
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
