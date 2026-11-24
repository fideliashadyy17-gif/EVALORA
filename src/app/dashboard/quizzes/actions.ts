"use server";

import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { getEntitlementFor, isPlanLimitError, planLimitMessage, withinLimit } from "@/lib/entitlements";
import { defaultLiveSessionSettings } from "@/lib/live";
import { isFeatureEnabledFor } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const QuizSchema = z.object({
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

export async function saveQuiz(raw: z.infer<typeof QuizSchema>) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) return { error: "You don't have permission to edit quizzes." };
  const parsed = QuizSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the form." };
  const q = parsed.data;
  const supabase = await createClient();

  if (!q.id) {
    const ent = await getEntitlementFor(supabase, ctx, org.id);
    const { count } = await supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    if (!withinLimit(ent.limits.max_quizzes, count ?? 0))
      return { error: `Your ${ent.planName} plan allows ${ent.limits.max_quizzes} quizzes. Upgrade in Billing.` };
  }

  // Preserve unrelated settings keys (e.g. criterion totals, source) when
  // editing an existing paper; only the builder-owned keys are replaced.
  let preservedSettings: Record<string, unknown> = {};
  if (q.id) {
    const { data: existing } = await supabase
      .from("quizzes")
      .select("settings")
      .eq("id", q.id)
      .eq("organization_id", org.id)
      .maybeSingle();
    preservedSettings = ((existing?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  }

  const payload = {
    organization_id: org.id,
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
    const { error } = await supabase.from("quizzes").update(payload).eq("id", quizId).eq("organization_id", org.id);
    if (error) return { error: error.message };
    await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
  } else {
    const { data, error } = await supabase.from("quizzes").insert(payload).select().single();
    if (error && isPlanLimitError(error)) return { error: planLimitMessage(error) };
    if (error || !data) return { error: error?.message ?? "Could not create the quiz." };
    quizId = data.id;
  }

  if (q.question_ids.length > 0) {
    // Verify the questions belong to this org (RLS also enforces on read).
    const { data: owned } = await supabase
      .from("questions").select("id, config").eq("organization_id", org.id).in("id", q.question_ids);
    const ownedIds = new Set((owned ?? []).map((r) => r.id));
    const rows = q.question_ids
      .filter((id) => ownedIds.has(id))
      .map((question_id, i) => ({ quiz_id: quizId!, question_id, position: i }));
    if (rows.length) {
      const { error } = await supabase.from("quiz_questions").insert(rows);
      if (error) return { error: error.message };
    }
    // Persist per-question section assignment without touching wording,
    // options, keys or marks. Only the paper_section config key changes.
    if (q.section_of) {
      for (const row of owned ?? []) {
        const section = q.section_of[row.id];
        if (!section) continue;
        const cfg = ((row as { config?: Record<string, unknown> | null }).config ?? {}) as Record<string, unknown>;
        if (cfg.paper_section === section) continue;
        await supabase
          .from("questions")
          .update({ config: { ...cfg, paper_section: section }, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("organization_id", org.id);
      }
    }
  }

  revalidatePath("/dashboard/quizzes");
  revalidatePath("/dashboard/paper-builder");
  return { ok: true, id: quizId };
}

export async function duplicateQuiz(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/quizzes");
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
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/quizzes");
  const supabase = await createClient();
  await supabase.from("quizzes").delete().eq("id", String(formData.get("id"))).eq("organization_id", org.id);
  revalidatePath("/dashboard/quizzes");
}

export async function setQuizStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/quizzes");
  const supabase = await createClient();
  await supabase.from("quizzes").update({ status: String(formData.get("status")) }).eq("id", String(formData.get("id"))).eq("organization_id", org.id);
  revalidatePath("/dashboard/quizzes");
}

/** Create a live session (lobby) for a published quiz and go to the host console. */
export async function startSession(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/quizzes");
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
