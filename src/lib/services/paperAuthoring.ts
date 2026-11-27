import "server-only";

/**
 * Shared paper (quiz) authoring service.
 *
 * Extracted from `saveQuiz` unchanged, so the Paper Builder, the native AI
 * assistant and external agents all write papers through one implementation.
 * The subtle invariants are preserved deliberately:
 *
 *   - unrelated `settings` keys survive an edit (criterion totals, source…),
 *   - membership is upserted BEFORE delete (a failed insert never empties a paper),
 *   - unchanged membership/mapping is not rewritten, so saving settings on an
 *     attempt-locked paper still works,
 *   - changed assessment mappings are validated against the live reference,
 *   - a guard rejection is surfaced, never swallowed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { canOperate } from "../operationalAccess";
import { getEntitlementFor, isPlanLimitError, planLimitMessage, withinLimit } from "../entitlements";
import {
  assessmentEquals,
  parseQuestionAssessment,
  validateQuestionAssessment,
} from "../questionAssessment";

export const QuizSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  status: z.enum(["draft", "published", "archived"]),
  randomize_questions: z.boolean(),
  randomize_options: z.boolean(),
  time_per_question_seconds: z.number().int().min(5).max(3600),
  question_ids: z.array(z.string()),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(8),
        title: z.string().min(1).max(200),
        instructions: z.string().max(1000).optional(),
        questions: z.number().int().min(0).optional(),
        marks: z.number().min(0).optional(),
      }),
    )
    .max(12)
    .optional(),
  section_of: z.record(z.string(), z.string()).optional(),
  /** Per-question assessment mapping, keyed by question id. null clears it. */
  assessment_of: z.record(z.string(), z.unknown()).optional(),
  calculator: z.boolean().optional(),
  calculator_mode: z.enum(["scientific", "basic"]).optional(),
  calculator_angle_mode: z.enum(["deg", "rad"]).optional(),
  exam_period: z.string().max(120).optional(),
  academic_year: z.string().max(40).optional(),
  grade_label: z.string().max(80).optional(),
  subject: z.string().max(120).optional(),
  instructions: z.string().max(4000).optional(),
  exam_paper_template_id: z.string().nullable().optional(),
});

export type QuizPayload = z.infer<typeof QuizSchema>;

/** Turn database errors into something a teacher can act on. */
export function friendlySaveError(error: { message?: string } | null): string {
  const message = error?.message ?? "Unknown database error.";
  if (message.includes("ASSESSMENT_SOURCE_IMMUTABLE")) {
    return "This paper's questions belong to an examination attempt that is already in progress, so its question content and structure are locked. The paper title, template, instructions and other settings can still be saved.";
  }
  return message;
}

export interface PaperActor {
  ctx: Parameters<typeof canOperate>[0];
  organizationId: string;
  supabase: SupabaseClient;
}

export type PaperSaveResult = { ok: true; id: string } | { error: string };

