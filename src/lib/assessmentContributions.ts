/**
 * Assessment Contributions & Grade Consolidation — pure engine.
 *
 * No database, no Next.js, no React: the same deterministic logic runs in the
 * API routes, the server actions, the candidate result paper and the tests, so
 * a preview can never disagree with the value that is finally stored.
 *
 * Design rules enforced here (and mirrored by database constraints):
 *  - An assessment NEVER requires an examination; the exam link is optional.
 *  - A score can never exceed its assessment's own maximum (`normalizeScore`).
 *  - Scales that differ between assessments are normalized explicitly
 *    (percentage for weights, configured point value for points-based methods).
 *  - Missing scores, invalid weights, zero maximums and duplicate contributions
 *    produce an explicit, readable error — never a silently wrong number.
 *  - The original examination score is only ever *read*. Consolidation output
 *    carries `originalExamScore` beside `consolidatedScore` so the two can be
 *    compared and so publication can never hide where a mark came from.
 */

export type AssessmentCategoryKey = string;

export interface AssessmentCategory {
  key: AssessmentCategoryKey;
  label: string;
  /** true for the platform catalogue, false for an organization-defined one. */
  builtin: boolean;
  description?: string;
}

/**
 * The platform's built-in assessment categories. Organizations may add their own
 * through `public.assessment_categories`; these keys are reserved and can never
 * be redefined by a tenant (the database guard rejects them).
 */
export const BUILT_IN_ASSESSMENT_CATEGORIES: readonly AssessmentCategory[] = [
  { key: "homework", label: "Homework", builtin: true, description: "Assigned work completed outside the lesson." },
  { key: "class_test", label: "Class Test", builtin: true, description: "Short in-class written test." },
  { key: "quiz", label: "Quiz", builtin: true, description: "Brief knowledge check." },
  { key: "formative", label: "Formative Assessment", builtin: true, description: "Assessment for learning; informs teaching." },
  { key: "summative", label: "Summative Assessment", builtin: true, description: "Assessment of learning at the end of a unit or term." },
  { key: "classwork", label: "Classwork", builtin: true, description: "Work completed during the lesson." },
  { key: "project", label: "Project", builtin: true, description: "Extended individual or group project." },
  { key: "participation", label: "Participation", builtin: true, description: "Engagement and contribution in class." },
  { key: "oral", label: "Oral Assessment", builtin: true, description: "Speaking, presentation or viva." },
  { key: "practical", label: "Practical Assessment", builtin: true, description: "Laboratory, technical or performance practical." },
  { key: "other", label: "Other", builtin: true, description: "Any other classroom assessment." },
];

export const BUILT_IN_CATEGORY_KEYS: ReadonlySet<string> = new Set(
  BUILT_IN_ASSESSMENT_CATEGORIES.map((category) => category.key),
);

export type AssessmentScope = "class" | "individual" | "mixed";
export const ASSESSMENT_SCOPES: readonly AssessmentScope[] = ["class", "individual", "mixed"];

export type AssessmentSource = "manual" | "import" | "individual";

export type AssessmentStatus = "draft" | "published" | "archived";

export type ContributionMethod =
  | "direct_points"
  | "weighted"
  | "points_based"
  | "criterion"
  | "record_only";

export const CONTRIBUTION_METHODS: readonly {
  value: ContributionMethod;
  label: string;
  description: string;
}[] = [
  {
    value: "record_only",
    label: "Method E — Record only",
    description: "Record the assessment without changing the examination result.",
  },
  {
    value: "direct_points",
    label: "Method A — Direct point adjustment",
    description: "Add a permitted number of points to the examination result, with a reason.",
  },
  {
    value: "weighted",
    label: "Method B — Weighted contribution",
    description: "Examination and supplementary assessments contribute by percentage weight (e.g. 80 / 10 / 10).",
  },
  {
    value: "points_based",
    label: "Method C — Points-based aggregation",
    description: "Combine scores with a configured point value per assessment, normalizing different scales.",
  },
  {
    value: "criterion",
    label: "Method D — Criterion-specific contribution",
    description: "Supplementary assessments contribute to MYP Criteria A–D. Requires a criterion-based framework.",
  },
];

