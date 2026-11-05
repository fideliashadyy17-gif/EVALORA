"use server";

import type { QuestionFormValues } from "@/components/QuestionForm";
import { audit, fstr, requireSuperAdmin } from "@/lib/admin";
import { questionPublishError } from "@/lib/questionValidation";
import { normalizePrompt } from "@/lib/questionGeneration";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const QUESTION_TYPES = [
  "single_choice",
  "multiple_select",
  "true_false",
  "short_answer",
  "numeric",
  "ordering",
  "matching",
  "poll",
  "open_ended",
  "slide",
] as const;

const OptionSchema = z.object({
  label: z.string().min(1).max(20000),
  is_correct: z.boolean(),
  content_doc: z.unknown().optional().nullable(),
});

const QuestionSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(1).max(100000),
  prompt_doc: z.unknown().optional().nullable(),
  explanation: z.string().max(100000).optional(),
  explanation_doc: z.unknown().optional().nullable(),
  points: z.number().min(0).max(10000),
  difficulty: z.enum(["easy", "medium", "hard", "competition"]),
  topic: z.string().max(200).optional(),
  status: z.enum(["draft", "pending_review", "published", "archived"]),
  category_id: z.string().uuid().nullable().optional(),
  class_id: z.string().uuid().nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
  curriculum: z.string().max(80).nullable().optional(),
  curriculum_course: z.string().max(160).nullable().optional(),
  subtopic: z.string().max(200).nullable().optional(),
  source_reference: z.string().max(1000).nullable().optional(),
  source_url: z.string().url().max(2000).refine((url) => /^https?:\/\//i.test(url)).nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  options: z.array(OptionSchema).max(50).default([]),
});

function adminJson(value: unknown) {
  if (value == null || typeof value !== "object") return null;
  return value;
}

/**
 * Super Admin direct question creation/editing.
 * This mirrors the workspace action's storage contract while making the
 * organization explicit and recording the operation in the audit log.
 */
