import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnswerContent } from "./examMessaging";
import {
  DEFAULT_GRADE_BOUNDARIES,
  DEFAULT_GRADE_SOURCE,
  DEFAULT_LEVEL_BOUNDARIES,
  DEFAULT_LEVEL_SOURCE,
  attemptIsFinal,
  buildMypResult,
  normalizeCriterion,
  resolveMypYear,
  summarizeMyp,
  type MypAnalytics,
  type MypCriterionConfig,
  type MypGradeBoundary,
  type MypLevelBoundary,
  type MypPaperQuestion,
  type MypResult,
  type MypRules,
  type MypYear,
} from "./myp";

/**
 * The ONE server-side loader for MYP results.
 *
 * Every page and every export calls `loadMypResults` (or `loadMypResult` for a
 * single attempt). It reads the authoritative rows — attempt, answers, paper,
 * configured criteria and boundaries — and computes each result with the single
 * engine in `src/lib/myp.ts`. Views never add their own arithmetic, which is
 * what keeps the student page, teacher page, Super Admin dashboard, PDF and
 * Excel in agreement.
 *
 * Tenant safety is enforced twice: the caller passes an explicit organization
 * scope, and the queries run through the request's Supabase client, so RLS
 * applies as well. A student-scoped read is only ever performed by the student
 * page with an explicit `studentId` and a publication check.
 */

export const MYP_STATUS_FILTERS = [
  { value: "all", label: "All results" },
  { value: "published", label: "Released" },
  { value: "unpublished", label: "Not released" },
  { value: "complete", label: "Complete (grade final)" },
  { value: "provisional", label: "Provisional grade" },
  { value: "incomplete", label: "Incomplete" },
  { value: "pending", label: "Pending marking" },
] as const;

export type MypStatusFilter = (typeof MYP_STATUS_FILTERS)[number]["value"];

export interface MypFilters {
  /** Explicit tenant scope. An empty list returns an empty dataset. */
  organizationIds: string[];
  organizationId?: string;
  examId?: string;
  /** Class name as shown in the results table (used by the filter control). */
  className?: string;
  subjectId?: string;
  mypYear?: number;
  attemptId?: string;
  studentId?: string;
  search?: string;
  criterion?: string;
  status?: MypStatusFilter;
  from?: string;
  to?: string;
  limit?: number;
  /** When false (student view), unreleased results are excluded entirely. */
  includeUnpublished?: boolean;
}

export interface MypOption {
  value: string;
  label: string;
  hint?: string;
}

export interface MypFilterOptions {
  organizations: MypOption[];
  classes: MypOption[];
  exams: MypOption[];
  subjects: MypOption[];
  years: MypOption[];
  criteria: MypOption[];
}

export interface MypDataset {
  results: MypResult[];
  analytics: MypAnalytics;
  options: MypFilterOptions;
  rulesBySubject: Record<string, MypRules>;
  organizations: Record<string, { id: string; name: string; logoUrl: string | null }>;
  truncated: boolean;
}

const EMPTY_ANALYTICS: MypAnalytics = {
  results: 0,
  published: 0,
  unpublished: 0,
  complete: 0,
  incomplete: 0,
  pendingMarking: 0,
  averagePercent: null,
  highestPercent: null,
  lowestPercent: null,
  averageOverallGrade: null,
  gradeDistribution: [1, 2, 3, 4, 5, 6, 7].map((grade) => ({ grade, count: 0 })),
  provisionalGrades: 0,
  criteria: [],
  completionRate: 0,
  years: [],
};

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
  organization_id: string;
}

interface CriterionRow {
  id: string;
  organization_id: string;
  subject_id: string;
  code: string;
  title: string;
  description: string | null;
  position: number;
  max_level: number;
}

interface LevelBoundaryRow {
  organization_id: string;
  subject_id: string;
  level: number;
  min_percent: number;
  source: string | null;
}

interface GradeBoundaryRow {
  organization_id: string;
  subject_id: string | null;
  min_total: number;
  max_total: number;
  grade: number;
  source: string | null;
}

