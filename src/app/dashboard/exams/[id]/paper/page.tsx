import { PrintButton } from "@/components/ExportTools";
import { RichContent } from "@/components/RichContent";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { loadQuizQuestions } from "@/lib/live";
import { PrintablePaperError, preparePrintableQuestions } from "@/lib/printablePaper";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Print examination" };
export const dynamic = "force-dynamic";

export default async function PrintableExam({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) notFound();
  const db = await createClient();
  const { data: exam, error } = await db.from("exams")
    .select("id, organization_id, quiz_id, title, instructions, duration_minutes")
    .eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (error || !exam || !exam.quiz_id) notFound();
  const { data: quiz, error: quizError } = await db.from("quizzes").select("id")
    .eq("id", exam.quiz_id).eq("organization_id", org.id).maybeSingle();
  if (quizError || !quiz) notFound();
  let questions: ReturnType<typeof preparePrintableQuestions> = [];
  let problem: string | null = null;
  try {
    const { count, error: countError } = await db.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", exam.quiz_id);
    if (countError || count === null) throw new PrintablePaperError("Question count could not be verified.");
    const rows = await loadQuizQuestions(db, exam.quiz_id, { failOnError: true });
    if (rows.length !== count) throw new PrintablePaperError("The complete paper could not be loaded.");
    questions = preparePrintableQuestions(rows, org.id);
  } catch (e) {
    problem = e instanceof PrintablePaperError ? e.message : "The paper could not be loaded.";
  }
  const total = questions.reduce((sum, q) => sum + q.points, 0);
  return (
    <div className="paper-print text-ink">
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/dashboard/exams/${id}`} className="font-medium text-evergreen-700 underline">← Back to examination</Link>
        {!problem && <PrintButton />}
        <p className="basis-full text-sm text-ink-soft">Review the paper before printing. This produces an unpersonalized paper; scanning, candidate matching and paper grading are not yet available.</p>
      </div>
      {problem ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">Cannot prepare paper: {problem} Edit the paper before printing.</p>
      ) : (
        <article className="paper-document bg-white p-8 print:p-0">
          <header className="paper-cover border-b-2 border-black pb-8">
            <p className="text-sm font-semibold uppercase tracking-wide">{org.name} · EVALORA</p>
            <h1 className="mt-4 text-3xl font-bold">{exam.title}</h1>
            <p className="mt-3">Duration: {exam.duration_minutes} minutes · Total: {total} marks</p>
            <div className="mt-8 space-y-4 text-base">
              <p>Candidate name: ______________________________________________________</p>
              <p>Candidate reference: ___________________________ Class: __________________</p>
              <p>Date: ___________________________</p>
            </div>
            {exam.instructions && <section className="mt-8"><h2 className="font-bold">Instructions</h2><p className="mt-2 whitespace-pre-wrap">{exam.instructions}</p></section>}
          </header>
          <section aria-label="Examination questions">
            {questions.map((q, i) => (
              <div key={q.quiz_question_id} className="paper-question border-b border-gray-300 py-6">
                <div className="flex items-start justify-between gap-4"><h2 className="font-bold">Question {i + 1}</h2><span className="shrink-0">[{q.points} marks]</span></div>
                {q.media_url && q.media_type === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.media_url} alt="Question illustration" className="mt-4 max-h-64 max-w-full object-contain" />
                )}
                <div className="mt-3"><RichContent doc={q.prompt_doc} text={q.prompt} /></div>
                {q.options.length > 0 && <ol className="mt-4 space-y-2">{q.options.map((o, j) => <li key={o.id} className="flex gap-3"><span>☐ {String.fromCharCode(65 + j)}.</span><RichContent doc={o.content_doc} text={o.label} /></li>)}</ol>}
                {q.options.length === 0 && <div aria-label="Answer space" className="paper-answer mt-5">{Array.from({length: q.type === "open_ended" ? 7 : 2}, (_, line) => <div key={line} className="h-8 border-b border-gray-400" />)}</div>}
              </div>
            ))}
          </section>
        </article>
      )}
    </div>
  );
}
