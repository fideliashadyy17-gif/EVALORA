import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where the assistant is being asked from, and what the teacher is looking at.
 *
 * The brief asks the assistant to be contextual: to understand the current page,
 * organization, academic year, class, subject and the caller's permissions
 * instead of answering into a void. Without this, "make this a bit harder" or
 * "import these" arrives with no referent and the assistant either invents one
 * or refuses.
 *
 * WHAT THIS DELIBERATELY IS NOT
 *
 * It is not an authorization mechanism. Every id below is a *hint about intent*,
 * resolved and validated against the caller's own tenant, and every tool call it
 * leads to is still checked by the permission gate and the subject-scope gate on
 * its own merits. A context that claims class X grants nothing on class X; it
 * only means the assistant may talk about it.
 *
 * It also does not guess. A page that mentions no class yields no class, rather
 * than the first class in the school.
 */

/** The routes the assistant understands, and which entity each one implies. */
const ROUTE_PATTERNS: {
  pattern: RegExp;
  surface: string;
  captures?: string[];
}[] = [
  { pattern: /^\/dashboard\/students\/?$/, surface: "students", captures: [] },
  { pattern: /^\/dashboard\/students\/import\/?$/, surface: "student_import" },
  { pattern: /^\/dashboard\/students\/([0-9a-f-]{36})\/?$/i, surface: "student_detail", captures: ["studentId"] },
  { pattern: /^\/dashboard\/teachers\/?$/, surface: "teachers" },
  { pattern: /^\/dashboard\/teachers\/assignments\/?$/, surface: "teaching_assignments" },
  { pattern: /^\/dashboard\/academics\/classes\/?$/, surface: "classes" },
  { pattern: /^\/dashboard\/academics\/classes\/([0-9a-f-]{36})\/?$/i, surface: "class_detail", captures: ["classId"] },
  { pattern: /^\/dashboard\/subjects\/?$/, surface: "subjects" },
  { pattern: /^\/dashboard\/academics\/years\/?$/, surface: "academic_years" },
  { pattern: /^\/dashboard\/academics\/calendar\/?$/, surface: "academic_calendar" },
  { pattern: /^\/dashboard\/questions\/?$/, surface: "question_bank" },
  { pattern: /^\/dashboard\/questions\/new\/?$/, surface: "question_create" },
  { pattern: /^\/dashboard\/questions\/([0-9a-f-]{36})\/?$/i, surface: "question_detail", captures: ["questionId"] },
  { pattern: /^\/dashboard\/exams\/?$/, surface: "examinations" },
  { pattern: /^\/dashboard\/exams\/([0-9a-f-]{36})\/?$/i, surface: "exam_detail", captures: ["examId"] },
  { pattern: /^\/dashboard\/exams\/([0-9a-f-]{36})\/consolidation\/?$/i, surface: "exam_consolidation", captures: ["examId"] },
  { pattern: /^\/dashboard\/exams\/([0-9a-f-]{36})\/(grade-adjustments|adjustments)\/?$/i, surface: "exam_adjustments", captures: ["examId"] },
  { pattern: /^\/dashboard\/quizzes\/?$/, surface: "quizzes" },
  { pattern: /^\/dashboard\/paper-builder\/([0-9a-f-]{36})\/?$/i, surface: "paper_builder", captures: ["quizId"] },
  { pattern: /^\/dashboard\/grading\/?$/, surface: "grading" },
  { pattern: /^\/dashboard\/assessments\/?$/, surface: "assessments" },
  { pattern: /^\/dashboard\/assessments\/([0-9a-f-]{36})\/?$/i, surface: "assessment_detail", captures: ["assessmentId"] },
  { pattern: /^\/dashboard\/attendance\/?$/, surface: "attendance" },
  { pattern: /^\/dashboard\/results\/?$/, surface: "results" },
  { pattern: /^\/dashboard\/analytics\/?$/, surface: "analytics" },
  { pattern: /^\/dashboard\/ai\/?$/, surface: "assistant" },
];

