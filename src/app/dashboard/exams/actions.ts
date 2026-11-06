"use server";

import { activeOrg, can, CREATOR_ROLES, MARKER_ROLES, PROCTOR_ROLES, requireUser } from "@/lib/auth";
import { isPlanLimitError, withinLimit } from "@/lib/entitlements";
import { getCapabilities } from "@/lib/capabilities";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createExam(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const supabase = await createClient();
  const { entitlement: ent, capabilities } = await getCapabilities(supabase, ctx, org.id);
  if (!capabilities.examinations) redirect("/dashboard/exams?e=module");

  const { count, error: countError } = await supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id);
  // An unavailable count must never be interpreted as zero usage.
  if (countError || count === null) redirect("/dashboard/exams/new?e=availability");
  if (!withinLimit(ent.limits.max_exams, count)) redirect("/dashboard/exams?e=limit");

  const proctoringWanted = formData.get("proctoring") === "on";
  if (proctoringWanted && !capabilities.proctoring) redirect("/dashboard/exams?e=proctoring");
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const quizId = String(formData.get("quiz_id") ?? "");
  if (!title || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quizId)) redirect("/dashboard/exams/new?e=fields");

  // A client dropdown is not an authorization check, including for a global
  // Super Admin operating within a selected customer workspace.
  const { data: quiz, error: quizError } = await supabase.from("quizzes").select("id")
    .eq("id", quizId).eq("organization_id", org.id).eq("status", "published").maybeSingle();
  if (quizError || !quiz) redirect("/dashboard/exams/new?e=paper");
  const { data: paper, error: paperError, count: paperCount } = await supabase.from("quiz_questions")
    .select("id,points,questions(organization_id,points)", { count: "exact" }).eq("quiz_id", quizId).limit(1000);
  type PaperRow = { points: number | null; questions: { organization_id: string; points: number } | null };
  const rows = paper as unknown as PaperRow[] | null;
  // Reject truncated, empty, inaccessible, foreign or invalid paper rows.
  if (paperError || !rows || paperCount === null || paperCount === 0 || rows.length !== paperCount || rows.some((row) => {
    const points = Number(row.points ?? row.questions?.points);
    return !row.questions || row.questions.organization_id !== org.id || !Number.isFinite(points) || points < 0;
  })) redirect("/dashboard/exams/new?e=paper");

  const rawDuration = String(formData.get("duration_minutes") ?? "60").trim();
  const rawPass = String(formData.get("pass_mark_percent") ?? "50").trim();
  const duration = Number(rawDuration), passMark = Number(rawPass);
  if (!rawDuration || !Number.isInteger(duration) || duration < 1 || duration > 1440 || !rawPass || !Number.isFinite(passMark) || passMark < 0 || passMark > 100) redirect("/dashboard/exams/new?e=fields");
  const startRaw = String(formData.get("starts_at") ?? "").trim();
  const endRaw = String(formData.get("ends_at") ?? "").trim();
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime())) || (start && end && end <= start)) redirect("/dashboard/exams/new?e=window");

  // One insert only: a lost response can mean the insert succeeded. Retrying
  // blindly could create duplicate examinations.
  const { data: exam, error } = await supabase.from("exams").insert({
    organization_id: org.id,
    quiz_id: quizId,
    title,
    description: String(formData.get("description") ?? "").slice(0, 1000) || null,
    instructions: String(formData.get("instructions") ?? "").slice(0, 4000) || null,
    duration_minutes: duration,
    starts_at: start?.toISOString() ?? null,
    ends_at: end?.toISOString() ?? null,
    status: "draft",
    settings: {
      proctoring: proctoringWanted,
      require_screen_share: proctoringWanted && formData.get("require_screen_share") === "on",
      randomize_questions: formData.get("randomize_questions") === "on",
      randomize_options: formData.get("randomize_options") === "on",
      pass_mark_percent: passMark,
      results_published: false,
      access_mode: "shared_link", identity_fields: [], eligible_class_ids: [], attempt_policy: "single_resume",
    },
    created_by: ctx.user.id,
  }).select("id, access_code, invite_token, access_link").single();
  if (error && isPlanLimitError(error)) redirect("/dashboard/exams?e=limit");
  if (error || !exam) redirect("/dashboard/exams/new?e=create");

  let roomError = false;
  if (proctoringWanted) {
    try {
      const admin = createAdminClient();
      const result = await admin.from("proctoring_rooms").insert({ exam_id: exam.id, room_name: `exam-${exam.id}` });
      roomError = Boolean(result.error);
    } catch { roomError = true; }
  }
  revalidatePath("/dashboard/exams");
  redirect(`/dashboard/exams/${exam.id}?ok=created${roomError ? "&room_error=1" : ""}`);
}

