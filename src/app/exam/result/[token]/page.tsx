import { Badge, ButtonLink, Card } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { RichContent } from "@/components/RichContent";
import { MathText } from "@/components/MathText";
import { CandidatePaperDownloadButton } from "@/components/CandidatePaperDownloadButton";
import { isAttemptEligibleForPaperPdf } from "@/lib/candidatePaper";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveAssessmentConfig } from "@/lib/assessmentConfig";
import { passMarkFrom } from "@/lib/examFeedback";
import { attemptRows } from "@/lib/exam";
import { answerReveal, releasedFeedback } from "@/lib/live";
import type { RichDoc } from "@/lib/content";
import type { Metadata } from "next";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = { title: "Examination Result · EVALORA" };
export const dynamic = "force-dynamic";

function calculateMypLevel(percentage: number): number {
  if (percentage <= 0) return 0;
  if (percentage <= 12.5) return 1;
  if (percentage <= 25) return 2;
  if (percentage <= 37.5) return 3;
  if (percentage <= 50) return 4;
  if (percentage <= 62.5) return 5;
  if (percentage <= 75) return 6;
  if (percentage <= 87.5) return 7;
  return 8;
}

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
              The link you used contains an invalid access token format. Please verify the URL provided by your teacher.
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
              We could not find an examination attempt associated with this secure link. Please check the URL or contact your teacher.
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
              The examination records could not be loaded. Please reload the page or contact your teacher.
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
              This examination attempt is currently active. Official results and confirmation become available after final submission.
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
  const canDownloadPaper =
    isAttemptEligibleForPaperPdf(attempt.status) && !exam.deleted_at && settings.archived !== true;
  const confirmationCode = String(attempt.access_token).slice(0, 8).toUpperCase();
  const candidateName = candidate.full_name || `${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`.trim() || "Candidate";
  const candidateIdentifier = candidate.candidate_ref || candidate.email || (candidate.access_code ? `Code: ${candidate.access_code}` : null);
  // Configured default with organization override; the examination's own
  // stored pass mark always wins.
  const assessmentCfg = await resolveAssessmentConfig(exam.organization_id ?? null);
  const passMarkPercent = passMarkFrom(settings, assessmentCfg.defaultPassPercent);

  // Criteria summary structure
  const criteriaTotals: Record<string, { title: string; max: number; awarded: number }> = {
    A: { title: "Knowing and understanding", max: 0, awarded: 0 },
    B: { title: "Investigating patterns", max: 0, awarded: 0 },
    C: { title: "Communicating", max: 0, awarded: 0 },
    D: { title: "Applying mathematics in real-life contexts", max: 0, awarded: 0 },
  };

  type QuestionDetail = {
    number: number;
    section: string | null;
    points: number;
    awarded: number;
    isCorrect: boolean | null;
    isManual: boolean;
    criterionCode: string;
    prompt: string;
    promptDoc: RichDoc | null;
    explanation: string | null;
    explanationDoc: RichDoc | null;
    studentAnswerText: string;
    correctAnswerText: string;
    feedback: { marking_criteria: string | null; next_time_hint: string | null };
  };

  let questionsBreakdown: QuestionDetail[] = [];

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
        const awardedPts = s?.points_awarded !== null && s?.points_awarded !== undefined ? Number(s.points_awarded) : 0;
        const isManual = q.type === "open_ended" && !cfg.structured_marks;
        const reveal = answerReveal(row);
        const fb = releasedFeedback(row);

        // Map Criteria points
        const criterionCode = String(cfg.myp_criterion || "A").toUpperCase();
        if (Array.isArray(cfg.criterion_shares) && cfg.criterion_shares.length > 0) {
          const shares = cfg.criterion_shares as { criterion?: string; points?: number }[];
          const totalShares = shares.reduce((sum, sh) => sum + Number(sh.points || 0), 0);
          for (const sh of shares) {
            const cCode = String(sh.criterion ?? "").toUpperCase();
            const shPts = Number(sh.points || 0);
            const shAwarded = totalShares > 0 ? (shPts / totalShares) * awardedPts : 0;
            if (criteriaTotals[cCode]) {
              criteriaTotals[cCode].max += shPts;
              criteriaTotals[cCode].awarded += shAwarded;
            }
          }
        } else if (criteriaTotals[criterionCode]) {
          criteriaTotals[criterionCode].max += maxPts;
          criteriaTotals[criterionCode].awarded += awardedPts;
        }

        // Determine student answer representation
        let studentAns = "(Not answered · 0 marks)";
        if (s?.answer && typeof s.answer === "object") {
          const ans = s.answer as Record<string, unknown>;
          if (typeof ans.value === "string" || typeof ans.value === "number") {
            studentAns = String(ans.value);
          } else if (typeof ans.text === "string" && ans.text.trim()) {
            studentAns = ans.text.trim();
          } else if (typeof ans.option_id === "string") {
            const opt = q.question_options.find((o) => o.id === ans.option_id);
            studentAns = opt ? `${opt.label}` : ans.option_id;
          } else if (Array.isArray(ans.option_ids)) {
            const labels = q.question_options
              .filter((o) => (ans.option_ids as string[]).includes(o.id))
              .map((o) => o.label);
            studentAns = labels.length ? labels.join(", ") : "(None selected)";
          } else if (ans.parts && typeof ans.parts === "object") {
            const partsList = Object.entries(ans.parts as Record<string, string>)
              .map(([k, v]) => `Part ${k}: ${v}`)
              .join(" · ");
            studentAns = partsList || "(No typed parts)";
          }
        }

        // Determine correct answer representation
        let correctAns = "";
        if (reveal.summary && reveal.summary.length > 0) {
          correctAns = reveal.summary.join(", ");
        } else if (reveal.accepted_answers && reveal.accepted_answers.length > 0) {
          correctAns = reveal.accepted_answers.join(", ");
        } else if (reveal.numeric_answer !== null) {
          correctAns = String(reveal.numeric_answer) + (reveal.tolerance ? ` (±${reveal.tolerance})` : "");
        } else if (reveal.correct_option_ids && reveal.correct_option_ids.length > 0) {
          const opts = q.question_options
            .filter((o) => reveal.correct_option_ids.includes(o.id))
            .map((o) => o.label);
          correctAns = opts.join(", ");
        } else {
          correctAns = "Refer to marking scheme";
        }

        return {
          number: index + 1,
          section: typeof cfg.paper_section === "string" ? cfg.paper_section : null,
          points: maxPts,
          awarded: awardedPts,
          isCorrect: s?.is_correct ?? (isManual ? null : false),
          isManual,
          criterionCode,
          prompt: q.prompt,
          promptDoc: q.prompt_doc,
          explanation: q.explanation ?? null,
          explanationDoc: q.explanation_doc ?? null,
          studentAnswerText: studentAns,
          correctAnswerText: correctAns,
          feedback: fb,
        };
      });

      // Silently fold any verified pre-validation criterion adjustments into
      // the criterion totals (strictly capped at each criterion's max).
      // Zero adjustment/bonus metadata is ever shown to the candidate.
      const { data: adjRows } = await admin
        .from("exam_score_adjustment_items")
        .select("category_type, category_key, points_applied")
        .eq("attempt_id", attempt.id);
      for (const adj of adjRows ?? []) {
        if (adj.category_type === "myp_criterion") {
          const code = String(adj.category_key ?? "").trim().toUpperCase();
          const pts = Number(adj.points_applied ?? 0);
          if (criteriaTotals[code] && Number.isFinite(pts) && pts > 0) {
            criteriaTotals[code].awarded =
              Math.round(Math.min(criteriaTotals[code].max, criteriaTotals[code].awarded + pts) * 100) / 100;
          }
        }
      }
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
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Logo href="/" />
          <div className="rounded-full border border-evergreen-900/10 bg-white px-4 py-1.5 text-right shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-evergreen-950">
              Official Candidate Result
            </p>
          </div>
        </header>

        {/* Main Status & Header Card */}
        <Card className="mb-6 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Examination Assessment</p>
              <h1 className="mt-1 font-display text-2xl font-bold text-evergreen-950 sm:text-3xl">{exam.title}</h1>
              <p className="mt-1.5 text-sm text-ink-soft">
                Candidate: <strong className="text-evergreen-950">{candidateName}</strong>
                {candidateIdentifier ? ` · ${candidateIdentifier}` : ""}
              </p>
              {attempt.submitted_at && (
                <p className="mt-0.5 text-xs text-ink-soft">
                  Submitted: {new Date(attempt.submitted_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="text-right">
              <Badge tone={resultsPublished ? (isPass ? "green" : "red") : "amber"}>
                {resultsPublished ? (isPass ? "PASS" : "BELOW PASS MARK") : "Awaiting Publication"}
              </Badge>
              <p className="mt-2 text-xs font-mono text-ink-soft">Ref: <strong>{confirmationCode}</strong></p>
            </div>
          </div>

          {/* Candidate Examination Paper PDF Download (ManageBac Evidence) */}
          {canDownloadPaper && (
            <div className="mt-5 rounded-xl border border-evergreen-800/20 bg-evergreen-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-evergreen-900">
                    Examination Paper Copy (PDF)
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Download a printable A4 PDF of your examination questions and submitted answers for your records or ManageBac upload.
                  </p>
                </div>
                <div className="shrink-0">
                  <CandidatePaperDownloadButton
                    mode="candidate"
                    token={token}
                    label="Download My Exam (PDF)"
                    variant="primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Secure Bookmark Link */}
          <div className="mt-4 rounded-xl border border-evergreen-900/15 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-evergreen-900">Your Personal Secure Result Link</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Save or bookmark this personal link to access your verified examination report anytime.
                </p>
              </div>
              <CopyButton url={`/exam/result/${token}`} label="Copy link" />
            </div>
          </div>
        </Card>

        {/* CASE 1: RESULTS WITHHELD / NOT YET PUBLISHED */}
        {!resultsPublished ? (
          <Card className="p-8 text-center sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
              ⏳
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold text-evergreen-950">
              Examination Submitted Successfully
            </h2>
            <div className="mx-auto mt-3 max-w-lg space-y-2 text-base text-evergreen-900 leading-relaxed">
              <p className="font-medium">
                Your responses have been securely received and recorded on the server.
              </p>
              <p className="text-sm text-ink-soft">
                Examination results are currently pending teacher review and have not yet been published.
              </p>
              <p className="text-sm text-ink-soft">
                When your institution authorizes publication, your official score, criteria breakdown, and worked solutions will appear automatically on this page.
              </p>
            </div>
            <div className="mt-6 flex justify-center">
              <ButtonLink href={`/exam/result/${token}`} variant="outline" className="text-xs">
                Check publication status ↻
              </ButtonLink>
            </div>
          </Card>
        ) : (
          /* CASE 2: RESULTS OFFICIALLY PUBLISHED */
          <div className="space-y-6">
            {/* Total Score & Pass Mark Card */}
            <Card className="p-6 text-center sm:p-8">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Verified Overall Score</p>
              <div className="mt-2 flex items-baseline justify-center gap-2">
                <span className="font-display text-5xl font-extrabold text-evergreen-950">
                  {score ?? "—"}
                </span>
                <span className="text-2xl font-medium text-ink-soft">/ {maxScore}</span>
              </div>
              {percentage !== null && (
                <p className="mt-2 text-xl font-bold text-evergreen-800">
                  {percentage.toFixed(1)}%
                </p>
              )}
              <div className="mt-4 flex justify-center">
                <Badge tone={isPass ? "green" : "red"} className="px-3.5 py-1 text-xs">
                  {isPass ? "Passing grade" : "Below pass mark"} · Required pass mark: {passMarkPercent}%
                </Badge>
              </div>
            </Card>

            {/* Performance by MYP Assessment Criterion (Criteria A, B, C, D) */}
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">
                Performance by MYP Assessment Criterion
              </h2>
              <p className="mt-1 text-xs text-ink-soft">
                Summative criterion marks and indicative MYP achievement levels (1–8).
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(["A", "B", "C", "D"] as const).map((code) => {
                  const crit = criteriaTotals[code];
                  const critPct = crit.max > 0 ? (crit.awarded / crit.max) * 100 : 0;
                  const level = calculateMypLevel(critPct);
                  return (
                    <div key={code} className="rounded-xl border border-evergreen-900/10 bg-white p-4 text-left shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-evergreen-100 px-2 py-0.5 text-xs font-bold text-evergreen-900">
                          Criterion {code}
                        </span>
                        <strong className="text-xs font-bold text-evergreen-900">Level {level} / 8</strong>
                      </div>
                      <p className="mt-2 text-xs font-medium text-evergreen-950 line-clamp-1" title={crit.title}>
                        {crit.title}
                      </p>
                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-base font-bold tabular-nums text-evergreen-950">
                          {Math.round(crit.awarded * 10) / 10} / {crit.max}
                        </span>
                        <span className="text-xs font-semibold text-ink-soft">
                          {critPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-cream">
                        <div
                          className="h-1.5 rounded-full bg-evergreen-700"
                          style={{ width: `${Math.min(100, critPct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Question-by-Question Detailed Results */}
            {questionsBreakdown.length > 0 && (
              <Card className="p-6">
                <h2 className="font-display text-lg font-semibold text-evergreen-950">
                  Question-by-Question Detailed Review
                </h2>
                <p className="mt-1 text-xs text-ink-soft">
                  Complete candidate responses, official answer keys, and pedagogical correction guides.
                </p>

                <div className="mt-5 space-y-6">
                  {questionsBreakdown.map((q) => (
                    <div
                      key={q.number}
                      className="rounded-xl border border-evergreen-900/15 bg-white p-5 shadow-xs transition hover:border-evergreen-900/25"
                    >
                      {/* Question Meta Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-evergreen-900/10 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-evergreen-100 text-xs font-bold text-evergreen-900">
                            {q.number}
                          </span>
                          <span className="font-semibold text-evergreen-950 text-sm">
                            Question {q.number}
                            {q.section ? ` · Part ${q.section}` : ""}
                          </span>
                          <span className="rounded bg-cream px-2 py-0.5 text-xs font-medium text-ink-soft">
                            Criterion {q.criterionCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {q.isManual && q.isCorrect === null ? (
                            <Badge tone="amber">Pending manual grading</Badge>
                          ) : (
                            <Badge tone={q.isCorrect ? "green" : q.awarded > 0 ? "gold" : "red"}>
                              {q.isCorrect ? "Correct" : q.awarded > 0 ? "Partial credit" : "Incorrect"}
                            </Badge>
                          )}
                          <span className="text-sm font-bold tabular-nums text-evergreen-950">
                            {q.awarded} / {q.points} pt{q.points === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>

                      {/* Question Prompt */}
                      <div className="mt-3 text-sm text-evergreen-950 leading-relaxed font-medium">
                        {q.promptDoc ? (
                          <RichContent doc={q.promptDoc} text={q.prompt} />
                        ) : (
                          <MathText text={q.prompt} />
                        )}
                      </div>

                      {/* Student Submitted Answer vs Correct Answer */}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {/* Student Answer */}
                        <div className="rounded-lg border border-evergreen-900/10 bg-cream/50 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                            Student Submitted Response
                          </p>
                          <div className="mt-1 text-sm text-evergreen-950 font-medium">
                            <MathText text={q.studentAnswerText} />
                          </div>
                        </div>

                        {/* Official Correct Answer */}
                        <div className="rounded-lg border border-evergreen-700/20 bg-evergreen-50/50 p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-evergreen-800">
                            Official Correct Answer
                          </p>
                          <div className="mt-1 text-sm text-evergreen-950 font-medium">
                            <MathText text={q.correctAnswerText} />
                          </div>
                        </div>
                      </div>

                      {/* Worked Explanation & Correction Guide */}
                      {(q.explanation || q.explanationDoc) && (
                        <div className="mt-3 rounded-lg border border-evergreen-900/10 bg-white p-3.5 text-xs text-ink-soft">
                          <p className="font-bold uppercase tracking-wider text-evergreen-900">
                            Correction Guide &amp; Worked Explanation:
                          </p>
                          <div className="mt-1 text-sm text-evergreen-950 leading-relaxed">
                            {q.explanationDoc ? (
                              <RichContent doc={q.explanationDoc} text={q.explanation ?? ""} />
                            ) : (
                              <MathText text={q.explanation ?? ""} />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Pedagogical Guidance */}
                      {q.feedback && (q.feedback.marking_criteria || q.feedback.next_time_hint) && (
                        <div className="mt-2 text-xs text-ink-soft border-t border-evergreen-900/5 pt-2 space-y-1">
                          {q.feedback.marking_criteria && (
                            <p><strong>Rubric alignment:</strong> {q.feedback.marking_criteria}</p>
                          )}
                          {q.feedback.next_time_hint && (
                            <p><strong>Guidance:</strong> {q.feedback.next_time_hint}</p>
                          )}
                        </div>
                      )}
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
