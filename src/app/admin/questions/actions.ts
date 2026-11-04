"use server";

import type { QuestionFormValues } from "@/components/QuestionForm";
import { audit, fstr, requireSuperAdmin } from "@/lib/admin";
import { questionPublishError } from "@/lib/questionValidation";
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
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string().max(200).optional(),
  status: z.enum(["draft", "pending_review", "published", "archived"]),
  category_id: z.string().uuid().nullable().optional(),
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

  if (q.id) {
    const { data: existing } = await admin
      .from("questions")
      .select("id, organization_id")
      .eq("id", q.id)
      .maybeSingle();
    if (!existing) return { error: "That question no longer exists." };
    if (organizationId && organizationId !== existing.organization_id) {
      return { error: "A question cannot be moved to another organization because existing quiz links belong to its original organization." };
    }
    organizationId = existing.organization_id;
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

  const payload = {
    organization_id: organizationId,
    category_id: categoryId,
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