export async function setExamStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !["open", "closed"].includes(status)) redirect("/dashboard/exams?e=status");
  const supabase = await createClient();
  const { data, error } = await supabase.from("exams").update({ status }).eq("id", id)
    .eq("organization_id", org.id).select("id").maybeSingle();
  if (error || !data) redirect("/dashboard/exams?e=status");
  revalidatePath("/dashboard/exams");
  revalidatePath(`/dashboard/exams/${id}`);
  redirect("/dashboard/exams?ok=status");
}

export async function deleteExam(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const id = String(formData.get("id") ?? "");
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) redirect("/dashboard/exams?e=delete");
  const supabase = await createClient();
  const { data, error } = await supabase.from("exams").delete().eq("id", id).eq("organization_id", org.id).select("id").maybeSingle();
  // The database prevents cascading an exam deletion through attempts and answers.
  if (error || !data) redirect("/dashboard/exams?e=delete");
  revalidatePath("/dashboard/exams");
  redirect("/dashboard/exams?ok=deleted");
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
      access_code: genCode(10),
    };
  });
  if (rows.length) await supabase.from("exam_candidates").insert(rows);
  revalidatePath(`/dashboard/exams/${examId}`);
  redirect(`/dashboard/exams/${examId}?added=${rows.length}`);
}