export const ASSESSMENT_FRAMEWORKS = [
  "general",
  "myp",
  "ap",
  "british",
  "cambridge",
  "beninese",
  "custom",
] as const;
export type AssessmentFramework = (typeof ASSESSMENT_FRAMEWORKS)[number];

/** Frameworks that genuinely define criteria. Criteria are never invented. */
export const CRITERION_FRAMEWORKS: ReadonlySet<string> = new Set(["myp"]);

export interface FieldError {
  field: string;
  message: string;
}

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(num) ? num : null;
}

export function normalizeCategoryKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 40);
}

/**
 * Resolves a category key against the built-in catalogue plus the organization's
 * own custom categories. Returns null when the key is unknown, so a caller can
 * never persist an assessment under a category that does not exist.
 */
export function resolveCategory(
  key: unknown,
  custom: readonly AssessmentCategory[] = [],
): AssessmentCategory | null {
  const normalized = normalizeCategoryKey(key);
  if (!normalized) return null;
  const builtin = BUILT_IN_ASSESSMENT_CATEGORIES.find((c) => c.key === normalized);
  if (builtin) return builtin;
  const customMatch = custom.find((c) => c.key === normalized);
  return customMatch ? { ...customMatch, builtin: false } : null;
}

/** A trimmed, bounded text value or null. */
export function text(raw: unknown, max: number): string | null {
  const value = String(raw ?? "").trim().slice(0, max);
  return value || null;
}

