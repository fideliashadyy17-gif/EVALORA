import { attemptDeadline } from "@/lib/exam";
import { decisionMessage, type RetakeRequestView } from "@/lib/examRetake";
import {
  findUsableGrant,
  loadRetakeStateForCandidate,
  recordRetakeAudit,
  startRetakeAttempt,
  type RetakeCandidateRow,
  type RetakeExamRow,
} from "@/lib/examRetakeServer";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const headers = { "Cache-Control": "private, no-store" };

const Body = z.object({
  action: z.enum(["request", "cancel", "start"]),
  attempt_id: z.string().uuid().nullish(),
  token: z.string().uuid().nullish(),
  exam_code: z.string().min(4).max(32).nullish(),
  candidate_code: z.string().min(4).max(32).nullish(),
  reason: z.string().max(2000).nullish(),
});

interface AttemptRow {
  id: string;
  exam_id: string;
  candidate_id: string;
  status: string;
  attempt_number: number | null;
  started_at: string;
  access_token: string;
}

interface Context {
  exam: RetakeExamRow;
  candidate: RetakeCandidateRow;
  attempt: AttemptRow;
}

/**
 * Resolve the caller's attempt from EITHER the attempt's own bearer token or
 * the legacy two-code flow (examination code + personal candidate code).
 *
 * Both are credentials the student already had to hold to sit the paper; no
 * request is ever resolved from a name, an email or a URL parameter alone. The
 * newest attempt is always the one the state machine evaluates.
 */
async function resolveContext(input: z.infer<typeof Body>): Promise<{ ok: true; ctx: Context } | { ok: false; error: string; status: number }> {
  const admin = createAdminClient();

  if (input.attempt_id && input.token) {
    const { data: attempt } = await admin
      .from("exam_attempts")
      .select("id,exam_id,candidate_id,status,attempt_number,started_at,access_token")
      .eq("id", input.attempt_id)
      .eq("access_token", input.token)
      .maybeSingle();
    if (!attempt) return { ok: false, error: "Attempt not found for these credentials.", status: 404 };
    const { data: exam } = await admin.from("exams").select("*").eq("id", attempt.exam_id).maybeSingle();
    const { data: candidate } = await admin.from("exam_candidates").select("*").eq("id", attempt.candidate_id).maybeSingle();
    if (!exam || !candidate) return { ok: false, error: "Examination record is unavailable.", status: 500 };
    return { ok: true, ctx: { exam: exam as RetakeExamRow, candidate: candidate as RetakeCandidateRow, attempt: attempt as AttemptRow } };
  }

  const examCode = (input.exam_code ?? "").trim().toUpperCase();
  const candidateCode = (input.candidate_code ?? "").trim().toUpperCase();
  if (!examCode || !candidateCode)
    return { ok: false, error: "Provide the attempt session or both examination and candidate codes.", status: 400 };

  const { data: exam } = await admin.from("exams").select("*").eq("access_code", examCode).maybeSingle();
  if (!exam) return { ok: false, error: "Examination not found.", status: 404 };
  const { data: candidate } = await admin
    .from("exam_candidates")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("access_code", candidateCode)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "Candidate code not recognised for this examination.", status: 404 };
  const { data: attempts } = await admin
    .from("exam_attempts")
    .select("id,exam_id,candidate_id,status,attempt_number,started_at,access_token")
    .eq("exam_id", exam.id)
    .eq("candidate_id", candidate.id)
    .order("attempt_number", { ascending: false })
    .limit(1);
  const attempt = (attempts ?? [])[0];
  if (!attempt) return { ok: false, error: "No attempt exists yet for these codes.", status: 404 };
  return { ok: true, ctx: { exam: exam as RetakeExamRow, candidate: candidate as RetakeCandidateRow, attempt: attempt as AttemptRow } };
}

function publicState(
  state: Awaited<ReturnType<typeof loadRetakeStateForCandidate>>["state"],
  requests: RetakeRequestView[],
) {
  return {
    attempt_number: state.attemptNumber,
    attempt_label: state.attemptLabel,
    submitted: state.submitted,
    can_request: state.canRequest,
    can_start: state.canStartAuthorizedRetake,
    message: state.message,
    pending: state.pending
      ? { id: state.pending.id, created_at: state.pending.created_at, reason: state.pending.reason ?? null }
      : null,
    decision: state.latestDecision
      ? {
          id: state.latestDecision.id,
          status: state.latestDecision.status,
          decided_at: state.latestDecision.decided_at ?? null,
          decision_note: state.latestDecision.decision_note ?? null,
          access_expires_at: state.latestDecision.access_expires_at ?? null,
          message: decisionMessage(state.latestDecision),
      }
      : null,
    grant: state.grant
      ? {
          request_id: state.grant.request.id,
          attempts_granted: state.grant.attemptsGranted,
          attempts_used: state.grant.attemptsUsed,
          remaining: state.grant.remaining,
          window_open: state.grant.windowOpen,
          access_expires_at: state.grant.accessExpiresAt,
        }
      : null,
    history: requests.map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      decided_at: r.decided_at ?? null,
      reason: r.reason ?? null,
      decision_note: r.decision_note ?? null,
      access_expires_at: r.access_expires_at ?? null,
    })),
  };
}

