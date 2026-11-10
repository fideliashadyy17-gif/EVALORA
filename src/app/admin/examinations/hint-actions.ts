"use server";

import { audit, fstr, requireSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import {
  findHintLeaks,
  HINT_LEVELS,
  MAX_HINT_LENGTH,
  MIN_HINT_LENGTH,
} from "@/lib/examHints";
import { loadHintLeakContext } from "@/lib/examHintsServer";
import { describeHintGeneration, suggestHints, HintGenerationError } from "@/lib/examHintsAi";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const HINTS = "/admin/examinations/hints";

function backHref(formData: FormData) {
  const value = String(formData.get("back") ?? HINTS);
  return value.startsWith("/admin/examinations") ? value : HINTS;
}

function go(back: string, suffix: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}${suffix}`);
}

function revalidateAll() {
  revalidatePath(HINTS);
  revalidatePath("/admin/examinations");
}

function normalizeBody(value: unknown): string | null {
  const body = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length < MIN_HINT_LENGTH || body.length > MAX_HINT_LENGTH) return null;
  return body;
}

/**
 * Validates the (organisation, exam, question) triple before any write.
 * The database trigger enforces the same rule; this gives the operator a clear
 * message instead of a raw constraint error.
 */
async function resolveScope(admin: ReturnType<typeof createAdminClient>, examId: string | null, questionId: string) {
  const { data: question } = await admin
    .from("questions")
    .select("id,organization_id,prompt,type,difficulty,topic")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) return null;
  if (!examId) return { question, organizationId: question.organization_id as string, exam: null };
  const { data: exam } = await admin
    .from("exams")
    .select("id,title,organization_id")
    .eq("id", examId)
    .maybeSingle();
  if (!exam) return null;
  if (exam.organization_id !== question.organization_id) return null;
  return { question, organizationId: question.organization_id as string, exam };
}

/**
 * Creates a hint in DRAFT. Nothing reaches a candidate from this action: the
 * paper only ever reads `status = 'published'` rows, and publication is a
 * separate, audited decision below.
 */
export async function createHintDraft(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);

  const questionId = fstr(formData, "question_id", 64);
  const examId = fstr(formData, "exam_id", 64);
  const level = Math.trunc(Number(formData.get("level") ?? 1));
  const body = normalizeBody(formData.get("body"));

  if (!questionId) go(back, "e=question_required");
  if (!HINT_LEVELS.includes(level as 1 | 2 | 3)) go(back, "e=bad_level");
  if (!body) go(back, "e=bad_body");

  const scope = await resolveScope(admin, examId, questionId!);
  if (!scope) go(back, "e=scope");

  const leakContext = await loadHintLeakContext(admin, [questionId!]);
  const leaks = findHintLeaks(body!, leakContext.get(questionId!) ?? {});
  if (leaks.some((finding) => finding.level === "block")) go(back, "e=leak");

  const { data: created, error } = await admin
    .from("question_hints")
    .insert({
      organization_id: scope.organizationId,
      exam_id: examId ?? null,
      question_id: questionId,
      level,
      body,
      status: "draft",
      source: "manual",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) go(back, error.code === "23505" ? "e=duplicate" : "e=save");

  await audit(ctx, "exam.hint_created", "question_hints", created!.id as string, scope.organizationId, {
    exam_id: examId ?? null,
    question_id: questionId,
    level,
    leaks: leaks.map((finding) => finding.reason),
  });
  revalidateAll();
  go(back, "ok=hint_created");
}

/** Edits the text of a hint that is not published yet. Published text is immutable. */
export async function updateHintBody(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const hintId = fstr(formData, "hint_id", 64);
  const body = normalizeBody(formData.get("body"));
  if (!hintId) go(back, "e=not_found");
  if (!body) go(back, "e=bad_body");

  const { data: hint } = await admin
    .from("question_hints")
    .select("id,organization_id,question_id,status")
    .eq("id", hintId!)
    .maybeSingle();
  if (!hint) go(back, "e=not_found");
  if (hint!.status === "published") go(back, "e=published_immutable");

  const leakContext = await loadHintLeakContext(admin, [hint!.question_id as string]);
  if (findHintLeaks(body!, leakContext.get(hint!.question_id as string) ?? {}).some((f) => f.level === "block")) {
    go(back, "e=leak");
  }

  const { error } = await admin.from("question_hints").update({ body }).eq("id", hintId!);
  if (error) go(back, "e=save");

  await audit(ctx, "exam.hint_edited", "question_hints", hintId!, hint!.organization_id as string, {});
  revalidateAll();
  go(back, "ok=hint_saved");
}

/**
 * PUBLISH / APPROVE / ARCHIVE.
 *
 * `published` is the only status a candidate can read. Publishing records the
 * reviewing Super Admin and the instant, and is refused when the hint still
 * quotes the answer.
 */
export async function setHintStatus(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const hintId = fstr(formData, "hint_id", 64);
  const target = String(formData.get("status") ?? "");
  if (!hintId || !["approved", "published", "archived", "draft"].includes(target)) go(back, "e=bad_status");

  const { data: hint } = await admin
    .from("question_hints")
    .select("id,organization_id,question_id,status,body")
    .eq("id", hintId!)
    .maybeSingle();
  if (!hint) go(back, "e=not_found");

  if (target === "published") {
    const leakContext = await loadHintLeakContext(admin, [hint!.question_id as string]);
    if (findHintLeaks(hint!.body as string, leakContext.get(hint!.question_id as string) ?? {}).some((f) => f.level === "block")) {
      go(back, "e=leak");
    }
  }

  const patch: Record<string, unknown> = { status: target };
  if (target === "approved" || target === "published") {
    patch.approved_by = ctx.user.id;
    patch.approved_at = new Date().toISOString();
  }
  if (target === "published") patch.published_at = new Date().toISOString();

  const { error } = await admin.from("question_hints").update(patch).eq("id", hintId!);
  if (error) go(back, "e=save");

  await audit(ctx, `exam.hint_${target}`, "question_hints", hintId!, hint!.organization_id as string, {
    from: hint!.status,
    to: target,
  });
  revalidateAll();
  go(back, `ok=hint_${target}`);
}

/** Deletes a hint. Published hints must be archived first (two-step, audited). */
export async function deleteHint(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const hintId = fstr(formData, "hint_id", 64);
  if (!hintId) go(back, "e=not_found");

  const { data: hint } = await admin
    .from("question_hints")
    .select("id,organization_id,status")
    .eq("id", hintId!)
    .maybeSingle();
  if (!hint) go(back, "e=not_found");
  if (hint!.status === "published") go(back, "e=archive_first");

  const { error } = await admin.from("question_hints").delete().eq("id", hintId!);
  if (error) go(back, "e=save");
  await audit(ctx, "exam.hint_deleted", "question_hints", hintId!, hint!.organization_id as string, {});
  revalidateAll();
  go(back, "ok=hint_deleted");
}

/**
 * AI DRAFTING. Requires a configured model credential — with none, the action
 * refuses and says so; nothing is invented. Drafts are stored as
 * `status='draft', source='ai'` and are never visible to a candidate until a
 * human reviews and publishes them.
 */
export async function generateHintDrafts(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);

  const availability = describeHintGeneration();
  if (!availability.configured) go(back, "e=ai_unconfigured");

  const questionId = fstr(formData, "question_id", 64);
  const examId = fstr(formData, "exam_id", 64);
  if (!questionId) go(back, "e=question_required");

  const scope = await resolveScope(admin, examId, questionId!);
  if (!scope) go(back, "e=scope");

  const leakContext = await loadHintLeakContext(admin, [questionId!]);
  let drafts;
  try {
    const result = await suggestHints({
      prompt: scope.question.prompt as string,
      type: scope.question.type as string,
      difficulty: (scope.question.difficulty as string | null) ?? null,
      topic: (scope.question.topic as string | null) ?? null,
      leak: leakContext.get(questionId!) ?? {},
    });
    drafts = result.drafts;
  } catch (error) {
    if (error instanceof HintGenerationError) go(back, `e=ai_${error.code}`);
    go(back, "e=ai_provider");
  }

  const { data: existing } = await admin
    .from("question_hints")
    .select("level")
    .eq("question_id", questionId!)
    .eq("status", "draft")
    .is("exam_id", examId ?? null);
  const taken = new Set((existing ?? []).map((row) => Number(row.level)));

  const rows = drafts!
    .filter((draft) => !taken.has(draft.level))
    .map((draft) => ({
      organization_id: scope.organizationId,
      exam_id: examId ?? null,
      question_id: questionId,
      level: draft.level,
      body: draft.body,
      status: "draft" as const,
      source: "ai" as const,
      created_by: ctx.user.id,
    }));
  if (!rows.length) go(back, "e=ai_no_new_levels");

  const { error } = await admin.from("question_hints").insert(rows);
  if (error) go(back, "e=save");

  await audit(ctx, "exam.hint_ai_drafted", "question_hints", questionId!, scope.organizationId, {
    exam_id: examId ?? null,
    levels: rows.map((row) => row.level),
    provider: availability.configured ? availability.provider : null,
    model: availability.configured ? availability.model : null,
  });
  revalidateAll();
  go(back, `ok=ai_drafted_${rows.length}`);
}
