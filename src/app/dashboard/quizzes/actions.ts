"use server";

import { audit } from "@/lib/admin";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { canOperate } from "@/lib/operationalAccess";
import { getEntitlementFor } from "@/lib/entitlements";
import { defaultLiveSessionSettings } from "@/lib/live";
import { isFeatureEnabledFor } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { savePaperForActor, QuizSchema as PaperQuizSchema } from "@/lib/services/paperAuthoring";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * The editor's contract is the shared authoring schema, not a copy of it.
 *
 * The save body moved into `lib/services/paperAuthoring.ts` so the AI core
 * writes papers through the same code. Keeping one schema means a field the
 * editor accepts can never be one the service silently drops.
 */
/** The validated paper shape, derived from the shared schema. */
type QuizInput = z.infer<typeof PaperQuizSchema>;

/**
 * Paper Builder save. The implementation moved to
 * `lib/services/paperAuthoring.ts` so the AI core writes papers through the
 * same code; this action keeps the browser contract.
 */
export async function saveQuiz(raw: QuizInput) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { error: "You don't have permission to edit quizzes." };
  const supabase = await createClient();
  const result = await savePaperForActor(raw, { ctx, organizationId: org.id, supabase }, {
    revalidate: () => {
      revalidatePath("/dashboard/quizzes");
      revalidatePath("/dashboard/paper-builder");
    },
  });
  if ("error" in result) return { error: result.error };
  return { ok: true, id: result.id };
}

export async function duplicateQuiz(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "quizzes.create", "quizzes"))) redirect("/dashboard/quizzes");
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: src } = await supabase.from("quizzes").select("*").eq("id", id).eq("organization_id", org.id).single();
  if (!src) redirect("/dashboard/quizzes");
  const { data: copy } = await supabase
    .from("quizzes")
    .insert({
      organization_id: org.id,
      title: `${src.title} (copy)`,
      description: src.description,
      status: "draft",
      settings: src.settings,
      created_by: ctx.user.id,
    })
    .select().single();
  if (copy) {
    const { data: qq } = await supabase.from("quiz_questions").select("*").eq("quiz_id", id).order("position");
    if (qq?.length)
      await supabase.from("quiz_questions").insert(
        qq.map((r) => ({ quiz_id: copy.id, question_id: r.question_id, position: r.position, points: r.points, time_limit_seconds: r.time_limit_seconds })),
      );
  }
  revalidatePath("/dashboard/quizzes");
  redirect(copy ? `/dashboard/quizzes/${copy.id}` : "/dashboard/quizzes");
}

export async function deleteQuiz(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "quizzes.delete", "quizzes"))) redirect("/dashboard/quizzes");
  const supabase = await createClient();
  await supabase.from("quizzes").delete().eq("id", String(formData.get("id"))).eq("organization_id", org.id);
  revalidatePath("/dashboard/quizzes");
}

export async function setQuizStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "quizzes.edit", "quizzes"))) redirect("/dashboard/quizzes");
  const supabase = await createClient();
  await supabase.from("quizzes").update({ status: String(formData.get("status")) }).eq("id", String(formData.get("id"))).eq("organization_id", org.id);
  revalidatePath("/dashboard/quizzes");
}

