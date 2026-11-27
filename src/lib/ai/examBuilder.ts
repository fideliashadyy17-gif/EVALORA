import "server-only";

/**
 * EVALORA AI CORE — examination materialisation.
 *
 * A validated `ProposedExam` becomes a real draft through the SAME services the
 * UI uses, in three ordered steps:
 *
 *   1. questions → `saveQuestionForActor`  (questions + options)
 *   2. paper     → `savePaperForActor`     (quizzes + quiz_questions + sections)
 *   3. exam      → `createExaminationFromForm` (exams, draft)
 *
 * No table is written here directly. Plan limits, RBAC, tenant checks, zod
 * schemas and the attempt-lock guard are therefore identical to a teacher using
 * the browser. If a later step fails, earlier rows are reported as partial
 * progress; nothing is deleted behind an error message.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { saveQuestionForActor, type QuestionPayload } from "../services/questionAuthoring";
import { savePaperForActor } from "../services/paperAuthoring";
import { createExaminationFromForm } from "../services/examinationCreation";
import type { SessionContext } from "../auth";
import type { Entitlement } from "../entitlements";
import type { ProposedExam, ValidationReport } from "./validation";

export interface MaterializeInput {
  plan: ProposedExam;
  report: ValidationReport;
  organizationId: string;
  /** The acting human; recorded by the services as the author. */
  userId: string;
  /** RLS-scoped client for the acting user (or the bound owner). */
  supabase: SupabaseClient;
  /** Session rebuilt for the acting human; never the agent. */
  session: SessionContext;
  entitlement: Entitlement;
  capabilities: { examinations: boolean; proctoring: boolean };
  examPeriod?: string;
  academicYear?: string;
  passMarkPercent?: number;
  /**
   * Permission resolver supplied when the caller authenticated without a
   * browser cookie (an external agent). Omitted for the native assistant and
   * the workspace form, which are authorized by their own session.
   */
  authorize?: (permission: string, module?: string) => Promise<boolean>;
}

export interface MaterializeResult {
  quizId: string;
  examId: string;
  accessCode: string;
  href: string;
  questionIds: string[];
  partial: string[];
}

export class MaterializeError extends Error {
  code: "validation" | "questions" | "paper" | "exam" | "limit" | "permission";
  partial: string[];
  detail?: string;
  constructor(code: MaterializeError["code"], message: string, partial: string[] = [], detail?: string) {
    super(message);
    this.name = "MaterializeError";
    this.code = code;
    this.partial = partial;
    this.detail = detail;
  }
}

const FAILURE_TEXT: Record<string, string> = {
  module: "the examinations module is not enabled for this plan",
  availability: "the workspace usage could not be read",
  limit: "the plan's examination limit has been reached",
  proctoring: "proctoring is not included in this plan",
  fields: "some fields were rejected by validation",
  paper: "the generated paper was not accepted (empty, unpublished, or foreign)",
  window: "the scheduling window is invalid",
  create: "the examination insert failed",
};

