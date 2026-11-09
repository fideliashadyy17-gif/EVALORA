import type { SupabaseClient } from "@supabase/supabase-js";

export type LivePhase =
  | "waiting"
  | "countdown"
  | "question"
  | "time_expired"
  | "answer_reveal"
  | "leaderboard"
  | "podium"
  | "completed";

export interface LiveSessionTiming {
  status: string;
  mode?: string | null;
  phase?: string | null;
  current_question_index?: number | null;
  question_started_at?: string | null;
  question_deadline_at?: string | null;
}

export interface LiveAudioSettings {
  enabled: boolean;
  volume: number; // master, 0..1
  music_volume: number; // 0..1, relative to master
  effects_volume: number; // 0..1, relative to master
  muted: boolean;
  theme: "evergreen" | "focus" | "celebration" | "off";
  sound_effects: boolean;
}

export interface LivePresentationSettings {
  animations_enabled: boolean;
  show_join_code_on_screen: boolean;
}

export interface ParsedLiveSettings {
  show_leaderboard: boolean;
  projector_enabled: boolean;
  max_participants: number;
  audio: LiveAudioSettings;
  presentation: LivePresentationSettings;
}

export function defaultLiveAudioSettings(): LiveAudioSettings {
  return { enabled: true, volume: 0.6, music_volume: 1, effects_volume: 1, muted: false, theme: "evergreen", sound_effects: true };
}

export function defaultLiveSessionSettings(
  maxParticipants: number,
  opts: { showLeaderboard?: boolean } = {},
): Record<string, unknown> {
  return {
    show_leaderboard: Boolean(opts.showLeaderboard),
    projector_enabled: true,
    max_participants: maxParticipants,
    audio: defaultLiveAudioSettings(),
    presentation: {
      animations_enabled: true,
      show_join_code_on_screen: true,
    },
  };
}

export function parseLiveSettings(raw: unknown): ParsedLiveSettings {
  const settings = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const audio = (settings.audio && typeof settings.audio === "object" ? settings.audio : {}) as Record<string, unknown>;
  const presentation = (
    settings.presentation && typeof settings.presentation === "object" ? settings.presentation : {}
  ) as Record<string, unknown>;
  const theme = ["evergreen", "focus", "celebration", "off"].includes(String(audio.theme))
    ? (String(audio.theme) as LiveAudioSettings["theme"])
    : "evergreen";
  const volume = (value: unknown, fallback: number) => {
    const raw = Number(value ?? fallback);
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : fallback;
  };
  return {
    // Legacy sessions defaulted show_leaderboard to true. New sessions
    // explicitly write false unless the organizer authorizes a reveal.
    show_leaderboard: settings.show_leaderboard !== false,
    projector_enabled: settings.projector_enabled !== false,
    max_participants: Math.max(1, Number(settings.max_participants ?? 200) || 200),
    audio: {
      enabled: audio.enabled !== false,
      volume: volume(audio.volume, 0.6),
      music_volume: volume(audio.music_volume, 1),
      effects_volume: volume(audio.effects_volume, 1),
      muted: audio.muted === true,
      theme,
      sound_effects: audio.sound_effects !== false,
    },
    presentation: {
      animations_enabled: presentation.animations_enabled !== false,
      show_join_code_on_screen: presentation.show_join_code_on_screen !== false,
    },
  };
}

export function questionDurationSeconds(
  row: SessionQuestionRow | null | undefined,
  quizSettings: Record<string, unknown> | null | undefined,
): number {
  return Math.max(5, Number(row?.time_limit_seconds ?? quizSettings?.time_per_question_seconds ?? 30) || 30);
}

export function questionDeadlineAt(
  session: LiveSessionTiming,
  row: SessionQuestionRow | null | undefined,
  quizSettings: Record<string, unknown> | null | undefined,
): string | null {
  if (session.question_deadline_at) return session.question_deadline_at;
  if (!session.question_started_at) return null;
  return new Date(
    new Date(session.question_started_at).getTime() + questionDurationSeconds(row, quizSettings) * 1000,
  ).toISOString();
}

/**
 * Derives the one effective presentation phase from authoritative DB
 * fields. Browser clocks only render the countdown; this server-side
 * derivation decides what data may be released.
 */
