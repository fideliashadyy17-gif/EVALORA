"use server";

/**
 * Question Studio templates — Super Admin actions.
 *
 * A template is a reusable authoring starting point. Applying one copies its
 * payload into the editor, so a template edited later never changes a question
 * that was already created from it, and therefore never changes an examination
 * that is scheduled, open or published.
 *
 * AUTHORIZATION
 *   • Every action starts from `requireSuperAdmin()` — a verified session with
 *     `platform_role = 'super_admin'`. Nothing here trusts a form field for
 *     authority.
 *   • A template created FROM a question always inherits that question's
 *     organization. It can never be promoted to platform-wide, because that
 *     would copy one school's authored content into a payload every other tenant
 *     can read.
 *   • Writes are validated against the closed question-type registry, so a
 *     template can never offer authors a type the examination engine cannot
 *     render.
 */
import { audit, fstr, requireSuperAdmin } from "@/lib/admin";
import {
  TEMPLATE_LIMITS,
  knownQuestionType,
  normalizeTags,
  normalizeTemplateStatus,
  questionToTemplateContent,
  templatePayloadWithinLimits,
} from "@/lib/questionTemplates";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const TEMPLATES_PATH = "/admin/questions/templates";

/**
 * Outcomes are reported through the console's established `?ok=` / `?e=` codes
 * and rendered by `<Notice>` (see src/app/admin/questions/templates/page.tsx),
 * the same mechanism the neighbouring Question Categories page uses.
 */
function outcome(kind: "ok" | "e", code: string): never {
  redirect(`${TEMPLATES_PATH}?${kind}=${code}`);
}

