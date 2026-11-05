import { attemptDeadline } from "@/lib/exam";
import { loadQuizQuestions, seededShuffle } from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  exam_code: z.string().min(4).max(16),
  candidate_code: z.string().min(4).max(20),
});

/**
 * Candidate admission. Verifies both codes, the exam window and status,
 * then starts (or resumes) the single attempt. The official clock is
 * started_at + duration on the server — resuming never gains time.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const examCode = parsed.data.exam_code.trim().toUpperCase();
  const candidateCode = parsed.data.candidate_code.trim().toUpperCase();

  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams").select("*").eq("access_code", examCode).maybeSingle();
  if (!exam) return NextResponse.json({ error: "Examination not found. Check the exam code." }, { status: 404 });
  if (exam.status !== "open")
    return NextResponse.json({ error: "This examination is not open yet. Please check with your institution." }, { status: 403 });

  const now = new Date();
  if (exam.starts_at && new Date(exam.starts_at) > now)
    return NextResponse.json({ error: `This examination opens at ${new Date(exam.starts_at).toLocaleString()}.` }, { status: 403 });
  if (exam.ends_at && new Date(exam.ends_at) < now)
    return NextResponse.json({ error: "This examination window has closed." }, { status: 403 });

  const { data: candidate } = await admin
    .from("exam_candidates")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("access_code", candidateCode)
    .maybeSingle();
  if (!candidate)
    return NextResponse.json({ error: "Candidate code not recognized for this examination." }, { status: 404 });

  const { data: existing } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const attemptPolicy = typeof settings.attempt_policy === "string" ? settings.attempt_policy : "single_resume";
  let attempt = existing;
  if (attempt && attempt.status !== "in_progress" && attemptPolicy !== "read_only_reentry")
    return NextResponse.json({ error: "This attempt has already been submitted. Duplicate attempts are not permitted." }, { status: 409 });
  if (!attempt) {
    const rows = exam.quiz_id ? await loadQuizQuestions(admin, exam.quiz_id) : [];
    const ordered = settings.randomize_questions
      ? seededShuffle(rows, `${exam.id}:${candidate.id}`)
      : rows;
    const { data, error } = await admin
      .from("exam_attempts")
      .insert({
        exam_id: exam.id,
        candidate_id: candidate.id,
        question_order: ordered.map((r) => r.id),
      })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
    attempt = data;
    await admin.from("exam_candidates").update({ status: "in_progress" }).eq("id", candidate.id);
  }

  const deadline = attemptDeadline(exam, attempt.started_at, Number(attempt.extension_minutes ?? 0));
  return NextResponse.json({
    attempt_id: attempt.id,
    access_token: attempt.access_token,
    exam_id: exam.id,
    title: exam.title,
    candidate_name: candidate.full_name,
    status: attempt.status,
    deadline: deadline.toISOString(),
    proctoring: Boolean((exam.settings as Record<string, unknown>)?.proctoring),
  });
}
