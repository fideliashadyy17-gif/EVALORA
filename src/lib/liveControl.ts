import type { LivePhase } from "./live";

/**
 * Organizer command engine for a live competition.
 *
 * Every command is a pure function of the authoritative session row, the
 * question count and the server clock: it returns the exact database patch to
 * apply (plus the side effects the caller must persist). The projected live
 * page and the host console both call it on the server, so the projected page
 * is the single control surface without duplicating competition logic.
 *
 * Nothing in here reveals an answer key, a question that is not current, or a
 * final standing before the organizer's reveal sequence reaches it.
 */

export type PresentationStage =
  | "idle"
  | "final_pending"
  | "suspense"
  | "third"
  | "second"
  | "champion"
  | "board"
  | "finished";

export const PRESENTATION_STAGES: PresentationStage[] = [
  "idle",
  "final_pending",
  "suspense",
  "third",
  "second",
  "champion",
  "board",
  "finished",
];

/** The organizer-driven suspense sequence after the last question. */
export const REVEAL_SEQUENCE: PresentationStage[] = ["suspense", "third", "second", "champion", "board"];

export function parsePresentationStage(raw: unknown): PresentationStage {
  const value = typeof raw === "string" ? raw : "";
  return (PRESENTATION_STAGES as string[]).includes(value) ? (value as PresentationStage) : "idle";
}

/**
 * How many podium places may be shown at this stage.
 * 0 while the organizer builds suspense, 3 once the champion is out, and
 * Infinity for the full leaderboard.
 */
export function revealedPlaces(stage: PresentationStage): number {
  switch (stage) {
    case "third":
      return 1;
    case "second":
      return 2;
    case "champion":
      return 3;
    case "board":
      return Number.POSITIVE_INFINITY;
    default:
      return 0;
  }
}

export function isResultsStage(stage: PresentationStage) {
  return stage !== "idle" && stage !== "final_pending";
}

/** Next stage for "Reveal next position" (null when the sequence is done). */
export function nextRevealStage(stage: PresentationStage): PresentationStage | null {
  const index = REVEAL_SEQUENCE.indexOf(stage);
  if (index === -1 || index === REVEAL_SEQUENCE.length - 1) return null;
  return REVEAL_SEQUENCE[index + 1];
}

export function stageLabel(stage: PresentationStage, status?: string): string {
  if (stage === "final_pending") return "Final results pending";
  return (
    {
      idle: status === "ended" ? "Completed" : "Live competition",
      suspense: "Results reveal",
      third: "Third place",
      second: "Second place",
      champion: "Champion",
      board: "Final leaderboard",
      finished: "Waiting room",
    }[stage] ?? stage
  );
}

/* ── Commands ─────────────────────────────────────────────────────────── */

export type LiveCommand =
  | "start"
  | "prev"
  | "next"
  | "end"
  | "pause"
  | "resume"
  | "lock"
  | "unlock"
  | "reveal_answer"
  | "hide_answer"
  | "open_join"
  | "close_join"
  | "show_board"
  | "hide_board"
  | "reveal_results"
  | "reveal_next"
  | "show_full_board"
  | "replay_podium"
  | "finish";

export const LIVE_COMMANDS: LiveCommand[] = [
  "start",
  "prev",
  "next",
  "end",
  "pause",
  "resume",
  "lock",
  "unlock",
  "reveal_answer",
  "hide_answer",
  "open_join",
  "close_join",
  "show_board",
  "hide_board",
  "reveal_results",
  "reveal_next",
  "show_full_board",
  "replay_podium",
  "finish",
];

export interface CommandSession {
  id: string;
  status: string;
  phase?: string | null;
  mode?: string | null;
  current_question_index: number;
  question_started_at?: string | null;
  question_deadline_at?: string | null;
  answer_locked?: boolean | null;
  admission_open?: boolean | null;
  presentation_stage?: string | null;
  paused_total_ms?: number | null;
  settings?: Record<string, unknown> | null;
}

export interface CommandInput {
  command: LiveCommand;
  session: CommandSession;
  questionCount: number;
  /** Server-side duration of the question at this index, in seconds. */
  durationFor: (index: number) => number;
  now: Date;
  /** Defaults for timing windows (milliseconds). */
  leadInMs?: number;
}

