import { audit } from "@/lib/admin";
import { isUuid } from "@/lib/examMessaging";
import {
  generateRetakeCode,
  normalizeGrantedAttempts,
  resolveRetakeAccessWindow,
} from "@/lib/examRetake";
import { notifyRetakeDecision, recordRetakeAudit } from "@/lib/examRetakeServer";
import { staffExamAccess } from "@/lib/monitorAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const NO_STORE = { "Cache-Control": "private, no-store" };

const Body = z.object({
  attempt_id: z.string().uuid(),
  access_preset: z.enum(["24h", "7d", "30d"]).optional().default("24h"),
  reason: z.string().max(500).optional(),
});

/**
 * Authorize a controlled restart / retake for a candidate from the Live Monitor.
 * Never destroys prior attempt data; records an approved `exam_retake_requests`
 * row with a single-use retake code and full audit trail.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid restart request." }, { status: 400, headers: NO_STORE });

  const access = await staffExamAccess(id, { write: true });
  if (!access.ok) return access.response;
  const { ctx, organization_id: orgId } = access;

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, status, exam_candidates(id, full_name, email, student_id), exams(id, organization_id, title)")
    .eq("id", parsed.data.attempt_id)
    .eq("exam_id", id)
    .maybeSingle();

  const exam = attempt?.exams as unknown as { id: string; organization_id: string; title: string } | null;
  const candidate = attempt?.exam_candidates as unknown as {
    id: string;
    full_name: string;
    email: string | null;
    student_id: string | null;
  } | null;
  if (!attempt || !exam || !candidate || exam.organization_id !== orgId) {
    return NextResponse.json({ error: "Candidate session not found in this examination." }, { status: 404, headers: NO_STORE });
  }

  const window = resolveRetakeAccessWindow({
    mode: "preset",
    preset: parsed.data.access_preset,
    custom: "",
  });
  if (!window.ok || !window.expiresAt) {
    return NextResponse.json({ error: "Invalid retake access window." }, { status: 400, headers: NO_STORE });
  }
  const grantedAttempts = normalizeGrantedAttempts("1");
  const reason = parsed.data.reason?.trim() || "Authorized session restart from Live Monitor";
  const nowIso = new Date().toISOString();

  let retakeCode: string | null = null;
  let inserted: { id: string } | null = null;
  for (let i = 0; i < 5 && !inserted; i += 1) {
    retakeCode = generateRetakeCode((size) => randomBytes(size));
    const { data, error } = await admin
      .from("exam_retake_requests")
      .insert({
        organization_id: orgId,
        exam_id: id,
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
      return NextResponse.json({ error: "Could not authorize retake." }, { status: 500, headers: NO_STORE });
    }
    inserted = data;
  }
  if (!inserted || !retakeCode) {
    return NextResponse.json({ error: "Could not issue a unique retake code." }, { status: 500, headers: NO_STORE });
  }

  await Promise.all([
    audit(ctx, "exam.retake_authorized", "exam_retake_requests", inserted.id, orgId, {
      exam_id: id,
      exam_title: exam.title,
      attempt_id: attempt.id,
      candidate_id: candidate.id,
      candidate_name: candidate.full_name,
      granted_attempts: grantedAttempts,
      access_expires_at: window.expiresAt,
      reason,
      source: "live_monitor_api",
    }),
    recordRetakeAudit(admin, {
      actorId: ctx.user.id,
      organizationId: orgId,
      action: "retake.approved",
      requestId: inserted.id,
      metadata: { exam_id: id, candidate_id: candidate.id, granted_attempts: grantedAttempts, source: "live_monitor_api" },
    }),
    notifyRetakeDecision(admin, {
      request: {
        id: inserted.id,
        exam_id: id,
        candidate_id: candidate.id,
        student_id: candidate.student_id,
      },
      examTitle: exam.title,
      decision: "approved",
      note: reason,
      accessExpiresAt: window.expiresAt,
      organizationId: orgId,
      retakeCode,
    }),
  ]);

  return NextResponse.json(
    { ok: true, retake_code: retakeCode, access_expires_at: window.expiresAt },
    { headers: NO_STORE },
  );
}
