import { audit } from "@/lib/admin";
import { attemptDeadline } from "@/lib/exam";
import { isUuid } from "@/lib/examMessaging";
import { staffExamAccess } from "@/lib/monitorAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const NO_STORE = { "Cache-Control": "private, no-store" };

const Body = z.object({
  attempt_id: z.string().uuid(),
  minutes: z.number().int().min(1).max(1440),
  mode: z.enum(["add", "set"]).optional().default("add"),
  reason: z.string().max(500).optional(),
});

/**
 * Grant or set an authorized per-candidate time extension from the Live Monitor.
 * Enforces `proctoring.manage` + `exam_monitoring` via `staffExamAccess({ write: true })`
 * and guarantees the attempt belongs to THIS examination inside THIS organization.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid extension request." }, { status: 400, headers: NO_STORE });

  const access = await staffExamAccess(id, { write: true });
  if (!access.ok) return access.response;
  const { ctx, organization_id: orgId } = access;

  const { attempt_id: attemptId, minutes, mode, reason } = parsed.data;
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, status, started_at, extension_minutes, exams(id, organization_id, duration_minutes, ends_at, title)")
    .eq("id", attemptId)
    .eq("exam_id", id)
    .maybeSingle();

  const exam = attempt?.exams as unknown as {
    id: string;
    organization_id: string;
    duration_minutes: number;
    ends_at: string | null;
    title: string;
  } | null;
  if (!attempt || !exam || exam.organization_id !== orgId) {
    return NextResponse.json({ error: "Candidate session not found in this examination." }, { status: 404, headers: NO_STORE });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Extra time can only be granted to an attempt in progress." }, { status: 409, headers: NO_STORE });
  }

  const previous = Number(attempt.extension_minutes ?? 0);
  const next = mode === "set" ? minutes : Math.min(1440, previous + minutes);

  const { error } = await admin
    .from("exam_attempts")
    .update({ extension_minutes: next })
    .eq("id", attemptId)
    .eq("exam_id", id)
    .eq("status", "in_progress");
  if (error) {
    return NextResponse.json({ error: "Could not save the time extension." }, { status: 500, headers: NO_STORE });
  }

  const deadline = attemptDeadline(exam, attempt.started_at as string, next);
  await audit(ctx, "exam.extension_granted", "exam_attempts", attemptId, orgId, {
    exam_id: id,
    exam_title: exam.title,
    candidate_id: attempt.candidate_id,
    previous_extension_minutes: previous,
    extension_minutes: next,
    delta_minutes: next - previous,
    mode,
    reason: reason?.trim() || null,
    deadline: deadline.toISOString(),
    source: "live_monitor_api",
  });

  return NextResponse.json(
    { ok: true, extension_minutes: next, deadline: deadline.toISOString() },
    { headers: NO_STORE },
  );
}