export interface AssistantPageContext {
  /** The workspace route the teacher is on, or "other" when it is not mapped. */
  surface: string;
  path: string;
  organization: { id: string; name: string };
  /** Resolved from the page, or from the active academic year. */
  academicYear: { id: string; name: string } | null;
  class: { id: string; name: string; gradeName: string | null } | null;
  subject: { id: string; name: string } | null;
  exam: { id: string; title: string; status: string; subjectId: string | null } | null;
  quiz: { id: string; title: string; status: string } | null;
  question: { id: string; topic: string | null; subjectId: string | null } | null;
  student: { id: string; fullName: string } | null;
  /** What this caller may do here — the same rules the tools apply. */
  permissions: { canUseAssistant: boolean; mayWrite: boolean };
  /** One line the model is given. States plainly when something is unknown. */
  summary: string;
  /** Anything that could not be resolved, said rather than omitted. */
  notes: string[];
}

const ROUTE_ALIASES: Record<string, string> = {
  students: "student registration and the student roster",
  student_import: "the bulk student import",
  student_detail: "one student's record",
  teachers: "the teacher directory",
  teaching_assignments: "teaching assignments",
  classes: "class management",
  class_detail: "one class",
  subjects: "the subject catalogue",
  academic_years: "academic years",
  academic_calendar: "the academic calendar",
  question_bank: "the question bank",
  question_create: "authoring a question",
  question_detail: "one question",
  examinations: "the examination list",
  exam_detail: "one examination",
  exam_consolidation: "grade consolidation for one examination",
  exam_adjustments: "score adjustments for one examination",
  quizzes: "quizzes and papers",
  paper_builder: "the paper builder",
  grading: "marking and grading",
  assessments: "assessments",
  assessment_detail: "one assessment's gradebook",
  attendance: "attendance",
  results: "results",
  analytics: "analytics",
  assistant: "the assistant itself",
  other: "the workspace",
};

/** Maps a workspace path to a named surface and the ids it names. */
export function describeRoute(path: string): { surface: string; ids: Record<string, string> } {
  const [pathname] = path.split("?");
  for (const route of ROUTE_PATTERNS) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    const ids: Record<string, string> = {};
    route.captures?.forEach((name, index) => {
      if (match[index + 1]) ids[name] = match[index + 1];
    });
    return { surface: route.surface, ids };
  }
  return { surface: "other", ids: {} };
}

