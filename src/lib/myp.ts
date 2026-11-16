/**
 * MYP criterion results and the overall 1–7 grade — one authoritative engine.
 *
 * Every surface (student result page, teacher results, Super Admin dashboard,
 * individual PDF, collective PDF, Excel export) calls the functions in this
 * module through the same server loader (src/lib/mypResults.ts). Nothing is
 * recomputed differently in a view or an exporter, so the seven surfaces can
 * never disagree about a mark, a criterion level or an overall grade.
 *
 * Three rules are structural, not cosmetic:
 *
 *  1. A missing or unmarked criterion is NEVER converted to level 0. It gets a
 *     status (`not_assessed`, `pending_marking`, `partially_marked`) and a null
 *     level. Level 0 exists only for a criterion that was fully marked and
 *     earned nothing, and it is labelled as such.
 *  2. The overall grade is NOT a conversion of the raw examination percentage.
 *     It is the sum of criterion achievement levels (0–8 each) mapped through
 *     the configured 1–7 grade boundaries for that subject/framework.
 *  3. Boundaries are configuration, not code: they are read from the database
 *     (`myp_grade_boundaries`, `myp_level_boundaries`). The built-in defaults in
 *     this file are the documented fallbacks used only when an organization has
 *     not configured its own, and every report states which set was used.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * MYP levels (years 1–5) and paper/subject identifiers
 * ───────────────────────────────────────────────────────────────────────── */

export const MYP_YEARS = [1, 2, 3, 4, 5] as const;
export type MypYear = (typeof MYP_YEARS)[number];

export const MYP_YEAR_LABEL: Record<number, string> = {
  1: "MYP 1",
  2: "MYP 2",
  3: "MYP 3",
  4: "MYP 4",
  5: "MYP 5",
};

export function isMypYear(value: unknown): value is MypYear {
  const n = typeof value === "number" ? value : Number(value);
  return (MYP_YEARS as readonly number[]).includes(n);
}

/**
 * The MYP year for a class or an explicit override.
 *
 * Order matters: an explicit override wins, then the class name/code (schools
 * write "MYP 3", "MYP3", "Grade 8 — MYP 3"), and only then the ladder from the
 * curriculum module (grade order 6–10 ↔ MYP 1–5). The ladder is a fallback for
 * classes whose names do not carry the MYP label at all.
 */
export function resolveMypYear(input: {
  override?: unknown;
  className?: string | null;
  classCode?: string | null;
  gradeOrder?: number | null;
}): MypYear | null {
  const explicit = typeof input.override === "string" ? input.override.match(/myp\s*([1-5])/i) : null;
  if (explicit) return Number(explicit[1]) as MypYear;
  if (isMypYear(input.override)) return Number(input.override) as MypYear;

  for (const text of [input.className, input.classCode]) {
    if (!text) continue;
    const match = text.match(/myp\s*[-_ ]?\s*([1-5])/i);
    if (match) return Number(match[1]) as MypYear;
  }

  const order = Number(input.gradeOrder);
  if (Number.isFinite(order) && order >= 6 && order <= 10) return (order - 5) as MypYear;
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Criteria
 * ───────────────────────────────────────────────────────────────────────── */

/** A criterion configured for a subject, as stored in `myp_criteria`. */
export interface MypCriterionConfig {
  code: string;
  title: string;
  description: string | null;
  position: number;
}

/** The canonical key used to compare criterion labels ("a" → "A"). */
export function normalizeCriterion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  return key.length ? key : null;
}

/** Report order: configured position first, then letter, then alphabetically. */
export function orderCriteria(codes: string[], config: MypCriterionConfig[]): string[] {
  const rank = new Map<string, number>();
  config.forEach((criterion, index) => {
    rank.set(normalizeCriterion(criterion.code) ?? criterion.code, index);
  });
  return [...new Set(codes.map((code) => normalizeCriterion(code) ?? code))]
    .filter(Boolean)
    .sort((a, b) => {
      const ra = rank.has(a) ? (rank.get(a) as number) : 1000;
      const rb = rank.has(b) ? (rank.get(b) as number) : 1000;
      return ra - rb || a.localeCompare(b);
    });
}

/**
 * The criteria a paper is reported against: every criterion configured for the
 * subject, plus any criterion that actually appears on the paper (so a school
 * that has not configured a subject yet still gets an accurate report instead of
 * an empty one).
 */
