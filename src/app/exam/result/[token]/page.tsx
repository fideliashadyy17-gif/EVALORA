import { Badge, Button, ButtonLink, Card } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/server";
import { attemptRows } from "@/lib/exam";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = { title: "Examination Result · EVALORA" };
export const dynamic = "force-dynamic";

export default async function ExamResultTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
  if (!isUuid) {
    return (
      <main className="min-h-screen bg-cream px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <header className="mb-6"><Logo href="/" /></header>
          <Card className="p-8 text-center">
            <h1 className="font-display text-2xl font-semibold text-evergreen-950">Invalid result token</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              The link you used contains an invalid access token format. Please check the complete URL provided upon submission.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (!attempt) {
    return (
      <main className="min-h-screen bg-cream px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <header className="mb-6"><Logo href="/" /></header>
          <Card className="p-8 text-center">
            <h1 className="font-display text-2xl font-semibold text-evergreen-950">Examination attempt not found</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              We could not find an examination attempt associated with this secure link. Please verify the URL or contact your invigilator.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  const { data: exam } = await admin.from("exams").select("*").eq("id", attempt.exam_id).single();
  const { data: candidate } = await admin.from("exam_candidates").select("*").eq("id", attempt.candidate_id).single();

  if (!exam || !candidate) {
    return (
      <main className="min-h-screen bg-cream px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <header className="mb-6"><Logo href="/" /></header>
          <Card className="p-8 text-center">
            <h1 className="font-display text-2xl font-semibold text-evergreen-950">Data unavailable</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              The examination records could not be loaded. Please reload the page or contact your invigilator.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  const isSubmitted = attempt.status !== "in_progress";
  if (!isSubmitted) {
    return (
      <main className="min-h-screen bg-cream px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <header className="mb-6"><Logo href="/" /></header>
          <Card className="p-8 text-center">
            <h1 className="font-display text-2xl font-semibold text-evergreen-950">Examination in progress</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              This examination attempt is currently in progress. Results and confirmation are available after submission.
            </p>
            <div className="mt-5">
              <ButtonLink href={`/take-exam/${attempt.id}`} variant="primary">Return to examination</ButtonLink>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const resultsPublished = Boolean(settings.results_published);
  const confirmationCode = String(attempt.access_token).slice(0, 8).toUpperCase();
  const candidateName = candidate.full_name || `${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`.trim() || "Candidate";
  const passMarkPercent = Number(settings.pass_mark_percent ?? 50);

  // If published, load question rows and saved answers for breakdown
  let questionsBreakdown: {
    number: number;
    points: number;
    awarded: number | null;
    isCorrect: boolean | null;
    isManual: boolean;
    section: string | null;
  }[] = [];

  if (resultsPublished) {
    try {
      const rows = await attemptRows(admin, exam, attempt);
      const { data: savedAnswers } = await admin
        .from("exam_answers")
        .select("question_id, is_correct, points_awarded, answer")
        .eq("attempt_id", attempt.id);
      const savedMap = new Map((savedAnswers ?? []).map((a) => [a.question_id, a]));

      questionsBreakdown = rows.map((row, index) => {
        const q = row.questions;
        const cfg = (q.config ?? {}) as Record<string, unknown>;
        const s = savedMap.get(q.id);
        const maxPts = Number(row.points ?? q.points);
        const isManual = q.type === "open_ended" && !cfg.structured_marks;
        return {
          number: index + 1,
          points: maxPts,
          awarded: s?.points_awarded !== null && s?.points_awarded !== undefined ? Number(s.points_awarded) : (s ? 0 : 0),
          isCorrect: s?.is_correct ?? (isManual ? null : false),
          isManual,
          section: typeof cfg.paper_section === "string" ? cfg.paper_section : null,
        };
      });
    } catch {
      questionsBreakdown = [];
    }
  }

  const score = attempt.score !== null ? Number(attempt.score) : null;
  const maxScore = attempt.max_score !== null ? Number(attempt.max_score) : null;
  const percentage = score !== null && maxScore !== null && maxScore > 0 ? (score / maxScore) * 100 : null;
  const isPass = percentage !== null ? percentage >= passMarkPercent : null;

  return (
    <main className="min-h-screen bg-cream px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Logo href="/" />
          <div className="rounded-full border border-evergreen-900/10 bg-white px-4 py-1.5 text-right shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-evergreen-950">Official Candidate Result</p>
          </div>
        </header>

        {/* Status Banner */}
        <Card className="mb-6 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Assessment Title</p>
              <h1 className="mt-1 font-display text-2xl font-bold text-evergreen-950 sm:text-3xl">{exam.title}</h1>
              <p className="mt-1 text-sm text-ink-soft">
                Candidate: <strong className="text-evergreen-950">{candidateName}</strong>
                {candidate.candidate_ref ? ` (${candidate.candidate_ref})` : ""}
              </p>
              {attempt.submitted_at && (
                <p className="mt-0.5 text-xs text-ink-soft">
                  Submitted at: {new Date(attempt.submitted_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="text-right">
              <Badge tone={resultsPublished ? (isPass ? "green" : "red") : "gold"}>
                {resultsPublished ? (isPass ? "PASS" : "BELOW PASS MARK") : "Awaiting Publication"}
              </Badge>
              <p className="mt-2 text-xs font-mono text-ink-soft">Ref: <strong>{confirmationCode}</strong></p>
            </div>
          </div>

          {/* Secure Link Box */}
          <div className="mt-6 rounded-xl border border-evergreen-900/15 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-evergreen-900">Your Secure Individual Result Link</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Bookmark or copy this link to check your results at any time without logging in.
                </p>
              </div>
              <CopyButton url={`/exam/result/${token}`} label="Copy result link" />
            </div>
          </div>
        </Card>

        {/* Results Body: Published vs Unpublished */}
        {!resultsPublished ? (
          <Card className="p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-2xl">
              ⏳
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-evergreen-950">
              Examination Submitted Successfully
            </h2>
            <div className="mx-auto mt-3 max-w-lg space-y-2 text-sm text-ink-soft">
              <p>
                Status: <strong className="text-evergreen-900">Pending teacher review &amp; publication</strong>.
              </p>
              <p>
                Your responses have been securely stored and recorded on the server.
                Official marks and question-by-question breakdowns will appear on this page as soon as the examination results are officially released by your institution.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => {}} className="text-xs" variant="outline">
                <Link href={`/exam/result/${token}`}>Refresh status ↻</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Score Summary Card */}
            <Card className="p-6 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Total Score</p>
              <div className="mt-2 flex items-baseline justify-center gap-2">
                <span className="font-display text-4xl font-extrabold text-evergreen-950 sm:text-5xl">
                  {score ?? "—"}
                </span>
                <span className="text-xl font-medium text-ink-soft sm:text-2xl">/ {maxScore}</span>
              </div>
              {percentage !== null && (
                <p className="mt-2 text-lg font-semibold text-evergreen-800">
                  {percentage.toFixed(1)}%
                </p>
              )}
              <div className="mt-3 flex justify-center">
                <Badge tone={isPass ? "green" : "red"}>
                  {isPass ? "Passing grade" : "Below pass mark"} · Pass mark: {passMarkPercent}%
                </Badge>
              </div>
            </Card>

            {/* Questions Breakdown */}
            {questionsBreakdown.length > 0 && (
              <Card className="p-6">
                <h3 className="font-display text-lg font-semibold text-evergreen-950">
                  Question Breakdown
                </h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Performance on each question presented during the examination.
                </p>

                <div className="mt-4 divide-y divide-evergreen-900/10 border-t border-evergreen-900/10">
                  {questionsBreakdown.map((q) => (
                    <div key={q.number} className="flex items-center justify-between py-3 text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-evergreen-100 text-xs font-bold text-evergreen-900">
                          {q.number}
                        </span>
                        <span>
                          Question {q.number}
                          {q.section ? ` · Part ${q.section}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {q.isManual && q.isCorrect === null ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                            Pending manual grading
                          </span>
                        ) : (
                          <span className="font-semibold tabular-nums text-evergreen-950">
                            {q.awarded !== null ? q.awarded : "—"} / {q.points}
                          </span>
                        )}
                        <span className="w-5 text-center text-sm font-bold">
                          {q.isCorrect === true ? (
                            <span className="text-evergreen-700">✓</span>
                          ) : q.isCorrect === false ? (
                            <span className="text-red-600">✗</span>
                          ) : (
                            <span className="text-amber-600">⏳</span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-ink-soft">
          EVALORA Examination Platform · Secure Assessment &amp; Reporting
        </footer>
      </div>
    </main>
  );
}
