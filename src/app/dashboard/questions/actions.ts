"use server";

import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { getEntitlementFor, isPlanLimitError, planLimitMessage, withinLimit } from "@/lib/entitlements";
import { questionPublishError } from "@/lib/questionValidation";
import { questionOptionsUnchanged } from "@/lib/questionOptions";
import { normalizePrompt } from "@/lib/questionGeneration";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const OptionSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  is_correct: z.boolean(),
  content_doc: z.unknown().optional().nullable(),
});

const QuestionSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    "single_choice", "multiple_select", "true_false", "short_answer",
    "numeric", "ordering", "matching", "poll", "open_ended", "slide",
  ]),
  prompt: z.string().min(1),
  prompt_doc: z.unknown().optional().nullable(),
  explanation: z.string().optional(),
  explanation_doc: z.unknown().optional().nullable(),
  points: z.number().min(0),
  difficulty: z.enum(["easy", "medium", "hard", "competition"]),
  topic: z.string().optional(),
  status: z.enum(["draft", "pending_review", "published", "archived"]),
  category_id: z.string().nullable().optional(),
  class_id: z.string().nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
  curriculum: z.string().nullable().optional(),
  curriculum_course: z.string().nullable().optional(),
  subtopic: z.string().nullable().optional(),
  source_reference: z.string().nullable().optional(),
  source_url: z.string().url().max(2000).refine((url) => /^https?:\/\//i.test(url)).nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  options: z.array(OptionSchema).default([]),
});

export type QuestionInput = z.infer<typeof QuestionSchema>;

export async function saveQuestion(raw: QuestionInput) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) return { error: "You don't have permission to edit questions." };

  const parsed = QuestionSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the form — some fields are invalid." };
  const q = parsed.data;
  if (q.status === "published") {
    const publishError = questionPublishError(q);
    if (publishError) return { error: publishError };
  }

  const supabase = await createClient();

  if (!q.id) {
    const ent = await getEntitlementFor(supabase, ctx, org.id);
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id);
    if (!withinLimit(ent.limits.max_questions, count ?? 0))
      return { error: `Your ${ent.planName} plan allows ${ent.limits.max_questions} questions. Upgrade in Billing to add more.` };
  }

  let hadPromptHash = false;
  if (q.id) {
    const { data: existing, error } = await supabase.from("questions").select("prompt_hash").eq("id", q.id).eq("organization_id", org.id).maybeSingle();
    if (error || !existing) return { error: "That question could not be loaded." };
    hadPromptHash = Boolean(existing.prompt_hash);
  }

  // Linked metadata must belong to this organization, not just be a valid ID.
  if (q.category_id) {
    const { data: category, error } = await supabase.from("question_categories").select("id").eq("id", q.category_id).eq("organization_id", org.id).maybeSingle();
    if (error || !category) return { error: "The selected category does not belong to this organization." };
  }
  const classId: string | null = q.class_id || null;
  if (classId) {
    const { data: cls } = await supabase.from("classes").select("id").eq("id", classId).eq("organization_id", org.id).maybeSingle();
    if (!cls) return { error: "The selected class does not belong to this organization." };
  }

  if (q.subject_id) {
    const { data: subject } = await supabase.from("subjects").select("id").eq("id", q.subject_id).eq("organization_id", org.id).maybeSingle();
    if (!subject) return { error: "The selected subject does not belong to this organization." };
  }

  const payload = {
    organization_id: org.id,
    ...(hadPromptHash ? { prompt_hash: createHash("sha256").update(normalizePrompt(q.prompt)).digest("hex") } : {}),
    category_id: q.category_id || null,
    class_id: classId,
    subject_id: q.subject_id || null,
    curriculum: q.curriculum?.trim() || null,
    curriculum_course: q.curriculum_course?.trim() || null,
    subtopic: q.subtopic?.trim() || null,
    source_reference: q.source_reference?.trim() || null,
    source_url: q.source_url?.trim() || null,
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

  // Avoid replacing option IDs when only metadata changed. This comparison
  // is not a transactional snapshot; actual option edits still require versioning.
  let optionsUnchanged = false;
  if (q.id) {
    const { data: oldOptions, error: optionsReadError } = await supabase.from("question_options")
      .select("label, is_correct, position, content_doc").eq("question_id", q.id).order("position");
    if (optionsReadError || !oldOptions) return { error: "Existing options could not be loaded. Please retry." };
    optionsUnchanged = questionOptionsUnchanged(oldOptions, q.options);
  }

  let questionId = q.id;
  if (questionId) {
    const { error } = await supabase.from("questions").update(payload).eq("id", questionId).eq("organization_id", org.id);
    if (error) return { error: error.message };
    if (!optionsUnchanged) {
      const { error: deleteError } = await supabase.from("question_options").delete().eq("question_id", questionId);
      // Details have already been written separately; never claim full success.
      if (deleteError) return { error: "Question details were saved, but existing options could not be replaced. Please reload and contact an administrator." };
    }
  } else {
    const { data, error } = await supabase.from("questions").insert(payload).select().single();
    if (error && isPlanLimitError(error)) return { error: planLimitMessage(error) };
    if (error || !data) return { error: error?.message ?? "Could not save the question." };
    questionId = data.id;
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

  revalidatePath("/dashboard/questions");
  return { ok: true, id: questionId };
}

export async function deleteQuestion(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/questions");
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("questions").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/dashboard/questions");
}

export async function setQuestionStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/questions");
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const supabase = await createClient();
  if (status === "published") {
    const { data: question } = await supabase
      .from("questions")
      .select("*, question_options(label, is_correct)")
      .eq("id", id)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!question) redirect("/dashboard/questions?e=not_found");
    const publishError = questionPublishError({
      ...question!,
      options: (question!.question_options as { label: string; is_correct: boolean }[]) ?? [],
    });
    if (publishError) redirect("/dashboard/questions?e=not_ready");
  }
  await supabase.from("questions").update({ status }).eq("id", id).eq("organization_id", org.id);
  revalidatePath("/dashboard/questions");
}

