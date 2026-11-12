import { attemptDeadline } from "@/lib/exam";
import { manualPauseMs } from "@/lib/examPause";
import { accessCodeMatches } from "@/lib/exam-access";
import { admissionTrack, paperForTrack, trackSelectionEnabled } from "@/lib/examTrack";
import { findUsableGrant, startRetakeAttempt, type RetakeCandidateRow } from "@/lib/examRetakeServer";
import { loadQuizQuestions, seededShuffle } from "@/lib/live";
import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  // Generous length limits: a code pasted with spaces around its hyphens
  // (e.g. "MYP2 - FORM2 - 2026") must not be rejected before it is compared.
  exam_code: z.string().min(4).max(32),
  candidate_code: z.string().min(4).max(32),
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
  const { data: exactExam } = await admin.from("exams").select("*").eq("access_code", examCode).maybeSingle();
  let exam = exactExam;
  if (!exam) {
    // Forgiving fallback: hyphens/spaces or O/0, I/1 transcription slips.
    const { data: codedExams } = await admin.from("exams").select("*").not("access_code", "is", null);
    exam = (codedExams ?? []).find((row) => accessCodeMatches(examCode, row.access_code as string | null)) ?? null;
  }
  if (!exam) return NextResponse.json({ error: "Examination not found. Check the exam code." }, { status: 404 });
  // A paused examination admits ONLY candidates resuming an existing active
  // attempt (checked below); every other non-open status refuses everyone.
  if (exam.status !== "open" && exam.status !== "paused")
    return NextResponse.json({ error: "This examination is not open yet. Please check with your institution." }, { status: 403 });

  const now = new Date();
  if (exam.starts_at && new Date(exam.starts_at) > now)
    return NextResponse.json({ error: `This examination opens at ${new Date(exam.starts_at).toLocaleString()}.` }, { status: 403 });
  if (exam.ends_at && new Date(exam.ends_at) < now)
    return NextResponse.json({ error: "This examination window has closed." }, { status: 403 });

  const { data: exactCandidate } = await admin
    .from("exam_candidates")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("access_code", candidateCode)
    .maybeSingle();
  let candidate = exactCandidate;
  if (!candidate) {
    const { data: examCandidates } = await admin.from("exam_candidates").select("*").eq("exam_id", exam.id);
    candidate =
      (examCandidates ?? []).find((row) => accessCodeMatches(candidateCode, row.access_code as string | null)) ?? null;
  }
  if (!candidate)
    return NextResponse.json({ error: "Candidate code not recognized for this examination." }, { status: 404 });

  // A candidate may own several attempts: the first one, then one per approved
  // retake. Resume the active attempt; a submitted paper is only followed by a
  // NEW attempt when an approval authorizes it.
  const { data: attemptRows } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("candidate_id", candidate.id)
    .order("attempt_number", { ascending: false });

  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const attemptPolicy = typeof settings.attempt_policy === "string" ? settings.attempt_policy : "single_resume";
  const rowsForCandidate = (attemptRows ?? []) as Record<string, unknown>[];
  const latestAttempt = rowsForCandidate[0] ?? null;
  let attempt: Record<string, unknown> | null = rowsForCandidate.find((row) => row.status === "in_progress") ?? null;

  // Paused examination gate: resuming the active attempt is allowed (the
  // attempt routes freeze composition and the countdown while paused); new
  // attempts and retakes wait for the organizer to resume.
  if (exam.status === "paused" && !attempt)
    return NextResponse.json(
      { error: "This examination has been paused by the organizer and is not accepting entries right now. If you already started it, sign in again with the same details to return to your saved attempt." },
      { status: 409 },
    );

  if (!attempt && latestAttempt) {
    const grant = await findUsableGrant(admin, exam.id, candidate.id);
    if (!grant) {
      if (attemptPolicy !== "read_only_reentry")
        return NextResponse.json(
          { error: "This attempt has already been submitted. Duplicate attempts are not permitted. Request a retake from your submitted examination page; only a Super Admin approval authorizes another attempt." },
          { status: 409 },
        );
      const deadline = attemptDeadline(exam, String(latestAttempt.started_at ?? ""), Number(latestAttempt.extension_minutes ?? 0));
      return NextResponse.json({
        attempt_id: latestAttempt.id,
        access_token: latestAttempt.access_token,
        exam_id: exam.id,
        title: exam.title,
        candidate_name: candidate.full_name,
        status: latestAttempt.status,
        attempt_number: Number(latestAttempt.attempt_number ?? 1),
        track: latestAttempt.track ?? null,
        deadline: deadline.toISOString(),
        proctoring: Boolean(settings.proctoring),
      });
    }
    if (exam.status !== "open" || (exam.ends_at && Date.parse(exam.ends_at) < Date.now()))
      return NextResponse.json(
        { error: "Your retake is approved, but the examination window is closed. Ask your institution to reopen or extend it." },
        { status: 403 },
      );
    const started = await startRetakeAttempt(admin, {
      exam,
      candidate: candidate as unknown as RetakeCandidateRow,
      grant,
    });
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: 409 });
    const retakeDeadline = attemptDeadline(exam, started.attempt.started_at, Number((started.attempt as { extension_minutes?: number }).extension_minutes ?? 0));
    return NextResponse.json({
      attempt_id: started.attempt.id,
      access_token: started.attempt.access_token,
      exam_id: exam.id,
      title: exam.title,
      candidate_name: candidate.full_name,
      status: started.attempt.status,
      attempt_number: started.attemptNumber,
      track: started.attempt.track ?? null,
      deadline: retakeDeadline.toISOString(),
      proctoring: Boolean(settings.proctoring),
    });
  }

  if (!attempt) {
    // The track comes from the candidate's class in the database, never from the browser.
    const { data: candidateClass } = candidate.class_id
      ? await admin.from("classes").select("id,curriculum_track").eq("id", candidate.class_id).maybeSingle()
      : { data: null };
    const decision = admissionTrack(trackSelectionEnabled(settings), candidateClass);
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 });
    const track = decision.track;
    const rows0 = exam.quiz_id ? await loadQuizQuestions(admin, exam.quiz_id) : [];
    const rows = track ? paperForTrack(rows0, track) : rows0;
    const ordered = settings.randomize_questions
      ? seededShuffle(rows, `${exam.id}:${candidate.id}`)
      : rows;
    const { data, error } = await admin
      .from("exam_attempts")
      .insert({
        exam_id: exam.id,
        candidate_id: candidate.id,
        question_order: ordered.map((r) => r.id),
        // Only sent for track-selection examinations, so examinations without it
        // never reference the exam_attempts.track column.
        ...(track ? { track } : {}),
      })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
    attempt = data;
    await admin.from("exam_candidates").update({ status: "in_progress" }).eq("id", candidate.id);
  }

  const finalAttempt = attempt;
  if (!finalAttempt) return NextResponse.json({ error: "Could not start your attempt." }, { status: 500 });
  // A resumed attempt carrying an open manual pause echoes the pause-aware
  // deadline so the countdown never shows time the freeze already preserved.
  const deadline = attemptDeadline(
    exam,
    String(finalAttempt.started_at ?? ""),
    Number(finalAttempt.extension_minutes ?? 0),
    manualPauseMs(finalAttempt as { pause_reasons?: string[] | null; paused_at?: string | null }, Date.now()),
  );
  return NextResponse.json({
    attempt_id: finalAttempt.id,
    access_token: finalAttempt.access_token,
    exam_id: exam.id,
    title: exam.title,
    candidate_name: candidate.full_name,
    status: finalAttempt.status,
    attempt_number: Number(finalAttempt.attempt_number ?? 1),
    track: finalAttempt.track ?? null,
    deadline: deadline.toISOString(),
    proctoring: Boolean((exam.settings as Record<string, unknown>)?.proctoring),
  });
}