interface FrameworkRow {
  organization_id: string;
  criteria_max_level: number;
  require_all_criteria: boolean;
  framework: string;
  note: string | null;
}

/** Chunk an IN list so PostgREST never receives an oversized filter. */
function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

async function safeRows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as T[];
  } catch {
    return [];
  }
}

/** Build the effective rules for one subject (configured values or defaults). */
export function resolveRules(args: {
  organizationId: string;
  subjectId: string | null;
  criteria: CriterionRow[];
  levelBoundaries: LevelBoundaryRow[];
  gradeBoundaries: GradeBoundaryRow[];
  framework: FrameworkRow | null;
}): MypRules {
  const criteriaRows = args.criteria
    .filter((row) => row.organization_id === args.organizationId && row.subject_id === args.subjectId)
    .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code));

  const criteria: MypCriterionConfig[] = criteriaRows.map((row) => ({
    code: normalizeCriterion(row.code) ?? row.code,
    title: row.title,
    description: row.description,
    position: row.position,
  }));

  const subjectLevels = args.levelBoundaries
    .filter((row) => row.organization_id === args.organizationId && row.subject_id === args.subjectId)
    .map((row) => ({ level: row.level, minPercent: Number(row.min_percent) }));
  const levelBoundaries: MypLevelBoundary[] = subjectLevels.length ? subjectLevels : DEFAULT_LEVEL_BOUNDARIES;
  const levelSource = subjectLevels.length
    ? args.levelBoundaries.find(
        (row) => row.organization_id === args.organizationId && row.subject_id === args.subjectId && row.source,
      )?.source ?? DEFAULT_LEVEL_SOURCE
    : DEFAULT_LEVEL_SOURCE;

  const subjectGrades = args.gradeBoundaries
    .filter(
      (row) =>
        row.organization_id === args.organizationId &&
        row.subject_id !== null &&
        row.subject_id === args.subjectId,
    )
    .map((row) => ({ minTotal: row.min_total, maxTotal: row.max_total, grade: row.grade }));
  const orgGrades = args.gradeBoundaries
    .filter((row) => row.organization_id === args.organizationId && row.subject_id === null)
    .map((row) => ({ minTotal: row.min_total, maxTotal: row.max_total, grade: row.grade }));
  const gradeRows = subjectGrades.length ? subjectGrades : orgGrades;
  const gradeBoundaries: MypGradeBoundary[] = gradeRows.length ? gradeRows : DEFAULT_GRADE_BOUNDARIES;
  const gradeSource = gradeRows.length
    ? args.gradeBoundaries.find(
        (row) =>
          row.organization_id === args.organizationId &&
          row.subject_id === (subjectGrades.length ? args.subjectId : null) &&
          row.source,
      )?.source ?? DEFAULT_GRADE_SOURCE
    : DEFAULT_GRADE_SOURCE;

  const criteriaMaxLevel = criteriaRows.length
    ? Math.max(...criteriaRows.map((row) => Number(row.max_level) || 8))
    : args.framework?.criteria_max_level ?? 8;

  const configured = Boolean(criteriaRows.length || gradeRows.length || subjectLevels.length);
  return {
    criteria,
    levelBoundaries,
    gradeBoundaries,
    levelSource,
    gradeSource,
    requireAllCriteria: args.framework?.require_all_criteria ?? true,
    criteriaMaxLevel,
    source: configured ? "configured" : "default",
  };
}

interface PaperQuestionRow {
  quiz_id: string;
  question_id: string;
  questions: {
    id: string;
    points: number | string | null;
    type: string | null;
    topic: string | null;
    subject_id: string | null;
    prompt: string | null;
    config: Record<string, unknown> | null;
  } | null;
}