export async function createCategory(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/questions");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) redirect("/dashboard/questions");
  const supabase = await createClient();
  await supabase.from("question_categories").insert({ organization_id: org.id, name });
  revalidatePath("/dashboard/questions");
}

/** CSV import → always lands in pending_review with a per-row error report. */
export async function importQuestionsCsv(csv: string) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES))
    return { error: "You don't have permission to import questions." };

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { error: "The file needs a header row and at least one question row." };

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const header = parseRow(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const TYPE_I = col("type"), PROMPT_I = col("prompt"), OPT_I = col("options"),
    COR_I = col("correct"), PTS_I = col("points"), EXP_I = col("explanation"), TOPIC_I = col("topic");
  if (TYPE_I < 0 || PROMPT_I < 0)
    return { error: "Missing required columns: type, prompt (plus options, correct, points, explanation, topic)." };

  const validTypes = ["single_choice", "multiple_select", "true_false", "short_answer", "numeric", "ordering", "poll", "open_ended"];
  const supabase = await createClient();

  const ent = await getEntitlementFor(supabase, ctx, org.id);
  const { count: existing } = await supabase
    .from("questions").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
  let budget = ent.limits.max_questions === -1 ? Infinity : ent.limits.max_questions - (existing ?? 0);

  const report: { row: number; ok: boolean; message: string }[] = [];
  let imported = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowNo = i + 1;
    const cells = parseRow(lines[i]);
    const type = (cells[TYPE_I] ?? "").toLowerCase().replace(/\s+/g, "_");
    const prompt = cells[PROMPT_I] ?? "";
    if (!validTypes.includes(type)) { report.push({ row: rowNo, ok: false, message: `Unknown type "${type}".` }); continue; }
    if (!prompt) { report.push({ row: rowNo, ok: false, message: "Empty prompt." }); continue; }
    if (budget <= 0) { report.push({ row: rowNo, ok: false, message: "Plan question limit reached." }); continue; }

    const optLabels = OPT_I >= 0 && cells[OPT_I] ? cells[OPT_I].split("|").map((s) => s.trim()).filter(Boolean) : [];
    const correctIdx = COR_I >= 0 && cells[COR_I]
      ? cells[COR_I].split("|").map((s) => parseInt(s.trim(), 10) - 1).filter((n) => !Number.isNaN(n))
      : [];
    const needsOptions = ["single_choice", "multiple_select", "true_false", "poll", "ordering"].includes(type);
    if (needsOptions && optLabels.length < 2) { report.push({ row: rowNo, ok: false, message: "Needs at least 2 options separated by |." }); continue; }
    if (["single_choice", "multiple_select", "true_false"].includes(type) && correctIdx.length === 0) {
      report.push({ row: rowNo, ok: false, message: "Mark the correct option(s) by 1-based position, e.g. 2 or 1|3." }); continue;
    }

    const config: Record<string, unknown> = {};
    if (type === "numeric") {
      const v = parseFloat(cells[COR_I] ?? "");
      if (Number.isNaN(v)) { report.push({ row: rowNo, ok: false, message: "Numeric questions need the numeric answer in the correct column." }); continue; }
      config.numeric_answer = v;
      config.tolerance = 0;
    }

    const { data: created, error } = await supabase.from("questions").insert({
      organization_id: org.id,
      type,
      prompt,
      explanation: EXP_I >= 0 ? cells[EXP_I] || null : null,
      topic: TOPIC_I >= 0 ? cells[TOPIC_I] || null : null,
      points: PTS_I >= 0 && cells[PTS_I] ? Math.max(0, parseFloat(cells[PTS_I]) || 1) : 1,
      status: "pending_review",
      config,
      created_by: ctx.user.id,
    }).select().single();

    if (error || !created) {
      const message = error && isPlanLimitError(error) ? planLimitMessage(error) : error?.message ?? "Insert failed.";
      report.push({ row: rowNo, ok: false, message });
      // A quota rejection applies to the rest of the file too; stop rather than
      // emitting one identical failure per remaining row.
      if (error && isPlanLimitError(error)) break;
      continue;
    }

    if (optLabels.length > 0) {
      await supabase.from("question_options").insert(
        optLabels.map((label, idx) => ({
          question_id: created.id,
          label,
          is_correct: type === "short_answer" ? true : correctIdx.includes(idx),
          position: idx,
        })),
      );
    }
    imported++;
    budget--;
    report.push({ row: rowNo, ok: true, message: "Imported (pending review)." });
  }

  revalidatePath("/dashboard/questions");
  return { ok: true, imported, report };
}

/** Upload a question image/diagram to the org-scoped question-media bucket. */
export async function uploadQuestionImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) return { error: "You don't have permission to upload media." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file first." };
  const okTypes: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = okTypes[file.type];
  if (!ext) return { error: "Use a PNG, JPEG, WebP or GIF image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Images must be 5 MB or smaller." };

  const supabase = await createClient();
  const path = `${org.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("question-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("question-media").getPublicUrl(path);
  return { url: data.publicUrl };
}