function uuidOrNull(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/** Shared field extraction, bounded by the same limits the database enforces. */
function readTemplateFields(formData: FormData) {
  const name = fstr(formData, "name", TEMPLATE_LIMITS.name);
  const questionType = knownQuestionType(formData.get("question_type"));
  return {
    name,
    question_type: questionType,
    description: fstr(formData, "description", TEMPLATE_LIMITS.description),
    subject: fstr(formData, "subject", TEMPLATE_LIMITS.subject),
    grade_label: fstr(formData, "grade_label", TEMPLATE_LIMITS.gradeLabel),
    curriculum: fstr(formData, "curriculum", TEMPLATE_LIMITS.curriculum),
    topic: fstr(formData, "topic", TEMPLATE_LIMITS.topic),
    difficulty: fstr(formData, "difficulty", TEMPLATE_LIMITS.difficulty),
    tags: normalizeTags(String(formData.get("tags") ?? "")),
  };
}

/** Create an empty template (platform-wide when no organization is chosen). */
export async function createQuestionTemplate(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const fields = readTemplateFields(formData);
  const organizationId = uuidOrNull(formData.get("organization_id"));

  if (!fields.name || fields.name.length < 2) {
    outcome("e", "name");
  }
  if (!fields.question_type) {
    outcome("e", "type");
  }
  if (organizationId) {
    const { data: org } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) {
      outcome("e", "org");
    }
  }

  const { data, error } = await admin
    .from("question_templates")
    .insert({
      organization_id: organizationId,
      name: fields.name,
      description: fields.description,
      question_type: fields.question_type,
      subject: fields.subject,
      grade_label: fields.grade_label,
      curriculum: fields.curriculum,
      topic: fields.topic,
      difficulty: fields.difficulty,
      content: {},
      design: {},
      tags: fields.tags,
      status: "active",
      created_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    outcome("e", "failed");
  }

  await audit(ctx, "question_template.create", "question_templates", data.id, organizationId, {
    name: fields.name,
    question_type: fields.question_type,
    scope: organizationId ? "organization" : "platform",
  });
  revalidatePath(TEMPLATES_PATH);
  revalidatePath("/admin/questions/new");
  outcome("ok", "created");
}

/**
 * Snapshot an existing question into a template. The template inherits the
 * question's organization; the question itself is never modified.
 */
export async function createTemplateFromQuestion(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const fields = readTemplateFields(formData);
  const questionId = uuidOrNull(formData.get("question_id"));

  if (!questionId) {
    outcome("e", "question");
  }
  if (!fields.name || fields.name.length < 2) {
    outcome("e", "name");
  }

  const { data: question } = await admin
    .from("questions")
    .select("id, organization_id, type, prompt, prompt_doc, explanation, explanation_doc, points, difficulty, topic, curriculum, curriculum_course, subtopic, source_reference, source_url, config")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) {
    outcome("e", "question");
  }

  const { data: options } = await admin
    .from("question_options")
    .select("label, is_correct, position, content_doc")
    .eq("question_id", questionId)
    .order("position");

  const { content, design } = questionToTemplateContent({
    ...question,
    options: (options ?? []).map((o) => ({
      label: o.label,
      is_correct: o.is_correct,
      content_doc: o.content_doc,
    })),
  });
  if (!templatePayloadWithinLimits(content, design)) {
    outcome("e", "size");
  }

  const questionType = knownQuestionType(question.type) ?? fields.question_type;
  if (!questionType) {
    outcome("e", "type");
  }

  // Isolation rule: a question's content stays inside its own organization.
  const organizationId = uuidOrNull(question.organization_id);

  const { data: created, error } = await admin
    .from("question_templates")
    .insert({
      organization_id: organizationId,
      name: fields.name,
      description: fields.description,
      question_type: questionType,
      subject: fields.subject,
      grade_label: fields.grade_label,
      curriculum: fields.curriculum ?? (typeof question.curriculum === "string" ? question.curriculum : null),
      topic: fields.topic ?? (typeof question.topic === "string" ? question.topic : null),
      difficulty: fields.difficulty ?? (typeof question.difficulty === "string" ? question.difficulty : null),
      content,
      design,
      tags: fields.tags,
      status: "active",
      created_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error || !created?.id) {
    outcome("e", "failed");
  }

  await audit(ctx, "question_template.create_from_question", "question_templates", created.id, organizationId, {
    name: fields.name,
    source_question_id: questionId,
    question_type: questionType,
  });
  revalidatePath(TEMPLATES_PATH);
  revalidatePath("/admin/questions/new");
  outcome("ok", "created_from_question");
}

/** Archive or restore a template. Archiving never deletes anything. */
export async function setQuestionTemplateStatus(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const templateId = uuidOrNull(formData.get("id"));
  const status = normalizeTemplateStatus(formData.get("status"));
  if (!templateId) {
    outcome("e", "failed");
  }

  const { data: existing } = await admin
    .from("question_templates")
    .select("id, organization_id, status")
    .eq("id", templateId)
    .maybeSingle();
  if (!existing) {
    outcome("e", "failed");
  }

  const { error } = await admin
    .from("question_templates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) {
    outcome("e", "failed");
  }

  await audit(ctx, `question_template.${status === "archived" ? "archive" : "restore"}`, "question_templates", templateId, existing.organization_id, { status });
  revalidatePath(TEMPLATES_PATH);
  revalidatePath("/admin/questions/new");
  outcome("ok", status);
}

/**
 * Delete a template row. Only the template is removed: questions created from it
 * are independent copies and are never touched.
 */
export async function deleteQuestionTemplate(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const templateId = uuidOrNull(formData.get("id"));
  // Matches the repository convention: the destructive-action tick box posts "on".
  const confirm = String(formData.get("confirm") ?? "");
  if (!templateId || (confirm !== "on" && confirm !== "yes")) {
    outcome("e", "confirm");
  }

  const { data: existing } = await admin
    .from("question_templates")
    .select("id, organization_id, name, usage_count")
    .eq("id", templateId)
    .maybeSingle();
  if (!existing) {
    outcome("e", "failed");
  }

  const { error } = await admin.from("question_templates").delete().eq("id", templateId);
  if (error) {
    outcome("e", "failed");
  }

  await audit(ctx, "question_template.delete", "question_templates", templateId, existing.organization_id, {
    name: existing.name,
    usage_count: existing.usage_count,
  });
  revalidatePath(TEMPLATES_PATH);
  revalidatePath("/admin/questions/new");
  outcome("ok", "deleted");
}
