/**
 * AP Calculus track selection for examinations.
 *
 * An examination opts in with `settings.track_selection = true`. Its candidates
 * must then choose "AB" or "BC" before the attempt is created. AB candidates
 * receive every item except the BC-only items (`questions.config.bc_only`);
 * BC candidates receive the whole paper. The choice is stored on the attempt
 * and fixed for its lifetime. Examinations without the flag are unchanged.
 */

export const EXAM_TRACKS = ["AB", "BC"] as const;
export type ExamTrack = (typeof EXAM_TRACKS)[number];

export function trackSelectionEnabled(settings: unknown): boolean {
  return Boolean((settings as { track_selection?: unknown } | null)?.track_selection === true);
}

export function parseTrack(value: unknown): ExamTrack | null {
  return value === "AB" || value === "BC" ? value : null;
}

/** The paper a candidate on this track is given, in the stored paper order. */
export function paperForTrack<T extends { questions: { config?: unknown } }>(rows: T[], track: ExamTrack): T[] {
  if (track === "BC") return rows;
  return rows.filter((row) => !(row.questions?.config as { bc_only?: unknown } | null | undefined)?.bc_only);
}
