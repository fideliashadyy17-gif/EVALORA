import { activeOrg, can, PROCTOR_ROLES, getSessionContext } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlements";
import { isFeatureEnabled } from "@/lib/platform";
import { loadAttemptContext } from "@/lib/exam";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  exam_id: z.string().uuid(),
  // Candidate flow:
  attempt_id: z.string().uuid().optional(),
  token: z.string().uuid().optional(),
  // Supervisor flow uses the authenticated session instead.
  role: z.enum(["candidate", "supervisor"]),
});

/**
 * Server-generated LiveKit access tokens. The API secret never leaves
 * the server. Candidates may publish camera/mic/screen to THEIR exam
 * room only, while their attempt is in progress. Supervisors (org
 * members with proctor roles) may subscribe but not publish.
 */
export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !serverUrl)
    return NextResponse.json({ error: "Video proctoring is not configured on this deployment." }, { status: 503 });

  if (!(await isFeatureEnabled("proctoring")))
    return NextResponse.json({ error: "Video proctoring is temporarily disabled platform-wide by the administrator." }, { status: 503 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { exam_id, attempt_id, token, role } = parsed.data;

  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams").select("*").eq("id", exam_id).maybeSingle();
  if (!exam) return NextResponse.json({ error: "Examination not found." }, { status: 404 });
  if (!Boolean((exam.settings as Record<string, unknown>)?.proctoring))
    return NextResponse.json({ error: "Proctoring is not enabled for this examination." }, { status: 403 });

  const roomName = `exam-${exam.id}`;
  let identity: string;
  let name: string;
  let canPublish: boolean;

  if (role === "candidate") {
    if (!attempt_id || !token) return NextResponse.json({ error: "Missing candidate credentials." }, { status: 400 });
    const ctx = await loadAttemptContext(admin, attempt_id, token);
    if (!ctx || ctx.attempt.exam_id !== exam.id)
      return NextResponse.json({ error: "Not authorized for this room." }, { status: 403 });
    if (ctx.attempt.status !== "in_progress")
      return NextResponse.json({ error: "Your attempt is not in progress." }, { status: 403 });
    identity = `candidate-${ctx.candidate.id}`;
    name = ctx.candidate.full_name;
    canPublish = true;

    // Proctoring is a Premium entitlement — enforce server-side.
    const supabase = await createClient();
    const ent = await getEntitlement(admin, exam.organization_id).catch(async () =>
      getEntitlement(supabase, exam.organization_id),
    );
    if (!ent.limits.proctoring)
      return NextResponse.json({ error: "The organization's plan does not include proctoring." }, { status: 403 });
  } else {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const org = activeOrg(ctx);
    if (!org || org.id !== exam.organization_id || !can(ctx, exam.organization_id, PROCTOR_ROLES))
      return NextResponse.json({ error: "Not authorized to supervise this examination." }, { status: 403 });
    identity = `supervisor-${ctx.user.id}`;
    name = ctx.profile.full_name || ctx.profile.email;
    canPublish = false;

    const supabase = await createClient();
    const ent = await getEntitlement(supabase, exam.organization_id);
    if (!ent.limits.proctoring)
      return NextResponse.json({ error: "The organization's plan does not include proctoring." }, { status: 403 });
  }

  const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: "6h" });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: false,
  });
  const jwt = await at.toJwt();

  return NextResponse.json({ token: jwt, serverUrl, roomName, identity, canPublish });
}
