"use server";

import { activeOrg, can, CREATOR_ROLES, MARKER_ROLES, PROCTOR_ROLES, requireUser } from "@/lib/auth";
import { withinLimit } from "@/lib/entitlements";
import { getCapabilities } from "@/lib/capabilities";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createExam(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const supabase = await createClient();
  const { entitlement: ent, capabilities } = await getCapabilities(supabase, ctx, org.id);
  if (!capabilities.examinations) redirect("/dashboard/exams?e=module");

  const { count } = await supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
  if (!withinLimit(ent.limits.max_exams, count ?? 0))
    redirect("/dashboard/exams?e=limit");

  const proctoringWanted = formData.get("proctoring") === "on";
  if (proctoringWanted && !capabilities.proctoring) redirect("/dashboard/exams?e=proctoring");

  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const quizId = String(formData.get("quiz_id") ?? "");
  if (!title || !quizId) redirect("/dashboard/exams/new?e=fields");

  let exam: { id: string } | null = null;
  for (let i = 0; i < 5 && !exam; i++) {
    const { data, error } = await supabase
      .from("exams")
      .insert({
        organization_id: org.id,
        quiz_id: quizId,
        title,
        description: String(formData.get("description") ?? "").slice(0, 1000) || null,
        instructions: String(formData.get("instructions") ?? "").slice(0, 4000) || null,
        duration_minutes: Math.max(1, Math.min(24 * 60, parseInt(String(formData.get("duration_minutes") ?? "60")) || 60)),
        starts_at: formData.get("starts_at") ? new Date(String(formData.get("starts_at"))).toISOString() : null,
        ends_at: formData.get("ends_at") ? new Date(String(formData.get("ends_at"))).toISOString() : null,
        status: "draft",
        settings: {
          proctoring: proctoringWanted,
          require_screen_share: formData.get("require_screen_share") === "on",
          randomize_questions: formData.get("randomize_questions") === "on",
          randomize_options: formData.get("randomize_options") === "on",
          pass_mark_percent: Math.max(0, Math.min(100, parseInt(String(formData.get("pass_mark_percent") ?? "50")) || 50)),
          results_published: false,
          access_mode: "shared_link",
          identity_fields: [],
          eligible_class_ids: [],
          attempt_policy: "single_resume",
        },
        created_by: ctx.user.id,
      })
      .select("id, access_code, invite_token, access_link")
      .single();
    if (!error && data) exam = data;
  }
  if (!exam) redirect("/dashboard/exams/new?e=create");

  if (proctoringWanted) {
    const admin = createAdminClient();
    await admin.from("proctoring_rooms").insert({
      exam_id: exam.id,
      room_name: `exam-${exam.id}`,
    });
  }

  revalidatePath("/dashboard/exams");
  redirect(`/dashboard/exams/${exam.id}?ok=created`);
}

export async function setExamStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const supabase = await createClient();
  await supabase
    .from("exams")
    .update({ status: String(formData.get("status")) })
    .eq("id", String(formData.get("id")))
    .eq("organization_id", org.id);
  revalidatePath("/dashboard/exams");
  revalidatePath(`/dashboard/exams/${String(formData.get("id"))}`);
}

export async function deleteExam(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const supabase = await createClient();
  await supabase.from("exams").delete().eq("id", String(formData.get("id"))).eq("organization_id", org.id);
  revalidatePath("/dashboard/exams");
  redirect("/dashboard/exams");
}