export function effectivePhase(
  session: LiveSessionTiming,
  row: SessionQuestionRow | null | undefined,
  quizSettings: Record<string, unknown> | null | undefined,
  now = new Date(),
): LivePhase {
  if (session.status === "ended") return session.phase === "podium" ? "podium" : "completed";
  if (session.status === "lobby") return "waiting";
  if (session.mode === "self_paced") {
    if (session.phase === "leaderboard") return "leaderboard";
    return session.status === "paused" ? "waiting" : "question";
  }
  if (session.phase === "answer_reveal") return "answer_reveal";
  if (session.phase === "leaderboard") return "leaderboard";
  if (session.phase === "podium") return "podium";
  if (!session.question_started_at || (session.current_question_index ?? -1) < 0) return "waiting";
  const starts = new Date(session.question_started_at).getTime();
  if (now.getTime() < starts) return "countdown";
  const deadline = questionDeadlineAt(session, row, quizSettings);
  if (deadline && now.getTime() > new Date(deadline).getTime()) return "time_expired";
  return "question";
}

export function isParticipantConnected(lastSeenAt: string | null | undefined, now = Date.now(), thresholdMs = 10_000) {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  return Number.isFinite(seen) && now - seen <= thresholdMs;
}

export interface RankableParticipant {
  id: string;
  display_name: string;
  avatar_key?: string | null;
  score: number | string;
  joined_at?: string | null;
}