export function criteriaForPaper(
  configured: MypCriterionConfig[],
  paperCodes: string[],
): MypCriterionConfig[] {
  const byCode = new Map<string, MypCriterionConfig>();
  for (const criterion of configured) {
    const code = normalizeCriterion(criterion.code);
    if (!code) continue;
    byCode.set(code, { ...criterion, code, position: Number(criterion.position) || 0 });
  }
  for (const raw of paperCodes) {
    const code = normalizeCriterion(raw);
    if (!code || byCode.has(code)) continue;
    // No invented title: the letter alone is honest about an unconfigured
    // criterion, and the report says the subject has no configured criterion
    // set for this code.
    byCode.set(code, { code, title: "", description: null, position: 900 });
  }
  return orderCriteria([...byCode.keys()], configured.length ? configured : [...byCode.values()]).map(
    (code) => byCode.get(code) as MypCriterionConfig,
  );
}

/** "Criterion A — Knowing and understanding", or just "Criterion E". */
export function criterionHeading(code: string, title?: string | null): string {
  const key = normalizeCriterion(code) ?? code;
  const clean = (title ?? "").trim();
  return clean ? `Criterion ${key} — ${clean}` : `Criterion ${key}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Boundaries
 * ───────────────────────────────────────────────────────────────────────── */

/** Minimum percentage that earns each achievement level (0–8). */
export interface MypLevelBoundary {
  level: number;
  minPercent: number;
}

/** Inclusive total-level band that earns each overall grade (1–7). */
export interface MypGradeBoundary {
  minTotal: number;
  maxTotal: number;
  grade: number;
}

/**
 * Fallback criterion-level conversion used only when a subject has no stored
 * boundaries. It is a school policy, not an IB-published boundary: the IB does
 * not publish percentage thresholds for criteria, so every report labels a
 * derived level as "derived from the marks on this paper".
 */
export const DEFAULT_LEVEL_BOUNDARIES: MypLevelBoundary[] = [
  { level: 0, minPercent: 0 },
  { level: 1, minPercent: 1 },
  { level: 2, minPercent: 20 },
  { level: 3, minPercent: 35 },
  { level: 4, minPercent: 50 },
  { level: 5, minPercent: 65 },
  { level: 6, minPercent: 75 },
  { level: 7, minPercent: 85 },
  { level: 8, minPercent: 95 },
];

/**
 * Published IB MYP grade boundaries for a subject with four criteria of 8:
 * the criterion totals (0–32) map to the overall grade 1–7. Used only when an
 * organization has not configured its own boundaries, and always reported with
 * this source note.
 */
export const DEFAULT_GRADE_BOUNDARIES: MypGradeBoundary[] = [
  { minTotal: 0, maxTotal: 5, grade: 1 },
  { minTotal: 6, maxTotal: 9, grade: 2 },
  { minTotal: 10, maxTotal: 14, grade: 3 },
  { minTotal: 15, maxTotal: 18, grade: 4 },
  { minTotal: 19, maxTotal: 23, grade: 5 },
  { minTotal: 24, maxTotal: 27, grade: 6 },
  { minTotal: 28, maxTotal: 32, grade: 7 },
];

export const DEFAULT_LEVEL_SOURCE =
  "EVALORA default criterion-level conversion — percentage of criterion marks to MYP achievement level (school-configurable; not an IB-published boundary)";
export const DEFAULT_GRADE_SOURCE =
  "IB MYP published grade boundaries — total criterion levels 0–32 to overall grade 1–7 (four criteria of 8)";

/** Clean and order stored level boundaries so level lookup is deterministic. */
export function normalizeLevelBoundaries(boundaries: MypLevelBoundary[]): MypLevelBoundary[] {
  const cleaned = (boundaries ?? [])
    .map((row) => ({ level: Math.round(Number(row.level)), minPercent: Number(row.minPercent) }))
    .filter((row) => Number.isFinite(row.level) && Number.isFinite(row.minPercent))
    .filter((row) => row.level >= 0 && row.level <= 8)
    .sort((a, b) => a.level - b.level);
  // A level set must define level 0 at 0% or the lowest achieved mark would be
  // reported as "not assessed" rather than level 0.
  if (!cleaned.some((row) => row.level === 0)) cleaned.unshift({ level: 0, minPercent: 0 });
  return cleaned;
}

export function normalizeGradeBoundaries(boundaries: MypGradeBoundary[]): MypGradeBoundary[] {
  return (boundaries ?? [])
    .map((row) => ({
      minTotal: Math.round(Number(row.minTotal)),
      maxTotal: Math.round(Number(row.maxTotal)),
      grade: Math.round(Number(row.grade)),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.minTotal) &&
        Number.isFinite(row.maxTotal) &&
        row.minTotal >= 0 &&
        row.maxTotal >= row.minTotal &&
        row.grade >= 1 &&
        row.grade <= 7,
    )
    .sort((a, b) => a.minTotal - b.minTotal);
}

/**
 * Achievement level (0–8) for a percentage of a criterion's marks. A fully
 * marked criterion that earned nothing is level 0 — the caller decides whether
 * the criterion counts as assessed at all.
 */
export function levelFromPercent(
  percent: number,
  boundaries: MypLevelBoundary[] = DEFAULT_LEVEL_BOUNDARIES,
): number {
  if (!Number.isFinite(percent) || percent < 0) return 0;
  const rows = normalizeLevelBoundaries(boundaries).sort((a, b) => b.level - a.level);
  for (const row of rows) {
    if (percent >= row.minPercent) return Math.max(0, Math.min(8, row.level));
  }
  return 0;
}

/** Overall grade 1–7 for a total of criterion levels, or null outside bounds. */
export function gradeFromTotal(
  total: number,
  boundaries: MypGradeBoundary[] = DEFAULT_GRADE_BOUNDARIES,
): number | null {
  if (!Number.isFinite(total)) return null;
  const rounded = Math.round(total);
  for (const row of normalizeGradeBoundaries(boundaries)) {
    if (rounded >= row.minTotal && rounded <= row.maxTotal) return row.grade;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Status vocabulary
 * ───────────────────────────────────────────────────────────────────────── */

export type MypCriterionStatus =
  | "assessed"
  | "partially_marked"
  | "pending_marking"
  | "not_assessed";

export const CRITERION_STATUS_LABEL: Record<MypCriterionStatus, string> = {
  assessed: "Assessed",
  partially_marked: "Partially marked",
  pending_marking: "Pending marking",
  not_assessed: "Not assessed",
};

export type MypGradeStatus = "final" | "provisional" | "incomplete" | "not_applicable";

export const GRADE_STATUS_LABEL: Record<MypGradeStatus, string> = {
  final: "Final",
  provisional: "Provisional",
  incomplete: "Incomplete",
  not_applicable: "Not applicable",
};

const TERMINAL_ATTEMPT_STATUSES = new Set([
  "submitted",
  "auto_submitted",
  "graded",
  "closed",
  "expired",
  "voided",
]);

/** True when the attempt is no longer being written to. */
export function attemptIsFinal(status: string | null | undefined, submittedAt: string | null | undefined): boolean {
  if (submittedAt) return true;
  return TERMINAL_ATTEMPT_STATUSES.has((status ?? "").toLowerCase());
}

/* ─────────────────────────────────────────────────────────────────────────
 * Inputs
 * ───────────────────────────────────────────────────────────────────────── */

export interface MypPaperQuestion {
  questionId: string;
  points: number;
  criterion: string | null;
  topic?: string | null;
  type?: string | null;
  subjectId?: string | null;
  /** Short prompt excerpt shown (escaped) as evidence in exports. */
  prompt?: string | null;
}

export interface MypAnswer {
  questionId: string;
  pointsAwarded: number | null;
  isCorrect?: boolean | null;
  markerNote?: string | null;
  moderationStatus?: string | null;
}

export interface MypAttemptInput {
  attemptId: string;
  examId: string;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  examTitle: string;
  examDate: string | null;
  examStatus?: string | null;
  attemptStatus: string;
  submittedAt: string | null;
  score?: number | null;
  maxScore?: number | null;
  published: boolean;
  publishedAt?: string | null;
  resultPublicationMode?: string | null;
  studentName: string;
  studentRef?: string | null;
  studentId?: string | null;
  candidateRef?: string | null;
  className: string | null;
  classCode?: string | null;
  classGradeOrder?: number | null;
  mypYear: MypYear | null;
  subjectNames: string[];
  subjectId: string | null;
  reportingPeriod?: string | null;
}

export interface MypRules {
  criteria: MypCriterionConfig[];
  levelBoundaries: MypLevelBoundary[];
  gradeBoundaries: MypGradeBoundary[];
  levelSource: string;
  gradeSource: string;
  requireAllCriteria: boolean;
  /** Total marks a subject's criteria scale uses (four criteria × 8 = 32). */
  criteriaMaxLevel: number;
  source: "configured" | "default";
}

export interface CriterionResult {
  code: string;
  title: string;
  description: string | null;
  heading: string;
  configured: boolean;
  status: MypCriterionStatus;
  statusLabel: string;
  marksAwarded: number;
  marksMax: number;
  percent: number | null;
  /** Achievement level 0–8, or null when the criterion is not fully marked. */
  level: number | null;
  /** True when the criterion is fully assessed and earned level 0. */
  assessedAtZero: boolean;
  questionCount: number;
  markedCount: number;
  pendingCount: number;
  feedback: string | null;
  strengths: string[];
  improvements: string[];
  topics: { topic: string; awarded: number; max: number; percent: number }[];
}

export interface MypResult {
  attemptId: string;
  examId: string;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  examTitle: string;
  examDate: string | null;
  examStatus: string | null;
  attemptStatus: string;
  submittedAt: string | null;
  published: boolean;
  publishedAt: string | null;
  publicationLabel: string;
  studentName: string;
  studentRef: string | null;
  studentId: string | null;
  candidateRef: string | null;
  className: string | null;
  mypYear: MypYear | null;
  mypYearLabel: string | null;
  subjectNames: string[];
  subjectLabel: string;
  subjectId: string | null;
  reportingPeriod: string | null;
  criteria: CriterionResult[];
  hasCriteria: boolean;
  marksAwarded: number;
  marksMax: number;
  percent: number | null;
  /** Sum of achievement levels across the aggregated criteria. */
  totalLevels: number | null;
  totalLevelsMax: number;
  overallGrade: number | null;
  gradeStatus: MypGradeStatus;
  gradeStatusLabel: string;
  gradeSource: string;
  levelSource: string;
  gradeNote: string;
  pendingCriteria: string[];
  unassessedCriteria: string[];
  teacherFeedback: string[];
  strengths: string[];
  improvements: string[];
  /** Config used for this subject, surfaced on the grading-configuration sheet. */
  rules: MypRules;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Building one authoritative result
 * ───────────────────────────────────────────────────────────────────────── */

const round = (value: number, places = 2): number => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const pct = (awarded: number, max: number): number | null =>
  max > 0 ? round((awarded / max) * 100, 1) : null;

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Build the criterion and overall result for one attempt.
 *
 * The caller supplies the paper (every question in the examination's quiz), the
 * answers that exist, and the configured rules. Answers for questions that are
 * not on the paper are ignored rather than trusted.
 */
export function buildMypResult(args: {
  attempt: MypAttemptInput;
  paper: MypPaperQuestion[];
  answers: MypAnswer[];
  rules: MypRules;
}): MypResult {
  const { attempt, rules } = args;
  const final = attemptIsFinal(attempt.attemptStatus, attempt.submittedAt);

  const answerByQuestion = new Map<string, MypAnswer>();
  for (const answer of args.answers ?? []) answerByQuestion.set(answer.questionId, answer);

  const paper = (args.paper ?? []).filter((question) => Number(question.points) > 0);
  const paperCodes = paper
    .map((question) => normalizeCriterion(question.criterion))
    .filter((code): code is string => Boolean(code));

  const criteriaConfig = criteriaForPaper(rules.criteria ?? [], paperCodes);

  const criteria: CriterionResult[] = criteriaConfig.map((config) => {
    const questions = paper.filter((question) => normalizeCriterion(question.criterion) === config.code);
    const marksMax = round(questions.reduce((sum, question) => sum + Number(question.points), 0));
    let marksAwarded = 0;
    let markedCount = 0;
    let pendingCount = 0;
    const notes = new Set<string>();
    const topics = new Map<string, { awarded: number; max: number }>();

    for (const question of questions) {
      const answer = answerByQuestion.get(question.questionId);
      const awarded = answer?.pointsAwarded;
      const isMarked = awarded !== null && awarded !== undefined && Number.isFinite(Number(awarded));
      if (isMarked) {
        markedCount += 1;
        const safe = Math.max(0, Math.min(Number(question.points), Number(awarded)));
        marksAwarded += safe;
        const topic = cleanText(question.topic) ?? "General";
        const row = topics.get(topic) ?? { awarded: 0, max: 0 };
        row.awarded += safe;
        row.max += Number(question.points);
        topics.set(topic, row);
      } else {
        pendingCount += 1;
      }
      const note = cleanText(answer?.markerNote);
      if (note) notes.add(note);
    }

    marksAwarded = round(marksAwarded);

    let status: MypCriterionStatus;
    if (questions.length === 0) status = "not_assessed";
    else if (final && pendingCount === 0) status = "assessed";
    else if (markedCount > 0) status = "partially_marked";
    else status = "pending_marking";

    const percent = status === "not_assessed" ? null : pct(marksAwarded, marksMax);
    const level = status === "assessed" && percent !== null ? levelFromPercent(percent, rules.levelBoundaries) : null;

    const topicRows = [...topics.entries()]
      .map(([topic, value]) => ({
        topic,
        awarded: round(value.awarded),
        max: round(value.max),
        percent: pct(value.awarded, value.max) ?? 0,
      }))
      .sort((a, b) => a.percent - b.percent || a.topic.localeCompare(b.topic));

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (status === "assessed" || status === "partially_marked") {
      if (level !== null && level >= 6) {
        strengths.push(`Secure at level ${level} / 8 for ${config.title || `Criterion ${config.code}`}.`);
      } else if (percent !== null && percent >= 70) {
        strengths.push(`Solid grasp of ${config.title || `Criterion ${config.code}`} (${percent}% of the criterion marks).`);
      }
      const strongest = [...topicRows].sort((a, b) => b.percent - a.percent)[0];
      if (strongest && strongest.percent >= 70) strengths.push(`Strongest topic: ${strongest.topic} (${strongest.percent}% of its marks).`);
      if (percent !== null && percent < 65) {
        improvements.push(`Revisit the work assessed by ${config.title || `Criterion ${config.code}`}: ${percent}% of the criterion marks were earned.`);
      }
      const weakest = topicRows[0];
      if (weakest && weakest.percent < 50) improvements.push(`Most marks lost in ${weakest.topic} (${weakest.percent}% earned).`);
    }

    return {
      code: config.code,
      title: config.title,
      description: config.description,
      heading: criterionHeading(config.code, config.title),
      configured: Boolean(config.title),
      status,
      statusLabel: CRITERION_STATUS_LABEL[status],
      marksAwarded,
      marksMax,
      percent,
      level,
      assessedAtZero: status === "assessed" && level === 0,
      questionCount: questions.length,
      markedCount,
      pendingCount,
      feedback: notes.size ? [...notes].slice(0, 3).join(" · ") : null,
      strengths,
      improvements,
      topics: topicRows,
    };
  });

  const usedCriteria = criteria.filter((criterion) => criterion.questionCount > 0);
  const requiredCriteria = criteria.length
    ? criteria
    : usedCriteria;
  const assessed = requiredCriteria.filter((criterion) => criterion.status === "assessed");
  const pendingCriteria = requiredCriteria
    .filter((criterion) => criterion.status === "pending_marking" || criterion.status === "partially_marked")
    .map((criterion) => criterion.code);
  const unassessedCriteria = requiredCriteria
    .filter((criterion) => criterion.status === "not_assessed")
    .map((criterion) => criterion.code);

  // The paper is the denominator. A question the candidate left blank counts as
  // zero out of its value once the attempt is final; a question whose answer is
  // still awaiting a mark is excluded from BOTH sides (its criterion is already
  // reported as pending), so a provisional percentage is never deflated by
  // work that has not been marked yet. A criterion-less question still counts in
  // the marks, which is why a non-criterion paper can report a percentage even
  // though it has no MYP grade.
  let marksAwardedRaw = 0;
  let marksMaxRaw = 0;
  for (const question of paper) {
    const answer = answerByQuestion.get(question.questionId);
    const marked = answer?.pointsAwarded !== null && answer?.pointsAwarded !== undefined;
    const blankOnFinalPaper = !answer && final;
    if (!marked && !blankOnFinalPaper && final) continue; // pending marking
    marksMaxRaw += Number(question.points);
    if (marked) {
      marksAwardedRaw += Math.max(0, Math.min(Number(question.points), Number(answer?.pointsAwarded)));
    }
  }
  const marksMax = round(marksMaxRaw);
  const marksAwarded = round(marksAwardedRaw);
  const percent = pct(marksAwarded, marksMax);

  const complete = requiredCriteria.length > 0 && assessed.length === requiredCriteria.length;
  const totalLevels = assessed.length
    ? round(assessed.reduce((sum, criterion) => sum + (criterion.level ?? 0), 0), 0)
    : null;
  const criteriaMaxLevel = rules.criteriaMaxLevel || 8;
  const totalLevelsMax = requiredCriteria.length * criteriaMaxLevel;

  let gradeStatus: MypGradeStatus;
  let overallGrade: number | null = null;
  if (!requiredCriteria.length || paperCodes.length === 0) {
    // A paper with no criterion-mapped question cannot carry criterion levels,
    // even when the subject has criteria configured: there is simply no
    // evidence to level. That is "not applicable", not an incomplete result.
    gradeStatus = "not_applicable";
  } else if (complete) {
    gradeStatus = "final";
    overallGrade = gradeFromTotal(totalLevels ?? 0, rules.gradeBoundaries);
  } else if (!rules.requireAllCriteria && assessed.length > 0) {
    // The organization's assessment rules explicitly allow aggregating the
    // criteria that are fully marked; the grade is then provisional by nature.
    gradeStatus = "provisional";
    overallGrade = gradeFromTotal(totalLevels ?? 0, rules.gradeBoundaries);
  } else {
    gradeStatus = "incomplete";
  }

  const subjectLabel = attempt.subjectNames.length === 0
    ? "Subject not recorded"
    : attempt.subjectNames.length === 1
      ? attempt.subjectNames[0]
      : `Multiple subjects (${attempt.subjectNames.join(", ")})`;

  const gradeNote =
    gradeStatus === "final"
      ? `Overall grade from the configured boundaries for ${subjectLabel} (${rules.gradeSource}).`
      : gradeStatus === "provisional"
        ? "Provisional: some criteria are not fully marked, and this organization's assessment rules allow aggregating the criteria that are marked."
        : gradeStatus === "incomplete"
          ? "No overall grade is calculated yet: every required criterion must be marked before the criterion levels can be aggregated."
          : "This paper is not criterion-mapped, so no overall MYP grade applies.";

  const teacherFeedback = uniqueStrings(
    criteria.flatMap((criterion) => (criterion.feedback ? [criterion.feedback] : [])),
  ).slice(0, 6);
  const strengths = uniqueStrings(criteria.flatMap((criterion) => criterion.strengths)).slice(0, 8);
  const improvements = uniqueStrings(criteria.flatMap((criterion) => criterion.improvements)).slice(0, 8);
  const submissionPending = !final;

  return {
    ...attempt,
    organizationLogoUrl: attempt.organizationLogoUrl ?? null,
    examStatus: attempt.examStatus ?? null,
    publishedAt: attempt.publishedAt ?? null,
    studentRef: attempt.studentRef ?? null,
    studentId: attempt.studentId ?? null,
    candidateRef: attempt.candidateRef ?? null,
    className: attempt.className ?? null,
    reportingPeriod: attempt.reportingPeriod ?? null,
    publicationLabel: attempt.published ? "Results released" : "Results not released",
    mypYearLabel: attempt.mypYear ? MYP_YEAR_LABEL[attempt.mypYear] : null,
    subjectLabel,
    criteria,
    hasCriteria: usedCriteria.length > 0,
    marksAwarded,
    marksMax,
    percent,
    totalLevels: totalLevels === null ? null : Number(totalLevels),
    totalLevelsMax,
    overallGrade,
    gradeStatus,
    gradeStatusLabel: GRADE_STATUS_LABEL[gradeStatus],
    gradeSource: rules.gradeSource,
    levelSource: rules.levelSource,
    gradeNote,
    pendingCriteria,
    unassessedCriteria,
    teacherFeedback,
    strengths,
    improvements: submissionPending
      ? [...improvements, "The attempt is still open, so every criterion mark is provisional."]
      : improvements,
    rules,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/* ─────────────────────────────────────────────────────────────────────────
 * Analytics for collective reports and dashboards
 * ───────────────────────────────────────────────────────────────────────── */

export interface MypGradeBucket {
  grade: number;
  count: number;
}

export interface MypCriterionAnalytic {
  code: string;
  title: string;
  assessed: number;
  averagePercent: number | null;
  averageLevel: number | null;
  notAssessed: number;
  pending: number;
}

export interface MypAnalytics {
  results: number;
  published: number;
  unpublished: number;
  complete: number;
  incomplete: number;
  pendingMarking: number;
  averagePercent: number | null;
  highestPercent: number | null;
  lowestPercent: number | null;
  averageOverallGrade: number | null;
  gradeDistribution: MypGradeBucket[];
  provisionalGrades: number;
  criteria: MypCriterionAnalytic[];
  completionRate: number;
  years: { year: number; count: number; averagePercent: number | null }[];
}

/** Aggregate a filtered set of results. Averages never include unmarked work. */
export function summarizeMyp(results: MypResult[]): MypAnalytics {
  const list = results ?? [];
  const withPercent = list.filter((result) => result.percent !== null && result.marksMax > 0);
  const percents = withPercent.map((result) => Number(result.percent));
  const graded = list.filter((result) => result.overallGrade !== null);
  const distribution: MypGradeBucket[] = [1, 2, 3, 4, 5, 6, 7].map((grade) => ({
    grade,
    count: graded.filter((result) => result.overallGrade === grade).length,
  }));

  const criterionMap = new Map<string, { title: string; assessed: MypResult[]; pending: number; notAssessed: number }>();
  for (const result of list) {
    for (const criterion of result.criteria) {
      const entry = criterionMap.get(criterion.code) ?? {
        title: criterion.title,
        assessed: [] as MypResult[],
        pending: 0,
        notAssessed: 0,
      };
      if (!entry.title && criterion.title) entry.title = criterion.title;
      if (criterion.status === "assessed") entry.assessed.push(result as unknown as MypResult);
      else if (criterion.status === "not_assessed") entry.notAssessed += 1;
      else entry.pending += 1;
      criterionMap.set(criterion.code, entry);
    }
  }

  // Criterion averages must be computed from the criterion, not the attempt, so
  // the attempt list is re-walked rather than reused.
  const criterionRows: MypCriterionAnalytic[] = [...criterionMap.entries()]
    .map(([code, entry]) => {
      const assessedRows = list
        .flatMap((result) => result.criteria)
        .filter((criterion) => criterion.code === code && criterion.status === "assessed");
      const percentValues = assessedRows
        .map((criterion) => criterion.percent)
        .filter((value): value is number => value !== null);
      const levels = assessedRows
        .map((criterion) => criterion.level)
        .filter((value): value is number => value !== null);
      return {
        code,
        title: entry.title,
        assessed: assessedRows.length,
        averagePercent: percentValues.length ? round(average(percentValues), 1) : null,
        averageLevel: levels.length ? round(average(levels), 2) : null,
        notAssessed: entry.notAssessed,
        pending: entry.pending,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const years = MYP_YEARS.map((year) => {
    const rows = list.filter((result) => result.mypYear === year);
    const percentages = rows.map((result) => result.percent).filter((value): value is number => value !== null);
    return {
      year,
      count: rows.length,
      averagePercent: percentages.length ? round(average(percentages), 1) : null,
    };
  });

  return {
    results: list.length,
    published: list.filter((result) => result.published).length,
    unpublished: list.filter((result) => !result.published).length,
    complete: list.filter((result) => result.gradeStatus === "final").length,
    incomplete: list.filter((result) => result.gradeStatus === "incomplete").length,
    pendingMarking: list.filter((result) => result.pendingCriteria.length > 0).length,
    averagePercent: percents.length ? round(average(percents), 1) : null,
    highestPercent: percents.length ? Math.max(...percents) : null,
    lowestPercent: percents.length ? Math.min(...percents) : null,
    averageOverallGrade: graded.length ? round(average(graded.map((result) => Number(result.overallGrade))), 2) : null,
    gradeDistribution: distribution,
    provisionalGrades: list.filter((result) => result.gradeStatus === "provisional").length,
    criteria: criterionRows,
    completionRate: list.length ? round((list.filter((result) => result.gradeStatus === "final").length / list.length) * 100, 1) : 0,
    years,
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Subject criteria presets
 *
 * Official IB MYP subject-group criteria, offered in the configuration screen
 * so an administrator can configure any subject with the correct criterion
 * names instead of Mathematics' A–D being assumed platform-wide.
 * ───────────────────────────────────────────────────────────────────────── */

export interface MypCriterionPreset {
  key: string;
  label: string;
  matches: RegExp;
  source: string;
  criteria: { code: string; title: string; description: string }[];
}

const criteria = (rows: [string, string, string][]) =>
  rows.map(([code, title, description]) => ({ code, title, description }));

export const MYP_CRITERION_PRESETS: MypCriterionPreset[] = [
  {
    key: "mathematics",
    label: "Mathematics (standard MYP)",
    matches: /math|math[ée]matiques|\bmth\b/i,
    source: "IB MYP Mathematics subject brief (first assessment 2022) — criteria A–D.",
    criteria: criteria([
      ["A", "Knowing and understanding", "Select appropriate mathematics when solving problems in both familiar and unfamiliar situations, and apply the selected mathematics successfully."],
      ["B", "Investigating patterns", "Apply mathematical problem-solving techniques to recognise patterns, describe relationships and generalise rules."],
      ["C", "Communicating", "Use appropriate mathematical language and forms of representation to communicate coherent, complete and concise solutions."],
      ["D", "Applying mathematics in real-life contexts", "Identify relevant elements of authentic real-life situations, select mathematical strategies and justify the degree of accuracy of a solution."],
    ]),
  },
  {
    key: "sciences",
    label: "Sciences (standard MYP)",
    matches: /science|sciences|\bsci\b|\bisc\b|physics|chemistry|biology/i,
    source: "IB MYP Sciences subject brief — criteria A–D.",
    criteria: criteria([
      ["A", "Knowing and understanding", "Describe scientific ideas and use scientific knowledge to solve problems in familiar and unfamiliar situations."],
      ["B", "Inquiring and designing", "Describe a problem and formulate a testable hypothesis, then design a scientific investigation."],
      ["C", "Processing and evaluating", "Present and interpret data, evaluate the validity of a hypothesis and explain improvements to the method."],
      ["D", "Reflecting on the impacts of science", "Describe the ways science is applied and its implications for a local and global context."],
    ]),
  },
  {
    key: "language_literature",
    label: "Language and literature (standard MYP)",
    matches: /english|language and literature|lang(?:uage)?\s*(?:&|and)\s*lit|langue|literature/i,
    source: "IB MYP Language and literature subject brief — criteria A–D.",
    criteria: criteria([
      ["A", "Analysing", "Analyse the content, context, language, structure, technique and style of texts."],
      ["B", "Organising", "Organise opinions and ideas in a coherent and logical manner appropriate to the task."],
      ["C", "Producing text", "Produce clear and well-structured texts appropriate to the audience and purpose."],
      ["D", "Using language", "Use appropriate and varied vocabulary, sentence structures and forms of expression correctly."],
    ]),
  },
  {
    key: "language_acquisition",
    label: "Language acquisition (standard MYP)",
    matches: /fran[cç]ais|french|language acquisition|spanish|espa[nñ]ol|anglais/i,
    source: "IB MYP Language acquisition subject brief — criteria A–D.",
    criteria: criteria([
      ["A", "Comprehending spoken and visual text", "Comprehend and interpret conventions, messages and meaning in spoken and visual text."],
      ["B", "Comprehending written and visual text", "Comprehend and interpret conventions, messages and meaning in written and visual text."],
      ["C", "Communicating in response to spoken and/or written and/or visual text", "Respond appropriately to spoken, written and visual text in a range of formats."],
      ["D", "Using language in spoken and/or written form", "Use appropriate vocabulary, grammar and register to communicate accurately."],
    ]),
  },
  {
    key: "individuals_societies",
    label: "Individuals and societies (standard MYP)",
    matches: /social|individuals and societies|history|geography|economics|humanities/i,
    source: "IB MYP Individuals and societies subject brief — criteria A–D.",
    criteria: criteria([
      ["A", "Knowing and understanding", "Use terminology and concepts in context and demonstrate knowledge of subject content."],
      ["B", "Investigating", "Formulate a clear and focused research question and follow an action plan to investigate it."],
      ["C", "Communicating", "Communicate information and ideas using appropriate structure and a range of communication forms."],
      ["D", "Thinking critically", "Analyse and evaluate sources and interpretations, and synthesise information to make reasoned judgements."],
    ]),
  },
  {
    key: "arts",
    label: "Arts (standard MYP)",
    matches: /arts?\b|music|drama|visual art/i,
    source: "IB MYP Arts subject brief — criteria A–D.",
    criteria: criteria([
      ["A", "Knowing and understanding", "Demonstrate knowledge and understanding of the art form studied, including terminology and context."],
      ["B", "Developing skills", "Demonstrate the acquisition and development of the skills and techniques of the art form."],
      ["C", "Thinking creatively", "Develop a feasible, clear and artistic intention and apply creative-thinking techniques."],
      ["D", "Responding", "Critique their own artwork and the artwork of others using appropriate terminology."],
    ]),
  },
  {
    key: "physical_health",
    label: "Physical and health education (standard MYP)",
    matches: /physical|health|p\.?h\.?e\b|sport/i,
    source: "IB MYP Physical and health education subject brief — criteria A–D.",
    criteria: criteria([
      ["A", "Knowing and understanding", "Use terminology and knowledge of physical and health education in context."],
      ["B", "Planning for performance", "Design and explain a plan for improving physical performance and health."],
      ["C", "Applying and performing", "Apply and perform skills, techniques and strategies in physical activity."],
      ["D", "Reflecting and improving performance", "Explain and evaluate the effectiveness of a plan and its implementation."],
    ]),
  },
  {
    key: "design",
    label: "Design (standard MYP)",
    matches: /design|technology|informatique|computer/i,
    source: "IB MYP Design subject brief — criteria A–D.",
    criteria: criteria([
      ["A", "Inquiring and analysing", "Explain and justify the need for a solution and analyse a range of existing products."],
      ["B", "Developing ideas", "Develop design specifications and present a range of feasible design ideas."],
      ["C", "Creating the solution", "Construct a logical plan and demonstrate technical skills to create a solution."],
      ["D", "Evaluating", "Evaluate the success of the solution against the design specification and its impact."],
    ]),
  },
];

/** Preset whose subject-name pattern matches, or null. Never invents one. */
export function presetForSubject(name: string | null | undefined): MypCriterionPreset | null {
  const text = (name ?? "").trim();
  if (!text) return null;
  return MYP_CRITERION_PRESETS.find((preset) => preset.matches.test(text)) ?? null;
}