export async function removeCandidate(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const id = String(formData.get("id") ?? "");
  const examId = String(formData.get("exam_id") ?? "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES) || !uuid.test(id) || !uuid.test(examId)) redirect("/dashboard/exams");
  const back = `/dashboard/exams/${examId}`;
  const supabase = await createClient();
  const { data: exam, error: examError } = await supabase.from("exams").select("id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (examError || !exam) redirect("/dashboard/exams?e=candidate");
  const { data, error } = await supabase.from("exam_candidates").delete().eq("id", id).eq("exam_id", examId).eq("status", "registered").select("id").maybeSingle();
  // DB restricts deletion when any attempt exists, even if status is stale.
  if (error || !data) redirect(`${back}?candidate_error=remove`);
  revalidatePath(back);
  redirect(`${back}?candidate_ok=removed`);
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

/** Recompute an attempt's score from its answers; null means the write failed. */
async function recomputeAttempt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attemptId: string,
  examId: string,
): Promise<number | null> {
  const { data: answers, error } = await supabase
    .from("exam_answers")
    .select("points_awarded, is_correct")
    .eq("attempt_id", attemptId);
  if (error || !answers) return null;
  const total = Math.round(answers.reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0) * 100) / 100;
  const allMarked = answers.length > 0 && answers.every((a) => a.is_correct !== null);
  const { data: updated, error: totalError } = await supabase
    .from("exam_attempts")
    .update({ score: total, ...(allMarked ? { status: "marked" } : {}) })
    .eq("id", attemptId)
    .eq("exam_id", examId)
    .in("status", ["submitted", "auto_submitted", "marked"])
    .select("id")
    .maybeSingle();
  if (totalError || !updated) return null;
  return total;
}

/**
 * Criterion-by-criterion marking against an attached rubric. Each criterion
 * score is stored against the answer and the grader, so a second marker keeps an
 * independent judgement instead of overwriting the first.
 */
export async function markWithRubric(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, MARKER_ROLES)) redirect("/dashboard/exams");
  const answerId = String(formData.get("answer_id") ?? "");
  const attemptId = String(formData.get("attempt_id") ?? "");
  const examId = String(formData.get("exam_id") ?? "");
  const rubricId = String(formData.get("rubric_id") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 500) || null;
  const back = `/dashboard/exams/${encodeURIComponent(examId)}`;
  const fail = (code: string): never => redirect(`${back}?mark_error=${code}`);
  if (!answerId || !attemptId || !examId || !rubricId) return fail("invalid");

  const supabase = await createClient();
  const { data: exam, error: examError } = await supabase
    .from("exams").select("id, quiz_id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (examError || !exam?.quiz_id) return fail("invalid");
  const { data: attempt, error: attemptError } = await supabase
    .from("exam_attempts").select("id, exam_id, status").eq("id", attemptId).eq("exam_id", exam.id).maybeSingle();
  if (attemptError || !attempt) return fail("invalid");
  if (!["submitted", "auto_submitted", "marked"].includes(attempt.status)) return fail("in_progress");
  const { data: answer, error: answerError } = await supabase
    .from("exam_answers")
    .select("id, attempt_id, question_id, quiz_question_id, questions(organization_id, points, type)")
    .eq("id", answerId).eq("attempt_id", attempt.id).maybeSingle();
  if (answerError || !answer) return fail("invalid");
  const question = answer.questions as unknown as { organization_id: string; points: number; type: string } | null;
  if (!question || question.organization_id !== org.id || question.type !== "open_ended") return fail("invalid");

  const { data: quizQuestion } = await supabase
    .from("quiz_questions").select("id, points")
    .eq("quiz_id", exam.quiz_id).eq("question_id", answer.question_id).maybeSingle();
  if (!quizQuestion) return fail("invalid");
  const maxPoints = Number(quizQuestion.points ?? question.points);

  // The rubric must belong to this workspace and be attached to this exam.
  const { data: rubric } = await supabase
    .from("grading_rubrics").select("id").eq("id", rubricId).eq("organization_id", org.id).maybeSingle();
  if (!rubric) return fail("rubric");
  const { data: link } = await supabase
    .from("exam_rubric_links").select("id")
    .eq("exam_id", exam.id).eq("rubric_id", rubricId)
    .or(`question_id.is.null,question_id.eq.${answer.question_id}`)
    .limit(1).maybeSingle();
  if (!link) return fail("rubric");

  const { data: criteria, error: criteriaError } = await supabase
    .from("grading_rubric_criteria").select("id, max_marks, position")
    .eq("rubric_id", rubricId).order("position");
  if (criteriaError || !criteria || criteria.length === 0) return fail("rubric");

  const scores: { criterion_id: string; marks: number }[] = [];
  for (const criterion of criteria) {
    const raw = String(formData.get(`criterion_${criterion.id}`) ?? "").trim();
    if (raw === "") return fail("criteria");
    const marks = Number(raw);
    if (!Number.isFinite(marks) || marks < 0) return fail("criteria");
    if (marks > Number(criterion.max_marks)) return fail("criteria");
    scores.push({ criterion_id: criterion.id, marks: Math.round(marks * 100) / 100 });
  }
  const total = Math.round(scores.reduce((sum, s) => sum + s.marks, 0) * 100) / 100;
  if (!Number.isFinite(maxPoints) || total > maxPoints) return fail("rubric_total");

  // Replace only this grader's own criterion scores.
  const { error: clearError } = await supabase
    .from("answer_rubric_scores").delete()
    .eq("answer_id", answer.id).eq("grader_id", ctx.user.id);
  if (clearError) return fail("failed");
  const { error: scoreError } = await supabase.from("answer_rubric_scores").insert(
    scores.map((s) => ({
      answer_id: answer.id,
      attempt_id: attempt.id,
      question_id: answer.question_id,
      rubric_id: rubricId,
      criterion_id: s.criterion_id,
      organization_id: org.id,
      marks_awarded: s.marks,
      grader_id: ctx.user.id,
      note,
    })),
  );
  if (scoreError) return fail("failed");

  const { data: updated, error: updateError } = await supabase.from("exam_answers")
    .update({
      points_awarded: total,
      is_correct: total > 0,
      marked_by: ctx.user.id,
      marker_note: note,
      grading_method: "rubric",
      updated_at: new Date().toISOString(),
    })
    .eq("id", answer.id).eq("attempt_id", attempt.id).select("id").maybeSingle();
  if (updateError || !updated) return fail("failed");

  if ((await recomputeAttempt(supabase, attempt.id, exam.id)) === null) return fail("partial");
  revalidatePath(back);
  revalidatePath(`/dashboard/exams/${exam.id}/grades`);
  redirect(`${back}?mark_ok=rubric`);
}

