/**
 * AP Calculus track for examinations.
 *
 * An examination opts in with `settings.track_selection = true`. The track is
 * NEVER chosen by the candidate or sent by the browser. It comes from the
 * candidate's class, read from the database (`classes.curriculum_track`):
 * an AB class receives every item except the BC-only items
 * (`questions.config.bc_only`); a BC class receives the whole paper. The track
 * is stored on the attempt and fixed for its lifetime. Examinations without the
 * flag are unchanged.
 */

export const EXAM_TRACKS = ["AB", "BC"] as const;
export type ExamTrack = (typeof EXAM_TRACKS)[number];

export function trackSelectionEnabled(settings: unknown): boolean {
  return Boolean((settings as { track_selection?: unknown } | null)?.track_selection === true);
}

export function parseTrack(value: unknown): ExamTrack | null {
  return value === "AB" || value === "BC" ? value : null;
}

/** The track a class is linked to (`classes.curriculum_track`), or null if none. */
export function trackForClass(row: { curriculum_track?: unknown } | null | undefined): ExamTrack | null {
  return parseTrack(row?.curriculum_track);
}

export type AdmissionTrack = { ok: true; track: ExamTrack | null } | { ok: false; error: string };

/**
 * The track an attempt is started on, derived server-side from the candidate's
 * class. Examinations without track selection return no track.
 */
export function admissionTrack(
  tracked: boolean,
  classRow: { curriculum_track?: unknown } | null | undefined,
): AdmissionTrack {
  if (!tracked) return { ok: true, track: null };
  const track = trackForClass(classRow);
  if (!track)
    return {
      ok: false,
      error: "This class is not linked to an AP Calculus course. Ask your organizer to confirm your class.",
    };
  return { ok: true, track };
}

/** The paper a candidate on this track is given, in the stored paper order. */
export function paperForTrack<T extends { questions: { config?: unknown } }>(rows: T[], track: ExamTrack): T[] {
  if (track === "BC") return rows;
  return rows.filter((row) => !(row.questions?.config as { bc_only?: unknown } | null | undefined)?.bc_only);
}

/**
 * Whether an answer may be saved for a quiz row. A track-selection attempt may
 * only answer rows in its stored order, so a request for another row (for
 * example a BC-only item from an AB attempt) is refused.
 */
export function attemptAllowsQuizRow(
  questionOrder: unknown,
  quizQuestionId: string,
  track: ExamTrack | null,
): boolean {
  const order = Array.isArray(questionOrder) ? (questionOrder as unknown[]) : [];
  if (track) return order.includes(quizQuestionId);
  return order.length === 0 || order.includes(quizQuestionId);
}