/** Current retake state for the caller's own attempt. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attempt_id");
  const authorization = request.headers.get("authorization");
  const token = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? "")?.[1] ?? url.searchParams.get("token");
  if (!attemptId || !token)
    return NextResponse.json({ error: "Missing credentials." }, { status: 400, headers });

  const parsed = Body.safeParse({ action: "request", attempt_id: attemptId, token });
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials." }, { status: 400, headers });

  const resolved = await resolveContext(parsed.data);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers });
  const { exam, candidate, attempt } = resolved.ctx;

  const admin = createAdminClient();
  const { state, requests } = await loadRetakeStateForCandidate(admin, {
    examId: exam.id,
    candidateId: candidate.id,
    attemptNumber: Number(attempt.attempt_number ?? 1),
    attemptStatus: attempt.status,
  });

  return NextResponse.json(
    {
      exam: { id: exam.id, title: exam.title, status: exam.status ?? null },
      attempt: { id: attempt.id, status: attempt.status, attempt_number: Number(attempt.attempt_number ?? 1) },
      ...publicState(state, requests),
    },
    { headers },
  );
}

/**
 * Student actions:
 *  - `request`  create ONE pending retake request (duplicates are idempotent);
 *  - `cancel`   cancel the caller's own pending request;
 *  - `start`    begin the authorized NEW attempt (approval only — never the
 *               request, and never from a rejected or used-up approval).
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

  const resolved = await resolveContext(parsed.data);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers });
  const { exam, candidate, attempt } = resolved.ctx;
  const admin = createAdminClient();

  const { state, requests } = await loadRetakeStateForCandidate(admin, {
    examId: exam.id,
    candidateId: candidate.id,
    attemptNumber: Number(attempt.attempt_number ?? 1),
    attemptStatus: attempt.status,
  });

  if (parsed.data.action === "start") {
    if (attempt.status === "in_progress")
      return NextResponse.json({ error: "Your attempt is still in progress." }, { status: 409, headers });

    // The examination must be open. An approved retake never reopens an
    // examination by itself; the Super Admin decides that explicitly.
    if ((exam.status ?? "") !== "open")
      return NextResponse.json(
        { error: "This examination is not open. Ask your institution to reopen it for your authorized retake." },
        { status: 403, headers },
      );
    if (exam.ends_at && Date.parse(exam.ends_at) < Date.now())
      return NextResponse.json(
        { error: "The examination window has closed. Ask your institution to extend it for your authorized retake." },
        { status: 403, headers },
      );

    const grant = await findUsableGrant(admin, exam.id, candidate.id);
    if (!grant)
      return NextResponse.json(
        { error: "No approved retake authorizes a new attempt. Request a retake and wait for approval." },
        { status: 403, headers },
      );

    const started = await startRetakeAttempt(admin, { exam, candidate, grant });
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: 409, headers });
    const deadline = attemptDeadline(exam, started.attempt.started_at, Number((started.attempt as { extension_minutes?: number }).extension_minutes ?? 0));
    return NextResponse.json(
      {
        ok: true,
        attempt_id: started.attempt.id,
        access_token: started.attempt.access_token,
        attempt_number: started.attemptNumber,
        exam_id: exam.id,
        title: exam.title,
        deadline: deadline.toISOString(),
        proctoring: Boolean((exam.settings as Record<string, unknown> | null)?.proctoring),
      },
      { headers },
    );
  }

  if (parsed.data.action === "cancel") {
    if (!state.pending)
      return NextResponse.json({ error: "You have no pending retake request to cancel." }, { status: 409, headers });
    const { error } = await admin
      .from("exam_retake_requests")
      .update({ status: "cancelled" })
      .eq("id", state.pending.id)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: "Could not cancel the request. Try again." }, { status: 500, headers });
    await recordRetakeAudit(admin, {
      action: "exam.retake_request_cancelled",
      organizationId: exam.organization_id,
      requestId: state.pending.id,
      metadata: { exam_id: exam.id, candidate_id: candidate.id, attempt_id: attempt.id, by: "student" },
    });
    const next = await loadRetakeStateForCandidate(admin, {
      examId: exam.id,
      candidateId: candidate.id,
      attemptNumber: Number(attempt.attempt_number ?? 1),
      attemptStatus: attempt.status,
    });
    return NextResponse.json({ ok: true, ...publicState(next.state, next.requests) }, { headers });
  }

  // ── request ────────────────────────────────────────────────────────────
  if (attempt.status === "in_progress")
    return NextResponse.json(
      { error: "Submit your paper before requesting a retake." },
      { status: 409, headers },
    );
  if (state.pending)
    return NextResponse.json(
      { ...publicState(state, requests), ok: true, duplicate: true, message: "Your retake request is already awaiting approval." },
      { status: 200, headers },
    );
  if (state.canStartAuthorizedRetake)
    return NextResponse.json(
      { error: "A retake is already approved. Start the authorized attempt instead of requesting another one." },
      { status: 409, headers },
    );

  // A signed-in student must be the owner of the candidate record. Guest
  // candidates are authorized by their attempt token, which they received only
  // after server-verified admission.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  let requesterName = candidate.full_name;
  let requesterEmail: string | null = candidate.email ?? null;
  let requestedBy: string | null = null;
  let studentId: string | null = candidate.student_id ?? null;
  if (auth.user) {
    const { data: student } = await admin
      .from("students")
      .select("id,full_name,email,user_id")
      .eq("user_id", auth.user.id)
      .eq("organization_id", exam.organization_id)
      .maybeSingle();
    if (student) {
      if (candidate.student_id && candidate.student_id !== student.id)
        return NextResponse.json({ error: "This attempt belongs to a different student record." }, { status: 403, headers });
      studentId = student.id;
      requesterName = (student.full_name as string | null) ?? requesterName;
      requesterEmail = (student.email as string | null) ?? requesterEmail;
    }
    requestedBy = auth.user.id;
  }

  const reason = (parsed.data.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 2000) || null;

  const { data: created, error } = await admin
    .from("exam_retake_requests")
    .insert({
      organization_id: exam.organization_id,
      exam_id: exam.id,
      candidate_id: candidate.id,
      attempt_id: attempt.id,
      student_id: studentId,
      requested_by: requestedBy,
      requester_name: requesterName.slice(0, 200),
      requester_email: requesterEmail ? requesterEmail.slice(0, 200) : null,
      reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    // A racing duplicate hits the partial unique index — return the pending
    // request rather than an error the student cannot act on.
    const existing = await loadRetakeStateForCandidate(admin, {
      examId: exam.id,
      candidateId: candidate.id,
      attemptNumber: Number(attempt.attempt_number ?? 1),
      attemptStatus: attempt.status,
    });
    if (existing.state.pending)
      return NextResponse.json(
        { ...publicState(existing.state, existing.requests), ok: true, duplicate: true, message: "Your retake request is already awaiting approval." },
        { status: 200, headers },
      );
    return NextResponse.json({ error: "Could not send the retake request. Try again." }, { status: 500, headers });
  }

  await recordRetakeAudit(admin, {
    action: "exam.retake_requested",
    organizationId: exam.organization_id,
    requestId: created.id,
    actorId: requestedBy,
    metadata: {
      exam_id: exam.id,
      candidate_id: candidate.id,
      attempt_id: attempt.id,
      has_reason: Boolean(reason),
      requester_name: requesterName,
    },
  });

  // Tell the Super Admins there is something to decide.
  const { data: supers } = await admin
    .from("profiles")
    .select("id")
    .eq("platform_role", "super_admin");
  if (supers?.length) {
    await admin.from("notifications").insert(
      supers.map((s) => ({
        user_id: s.id as string,
        type: "exam_retake_requested",
        title: "New retake request",
        body: `${requesterName} requested a retake of “${exam.title}”.`,
        link: "/admin/examinations/retakes",
      })),
    );
  }

  const next = await loadRetakeStateForCandidate(admin, {
    examId: exam.id,
    candidateId: candidate.id,
    attemptNumber: Number(attempt.attempt_number ?? 1),
    attemptStatus: attempt.status,
  });
  return NextResponse.json(
    {
      ...publicState(next.state, next.requests),
      ok: true,
      message: "Your retake request has been sent and is awaiting Super Admin approval.",
    },
    { headers },
  );
}