export async function saveQuestionAsAdmin(raw: QuestionFormValues) {
  const ctx = await requireSuperAdmin();
  const parsed = QuestionSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the question form — some fields are invalid." };
  const q = parsed.data;
  if (q.status === "published") {
    const publishError = questionPublishError(q);
    if (publishError) return { error: publishError };
  }
  const admin = createAdminClient();

  let organizationId = q.organization_id ?? null;
  let hadPromptHash = false;

  if (q.id) {
    const { data: existing } = await admin
      .from("questions")
      .select("id, organization_id, prompt_hash")
      .eq("id", q.id)
      .maybeSingle();
    if (!existing) return { error: "That question no longer exists." };
    if (organizationId && organizationId !== existing.organization_id) {
      return { error: "A question cannot be moved to another organization because existing quiz links belong to its original organization." };
    }
    organizationId = existing.organization_id;
    hadPromptHash = Boolean(existing.prompt_hash);
  }

  if (!organizationId) return { error: "Choose the organization that owns this question." };

  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return { error: "The selected organization no longer exists." };

  const categoryId: string | null = q.category_id ?? null;
  if (categoryId) {
    const { data: category } = await admin
      .from("question_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!category) return { error: "The selected category does not belong to this organization." };
  }

  const classId: string | null = q.class_id ?? null;
  if (classId) {
    const { data: cls } = await admin.from("classes").select("id").eq("id", classId).eq("organization_id", organizationId).maybeSingle();
    if (!cls) return { error: "The selected class does not belong to this organization." };
  }

  if (q.subject_id) {
    const { data: subject } = await admin.from("subjects").select("id").eq("id", q.subject_id).eq("organization_id", organizationId).maybeSingle();
    if (!subject) return { error: "The selected subject does not belong to this organization." };
  }

  const payload = {
    organization_id: organizationId,
    ...(hadPromptHash ? { prompt_hash: createHash("sha256").update(normalizePrompt(q.prompt)).digest("hex") } : {}),
    category_id: categoryId,
    class_id: classId,
    subject_id: q.subject_id || null,
    curriculum: q.curriculum?.trim() || null,
    curriculum_course: q.curriculum_course?.trim() || null,
    subtopic: q.subtopic?.trim() || null,
    source_reference: q.source_reference?.trim() || null,
    source_url: q.source_url?.trim() || null,
    type: q.type,
    prompt: q.prompt,
    prompt_doc: adminJson(q.prompt_doc),
    explanation: q.explanation?.trim() ? q.explanation : null,
    explanation_doc: adminJson(q.explanation_doc),
    points: q.points,
    difficulty: q.difficulty,
    topic: q.topic?.trim() ? q.topic.trim() : null,
    status: q.status,
    config: q.config ?? {},
    created_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };

  let questionId = q.id ?? null;
  if (questionId) {
    const { error } = await admin
      .from("questions")
      .update(payload)
      .eq("id", questionId)
      .eq("organization_id", organizationId);
    if (error) return { error: error.message };
    const { error: deleteError } = await admin.from("question_options").delete().eq("question_id", questionId);
    if (deleteError) return { error: deleteError.message };
    await audit(ctx, "question.updated_by_super_admin", "questions", questionId, organizationId, {
      type: q.type,
      status: q.status,
    });
  } else {
    const { data, error } = await admin.from("questions").insert(payload).select("id").single();
    if (error || !data) return { error: error?.message ?? "Could not create the question." };
    questionId = data.id;
    await audit(ctx, "question.created_by_super_admin", "questions", questionId!, organizationId, {
      type: q.type,
      status: q.status,
    });
  }

  if (q.options.length) {
    const { error } = await admin.from("question_options").insert(
      q.options.map((o, i) => ({
        question_id: questionId!,
        label: o.label,
        content_doc: adminJson(o.content_doc),
        is_correct: o.is_correct,
        position: i,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/questions");
  revalidatePath("/dashboard/questions");
  return { ok: true, id: questionId! };
}

/** Upload question media for a selected organization as Super Admin. */
export async function uploadQuestionImageAsAdmin(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireSuperAdmin();
  const file = formData.get("file");
  const organizationId = fstr(formData, "organization_id", 60);
  if (!organizationId) return { error: "Choose an organization before uploading." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file first." };
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = extensions[file.type];
  if (!ext) return { error: "Use a PNG, JPEG, WebP or GIF image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Images must be 5 MB or smaller." };

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
  if (!org) return { error: "The selected organization no longer exists." };

  const path = `${organizationId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("question-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: error.message };
  const { data } = admin.storage.from("question-media").getPublicUrl(path);
  return { url: data.publicUrl };
}

function withCopyMarker(doc: unknown) {
  if (!doc || typeof doc !== "object") return doc;
  const clone = JSON.parse(JSON.stringify(doc)) as { type?: string; content?: unknown[] };
  if (!Array.isArray(clone.content)) return clone;
  clone.content.push({
    type: "paragraph",
    content: [{ type: "text", text: "(Copy)" }],
  });
  return clone;
}

/** Duplicate a question, including every structured answer option. */
export async function duplicateQuestionAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  const backRaw = String(formData.get("back") ?? "/admin/questions");
  const back = backRaw.startsWith("/admin/") ? backRaw : "/admin/questions";
  const dest = (suffix: string) => `${back}${back.includes("?") ? "&" : "?"}${suffix}`;

  const { data: q } = await admin
    .from("questions")
    .select("*, question_options(*)")
    .eq("id", id)
    .maybeSingle();
  if (!q) redirect(dest("e=duplicate_failed"));

  const options = [...((q!.question_options as Record<string, unknown>[]) ?? [])].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );

  const { data: created, error } = await admin
    .from("questions")
    .insert({
      organization_id: q!.organization_id,
      category_id: q!.category_id,
      type: q!.type,
      prompt: `${q!.prompt} (copy)`,
      prompt_doc: withCopyMarker(q!.prompt_doc),
      explanation: q!.explanation,
      explanation_doc: q!.explanation_doc,
      points: q!.points,
      difficulty: q!.difficulty,
      topic: q!.topic,
      tags: q!.tags ?? [],
      status: "draft",
      config: q!.config ?? {},
      created_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created) redirect(dest("e=duplicate_failed"));

  if (options.length) {
    await admin.from("question_options").insert(
      options.map((o, i) => ({
        question_id: created!.id,
        label: o.label,
        content_doc: o.content_doc ?? null,
        is_correct: Boolean(o.is_correct),
        position: i,
      })),
    );
  }

  await audit(ctx, "question.duplicated_by_super_admin", "questions", created!.id, q!.organization_id, { from: id });
  revalidatePath("/admin/questions");
  redirect(`/admin/questions/${created!.id}?ok=duplicated`);
}

/* ── Question categories ────────────────────────────────────────────── */

function categoryDest(formData: FormData, suffix: string): never {
  const orgId = fstr(formData, "organization_id", 60);
  const base = orgId ? `/admin/questions/categories?org=${orgId}` : "/admin/questions/categories";
  redirect(`${base}${base.includes("?") ? "&" : "?"}${suffix}`);
}

export async function saveQuestionCategoryAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const organizationId = fstr(formData, "organization_id", 60);
  const id = fstr(formData, "id", 60);
  const name = fstr(formData, "name", 100);
  if (!organizationId || !name) categoryDest(formData, "e=category_name");

  const { data: duplicate } = await admin
    .from("question_categories")
    .select("id")
    .eq("organization_id", organizationId!)
    .ilike("name", name!)
    .maybeSingle();
  if (duplicate && duplicate.id !== id) categoryDest(formData, "e=category_exists");

  if (id) {
    const { error } = await admin
      .from("question_categories")
      .update({ name })
      .eq("id", id)
      .eq("organization_id", organizationId!);
    if (error) categoryDest(formData, "e=category_failed");
    await audit(ctx, "question_category.updated", "question_categories", id, organizationId, { name });
  } else {
    const { data, error } = await admin
      .from("question_categories")
      .insert({ organization_id: organizationId, name })
      .select("id")
      .single();
    if (error || !data) categoryDest(formData, "e=category_failed");
    await audit(ctx, "question_category.created", "question_categories", data!.id, organizationId, { name });
  }
  revalidatePath("/admin/questions/categories");
  categoryDest(formData, "ok=category_saved");
}

export async function deleteQuestionCategoryAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const organizationId = fstr(formData, "organization_id", 60);
  const id = fstr(formData, "id", 60);
  if (!organizationId || !id || formData.get("confirm") !== "on") categoryDest(formData, "e=confirm");

  const { error } = await admin
    .from("question_categories")
    .delete()
    .eq("id", id!)
    .eq("organization_id", organizationId!);
  if (error) categoryDest(formData, "e=category_failed");
  await audit(ctx, "question_category.deleted", "question_categories", id!, organizationId);
  revalidatePath("/admin/questions/categories");
  categoryDest(formData, "ok=category_deleted");
}

/**
 * Review workflow for (AI-generated or manual) questions.
 * Draft → Reviewed → Approved (publishes) / Rejected / Archived.
 * Only approved questions should be attached to finalized competitions.
 */
export async function setQuestionReview(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = fstr(formData, "id", 60);
  const review = String(formData.get("review") ?? "");
  const back = fstr(formData, "back", 300) ?? "/admin/questions";
  if (!id || !["draft", "reviewed", "approved", "rejected", "archived"].includes(review)) redirect(`${back}${back.includes("?") ? "&" : "?"}e=not_ready`);

  const { data: q, error: readError } = await admin
    .from("questions")
    .select("id, organization_id, type, prompt, points, config, question_options(label, is_correct)")
    .eq("id", id!)
    .maybeSingle();
  if (readError || !q) redirect("/admin/questions?e=not_found");

  if (review === "approved" && (!Array.isArray(q!.question_options) || questionPublishError({
    type: q!.type,
    prompt: q!.prompt,
    points: q!.points,
    config: q!.config as Record<string, unknown> | null,
    options: q!.question_options as { label: string; is_correct: boolean }[],
  }))) redirect(`${back}${back.includes("?") ? "&" : "?"}e=not_ready`);

  const patch: Record<string, unknown> = {
    review_status: review,
    reviewed_by: ctx.user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (review === "approved") patch.status = "published";
  if (review === "archived") patch.status = "archived";
  if (review === "rejected" || review === "draft") patch.status = "draft";
  if (review === "reviewed") patch.status = "pending_review";

  const { error } = await admin.from("questions").update(patch).eq("id", id!);
  if (error) redirect(`${back}${back.includes("?") ? "&" : "?"}e=not_ready`);
  await audit(ctx, `question.review_${review}`, "questions", id!, q!.organization_id, { review });
  revalidatePath("/admin/questions");
  redirect(`${back}${back.includes("?") ? "&" : "?"}ok=review_${review}`);
}
