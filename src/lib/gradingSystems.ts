/**
 * Configurable grading engine.
 *
 * Four families, one dispatcher. Organisation-owned configurations live in
 * the `grading_systems` table; the pure functions here compute results from
 * a configuration plus raw assessment input. Nothing in this file ever
 * publishes a result — publication stays behind the mandatory workflow
 * (validate → publish, see exams/actions.ts).
 *
 * Sources (kept honest):
 *  • Beninese /20 rules — the francophone Bénin convention (marks out of 20,
 *    per-subject coefficients, weighted averages). Letter boundaries are
 *    ORGANISATION-CONFIGURABLE: defaults here are a documented starting
 *    point, labelled as such, never presented as a ministry directive.
 *  • AP — structures and weightings follow the College Board Course and
 *    Exam Descriptions (apcentral.collegeboard.org). The 1–5 score scale is
 *    set annually through equating; this engine NEVER fabricates cut points:
 *    a system must supply its own thresholds or report percent only.
 *  • MYP — delegates to src/lib/myp.ts (achievement levels 0–8, 1–7
 *    boundaries; per-subject configured conversions).
 *  • Custom — percentages, letter grades, boundaries, ranges, levels.
 */

export const GRADING_CURRICULA = ["myp", "ap", "beninese", "custom", "cambridge", "british"] as const;
export type GradingCurriculum = (typeof GRADING_CURRICULA)[number];

export interface GradingSystemConfig {
  /** custom: ordered letter/boundary rules. Ascending by min_percent. */
  boundaries?: { min_percent: number; label: string; max_percent?: number }[];
  /** beninese: default scale maximum (always 20 unless a school says otherwise). */
  scale_max?: number;
  /** beninese/custom: subject coefficients for weighted averages. */
  coefficients?: { subject: string; coefficient: number }[];
  /** beninese: letter labels for /20 thresholds (organisation-owned). */
  benin_letters?: { min: number; label: string }[];
  /** cambridge: qualification & level (organisation-configured, never official thresholds). */
  cambridge_qualification?: string;
  cambridge_level?: string;
  /** cambridge: assessment components with institution-defined weighting. */
  cambridge_components?: { code: string; name: string; weight_percent: number }[];
  /** cambridge: institution-defined grade thresholds (min percent → grade). */
  cambridge_thresholds?: { min_percent: number; grade: string }[];
  /** ap: course code + section weights that must total 100. */
  ap_course?: string;
  ap_sections?: { name: string; weight_percent: number; question_types?: string[] }[];
  /** ap: optional organisation-supplied 1–5 thresholds (percent → score). */
  ap_score_thresholds?: { score: number; min_percent: number }[];
  /** Optional pass mark used when reporting pass/fail alongside a grade. */
  pass_percent?: number;
}

export interface GradingSystem {
  id: string;
  organization_id: string;
  name: string;
  curriculum: GradingCurriculum;
  subject_id: string | null;
  grade_label: string | null;
  assessment_kind: "exam" | "quiz" | "any";
  config: GradingSystemConfig;
  status: "active" | "archived";
}

/** Documented starting point — organisations own their final boundaries. */
export const BENIN_DEFAULT_LETTERS: { min: number; label: string }[] = [
  { min: 18, label: "Très Bien" },
  { min: 16, label: "Bien" },
  { min: 14, label: "Assez Bien" },
  { min: 12, label: "Passable" },
  { min: 10, label: "Facultatif" },
  { min: 0, label: "Insuffisant" },
];