function queryValue(path: string, key: string): string | null {
  const query = path.split("?")[1];
  if (!query) return null;
  const value = new URLSearchParams(query).get(key);
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/**
 * Resolves the page the teacher is on into entities they actually own.
 *
 * Each id is looked up WITH the organization filter, so a hand-edited URL that
 * names another school's class resolves to nothing rather than to that class.
 */
export async function loadAssistantPageContext(
  admin: SupabaseClient,
  organizationId: string,
  input: { path: string; permissions: { canUseAssistant: boolean; mayWrite: boolean } },
): Promise<AssistantPageContext> {
  const notes: string[] = [];
  const { surface, ids } = describeRoute(input.path);

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError || !org) throw new Error("The organization could not be read for this session.");

  // The ids come from the route or, failing that, from an explicit query hint.
  const classId = ids.classId ?? queryValue(input.path, "class_id");
  const subjectId = ids.subjectId ?? queryValue(input.path, "subject_id");
  const examId = ids.examId ?? queryValue(input.path, "exam_id");
  const quizId = ids.quizId ?? queryValue(input.path, "quiz_id");
  const questionId = ids.questionId;
  const studentId = ids.studentId ?? queryValue(input.path, "student_id");
  const yearId = ids.academicYearId ?? queryValue(input.path, "academic_year_id");

  const [classRow, subjectRow, examRow, quizRow, questionRow, studentRow, yearRow, activeYear] = await Promise.all([
    isUuid(classId)
      ? admin
          .from("classes")
          .select("id, name, education_levels(name)")
          .eq("id", classId)
          .eq("organization_id", organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isUuid(subjectId)
      ? admin.from("subjects").select("id, name").eq("id", subjectId).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isUuid(examId)
      ? admin
          .from("exams")
          .select("id, title, status, subject_id")
          .eq("id", examId)
          .eq("organization_id", organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isUuid(quizId)
      ? admin.from("quizzes").select("id, title, status").eq("id", quizId).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isUuid(questionId)
      ? admin
          .from("questions")
          .select("id, topic, subject_id")
          .eq("id", questionId)
          .eq("organization_id", organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isUuid(studentId)
      ? admin
          .from("students")
          .select("id, full_name")
          .eq("id", studentId)
          .eq("organization_id", organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isUuid(yearId)
      ? admin.from("academic_years").select("id, name").eq("id", yearId).eq("organization_id", organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("academic_years")
      .select("id, name, status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  // An id that was named but did not resolve is worth saying out loud: it means
  // the URL refers to something this school does not own, and answering about
  // "this class" would be answering about nothing.
  if (isUuid(classId) && !classRow.data) notes.push("The class named in the page could not be found in this school.");
  if (isUuid(subjectId) && !subjectRow.data) notes.push("The subject named in the page could not be found in this school.");
  if (isUuid(examId) && !examRow.data) notes.push("The examination named in the page could not be found in this school.");
  if (isUuid(studentId) && !studentRow.data) notes.push("The student named in the page could not be found in this school.");

  const level = (classRow.data as { education_levels?: { name?: string } | null } | null)?.education_levels ?? null;
  const resolvedYear = yearRow.data ?? (activeYear.data as { id: string; name: string } | null);

  const context: AssistantPageContext = {
    surface,
    path: input.path,
    organization: { id: org.id as string, name: org.name as string },
    academicYear: resolvedYear ? { id: resolvedYear.id as string, name: resolvedYear.name as string } : null,
    class: classRow.data
      ? {
          id: classRow.data.id as string,
          name: classRow.data.name as string,
          gradeName: level?.name ?? null,
        }
      : null,
    subject: subjectRow.data ? { id: subjectRow.data.id as string, name: subjectRow.data.name as string } : null,
    exam: examRow.data
      ? {
          id: examRow.data.id as string,
          title: examRow.data.title as string,
          status: examRow.data.status as string,
          subjectId: (examRow.data.subject_id as string | null) ?? null,
        }
      : null,
    quiz: quizRow.data
      ? { id: quizRow.data.id as string, title: quizRow.data.title as string, status: quizRow.data.status as string }
      : null,
    question: questionRow.data
      ? {
          id: questionRow.data.id as string,
          topic: (questionRow.data.topic as string | null) ?? null,
          subjectId: (questionRow.data.subject_id as string | null) ?? null,
        }
      : null,
    student: studentRow.data
      ? { id: studentRow.data.id as string, fullName: studentRow.data.full_name as string }
      : null,
    permissions: input.permissions,
    summary: "",
    notes,
  };

  context.summary = describeContext(context);
  return context;
}

/**
 * One line the model can read.
 *
 * Built from what was resolved, with "not specified" where nothing was, so the
 * assistant can say "which class?" instead of choosing one.
 */
function describeContext(context: AssistantPageContext): string {
  const where = ROUTE_ALIASES[context.surface] ?? "the workspace";
  const parts: string[] = [
    `The teacher is on ${where} in ${context.organization.name}${context.academicYear ? `, academic year ${context.academicYear.name}` : ""}.`,
  ];
  if (context.class) parts.push(`Class: ${context.class.name}${context.class.gradeName ? ` (${context.class.gradeName})` : ""}.`);
  if (context.subject) parts.push(`Subject: ${context.subject.name}.`);
  if (context.exam) parts.push(`Examination: "${context.exam.title}" (${context.exam.status}).`);
  if (context.quiz) parts.push(`Paper: "${context.quiz.title}" (${context.quiz.status}).`);
  if (context.question) parts.push(`Question ${context.question.id}${context.question.topic ? ` on ${context.question.topic}` : ""}.`);
  if (context.student) parts.push(`Student: ${context.student.fullName}.`);
  if (!context.class && !context.exam && !context.quiz && !context.question && !context.student) {
    parts.push("No specific class, subject or record is open, so ask which one before acting on one.");
  }
  // The write rule is stated because the model must not propose an action the
  // caller cannot take, and the composer's preview/execute distinction depends
  // on it being explicit rather than implied by a hidden button.
  parts.push(
    context.permissions.mayWrite
      ? "This caller may propose writes; sensitive ones still need a human approval."
      : "This caller may draft but not commit changes.",
  );
  return parts.join(" ");
}

/** The subset the model is shown. Kept small: this is a hint, not a data dump. */
export function renderPageContextForModel(context: AssistantPageContext): string {
  return [context.summary, ...context.notes.map((note) => `Note: ${note}`)].join("\n");
}
