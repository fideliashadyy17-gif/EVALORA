"use server";

import { audit, fstr, requireSuperAdmin } from "@/lib/admin";
import { normalizeGrantedAttempts, resolveRetakeAccessWindow } from "@/lib/examRetake";
import { notifyRetakeDecision, recordRetakeAudit } from "@/lib/examRetakeServer";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const RETAKES = "/admin/examinations/retakes";

function backHref(formData: FormData) {
  const value = String(formData.get("back") ?? RETAKES);
  return value.startsWith("/admin/examinations") ? value : RETAKES;
}

function go(back: string, suffix: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}${suffix}`);
}

function revalidateAll() {
  revalidatePath(RETAKES);
  revalidatePath("/admin/examinations");
  revalidatePath("/admin/examinations/candidates");
  revalidatePath("/student");
}

/**
 * APPROVE A RETAKE.
 *
 * This is the ONLY path that authorizes a further attempt. It records the
 * approving Super Admin, the decision instant, an explicit access window and a
 * bounded number of authorized attempts (one by default). The original attempt
 * is never modified: approval only sets the request's decision fields, and the
 * new attempt is created later by the candidate's own start request.
 *
 * Idempotent: a request that is no longer pending is answered with the stored
 * decision and is never approved twice.
 */
export async function approveRetakeAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const requestId = String(formData.get("request_id") ?? "");

  const { data: request } = await admin
    .from("exam_retake_requests")
    .select("*, exams(id,title,organization_id,status,ends_at,access_code,invite_token), exam_candidates(id,full_name,student_id)")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) go(back, "e=not_found");

  if (request!.status !== "pending") go(back, "ok=already_decided");

  const exam = request!.exams as unknown as {
    id: string;
    title: string;
    organization_id: string;
    status: string;
    ends_at: string | null;
    access_code: string;
    invite_token: string;
  } | null;
  if (!exam) go(back, "e=exam");

  // The panel offers presets plus a "custom" option inside one select; treat
  // that option as custom mode so the two controls stay in step.
  const presetChoice = String(formData.get("access_preset") ?? "7d");
  const window = resolveRetakeAccessWindow({
    mode: presetChoice === "custom" ? "custom" : String(formData.get("access_mode") ?? "preset"),
    preset: presetChoice,
    custom: String(formData.get("access_custom") ?? ""),
  });
  if (!window.ok || !window.expiresAt) go(back, "e=access_window");

  const grantedAttempts = normalizeGrantedAttempts(formData.get("granted_attempts"));
  const note = fstr(formData, "decision_note", 2000);

  // Conditional update: two concurrent approvals can only produce one decision.
  const { data: updated, error } = await admin
    .from("exam_retake_requests")
    .update({
      status: "approved",
      decided_by: ctx.user.id,
      decided_at: new Date().toISOString(),
      decision_note: note,
      granted_attempts: grantedAttempts,
      access_expires_at: window.expiresAt,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) go(back, "e=failed");
  if (!updated) go(back, "ok=already_decided");

  // Optional, explicit window administration. Extending `ends_at` can only
  // lengthen an examination (never shorten another candidate's paper), and
  // reopening a closed examination is a separate, audited decision.
  const extendWindow = formData.get("extend_exam_window") === "on";
  const reopenExam = formData.get("reopen_exam") === "on";
  const examPatch: Record<string, unknown> = {};
  if (extendWindow) {
    const currentEnd = exam.ends_at ? Date.parse(exam.ends_at) : NaN;
    const windowEnd = Date.parse(window.expiresAt);
    if (!Number.isFinite(currentEnd) || currentEnd < windowEnd)
      examPatch.ends_at = new Date(Math.max(windowEnd, Date.now())).toISOString();
  }
  if (reopenExam && exam.status !== "open") examPatch.status = "open";
  if (Object.keys(examPatch).length) {
    await admin.from("exams").update(examPatch).eq("id", exam.id);
  }

  await audit(ctx, "exam.retake_approved", "exam_retake_requests", requestId, exam.organization_id, {
    exam_id: exam.id,
    candidate_id: request!.candidate_id,
    attempt_id: request!.attempt_id,
    granted_attempts: grantedAttempts,
    access_expires_at: window.expiresAt,
    decision_note: note,
    exam_patch: examPatch,
  });
  await recordRetakeAudit(admin, {
    action: "exam.retake_approved",
    organizationId: exam.organization_id,
    requestId,
    actorId: ctx.user.id,
    metadata: { granted_attempts: grantedAttempts, access_expires_at: window.expiresAt, exam_patch: examPatch },
  });
  await notifyRetakeDecision(admin, {
    request: {
      id: requestId,
      exam_id: exam.id,
      student_id: (request!.student_id as string | null) ?? null,
      requested_by: (request!.requested_by as string | null) ?? null,
      candidate_id: request!.candidate_id as string,
    },
    examTitle: exam.title,
    decision: "approved",
    note,
    accessExpiresAt: window.expiresAt,
  });

  revalidateAll();
  go(back, "ok=retake_approved");
}

/**
 * REJECT A RETAKE. Records the rejecting Super Admin, instant and optional
 * reason. The original submitted attempt — answers, timestamps, score, marks,
 * proctoring evidence — is untouched, and no attempt becomes startable.
 */
export async function rejectRetakeAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const requestId = String(formData.get("request_id") ?? "");

  const { data: request } = await admin
    .from("exam_retake_requests")
    .select("*, exams(id,title,organization_id), exam_candidates(id)")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) go(back, "e=not_found");
  if (request!.status !== "pending") go(back, "ok=already_decided");

  const exam = request!.exams as unknown as { id: string; title: string; organization_id: string } | null;
  if (!exam) go(back, "e=exam");
  const note = fstr(formData, "decision_note", 2000);

  const { data: updated, error } = await admin
    .from("exam_retake_requests")
    .update({
      status: "rejected",
      decided_by: ctx.user.id,
      decided_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) go(back, "e=failed");
  if (!updated) go(back, "ok=already_decided");

  await audit(ctx, "exam.retake_rejected", "exam_retake_requests", requestId, exam.organization_id, {
    exam_id: exam.id,
    candidate_id: request!.candidate_id,
    attempt_id: request!.attempt_id,
    decision_note: note,
  });
  await recordRetakeAudit(admin, {
    action: "exam.retake_rejected",
    organizationId: exam.organization_id,
    requestId,
    actorId: ctx.user.id,
    metadata: { decision_note: note },
  });
  await notifyRetakeDecision(admin, {
    request: {
      id: requestId,
      exam_id: exam.id,
      student_id: (request!.student_id as string | null) ?? null,
      requested_by: (request!.requested_by as string | null) ?? null,
      candidate_id: request!.candidate_id as string,
    },
    examTitle: exam.title,
    decision: "rejected",
    note,
  });

  revalidateAll();
  go(back, "ok=retake_rejected");
}