export async function materializeExam(input: MaterializeInput): Promise<MaterializeResult> {
  if (!input.report.ok) {
    throw new MaterializeError(
      "validation",
      `The generated paper did not pass validation, so nothing was saved. ${input.report.errors
        .slice(0, 4)
        .map((e) => e.message)
        .join(" ")}`,
    );
  }

  const { plan, supabase, session, organizationId } = input;
  const actor = { ctx: session, organizationId, supabase, authorize: input.authorize };
  const partial: string[] = [];
  const questionIds: string[] = [];
  const idByRef = new Map<string, string>();

  // ── 1. Questions ────────────────────────────────────────────────────
  for (const question of plan.questions) {
    const config: Record<string, unknown> = { ...(question.config ?? {}) };
    if (question.type === "assess_parts" && question.parts?.length) config.parts = question.parts;
    if (question.type === "open_ended" && question.markingCriteria) config.marking_criteria = question.markingCriteria;
    if (question.topic) config.topic_label = question.topic;

    const payload: QuestionPayload = {
      type: question.type as QuestionPayload["type"],
      prompt: question.prompt,
      explanation: question.explanation,
      points: Number(question.points),
      difficulty: question.difficulty,
      topic: question.topic,
      subtopic: question.subtopic,
      status: "draft",
      curriculum_course: plan.curriculum,
      config,
      options: (question.options ?? []).map((o) => ({ label: o.label, is_correct: o.is_correct })),
    };
    const saved = await saveQuestionForActor(payload, actor);
    if ("error" in saved) {
      throw new MaterializeError(
        "questions",
        `Question ${question.ref} was refused (${saved.error}). ` +
          (questionIds.length
            ? `${questionIds.length} earlier question(s) were saved as drafts and are in the question bank.`
            : "No question was saved."),
        questionIds.length ? [`${questionIds.length} draft questions in the bank`] : [],
        saved.error,
      );
    }
    questionIds.push(saved.id);
    idByRef.set(question.ref, saved.id);
    partial.push(`question ${question.ref}`);
  }

  // ── 2. Paper ────────────────────────────────────────────────────────
  const orderedIds: string[] = [];
  const sectionOf: Record<string, string> = {};
  for (const section of plan.sections) {
    for (const ref of section.refs) {
      const id = idByRef.get(ref);
      if (!id) continue;
      orderedIds.push(id);
      sectionOf[id] = section.id;
    }
  }

  const paper = await savePaperForActor(
    {
      title: plan.title,
      description: plan.description ?? "",
      // A paper must be published before an examination may reference it.
      status: "published",
      randomize_questions: true,
      randomize_options: true,
      time_per_question_seconds: 60,
      question_ids: orderedIds,
      sections: plan.sections.map((section) => ({
        id: section.id,
        title: section.title,
        instructions: section.instructions,
        questions: section.refs.length,
        marks: plan.questions
          .filter((q) => section.refs.includes(q.ref))
          .reduce((sum, q) => sum + Number(q.points || 0), 0),
      })),
      section_of: sectionOf,
      grade_label: plan.gradeLabel ?? "",
      subject: plan.subject ?? "",
      instructions: plan.instructions ?? "",
      calculator: true,
      calculator_mode: "scientific",
      calculator_angle_mode: "deg",
    },
    actor,
  );
  if ("error" in paper) {
    throw new MaterializeError(
      "paper",
      `The examination paper was refused (${paper.error}). ${questionIds.length} question(s) remain in the bank as drafts and can be assembled by hand in the Paper Builder.`,
      [`${questionIds.length} draft questions in the bank`],
    );
  }

  // ── 3. Examination ──────────────────────────────────────────────────
  const formData = new FormData();
  formData.set("title", plan.title);
  formData.set("quiz_id", paper.id);
  formData.set("description", plan.description ?? "");
  formData.set("instructions", plan.instructions ?? "");
  formData.set("duration_minutes", String(plan.durationMinutes));
  formData.set("pass_mark_percent", String(input.passMarkPercent ?? plan.passMarkPercent ?? 50));
  formData.set("grade_label", plan.gradeLabel ?? "");
  formData.set("subject", plan.subject ?? "");
  formData.set("exam_period", input.examPeriod ?? "");
  formData.set("academic_year", input.academicYear ?? "");
  formData.set("randomize_questions", "on");
  formData.set("randomize_options", "on");
  formData.set("calculator", "on");
  formData.set("calculator_mode", "scientific");
  formData.set("calculator_angle_mode", "deg");
  formData.set("language", "auto");
  // Deliberately NOT set: proctoring, lockdown. A generated draft never turns on
  // surveillance or a native lockdown without an explicit human decision.

  const exam = await createExaminationFromForm(formData, {
    supabase,
    ctx: session,
    organizationId,
    isSuperAdmin: session.profile.platform_role === "super_admin",
    entitlement: input.entitlement,
    capabilities: input.capabilities,
  });
  if (!exam.ok) {
    throw new MaterializeError(
      exam.code === "limit" ? "limit" : exam.code === "module" ? "permission" : "exam",
      `The paper was saved (id ${paper.id}), but the examination itself was refused: ${FAILURE_TEXT[exam.code] ?? exam.code}. ` +
        "The paper is available in the Paper Builder to attach manually.",
      [`paper ${paper.id}`, `${questionIds.length} questions in the bank`],
    );
  }

  return {
    quizId: paper.id,
    examId: exam.examId,
    accessCode: exam.accessCode,
    href: `/dashboard/exams/${exam.examId}`,
    questionIds,
    partial,
  };
}

/** Read-back helper for callers that need the created row (tests, REST). */
export async function readCreatedExam(supabase: SupabaseClient, organizationId: string, examId: string) {
  return supabase
    .from("exams")
    .select("id, access_code, access_link, status, title")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
}