/** A YYYY-MM-DD date, validated (no silent coercion of garbage into today). */
export function isoDate(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Validates one student score against the assessment's maximum. A score above
 * the maximum is rejected rather than clamped: silently clamping would hide a
 * data-entry mistake and could inflate a consolidated result.
 */
export function normalizeScore(
  raw: unknown,
  maxScore: number,
): { ok: true; score: number } | { ok: false; error: string } {
  const value = toNumber(raw);
  if (value === null) return { ok: false, error: "Score must be a number." };
  const rounded = round2(value);
  if (rounded < 0) return { ok: false, error: "Score cannot be negative." };
  if (maxScore > 0 && rounded > maxScore + 0.001) {
    return { ok: false, error: `Score cannot exceed the maximum of ${maxScore}.` };
  }
  return { ok: true, score: rounded };
}

/**
 * Converts a score recorded on one scale to another (e.g. a homework out of 20
 * contributing 5 examination points). This is the ONLY place scales are mixed,
 * and it is always explicit.
 */
export function normalizeScoreToScale(
  score: number,
  fromMax: number,
  toMax: number,
): number {
  if (fromMax <= 0 || toMax <= 0) return 0;
  const clamped = Math.min(Math.max(score, 0), fromMax);
  return round4((clamped / fromMax) * toMax);
}

export function scorePercent(score: number, max: number): number {
  if (max <= 0) return 0;
  return round4((Math.min(Math.max(score, 0), max) / max) * 100);
}

export interface AssessmentDraftInput {
  title?: unknown;
  categoryKey?: unknown;
  assessedOn?: unknown;
  maxScore?: unknown;
  description?: unknown;
  subjectId?: unknown;
  classId?: unknown;
  academicYearId?: unknown;
  termLabel?: unknown;
  examId?: unknown;
  scope?: unknown;
  criterionCode?: unknown;
  framework?: unknown;
  source?: unknown;
  teacherComment?: unknown;
  contributionMethod?: unknown;
  contributionWeight?: unknown;
  contributionPoints?: unknown;
  contributesToResult?: unknown;
}

export interface AssessmentDraft {
  title: string;
  categoryKey: string;
  categoryLabel: string;
  categoryIsBuiltin: boolean;
  assessedOn: string;
  maxScore: number;
  description: string | null;
  subjectId: string | null;
  classId: string | null;
  academicYearId: string | null;
  termLabel: string | null;
  examId: string | null;
  scope: AssessmentScope;
  criterionCode: string | null;
  framework: AssessmentFramework;
  source: AssessmentSource;
  teacherComment: string | null;
  contributionMethod: ContributionMethod;
  contributionWeight: number;
  contributionPoints: number;
  contributesToResult: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function uuidOrNull(raw: unknown): string | null {
  return isUuid(raw) ? String(raw).trim() : null;
}

/**
 * Validates an assessment record. Returns every problem at once so the UI can
 * show a complete list instead of one error per round trip.
 */
export function validateAssessmentDraft(
  input: AssessmentDraftInput,
  context: { customCategories?: readonly AssessmentCategory[] } = {},
): { ok: true; value: AssessmentDraft } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  const title = text(input.title, 160);
  if (!title) errors.push({ field: "title", message: "An assessment title is required." });

  const category = resolveCategory(input.categoryKey, context.customCategories ?? []);
  if (!category) {
    errors.push({
      field: "categoryKey",
      message: "Choose a valid assessment category, or define the custom category first.",
    });
  }

  const assessedOn = isoDate(input.assessedOn);
  if (!assessedOn) errors.push({ field: "assessedOn", message: "A valid assessment date is required (YYYY-MM-DD)." });

  const maxScoreRaw = toNumber(input.maxScore);
  const maxScore = maxScoreRaw === null ? 0 : round2(maxScoreRaw);
  if (maxScoreRaw === null || maxScore <= 0) {
    errors.push({ field: "maxScore", message: "Maximum marks must be greater than zero." });
  } else if (maxScore > 1000) {
    errors.push({ field: "maxScore", message: "Maximum marks cannot exceed 1000." });
  }

  const scopeRaw = String(input.scope ?? "class");
  const scope: AssessmentScope = (ASSESSMENT_SCOPES as readonly string[]).includes(scopeRaw)
    ? (scopeRaw as AssessmentScope)
    : "class";

  const frameworkRaw = String(input.framework ?? "general").toLowerCase();
  const framework: AssessmentFramework = (ASSESSMENT_FRAMEWORKS as readonly string[]).includes(
    frameworkRaw,
  )
    ? (frameworkRaw as AssessmentFramework)
    : "general";

  const criterionCode = text(input.criterionCode, 8)?.toUpperCase() ?? null;
  if (criterionCode && !CRITERION_FRAMEWORKS.has(framework)) {
    errors.push({
      field: "criterionCode",
      message: `Criterion mapping requires a criterion-based framework (MYP); "${framework}" does not define criteria.`,
    });
  }

  const methodRaw = String(input.contributionMethod ?? "record_only");
  const contributionMethod: ContributionMethod = CONTRIBUTION_METHODS.some(
    (m) => m.value === methodRaw,
  )
    ? (methodRaw as ContributionMethod)
    : "record_only";

  const contributesToResult =
    input.contributesToResult === true || input.contributesToResult === "true";

  if (contributesToResult && contributionMethod === "record_only") {
    errors.push({
      field: "contributionMethod",
      message: "Choose a contribution method, or turn contribution off to record only.",
    });
  }
  if (!contributesToResult && contributionMethod !== "record_only") {
    errors.push({
      field: "contributesToResult",
      message: "Enable contribution before choosing a contribution method.",
    });
  }
  if (contributionMethod === "criterion" && !criterionCode) {
    errors.push({
      field: "criterionCode",
      message: "Criterion contributions require the criterion this assessment feeds (e.g. A, B, C or D).",
    });
  }

  const contributionWeightRaw = toNumber(input.contributionWeight);
  const contributionWeight = contributionWeightRaw === null ? 0 : round2(contributionWeightRaw);
  if (contributionWeight < 0 || contributionWeight > 100) {
    errors.push({ field: "contributionWeight", message: "Weight must be between 0 and 100." });
  }
  const contributionPointsRaw = toNumber(input.contributionPoints);
  const contributionPoints = contributionPointsRaw === null ? 0 : round2(contributionPointsRaw);
  if (contributionPoints < 0 || contributionPoints > 1000) {
    errors.push({ field: "contributionPoints", message: "Point value must be between 0 and 1000." });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title: title as string,
      categoryKey: (category as AssessmentCategory).key,
      categoryLabel: (category as AssessmentCategory).label,
      categoryIsBuiltin: (category as AssessmentCategory).builtin,
      assessedOn: assessedOn as string,
      maxScore,
      description: text(input.description, 4000),
      subjectId: uuidOrNull(input.subjectId),
      classId: uuidOrNull(input.classId),
      academicYearId: uuidOrNull(input.academicYearId),
      termLabel: text(input.termLabel, 120),
      examId: uuidOrNull(input.examId),
      scope,
      criterionCode,
      framework,
      source: (["manual", "import", "individual"] as string[]).includes(String(input.source ?? ""))
        ? (String(input.source) as AssessmentSource)
        : "manual",
      teacherComment: text(input.teacherComment, 4000),
      contributionMethod,
      contributionWeight,
      contributionPoints,
      contributesToResult,
    },
  };
}