/**
 * Record a moderator decision. The database projects an adjustment onto the
 * answer, stamps the previous mark and appends both a moderation row and a
 * grade-change row; nothing here may bypass that.
 */
export async function moderateAnswer(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, MARKER_ROLES)) redirect("/dashboard/exams");
  const answerId = String(formData.get("answer_id") ?? "");
  const examId = String(formData.get("exam_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 2000) || null;
  const back = `/dashboard/exams/${encodeURIComponent(examId)}`;
  const fail = (code: string): never => redirect(`${back}?moderation_error=${code}`);
  if (!answerId || !examId) return fail("invalid");
  if (!["approved", "adjusted", "returned"].includes(decision)) return fail("decision");

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams").select("id, quiz_id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (!exam?.quiz_id) return fail("invalid");
  const { data: answer } = await supabase
    .from("exam_answers")
    .select("id, attempt_id, question_id, points_awarded, questions(organization_id, points, type), exam_attempts!inner(exam_id, status)")
    .eq("id", answerId).maybeSingle();
  if (!answer) return fail("invalid");
  const attemptRel = answer.exam_attempts as unknown as { exam_id: string; status: string } | null;
  const question = answer.questions as unknown as { organization_id: string; points: number; type: string } | null;
  if (!attemptRel || attemptRel.exam_id !== exam.id) return fail("invalid");
  if (!question || question.organization_id !== org.id || question.type !== "open_ended") return fail("invalid");

  let proposed: number | null = null;
  if (decision === "adjusted") {
    const raw = String(formData.get("proposed_marks") ?? "").trim();
    proposed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(proposed) || proposed < 0) return fail("marks");
    const { data: quizQuestion } = await supabase
      .from("quiz_questions").select("points")
      .eq("quiz_id", exam.quiz_id).eq("question_id", answer.question_id).maybeSingle();
    const maxPoints = Number(quizQuestion?.points ?? question.points);
    if (!Number.isFinite(maxPoints) || proposed > maxPoints) return fail("marks");
    proposed = Math.round(proposed * 100) / 100;
  }

  const { error: insertError } = await supabase.from("grading_moderation").insert({
    answer_id: answer.id,
    decision,
    proposed_marks: proposed,
    note,
    moderator_id: ctx.user.id,
    moderator_email: ctx.user.email ?? null,
  });
  if (insertError) return fail("failed");

  if ((await recomputeAttempt(supabase, answer.attempt_id, exam.id)) === null) return fail("partial");
  revalidatePath(back);
  revalidatePath(`/dashboard/exams/${exam.id}/grades`);
  redirect(`${back}?moderation_ok=${decision}`);
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
  // Publishing stamps who released the marks; the audit log keeps every change
  // that led to them.
  const published = value === "1";
  const { data: updated, error: updateError } = await supabase.from("exams")
    .update({
      settings,
      grades_published_at: published ? new Date().toISOString() : null,
      grades_published_by: published ? ctx.user.id : null,
    })
    .eq("id", examId).eq("organization_id", org.id).select("id").maybeSingle();
  if (updateError || !updated) redirect(`${back}?publish_error=1`);
  revalidatePath(back);
  redirect(`${back}?publish_ok=1`);
}

/** Record an observation without allowing a workspace to target another exam. */
export async function logIncident(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const fail = (message: string) => ({ ok: false, message });
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, PROCTOR_ROLES)) return fail("Your workspace cannot record this observation.");
  const examId = String(formData.get("exam_id") ?? "");
  const candidateId = String(formData.get("candidate_id") ?? "") || null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const type = String(formData.get("type") ?? "observation");
  const severity = String(formData.get("severity") ?? "medium");
  if (!uuid.test(examId) || (candidateId && !uuid.test(candidateId)) ||
      !["observation", "second_person", "left_seat", "phone_detected", "talking", "connection", "other"].includes(type) ||
      !["low", "medium", "high"].includes(severity)) return fail("Check the candidate, type and severity before submitting.");

  const supabase = await createClient();
  const { data: exam, error: examError } = await supabase.from("exams").select("id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (examError || !exam) return fail("The examination could not be verified in this workspace.");
  if (candidateId) {
    const { data: candidate, error } = await supabase.from("exam_candidates").select("id").eq("id", candidateId).eq("exam_id", examId).maybeSingle();
    if (error || !candidate) return fail("The selected candidate could not be verified for this examination.");
  }
  const { data: incident, error } = await supabase.from("proctoring_incidents").insert({
    exam_id: examId, candidate_id: candidateId, type, severity,
    note: String(formData.get("note") ?? "").trim().slice(0, 1000) || null,
    reported_by: ctx.user.id,
  }).select("id").maybeSingle();
  if (error || !incident) return fail("The observation could not be confirmed. Check the incident list before retrying; your draft is preserved.");
  revalidatePath(`/dashboard/exams/${examId}/proctor`);
  revalidatePath(`/dashboard/exams/${examId}`);
  return { ok: true, message: "Observation recorded for human review." };
}

