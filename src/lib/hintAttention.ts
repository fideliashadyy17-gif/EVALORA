/**
 * Hint attention rules — the "still stuck?" layer of the hint system.
 *
 * Pure functions only: the 30-second attention delay is a UI invitation, never
 * part of the assessment clock. It cannot submit, cannot change a deadline,
 * cannot reorder questions, cannot touch an answer and is never stored on the
 * server, so an attention timer can never be mistaken for a grading event.
 */

/** Seconds of silence before the hint button starts asking. */
export const HINT_ATTENTION_SECONDS = 30;

export type HintAnswerState = "unanswered" | "answered" | "correct" | "incorrect";

export type HintAttentionReason = "opened" | "correct" | "answered" | "incorrect" | "timeout" | "waiting" | "disabled";

export interface HintAttentionInput {
  answerState: HintAnswerState;
  /** Milliseconds the current question has been on screen. */
  elapsedMs: number;
  /** The student has opened the hint for this question already. */
  opened: boolean;
  /** Review mode, submission in progress, results screen… */
  disabled?: boolean;
  attentionSeconds?: number;
}

export interface HintAttentionResult {
  attention: boolean;
  reason: HintAttentionReason;
  /** Label for the button, already user-facing. */
  label: string;
}

export const HINT_ATTENTION_LABEL = "💡 HINT — NEED HELP?";
export const HINT_QUIET_LABEL = "Need a hint?";

/**
 * Priority order matters:
 *   disabled > opened > correct > answered > incorrect > timeout > waiting.
 * A correct answer can never be nagged; an opened hint stops asking at once; an
 * incorrect answer asks immediately, without waiting for the 30 seconds.
 */
export function hintAttention(input: HintAttentionInput): HintAttentionResult {
  const threshold = (input.attentionSeconds ?? HINT_ATTENTION_SECONDS) * 1000;
  if (input.disabled) return { attention: false, reason: "disabled", label: HINT_QUIET_LABEL };
  if (input.opened) return { attention: false, reason: "opened", label: HINT_QUIET_LABEL };
  if (input.answerState === "correct") return { attention: false, reason: "correct", label: HINT_QUIET_LABEL };
  if (input.answerState === "answered") return { attention: false, reason: "answered", label: HINT_QUIET_LABEL };
  if (input.answerState === "incorrect") return { attention: true, reason: "incorrect", label: HINT_ATTENTION_LABEL };
  if (input.elapsedMs >= threshold) return { attention: true, reason: "timeout", label: HINT_ATTENTION_LABEL };
  return { attention: false, reason: "waiting", label: HINT_QUIET_LABEL };
}

/**
 * Remaining milliseconds before the invitation appears. Exposed so a component
 * can schedule a single timeout instead of polling a clock.
 */
export function msUntilAttention(elapsedMs: number, attentionSeconds = HINT_ATTENTION_SECONDS): number {
  const threshold = attentionSeconds * 1000;
  return Math.max(0, threshold - Math.max(0, elapsedMs));
}

/**
 * Which answer state the current question is in, from the data the candidate
 * page already holds. Correctness is only ever used when the paper actually
 * released it (review/results); during a live examination `is_correct` is
 * absent, so an answered question simply stops the invitation.
 */
export function answerStateFor(input: {
  hasSavedAnswer: boolean;
  isCorrect?: boolean | null;
}): HintAnswerState {
  if (!input.hasSavedAnswer) return "unanswered";
  if (input.isCorrect === true) return "correct";
  if (input.isCorrect === false) return "incorrect";
  return "answered";
}
