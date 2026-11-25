"use server";

/**
 * Organization Examination Hints Studio server actions (`exam_hints`).
 *
 * Reuses the platform `question_hints` table and leak-guard validator
 * (`findHintLeaks` / `loadHintLeakContext`), strictly scoped to `org.id`,
 * RBAC-gated (`exams.edit`), entitlement-gated (`exam_hints`), and audited.
 */
import { audit } from "@/lib/admin";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import {
  findHintLeaks,
  HINT_LEVELS,
  MAX_HINT_LENGTH,
  MIN_HINT_LENGTH,
} from "@/lib/examHints";
import { loadHintLeakContext } from "@/lib/examHintsServer";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function go(examId: string, query: string): never {
  redirect(`/dashboard/exams/${examId}/hints?${query}`);
}

function normalizeBody(value: unknown): string | null {
  const body = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length < MIN_HINT_LENGTH || body.length > MAX_HINT_LENGTH) return null;
  return body;
}

async function authorizeHintWrite(examId: string) {
  if (!UUID.test(examId)) redirect("/dashboard/exams");
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "examinations", "/dashboard?e=module");
  requireModule(entitlement, "exam_hints", `/dashboard/exams/${examId}?e=module`);
  if (!(await canOperate(ctx, org.id, "exams.edit", "exam_hints"))) {
    go(examId, "e=forbidden");
  }
  return { ctx, org };
}

export async function createOrgHintDraft(formData: FormData) {
  const examId = String(formData.get("exam_id") ?? "");
  const { ctx, org } = await authorizeHintWrite(examId);

  const questionId = String(formData.get("question_id") ?? "");
  const level = Math.trunc(Number(formData.get("level") ?? 1));
  const body = normalizeBody(formData.get("body"));
  if (!UUID.test(questionId)) go(examId, "e=question_required");
  if (!HINT_LEVELS.includes(level as 1 | 2 | 3)) go(examId, "e=bad_level");
  if (!body) go(examId, "e=bad_body");

  const admin = createAdminClient();
  const [{ data: exam }, { data: question }] = await Promise.all([
    admin.from("exams").select("id, organization_id").eq("id", examId).eq("organization_id", org.id).maybeSingle(),
    admin.from("questions").select("id, organization_id").eq("id", questionId).eq("organization_id", org.id).maybeSingle(),
  ]);
  if (!exam || !question) go(examId, "e=scope");

  const leakContext = await loadHintLeakContext(admin, [questionId]);
  const leaks = findHintLeaks(body, leakContext.get(questionId) ?? {});
  if (leaks.some((finding) => finding.level === "block")) go(examId, "e=leak");

  const { data: created, error } = await admin
    .from("question_hints")
    .insert({
      organization_id: org.id,
      exam_id: examId,
      question_id: questionId,
      level,
      body,
      status: "draft",
      source: "manual",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !created) go(examId, "e=failed");

  await audit(ctx, "exam.hint_created", "question_hints", created.id as string, org.id, {
    exam_id: examId,
    question_id: questionId,
    level,
    source: "organization_workspace",
  });
  revalidatePath(`/dashboard/exams/${examId}/hints`);
  go(examId, "ok=created");
}

export async function transitionOrgHintStatus(formData: FormData) {
  const examId = String(formData.get("exam_id") ?? "");
  const { ctx, org } = await authorizeHintWrite(examId);
  const hintId = String(formData.get("hint_id") ?? "");
  const target = String(formData.get("target") ?? "");
  if (!UUID.test(hintId) || !["approved", "published", "archived", "draft"].includes(target)) {
    go(examId, "e=invalid");
  }

  const admin = createAdminClient();
  const { data: hint } = await admin
    .from("question_hints")
    .select("id, organization_id, exam_id, question_id, body, status")
    .eq("id", hintId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!hint) go(examId, "e=not_found");

  if (target === "published") {
    const leakContext = await loadHintLeakContext(admin, [hint.question_id as string]);
    const leaks = findHintLeaks(hint.body as string, leakContext.get(hint.question_id as string) ?? {});
    if (leaks.some((finding) => finding.level === "block")) go(examId, "e=leak");
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: target };
  if (target === "approved") {
    patch.approved_by = ctx.user.id;
    patch.approved_at = nowIso;
  } else if (target === "published") {
    patch.approved_by = ctx.user.id;
    patch.approved_at = nowIso;
    patch.published_at = nowIso;
  }

  const { error } = await admin
    .from("question_hints")
    .update(patch)
    .eq("id", hintId)
    .eq("organization_id", org.id);
  if (error) go(examId, "e=failed");

  await audit(ctx, `exam.hint_${target}`, "question_hints", hintId, org.id, {
    exam_id: examId,
    previous_status: hint.status,
    source: "organization_workspace",
  });
  revalidatePath(`/dashboard/exams/${examId}/hints`);
  go(examId, `ok=${target}`);
}

export async function deleteOrgHint(formData: FormData) {
  const examId = String(formData.get("exam_id") ?? "");
  const { ctx, org } = await authorizeHintWrite(examId);
  const hintId = String(formData.get("hint_id") ?? "");
  if (!UUID.test(hintId)) go(examId, "e=invalid");

  const admin = createAdminClient();
  const { data: hint } = await admin
    .from("question_hints")
    .select("id, organization_id, status")
    .eq("id", hintId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!hint) go(examId, "e=not_found");
  if (hint.status === "published") go(examId, "e=archive_first");

  const { error } = await admin
    .from("question_hints")
    .delete()
    .eq("id", hintId)
    .eq("organization_id", org.id);
  if (error) go(examId, "e=failed");

  await audit(ctx, "exam.hint_deleted", "question_hints", hintId, org.id, {
    exam_id: examId,
    source: "organization_workspace",
  });
  revalidatePath(`/dashboard/exams/${examId}/hints`);
  go(examId, "ok=deleted");
}