/** Create a live session (lobby) for a published quiz and go to the host console. */
export async function startSession(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "competitions.create", "competitions"))) redirect("/dashboard/quizzes");
  if (!(await isFeatureEnabledFor(ctx, "live_quizzes"))) redirect("/dashboard/quizzes?e=module");
  const quizId = String(formData.get("quiz_id"));
  const mode = String(formData.get("mode") ?? "synchronized");
  const supabase = await createClient();

  const { data: quiz } = await supabase.from("quizzes").select("*").eq("id", quizId).eq("organization_id", org.id).single();
  if (!quiz) redirect("/dashboard/quizzes");
  const { count: qCount } = await supabase.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", quizId);
  if (!qCount) redirect(`/dashboard/quizzes/${quizId}?e=noquestions`);

  const ent = await getEntitlementFor(supabase, ctx, org.id);
  const maxP = ent.limits.max_participants_per_session;

  let session: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !session; attempt++) {
    const { data, error } = await supabase
      .from("quiz_sessions")
      .insert({
        quiz_id: quizId,
        organization_id: org.id,
        host_id: ctx.user.id,
        join_code: genCode(6),
        title: quiz.title,
        mode,
        status: "lobby",
        phase: "waiting",
        admission_open: true,
        require_approval: false,
        settings: defaultLiveSessionSettings(maxP === -1 ? 1000 : maxP),
      })
      .select("id").single();
    if (!error && data) session = data;
  }
  if (!session) redirect(`/dashboard/quizzes/${quizId}?e=session`);
  redirect(`/dashboard/sessions/${session.id}/host`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Configure Answers & Solutions review release for one quiz (`quiz_solutions`).
 * Stored in `quizzes.settings` and strictly guarded by RBAC + module entitlement.
 */
export async function updateQuizSolutionsPolicy(formData: FormData) {
  const quizId = String(formData.get("quiz_id") ?? "");
  if (!UUID_RE.test(quizId)) redirect("/dashboard/quizzes");
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "quizzes", "/dashboard?e=module");
  requireModule(entitlement, "quiz_solutions", `/dashboard/quizzes/${quizId}?e=module`);
  if (!(await canOperate(ctx, org.id, "quizzes.edit", "quiz_solutions"))) {
    redirect(`/dashboard/quizzes/${quizId}?e=forbidden`);
  }

  const releaseRaw = String(formData.get("solution_release_mode") ?? "never");
  const solutionReleaseMode = ["never", "after_submission", "manual"].includes(releaseRaw)
    ? releaseRaw
    : "never";
  const showExplanations = formData.get("show_explanations") === "on";
  const releaseNow = formData.get("release_now") === "1";

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, settings")
    .eq("id", quizId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!quiz) redirect("/dashboard/quizzes");

  const prev = ((quiz.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const nextSettings: Record<string, unknown> = {
    ...prev,
    solution_release_mode: solutionReleaseMode,
    show_explanations: showExplanations,
    solutions_released_at:
      solutionReleaseMode === "never"
        ? null
        : releaseNow
          ? new Date().toISOString()
          : prev.solutions_released_at ?? null,
  };

  const { error } = await supabase
    .from("quizzes")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", quizId)
    .eq("organization_id", org.id);
  if (error) redirect(`/dashboard/quizzes/${quizId}?e=solutions`);

  await audit(ctx, "quiz.solutions_policy_updated", "quizzes", quizId, org.id, {
    quiz_title: quiz.title,
    solution_release_mode: solutionReleaseMode,
    show_explanations: showExplanations,
    released_now: releaseNow,
  });
  revalidatePath(`/dashboard/quizzes/${quizId}`);
  redirect(`/dashboard/quizzes/${quizId}?ok=solutions`);
}

/**
 * Assign a quiz to an organization class and optional schedule (`quiz_assignment`).
 * Verifies the selected class belongs to the active organization before saving.
 */
export async function updateQuizAssignment(formData: FormData) {
  const quizId = String(formData.get("quiz_id") ?? "");
  if (!UUID_RE.test(quizId)) redirect("/dashboard/quizzes");
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");

  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "quizzes", "/dashboard?e=module");
  requireModule(entitlement, "quiz_assignment", `/dashboard/quizzes/${quizId}?e=module`);
  if (!(await canOperate(ctx, org.id, "quizzes.edit", "quiz_assignment"))) {
    redirect(`/dashboard/quizzes/${quizId}?e=forbidden`);
  }

  const classIdRaw = String(formData.get("class_id") ?? "").trim();
  let classId: string | null = null;
  if (classIdRaw) {
    if (!UUID_RE.test(classIdRaw)) redirect(`/dashboard/quizzes/${quizId}?e=assignment`);
    const { data: cls } = await supabase
      .from("classes")
      .select("id")
      .eq("id", classIdRaw)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!cls) redirect(`/dashboard/quizzes/${quizId}?e=assignment`);
    classId = cls.id as string;
  }

  const dueAtRaw = String(formData.get("assignment_due_at") ?? "").trim();
  const dueAt = dueAtRaw && Number.isFinite(Date.parse(dueAtRaw)) ? new Date(dueAtRaw).toISOString() : null;
  const note = String(formData.get("assignment_note") ?? "").trim().slice(0, 500) || null;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, settings")
    .eq("id", quizId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!quiz) redirect("/dashboard/quizzes");

  const prev = ((quiz.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("quizzes")
    .update({
      class_id: classId,
      settings: {
        ...prev,
        assignment_due_at: dueAt,
        assignment_note: note,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", quizId)
    .eq("organization_id", org.id);
  if (error) redirect(`/dashboard/quizzes/${quizId}?e=assignment`);

  await audit(ctx, "quiz.assignment_updated", "quizzes", quizId, org.id, {
    quiz_title: quiz.title,
    class_id: classId,
    assignment_due_at: dueAt,
  });
  revalidatePath(`/dashboard/quizzes/${quizId}`);
  revalidatePath("/dashboard/quizzes");
  redirect(`/dashboard/quizzes/${quizId}?ok=assignment`);
}