interface AttemptRow {
  id: string;
  exam_id: string;
  status: string;
  submitted_at: string | null;
  started_at: string;
  score: number | null;
  max_score: number | null;
  published_at: string | null;
  class_id: string | null;
  student_id: string | null;
  first_name: string | null;
  last_name: string | null;
  exam_candidates:
    | {
        full_name: string | null;
        candidate_ref: string | null;
        student_id: string | null;
        class_id: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | null;
}

interface AnswerRow {
  attempt_id: string;
  question_id: string;
  /** Whether the candidate typed/saved anything. Blank answers score zero on a final attempt. */
  answer?: unknown;
  points_awarded: number | string | null;
  is_correct: boolean | null;
  marker_note: string | null;
  moderation_status: string | null;
}

interface ExamRow {
  id: string;
  title: string;
  organization_id: string;
  class_id: string | null;
  quiz_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  status: string;
  settings: Record<string, unknown> | null;
  grades_published_at: string | null;
  organizations: { id: string; name: string; logo_url: string | null } | null;
  classes: { id: string; name: string; code: string | null; grade_order: number | null } | null;
}

interface ClassRow {
  id: string;
  name: string;
  code: string | null;
  grade_order: number | null;
  organization_id: string;
}

function promptExcerpt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

function readCriterion(config: Record<string, unknown> | null | undefined): string | null {
  if (!config) return null;
  const value = config.myp_criterion ?? config.criterion;
  return normalizeCriterion(value);
}

/**
 * Load and compute MYP results for a tenant scope.
 *
 * The function is deliberately a single entry point: a page may narrow what it
 * shows, but it cannot alter how a result is computed.
 */
export async function loadMypResults(
  supabase: SupabaseClient,
  filters: MypFilters,
): Promise<MypDataset> {
  const organizationIds = [...new Set((filters.organizationIds ?? []).filter(Boolean))];
  const empty: MypDataset = {
    results: [],
    analytics: EMPTY_ANALYTICS,
    options: { organizations: [], classes: [], exams: [], subjects: [], years: [], criteria: [] },
    rulesBySubject: {},
    organizations: {},
    truncated: false,
  };
  if (!organizationIds.length) return empty;

  // ── Scope metadata: organizations, classes, subjects, configuration ──
  const [orgRows, classRows, subjectRows, criteriaRows, levelRows, gradeRows, frameworkRows] = await Promise.all([
    safeRows<{ id: string; name: string; logo_url: string | null }>(
      supabase.from("organizations").select("id, name, logo_url").in("id", organizationIds),
    ),
    safeRows<ClassRow>(
      supabase
        .from("classes")
        .select("id, name, code, grade_order, organization_id")
        .in("organization_id", organizationIds)
        .order("grade_order", { ascending: true, nullsFirst: false })
        .limit(500),
    ),
    safeRows<SubjectRow>(
      supabase
        .from("subjects")
        .select("id, name, code, organization_id")
        .in("organization_id", organizationIds)
        .order("name")
        .limit(500),
    ),
    safeRows<CriterionRow>(
      supabase
        .from("myp_criteria")
        .select("id, organization_id, subject_id, code, title, description, position, max_level")
        .in("organization_id", organizationIds)
        .limit(2000),
    ),
    safeRows<LevelBoundaryRow>(
      supabase
        .from("myp_level_boundaries")
        .select("organization_id, subject_id, level, min_percent, source")
        .in("organization_id", organizationIds)
        .limit(2000),
    ),
    safeRows<GradeBoundaryRow>(
      supabase
        .from("myp_grade_boundaries")
        .select("organization_id, subject_id, min_total, max_total, grade, source")
        .in("organization_id", organizationIds)
        .limit(2000),
    ),
    safeRows<FrameworkRow>(
      supabase
        .from("myp_framework_config")
        .select("organization_id, criteria_max_level, require_all_criteria, framework, note")
        .in("organization_id", organizationIds)
        .limit(50),
    ),
  ]);

  const organizationMap: Record<string, { id: string; name: string; logoUrl: string | null }> = {};
  for (const org of orgRows) organizationMap[org.id] = { id: org.id, name: org.name, logoUrl: org.logo_url };
  const classMap = new Map(classRows.map((row) => [row.id, row]));
  const subjectMap = new Map(subjectRows.map((row) => [row.id, row]));
  const frameworkMap = new Map(frameworkRows.map((row) => [row.organization_id, row]));

  const rulesCache = new Map<string, MypRules>();
  const rulesBySubject: Record<string, MypRules> = {};
  const rulesFor = (organizationId: string, subjectId: string | null): MypRules => {
    const key = `${organizationId}:${subjectId ?? "none"}`;
    const cached = rulesCache.get(key);
    if (cached) return cached;
    const rules = resolveRules({
      organizationId,
      subjectId,
      criteria: criteriaRows,
      levelBoundaries: levelRows,
      gradeBoundaries: gradeRows,
      framework: frameworkMap.get(organizationId) ?? null,
    });
    rulesCache.set(key, rules);
    rulesBySubject[key] = rules;
    return rules;
  };

  // ── 1. Examinations in scope ─────────────────────────────────────────
  let examQuery = supabase
    .from("exams")
    .select(
      "id, title, organization_id, class_id, quiz_id, starts_at, ends_at, created_at, status, settings, grades_published_at, organizations(id, name, logo_url), classes(id, name, code, grade_order)",
    )
    .in("organization_id", organizationIds)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filters.examId) examQuery = examQuery.eq("id", filters.examId);
  const examRowsRaw = await safeRows<ExamRow>(examQuery);

