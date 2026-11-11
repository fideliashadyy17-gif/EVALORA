import { audit } from "@/lib/admin";
import { can, CREATOR_ROLES, getSessionContext } from "@/lib/auth";
import {
  applyLiveCommand,
  isResultsStage,
  LIVE_COMMANDS,
  parsePresentationStage,
  type CommandSession,
  type LiveCommand,
} from "@/lib/liveControl";
import {
  createNextRoundSession,
  loadControlTiming,
  saveRankingSnapshot,
  stageOf,
} from "@/lib/liveControlServer";
import { isParticipantConnected } from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Commands whose effect depends on the exact question/phase they saw. */
const CAS_COMMANDS = new Set<LiveCommand>(["start", "next", "prev", "end", "show_board", "hide_board", "finish"]);

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Resolve the public screen address to the authoritative session row.
 *
 * A projected screen is addressed by `/live/<id>/screen`, where `<id>` is the
 * competition when the live session belongs to one and the session id only for
 * legacy standalone sessions. The control endpoint must therefore accept both
 * shapes; otherwise a competition-linked screen answers "not found" and the
 * organizer toolbar silently never renders.
 */
async function loadControlSession(admin: AdminClient, id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data: direct } = await admin.from("quiz_sessions").select("*").eq("id", id).maybeSingle();
  if (direct) return direct as Record<string, unknown> & CommandSession & { quiz_id: string; organization_id: string };

  const { data: competition } = await admin
    .from("competitions")
    .select("id, session_id")
    .eq("id", id)
    .maybeSingle();
  const linkedId = (competition as { session_id?: string | null } | null)?.session_id ?? "";
  if (!UUID_RE.test(linkedId)) return null;

  const { data: linked } = await admin.from("quiz_sessions").select("*").eq("id", linkedId).maybeSingle();
  return (linked as Record<string, unknown> & CommandSession & { quiz_id: string; organization_id: string } | null) ?? null;
}

interface ControlParticipant {
  participant_id: string;
  display_name: string;
  avatar_key: string;
  status: string;
  connected: boolean;
  answered: boolean;
  reconnect_count: number;
}

/**
 * Organizer-only participant view: who is in the room, who has dropped off and
 * who has submitted for the question currently on the projector.
 *
 * This lives on the authorized control payload rather than the public screen
 * payload, so an audience watching the token-scoped projection never receives
 * individual submission state.
 */
async function loadControlParticipants(
  admin: AdminClient,
  sessionId: string,
  currentQuestionId: string | null,
): Promise<ControlParticipant[]> {
  const { data: roster } = await admin
    .from("session_participants")
    .select("id, display_name, avatar_key, status, last_seen_at, reconnect_count, joined_at")
    .eq("session_id", sessionId)
    .in("status", ["admitted", "finished", "pending"])
    .order("joined_at", { ascending: true })
    .limit(300);

  const answered = new Set<string>();
  if (currentQuestionId) {
    const { data: rows } = await admin
      .from("participant_answers")
      .select("participant_id")
      .eq("session_id", sessionId)
      .eq("quiz_question_id", currentQuestionId);
    for (const row of rows ?? []) answered.add(String((row as { participant_id: string }).participant_id));
  }

  return (roster ?? []).map((row) => {
    const participant = row as {
      id: string;
      display_name: string;
      avatar_key: string | null;
      status: string;
      last_seen_at: string | null;
      reconnect_count: number | null;
    };
    return {
      participant_id: participant.id,
      display_name: participant.display_name,
      avatar_key: participant.avatar_key ?? "owl",
      status: participant.status === "pending" ? "waiting" : participant.status,
      connected: isParticipantConnected(participant.last_seen_at),
      answered: answered.has(participant.id),
      reconnect_count: participant.reconnect_count ?? 0,
    };
  });
}

interface LoadedSession {
  session: Record<string, unknown> & CommandSession & { quiz_id: string; organization_id: string };
  admin: ReturnType<typeof createAdminClient>;
}

async function authorize(sessionId: string): Promise<
  | { ok: true; loaded: LoadedSession; ctx: NonNullable<Awaited<ReturnType<typeof getSessionContext>>> }
  | { ok: false; status: number; error: string }
> {
  if (!UUID_RE.test(sessionId)) return { ok: false, status: 400, error: "Invalid session." };
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, status: 401, error: "Sign in required." };
  if (ctx.profile.status !== "active") return { ok: false, status: 403, error: "Account is not active." };

  const admin = createAdminClient();
  const session = await loadControlSession(admin, sessionId);
  if (!session) return { ok: false, status: 404, error: "Session not found." };
  // Organizer authorization is decided here, on the server, for every call.
  const isHost = session.host_id === ctx.user.id;
  if (!isHost && !can(ctx, session.organization_id, CREATOR_ROLES)) {
    return { ok: false, status: 403, error: "Organizer access required." };
  }
  return { ok: true, loaded: { session: session as LoadedSession["session"], admin }, ctx };
}

function controlState(session: Record<string, unknown> & CommandSession, questionCount: number) {
  const stage = parsePresentationStage(session.presentation_stage);
  return {
    status: session.status,
    phase: session.phase ?? "waiting",
    current_question_index: Number(session.current_question_index ?? -1),
    question_count: questionCount,
    answer_locked: Boolean(session.answer_locked),
    admission_open: session.admission_open !== false,
    presentation_stage: stage,
    results_revealed: isResultsStage(stage),
    paused: session.status === "paused",
    ended: session.status === "ended",
    mode: session.mode ?? "synchronized",
  };
}

