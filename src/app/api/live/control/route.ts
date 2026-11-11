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
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Commands whose effect depends on the exact question/phase they saw. */
const CAS_COMMANDS = new Set<LiveCommand>(["start", "next", "prev", "end", "show_board", "hide_board", "finish"]);

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
  const { data: session } = await admin.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
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
  const { data: session } = await admin.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) return NextResponse.json({ authorized: false }, { status: 200 });
  const isHost = session.host_id === ctx.user.id;
  if (!isHost && !can(ctx, session.organization_id, CREATOR_ROLES)) {
    return NextResponse.json({ authorized: false }, { status: 200 });
  }

  const timing = await loadControlTiming(admin, session.quiz_id);
  return NextResponse.json({
    authorized: true,
    session_id: session.id,
    commands: LIVE_COMMANDS,
    state: controlState(session as LoadedSession["session"], timing.questionCount),
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
  return NextResponse.json({
    ok: true,
    duplicate: false,
    state: controlState((fresh ?? session) as LoadedSession["session"], timing.questionCount),
    stage: stageOf((fresh ?? session) as CommandSession),
    next_session: nextSession,
  });
}