export function rankedParticipants<T extends RankableParticipant>(
  participants: T[],
  answers: { participant_id: string; response_ms: number | null }[],
) {
  const responseByParticipant = new Map<string, number>();
  for (const a of answers) {
    responseByParticipant.set(
      a.participant_id,
      (responseByParticipant.get(a.participant_id) ?? 0) + Math.max(0, a.response_ms ?? 0),
    );
  }
  return [...participants]
    .map((p) => ({ ...p, total_response_ms: responseByParticipant.get(p.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => {
      const score = Number(b.score) - Number(a.score);
      if (score !== 0) return score;
      if (a.total_response_ms !== b.total_response_ms) return a.total_response_ms - b.total_response_ms;
      return String(a.joined_at ?? "").localeCompare(String(b.joined_at ?? ""));
    });
}


/** Deterministic shuffle seeded by a string (stable across requests). */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface SessionQuestionRow {
  id: string; // quiz_question id
  question_id: string;
  position: number;
  points: number | null;
  time_limit_seconds: number | null;
  questions: {
    id: string;
    type: string;
    prompt: string;
    prompt_doc: import("./content").RichDoc | null;
    explanation: string | null;
    explanation_doc: import("./content").RichDoc | null;
    points: number;
    config: Record<string, unknown> | null;
    question_options: { id: string; label: string; content_doc: import("./content").RichDoc | null; is_correct: boolean; position: number }[];
  };
}

export async function loadQuizQuestions(
  supabase: SupabaseClient,
  quizId: string,
  options: { failOnError?: boolean } = {},
): Promise<SessionQuestionRow[]> {
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("*, questions(*, question_options(*))")
    .eq("quiz_id", quizId)
    .order("position");
  if (options.failOnError && (error || !data)) throw new Error("Could not load examination paper.");
  return (data ?? []).map((r) => ({
    ...r,
    questions: {
      ...r.questions,
      points: Number(r.questions.points),
      question_options: [...(r.questions.question_options ?? [])].sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position,
      ),
    },
  })) as SessionQuestionRow[];
}

/**
 * The question as a participant/candidate may see it.
 * Correctness, accepted answers, numeric solutions and pair mappings
 * are stripped — they never leave the server before grading.
 */
export function publicQuestion(
  row: SessionQuestionRow,
  opts: { randomizeOptions?: boolean; seed?: string } = {},
) {
  const q = row.questions;
  const cfg = (q.config ?? {}) as Record<string, unknown>;
  const baseOptions = q.question_options.map((o) => ({ id: o.id, label: o.label, content_doc: o.content_doc ?? null }));
  let options = baseOptions;
  if (opts.randomizeOptions && ["single_choice", "multiple_select", "true_false", "poll"].includes(q.type)) {
    options = seededShuffle(baseOptions, `${opts.seed ?? ""}:${q.id}`);
  }
  const optionBackedTypes = ["single_choice", "multiple_select", "true_false", "poll", "ordering"];
  const out: Record<string, unknown> = {
    quiz_question_id: row.id,
    question_id: q.id,
    type: q.type,
    prompt: q.prompt,
    prompt_doc: q.prompt_doc ?? null,
    points: Number(row.points ?? q.points),
    media_url: (cfg.media_url as string) ?? null,
    media_type: (cfg.media_type as string) ?? null,
    // Short-answer question_options contain accepted answers. They must
    // never be serialized before an authorized reveal.
    options: optionBackedTypes.includes(q.type) ? options : [],
  };
  if (q.type === "ordering") {
    out.options = seededShuffle(baseOptions, `${opts.seed ?? ""}:${q.id}:ord`);
  }
  if (q.type === "matching") {
    const pairs = (cfg.pairs as { left: string; right: string }[]) ?? [];
    const mode = cfg.match_mode === "sort" ? "sort" : "match";
    out.match_mode = mode;
    if (mode === "sort") {
      // Tiles are dragged into categories: shuffle the tiles, list each category once.
      out.matching_lefts = seededShuffle(pairs.map((p) => p.left), `${opts.seed ?? ""}:${q.id}:tiles`);
      out.matching_rights = [...new Set(pairs.map((p) => p.right))];
    } else {
      out.matching_lefts = pairs.map((p) => p.left);
      out.matching_rights = seededShuffle(pairs.map((p) => p.right), `${opts.seed ?? ""}:${q.id}:mat`);
    }
  }
  return out;
}

export interface AnswerReveal {
  correct_option_ids: string[];
  accepted_answers: string[];
  numeric_answer: number | null;
  tolerance: number | null;
  correct_order: string[];
  matching_pairs: { left: string; right: string }[];
  summary: string[];
}

/** Builds the answer key for an organizer-authorized reveal. Server only. */
export function answerReveal(row: SessionQuestionRow): AnswerReveal {
  const q = row.questions;
  const cfg = (q.config ?? {}) as Record<string, unknown>;
  const correctOptions = q.question_options.filter((o) => o.is_correct);
  const reveal: AnswerReveal = {
    correct_option_ids: correctOptions.map((o) => o.id),
    accepted_answers: q.type === "short_answer" ? correctOptions.map((o) => o.label) : [],
    numeric_answer: q.type === "numeric" && Number.isFinite(Number(cfg.numeric_answer)) ? Number(cfg.numeric_answer) : null,
    tolerance: q.type === "numeric" ? Number(cfg.tolerance ?? 0) : null,
    correct_order: q.type === "ordering" ? q.question_options.map((o) => o.label) : [],
    matching_pairs:
      q.type === "matching" ? ((cfg.pairs as { left: string; right: string }[]) ?? []) : [],
    summary: [],
  };

  if (["single_choice", "multiple_select", "true_false"].includes(q.type)) {
    reveal.summary = correctOptions.map((o) => o.label);
  } else if (q.type === "short_answer") {
    reveal.summary = reveal.accepted_answers;
  } else if (q.type === "numeric" && reveal.numeric_answer !== null) {
    reveal.summary = [
      `${reveal.numeric_answer}${reveal.tolerance ? ` (± ${reveal.tolerance})` : ""}`,
    ];
  } else if (q.type === "ordering") {
    reveal.summary = reveal.correct_order;
  } else if (q.type === "matching") {
    reveal.summary = reveal.matching_pairs.map((p) => `${p.left} → ${p.right}`);
  } else if (q.type === "poll") {
    reveal.summary = ["Poll question — no correct answer."];
  } else if (q.type === "open_ended") {
    reveal.summary = ["Written response — marked by the organizer."];
  }
  return reveal;
}

export function revealedQuestion(
  row: SessionQuestionRow,
  opts: { randomizeOptions?: boolean; seed?: string } = {},
) {
  return {
    ...publicQuestion(row, opts),
    reveal: answerReveal(row),
    explanation: row.questions.explanation ?? null,
    explanation_doc: row.questions.explanation_doc ?? null,
  };
}