/**
 * Organizer control endpoint for the projected live page.
 *
 * The public display token proves only that a screen may *watch* a session.
 * Commanding it requires an authenticated organizer request (cookie session +
 * creator/host role, or the platform Super Admin) — checked on every call,
 * never inferred from the presence of a button in the browser.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id") ?? "";
  if (!UUID_RE.test(sessionId)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });

  const ctx = await getSessionContext().catch(() => null);
  if (!ctx || ctx.profile.status !== "active") return NextResponse.json({ authorized: false }, { status: 200 });

  const admin = createAdminClient();
  const session = await loadControlSession(admin, sessionId);
  if (!session) return NextResponse.json({ authorized: false }, { status: 200 });
  const isHost = session.host_id === ctx.user.id;
  if (!isHost && !can(ctx, session.organization_id, CREATOR_ROLES)) {
    return NextResponse.json({ authorized: false }, { status: 200 });
  }

  const timing = await loadControlTiming(admin, session.quiz_id);
  const index = Number(session.current_question_index ?? -1);
  const currentQuestionId = index >= 0 && index < timing.rows.length ? timing.rows[index]?.id ?? null : null;
  const participants = await loadControlParticipants(admin, session.id, currentQuestionId);
  return NextResponse.json({
    authorized: true,
    session_id: session.id,
    commands: LIVE_COMMANDS,
    state: controlState(session as LoadedSession["session"], timing.questionCount),
    participants,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { session_id?: string; command?: string }
    | null;
  const sessionId = body?.session_id ?? "";
  const command = (body?.command ?? "") as LiveCommand;
  if (!UUID_RE.test(sessionId)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  if (!LIVE_COMMANDS.includes(command))
    return NextResponse.json({ error: "Unknown organizer command." }, { status: 400 });

  const auth = await authorize(sessionId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { loaded, ctx } = auth;
  const { session, admin } = loaded;

  const timing = await loadControlTiming(admin, session.quiz_id);
  const now = new Date();
  const outcome = applyLiveCommand({
    command,
    session,
    questionCount: timing.questionCount,
    durationFor: timing.durationFor,
    now,
  });
  if (outcome.error) {
    return NextResponse.json({ error: outcome.error, state: controlState(session, timing.questionCount) }, { status: 409 });
  }
  if (outcome.noop && Object.keys(outcome.patch).length === 0) {
    return NextResponse.json({ ok: true, duplicate: true, state: controlState(session, timing.questionCount) });
  }

  let query = admin.from("quiz_sessions").update(outcome.patch).eq("id", session.id);
  if (CAS_COMMANDS.has(command)) {
    query = query
      .eq("current_question_index", session.current_question_index)
      .eq("phase", session.phase ?? "waiting");
  }
  if (command === "finish") {
    query = query.eq("presentation_stage", parsePresentationStage(session.presentation_stage));
  }
  const { data: updated, error: updateError } = await query.select("id").maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: "The organizer command could not be saved." }, { status: 500 });
  }
  if (!updated) {
    // A concurrent command (double click) already applied this transition.
    return NextResponse.json({ ok: true, duplicate: true, state: controlState(session, timing.questionCount) });
  }

  if (outcome.snapshotIndex !== null) {
    const final = Boolean(outcome.closedQuestion?.final);
    await saveRankingSnapshot(admin, {
      sessionId: session.id,
      organizationId: session.organization_id,
      questionIndex: outcome.snapshotIndex,
      quizQuestionId: timing.rows[outcome.snapshotIndex]?.id ?? null,
      isFinal: final,
      // The official final standing is recalculated from authoritative scores
      // so a prior scoring correction is reflected before the reveal.
      recompute: final || command === "show_board",
    });
  }
  if (command === "reveal_results") {
    await saveRankingSnapshot(admin, {
      sessionId: session.id,
      organizationId: session.organization_id,
      questionIndex: Math.max(0, timing.questionCount - 1),
      quizQuestionId: timing.rows[Math.max(0, timing.questionCount - 1)]?.id ?? null,
      isFinal: true,
      recompute: true,
    });
  }

  let nextSession: { session_id: string; join_code: string } | null = null;
  if (outcome.createNextSession) {
    const created = await createNextRoundSession(admin, session);
    if (created.ok) {
      const { data: row } = await admin.from("quiz_sessions").select("join_code").eq("id", created.sessionId).maybeSingle();
      nextSession = { session_id: created.sessionId, join_code: row?.join_code ?? "" };
    }
  }

  await audit(ctx, `live.command.${command}`, "quiz_sessions", session.id, session.organization_id, {
    command,
    from_phase: session.phase ?? null,
    from_index: session.current_question_index,
    stage: parsePresentationStage(session.presentation_stage),
    ...(outcome.closedQuestion ? { closed_index: outcome.closedQuestion.index } : {}),
    ...(nextSession ? { next_session_id: nextSession.session_id } : {}),
  }).catch(() => undefined);

  const { data: fresh } = await admin.from("quiz_sessions").select("*").eq("id", session.id).maybeSingle();
  const current = (fresh ?? session) as LoadedSession["session"];
  const freshIndex = Number(current.current_question_index ?? -1);
  const freshQuestionId = freshIndex >= 0 && freshIndex < timing.rows.length ? timing.rows[freshIndex]?.id ?? null : null;
  return NextResponse.json({
    ok: true,
    duplicate: false,
    session_id: session.id,
    state: controlState(current, timing.questionCount),
    stage: stageOf(current as CommandSession),
    participants: await loadControlParticipants(admin, session.id, freshQuestionId),
    next_session: nextSession,
  });
}
