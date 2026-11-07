import { can, CREATOR_ROLES, getSessionContext } from "@/lib/auth";
import {
  answerReveal,
  effectivePhase,
  isParticipantConnected,
  loadQuizQuestions,
  questionDeadlineAt,
  questionDurationSeconds,
  rankedParticipants,
} from "@/lib/live";
import { publicScreenPath } from "@/lib/liveDisplayToken";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Organizer-only live state. Authentication and creator/host role are
 * verified on the server; service-role reads happen only after that
 * check and are scoped to this one session. Participant access tokens
 * and individual answer payloads are not returned — only operational
 * aggregates needed by the host console.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id") ?? "";
  if (!UUID_RE.test(sessionId)) return NextResponse.json({ error: "Invalid session." }, { status: 400 });

  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (ctx.profile.status !== "active") return NextResponse.json({ error: "Account is not active." }, { status: 403 });

  const admin = createAdminClient();
  const { data: session } = await admin.from("quiz_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (!can(ctx, session.organization_id, CREATOR_ROLES)) {
    return NextResponse.json({ error: "Organizer access required." }, { status: 403 });
  }

  const [{ data: competition }, { data: quiz }, rows, { data: rawParticipants }, { data: answers }, { data: integrityIncidents }] =
    await Promise.all([
      admin
        .from("competitions")
        .select("id, title, status, instructions")
        .eq("session_id", session.id)
        .maybeSingle(),
      admin.from("quizzes").select("title, settings").eq("id", session.quiz_id).maybeSingle(),
      loadQuizQuestions(admin, session.quiz_id),
      admin
        .from("session_participants")
        .select(
          "id, display_name, participant_ref, avatar_key, score, status, current_index, joined_at, last_seen_at, reconnect_count, last_disconnected_at",
        )
        .eq("session_id", session.id)
        .limit(5000),
      admin
        .from("participant_answers")
        .select("participant_id, quiz_question_id, response_ms, submitted_at")
        .eq("session_id", session.id)
        .order("submitted_at", { ascending: true })
        .limit(50000),
      admin
        .from("proctoring_incidents")
        .select("participant_id, type, status, created_at")
        .eq("session_id", session.id)
        .like("type", "integrity_%")
        .order("created_at", { ascending: false })
        .limit(50000),
    ]);

  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const index = session.current_question_index;
  const currentRow = session.mode === "synchronized" && index >= 0 && index < rows.length ? rows[index] : null;
  const now = new Date();
  const phase = effectivePhase(session, currentRow, quizSettings, now);
  const deadline = questionDeadlineAt(session, currentRow, quizSettings);

  const currentAnswers = currentRow ? (answers ?? []).filter((a) => a.quiz_question_id === currentRow.id) : [];
  const currentAnsweredIds = new Set(currentAnswers.map((a) => a.participant_id));

  const optionDistribution: Record<string, number> = {};
  if (currentRow) {
    const { data: payloadRows } = await admin
      .from("participant_answers")
      .select("answer")
      .eq("session_id", session.id)
      .eq("quiz_question_id", currentRow.id)
      .limit(10000);
    for (const row of payloadRows ?? []) {
      const answer = (row.answer ?? {}) as Record<string, unknown>;
      const ids = [
        ...(typeof answer.option_id === "string" ? [answer.option_id] : []),
        ...(Array.isArray(answer.option_ids) ? answer.option_ids.filter((x): x is string => typeof x === "string") : []),
      ];
      for (const id of ids) optionDistribution[id] = (optionDistribution[id] ?? 0) + 1;
    }
  }

  const byParticipant = new Map<
    string,
    { count: number; totalMs: number; timedCount: number; lastMs: number | null; lastAt: string | null }
  >();
  for (const a of answers ?? []) {
    const entry = byParticipant.get(a.participant_id) ?? {
      count: 0,
      totalMs: 0,
      timedCount: 0,
      lastMs: null,
      lastAt: null,
    };
    entry.count += 1;
    if (a.response_ms != null) {
      entry.totalMs += Math.max(0, a.response_ms);
      entry.timedCount += 1;
      entry.lastMs = a.response_ms;
    }
    entry.lastAt = a.submitted_at;
    byParticipant.set(a.participant_id, entry);
  }

  const integrityByParticipant = new Map<string, { incidents: number; open: number; latest_type: string | null; latest_at: string | null }>();
  for (const row of integrityIncidents ?? []) {
    if (!row.participant_id) continue;
    const current = integrityByParticipant.get(row.participant_id) ?? { incidents: 0, open: 0, latest_type: null, latest_at: null };
    // Rows arrive newest first; returns/reconnections are informational and
    // do not inflate the participant's violation count.
    if (!["integrity_tab_visible", "integrity_focus_back", "integrity_online"].includes(row.type)) {
      current.incidents += 1;
      if (["open", "investigating"].includes(row.status)) current.open += 1;
    }
    current.latest_type ??= row.type;
    current.latest_at ??= row.created_at;
    integrityByParticipant.set(row.participant_id, current);
  }

  const participants = rankedParticipants(rawParticipants ?? [], answers ?? []).map((p) => {
    const stats = byParticipant.get(p.id);
    return {
      id: p.id,
      display_name: p.display_name,
      participant_ref: p.participant_ref,
      avatar_key: p.avatar_key ?? "owl",
      score: Number(p.score),
      status: p.status === "joined" ? "pending" : p.status,
      current_index: p.current_index,
      joined_at: p.joined_at,
      last_seen_at: p.last_seen_at,
      reconnect_count: Number(p.reconnect_count ?? 0),
      last_disconnected_at: p.last_disconnected_at,
      connected: isParticipantConnected(p.last_seen_at, now.getTime()),
      answered_current: currentAnsweredIds.has(p.id),
      answers_count: stats?.count ?? 0,
      average_response_ms: stats?.timedCount ? Math.round(stats.totalMs / stats.timedCount) : null,
      last_response_ms: stats?.lastMs ?? null,
      last_submitted_at: stats?.lastAt ?? null,
      integrity: integrityByParticipant.get(p.id) ?? { incidents: 0, open: 0, latest_type: null, latest_at: null },
    };
  });

  const active = participants.filter((p) => ["admitted", "finished"].includes(p.status));
  const pending = participants.filter((p) => p.status === "pending");
  const joined = participants.filter((p) => !["rejected", "blocked"].includes(p.status));
  const connected = active.filter((p) => p.connected);

  let registeredTotal = joined.length;
  if (competition) {
    const { count } = await admin
      .from("competition_registrations")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", competition.id)
      .neq("status", "removed");
    registeredTotal = count ?? registeredTotal;
  }

  return NextResponse.json({
    server_now: now.toISOString(),
    session: {
      id: session.id,
      quiz_id: session.quiz_id,
      organization_id: session.organization_id,
      join_code: session.join_code,
      title: competition?.title ?? session.title ?? quiz?.title,
      mode: session.mode,
      status: session.status,
      stored_phase: session.phase,
      phase,
      phase_started_at: session.phase_started_at,
      current_question_index: session.current_question_index,
      question_started_at: session.question_started_at,
      question_deadline_at: deadline,
      admission_open: session.admission_open !== false,
      require_approval: Boolean(session.require_approval),
      display_token_version: Number(session.display_token_version ?? 1),
      settings: session.settings ?? {},
      created_at: session.created_at,
      ended_at: session.ended_at,
    },
    competition,
    public_screen_path: publicScreenPath(
      competition?.id ?? session.id,
      session.id,
      Number(session.display_token_version ?? 1),
    ),
    progress: {
      index,
      total: rows.length,
      remaining_after_current: Math.max(0, rows.length - Math.max(index, 0) - 1),
      percent: rows.length ? Math.round((Math.max(0, index + (session.status === "ended" ? 1 : 0)) / rows.length) * 100) : 0,
    },
    current_question: currentRow
      ? {
          quiz_question_id: currentRow.id,
          type: currentRow.questions.type,
          time_limit_seconds: questionDurationSeconds(currentRow, quizSettings),
          correct_summary: answerReveal(currentRow).summary,
          correct_option_ids: answerReveal(currentRow).correct_option_ids,
          options: currentRow.questions.question_options.map((o) => ({
            id: o.id,
            label: o.label,
            content_doc: o.content_doc ?? null,
          })),
          option_distribution: optionDistribution,
        }
      : null,
    counts: {
      registered: registeredTotal,
      joined: joined.length,
      active: active.length,
      pending: pending.length,
      connected: connected.length,
      disconnected: Math.max(0, active.length - connected.length),
      finished: participants.filter((p) => p.status === "finished").length,
      answered_current: currentAnsweredIds.size,
      not_answered_current: Math.max(0, active.length - currentAnsweredIds.size),
    },
    participants,
  });
}