export function clampNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** Marks → percentage on any scale (e.g. 15/20 → 75). */
export function toPercent(mark: unknown, scaleMax: unknown): number | null {
  const m = Number(mark);
  const max = Number(scaleMax);
  if (!Number.isFinite(m) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((m / max) * 10000) / 100;
}

/** Beninese /20 assessment: normalise, letter-grade, coefficient-weight. */
export function gradeBenin(
  mark: unknown,
  config: GradingSystemConfig,
): { mark20: number | null; percent: number | null; letter: string | null } {
  const scaleMax = config.scale_max && config.scale_max > 0 ? config.scale_max : 20;
  const raw = Number(mark);
  if (!Number.isFinite(raw)) return { mark20: null, percent: null, letter: null };
  // A mark is accepted on the configured scale; anything above is capped only
  // when it exceeds a plausible full mark by scaling (never silently negative).
  const mark20 = Math.round((raw / scaleMax) * 20 * 100) / 100;
  const percent = toPercent(mark20, 20);
  const letters =
    config.benin_letters && config.benin_letters.length
      ? [...config.benin_letters].sort((a, b) => b.min - a.min)
      : BENIN_DEFAULT_LETTERS;
  const letter = letters.find((entry) => mark20 >= entry.min)?.label ?? null;
  return { mark20, percent, letter };
}

/**
 * Weighted average across subjects (Beninese coefficients):
 * Σ(mark × coefficient) ÷ Σ(coefficient).
 */
export function weightedAverage(
  rows: { mark: unknown; coefficient?: unknown }[],
): number | null {
  let sum = 0;
  let weights = 0;
  for (const row of rows) {
    const mark = Number(row.mark);
    if (!Number.isFinite(mark)) continue;
    const coef = row.coefficient === undefined ? 1 : Number(row.coefficient);
    if (!Number.isFinite(coef) || coef <= 0) continue;
    sum += mark * coef;
    weights += coef;
  }
  if (weights <= 0) return null;
  return Math.round((sum / weights) * 100) / 100;
}

/** Custom/letter boundaries: first rule whose min_percent ≤ percent wins. */
export function gradeFromBoundaries(
  percent: unknown,
  boundaries: GradingSystemConfig["boundaries"],
): string | null {
  const p = Number(percent);
  if (!Number.isFinite(p) || !boundaries?.length) return null;
  const ordered = [...boundaries].sort((a, b) => a.min_percent - b.min_percent);
  let matched: string | null = null;
  for (const rule of ordered) {
    if (p >= rule.min_percent) matched = rule.label;
  }
  return matched;
}

/**
 * AP course result from section raw scores:
 * percent = Σ(section_percent × weight) / 100.
 * The 1–5 score comes ONLY from organisation-supplied thresholds (equating
 * is College Board's annual process; absent thresholds → null score).
 */
export function gradeAp(
  sections: { name: string; raw?: unknown; max?: unknown; percent?: unknown }[],
  config: GradingSystemConfig,
): { percent: number | null; score: number | null; note: string | null } {
  const weights = config.ap_sections ?? [];
  if (!weights.length) return { percent: null, score: null, note: "no_sections_configured" };
  let acc = 0;
  let usedWeight = 0;
  for (const weight of weights) {
    const section = sections.find((s) => s.name === weight.name);
    if (!section) continue;
    let pct: number | null;
    if (section.percent !== undefined && section.percent !== null) {
      pct = clampNumber(section.percent, 0, 100);
    } else {
      const raw = Number(section.raw);
      const max = Number(section.max);
      pct = Number.isFinite(raw) && Number.isFinite(max) && max > 0 ? (raw / max) * 100 : null;
    }
    if (pct === null) continue;
    acc += pct * weight.weight_percent;
    usedWeight += weight.weight_percent;
  }
  if (usedWeight <= 0) return { percent: null, score: null, note: "no_sections_scored" };
  // Renormalise when only part of the paper has been scored yet (provisional).
  const percent = Math.round((acc / usedWeight) * 100) / 100;
  const thresholds = [...(config.ap_score_thresholds ?? [])].sort((a, b) => b.min_percent - a.min_percent);
  const score = thresholds.find((t) => percent >= t.min_percent)?.score ?? null;
  return {
    percent,
    score,
    note: score === null ? "score_thresholds_not_configured" : null,
  };
}

export interface GradingInput {
  /** Direct mark (any scale) when the assessment has a single total. */
  mark?: unknown;
  scale_max?: unknown;
  /** Per-section raws for AP-style papers. */
  sections?: { name: string; raw?: unknown; max?: unknown; percent?: unknown }[];
  /** Coefficient rows for weighted averages. */
  rows?: { mark: unknown; coefficient?: unknown }[];
}

export interface GradingOutcome {
  curriculum: GradingCurriculum;
  percent: number | null;
  /** /20 mark for Beninese systems. */
  mark20: number | null;
  /** Letter/label from boundaries or curriculum rules. */
  label: string | null;
  /** AP 1–5 when thresholds are configured. */
  score: number | null;
  /** Non-fatal explanation when a value cannot be produced honestly. */
  note: string | null;
}

/** Apply a stored grading system to raw input. Never publishes anything. */
export interface CambridgeOutcome {
  grade: string | null;
  note: "no_marks" | "thresholds_not_configured" | "no_matching_threshold" | null;
}

/**
 * Cambridge grades come from the ORGANISATION'S OWN thresholds — EVALORA
 * never fabricates official Cambridge grade boundaries. Falls back to the
 * shared `boundaries` rule so existing Cambridge configs keep working.
 */
export function gradeCambridge(percent: number | null, config: GradingSystemConfig): CambridgeOutcome {
  if (percent === null || !Number.isFinite(percent)) return { grade: null, note: "no_marks" };
  const own = (config.cambridge_thresholds ?? [])
    .filter((t) => typeof t.min_percent === "number" && t.grade)
    .sort((a, b) => b.min_percent - a.min_percent);
  if (own.length) {
    const match = own.find((t) => percent >= t.min_percent);
    return match ? { grade: match.grade, note: null } : { grade: null, note: "no_matching_threshold" };
  }
  if (config.boundaries?.length) {
    return { grade: gradeFromBoundaries(percent, config.boundaries), note: null };
  }
  return { grade: null, note: "thresholds_not_configured" };
}

/**
 * Weighted percent across configured Cambridge components (raw/max per
 * component, weights from the org's configuration). Unscored components are
 * renormalised away — never counted as zero.
 */
export function cambridgeSectionsPercent(
  sections: { name: string; raw?: unknown; max?: unknown }[],
  config: GradingSystemConfig,
): number | null {
  const weights = new Map((config.cambridge_components ?? []).map((c) => [c.name, c.weight_percent]));
  let earned = 0;
  let weightSum = 0;
  for (const section of sections) {
    const max = Number(section.max);
    const raw = Number(section.raw);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(raw)) continue;
    const weight = weights.get(section.name) ?? 1;
    earned += (raw / max) * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) return null;
  return Math.round((earned / weightSum) * 1000) / 10;
}