export async function addCandidate(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const examId = String(formData.get("exam_id"));
  const supabase = await createClient();
  // Verify exam belongs to org (RLS check via select)
  const { data: exam } = await supabase.from("exams").select("id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (!exam) redirect("/dashboard/exams");

  await supabase.from("exam_candidates").insert({
    exam_id: examId,
    full_name: String(formData.get("full_name") ?? "").trim().slice(0, 120),
    email: String(formData.get("email") ?? "").trim().slice(0, 160) || null,
    candidate_ref: String(formData.get("candidate_ref") ?? "").trim().slice(0, 60) || null,
    access_code: genCode(8),
  });
  revalidatePath(`/dashboard/exams/${examId}`);
}

/** Bulk candidates: one per line "Full Name, email, ref". Returns a report via redirect params. */
export async function addCandidatesBulk(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const examId = String(formData.get("exam_id"));
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (!exam) redirect("/dashboard/exams");

  const lines = String(formData.get("bulk") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
  const rows = lines.map((line) => {
    const [full_name, email, candidate_ref] = line.split(",").map((s) => (s ?? "").trim());
    return {
      exam_id: examId,
      full_name: (full_name || "Candidate").slice(0, 120),
      email: email?.includes("@") ? email.slice(0, 160) : null,
      candidate_ref: candidate_ref?.slice(0, 60) || null,
      access_code: genCode(8) + Math.random().toString(36).slice(2, 4).toUpperCase(),
    };
  });
  if (rows.length) await supabase.from("exam_candidates").insert(rows);
  revalidatePath(`/dashboard/exams/${examId}`);
  redirect(`/dashboard/exams/${examId}?added=${rows.length}`);
}

export async function removeCandidate(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const supabase = await createClient();
  await supabase.from("exam_candidates").delete().eq("id", String(formData.get("id")));
  revalidatePath(`/dashboard/exams/${String(formData.get("exam_id"))}`);
}

/** Manual marking of a written answer; recomputes the attempt total. */
export async function markAnswer(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, MARKER_ROLES)) redirect("/dashboard/exams");
  const answerId = String(formData.get("answer_id") ?? "");
  const attemptId = String(formData.get("attempt_id") ?? "");
  const examId = String(formData.get("exam_id") ?? "");
  const rawPoints = String(formData.get("points") ?? "").trim();
  const points = rawPoints ? Number(rawPoints) : NaN;
  const note = String(formData.get("note") ?? "").slice(0, 500) || null;
  const back = `/dashboard/exams/${encodeURIComponent(examId)}`;
  const fail = (code: string): never => redirect(`${back}?mark_error=${code}`);
  if (!answerId || !attemptId || !examId) return fail("invalid");
  if (!Number.isFinite(points) || points < 0) return fail("points");

  const supabase = await createClient();
  const { data: exam, error: examError } = await supabase.from("exams").select("id, quiz_id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (examError || !exam?.quiz_id) return fail("invalid");
  const { data: attempt, error: attemptError } = await supabase.from("exam_attempts").select("id, exam_id, status").eq("id", attemptId).eq("exam_id", exam.id).maybeSingle();
  if (attemptError || !attempt) return fail("invalid");
  if (!["submitted", "auto_submitted", "marked"].includes(attempt.status)) return fail("in_progress");
  const { data: answer, error: answerError } = await supabase.from("exam_answers").select("id, attempt_id, question_id, quiz_question_id, questions(organization_id, points, type)").eq("id", answerId).eq("attempt_id", attempt.id).maybeSingle();
  if (answerError || !answer) return fail("invalid");
  const question = answer.questions as unknown as { organization_id: string; points: number; type: string } | null;
  if (!question || question.organization_id !== org.id || question.type !== "open_ended") return fail("invalid");
  const { data: quizQuestion, error: quizError } = await supabase.from("quiz_questions").select("id, points").eq("quiz_id", exam.quiz_id).eq("question_id", answer.question_id).maybeSingle();
  if (quizError || !quizQuestion || (answer.quiz_question_id && answer.quiz_question_id !== quizQuestion.id)) return fail("invalid");
  const maxPoints = Number(quizQuestion.points ?? question.points);
  if (!Number.isFinite(maxPoints) || maxPoints < 0 || points > maxPoints) return fail("points");

  const { data: updated, error: updateError } = await supabase.from("exam_answers")
    .update({ points_awarded: points, is_correct: points > 0, marked_by: ctx.user.id, marker_note: note, updated_at: new Date().toISOString() })
    .eq("id", answerId).eq("attempt_id", attempt.id).select("id").maybeSingle();
  if (updateError || !updated) return fail("failed");

  const { data: answers, error: answersError } = await supabase.from("exam_answers").select("points_awarded, is_correct").eq("attempt_id", attempt.id);
  if (answersError || !answers) return fail("partial");
  const total = Math.round(answers.reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0) * 100) / 100;
  const allMarked = answers.length > 0 && answers.every((a) => a.is_correct !== null);
  const { data: updatedAttempt, error: totalError } = await supabase.from("exam_attempts")
    .update({ score: total, ...(allMarked ? { status: "marked" } : {}) }).eq("id", attempt.id).eq("exam_id", exam.id)
    .in("status", ["submitted", "auto_submitted", "marked"]).select("id").maybeSingle();
  if (totalError || !updatedAttempt) return fail("partial");
  revalidatePath(back);
  redirect(`${back}?mark_ok=1`);
}

export async function publishResults(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const examId = String(formData.get("exam_id") ?? "");
  // Avoid using an untrusted path segment in redirects or database queries.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examId)) redirect("/dashboard/exams");
  const back = `/dashboard/exams/${examId}`;
  const value = String(formData.get("publish") ?? "");
  if (value !== "0" && value !== "1") redirect(`${back}?publish_error=1`);
  const supabase = await createClient();
  const { data: exam, error: readError } = await supabase.from("exams").select("settings")
    .eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (readError || !exam) redirect(`${back}?publish_error=1`);
  const settings = { ...((exam.settings as object) ?? {}), results_published: value === "1" };
  const { data: updated, error: updateError } = await supabase.from("exams").update({ settings })
    .eq("id", examId).eq("organization_id", org.id).select("id").maybeSingle();
  if (updateError || !updated) redirect(`${back}?publish_error=1`);
  revalidatePath(back);
  redirect(`${back}?publish_ok=1`);
}

/** Supervisor incident logging & review. */
export async function logIncident(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, PROCTOR_ROLES)) redirect("/dashboard/exams");
  const examId = String(formData.get("exam_id"));
  const supabase = await createClient();
  await supabase.from("proctoring_incidents").insert({
    exam_id: examId,
    candidate_id: String(formData.get("candidate_id") ?? "") || null,
    type: String(formData.get("type") ?? "observation").slice(0, 60),
    severity: String(formData.get("severity") ?? "medium"),
    note: String(formData.get("note") ?? "").slice(0, 1000) || null,
    reported_by: ctx.user.id,
  });
  revalidatePath(`/dashboard/exams/${examId}/proctor`);
  revalidatePath(`/dashboard/exams/${examId}`);
}

export async function reviewIncident(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, PROCTOR_ROLES)) redirect("/dashboard/exams");
  const supabase = await createClient();
  await supabase
    .from("proctoring_incidents")
    .update({ status: String(formData.get("status")), reviewed_by: ctx.user.id })
    .eq("id", String(formData.get("id")));
  revalidatePath(`/dashboard/exams/${String(formData.get("exam_id"))}`);
  revalidatePath(`/dashboard/exams/${String(formData.get("exam_id"))}/proctor`);
}
