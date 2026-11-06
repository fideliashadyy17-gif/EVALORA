"use server";

import { audit, fdate, fint, FLASH_COOKIE, fstr, requireSuperAdmin } from "@/lib/admin";
import { isEmail, parseCsv } from "@/lib/csv";
import { attemptDeadline } from "@/lib/exam";
import { isFeatureEnabledFor } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Admin = ReturnType<typeof createAdminClient>;
const EXAM_STATUSES = ["draft", "scheduled", "open", "closed"] as const;

function safeBack(formData: FormData, fallback = "/admin/examinations") {
  const value = String(formData.get("back") ?? fallback);
  return value.startsWith("/admin/examinations") ? value : fallback;
}

function go(back: string, suffix: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}${suffix}`);
}

async function uniqueExamCode(admin: Admin, exceptExamId?: string) {
  for (let i = 0; i < 16; i++) {
    const code = genCode(8);
    const { data } = await admin.from("exams").select("id").eq("access_code", code).maybeSingle();
    if (!data || data.id === exceptExamId) return code;
  }
  return genCode(10);
}

async function uniqueCandidateCode(
  admin: Admin,
  examId: string,
  reserved = new Set<string>(),
  exceptCandidateId?: string,
) {
  for (let i = 0; i < 20; i++) {
    const code = genCode(8);
    if (reserved.has(code)) continue;
    const { data } = await admin
      .from("exam_candidates")
      .select("id")
      .eq("exam_id", examId)
      .eq("access_code", code)
      .maybeSingle();
    if (!data || data.id === exceptCandidateId) {
      reserved.add(code);
      return code;
    }
  }
  const code = genCode(10);
  reserved.add(code);
  return code;
}

async function loadExam(admin: Admin, examId: string) {
  const { data } = await admin.from("exams").select("*").eq("id", examId).maybeSingle();
  return data;
}

/** Create a complete examination directly from the Owner Control Center. */
export async function createExamAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = "/admin/examinations/new";
  const organizationId = fstr(formData, "organization_id", 60);
  const quizId = fstr(formData, "quiz_id", 60);
  const title = fstr(formData, "title", 180);
  if (!organizationId || !quizId || !title) go(back, "e=fields");
  if (!(await isFeatureEnabledFor(ctx, "examinations"))) go(back, "e=module");

  const proctoring = formData.get("proctoring") === "on";
  if (proctoring && !(await isFeatureEnabledFor(ctx, "proctoring"))) go(back, "e=proctoring_module");

  const [{ data: org }, { data: quiz }, { count: questionCount }] = await Promise.all([
    admin.from("organizations").select("id").eq("id", organizationId!).maybeSingle(),
    admin.from("quizzes").select("id, organization_id, status").eq("id", quizId!).maybeSingle(),
    admin.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", quizId!),
  ]);
  if (!org) go(back, "e=org");
  if (!quiz || quiz.organization_id !== organizationId) go(back, "e=quiz_org");
  if (quiz!.status !== "published") go(back, "e=quiz_unpublished");
  if (!questionCount) go(back, "e=no_questions");

  const startsAt = fdate(formData, "starts_at");
  const endsAt = fdate(formData, "ends_at");
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) go(back, "e=window");

  const statusRaw = String(formData.get("status") ?? "draft");
  const status = (EXAM_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : "draft";
  const duration = Math.max(1, Math.min(1440, fint(formData, "duration_minutes") ?? 60));
  const passMark = Math.max(0, Math.min(100, fint(formData, "pass_mark_percent") ?? 50));

  const { data: exam, error } = await admin
    .from("exams")
    .insert({
      organization_id: organizationId,
      quiz_id: quizId,
      title,
      description: fstr(formData, "description", 1500),
      instructions: fstr(formData, "instructions", 6000),
      duration_minutes: duration,
      starts_at: startsAt,
      ends_at: endsAt,
      status,
      settings: {
        proctoring,
        require_screen_share: proctoring && formData.get("require_screen_share") === "on",
        randomize_questions: formData.get("randomize_questions") === "on",
        randomize_options: formData.get("randomize_options") === "on",
        pass_mark_percent: passMark,
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
  if (error || !exam) go(back, "e=failed");

  if (proctoring) {
    await admin.from("proctoring_rooms").insert({ exam_id: exam!.id, room_name: `exam-${exam!.id}` });
  }
  await audit(ctx, "exam.created_by_admin", "exams", exam!.id, organizationId, {
    title,
    access_code: exam!.access_code,
    access_link: exam!.access_link,
    status,
    duration_minutes: duration,
  });
  revalidatePath("/admin/examinations");
  revalidatePath("/admin/examinations/invitations");
  redirect(`/admin/examinations/invitations?exam=${exam!.id}&ok=created`);
}

export async function updateExamScheduleAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = String(formData.get("exam_id") ?? "");
  const back = safeBack(formData, `/admin/examinations/schedule?exam=${examId}`);
  const exam = await loadExam(admin, examId);
  if (!exam) go("/admin/examinations/schedule", "e=exam");

  const startsAt = fdate(formData, "starts_at");
  const endsAt = fdate(formData, "ends_at");
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) go(back, "e=window");
  const statusRaw = String(formData.get("status") ?? exam!.status);
  const status = (EXAM_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : exam!.status;

  const { error } = await admin
    .from("exams")
    .update({ starts_at: startsAt, ends_at: endsAt, status })
    .eq("id", examId);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.schedule_updated", "exams", examId, exam!.organization_id, {
    starts_at: startsAt,
    ends_at: endsAt,
    status,
  });
  revalidatePath("/admin/examinations");
  revalidatePath("/admin/examinations/schedule");
  go(back, "ok=schedule_saved");
}

export async function updateExamTimingAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = String(formData.get("exam_id") ?? "");
  const back = safeBack(formData, `/admin/examinations/time-limits?exam=${examId}`);
  const exam = await loadExam(admin, examId);
  if (!exam) go("/admin/examinations/time-limits", "e=exam");

  const duration = Math.max(1, Math.min(1440, fint(formData, "duration_minutes") ?? exam!.duration_minutes));
  const passMark = Math.max(0, Math.min(100, fint(formData, "pass_mark_percent") ?? 50));
  const settings = {
    ...((exam!.settings as Record<string, unknown>) ?? {}),
    pass_mark_percent: passMark,
  };

  const { error } = await admin
    .from("exams")
    .update({ duration_minutes: duration, settings })
    .eq("id", examId);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.timing_updated", "exams", examId, exam!.organization_id, {
    previous_duration_minutes: exam!.duration_minutes,
    duration_minutes: duration,
    pass_mark_percent: passMark,
  });
  revalidatePath("/admin/examinations/time-limits");
  go(back, "ok=timing_saved");
}

/** Grant, replace or remove an authorized per-candidate extension. */
export async function grantAttemptExtensionAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const attemptId = String(formData.get("attempt_id") ?? "");
  const back = safeBack(formData, "/admin/examinations/time-limits");

  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("*, exams(organization_id, duration_minutes, ends_at, title)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) go(back, "e=attempt");
  if (attempt!.status !== "in_progress") go(back, "e=not_in_progress");

  const requested = fint(formData, "minutes");
  if (requested === null || requested < 0 || requested > 1440) go(back, "e=minutes");
  const mode = String(formData.get("mode") ?? "add");
  const previous = Number(attempt!.extension_minutes ?? 0);
  const next = mode === "set" ? requested! : Math.min(1440, previous + requested!);
  const reason = fstr(formData, "reason", 500);

  const { error } = await admin
    .from("exam_attempts")
    .update({ extension_minutes: next })
    .eq("id", attemptId)
    .eq("status", "in_progress");
  if (error) go(back, "e=failed");

  const exam = attempt!.exams as unknown as { organization_id: string; duration_minutes: number; ends_at: string | null; title: string };
  const deadline = attemptDeadline(exam, attempt!.started_at, next);
  await audit(ctx, "exam.extension_granted", "exam_attempts", attemptId, exam.organization_id, {
    exam_id: attempt!.exam_id,
    candidate_id: attempt!.candidate_id,
    previous_extension_minutes: previous,
    extension_minutes: next,
    mode,
    reason,
    deadline: deadline.toISOString(),
  });
  revalidatePath("/admin/examinations/time-limits");
  revalidatePath("/admin/examinations/monitoring");
  go(back, "ok=extension_saved");
}

export async function addExamCandidateAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = String(formData.get("exam_id") ?? "");
  const back = safeBack(formData, `/admin/examinations/register?exam=${examId}`);
  const exam = await loadExam(admin, examId);
  if (!exam) go("/admin/examinations/register", "e=exam");

  const fullName = fstr(formData, "full_name", 160);
  const email = fstr(formData, "email", 180)?.toLowerCase() ?? null;
  const candidateRef = fstr(formData, "candidate_ref", 80);
  if (!fullName) go(back, "e=name");
  if (email && !isEmail(email)) go(back, "e=email");

  const { data, error } = await admin
    .from("exam_candidates")
    .insert({
      exam_id: examId,
      full_name: fullName,
      email,
      candidate_ref: candidateRef,
      access_code: await uniqueCandidateCode(admin, examId),
    })
    .select("id, access_code")
    .single();
  if (error || !data) go(back, "e=failed");

  await audit(ctx, "exam.candidate_registered", "exam_candidates", data!.id, exam!.organization_id, {
    exam_id: examId,
    full_name: fullName,
    access_code: data!.access_code,
  });
  revalidatePath("/admin/examinations/candidates");
  revalidatePath("/admin/examinations/register");
  go(back, "ok=candidate_added");
}

/**
 * Bulk candidate import. Accepts either a headed CSV
 * (full_name,email,candidate_ref) or simple lines in the same order.
 * Excel users can save/export their sheet as CSV and use the same file.
 */
export async function importExamCandidatesAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = String(formData.get("exam_id") ?? "");
  const back = safeBack(formData, `/admin/examinations/register?exam=${examId}`);
  const exam = await loadExam(admin, examId);
  if (!exam) go("/admin/examinations/register", "e=exam");

  const text = String(formData.get("csv") ?? formData.get("bulk") ?? "");
  if (!text.trim()) go(back, "e=empty_csv");
  const parsed = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (parsed.length === 0) go(back, "e=empty_csv");
  if (parsed.length > 1001) go(back, "e=too_many");

  const normalizedHeader = parsed[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const hasHeader = normalizedHeader.includes("full_name") || normalizedHeader.includes("name");
  const sourceRows = hasHeader ? parsed.slice(1) : parsed;
  const col = (row: string[], names: string[], fallback: number) => {
    if (hasHeader) {
      for (const name of names) {
        const index = normalizedHeader.indexOf(name);
        if (index >= 0) return (row[index] ?? "").trim();
      }
    }
    return (row[fallback] ?? "").trim();
  };

  const { data: existing } = await admin
    .from("exam_candidates")
    .select("email, candidate_ref, access_code")
    .eq("exam_id", examId)
    .limit(10000);
  const existingEmails = new Set((existing ?? []).map((c) => c.email?.toLowerCase()).filter(Boolean));
  const existingRefs = new Set((existing ?? []).map((c) => c.candidate_ref).filter(Boolean));
  const reservedCodes = new Set((existing ?? []).map((c) => c.access_code));
  const seenEmails = new Set<string>();
  const seenRefs = new Set<string>();
  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < sourceRows.length; i++) {
    const line = i + (hasHeader ? 2 : 1);
    const row = sourceRows[i];
    const fullName = col(row, ["full_name", "name", "candidate"], 0).slice(0, 160);
    const email = col(row, ["email", "email_address"], 1).toLowerCase().slice(0, 180) || null;
    const ref = col(row, ["candidate_ref", "ref", "reference", "student_ref", "class"], 2).slice(0, 80) || null;
    if (!fullName) {
      errors.push(`Row ${line}: missing full name`);
      continue;
    }
    if (email && !isEmail(email)) {
      errors.push(`Row ${line}: invalid email`);
      continue;
    }
    if (email && (existingEmails.has(email) || seenEmails.has(email))) {
      errors.push(`Row ${line}: email already registered for this exam`);
      continue;
    }
    if (ref && (existingRefs.has(ref) || seenRefs.has(ref))) {
      errors.push(`Row ${line}: reference already registered for this exam`);
      continue;
    }
    if (email) seenEmails.add(email);
    if (ref) seenRefs.add(ref);
    rows.push({
      exam_id: examId,
      full_name: fullName,
      email,
      candidate_ref: ref,
      access_code: await uniqueCandidateCode(admin, examId, reservedCodes),
    });
  }

  let inserted = 0;
  if (rows.length) {
    const { data, error } = await admin.from("exam_candidates").insert(rows).select("id");
    if (error) errors.push(`Database error: ${error.message}`);
    else inserted = data?.length ?? 0;
  }

  await audit(ctx, "exam.candidates_imported", "exams", examId, exam!.organization_id, {
    inserted,
    skipped: errors.length,
  });
  const store = await cookies();
  store.set(
    FLASH_COOKIE,
    encodeURIComponent(
      `Candidate import: ${inserted} registered, ${errors.length} skipped.${errors.length ? ` ${errors.slice(0, 12).join(" · ")}` : ""}`,
    ),
    { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 180 },
  );
  revalidatePath("/admin/examinations/candidates");
  revalidatePath("/admin/examinations/register");
  go(back, "ok=import_done");
}

export async function regenerateCandidateCodeAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const candidateId = String(formData.get("candidate_id") ?? "");
  const back = safeBack(formData, "/admin/examinations/codes");
  const { data: candidate } = await admin
    .from("exam_candidates")
    .select("*, exams(organization_id)")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) go(back, "e=candidate");
  if (candidate!.status === "submitted") go(back, "e=submitted");

  const code = await uniqueCandidateCode(admin, candidate!.exam_id, new Set(), candidateId);
  const { error } = await admin.from("exam_candidates").update({ access_code: code }).eq("id", candidateId);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.candidate_code_regenerated", "exam_candidates", candidateId,
    (candidate!.exams as unknown as { organization_id: string } | null)?.organization_id, {
      exam_id: candidate!.exam_id,
      previous_code: candidate!.access_code,
      access_code: code,
    });
  revalidatePath("/admin/examinations/codes");
  go(back, "ok=candidate_code_regenerated");
}

export async function regenerateExamCodeAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = String(formData.get("exam_id") ?? "");
  const back = safeBack(formData, "/admin/examinations/codes");
  if (formData.get("confirm") !== "on") go(back, "e=confirm");
  const exam = await loadExam(admin, examId);
  if (!exam) go(back, "e=exam");

  const code = await uniqueExamCode(admin, examId);
  const { error } = await admin.from("exams").update({ access_code: code }).eq("id", examId);
  if (error) go(back, "e=failed");
  await audit(ctx, "exam.access_code_regenerated", "exams", examId, exam!.organization_id, {
    previous_code: exam!.access_code,
    access_code: code,
  });
  revalidatePath("/admin/examinations/codes");
  go(back, "ok=exam_code_regenerated");
}

export async function removeExamCandidateAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const candidateId = String(formData.get("candidate_id") ?? "");
  const back = safeBack(formData, "/admin/examinations/candidates");
  if (formData.get("confirm") !== "on") go(back, "e=confirm");

  const { data: candidate } = await admin
    .from("exam_candidates")
    .select("*, exams(organization_id)")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) go(back, "e=candidate");
  const { count: attemptCount } = await admin
    .from("exam_attempts")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", candidateId);
  if (attemptCount) go(back, "e=attempt_exists");

  await admin.from("exam_candidates").delete().eq("id", candidateId);
  await audit(ctx, "exam.candidate_removed", "exam_candidates", candidateId,
    (candidate!.exams as unknown as { organization_id: string } | null)?.organization_id, {
      exam_id: candidate!.exam_id,
      full_name: candidate!.full_name,
    });
  revalidatePath("/admin/examinations/candidates");
  go(back, "ok=candidate_removed");
}

export async function markExamAnswerAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const answerId = String(formData.get("answer_id") ?? "");
  const back = safeBack(formData, "/admin/examinations/marking");

  const { data: answer, error: answerError } = await admin
    .from("exam_answers")
    .select("*, questions(organization_id, points), exam_attempts!inner(id, exam_id, status, exams(organization_id, quiz_id))")
    .eq("id", answerId)
    .maybeSingle();
  if (answerError || !answer) go(back, "e=answer");

  const attempt = answer!.exam_attempts as unknown as {
    id: string;
    exam_id: string;
    status: string;
    exams: { organization_id: string; quiz_id: string | null } | null;
  };
  const question = answer!.questions as unknown as { organization_id: string; points: number } | null;
  if (!attempt || !attempt.exams?.quiz_id || !question || question.organization_id !== attempt.exams.organization_id) go(back, "e=answer");
  if (!["submitted", "auto_submitted", "marked"].includes(attempt.status)) go(back, "e=in_progress");
  const { data: paperQuestion, error: paperError } = await admin.from("quiz_questions").select("id, points")
    .eq("quiz_id", attempt.exams!.quiz_id!).eq("question_id", answer!.question_id).maybeSingle();
  if (paperError || !paperQuestion || (answer!.quiz_question_id && answer!.quiz_question_id !== paperQuestion.id)) go(back, "e=answer");
  const maxPoints = Number(paperQuestion!.points ?? question!.points);
  const rawPoints = String(formData.get("points") ?? "").trim();
  const points = rawPoints ? Number(rawPoints) : NaN;
  if (!Number.isFinite(maxPoints) || maxPoints < 0 || !Number.isFinite(points) || points < 0 || points > maxPoints) go(back, "e=points");
  const note = fstr(formData, "note", 1000);

  const { data: updated, error } = await admin
    .from("exam_answers")
    .update({
      points_awarded: points,
      is_correct: points > 0,
      marked_by: ctx.user.id,
      marker_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", answerId).eq("attempt_id", attempt.id).select("id").maybeSingle();
  if (error || !updated) go(back, "e=failed");

  const metadata = { exam_id: attempt.exam_id, attempt_id: attempt.id, points_awarded: points, max_points: maxPoints };
  const reportPartial = async (): Promise<never> => {
    await audit(ctx, "exam.answer_marked_by_admin_total_unconfirmed", "exam_answers", answerId, attempt.exams!.organization_id, metadata);
    revalidatePath("/admin/examinations/marking");
    revalidatePath("/admin/examinations/results");
    return go(back, "e=partial");
  };
  const { data: allAnswers, error: answersError } = await admin
    .from("exam_answers")
    .select("points_awarded, is_correct")
    .eq("attempt_id", attempt.id);
  if (answersError || !allAnswers) return reportPartial();
  const total = Math.round(allAnswers.reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0) * 100) / 100;
  const allMarked = allAnswers.length > 0 && allAnswers.every((a) => a.is_correct !== null);
  const { data: updatedAttempt, error: totalError } = await admin
    .from("exam_attempts")
    .update({ score: total, ...(allMarked ? { status: "marked" } : {}) })
    .eq("id", attempt.id).eq("exam_id", attempt.exam_id).in("status", ["submitted", "auto_submitted", "marked"])
    .select("id").maybeSingle();
  if (totalError || !updatedAttempt) return reportPartial();

  await audit(ctx, "exam.answer_marked_by_admin", "exam_answers", answerId, attempt.exams!.organization_id, {
    ...metadata,
    attempt_marked: allMarked,
  });
  revalidatePath("/admin/examinations/marking");
  revalidatePath("/admin/examinations/results");
  go(back, "ok=marked");
}

export async function setExamResultsPublishedAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = String(formData.get("exam_id") ?? "");
  const back = safeBack(formData, `/admin/examinations/results?exam=${examId}`);
  const exam = await loadExam(admin, examId);
  if (!exam) go("/admin/examinations/results", "e=exam");

  const published = String(formData.get("published") ?? "") === "1";
  const settings = {
    ...((exam!.settings as Record<string, unknown>) ?? {}),
    results_published: published,
  };
  const { error } = await admin.from("exams").update({ settings }).eq("id", examId);
  if (error) go(back, "e=failed");

  await audit(ctx, published ? "exam.results_published" : "exam.results_unpublished", "exams", examId, exam!.organization_id);
  revalidatePath("/admin/examinations/results");
  go(back, published ? "ok=results_published" : "ok=results_unpublished");
}

export async function reviewProctoringIncidentAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const incidentId = String(formData.get("incident_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const back = safeBack(formData, "/admin/examinations/monitoring");
  if (!["open", "valid", "invalid", "investigating"].includes(status)) go(back, "e=status");

  const { data: incident } = await admin
    .from("proctoring_incidents")
    .select("*, exams(organization_id)")
    .eq("id", incidentId)
    .maybeSingle();
  if (!incident) go(back, "e=incident");

  const { error } = await admin
    .from("proctoring_incidents")
    .update({ status, reviewed_by: ctx.user.id })
    .eq("id", incidentId);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.proctoring_incident_reviewed", "proctoring_incidents", incidentId,
    (incident!.exams as unknown as { organization_id: string } | null)?.organization_id, {
      exam_id: incident!.exam_id,
      status,
    });
  revalidatePath("/admin/examinations/monitoring");
  revalidatePath("/admin/proctoring");
  go(back, "ok=incident_reviewed");
}
