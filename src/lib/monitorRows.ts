/**
 * Pure construction of the teacher monitoring snapshot. The loader (examMonitoring.ts)
 * fetches the rows under the signed-in user's RLS; this module only combines them.
 * Keeping it pure lets every number on the dashboard be tested with fixtures.
 */
import { paperForTrack, type ExamTrack } from "./examTrack";
import {
  connectionStatus,
  summarizeProgress,
  type ConnectionStatus,
  type SavedAnswerFacts,
} from "./examMessaging";

export interface PaperRow {
  /** quiz_questions.id: the identifier attempts store in question_order. */
  id: string;
  questions: { config?: unknown };
}

export interface MonitorAttemptInput {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  /** Manual organizer pause state (migration 0098). Legacy rows: never paused. */
  pause_reasons?: string[] | null;
  paused_at?: string | null;
  track: ExamTrack | null;
  question_order: unknown;
  candidate_name: string;
  candidate_ref: string | null;
  class_name: string | null;
  /** Server-computed authoritative deadline (attemptDeadline), ISO string. */
  deadline: string;
  /** Saved answers of this attempt, with the quiz row each belongs to. Other rows are ignored. */
  answers: (SavedAnswerFacts & { quiz_question_id: string | null })[];
  presence: {
    last_seen_at: string;
    current_question: number | null;
    pending_saves: number;
  } | null;
  unread_from_candidate: number;
}

export interface MonitorRow {
  attempt_id: string;
  candidate_name: string;
  candidate_ref: string | null;
  class_name: string | null;
  status: string;
  started_at: string;
  submitted_at: string | null;
  deadline: string;
  /** Organizer pause reasons open on this attempt: 'assessment' and/or 'student'. Empty = composing. */
  pause_reasons: ("assessment" | "student")[];
  /** When the current manual pause window opened (null when not paused). */
  paused_at: string | null;
  connection: ConnectionStatus;
  last_seen_at: string | null;
  /** 1-based question the candidate is on, as reported by their browser. Null when unknown. */
  current_question: number | null;
  total_questions: number;
  answered: number;
  unanswered: number;
  /** Only ever set from a grading result. */
  correct: number;
  incorrect: number;
  awaiting_grading: number;
  marked: number;
  progress_percent: number;
  /** Answers the candidate's browser reports as not yet saved. Browser-reported, not from the database. */
  pending_saves: number;
  unread_from_candidate: number;
}

export interface MonitorSnapshot {
  server_now: string;
  /** True while the organizer has paused the whole examination. */
  exam_paused?: boolean;
  rows: MonitorRow[];
}

/**
 * The rows of one candidate's paper, in the order the candidate sees them:
 * the stored question order when present, otherwise the track's paper, otherwise the whole paper.
 */
export function paperForAttempt<T extends PaperRow>(rows: T[], order: unknown, track: ExamTrack | null): T[] {
  const stored = Array.isArray(order) ? (order as unknown[]).filter((id): id is string => typeof id === "string") : [];
  if (stored.length) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    return stored.map((id) => byId.get(id)).filter((r): r is T => Boolean(r));
  }
  return track ? paperForTrack(rows, track) : rows;
}

function parseRowPauseReasons(value: unknown): ("assessment" | "student")[] {
  if (!Array.isArray(value)) return [];
  const out: ("assessment" | "student")[] = [];
  if (value.includes("assessment")) out.push("assessment");
  if (value.includes("student")) out.push("student");
  return out;
}

export function buildMonitorRow(attempt: MonitorAttemptInput, paper: PaperRow[], nowMs: number): MonitorRow {
  const paperIds = new Set(paper.map((r) => r.id));
  // Only answers to questions on this candidate's paper count toward progress.
  const saved = attempt.answers.filter((a) => a.quiz_question_id !== null && paperIds.has(a.quiz_question_id));
  const summary = summarizeProgress(paper.length, saved);
  const presence = attempt.presence;
  return {
    attempt_id: attempt.id,
    candidate_name: attempt.candidate_name,
    candidate_ref: attempt.candidate_ref,
    class_name: attempt.class_name,
    status: attempt.status,
    started_at: attempt.started_at,
    submitted_at: attempt.submitted_at,
    deadline: attempt.deadline,
    pause_reasons: parseRowPauseReasons(attempt.pause_reasons),
    paused_at: attempt.status === "in_progress" && parseRowPauseReasons(attempt.pause_reasons).length
      ? (typeof attempt.paused_at === "string" ? attempt.paused_at : null)
      : null,
    connection: attempt.status === "in_progress" ? connectionStatus(presence?.last_seen_at ?? null, nowMs) : "not_connected",
    last_seen_at: presence?.last_seen_at ?? null,
    current_question: presence?.current_question ?? null,
    total_questions: summary.total,
    answered: summary.answered,
    unanswered: summary.unanswered,
    correct: summary.correct,
    incorrect: summary.incorrect,
    awaiting_grading: summary.awaiting_grading,
    marked: summary.marked,
    progress_percent: summary.progress_percent,
    pending_saves: presence ? presence.pending_saves : 0,
    unread_from_candidate: attempt.unread_from_candidate,
  };
}

/** Live attempts first, then by candidate name; submitted attempts follow. */
export function sortMonitorRows(rows: MonitorRow[]): MonitorRow[] {
  const rank = (r: MonitorRow) => (r.status === "in_progress" ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.candidate_name.localeCompare(b.candidate_name));
}
