import { audit, requireSuperAdmin } from "@/lib/admin";
import { verifyLiveKitIntegration } from "@/lib/livekit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Super Admin — LiveKit Cloud end-to-end verification endpoint.
 *
 * Tests runtime env var receipt, candidate & supervisor token signing and
 * permission grants, LiveKit Cloud RoomService authentication, browser
 * signaling validation (`/rtc/validate`), and ephemeral room create/list/delete
 * without ever exposing API keys, secrets, or signed JWTs.
 */
export async function POST() {
  const ctx = await requireSuperAdmin();
  const report = await verifyLiveKitIntegration({ testRoomLifecycle: true });

  await audit(ctx, "livekit.verification_run", "platform_settings", "livekit", null, {
    ok: report.ok,
    configured: report.env.configured,
    host: report.env.host,
    missing: report.env.missing,
    checks: {
      env: report.checks.env.ok,
      tokenSigning: report.checks.tokenSigning.ok,
      cloudApiAuth: report.checks.cloudApiAuth.ok,
      candidateSignal: report.checks.candidateSignal.ok,
      supervisorSignal: report.checks.supervisorSignal.ok,
      roomLifecycle: report.checks.roomLifecycle?.ok ?? false,
    },
    latencyMs: report.latencyMs,
  });

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
