import { loadAttemptContext } from "@/lib/exam";
import { INTEGRITY_EVENTS, parseIntegrityPolicy } from "@/lib/integrity";
import { recordIntegrityEvent } from "@/lib/integrityRecording";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
  event: z.enum(INTEGRITY_EVENTS),
  detail: z.record(z.string(), z.unknown()).optional(),
});

const headers = { "Cache-Control": "private, no-store" };

/**
 * Records one browser-observed integrity event for an examination attempt.
 * The attempt token resolves the examination, candidate and organization on
 * the server. Students cannot choose the attribution, rewrite evidence or
 * record into a closed attempt. The actual dedupe/count/insert implementation
 * is shared with live-quiz participation in `integrityRecording.ts`.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
  const { attempt_id, token, event, detail } = parsed.data;

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, attempt_id, token);
  if (!ctx) return NextResponse.json({ error: "Attempt not found." }, { status: 404, headers });
  const { attempt, exam, candidate } = ctx;
  if (!exam || !candidate || !exam.organization_id)
    return NextResponse.json({ error: "Assessment data is unavailable." }, { status: 500, headers });
  if (attempt.status !== "in_progress")
    return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409, headers });

  const policy = parseIntegrityPolicy(((exam.settings ?? {}) as Record<string, unknown>).integrity);
  try {
    const result = await recordIntegrityEvent(
      admin,
      {
        kind: "exam",
        attemptId: attempt.id,
        organizationId: exam.organization_id,
        examId: exam.id,
        candidateId: candidate.id,
      },
      event,
      detail,
      policy,
    );
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch {
    return NextResponse.json({ error: "The event could not be recorded." }, { status: 500, headers });
  }
}
