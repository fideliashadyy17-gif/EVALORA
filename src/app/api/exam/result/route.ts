import { loadAttemptContext } from "@/lib/exam";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Query = z.object({
  attempt_id: z.string().uuid(),
  token: z.string().uuid(),
});

const headers = { "Cache-Control": "private, no-store" };

/**
 * The candidate's own result, for the screen shown straight after submission.
 *
 * The candidate proves who they are with the same access token the paper was
 * sat with — no session, no cookie, no staff role.
 *
 * The payload is deliberately shaped for ONE examination, not for IB criteria.
 * It carries no criterion totals, no criterion labels and no per-criterion
 * breakdown, because a student reading this page must see how they did on the
 * paper as a whole. `criterion_reporting` is honoured by simply never sending
 * criterion data from here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = Query.safeParse({
    attempt_id: url.searchParams.get("attempt_id") ?? "",
    token: url.searchParams.get("token") ?? "",
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

  const admin = createAdminClient();
  const ctx = await loadAttemptContext(admin, parsed.data.attempt_id, parsed.data.token);
  if (!ctx) return NextResponse.json({ error: "Result not found." }, { status: 404, headers });
  const { attempt, exam } = ctx;

  if (attempt.status === "in_progress")
    return NextResponse.json({ error: "This paper has not been submitted yet." }, { status: 409, headers });

  const score = attempt.score === null || attempt.score === undefined ? null : Number(attempt.score);
  const max = attempt.max_score === null || attempt.max_score === undefined ? null : Number(attempt.max_score);
  const pending = Number(attempt.pending_manual_count ?? 0);
  const status: "final" | "provisional" = pending > 0 ? "provisional" : "final";
  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const passMark =
    typeof settings.pass_mark_percent === "number" && Number.isFinite(settings.pass_mark_percent)
      ? settings.pass_mark_percent
      : null;

  const percentage = score !== null && max !== null && max > 0 ? Math.round((score / max) * 1000) / 10 : null;

  // A blank name is possible on a walk-in attempt; the page handles null.
  const name = [attempt.first_name, attempt.last_name].filter(Boolean).join(" ").trim() || null;

  return NextResponse.json(
    {
      attempt_id: attempt.id,
      submitted_at: attempt.submitted_at ?? null,
      status,
      score,
      max,
      percentage,
      pending_manual_count: pending,
      pass_mark_percent: passMark,
      passed: percentage !== null && passMark !== null ? percentage >= passMark : null,
      exam: {
        title: exam.title,
        instructions: exam.instructions ?? null,
        duration_minutes: exam.duration_minutes,
      },
      candidate_name: name,
      entry_href: (settings.entry_href as string | undefined) ?? "/exam-access",
    },
    { headers },
  );
}
