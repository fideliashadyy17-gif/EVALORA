import {
  normalizeRetakeCode,
  retakeAccessProblem,
  retakeAccessProblemMessage,
  retakeNameMatches,
} from "@/lib/examRetake";
import { recordRetakeAudit, startRetakeAttempt } from "@/lib/examRetakeServer";
import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Redeem an approved retake from the dedicated access page.
 *
 * Three factors, all verified here on the server:
 *   1. the signed-in session belongs to the student the approval names;
 *   2. the typed first and last name match that student's record;
 *   3. the typed code matches this approval, which is approved, inside its
 *      access window and not already used up.
 *
 * Only then is a NEW attempt created — as a separate row linked back to the
 * original by `previous_attempt_id` and to the approval by
 * `retake_request_id`. The original attempt is never modified.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { request_id?: string; first_name?: string; last_name?: string; code?: string }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const requestId = String(body.request_id ?? "").trim();
  if (!UUID_RE.test(requestId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const ctx = await getSessionContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Sign in to use this retake." }, { status: 401 });
  if (ctx.profile.status !== "active")
    return NextResponse.json({ error: "This account is not active." }, { status: 403 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("exam_retake_requests")
    .select(
      "id,status,exam_id,candidate_id,attempt_id,student_id,requested_by,access_expires_at,granted_attempts,retake_code,retake_code_consumed_at,retake_started_at,decided_at," +
        "exams(id,organization_id,title,quiz_id,settings,starts_at,ends_at,status)," +
        "exam_candidates(id,exam_id,full_name,first_name,last_name,class_id,student_id,guest_key_hash,invite_token,identity_data,email)",
    )
    .eq("id", requestId)
    .maybeSingle();

  // A request the caller does not own is answered exactly like one that does
  // not exist: no existence leak, no way to probe another student's approvals.
  if (!row) return NextResponse.json({ error: "This retake was not found." }, { status: 404 });

  const record = row as unknown as {
    id: string;
    status: string;
    exam_id: string;
    candidate_id: string;
    attempt_id: string;
    student_id: string | null;
    requested_by: string | null;
    access_expires_at: string | null;
    granted_attempts: number | null;
    retake_code: string | null;
    retake_code_consumed_at: string | null;
    retake_started_at: string | null;
    decided_at: string | null;
    exams: {
      id: string;
      organization_id: string;
      title: string;
      quiz_id: string | null;
      settings: Record<string, unknown> | null;
      starts_at: string | null;
      ends_at: string | null;
      status: string | null;
    } | null;
    exam_candidates: {
      id: string;
      exam_id: string;
      full_name: string;
      first_name: string | null;
      last_name: string | null;
      class_id: string | null;
      student_id: string | null;
      guest_key_hash: string | null;
      invite_token: string | null;
      identity_data: Record<string, unknown> | null;
      email: string | null;
    } | null;
  };

  const exam = record.exams;
  const candidate = record.exam_candidates;
  if (!exam || !candidate) return NextResponse.json({ error: "This retake was not found." }, { status: 404 });

  const { data: student } = record.student_id
    ? await admin.from("students").select("id,user_id,full_name").eq("id", record.student_id).maybeSingle()
    : { data: null };

  const ownedBySession =
    record.requested_by === ctx.profile.id ||
    (student?.user_id != null && student.user_id === ctx.profile.id);
  if (!ownedBySession) return NextResponse.json({ error: "This retake was not found." }, { status: 404 });

  const problem = retakeAccessProblem(record, await countAttempts(admin, record.id));
  if (problem) {
    return NextResponse.json(
      { error: retakeAccessProblemMessage(problem), problem },
      { status: problem === "not_approved" || problem === "rejected" ? 403 : 409 },
    );
  }

  if (!retakeNameMatches({ firstName: String(body.first_name ?? ""), lastName: String(body.last_name ?? "") }, {
    firstName: candidate.first_name,
    lastName: candidate.last_name,
    fullName: candidate.full_name || student?.full_name || null,
  })) {
    return NextResponse.json(
      { error: "The first and last name do not match the student this retake was approved for.", field: "name" },
      { status: 403 },
    );
  }

  const typedCode = normalizeRetakeCode(body.code);
  if (!typedCode || typedCode !== normalizeRetakeCode(record.retake_code)) {
    return NextResponse.json(
      { error: "That retake code is not correct for this approval.", field: "code" },
      { status: 403 },
    );
  }

  // The approval authorizes the attempt, but the examination itself must still
  // be open — an approval never silently reopens an examination.
  if ((exam.status ?? "") !== "open")
    return NextResponse.json(
      { error: "This examination is not open. Ask your institution to reopen it for your authorized retake." },
      { status: 403 },
    );
  if (exam.ends_at && Date.parse(exam.ends_at) <= Date.now())
    return NextResponse.json(
      { error: "The examination window has closed. Ask your institution to extend it for your authorized retake." },
      { status: 403 },
    );

  const started = await startRetakeAttempt(admin, {
    exam,
    candidate,
    grant: { request: { id: record.id, status: "approved", created_at: record.decided_at ?? new Date().toISOString() } },
  });
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: 409 });

  const used = await countAttempts(admin, record.id);
  const granted = Math.max(1, Math.min(3, Math.floor(Number(record.granted_attempts ?? 1))));
  await admin
    .from("exam_retake_requests")
    .update({
      retake_started_at: record.retake_started_at ?? new Date().toISOString(),
      // The code stops working the moment the authorization has no attempts
      // left, so it can never be replayed for another paper.
      ...(used >= granted ? { retake_code_consumed_at: new Date().toISOString() } : {}),
    })
    .eq("id", record.id);

  await recordRetakeAudit(admin, {
    action: "exam.retake_code_redeemed",
    organizationId: exam.organization_id,
    requestId: record.id,
    actorId: ctx.profile.id,
    metadata: {
      exam_id: exam.id,
      candidate_id: candidate.id,
      attempt_id: started.attempt.id,
      attempt_number: started.attemptNumber,
      attempts_used: used,
      attempts_granted: granted,
    },
  });

  return NextResponse.json({
    ok: true,
    attempt_id: started.attempt.id,
    access_token: started.attempt.access_token,
    attempt_number: started.attemptNumber,
    exam_id: exam.id,
    title: exam.title,
  });
}

async function countAttempts(admin: ReturnType<typeof createAdminClient>, requestId: string) {
  const { count } = await admin
    .from("exam_attempts")
    .select("id", { count: "exact", head: true })
    .eq("retake_request_id", requestId);
  return count ?? 0;
}