// ─────────────────────────── Consolidation engine ───────────────────────────

export interface ConsolidationAssessmentInput {
  id: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  maxScore: number;
  /** Percentage weight (Method B). */
  weight: number;
  /** Points on the examination scale (Methods A and C). */
  pointValue: number;
  criterionCode: string | null;
  included: boolean;
  /** attemptId → recorded score, or null when the student has no score. */
  scoresByAttempt: Record<string, number | null>;
}

export interface ConsolidationAttemptInput {
  attemptId: string;
  studentId: string | null;
  candidateName: string;
  /** The ORIGINAL examination score — never modified by consolidation. */
  originalExamScore: number;
  examMaxScore: number;
  /** Signed total of the unlimited individual adjustment ledger. */
  adjustmentTotal: number;
  /** Exam criterion marks, when the framework provides them. */
  criterionMarks?: Record<string, { awarded: number; max: number }>;
  /** false when the profile's scope excludes this student. */
  included: boolean;
}

export interface ConsolidationProfileInput {
  method: ContributionMethod;
  /** Examination weight percentage (Method B). */
  examWeight: number;
  /** When true a missing score is skipped with a warning instead of an error. */
  allowMissingScores?: boolean;
}

export interface ConsolidationContributionRow {
  id: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  criterionCode: string | null;
  score: number | null;
  maxScore: number;
  percent: number | null;
  weight: number;
  pointValue: number;
  /** Points this assessment adds on the examination scale. */
  points: number;
  included: boolean;
  missing: boolean;
}

export interface ConsolidationCriterionRow {
  code: string;
  examAwarded: number;
  examMax: number;
  supplementary: number;
  total: number;
  totalMax: number;
}

export interface ConsolidationRow {
  attemptId: string;
  studentId: string | null;
  candidateName: string;
  included: boolean;
  originalExamScore: number;
  examMaxScore: number;
  adjustmentTotal: number;
  contributions: ConsolidationContributionRow[];
  contributionTotal: number;
  consolidatedScore: number;
  consolidatedMax: number;
  percent: number | null;
  criterionBreakdown: ConsolidationCriterionRow[];
  errors: string[];
  warnings: string[];
  valid: boolean;
}

export interface ConsolidationResult {
  method: ContributionMethod;
  examWeight: number;
  rows: ConsolidationRow[];
  includedRows: ConsolidationRow[];
  errors: string[];
  warnings: string[];
  studentCount: number;
  includedCount: number;
  validRowCount: number;
  invalidRowCount: number;
  averageOriginalPercent: number | null;
  averageConsolidatedPercent: number | null;
  /** Publication is blocked while any included row is invalid. */
  canPublish: boolean;
}

