import { createAdminClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

const EXCELLENT_THRESHOLD = 80; // percent

interface ResultData {
  attempt: {
    id: string;
    status: string;
    score: number | null;
    max_score: number | null;
    grading_status: string | null;
    submitted_at: string | null;
  };
  exam: {
    id: string;
    title: string;
    pass_mark_percent: number;
  };
  candidate: {
    name: string;
    reference: string | null;
  };
  percentage: number;
  passed: boolean;
  excellent: boolean;
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const ctx = await requireUser();

  const admin = createAdminClient();

  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, status, score, max_score, grading_status, submitted_at, candidate_id, exam_id")
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt) redirect("/take-exam");

  const { data: exam } = await admin
    .from("exams")
    .select("id, title, pass_mark_percent")
    .eq("id", attempt.exam_id)
    .maybeSingle();

  const { data: candidate } = await admin
    .from("exam_candidates")
    .select("full_name, candidate_ref")
    .eq("id", attempt.candidate_id)
    .maybeSingle();

  if (!exam || !candidate) redirect("/take-exam");

  const maxScore = Number(attempt.max_score) || 0;
  const score = Number(attempt.score) || 0;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passMark = Number(exam.pass_mark_percent) || 50;
  const passed = percentage >= passMark;
  const excellent = percentage >= EXCELLENT_THRESHOLD;

  const data: ResultData = {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      max_score: attempt.max_score,
      grading_status: attempt.grading_status,
      submitted_at: attempt.submitted_at,
    },
    exam: {
      id: exam.id,
      title: exam.title,
      pass_mark_percent: exam.pass_mark_percent,
    },
    candidate: {
      name: candidate.full_name || "Candidate",
      reference: candidate.candidate_ref ?? null,
    },
    percentage,
    passed,
    excellent,
  };

  return <ResultView data={data} />;
}

function ResultView({ data }: { data: ResultData }) {
  const { attempt, exam, candidate, percentage, passed, excellent } = data;

  // Pre-compute classes to avoid complex template literals in JSX
  const cardClass =
    excellent
      ? "border-evergreen-200 bg-evergreen-50/50"
      : passed
        ? "border-evergreen-100 bg-white"
        : "border-amber-200 bg-amber-50/50";

  const iconClass =
    excellent
      ? "bg-evergreen-700 text-white shadow-lg shadow-evergreen-700/30"
      : passed
        ? "bg-evergreen-700 text-white"
        : "bg-amber-500 text-white";

  const headingClass = excellent || passed ? "text-evergreen-800" : "text-amber-800";
  const percentClass = excellent || passed ? "text-evergreen-700" : "text-amber-700";

  const badgeClass =
    excellent || passed
      ? "bg-evergreen-100 text-evergreen-800 border border-evergreen-200"
      : "bg-amber-100 text-amber-800 border border-amber-200";

  const badgeLabel = excellent ? "Excellent" : passed ? "Passing" : "Below average";
  const headingLabel = excellent ? "Outstanding Work!" : passed ? "Congratulations!" : "Keep Trying!";

  const messageBoxClass = excellent || passed ? "border-evergreen-200" : "border-amber-200";
  const messageH3Class = excellent || passed ? "text-evergreen-800" : "text-amber-800";
  const messagePClass = excellent || passed ? "text-evergreen-900/90" : "text-amber-900/90";

  const messageHeading = excellent
    ? "Congratulations! You have achieved an excellent result."
    : passed
      ? "Well done! You have achieved the required average."
      : "Do not give up.";

  const messageBody = excellent
    ? "Your hard work and dedication are paying off. Keep aiming higher!"
    : passed
      ? "You are on the right track. Keep working hard and continue improving!"
      : "This result shows you which areas need more practice. Review your lessons, strengthen your understanding, and prepare well for your next examination. You can improve!";

  const badgeIcon = excellent ? (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ) : passed ? (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const extraBadge = excellent ? (
    <span className="text-xs font-medium text-evergreen-700 bg-evergreen-100 px-3 py-1 rounded-full">
      Every challenge is an opportunity to learn.
    </span>
  ) : passed && !excellent ? (
    <span className="text-xs font-medium text-evergreen-700 bg-evergreen-100 px-3 py-1 rounded-full">
      Keep working hard and continue improving!
    </span>
  ) : (
    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
      You can improve!
    </span>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-evergreen-50 to-paper p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-evergreen-700 flex items-center justify-center text-white font-bold text-lg">
              E
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-evergreen-700">EVALORA</div>
              <div className="text-sm font-medium text-evergreen-900">{exam.title}</div>
            </div>
          </div>
          <div className="text-right text-xs text-ink-soft">
            <div>{candidate.name}</div>
            {candidate.reference && <div>Ref: {candidate.reference}</div>}
          </div>
        </header>

        <div className={`rounded-2xl border p-8 shadow-lg mb-8 ${cardClass}`}>
          <div className="flex flex-col items-center justify-center text-center mb-8">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${iconClass}`}>
              {badgeIcon}
            </div>

            <h2 className={`text-3xl font-bold mb-2 ${headingClass}`}>{headingLabel}</h2>

            <div className={`text-5xl font-display font-bold mb-4 ${percentClass}`}>
              {percentage.toFixed(0)}%
            </div>

            <div className="text-sm text-ink-soft mb-2">
              {attempt.score} / {attempt.max_score} marks
            </div>

            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${badgeClass}`}>
              {badgeLabel}
            </div>
          </div>

          <div className={`bg-white/50 rounded-xl p-6 mb-6 ${messageBoxClass}`}>
            <h3 className={`font-bold mb-2 ${messageH3Class}`}>{messageHeading}</h3>
            <p className={`text-sm text-ink-soft leading-relaxed ${messagePClass}`}>{messageBody}</p>
          </div>

          <div className="flex gap-2 mb-6">{extraBadge}</div>

          <div className="grid grid-cols-2 gap-4 text-xs text-ink-soft">
            <div>
              <div className="font-bold text-evergreen-900">{attempt.status.replace(/_/g, " ")}</div>
              <div>Submission status</div>
            </div>
            <div>
              <div className="font-bold text-evergreen-900">
                {attempt.grading_status === "graded" ? "Automatic" : attempt.grading_status || "Not graded"}
              </div>
              <div>Grading method</div>
            </div>
          </div>
        </div>

        <footer className="text-center pt-6">
          <button
            onClick={() => window.location.href = "/student"}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-evergreen-700 bg-white border border-evergreen-200 rounded-lg hover:bg-evergreen-50 transition"
          >
            ← Back to my workspace
          </button>
        </footer>
      </div>
    </div>
  );
}
