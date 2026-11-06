import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Grading helpers. Rubric totals, criterion bounds, moderation state and the
 * grade-change audit are enforced by the database (migration 0036); these
 * helpers only read and present them. Never re-implement those rules here —
 * doing so would let the UI and the database disagree.
 */

export const MODERATION_DECISIONS = ["approved", "adjusted", "returned"] as const;
export type ModerationDecision = (typeof MODERATION_DECISIONS)[number];

export const MODERATION_LABEL: Record<string, string> = {
  not_required: "Not moderated",
  pending: "Awaiting moderation",
  approved: "Approved",
  adjusted: "Adjusted by moderator",
  returned: "Returned to marker",
};

export const CHANGE_TYPE_LABEL: Record<string, string> = {
  marked: "First mark",
  regraded: "Regrade",
  moderated: "Moderation",
  ai_assisted: "AI-assisted marking",
  published: "Published",
  cleared: "Mark cleared",
};

export const GRADING_METHOD_LABEL: Record<string, string> = {
  manual: "Manual",
  answer_key: "Answer key",
  rubric: "Rubric",
  ai_assisted: "AI-assisted",
};

export interface Rubric {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  framework: string | null;
  total_marks: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RubricCriterion {
  id: string;
  rubric_id: string;
  organization_id: string;
  position: number;
  code: string | null;
  label: string;
  description: string | null;
  max_marks: number;
}

export async function loadRubrics(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Rubric[]> {
  const { data } = await supabase
    .from("grading_rubrics")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(200);
  return (data ?? []) as Rubric[];
}

export async function loadRubric(
  supabase: SupabaseClient,
  organizationId: string,
  rubricId: string,
): Promise<{ rubric: Rubric; criteria: RubricCriterion[] } | null> {
  const { data: rubric } = await supabase
    .from("grading_rubrics")
    .select("*")
    .eq("id", rubricId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!rubric) return null;
  const { data: criteria } = await supabase
    .from("grading_rubric_criteria")
    .select("*")
    .eq("rubric_id", rubricId)
    .order("position");
  return { rubric: rubric as Rubric, criteria: (criteria ?? []) as RubricCriterion[] };
}

export interface ExamRubricLink {
  id: string;
  rubric_id: string;
  question_id: string | null;
  grading_rubrics?: { title?: string; total_marks?: number } | null;
}

export async function loadExamRubricLinks(
  supabase: SupabaseClient,
  organizationId: string,
  examId: string,
): Promise<ExamRubricLink[]> {
  const { data } = await supabase
    .from("exam_rubric_links")
    .select("id, rubric_id, question_id, grading_rubrics(title, total_marks)")
    .eq("exam_id", examId)
    .eq("organization_id", organizationId);
  return (data ?? []) as unknown as ExamRubricLink[];
}

/**
 * The rubric that applies to one question: a question-level link wins over the
 * examination-level rubric, so a paper can use a general rubric and override it
 * for specific questions.
 */
export function rubricForQuestion(
  links: ExamRubricLink[],
  questionId: string,
): { link: ExamRubricLink; level: "question" | "exam" } | null {
  const own = links.find((l) => l.question_id === questionId);
  if (own) return { link: own, level: "question" };
  const examLevel = links.find((l) => l.question_id === null);
  if (examLevel) return { link: examLevel, level: "exam" };
  return null;
}

export interface AnswerCriterionScore {
  id: string;
  answer_id: string;
  criterion_id: string;
  rubric_id: string;
  marks_awarded: number;
  grader_id: string | null;
  note: string | null;
}

export async function loadAnswerCriterionScores(
  supabase: SupabaseClient,
  answerIds: string[],
): Promise<Map<string, AnswerCriterionScore[]>> {
  const map = new Map<string, AnswerCriterionScore[]>();
  if (answerIds.length === 0) return map;
  const { data } = await supabase
    .from("answer_rubric_scores")
    .select("id, answer_id, criterion_id, rubric_id, marks_awarded, grader_id, note")
    .in("answer_id", answerIds);
  for (const row of (data ?? []) as AnswerCriterionScore[]) {
    const list = map.get(row.answer_id) ?? [];
    list.push(row);
    map.set(row.answer_id, list);
  }
  return map;
}

/** Sum one grader's criterion scores; a partial rubric never becomes a mark. */
export function sumCriterionScores(scores: AnswerCriterionScore[], graderId: string) {
  return scores
    .filter((s) => s.grader_id === graderId)
    .reduce((sum, s) => sum + Number(s.marks_awarded ?? 0), 0);
}

export interface GradeChangeRow {
  id: string;
  answer_id: string;
  attempt_id: string;
  change_type: string;
  previous_points: number | null;
  new_points: number | null;
  previous_moderation: string | null;
  new_moderation: string | null;
  actor_email: string | null;
  note: string | null;
  created_at: string;
  exam_answers?: { question_id?: string; questions?: { prompt?: string } | null } | null;
  exams?: { title?: string } | null;
}

export async function loadGradeHistory(
  supabase: SupabaseClient,
  organizationId: string,
  opts: { examId?: string | null; attemptId?: string | null; answerId?: string | null; limit?: number } = {},
): Promise<GradeChangeRow[]> {
  let query = supabase
    .from("grade_change_log")
    .select(
      "id, answer_id, attempt_id, change_type, previous_points, new_points, previous_moderation, new_moderation, actor_email, note, created_at, exam_answers(question_id, questions(prompt)), exams(title)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));
  if (opts.examId) query = query.eq("exam_id", opts.examId);
  if (opts.attemptId) query = query.eq("attempt_id", opts.attemptId);
  if (opts.answerId) query = query.eq("answer_id", opts.answerId);
  const { data } = await query;
  return (data ?? []) as unknown as GradeChangeRow[];
}

export interface ModerationRow {
  id: string;
  answer_id: string;
  decision: string;
  previous_marks: number | null;
  proposed_marks: number | null;
  note: string | null;
  moderator_email: string | null;
  created_at: string;
}

export async function loadModerationHistory(
  supabase: SupabaseClient,
  organizationId: string,
  opts: { examId?: string | null; answerId?: string | null; limit?: number } = {},
): Promise<ModerationRow[]> {
  let query = supabase
    .from("grading_moderation")
    .select("id, answer_id, decision, previous_marks, proposed_marks, note, moderator_email, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));
  if (opts.examId) query = query.eq("exam_id", opts.examId);
  if (opts.answerId) query = query.eq("answer_id", opts.answerId);
  const { data } = await query;
  return (data ?? []) as ModerationRow[];
}

/** Feedback shown while marking: what the rubric expects for a criterion. */
export function criterionGuidance(c: RubricCriterion) {
  const code = c.code ? `${c.code} · ` : "";
  return `${code}${c.label} (max ${Number(c.max_marks)})`;
}

export function parseMarks(raw: unknown, max: number): number | null {
  const value = typeof raw === "string" ? raw.trim() : raw;
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}
