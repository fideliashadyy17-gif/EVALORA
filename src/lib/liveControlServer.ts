import type { SupabaseClient } from "@supabase/supabase-js";
import { loadQuizQuestions, rankedParticipants, type SessionQuestionRow } from "./live";
import {
  parseRankingEntries,
  snapshotFromRanked,
  type RankingEntry,
  type RankingHistoryPoint,
  historyPoints,
} from "./liveRanking";
import { parsePresentationStage, type PresentationStage } from "./liveControl";
import { genCode } from "./utils";

type Client = SupabaseClient;

export interface ControlTiming {
  questionCount: number;
  durationFor: (index: number) => number;
  quizSettings: Record<string, unknown>;
  rows: SessionQuestionRow[];
}

/**
 * Server-side question timing used by organizer commands. Durations come from
 * the same fields the participant timer uses, so "next question" always starts
 * with the question's real duration.
 */
export async function loadControlTiming(admin: Client, quizId: string): Promise<ControlTiming> {
  const [{ data: quiz }, rows] = await Promise.all([
    admin.from("quizzes").select("settings").eq("id", quizId).maybeSingle(),
    loadQuizQuestions(admin, quizId),
  ]);
  const quizSettings = ((quiz?.settings ?? {}) as Record<string, unknown>) ?? {};
  const fallback = Math.max(5, Number(quizSettings.time_per_question_seconds ?? 30) || 30);
  const durations = rows.map((row) =>
    Math.max(5, Number(row.time_limit_seconds ?? fallback) || fallback),
  );
  return {
    questionCount: rows.length,
    rows,
    quizSettings,
    durationFor: (index: number) => durations[index] ?? fallback,
  };
}

export interface SnapshotRow {
  question_index: number;
  is_final: boolean;
  entries: RankingEntry[];
  participant_count: number;
  answered_count: number;
  computed_at: string;
}

export interface RankingView {
  current: SnapshotRow | null;
  previous: RankingEntry[] | null;
  history: RankingHistoryPoint[];
  stage: PresentationStage;
}

/**
 * Recomputes the ranking from authoritative rows and stores it once per
 * closed question. `recompute` is used for the official final standing so a
 * scoring correction made before the reveal is reflected; otherwise the first
 * closure of a question is kept (a revisit can never rewrite history).
 */
export async function saveRankingSnapshot(
  admin: Client,
  input: {
    sessionId: string;
    organizationId: string;
    questionIndex: number;
    quizQuestionId?: string | null;
    isFinal?: boolean;
    recompute?: boolean;
  },
): Promise<{ ok: true; entries: RankingEntry[] } | { ok: false; error: string }> {
  const [{ data: participants, error: participantsError }, { data: answers }] = await Promise.all([
    admin
      .from("session_participants")
      .select("id, display_name, avatar_key, score, joined_at")
      .eq("session_id", input.sessionId)
      .in("status", ["admitted", "finished"])
      .limit(5000),
    admin
      .from("participant_answers")
      .select("participant_id, response_ms")
      .eq("session_id", input.sessionId)
      .limit(50000),
  ]);
  if (participantsError) return { ok: false, error: "The ranking could not be calculated." };

  const ranked = rankedParticipants(participants ?? [], answers ?? []);
  const entries = snapshotFromRanked(ranked);
  const row = {
    session_id: input.sessionId,
    organization_id: input.organizationId,
    question_index: Math.max(0, input.questionIndex),
    quiz_question_id: input.quizQuestionId ?? null,
    is_final: Boolean(input.isFinal),
    participant_count: ranked.length,
    answered_count: new Set((answers ?? []).map((a) => a.participant_id)).size,
    entries,
    leader_name: entries[0]?.display_name ?? null,
    computed_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("live_ranking_snapshots")
    .upsert(row, {
      onConflict: "session_id,question_index",
      ignoreDuplicates: !input.recompute,
    });
  if (error) return { ok: false, error: "The ranking snapshot could not be stored." };
  return { ok: true, entries };
}

export async function loadRankingView(admin: Client, sessionId: string, stage: PresentationStage): Promise<RankingView> {
  const { data } = await admin
    .from("live_ranking_snapshots")
    .select("question_index, is_final, entries, participant_count, answered_count, computed_at")
    .eq("session_id", sessionId)
    .order("question_index", { ascending: false })
    .limit(12);
  const snapshots = (data ?? []).map((row) => ({
    question_index: Number(row.question_index),
    is_final: Boolean(row.is_final),
    entries: parseRankingEntries(row.entries),
    participant_count: Number(row.participant_count ?? 0),
    answered_count: Number(row.answered_count ?? 0),
    computed_at: String(row.computed_at ?? ""),
  }));
  const current = snapshots[0] ?? null;
  const previous = snapshots[1]?.entries ?? null;
  return {
    current,
    previous,
    history: historyPoints(snapshots),
    stage,
  };
}

export function stageOf(session: { presentation_stage?: string | null }) {
  return parsePresentationStage(session.presentation_stage);
}

/**
 * Opens the next competition session as a *new* row so the finished round keeps
 * its participants, answers, scores, snapshots and champion untouched. The new
 * session starts in the waiting room with its own join code and token version.
 */
export async function createNextRoundSession(
  admin: Client,
  previous: {
    id: string;
    quiz_id: string;
    organization_id: string;
    host_id?: string | null;
    title?: string | null;
    mode?: string | null;
    settings?: Record<string, unknown> | null;
    session_round?: number | null;
  },
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const settings = { ...((previous.settings ?? {}) as Record<string, unknown>) };
  delete settings.pause_snapshot;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const joinCode = genCode(6);
    const { data: taken } = await admin.from("quiz_sessions").select("id").eq("join_code", joinCode).maybeSingle();
    if (taken) continue;
    const { data, error } = await admin
      .from("quiz_sessions")
      .insert({
        quiz_id: previous.quiz_id,
        organization_id: previous.organization_id,
        host_id: previous.host_id ?? null,
        join_code: joinCode,
        title: previous.title ?? null,
        mode: previous.mode === "self_paced" ? "self_paced" : "synchronized",
        status: "lobby",
        phase: "waiting",
        phase_started_at: new Date().toISOString(),
        current_question_index: -1,
        question_started_at: null,
        question_deadline_at: null,
        admission_open: true,
        require_approval: false,
        answer_locked: false,
        presentation_stage: "idle",
        paused_total_ms: 0,
        session_round: Math.max(1, Number(previous.session_round ?? 1)) + 1,
        previous_session_id: previous.id,
        settings,
      })
      .select("id")
      .single();
    if (error || !data) continue;
    await relinkCompetition(admin, previous.id, data.id);
    return { ok: true, sessionId: data.id };
  }
  return { ok: false, error: "The next waiting room could not be created." };
}

async function relinkCompetition(admin: Client, previousSessionId: string, nextSessionId: string) {
  try {
    const { data: competition } = await admin
      .from("competitions")
      .select("id")
      .eq("session_id", previousSessionId)
      .maybeSingle();
    if (!competition) return;
    // Multi-phase competitions keep their phase/session linkage; only plain
    // competition sessions follow the new round.
    const { data: phaseClass, error: phaseError } = await admin
      .from("competition_phase_classes")
      .select("id")
      .eq("competition_id", competition.id)
      .maybeSingle();
    if (phaseError || phaseClass) return;
    await admin
      .from("competitions")
      .update({ session_id: nextSessionId, status: "live", updated_at: new Date().toISOString() })
      .eq("id", competition.id);
  } catch {
    // The new round is fully usable without the competition pointer.
  }
}