  const examRows = examRowsRaw.filter((exam) => {
    if (filters.organizationId && exam.organization_id !== filters.organizationId) return false;
    if (filters.mypYear) {
      const classRow = classMap.get(exam.class_id ?? "");
      const year = resolveMypYear({
        override: (exam.settings ?? {}).myp_level ?? (exam.settings ?? {}).myp_year ?? null,
        className: exam.classes?.name ?? classRow?.name ?? exam.title,
        classCode: exam.classes?.code ?? classRow?.code ?? null,
        gradeOrder: exam.classes?.grade_order ?? classRow?.grade_order ?? null,
      });
      if (year !== Number(filters.mypYear)) return false;
    }
    const date = exam.starts_at ?? exam.created_at;
    if (filters.from && date < filters.from) return false;
    if (filters.to && date.slice(0, 10) > filters.to) return false;
    return true;
  });

  // ── 2. The papers ────────────────────────────────────────────────────
  const examMap = new Map(examRows.map((exam) => [exam.id, exam]));
  const quizIds = [...new Set(examRows.map((exam) => exam.quiz_id).filter((id): id is string => Boolean(id)))];
  const paperRows: PaperQuestionRow[] = [];
  for (const group of chunks(quizIds, 80)) {
    paperRows.push(
      ...(await safeRows<PaperQuestionRow>(
        supabase
          .from("quiz_questions")
          .select("quiz_id, question_id, questions(id, points, type, topic, subject_id, prompt, config)")
          .in("quiz_id", group)
          .limit(4000),
      )),
    );
  }
  const paperByQuiz = new Map<string, MypPaperQuestion[]>();
  const subjectIdsByQuiz = new Map<string, Set<string>>();
  for (const row of paperRows) {
    const question = row.questions;
    if (!question) continue;
    const list = paperByQuiz.get(row.quiz_id) ?? [];
    list.push({
      questionId: question.id,
      points: Number(question.points ?? 0),
      criterion: readCriterion(question.config),
      topic: question.topic,
      type: question.type,
      subjectId: question.subject_id,
      prompt: promptExcerpt(question.prompt ?? question.config?.prompt),
    });
    paperByQuiz.set(row.quiz_id, list);
    if (question.subject_id) {
      const set = subjectIdsByQuiz.get(row.quiz_id) ?? new Set<string>();
      set.add(question.subject_id);
      subjectIdsByQuiz.set(row.quiz_id, set);
    }
  }

