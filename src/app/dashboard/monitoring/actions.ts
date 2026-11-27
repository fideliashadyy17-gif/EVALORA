"use server";

/**
 * Organization Live Monitoring & Examination Supervision — server actions.
 *
 * Every mutation enforces ALL FOUR layers server-side:
 *   1. Authenticated active user session (`requireUser`) + active org (`activeOrg`).
 *   2. Centralized RBAC (`proctoring.manage`) intersected with `exam_monitoring`
 *      module entitlement via `canOperate` (blocks ordinary teachers and
 *      read-only School Founders).
 *   3. Strict tenant ownership (`exam.organization_id === org.id`).
 *   4. Full audit trail (`audit_logs`, `exam_pause_events`, `exam_retake_requests`).
 */
import { audit } from "@/lib/admin";
import { activeOrg, requireUser } from "@/lib/auth";
import { attemptDeadline } from "@/lib/exam";
import { normalizeMessageBody } from "@/lib/examMessaging";
import {
  generateRetakeCode,
  normalizeGrantedAttempts,
  resolveRetakeAccessWindow,
} from "@/lib/examRetake";
import { notifyRetakeDecision, recordRetakeAudit } from "@/lib/examRetakeServer";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeBack(formData: FormData): string {
  const raw = String(formData.get("back") ?? "/dashboard/monitoring");
  return raw.startsWith("/dashboard/monitoring") || raw.startsWith("/dashboard/exams")
    ? raw
    : "/dashboard/monitoring";
}

