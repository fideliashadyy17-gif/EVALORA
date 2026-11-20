import { generateLockdownChallenge } from "@/lib/lockdown";
import { NextResponse } from "next/server";

export async function GET() {
  const nonce = generateLockdownChallenge();
  const timestamp = Date.now();
  return NextResponse.json({ nonce, timestamp });
}