  // ── 3. Attempts in scope ─────────────────────────────────────────────
  const examIds = examRows.map((exam) => exam.id);
  const attemptRows: AttemptRow[] = [];
  for (const group of chunks(examIds, 80)) {
    let query = supabase
      .from("exam_attempts")
      .select(
        "id, exam_id, status, submitted_at, started_at, score, max_score, published_at, class_id, student_id, first_name, last_name, exam_candidates(full_name, candidate_ref, student_id, class_id, first_name, last_name)",
      )
      .in("exam_id", group)
      .order("started_at", { ascending: false })
      .limit(3000);
    if (filters.attemptId) query = query.eq("id", filters.attemptId);
    attemptRows.push(...(await safeRows<AttemptRow>(query)));
  }

  const attemptIds = attemptRows.map((attempt) => attempt.id);
  const answerRows: AnswerRow[] = [];
  for (const group of chunks(attemptIds, 150)) {
    answerRows.push(
      ...(await safeRows<AnswerRow>(
        supabase
          .from("exam_answers")
          .select("attempt_id, question_id, answer, points_awarded, is_correct, marker_note, moderation_status")
          .in("attempt_id", group)
          .limit(8000),
      )),
    );
  }
  const answersByAttempt = new Map<string, AnswerRow[]>();
  for (const answer of answerRows) {
    const list = answersByAttempt.get(answer.attempt_id) ?? [];
    list.push(answer);
    answersByAttempt.set(answer.attempt_id, list);
  }