/** Review only an incident belonging to the verified workspace examination. */
export async function reviewIncident(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const examId = String(formData.get("exam_id") ?? "");
  const incidentId = String(formData.get("id") ?? "");
  const expected = String(formData.get("expected_status") ?? "");
  const status = String(formData.get("status") ?? "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, PROCTOR_ROLES) || !uuid.test(examId) || !uuid.test(incidentId)) redirect("/dashboard/exams");
  // The review console and the exam page share this action; only a known,
  // same-application destination is honoured.
  const back = String(formData.get("return_to") ?? "") === "/dashboard/proctoring"
    ? "/dashboard/proctoring"
    : `/dashboard/exams/${examId}`;
  if (!["open", "investigating"].includes(expected) || !["valid", "invalid", "investigating"].includes(status) || status === expected) redirect(`${back}?incident_error=invalid`);
  const supabase = await createClient();
  const { data: exam, error: examError } = await supabase.from("exams").select("id").eq("id", examId).eq("organization_id", org.id).maybeSingle();
  if (examError || !exam) redirect("/dashboard/exams?e=incident");
  // The reviewer narrative is stored with the decision; the database trigger
  // (migration 0035) copies it into the append-only review history so the
  // reasoning survives even if the observation is later redacted by retention.
  const reviewNote = String(formData.get("review_note") ?? "").trim().slice(0, 2000) || null;
  const { data: incident, error } = await supabase.from("proctoring_incidents")
    .update({ status, reviewed_by: ctx.user.id, review_note: reviewNote }).eq("id", incidentId).eq("exam_id", examId).eq("status", expected).select("id").maybeSingle();
  if (error || !incident) redirect(`${back}?incident_error=review`);
  revalidatePath(back);
  revalidatePath(`/dashboard/exams/${examId}`);
  revalidatePath(`/dashboard/exams/${examId}/proctor`);
  redirect(back === "/dashboard/proctoring" ? `${back}?ok=reviewed` : `${back}?incident_ok=reviewed`);
}

/** Limited organizer invitation controls. Other advanced settings remain in the global console. */
export async function updateWorkspaceExamAccess(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const id = String(formData.get("exam_id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) redirect("/dashboard/exams");
  const back = `/dashboard/exams/${id}`;
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/exams");
  const action = String(formData.get("access_action") ?? "");
  const patch: Record<string, unknown> = {};
  if (action === "enable") patch.shared_link_enabled = true;
  else if (action === "disable") patch.shared_link_enabled = false;
  else if (action === "new_code") patch.access_code = genCode(8);
  else if (action === "new_link") patch.invite_token = crypto.randomUUID();
  else redirect(`${back}?access_error=invalid`);

  const supabase = await createClient();
  const { data: updated, error } = await supabase.from("exams").update(patch)
    .eq("id", id).eq("organization_id", org.id).select("id").maybeSingle();
  if (error || !updated) redirect(`${back}?access_error=failed`);
  // Separate write: never claim the audit succeeded if its insert fails. Do not
  // log the new link or access code. Existing links/codes may already have rotated.
  let auditFailed = false;
  try {
    const admin = createAdminClient();
    const result = await admin.from("audit_logs").insert({ actor_id: ctx.user.id, organization_id: org.id, action: `exam.invitation.${action}`, entity: "exams", entity_id: id, metadata: { action, source: "workspace" } });
    auditFailed = Boolean(result.error);
  } catch { auditFailed = true; }
  revalidatePath(back);
  if (auditFailed) redirect(`${back}?access_error=audit`);
  redirect(`${back}?access_ok=1`);
}
