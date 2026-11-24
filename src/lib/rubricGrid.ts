/**
 * Assessment-grid (rubric) builder helpers — pure functions.
 *
 * Performance levels, weights, duplication lineage and the historical-edit
 * guard. Nothing here touches the database; the server actions call these
 * parsers and tests exercise them directly.
 */

export interface RubricPerformanceLevel {
  /** 1-based level index inside the criterion (1 = lowest band by default). */
  level: number;
  label: string;
  description?: string;
  min_marks: number;
  max_marks: number;
}

/** Minimal FormData surface so tests can pass a plain stub. */
export interface FormLike {
  getAll(key: string): unknown[];
  get(key: string): unknown;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Parse up to `maxRows` performance-level rows from a form:
 *   level_label[], level_min[], level_max[], level_desc[] (parallel arrays).
 * Empty labels are skipped. Returns null when a filled row is invalid
 * (bad numbers, inverted range, or a range beyond the criterion maximum).
 */
export function parseLevelsFromForm(form: FormLike, maxMarks: number, maxRows = 6): RubricPerformanceLevel[] | null {
  const labels = form.getAll("level_label").map((v) => cleanText(v, 80));
  const mins = form.getAll("level_min");
  const maxs = form.getAll("level_max");
  const descs = form.getAll("level_desc").map((v) => (typeof v === "string" ? v.trim().slice(0, 400) : ""));
  const limit = Math.min(labels.length, maxRows);
  const out: RubricPerformanceLevel[] = [];
  const cap = Number(maxMarks);
  for (let i = 0; i < limit; i++) {
    const label = labels[i];
    if (!label) continue;
    const min = Number(mins[i]);
    const max = Number(maxs[i]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min < 0 || max < min) return null;
    if (Number.isFinite(cap) && cap > 0 && max > cap + 0.001) return null;
    out.push({
      level: out.length + 1,
      label,
      ...(descs[i] ? { description: descs[i] } : {}),
      min_marks: Math.round(min * 100) / 100,
      max_marks: Math.round(max * 100) / 100,
    });
  }
  // Levels must not overlap when sorted by min.
  const ordered = [...out].sort((a, b) => a.min_marks - b.min_marks);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].min_marks < ordered[i - 1].max_marks) return null;
  }
  return out;
}

/** The level a mark falls into (inclusive ranges); null when unconfigured. */
export function levelForMarks(levels: RubricPerformanceLevel[] | null | undefined, marks: number): RubricPerformanceLevel | null {
  if (!levels?.length || !Number.isFinite(marks)) return null;
  const ordered = [...levels].sort((a, b) => a.min_marks - b.min_marks);
  let matched: RubricPerformanceLevel | null = null;
  for (const level of ordered) {
    if (marks >= level.min_marks && marks <= level.max_marks) matched = level;
  }
  return matched;
}

/** Duplication lineage: the copy is one version newer and points at its source. */
export function nextGridVersion(parentVersion: unknown): number {
  const v = Number(parentVersion);
  return Number.isFinite(v) && v >= 1 ? Math.min(9999, Math.floor(v) + 1) : 1;
}

/**
 * Historical-results guard: once a grid has scored any answer, in-place edits
 * to its rules would silently change the meaning of stored marks. The caller
 * must offer duplication instead. Status-only changes are always allowed.
 */
export function rejectRuleEditForScoredGrid(args: {
  scoredAnswerCount: number;
  titleChanged: boolean;
  descriptionChanged: boolean;
  frameworkChanged: boolean;
  curriculumChanged: boolean;
}): boolean {
  if (args.scoredAnswerCount <= 0) return false;
  return args.titleChanged || args.descriptionChanged || args.frameworkChanged || args.curriculumChanged;
}

/** Stable label for a duplicated grid, e.g. "Grid v2" or "Title (copy 2)". */
export function duplicatedTitle(parentTitle: string, version: number): string {
  const base = parentTitle.replace(/\s+\((?:copy(?:\s+\d+)?|v\d+)\)$/i, "").slice(0, 180);
  return `${base} (v${version})`;
}