  // ── 4. Student identities (never inferred from a typed name) ──────────
  const studentIds = [
    ...new Set(
      attemptRows
        .flatMap((attempt) => [attempt.student_id, attempt.exam_candidates?.student_id])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const studentRows: { id: string; full_name: string; student_ref: string | null }[] = [];
  for (const group of chunks(studentIds, 90)) {
    studentRows.push(
      ...(await safeRows<{ id: string; full_name: string; student_ref: string | null }>(
        supabase.from("students").select("id, full_name, student_ref").in("id", group),
      )),
    );
  }
  const studentMap = new Map(studentRows.map((row) => [row.id, row]));

  // ── 5. Compose results through the single engine ──────────────────────
  const results: MypResult[] = [];
  for (const attempt of attemptRows) {
    const exam = examMap.get(attempt.exam_id);
    if (!exam) continue;
    const paper = exam.quiz_id ? paperByQuiz.get(exam.quiz_id) ?? [] : [];
    const subjectIds = [...(exam.quiz_id ? subjectIdsByQuiz.get(exam.quiz_id) ?? new Set<string>() : new Set<string>())];
    const subjectId = subjectIds.length === 1 ? subjectIds[0] : null;
    const subjectNames = subjectIds
      .map((id) => subjectMap.get(id)?.name ?? "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const classId = attempt.class_id ?? attempt.exam_candidates?.class_id ?? exam.class_id ?? null;
    const classRow = classId ? classMap.get(classId) ?? null : null;
    const classExamRow = exam.classes;
    const className = classRow?.name ?? classExamRow?.name ?? null;
    const classCode = classRow?.code ?? classExamRow?.code ?? null;
    const gradeOrder = classRow?.grade_order ?? classExamRow?.grade_order ?? null;

    const studentId = attempt.student_id ?? attempt.exam_candidates?.student_id ?? null;
    const student = studentId ? studentMap.get(studentId) : undefined;
    const candidate = attempt.exam_candidates;
    const studentName =
      student?.full_name?.trim() ||
      candidate?.full_name?.trim() ||
      [attempt.first_name, attempt.last_name].filter(Boolean).join(" ").trim() ||
      [candidate?.first_name, candidate?.last_name].filter(Boolean).join(" ").trim() ||
      "Candidate";

    const settings = (exam.settings ?? {}) as Record<string, unknown>;
    const examPublished =
      settings.results_published === true || Boolean(exam.grades_published_at) || Boolean(attempt.published_at);
    const published = examPublished;

    const rules = rulesFor(exam.organization_id, subjectId);
    const mypYear: MypYear | null = resolveMypYear({
      override: settings.myp_level ?? settings.myp_year ?? null,
      className: className ?? exam.title,
      classCode,
      gradeOrder,
    });

    const result = buildMypResult({
      attempt: {
        attemptId: attempt.id,
        examId: exam.id,
        organizationId: exam.organization_id,
        organizationName:
          organizationMap[exam.organization_id]?.name ?? exam.organizations?.name ?? "Organization",
        organizationLogoUrl:
          organizationMap[exam.organization_id]?.logoUrl ?? exam.organizations?.logo_url ?? null,
        examTitle: exam.title,
        examDate: exam.starts_at ?? exam.created_at ?? null,
        examStatus: exam.status,
        attemptStatus: attempt.status,
        submittedAt: attempt.submitted_at,
        score: attempt.score === null ? null : Number(attempt.score),
        maxScore: attempt.max_score === null ? null : Number(attempt.max_score),
        published,
        publishedAt: attempt.published_at ?? exam.grades_published_at ?? null,
        studentName,
        studentRef: student?.student_ref ?? candidate?.candidate_ref ?? null,
        studentId,
        candidateRef: candidate?.candidate_ref ?? null,
        className,
        classCode,
        classGradeOrder: gradeOrder,
        mypYear,
        subjectNames,
        subjectId,
        reportingPeriod:
          typeof settings.reporting_period === "string"
            ? settings.reporting_period
            : exam.starts_at
              ? `${exam.starts_at.slice(0, 7)}`
              : null,
      },
      paper,
      answers: (answersByAttempt.get(attempt.id) ?? []).map((answer) => ({
        questionId: answer.question_id,
        pointsAwarded:
          answer.points_awarded === null || answer.points_awarded === undefined
            ? null
            : Number(answer.points_awarded),
        hasContent: hasAnswerContent(answer.answer),
        isCorrect: answer.is_correct,
        markerNote: answer.marker_note,
        moderationStatus: answer.moderation_status,
      })),
      rules,
    });
    results.push(result);
  }

  // ── 6. Filters that depend on the computed result ─────────────────────
  const search = (filters.search ?? "").trim().toLowerCase();
  const criterion = normalizeCriterion(filters.criterion);
  const status = filters.status ?? "all";
  const includeUnpublished = filters.includeUnpublished !== false;

  const filtered = results.filter((result) => {
    if (!includeUnpublished && !result.published) return false;
    if (filters.studentId && result.studentId !== filters.studentId) return false;
    if (filters.subjectId && result.subjectId !== filters.subjectId) return false;
    if (filters.mypYear && result.mypYear !== Number(filters.mypYear)) return false;
    if (filters.className && result.className !== filters.className) return false;
    if (search) {
      const haystack = [
        result.studentName,
        result.studentRef,
        result.examTitle,
        result.className,
        result.organizationName,
        result.subjectLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (criterion) {
      const row = result.criteria.find((item) => item.code === criterion);
      if (!row || row.questionCount === 0) return false;
    }
    switch (status) {
      case "published":
        return result.published;
      case "unpublished":
        return !result.published;
      case "complete":
        return result.gradeStatus === "final";
      case "provisional":
        return result.gradeStatus === "provisional";
      case "incomplete":
        return result.gradeStatus === "incomplete";
      case "pending":
        return result.pendingCriteria.length > 0;
      default:
        return true;
    }
  });

  const limit = Math.min(Math.max(filters.limit ?? 1500, 1), 3000);
  const truncated = filtered.length > limit;
  const shown = filtered
    .sort((a, b) => {
      const left = Date.parse(b.examDate ?? "") || 0;
      const right = Date.parse(a.examDate ?? "") || 0;
      return left - right || a.studentName.localeCompare(b.studentName);
    })
    .slice(0, limit);

  // ── 7. Options for the filter controls ───────────────────────────────
  const yearsInScope = [...new Set(filtered.map((result) => result.mypYear).filter((year): year is MypYear => Boolean(year)))];
  const criteriaInScope = new Map<string, string>();
  for (const result of filtered) {
    for (const row of result.criteria) {
      if (row.questionCount > 0 || row.configured) criteriaInScope.set(row.code, row.title);
    }
  }
  const classesInScope = new Map<string, string>();
  for (const result of filtered) {
    if (result.className) classesInScope.set(result.className, `${result.className}${result.mypYearLabel ? ` · ${result.mypYearLabel}` : ""}`);
  }
  const examsInScope = new Map<string, string>();
  for (const exam of examRows.filter((row) => !filters.examId || row.id === filters.examId)) {
    examsInScope.set(exam.id, exam.title);
  }
  // Filter dropdowns should list the whole scope, not only what survives the
  // current filter, so an empty result stays recoverable.
  const allClassOptions = new Map<string, MypOption>();
  for (const result of results) {
    if (result.className) {
      allClassOptions.set(result.className, {
        value: result.className,
        label: result.className,
        hint: result.mypYearLabel ?? undefined,
      });
    }
  }
  const allExamOptions = new Map<string, MypOption>();
  for (const exam of examRows) allExamOptions.set(exam.id, { value: exam.id, label: exam.title });
  const allOrgOptions = orgRows.map((org) => ({ value: org.id, label: org.name }));
  const allSubjectOptions = new Map<string, MypOption>();
  for (const result of results) {
    if (result.subjectId) {
      allSubjectOptions.set(result.subjectId, {
        value: result.subjectId,
        label: subjectMap.get(result.subjectId)?.name ?? result.subjectLabel,
      });
    }
  }
  const configuredCriteria = new Map<string, string>();
  for (const criterionRow of criteriaRows) {
    const code = normalizeCriterion(criterionRow.code) ?? criterionRow.code;
    if (!configuredCriteria.has(code)) configuredCriteria.set(code, criterionRow.title);
  }
  for (const [code, title] of criteriaInScope) configuredCriteria.set(code, title);

  return {
    results: shown,
    analytics: summarizeMyp(shown),
    options: {
      organizations: allOrgOptions,
      classes: [...allClassOptions.values()].sort((a, b) => a.label.localeCompare(b.label)),
      exams: [...allExamOptions.values()],
      subjects: [...allSubjectOptions.values()].sort((a, b) => a.label.localeCompare(b.label)),
      years: yearsInScope.sort().map((year) => ({ value: String(year), label: `MYP ${year}` })),
      criteria: [...configuredCriteria.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([code, title]) => ({
          value: code,
          label: title ? `Criterion ${code} — ${title}` : `Criterion ${code}`,
        })),
    },
    rulesBySubject,
    organizations: organizationMap,
    truncated,
  };
}

/**
 * One attempt, read with the same loader so a detail page and an export can
 * never drift from the list. Returns null when the attempt is outside the
 * caller's scope (tenant isolation) or does not exist.
 */
export async function loadMypResult(
  supabase: SupabaseClient,
  args: { attemptId: string; organizationIds: string[]; studentId?: string; includeUnpublished?: boolean },
): Promise<MypResult | null> {
  const dataset = await loadMypResults(supabase, {
    organizationIds: args.organizationIds,
    attemptId: args.attemptId,
    studentId: args.studentId,
    includeUnpublished: args.includeUnpublished,
    limit: 5,
  });
  return dataset.results.find((result) => result.attemptId === args.attemptId) ?? null;
}

export interface MypHistoryRow {
  id: string;
  attempt_id: string;
  exam_id: string;
  reason: string;
  marks_awarded: number | null;
  marks_max: number | null;
  percent: number | null;
  total_levels: number | null;
  total_levels_max: number | null;
  overall_grade: number | null;
  grade_status: string;
  criterion_snapshot: unknown;
  note: string | null;
  recorded_by_email: string | null;
  created_at: string;
}

export async function loadMypHistory(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<MypHistoryRow[]> {
  return safeRows<MypHistoryRow>(
    supabase
      .from("myp_result_history")
      .select(
        "id, attempt_id, exam_id, reason, marks_awarded, marks_max, percent, total_levels, total_levels_max, overall_grade, grade_status, criterion_snapshot, note, recorded_by_email, created_at",
      )
      .eq("attempt_id", attemptId)
      .order("created_at", { ascending: false })
      .limit(50),
  );
}

/** Re-exported so callers do not need a second import for the label helper. */
export { attemptIsFinal };