/**
 * Validates a consolidation configuration before any calculation. Invalid
 * weights, duplicate contributions and method/assessment mismatches are caught
 * here so the engine never has to guess.
 */
export function validateConsolidationProfile(
  profile: ConsolidationProfileInput,
  assessments: readonly ConsolidationAssessmentInput[],
): FieldError[] {
  const errors: FieldError[] = [];
  const included = assessments.filter((a) => a.included);

  const seen = new Set<string>();
  for (const assessment of assessments) {
    if (seen.has(assessment.id)) {
      errors.push({
        field: "inclusions",
        message: `Assessment "${assessment.title}" appears twice; a contribution can only be counted once.`,
      });
    }
    seen.add(assessment.id);
    if (assessment.maxScore <= 0) {
      errors.push({
        field: `assessment:${assessment.id}`,
        message: `Assessment "${assessment.title}" has no maximum marks and cannot be normalized.`,
      });
    }
  }

  if (profile.method !== "record_only" && included.length === 0) {
    errors.push({
      field: "inclusions",
      message: "Select at least one contributing assessment, or choose Method E (record only).",
    });
  }

  for (const assessment of included) {
    if (profile.method === "weighted" && assessment.weight <= 0) {
      errors.push({
        field: `weight:${assessment.id}`,
        message: `"${assessment.title}" needs a weight greater than zero for weighted consolidation.`,
      });
    }
    if ((profile.method === "direct_points" || profile.method === "points_based") && assessment.pointValue <= 0) {
      errors.push({
        field: `pointValue:${assessment.id}`,
        message: `"${assessment.title}" needs a point value greater than zero for ${profile.method.replace("_", " ")} consolidation.`,
      });
    }
    if (profile.method === "criterion" && !assessment.criterionCode) {
      errors.push({
        field: `criterion:${assessment.id}`,
        message: `"${assessment.title}" must be mapped to a criterion for criterion-specific consolidation.`,
      });
    }
  }

  if (profile.method === "weighted") {
    const totalWeight = round2(
      profile.examWeight + included.reduce((sum, a) => sum + a.weight, 0),
    );
    if (Math.abs(totalWeight - 100) > 0.01) {
      errors.push({
        field: "examWeight",
        message: `Weights must total 100% (examination ${profile.examWeight}% + assessments ${round2(
          included.reduce((sum, a) => sum + a.weight, 0),
        )}% = ${totalWeight}%).`,
      });
    }
  }

  if (profile.examWeight < 0 || profile.examWeight > 100) {
    errors.push({ field: "examWeight", message: "Examination weight must be between 0 and 100." });
  }

  return errors;
}

/**
 * The single consolidation calculation. Preview and publish call this same
 * function with the same inputs, so the numbers a teacher reviews are exactly
 * the numbers that get stored.
 */