export interface CommandOutcome {
  /** Field patch to apply to the session row. */
  patch: Record<string, unknown>;
  /** Question that this command officially closed, if any. */
  closedQuestion: { index: number; final: boolean } | null;
  /** Per-question ranking snapshot the caller should persist. */
  snapshotIndex: number | null;
  /** True when the caller must open the next competition session. */
  createNextSession: boolean;
  /** True when the command was already satisfied (double click, replay). */
  noop: boolean;
  error?: string;
}

const CLOSING_PHASES = ["countdown", "question", "time_expired", "answer_reveal"];

function settingsOf(session: CommandSession): Record<string, unknown> {
  return (session.settings ?? {}) as Record<string, unknown>;
}

function boardBetweenQuestions(session: CommandSession) {
  const settings = settingsOf(session);
  return settings.leaderboard_between_questions !== false;
}

function timing(now: Date, durationSeconds: number, leadInMs: number) {
  const startsAt = new Date(now.getTime() + leadInMs);
  const deadline = new Date(startsAt.getTime() + Math.max(5, durationSeconds) * 1000);
  return { startsAt, deadline };
}

function openQuestionPatch(
  now: Date,
  index: number,
  durationSeconds: number,
  leadInMs: number,
): Record<string, unknown> {
  const { startsAt, deadline } = timing(now, durationSeconds, leadInMs);
  return {
    status: "live",
    phase: "countdown",
    phase_started_at: now.toISOString(),
    current_question_index: index,
    question_started_at: startsAt.toISOString(),
    question_deadline_at: deadline.toISOString(),
    answer_locked: false,
  };
}