function go(back: string, query: string): never {
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}${query}`);
}

async function requireSupervisorManage(back: string) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!(await canOperate(ctx, org.id, "proctoring.manage", "exam_monitoring"))) {
    go(back, "e=forbidden");
  }
  return { ctx, org };
}

/** Grant or set an authorized time extension for one in-progress attempt in this org. */
export async function grantOrgAttemptExtension(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await requireSupervisorManage(back);
  const attemptId = String(formData.get("attempt_id") ?? "");
  if (!UUID.test(attemptId)) go(back, "e=attempt");

  const minutesRaw = Number.parseInt(String(formData.get("minutes") ?? ""), 10);
  if (!Number.isFinite(minutesRaw) || minutesRaw < 0 || minutesRaw > 1440) {
    go(back, "e=minutes");
  }
  const mode = String(formData.get("mode") ?? "add") === "set" ? "set" : "add";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, status, started_at, extension_minutes, exams(id, organization_id, duration_minutes, ends_at, title)")
    .eq("id", attemptId)
    .maybeSingle();

  const exam = attempt?.exams as unknown as {
    id: string;
    organization_id: string;
    duration_minutes: number;
    ends_at: string | null;
    title: string;
  } | null;
  if (!attempt || !exam || exam.organization_id !== org.id) go(back, "e=attempt");
  if (attempt.status !== "in_progress") go(back, "e=not_in_progress");

  const previous = Number(attempt.extension_minutes ?? 0);
  const next = mode === "set" ? minutesRaw : Math.min(1440, previous + minutesRaw);
  const { error } = await admin
    .from("exam_attempts")
    .update({ extension_minutes: next })
    .eq("id", attemptId)
    .eq("status", "in_progress");
  if (error) go(back, "e=failed");

  const deadline = attemptDeadline(exam, attempt.started_at as string, next);
  await audit(ctx, "exam.extension_granted", "exam_attempts", attemptId, org.id, {
    exam_id: attempt.exam_id,
    exam_title: exam.title,
    candidate_id: attempt.candidate_id,
    previous_extension_minutes: previous,
    extension_minutes: next,
    delta_minutes: next - previous,
    mode,
    reason,
    deadline: deadline.toISOString(),
    source: "organization_monitor",
  });

  revalidatePath("/dashboard/monitoring");
  revalidatePath(`/dashboard/exams/${attempt.exam_id}/monitor`);
  revalidatePath(`/dashboard/exams/${attempt.exam_id}`);
  go(back, "ok=extension_saved");
}

/** Pause or resume an entire examination from the org monitoring hub. */
export async function pauseOrgExamFromMonitor(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await requireSupervisorManage(back);
  const examId = String(formData.get("exam_id") ?? "");
  const action = String(formData.get("pause_action") ?? "") === "resume" ? "resume" : "pause";
  if (!UUID.test(examId)) go(back, "e=exam");

  const admin = createAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id, organization_id, status, title")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) go(back, "e=exam");
  if (action === "pause" && exam.status !== "open") go(back, "e=not_open");
  if (action === "resume" && exam.status !== "paused") go(back, "e=not_paused");

  const { data: result, error } = await admin.rpc("exam_set_pause", {
    p_exam_id: examId,
    p_paused: action === "pause",
  });
  if (error || !result) go(back, "e=failed");
  const outcome = result as { attempts_updated?: number };

  await Promise.all([
    audit(ctx, action === "pause" ? "exam.paused" : "exam.resumed", "exams", examId, org.id, {
      exam_title: exam.title,
      attempts_updated: Number(outcome.attempts_updated ?? 0),
      source: "organization_monitor",
    }),
    admin.from("exam_pause_events").insert({
      organization_id: org.id,
      exam_id: examId,
      actor_id: ctx.user.id,
      scope: "exam",
      action,
      reason: "assessment",
      pause_reasons_before: action === "pause" ? [] : ["assessment"],
      pause_reasons_after: action === "pause" ? ["assessment"] : [],
      detail: { attempts_updated: Number(outcome.attempts_updated ?? 0), source: "organization_monitor" },
    }),
  ]);

  revalidatePath("/dashboard/monitoring");
  revalidatePath(`/dashboard/exams/${examId}/monitor`);
  revalidatePath(`/dashboard/exams/${examId}`);
  revalidatePath("/dashboard/exams");
  go(back, action === "pause" ? "ok=exam_paused" : "ok=exam_resumed");
}

/** Pause or resume ONE student attempt from the org monitoring hub. */
export async function pauseOrgAttemptFromMonitor(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await requireSupervisorManage(back);
  const attemptId = String(formData.get("attempt_id") ?? "");
  const action = String(formData.get("pause_action") ?? "") === "resume" ? "resume" : "pause";
  if (!UUID.test(attemptId)) go(back, "e=attempt");

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, status, pause_reasons, exams(id, organization_id, title)")
    .eq("id", attemptId)
    .maybeSingle();
  const exam = attempt?.exams as unknown as { id: string; organization_id: string; title: string } | null;
  if (!attempt || !exam || exam.organization_id !== org.id) go(back, "e=attempt");
  if (attempt.status !== "in_progress") go(back, "e=not_in_progress");

  const { data: result, error } = await admin.rpc("exam_attempt_set_pause", {
    p_attempt_id: attemptId,
    p_reason: "student",
    p_paused: action === "pause",
  });
  if (error || !result) go(back, "e=failed");
  const outcome = result as { credited_minutes?: number; paused?: boolean; reasons?: string[] };

  await Promise.all([
    audit(
      ctx,
      action === "pause" ? "exam.attempt_paused" : "exam.attempt_resumed",
      "exam_attempts",
      attemptId,
      org.id,
      {
        exam_id: attempt.exam_id,
        exam_title: exam.title,
        credited_minutes: Number(outcome.credited_minutes ?? 0),
        paused_after: Boolean(outcome.paused),
        source: "organization_monitor",
      },
    ),
    admin.from("exam_pause_events").insert({
      organization_id: org.id,
      exam_id: attempt.exam_id,
      attempt_id: attemptId,
      actor_id: ctx.user.id,
      scope: "attempt",
      action,
      reason: "student",
      pause_reasons_before: (attempt.pause_reasons as string[] | null) ?? [],
      pause_reasons_after: outcome.reasons ?? [],
      credited_minutes: Number(outcome.credited_minutes ?? 0),
      detail: { source: "organization_monitor" },
    }),
  ]);

  revalidatePath("/dashboard/monitoring");
  revalidatePath(`/dashboard/exams/${attempt.exam_id}/monitor`);
  go(back, action === "pause" ? "ok=student_paused" : "ok=student_resumed");
}

/**
 * Authorize a controlled examination restart / retake for a candidate attempt
 * inside this organization. Never erases or mutates the prior attempt; issues
 * a bounded, single-use retake access code and audits the decision.
 */
export async function authorizeOrgRetake(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await requireSupervisorManage(back);
  const attemptId = String(formData.get("attempt_id") ?? "");
  if (!UUID.test(attemptId)) go(back, "e=attempt");

  const reason =
    String(formData.get("reason") ?? "").trim().slice(0, 500) ||
    "Authorized restart from Live Monitoring";
  const presetChoice = String(formData.get("access_preset") ?? "24h");
  const window = resolveRetakeAccessWindow({
    mode: "preset",
    preset: presetChoice,
    custom: "",
  });
  if (!window.ok || !window.expiresAt) go(back, "e=access_window");

  const grantedAttempts = normalizeGrantedAttempts(formData.get("granted_attempts") ?? "1");

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, status, exam_candidates(id, full_name, email, student_id), exams(id, organization_id, title)")
    .eq("id", attemptId)
    .maybeSingle();

  const exam = attempt?.exams as unknown as { id: string; organization_id: string; title: string } | null;
  const candidate = attempt?.exam_candidates as unknown as {
    id: string;
    full_name: string;
    email: string | null;
    student_id: string | null;
  } | null;
  if (!attempt || !exam || !candidate || exam.organization_id !== org.id) go(back, "e=attempt");

  let retakeCode: string | null = null;
  let inserted: { id: string } | null = null;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < 5 && !inserted; i += 1) {
    retakeCode = generateRetakeCode((size) => randomBytes(size));
    const { data, error } = await admin
      .from("exam_retake_requests")
      .insert({
        organization_id: org.id,
        exam_id: exam.id,
        candidate_id: candidate.id,
        attempt_id: attempt.id,
        student_id: candidate.student_id,
        requested_by: ctx.user.id,
        requester_name: candidate.full_name,
        requester_email: candidate.email,
        reason,
        status: "approved",
        decided_by: ctx.user.id,
        decided_at: nowIso,
        decision_note: reason,
        granted_attempts: grantedAttempts,
        access_expires_at: window.expiresAt,
        retake_code: retakeCode,
        retake_code_issued_at: nowIso,
      })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") continue;
      go(back, "e=failed");
    }
    inserted = data;
  }
  if (!inserted || !retakeCode) go(back, "e=failed");

  await Promise.all([
    audit(ctx, "exam.retake_authorized", "exam_retake_requests", inserted.id, org.id, {
      exam_id: exam.id,
      exam_title: exam.title,
      attempt_id: attempt.id,
      candidate_id: candidate.id,
      candidate_name: candidate.full_name,
      granted_attempts: grantedAttempts,
      access_expires_at: window.expiresAt,
      reason,
      source: "organization_monitor",
    }),
    recordRetakeAudit(admin, {
      actorId: ctx.user.id,
      organizationId: org.id,
      action: "retake.approved",
      requestId: inserted.id,
      metadata: {
        exam_id: exam.id,
        candidate_id: candidate.id,
        granted_attempts: grantedAttempts,
        access_expires_at: window.expiresAt,
        source: "organization_monitor",
      },
    }),
    notifyRetakeDecision(admin, {
      request: {
        id: inserted.id,
        exam_id: exam.id,
        candidate_id: candidate.id,
        student_id: candidate.student_id,
      },
      examTitle: exam.title,
      decision: "approved",
      note: reason,
      accessExpiresAt: window.expiresAt,
      retakeCode,
      organizationId: org.id,
    }),
  ]);

  revalidatePath("/dashboard/monitoring");
  revalidatePath(`/dashboard/exams/${exam.id}/monitor`);
  revalidatePath(`/dashboard/exams/${exam.id}`);
  go(back, `ok=retake_authorized&code=${encodeURIComponent(retakeCode)}`);
}

/** Approve or reject an existing pending candidate retake request in this org. */
export async function decideOrgRetakeRequest(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await requireSupervisorManage(back);
  const requestId = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "") === "rejected" ? "rejected" : "approved";
  if (!UUID.test(requestId)) go(back, "e=request");

  const note = String(formData.get("decision_note") ?? "").trim().slice(0, 1000) || null;
  const admin = createAdminClient();
  const { data: req } = await admin
    .from("exam_retake_requests")
    .select("id, organization_id, exam_id, candidate_id, student_id, status, exams(title), exam_candidates(full_name)")
    .eq("id", requestId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!req) go(back, "e=request");
  if (req.status !== "pending") go(back, "ok=already_decided");

  const examTitle = (req.exams as unknown as { title?: string } | null)?.title ?? "Examination";
  const nowIso = new Date().toISOString();

  if (decision === "rejected") {
    const { error } = await admin
      .from("exam_retake_requests")
      .update({
        status: "rejected",
        decided_by: ctx.user.id,
        decided_at: nowIso,
        decision_note: note,
      })
      .eq("id", requestId)
      .eq("status", "pending");
    if (error) go(back, "e=failed");
    await Promise.all([
      audit(ctx, "exam.retake_rejected", "exam_retake_requests", requestId, org.id, {
        exam_id: req.exam_id,
        candidate_id: req.candidate_id,
        note,
        source: "organization_monitor",
      }),
      notifyRetakeDecision(admin, {
        request: {
          id: requestId,
          exam_id: req.exam_id as string,
          candidate_id: req.candidate_id as string,
          student_id: (req.student_id as string | null) ?? null,
        },
        examTitle,
        decision: "rejected",
        note,
        accessExpiresAt: null,
        organizationId: org.id,
      }),
    ]);
    revalidatePath("/dashboard/monitoring");
    go(back, "ok=retake_rejected");
  }

  const window = resolveRetakeAccessWindow({
    mode: "preset",
    preset: String(formData.get("access_preset") ?? "7d"),
    custom: "",
  });
  if (!window.ok || !window.expiresAt) go(back, "e=access_window");
  const grantedAttempts = normalizeGrantedAttempts(formData.get("granted_attempts") ?? "1");

  let retakeCode: string | null = null;
  let updated: { id: string } | null = null;
  for (let i = 0; i < 5 && !updated; i += 1) {
    retakeCode = generateRetakeCode((size) => randomBytes(size));
    const { data, error } = await admin
      .from("exam_retake_requests")
      .update({
        status: "approved",
        decided_by: ctx.user.id,
        decided_at: nowIso,
        decision_note: note,
        granted_attempts: grantedAttempts,
        access_expires_at: window.expiresAt,
        retake_code: retakeCode,
        retake_code_issued_at: nowIso,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "23505") continue;
      go(back, "e=failed");
    }
    updated = data;
  }
  if (!updated || !retakeCode) go(back, "e=failed");

  await Promise.all([
    audit(ctx, "exam.retake_approved", "exam_retake_requests", requestId, org.id, {
      exam_id: req.exam_id,
      candidate_id: req.candidate_id,
      granted_attempts: grantedAttempts,
      access_expires_at: window.expiresAt,
      note,
      source: "organization_monitor",
    }),
    notifyRetakeDecision(admin, {
      request: {
        id: requestId,
        exam_id: req.exam_id as string,
        candidate_id: req.candidate_id as string,
        student_id: (req.student_id as string | null) ?? null,
      },
      examTitle,
      decision: "approved",
      note,
      accessExpiresAt: window.expiresAt,
      organizationId: org.id,
      retakeCode,
    }),
  ]);
  revalidatePath("/dashboard/monitoring");
  go(back, `ok=retake_approved&code=${encodeURIComponent(retakeCode)}`);
}

/** Send a private supervisor message to an in-progress attempt inside this org. */
export async function sendOrgMonitorMessage(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await requireSupervisorManage(back);
  const attemptId = String(formData.get("attempt_id") ?? "");
  if (!UUID.test(attemptId)) go(back, "e=attempt");

  const body = normalizeMessageBody(formData.get("body"));
  if (!body) go(back, "e=message_empty");

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, status, exams(organization_id)")
    .eq("id", attemptId)
    .maybeSingle();
  const exam = attempt?.exams as unknown as { organization_id: string } | null;
  if (!attempt || !exam || exam.organization_id !== org.id) go(back, "e=attempt");
  if (attempt.status !== "in_progress") go(back, "e=not_in_progress");

  const { error } = await admin.from("exam_messages").insert({
    exam_id: attempt.exam_id,
    attempt_id: attemptId,
    sender_kind: "staff",
    sender_user_id: ctx.user.id,
    sender_label: ctx.profile.full_name || ctx.profile.email || "Supervisor",
    body,
    client_message_id: crypto.randomUUID(),
  });
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.monitor_message_sent", "exam_attempts", attemptId, org.id, {
    exam_id: attempt.exam_id,
    source: "organization_monitor",
  });
  revalidatePath("/dashboard/monitoring");
  revalidatePath(`/dashboard/exams/${attempt.exam_id}/monitor`);
  go(back, "ok=message_sent");
}