export function computeConsolidation(args: {
  profile: ConsolidationProfileInput;
  assessments: readonly ConsolidationAssessmentInput[];
  attempts: readonly ConsolidationAttemptInput[];
}): ConsolidationResult {
  const { profile } = args;
  const assessments = args.assessments ?? [];
  const attempts = args.attempts ?? [];
  const includedAssessments = assessments.filter((a) => a.included);
  const profileErrors = validateConsolidationProfile(profile, assessments);

  const rows: ConsolidationRow[] = [];
  const globalWarnings: string[] = [];
  let missingScoreCount = 0;

  for (const attempt of attempts) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const examMaxScore = round2(Math.max(0, Number(attempt.examMaxScore) || 0));
    const originalExamScore = round2(Math.max(0, Number(attempt.originalExamScore) || 0));
    const adjustmentTotal = round2(Number(attempt.adjustmentTotal) || 0);

    if (examMaxScore <= 0) {
      errors.push("This attempt has no examination maximum, so no consolidated result can be produced.");
    }
    if (originalExamScore > examMaxScore + 0.001) {
      errors.push("The recorded examination score exceeds the examination maximum.");
    }

    const contributions: ConsolidationContributionRow[] = [];
    let contributionTotal = 0;
    const criterionSupplementary = new Map<string, number>();

    for (const assessment of includedAssessments) {
      const raw = attempt.included
        ? (assessment.scoresByAttempt[attempt.attemptId] ?? null)
        : null;
      const missing = attempt.included && (raw === null || raw === undefined);
      if (missing) {
        missingScoreCount += 1;
        if (profile.allowMissingScores) {
          warnings.push(`No score recorded for "${assessment.title}" — excluded from this student's total.`);
        } else {
          errors.push(`Missing score for "${assessment.title}".`);
        }
      }

      let points = 0;
      if (!missing && attempt.included) {
        const score = round2(Math.min(Math.max(Number(raw), 0), assessment.maxScore));
        switch (profile.method) {
          case "direct_points":
          case "points_based":
            points = round2(normalizeScoreToScale(score, assessment.maxScore, assessment.pointValue));
            break;
          case "weighted":
            points = round4((scorePercent(score, assessment.maxScore) * assessment.weight) / 100);
            break;
          case "criterion":
            points = round2(normalizeScoreToScale(score, assessment.maxScore, assessment.pointValue));
            if (assessment.criterionCode) {
              criterionSupplementary.set(
                assessment.criterionCode,
                round2((criterionSupplementary.get(assessment.criterionCode) ?? 0) + points),
              );
            }
            break;
          case "record_only":
          default:
            points = 0;
            break;
        }
      }

      contributionTotal = round4(contributionTotal + points);

      contributions.push({
        id: assessment.id,
        title: assessment.title,
        categoryKey: assessment.categoryKey,
        categoryLabel: assessment.categoryLabel,
        criterionCode: assessment.criterionCode,
        score: missing ? null : round2(Number(raw)),
        maxScore: assessment.maxScore,
        percent: missing ? null : scorePercent(Number(raw), assessment.maxScore),
        weight: assessment.weight,
        pointValue: assessment.pointValue,
        points: attempt.included ? points : 0,
        included: attempt.included,
        missing,
      });
    }

    let consolidatedScore: number;
    let consolidatedMax: number;

    switch (profile.method) {
      case "weighted": {
        const examPercent = scorePercent(originalExamScore, examMaxScore);
        const weighted = (examPercent * profile.examWeight) / 100 + contributionTotal;
        consolidatedMax = examMaxScore;
        consolidatedScore = round2(Math.min(examMaxScore, Math.max(0, (weighted / 100) * examMaxScore)));
        break;
      }
      case "points_based": {
        const extraMax = round2(includedAssessments.reduce((sum, a) => sum + a.pointValue, 0));
        consolidatedMax = round2(examMaxScore + extraMax);
        consolidatedScore = round2(
          Math.min(
            consolidatedMax,
            Math.max(0, originalExamScore + adjustmentTotal + round2(contributionTotal)),
          ),
        );
        break;
      }
      case "direct_points":
      case "criterion": {
        consolidatedMax = examMaxScore;
        consolidatedScore = round2(
          Math.min(examMaxScore, Math.max(0, originalExamScore + adjustmentTotal + round2(contributionTotal))),
        );
        break;
      }
      case "record_only":
      default: {
        consolidatedMax = examMaxScore;
        consolidatedScore = round2(
          Math.min(examMaxScore, Math.max(0, originalExamScore + adjustmentTotal)),
        );
        break;
      }
    }

    // Criterion breakdown (Method D, or any attempt that carries criterion marks).
    const criterionBreakdown: ConsolidationCriterionRow[] = [];
    const criterionMarks = attempt.criterionMarks ?? {};
    const codes = new Set<string>([
      ...Object.keys(criterionMarks),
      ...criterionSupplementary.keys(),
    ]);
    for (const code of [...codes].sort()) {
      const exam = criterionMarks[code] ?? { awarded: 0, max: 0 };
      const supplementary = round2(criterionSupplementary.get(code) ?? 0);
      const examAwarded = round2(Math.max(0, Number(exam.awarded) || 0));
      const examMax = round2(Math.max(0, Number(exam.max) || 0));
      criterionBreakdown.push({
        code,
        examAwarded,
        examMax,
        supplementary,
        total: round2(examAwarded + supplementary),
        totalMax: examMax,
      });
    }

    rows.push({
      attemptId: attempt.attemptId,
      studentId: attempt.studentId,
      candidateName: attempt.candidateName,
      included: attempt.included,
      originalExamScore,
      examMaxScore,
      adjustmentTotal,
      contributions,
      contributionTotal: round2(contributionTotal),
      consolidatedScore,
      consolidatedMax,
      percent: consolidatedMax > 0 ? round2((consolidatedScore / consolidatedMax) * 100) : null,
      criterionBreakdown,
      errors,
      warnings,
      valid: errors.length === 0,
    });
  }

  const includedRows = rows.filter((r) => r.included);
  const invalidRowCount = includedRows.filter((r) => !r.valid).length;
  const errors: string[] = profileErrors.map((error) => error.message);
  if (missingScoreCount > 0 && !profile.allowMissingScores) {
    errors.push(
      `${missingScoreCount} score${missingScoreCount === 1 ? " is" : "s are"} missing. Record the score, exclude the assessment, or enable "skip missing scores".`,
    );
  }
  if (profile.allowMissingScores && missingScoreCount > 0) {
    globalWarnings.push(
      `${missingScoreCount} missing score${missingScoreCount === 1 ? " was" : "s were"} skipped rather than counted as zero.`,
    );
  }

  const percentValues = (list: ConsolidationRow[], pick: (r: ConsolidationRow) => number | null) => {
    const values = list.map(pick).filter((v): v is number => v !== null);
    if (!values.length) return null;
    return round2(values.reduce((sum, v) => sum + v, 0) / values.length);
  };

  return {
    method: profile.method,
    examWeight: profile.examWeight,
    rows,
    includedRows,
    errors,
    warnings: globalWarnings,
    studentCount: rows.length,
    includedCount: includedRows.length,
    validRowCount: includedRows.length - invalidRowCount,
    invalidRowCount,
    averageOriginalPercent: percentValues(
      includedRows,
      (r) => (r.examMaxScore > 0 ? round2((r.originalExamScore / r.examMaxScore) * 100) : null),
    ),
    averageConsolidatedPercent: percentValues(includedRows, (r) => r.percent),
    canPublish: errors.length === 0 && invalidRowCount === 0 && includedRows.length > 0,
  };
}

/**
 * Candidate-facing projection. Only published, included contributions are ever
 * exposed, and only the fields a candidate is allowed to see: no actor, no
 * internal ids, no other student's data.
 */
export interface CandidateContributionView {
  title: string;
  categoryLabel: string;
  score: number;
  maxScore: number;
  percent: number;
  method: ContributionMethod;
  contributionPoints: number;
  criterionCode: string | null;
  teacherComment: string | null;
}

export function buildCandidateContributionView(args: {
  assessment: {
    title: string;
    categoryLabel: string;
    contributionMethod: ContributionMethod;
    teacherComment?: string | null;
  };
  score: { score: number; maxScore: number; criterionCode?: string | null };
  contributionPoints: number;
}): CandidateContributionView {
  return {
    title: args.assessment.title,
    categoryLabel: args.assessment.categoryLabel,
    score: round2(args.score.score),
    maxScore: round2(args.score.maxScore),
    percent: scorePercent(args.score.score, args.score.maxScore),
    method: args.assessment.contributionMethod,
    contributionPoints: round2(args.contributionPoints),
    criterionCode: args.score.criterionCode?.toUpperCase() ?? null,
    teacherComment: text(args.assessment.teacherComment, 1000),
  };
}
