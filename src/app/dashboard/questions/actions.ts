"use server";

import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { getEntitlement, withinLimit } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const OptionSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  is_correct: z.boolean(),
});

const QuestionSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    "single_choice", "multiple_select", "true_false", "short_answer",
    "numeric", "ordering", "matching", "poll", "open_ended", "slide",
  ]),
  prompt: z.string().min(1),
  explanation: z.string().optional(),
  points: z.number().min(0),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string().optional(),
  status: z.enum(["draft", "pending_review", "published", "archived"]),
  category_id: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  options: z.array(OptionSchema).default([]),
});

export type QuestionInput = z.infer<typeof QuestionSchema>;

export async function saveQuestion(raw: QuestionInput) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) return { error: "You don't have permission to edit questions." };

  const parsed = QuestionSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the form — some fields are invalid." };
  const q = parsed.data;

  const supabase = await createClient();

  if (!q.id) {
    const ent = await getEntitlement(supabase, org.id, { ownerBypass: ctx.profile.platform_role === "super_admin" });
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id);
    if (!withinLimit(ent.limits.max_questions, count ?? 0))
      return { error: `Your ${ent.planName} plan allows ${ent.limits.max_questions} questions. Upgrade in Billing to add more.` };
  }

  const payload = {
    organization_id: org.id,
    category_id: q.category_id || null,
    type: q.type,
    prompt: q.prompt,
    explanation: q.explanation || null,
    points: q.points,
    difficulty: q.difficulty,
    topic: q.topic || null,
    status: q.status,
    config: q.config ?? {},
    created_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };

  let questionId = q.id;
  if (questionId) {
    const { error } = await supabase.from("questions").update(payload).eq("id", questionId).eq("organization_id", org.id);
    if (error) return { error: error.message };
    await supabase.from("question_options").delete().eq("question_id", questionId);
  } else {
    const { data, error } = await supabase.from("questions").insert(payload).select().single();
    if (error || !data) return { error: error?.message ?? "Could not save the question." };
    questionId = data.id;
  }

  if (q.options.length > 0) {
    const { error } = await supabase.from("question_options").insert(
      q.options.map((o, i) => ({
        question_id: questionId!,
        label: o.label,
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

  const ent = await getEntitlement(supabase, org.id, { ownerBypass: ctx.profile.platform_role === "super_admin" });
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

    if (error || !created) { report.push({ row: rowNo, ok: false, message: error?.message ?? "Insert failed." }); continue; }

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
