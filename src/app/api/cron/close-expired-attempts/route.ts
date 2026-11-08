import { cronAuthorized, sweepExpiredAttempts } from "@/lib/expiredAttempts";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Scheduled sweep: closes examination attempts whose server deadline has passed and that the
 * candidate never closed. Called every few minutes by the GitHub Actions workflow
 * `.github/workflows/close-expired-attempts.yml` with `Authorization: Bearer <CRON_SECRET>`.
 *
 * Fails closed: without a configured secret of at least 32 characters, or with a wrong bearer
 * token, nothing runs. Responses are never cached and contain attempt identifiers only (never
 * tokens, answers or candidate names).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Vercel cron jobs call the route with GET and the bearer secret; the GitHub workflow uses POST.
 * Both run the same authorised sweep.
 */
export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) {
    return NextResponse.json({ error: "Scheduler is not configured." }, { status: 503, headers: NO_STORE });
  }
  if (!cronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }
  try {
    const result = await sweepExpiredAttempts(createAdminClient());
    return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), ...result }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Sweep failed." }, { status: 500, headers: NO_STORE });
  }
}
