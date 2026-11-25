import { verifyLiveKitIntegration, type LiveKitVerificationReport } from "@/lib/livekit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROBE_CACHE_TTL_MS = 15_000;
let cachedLiveKitProbe: { at: number; report: LiveKitVerificationReport } | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const probeLiveKit = url.searchParams.get("probe") === "livekit";

  if (!probeLiveKit) {
    return NextResponse.json(
      {
        ok: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  // Strictly read-only, non-mutating LiveKit Cloud verification (zero secrets,
  // zero JWTs returned) with a 15-second cooldown to prevent outbound probe abuse.
  const now = Date.now();
  let report: LiveKitVerificationReport;
  if (cachedLiveKitProbe && now - cachedLiveKitProbe.at < PROBE_CACHE_TTL_MS) {
    report = cachedLiveKitProbe.report;
  } else {
    report = await verifyLiveKitIntegration({ testRoomLifecycle: false });
    cachedLiveKitProbe = { at: now, report };
  }

  return NextResponse.json(
    {
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      livekit: {
        ok: report.ok,
        configured: report.env.configured,
        present: report.env.present,
        missing: report.env.missing,
        urlValid: report.env.urlValid,
        host: report.env.host,
        checkedAt: report.checkedAt,
        latencyMs: report.latencyMs,
        checks: {
          env: report.checks.env,
          tokenSigning: report.checks.tokenSigning,
          cloudApiAuth: report.checks.cloudApiAuth,
          candidateSignal: report.checks.candidateSignal,
          supervisorSignal: report.checks.supervisorSignal,
        },
        supabaseProctoringIndependent: true,
      },
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
