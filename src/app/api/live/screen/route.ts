import {
  effectivePhase,
  isParticipantConnected,
  loadQuizQuestions,
  parseLiveSettings,
  publicQuestion,
  questionDeadlineAt,
  questionDurationSeconds,
  rankedParticipants,
  revealedQuestion,
} from "@/lib/live";
import { isResultsStage, parsePresentationStage, revealedPlaces } from "@/lib/liveControl";
import { loadRankingView } from "@/lib/liveControlServer";
import { historyPoints, revealedPodium, withMovement, type RankingRow } from "@/lib/liveRanking";
import { publicScreenPath, verifyDisplayToken } from "@/lib/liveDisplayToken";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Public projection-screen state.
 *
 * A competition/session ID alone grants nothing. The caller must also
 * present the organizer-issued signed display token for that exact
 * session and token version. Responses are constructed field-by-field:
 * no organizer settings, participant tokens, individual answers, or an
 * answer key outside the authorized answer-reveal phase can leak here.
 *
 * The final standings obey the organizer's reveal sequence: the public
 * payload only ever contains the places already revealed on screen, so the
 * champion cannot be read from the network before the reveal reaches them.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const publicId = searchParams.get("id") ?? "";
  const token = searchParams.get("token");
  if (!UUID_RE.test(publicId) || !token) {
    return NextResponse.json(
      { error: "A secure organizer-issued screen link is required." },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  let { data: session } = await admin.from("quiz_sessions").select("*").eq("id", publicId).maybeSingle();
  let competition: { id: string; title: string; instructions: string | null } | null = null;

  if (!session) {
    const { data: comp } = await admin
      .from("competitions")
      .select("id, title, instructions, session_id")
      .eq("id", publicId)
      .maybeSingle();
    if (!comp?.session_id) return NextResponse.json({ error: "Screen not found." }, { status: 404 });
    competition = { id: comp.id, title: comp.title, instructions: comp.instructions };
    const res = await admin.from("quiz_sessions").select("*").eq("id", comp.session_id).maybeSingle();
    session = res.data;
  } else {
    const { data: comp } = await admin
      .from("competitions")
      .select("id, title, instructions")
      .eq("session_id", session.id)
      .maybeSingle();
    if (comp) competition = comp;
  }

  if (!session) return NextResponse.json({ error: "Screen not found." }, { status: 404 });
  if (!verifyDisplayToken(token, session.id, Number(session.display_token_version ?? 1))) {
    return NextResponse.json(
      { error: "This screen link is invalid, expired or has been revoked." },
      { status: 401 },
    );
  }

  const liveSettings = parseLiveSettings(session.settings);
  if (!liveSettings.projector_enabled) {
    return NextResponse.json(
      { error: "The organizer has disabled the public screen for this session." },
      { status: 403 },
    );
  }

  const [{ data: quiz }, { data: organization }] = await Promise.all([
    admin.from("quizzes").select("settings, title").eq("id", session.quiz_id).single(),
    admin.from("organizations").select("name, logo_url").eq("id", session.organization_id).maybeSingle(),
  ]);
  const quizSettings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const rows = await loadQuizQuestions(admin, session.quiz_id);

  const idx = session.current_question_index;
  const currentRow = session.mode === "synchronized" && idx >= 0 && idx < rows.length ? rows[idx] : null;
  const now = new Date();
  const phase = effectivePhase(session, currentRow, quizSettings, now);
  const deadline = questionDeadlineAt(session, currentRow, quizSettings);
  const stage = parsePresentationStage(session.presentation_stage);

  const [{ data: roster }, { count: joined }] = await Promise.all([
    admin
      .from("session_participants")
      .select("display_name, avatar_key, status, last_seen_at, joined_at")
      .eq("session_id", session.id)
      .in("status", ["admitted", "finished", "pending"])
      .order("joined_at", { ascending: true })
      .limit(300),
    admin
      .from("session_participants")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .in("status", ["admitted", "finished"]),
  ]);

  let answeredCurrent = 0;
  if (currentRow) {
    const { count } = await admin
      .from("participant_answers")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("quiz_question_id", currentRow.id);
    answeredCurrent = count ?? 0;
  }

  // ── Ranking evolution ────────────────────────────────────────────────
  const rankingView = await loadRankingView(admin, session.id, stage);
  const movementRows = withMovement(rankingView.current?.entries ?? [], rankingView.previous);
  const places = revealedPlaces(stage);
  const history = rankingView.history.length
    ? rankingView.history
    : historyPoints([]);

  let ranking: {
    question_index: number;
    is_final: boolean;
    rows: RankingRow[];
    hidden: number;
    answered_count: number;
    participant_count: number;
  } | null = null;
  if (rankingView.current) {
    const isFinal = rankingView.current.is_final;
    const visible = isFinal
      ? Number.isFinite(places)
        ? movementRows.slice(0, Math.max(0, places))
        : movementRows
      : movementRows;
    ranking = {
      question_index: rankingView.current.question_index,
      is_final: isFinal,
      rows: isFinal ? visible : visible.slice(0, 10),
      hidden: Math.max(0, (rankingView.current.entries.length ?? 0) - visible.length),
      answered_count: rankingView.current.answered_count,
      participant_count: rankingView.current.participant_count,
    };
  }

  // Compact strip for the running question: top three and their movement,
  // never the full standings of a final question before the reveal.
  const strip =
    liveSettings.show_leaderboard && ["question", "countdown", "time_expired", "answer_reveal"].includes(phase)
      ? movementRows.slice(0, 3)
      : [];

  let final: {
    stage: string;
    places: number;
    podium: RankingRow[];
    full: RankingRow[] | null;
    participant_count: number;
    history: typeof history;
  } | null = null;
  if (isResultsStage(stage)) {
    const podium = revealedPodium(movementRows, stage);
    final = {
      stage,
      places: podium.length,
      podium,
      full: stage === "board" ? movementRows : null,
      participant_count: rankingView.current?.participant_count ?? joined ?? 0,
      history,
    };
  }

  // Legacy field kept for older screens; now reveal-gated so it can never
  // announce the champion before the organizer does.
  let leaderboard: { display_name: string; avatar_key: string; score: number }[] | null = null;
  if (phase === "leaderboard" || stage === "board") {
    const source = movementRows.length
      ? movementRows
      : await loadLiveRankingRows(admin, session.id);
    leaderboard = source
      .slice(0, 10)
      .map((p) => ({ display_name: p.display_name, avatar_key: p.avatar_key, score: p.score }));
  }

  const question =
    session.status === "live" && currentRow && ["question", "time_expired", "answer_reveal"].includes(phase)
      ? phase === "answer_reveal"
        ? revealedQuestion(currentRow, {
            randomizeOptions: Boolean(quizSettings.randomize_options),
            seed: session.id,
          })
        : publicQuestion(currentRow, {
            randomizeOptions: Boolean(quizSettings.randomize_options),
            seed: session.id,
          })
      : null;

  const rawSettings = (session.settings ?? {}) as Record<string, unknown>;
  const publicInstructions =
    competition?.instructions ??
    (typeof rawSettings.public_instructions === "string" ? rawSettings.public_instructions : null);

  // Next round, once the organizer has finished the podium presentation.
  let nextSession: { join_code: string; screen_path: string; session_id: string } | null = null;
  if (stage === "finished") {
    const { data: next } = await admin
      .from("quiz_sessions")
      .select("id, join_code, display_token_version")
      .eq("previous_session_id", session.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) {
      nextSession = {
        session_id: next.id,
        join_code: next.join_code,
        screen_path: publicScreenPath(next.id, next.id, Number(next.display_token_version ?? 1)),
      };
    }
  }

  return NextResponse.json({
    server_now: now.toISOString(),
    competition_id: competition?.id ?? null,
    session_id: session.id,
    title: competition?.title ?? session.title ?? quiz?.title,
    organization: organization ? { name: organization.name, logo_url: organization.logo_url } : null,
    instructions: publicInstructions,
    join_code:
      ["waiting", "countdown"].includes(phase) && liveSettings.presentation.show_join_code_on_screen
        ? session.join_code
        : null,
    status: session.status,
    mode: session.mode,
    phase,
    presentation_stage: stage,
    session_round: Number(session.session_round ?? 1),
    answer_locked: Boolean(session.answer_locked),
    admission_open: session.admission_open !== false,
    show_leaderboard: liveSettings.show_leaderboard,
    question_started_at: session.question_started_at,
    question_deadline_at: deadline,
    time_per_question_seconds: questionDurationSeconds(currentRow, quizSettings),
    progress: {
      index: idx,
      total: rows.length,
      remaining_after_current: Math.max(0, rows.length - Math.max(idx, 0) - 1),
    },
    question,
    joined: joined ?? 0,
    connected: (roster ?? []).filter((p) => isParticipantConnected(p.last_seen_at)).length,
    participants: (roster ?? []).map((p) => ({
      display_name: p.display_name,
      avatar_key: p.avatar_key ?? "owl",
      status: p.status === "pending" ? "waiting" : p.status,
      connected: isParticipantConnected(p.last_seen_at),
    })),
    answered_current: answeredCurrent,
    leaderboard,
    ranking,
    strip,
    final,
    next_session: nextSession,
    audio: liveSettings.audio,
    presentation: liveSettings.presentation,
  });
}

/** Fallback ranking straight from authoritative rows (legacy sessions with no snapshot). */
async function loadLiveRankingRows(admin: ReturnType<typeof createAdminClient>, sessionId: string) {
  const [{ data: participants }, { data: answers }] = await Promise.all([
    admin
      .from("session_participants")
      .select("id, display_name, avatar_key, score, joined_at")
      .eq("session_id", sessionId)
      .in("status", ["admitted", "finished"])
      .limit(1000),
    admin.from("participant_answers").select("participant_id, response_ms").eq("session_id", sessionId),
  ]);
  return rankedParticipants(participants ?? [], answers ?? []).map((p) => ({
    participant_id: p.id,
    display_name: p.display_name,
    avatar_key: p.avatar_key ?? "owl",
    score: Number(p.score),
    rank: 0,
  }));
}

// Keep the `hidden` count type-safe for clients that cache the payload.
export type ScreenRankingPayload = {
  rows: RankingRow[];
  hidden: number;
};
