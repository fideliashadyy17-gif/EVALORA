import { AVATAR_KEYS } from "@/lib/avatars";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  code: z.string().min(4).max(12),
  display_name: z.string().min(1).max(60),
  participant_ref: z.string().max(60).optional(),
  qualification_token: z.string().max(100).optional(),
  avatar_key: z.enum(AVATAR_KEYS).optional().default("owl"),
});

type Admin = ReturnType<typeof createAdminClient>;

interface JoinTarget {
  session: {
    id: string;
    status: string;
    title: string | null;
    settings: Record<string, unknown> | null;
    admission_open?: boolean | null;
    require_approval?: boolean | null;
  };
  competition?: {
    id: string;
    title: string;
  };
  accessCodeId?: string;
  restrictionOrgId?: string | null;
  restrictionClassId?: string | null;
}

/**
 * Resolve a public code to a live session. Two code kinds share one
 * namespace: session join codes and competition access codes.
 * Competition codes are validated for activation, expiry, usage caps
 * and registration windows — and never expose rosters or settings.
 */
async function resolveCode(
  admin: Admin,
  code: string,
): Promise<{ target: JoinTarget } | { error: string; status: number }> {
  const { data: session } = await admin
    .from("quiz_sessions")
    .select("id, status, title, settings, admission_open, require_approval")
    .eq("join_code", code)
    .maybeSingle();
  if (session) {
    const { data: comp } = await admin
      .from("competitions")
      .select("id, title")
      .eq("session_id", session.id)
      .maybeSingle();
    return { target: { session, competition: comp ?? undefined } };
  }

  const { data: access } = await admin
    .from("competition_access_codes")
    .select(
      "id, is_active, expires_at, max_uses, organization_id, class_id, competitions(id, title, status, session_id, registration_opens_at, registration_closes_at)",
    )
    .eq("code", code)
    .maybeSingle();
  if (!access) return { error: "We couldn't find a session with that code.", status: 404 };

  const comp = access.competitions as unknown as {
    id: string;
    title: string;
    status: string;
    session_id: string | null;
    registration_opens_at: string | null;
    registration_closes_at: string | null;
  } | null;
  if (!access.is_active || !comp)
    return { error: "This access code is no longer active.", status: 403 };
  if (access.expires_at && new Date(access.expires_at) < new Date())
    return { error: "This access code has expired.", status: 403 };
  if (["draft", "cancelled", "archived"].includes(comp.status))
    return { error: "This competition is not open for joining.", status: 403 };
  const now = new Date();
  if (comp.registration_opens_at && new Date(comp.registration_opens_at) > now)
    return { error: "Registration for this competition has not opened yet.", status: 403 };
  if (comp.registration_closes_at && new Date(comp.registration_closes_at) < now && comp.status !== "live")
    return { error: "Registration for this competition has closed.", status: 403 };
  if (access.max_uses != null) {
    const { count } = await admin
      .from("competition_registrations")
      .select("id", { count: "exact", head: true })
      .eq("access_code_id", access.id)
      .neq("status", "removed");
    if ((count ?? 0) >= access.max_uses)
      return { error: "This access code has reached its maximum number of uses.", status: 403 };
  }
  if (!comp.session_id)
    return { error: "This competition has not started yet. Please check back when it goes live.", status: 409 };

  const { data: compSession } = await admin
    .from("quiz_sessions")
    .select("id, status, title, settings, admission_open, require_approval")
    .eq("id", comp.session_id)
    .maybeSingle();
  if (!compSession) return { error: "This competition session is unavailable.", status: 409 };

  return {
    target: {
      session: compSession,
      competition: { id: comp.id, title: comp.title },
      accessCodeId: access.id,
      restrictionOrgId: access.organization_id,
      restrictionClassId: access.class_id,
    },
  };
}

/** Guest join for a live quiz / competition. Identity = access token. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { code, display_name, participant_ref, qualification_token, avatar_key } = parsed.data;

  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const authUserId = auth.user?.id ?? null;
  const resolved = await resolveCode(admin, code.trim().toUpperCase());
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { session, competition, accessCodeId, restrictionOrgId, restrictionClassId } = resolved.target;

  if (session.status === "ended")
    return NextResponse.json({ error: "This session has already ended." }, { status: 410 });
  if (session.admission_open === false)
    return NextResponse.json(
      { error: "Admission is closed for this competition. Ask the organizer to reopen it." },
      { status: 403 },
    );

  const participantStatus = session.require_approval ? "pending" : "admitted";
  const maxP = Number((session.settings as Record<string, unknown> | null)?.max_participants ?? 200);
  const { count } = await admin
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .not("status", "in", '("rejected","blocked")');
  if ((count ?? 0) >= maxP)
    return NextResponse.json({ error: "This session is full." }, { status: 403 });

  // Server-side phase admission. Hidden UI, localStorage, URL or Realtime
  // channel manipulation cannot substitute for an approved qualification.
  let tokenHash: string | null = null;
  if (competition?.id) {
    const { data: verdict, error: admissionError } = await admin.rpc("verify_phase_admission", {
      p_competition_id: competition.id,
      p_token: qualification_token?.trim() ?? null,
      p_user_id: authUserId,
      p_participant_ref: participant_ref ?? null,
      p_student_id: null,
    });
    const admission = (verdict ?? null) as { allowed?: boolean; reason?: string } | null;
    if (admissionError || !admission?.allowed)
      return NextResponse.json({ error: admission?.reason ?? "Admission is restricted to approved, qualified candidates." }, { status: 403 });
    if (qualification_token?.trim())
      tokenHash = createHash("sha256").update(qualification_token.trim(), "utf8").digest("hex");
  }

  const { data: participant, error } = await admin
    .from("session_participants")
    .insert({
      session_id: session.id,
      display_name,
      participant_ref: participant_ref || null,
      user_id: authUserId,
      qualification_token_hash: tokenHash,
      avatar_key,
      status: participantStatus,
    })
    .select("id, access_token, avatar_key, status")
    .single();
  if (error || !participant)
    return NextResponse.json({ error: "Could not join the session." }, { status: 500 });

  // Record the competition registration (code usage accounting +
  // complete participant registry for organizers).
  if (competition) {
    await admin.from("competition_registrations").insert({
      competition_id: competition.id,
      access_code_id: accessCodeId ?? null,
      participant_id: participant.id,
      organization_id: restrictionOrgId ?? null,
      class_id: restrictionClassId ?? null,
      full_name: display_name,
      participant_ref: participant_ref || null,
      status: participantStatus === "pending" ? "registered" : "admitted",
      source: "code_join",
    });
  }

  return NextResponse.json({
    participant_id: participant.id,
    access_token: participant.access_token,
    session_id: session.id,
    title: competition?.title ?? session.title,
    avatar_key: participant.avatar_key,
    status: participant.status,
    requires_approval: participant.status === "pending",
  });
}
