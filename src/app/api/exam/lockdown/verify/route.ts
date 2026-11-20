import { verifyLockdownAttestation } from "@/lib/lockdown";
import { NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  exam_code: z.string().min(4).max(32),
  candidate_code: z.string().optional(),
  timestamp: z.number(),
  platform: z.string(),
  app_version: z.string(),
  signature: z.string(),
  nonce: z.string().optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lockdown verification payload." }, { status: 400 });
  }

  const result = verifyLockdownAttestation(parsed.data, parsed.data.exam_code);
  if (!result.verified) {
    return NextResponse.json({ error: result.reason ?? "Lockdown environment verification failed." }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    verified: true,
    platform: result.platform,
    app_version: result.app_version,
  });
}