export function applyGrading(system: GradingSystem, input: GradingInput): GradingOutcome {
  const config = system.config ?? {};
  switch (system.curriculum) {
    case "beninese": {
      if (input.rows?.length) {
        const avg = weightedAverage(input.rows);
        const benin = avg === null ? { mark20: null, percent: null, letter: null } : gradeBenin(avg, config);
        return {
          curriculum: "beninese",
          percent: benin.percent,
          mark20: benin.mark20,
          label: benin.letter,
          score: null,
          note: benin.mark20 === null ? "no_marks" : null,
        };
      }
      const benin = gradeBenin(input.mark, config);
      return {
        curriculum: "beninese",
        percent: benin.percent,
        mark20: benin.mark20,
        label: benin.letter,
        score: null,
        note: benin.mark20 === null ? "no_marks" : null,
      };
    }
    case "ap": {
      const ap = gradeAp(input.sections ?? [], config);
      return { curriculum: "ap", percent: ap.percent, mark20: null, label: null, score: ap.score, note: ap.note };
    }
    case "myp": {
      // MYP conversion is per-subject data (myp.ts + myp_level_boundaries);
      // the shared engine reports percent here and the MYP results screens
      // render achievement levels and 1–7 grades from configured boundaries.
      const scale = input.scale_max && Number(input.scale_max) > 0 ? Number(input.scale_max) : 100;
      const percent = toPercent(input.mark, scale);
      return {
        curriculum: "myp",
        percent,
        mark20: null,
        label: null,
        score: null,
        note: percent === null ? "no_marks" : "see_myp_results_for_levels",
      };
    }
    case "cambridge": {
      const scale = input.scale_max && Number(input.scale_max) > 0 ? Number(input.scale_max) : 100;
      const percent = input.sections?.length
        ? cambridgeSectionsPercent(input.sections, config)
        : toPercent(input.mark, scale);
      const cg = gradeCambridge(percent, config);
      return {
        curriculum: "cambridge",
        percent,
        mark20: null,
        label: cg.grade,
        score: null,
        note: cg.note === "no_marks" ? "no_marks" : cg.note,
      };
    }
    default: {
      const scale = input.scale_max && Number(input.scale_max) > 0 ? Number(input.scale_max) : 100;
      const percent = toPercent(input.mark, scale);
      const label = percent === null ? null : gradeFromBoundaries(percent, config.boundaries);
      return {
        curriculum: system.curriculum,
        percent,
        mark20: null,
        label,
        score: null,
        note: percent === null ? "no_marks" : label === null ? "no_matching_boundary" : null,
      };
    }
  }
}