export async function savePaperForActor(
  raw: QuizPayload,
  actor: PaperActor,
  hooks: { revalidate?: () => void } = {},
): Promise<PaperSaveResult> {
  const { ctx, organizationId: orgId, supabase } = actor;
  if (!(await canOperate(ctx, orgId, raw?.id ? "quizzes.edit" : "quizzes.create", "quizzes"))) {
    return { error: "You don't have permission to edit quizzes." };
  }
  const parsed = QuizSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the form." };
  const q = parsed.data;

  if (!q.id) {
    const ent = await getEntitlementFor(supabase, ctx, orgId);
    const { count } = await supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    if (!withinLimit(ent.limits.max_quizzes, count ?? 0)) {
      return { error: `Your ${ent.planName} plan allows ${ent.limits.max_quizzes} quizzes. Upgrade in Billing.` };
    }
  }

  let preservedSettings: Record<string, unknown> = {};
  if (q.id) {
    const { data: existing } = await supabase
      .from("quizzes")
      .select("settings")
      .eq("id", q.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    preservedSettings = ((existing?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  }

  const payload = {
    organization_id: orgId,
    title: q.title,
    description: q.description || null,
    status: q.status,
    settings: {
      ...preservedSettings,
      randomize_questions: q.randomize_questions,
      randomize_options: q.randomize_options,
      time_per_question_seconds: q.time_per_question_seconds,
      ...(q.sections ? { sections: q.sections } : {}),
      ...(q.calculator !== undefined ? { calculator: q.calculator } : {}),
      ...(q.calculator_mode ? { calculator_mode: q.calculator_mode } : {}),
      ...(q.calculator_angle_mode ? { calculator_angle_mode: q.calculator_angle_mode } : {}),
      ...(q.exam_period !== undefined ? { exam_period: q.exam_period } : {}),
      ...(q.academic_year !== undefined ? { academic_year: q.academic_year } : {}),
      ...(q.grade_label !== undefined ? { grade_label: q.grade_label } : {}),
      ...(q.subject !== undefined ? { subject: q.subject } : {}),
      ...(q.instructions !== undefined ? { instructions: q.instructions } : {}),
      ...(q.exam_paper_template_id !== undefined ? { exam_paper_template_id: q.exam_paper_template_id } : {}),
    },
    created_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };

  let quizId = q.id;
  if (quizId) {
    const { error } = await supabase.from("quizzes").update(payload).eq("id", quizId).eq("organization_id", orgId);
    if (error) return { error: friendlySaveError(error) };
  } else {
    const { data, error } = await supabase.from("quizzes").insert(payload).select().single();
    if (error && isPlanLimitError(error)) return { error: planLimitMessage(error) };
    if (error || !data) return { error: error?.message ?? "Could not create the quiz." };
    quizId = data.id as string;
  }

  // Verify the questions belong to this org.
  const { data: owned } = q.question_ids.length
    ? await supabase.from("questions").select("id, config").eq("organization_id", orgId).in("id", q.question_ids)
    : { data: [] as { id: string; config: Record<string, unknown> | null }[] };
  const ownedIds = new Set(((owned ?? []) as { id: string }[]).map((r) => r.id));
  const desired = q.question_ids.filter((id) => ownedIds.has(id));

  // Skip membership writes when the set and order are already correct.
  const { data: currentRows } = await supabase
    .from("quiz_questions")
    .select("question_id")
    .eq("quiz_id", quizId!)
    .order("position", { ascending: true });
  const current = (currentRows ?? []).map((r: { question_id: string }) => r.question_id);
  const membershipUnchanged = current.length === desired.length && current.every((id, index) => id === desired[index]);

  if (!membershipUnchanged) {
    if (desired.length) {
      const rows = desired.map((question_id, i) => ({ quiz_id: quizId!, question_id, position: i }));
      const { error } = await supabase.from("quiz_questions").upsert(rows, { onConflict: "quiz_id,question_id" });
      if (error) return { error: friendlySaveError(error) };
    }
    {
      const deleteQuery = supabase.from("quiz_questions").delete().eq("quiz_id", quizId!);
      const { error: removeError } = desired.length
        ? await deleteQuery.not("question_id", "in", `(${desired.join(",")})`)
        : await deleteQuery;
      if (removeError) return { error: friendlySaveError(removeError) };
    }
  }

  if (q.assessment_of) {
    const { data: assessRows, error: assessReadError } = await supabase
      .from("quiz_questions")
      .select("question_id, assessment")
      .eq("quiz_id", quizId!);
    if (assessReadError) return { error: friendlySaveError(assessReadError) };
    const storedByQuestion = new Map<string, unknown>(
      ((assessRows ?? []) as { question_id: string; assessment: unknown }[]).map((row) => [row.question_id, row.assessment ?? null]),
    );
    for (const questionId of desired) {
      if (!(questionId in q.assessment_of)) continue;
      const value = q.assessment_of[questionId];
      if (value === null || value === undefined) {
        const stored = storedByQuestion.get(questionId) ?? null;
        if (stored === null) continue;
        const { error: clearError } = await supabase
          .from("quiz_questions")
          .update({ assessment: null })
          .eq("quiz_id", quizId!)
          .eq("question_id", questionId);
        if (clearError) return { error: friendlySaveError(clearError) };
        continue;
      }
      const validation = validateQuestionAssessment(value);
      if (!validation.ok) {
        return {
          error: `Assessment mapping on one question is not valid (${validation.error}). Re-open the question's Assessment mapping panel, re-select the framework criteria and strands from the current reference, and save again.`,
        };
      }
      const parsedMapping = parseQuestionAssessment(value);
      if (!parsedMapping) {
        return { error: "Assessment mapping on one question could not be read. Re-select it in the Assessment mapping panel and save again." };
      }
      const stored = storedByQuestion.get(questionId) ?? null;
      if (assessmentEquals(stored, parsedMapping)) continue;
      const { error: assessWriteError } = await supabase
        .from("quiz_questions")
        .update({ assessment: parsedMapping })
        .eq("quiz_id", quizId!)
        .eq("question_id", questionId);
      if (assessWriteError) return { error: friendlySaveError(assessWriteError) };
    }
  }

  if (q.section_of) {
    for (const row of (owned ?? []) as { id: string; config?: Record<string, unknown> | null }[]) {
      const section = q.section_of[row.id];
      if (!section) continue;
      const cfg = (row.config ?? {}) as Record<string, unknown>;
      if (cfg.paper_section === section) continue;
      const { error: sectionError } = await supabase
        .from("questions")
        .update({ config: { ...cfg, paper_section: section }, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("organization_id", orgId);
      if (sectionError) return { error: friendlySaveError(sectionError) };
    }
  }

  hooks.revalidate?.();
  return { ok: true, id: quizId! };
}