export function applyLiveCommand({
  command,
  session,
  questionCount,
  durationFor,
  now,
  leadInMs = 2000,
}: CommandInput): CommandOutcome {
  const base: CommandOutcome = {
    patch: {},
    closedQuestion: null,
    snapshotIndex: null,
    createNextSession: false,
    noop: false,
  };
  const index = Number(session.current_question_index ?? -1);
  const phase = (session.phase ?? "waiting") as LivePhase;
  const status = session.status;
  const stage = parsePresentationStage(session.presentation_stage);
  const fail = (error: string): CommandOutcome => ({ ...base, error });

  if (status === "ended" && !["reveal_results", "reveal_next", "show_full_board", "replay_podium", "finish"].includes(command)) {
    return fail("This competition has ended. Use the results controls.");
  }
  if (questionCount <= 0) return fail("This quiz has no questions.");

  switch (command) {
    case "start": {
      if (status !== "lobby") return fail("This competition has already started.");
      return { ...base, patch: openQuestionPatch(now, 0, durationFor(0), 3000) };
    }

    case "next": {
      if (session.mode === "self_paced") return fail("Self-paced sessions advance on each participant's device.");
      if (status === "lobby" || index < 0) {

        return fail("Start the competition first.");
      }
      // Between questions the index already points at the question that has
      // not started yet: "next" simply opens it.
      if (phase === "leaderboard") {
        if (index >= questionCount) return fail("The final results are ready to reveal.");
        return { ...base, patch: openQuestionPatch(now, index, durationFor(index), leadInMs) };
      }
      const closed = Math.min(index, questionCount - 1);
      const final = closed + 1 >= questionCount;
      if (final) {
        return {
          ...base,
          closedQuestion: { index: closed, final: true },
          snapshotIndex: closed,
          patch: {
            status: "ended",
            phase: "completed",
            phase_started_at: now.toISOString(),
            presentation_stage: "final_pending",
            question_deadline_at: null,
            ended_at: now.toISOString(),
            answer_locked: true,
          },
        };
      }
      if (boardBetweenQuestions(session)) {
        return {
          ...base,
          closedQuestion: { index: closed, final: false },
          snapshotIndex: closed,
          patch: {
            status: "live",
            phase: "leaderboard",
            phase_started_at: now.toISOString(),
            current_question_index: closed + 1,
            question_started_at: null,
            question_deadline_at: null,
            answer_locked: false,
          },
        };
      }
      return {
        ...base,
        closedQuestion: { index: closed, final: false },
        snapshotIndex: closed,
        patch: openQuestionPatch(now, closed + 1, durationFor(closed + 1), leadInMs),
      };
    }

    case "end": {
      if (status === "lobby" || index < 0) return fail("Start the competition before ending it.");
      if (status === "ended") return { ...base, noop: true };
      return {
        ...base,
        closedQuestion: { index, final: true },
        snapshotIndex: index,
        patch: {
          status: "ended",
          phase: "completed",
          phase_started_at: now.toISOString(),
          presentation_stage: "final_pending",
          question_deadline_at: null,
          ended_at: now.toISOString(),
          answer_locked: true,
        },
      };
    }

    case "prev": {
      if (session.mode === "self_paced") return fail("Self-paced sessions advance on each participant's device.");
      const target = index - 1;
      if (index < 0) return fail("The competition has not started.");
      if (target < 0) return fail("You are already on the first question.");
      // Re-opening a question is safe: answers are unique per participant and
      // question, so a revisit can never award points twice.
      return {
        ...base,
        patch: openQuestionPatch(now, target, durationFor(target), leadInMs),
      };
    }

    case "pause": {
      if (status === "lobby") return fail("Start the competition before pausing.");
      if (status === "paused") return { ...base, noop: true };
      const settings = {
        ...settingsOf(session),
        pause_snapshot: {
          paused_at: now.toISOString(),
          question_started_at: session.question_started_at ?? null,
          question_deadline_at: session.question_deadline_at ?? null,
          phase,
        },
      };
      return { ...base, patch: { status: "paused", settings } };
    }

    case "resume": {
      if (status === "live") return { ...base, noop: true };
      if (status !== "paused") return fail("Only a paused competition can be resumed.");
      const snapshot = (settingsOf(session).pause_snapshot ?? {}) as Record<string, unknown>;
      const pausedAt = typeof snapshot.paused_at === "string" ? new Date(snapshot.paused_at).getTime() : NaN;
      const shift = Number.isFinite(pausedAt) ? Math.max(0, now.getTime() - pausedAt) : 0;
      const startsAt = session.question_started_at ? new Date(session.question_started_at) : null;
      const deadline = session.question_deadline_at ? new Date(session.question_deadline_at) : null;
      const settings = { ...settingsOf(session) };
      delete settings.pause_snapshot;
      const nextStarts = startsAt ? new Date(startsAt.getTime() + shift) : null;
      const nextDeadline = deadline ? new Date(deadline.getTime() + shift) : null;
      const nextPhase: LivePhase =
        nextStarts && nextStarts.getTime() > now.getTime()
          ? "countdown"
          : phase === "countdown"
            ? "question"
            : phase;
      return {
        ...base,
        patch: {
          status: "live",
          phase: nextPhase,
          phase_started_at: now.toISOString(),
          question_started_at: nextStarts ? nextStarts.toISOString() : null,
          question_deadline_at: nextDeadline ? nextDeadline.toISOString() : null,
          paused_total_ms: Math.max(0, Number(session.paused_total_ms ?? 0)) + shift,
          settings,
        },
      };
    }

    case "lock": {
      if (status === "lobby") return fail("Start the competition before locking answers.");
      if (session.answer_locked) return { ...base, noop: true };
      return { ...base, patch: { answer_locked: true } };
    }

    case "unlock": {
      if (status === "lobby") return fail("Start the competition before unlocking answers.");
      if (!session.answer_locked) return { ...base, noop: true };
      return { ...base, patch: { answer_locked: false } };
    }

    case "reveal_answer": {
      // Mirrors the host console's "reveal answer" phase: it changes only what
      // the room can see. Nobody's submitted answer is modified or re-scored
      // and the question timer is untouched.
      if (session.mode === "self_paced") return fail("Self-paced sessions do not share a projected question.");
      if (!["live", "paused"].includes(status)) return fail("Start the competition before revealing an answer.");
      if (index < 0) return fail("There is no question to reveal.");
      if (phase === "answer_reveal") return { ...base, noop: true };
      if (phase === "leaderboard") return fail("That question is already closed.");
      return { ...base, patch: { phase: "answer_reveal", phase_started_at: now.toISOString() } };
    }

    case "hide_answer": {
      if (phase !== "answer_reveal") return { ...base, noop: true };
      const startsAt = session.question_started_at ? new Date(session.question_started_at).getTime() : null;
      const deadline = session.question_deadline_at ? new Date(session.question_deadline_at).getTime() : null;
      // Return to the phase the clock implies — never to a fresh question, and
      // never restarting the timer.
      const restored =
        startsAt !== null && now.getTime() < startsAt
          ? "countdown"
          : deadline !== null && now.getTime() > deadline
            ? "time_expired"
            : "question";
      return { ...base, patch: { phase: restored, phase_started_at: now.toISOString() } };
    }

    case "open_join":
      return session.admission_open === false ? { ...base, patch: { admission_open: true } } : { ...base, noop: true };

    case "close_join":
      return session.admission_open === false ? { ...base, noop: true } : { ...base, patch: { admission_open: false } };

    case "show_board": {
      if (!["live", "paused"].includes(status)) return fail("Rankings are available while the competition is running.");
      if (index < 0) return fail("There is no closed question to rank yet.");
      // Between questions the index already points at the question that has
      // not been opened yet, so the ranking belongs to the previous index.
      const closedIndex =
        phase === "leaderboard" && !session.question_started_at
          ? Math.max(0, index - 1)
          : Math.max(0, index);
      if (phase === "leaderboard") return { ...base, noop: true, snapshotIndex: closedIndex };
      return {
        ...base,
        snapshotIndex: closedIndex,
        patch: { phase: "leaderboard", phase_started_at: now.toISOString() },
      };
    }

    case "hide_board": {
      if (phase !== "leaderboard") return { ...base, noop: true };
      if (status === "paused") {
        return { ...base, patch: { ...openQuestionPatch(now, Math.max(index, 0), durationFor(Math.max(index, 0)), leadInMs), status: "paused" } };
      }
      const startsAt = session.question_started_at ? new Date(session.question_started_at).getTime() : null;
      const deadline = session.question_deadline_at ? new Date(session.question_deadline_at).getTime() : null;
      if (!startsAt || !deadline) {
        // The board was between questions: return to the last closed question
        // in its closed state instead of restarting its timer.
        return {
          ...base,
          patch: {
            phase: "answer_reveal",
            phase_started_at: now.toISOString(),
            question_started_at: null,
            question_deadline_at: null,
          },
        };
      }
      const nextPhase: LivePhase =
        now.getTime() < startsAt ? "countdown" : now.getTime() > deadline ? "time_expired" : "question";
      return { ...base, patch: { phase: nextPhase, phase_started_at: now.toISOString() } };
    }

    case "reveal_results": {
      if (status !== "ended") return fail("Finish the final question before revealing results.");
      if (isResultsStage(stage)) return { ...base, noop: true };
      return {
        ...base,
        patch: {
          phase: "podium",
          phase_started_at: now.toISOString(),
          presentation_stage: "suspense",
          results_revealed_at: now.toISOString(),
        },
      };
    }

    case "reveal_next": {
      if (status !== "ended") return fail("Finish the final question before revealing results.");
      if (!isResultsStage(stage)) return fail("Reveal the final results first.");
      const next = nextRevealStage(stage);
      if (!next) {
        return { ...base, noop: stage === "board" || stage === "finished" };
      }
      return { ...base, patch: { phase: "podium", presentation_stage: next } };
    }

    case "show_full_board": {
      if (status !== "ended") return fail("Finish the final question before revealing results.");
      if (stage === "board") return { ...base, noop: true };
      return { ...base, patch: { phase: "podium", presentation_stage: "board" } };
    }

    case "replay_podium": {
      if (status !== "ended") return fail("Finish the final question before replaying the podium.");
      return { ...base, patch: { phase: "podium", presentation_stage: "suspense" } };
    }

    case "finish": {
      if (status !== "ended") return fail("Finish the final question before returning to the waiting room.");
      if (stage === "finished") return { ...base, noop: true };
      return {
        ...base,
        createNextSession: true,
        patch: { phase: "completed", presentation_stage: "finished", answer_locked: true },
      };
    }

    default:
      return fail("Unknown organizer command.");
  }
}

/** Phases in which a question is officially open (used for closing rules). */
export function isClosingPhase(phase: string | null | undefined) {
  return CLOSING_PHASES.includes(String(phase ?? ""));
}
