import "server-only";

/**
 * Shared question authoring service.
 *
 * `saveQuestion` (the server action) and the AI core both call this. The action
 * supplies the browser's session; the AI core supplies the bound owner's
 * identity and a service-role client. The rules are identical because the code
 * is identical: zod parsing, `questions.create`/`questions.edit` through
 * `canOperate`, the plan's question allowance, organization-scoped references,
 * option replacement, and the publish gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { canOperate } from "../operationalAccess";
import { getEntitlementFor, isPlanLimitError, planLimitMessage, withinLimit } from "../entitlements";
import { questionPublishError } from "../questionValidation";
import { questionOptionsUnchanged } from "../questionOptions";
import { getQuestionTemplate, recordTemplateUse } from "../questionTemplates";
import { createHash } from "node:crypto";
import { normalizePrompt } from "../questionGeneration";

/** The contract the editor form and the AI core both fill. */
export interface QuestionPayload {
  id?: string;
  type:
    | "single_choice"
    | "multiple_select"
    | "true_false"
    | "short_answer"
    | "numeric"
    | "ordering"
    | "matching"
    | "poll"
    | "open_ended"
    | "assess_parts"
    | "slide";
  prompt: string;
  prompt_doc?: unknown | null;
  explanation?: string;
  explanation_doc?: unknown | null;
  points: number;
  difficulty: "easy" | "medium" | "hard" | "competition";
  topic?: string;
  status: "draft" | "pending_review" | "published" | "archived";
  category_id?: string | null;
  class_id?: string | null;
  subject_id?: string | null;
  curriculum?: string | null;
  curriculum_course?: string | null;
  subtopic?: string | null;
  source_reference?: string | null;
  source_url?: string | null;
  /**
   * How the question came to exist. The column defaults to 'manual'; the AI
   * assistant states 'ai_generated' so the bank can tell its work apart from a
   * teacher's. Never inferred — the caller says what it did.
   */
  creation_method?: "manual" | "imported" | "ai_generated";
  config?: Record<string, unknown>;
  options: { id?: string; label: string; is_correct: boolean; content_doc?: unknown | null }[];
  template_id?: string | null;
}

export interface QuestionActor {
  ctx: Parameters<typeof canOperate>[0];
  organizationId: string;
  /** RLS client for the acting user, or a service client for a bound agent. */
  supabase: SupabaseClient;
  /**
   * Optional permission check for a caller without a browser cookie (the
   * external-agent path). See `PaperActor.authorize`.
   */
  authorize?: (permission: string, module?: string) => Promise<boolean>;
}

export type QuestionSaveResult = { ok: true; id: string } | { error: string };

export async function saveQuestionForActor(
  q: QuestionPayload,
  actor: QuestionActor,
  hooks: { revalidate?: () => void } = {},
): Promise<QuestionSaveResult> {
  const { ctx, organizationId: orgId, supabase } = actor;
  const permission = q.id ? "questions.edit" : "questions.create";
  const allowed = actor.authorize
    ? await actor.authorize(permission, "question_bank")
    : await canOperate(ctx, orgId, permission, "question_bank");
  if (!allowed) {
    return { error: "You don't have permission to edit questions." };
  }

  if (q.status === "published") {
    const publishError = questionPublishError(q);
    if (publishError) return { error: publishError };
  }

  if (!q.id) {
    const ent = await getEntitlementFor(supabase, ctx, orgId);
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if (!withinLimit(ent.limits.max_questions, count ?? 0)) {
      return {
        error: `Your ${ent.planName} plan allows ${ent.limits.max_questions} questions. Upgrade in Billing to add more.`,
      };
    }
  }

  let hadPromptHash = false;
  if (q.id) {
    const { data: existing, error } = await supabase
      .from("questions")
      .select("prompt_hash")
      .eq("id", q.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error || !existing) return { error: "That question could not be loaded." };
    hadPromptHash = Boolean(existing.prompt_hash);
  }

  // Linked metadata must belong to this organization, not just be a valid ID.
  if (q.category_id) {
    const { data: category, error } = await supabase
      .from("question_categories")
      .select("id")
      .eq("id", q.category_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error || !category) return { error: "The selected category does not belong to this organization." };
  }
  const classId: string | null = q.class_id || null;
  if (classId) {
    const { data: cls } = await supabase.from("classes").select("id").eq("id", classId).eq("organization_id", orgId).maybeSingle();
    if (!cls) return { error: "The selected class does not belong to this organization." };
  }

  if (q.subject_id) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", q.subject_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!subject) return { error: "The selected subject does not belong to this organization." };
  }

  const payload = {
    organization_id: orgId,
    ...(hadPromptHash ? { prompt_hash: createHash("sha256").update(normalizePrompt(q.prompt)).digest("hex") } : {}),
    category_id: q.category_id || null,
    class_id: classId,
    subject_id: q.subject_id || null,
    curriculum: q.curriculum?.trim() || null,
    curriculum_course: q.curriculum_course?.trim() || null,
    subtopic: q.subtopic?.trim() || null,
    source_reference: q.source_reference?.trim() || null,
    source_url: q.source_url?.trim() || null,
    ...(q.creation_method ? { creation_method: q.creation_method } : {}),
    type: q.type,
    prompt: q.prompt,
    prompt_doc: q.prompt_doc ?? null,
    explanation: q.explanation || null,
    explanation_doc: q.explanation_doc ?? null,
    points: q.points,
    difficulty: q.difficulty,
    topic: q.topic || null,
    status: q.status,
    config: q.config ?? {},
    created_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };

  // Avoid replacing option IDs when only metadata changed.
  let optionsUnchanged = false;
  if (q.id) {
    const { data: oldOptions, error: optionsReadError } = await supabase
      .from("question_options")
      .select("label, is_correct, position, content_doc")
      .eq("question_id", q.id)
      .order("position");
    if (optionsReadError || !oldOptions) return { error: "Existing options could not be loaded. Please retry." };
    optionsUnchanged = questionOptionsUnchanged(oldOptions, q.options);
  }

  let questionId = q.id;
  if (questionId) {
    const { error } = await supabase.from("questions").update(payload).eq("id", questionId).eq("organization_id", orgId);
    if (error) return { error: error.message };
    if (!optionsUnchanged) {
      const { error: deleteError } = await supabase.from("question_options").delete().eq("question_id", questionId);
      if (deleteError) {
        return {
          error:
            "Question details were saved, but existing options could not be replaced. Please reload and contact an administrator.",
        };
      }
    }
  } else {
    const { data, error } = await supabase.from("questions").insert(payload).select().single();
    if (error && isPlanLimitError(error)) return { error: planLimitMessage(error) };
    if (error || !data) return { error: error?.message ?? "Could not save the question." };
    questionId = data.id as string;
    if (q.template_id) {
      // Counted only after the question exists, and only for a template this
      // organization may actually read (its own or the platform-wide library), so
      // an author cannot inflate another tenant's counter. A template counter can
      // never fail or roll back a saved question, hence the swallowed result.
      const visible = await getQuestionTemplate(q.template_id, orgId);
      if (visible) await recordTemplateUse(q.template_id).catch(() => 0);
    }
  }

  if (!optionsUnchanged && q.options.length > 0) {
    const { error } = await supabase.from("question_options").insert(
      q.options.map((o, i) => ({
        question_id: questionId!,
        label: o.label,
        content_doc: o.content_doc ?? null,
        is_correct: o.is_correct,
        position: i,
      })),
    );
    if (error) return { error: error.message };
  }

  hooks.revalidate?.();
  return { ok: true, id: questionId! };
}
