import { RichContent } from "@/components/RichContent";
import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { ExportButton, PrintButton } from "@/components/ExportTools";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Session report" };
export const dynamic = "force-dynamic";

export default async function SessionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: session } = await supabase.from("quiz_sessions").select("*, quizzes(title)").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!session) notFound();

  const [{ data: participants }, { data: answers }, { data: qq }] = await Promise.all([
    supabase.from("session_participants").select("*").eq("session_id", id).order("score", { ascending: false }),
    supabase.from("participant_answers").select("*").eq("session_id", id),
    supabase.from("quiz_questions").select("id, position, questions(prompt, prompt_doc, type, topic, difficulty, points)").eq("quiz_id", session.quiz_id).order("position"),
  ]);

  const parts = (participants ?? []).filter((p) => p.status !== "rejected");
  const allAnswers = answers ?? [];
  const avg = parts.length ? parts.reduce((s, p) => s + Number(p.score), 0) / parts.length : 0;
  const correctCount = allAnswers.filter((a) => a.is_correct === true).length;
  const graded = allAnswers.filter((a) => a.is_correct !== null);
  const accuracy = graded.length ? (correctCount / graded.length) * 100 : 0;
  const completion = parts.length && (qq ?? []).length
    ? Math.round((allAnswers.length / (parts.length * (qq ?? []).length)) * 100)
    : 0;

  const questionStats = (qq ?? []).map((r) => {
    const q = r.questions as unknown as { prompt: string; type: string; topic: string | null; difficulty: string; points: number };
    const mine = allAnswers.filter((a) => a.quiz_question_id === r.id);
    const g = mine.filter((a) => a.is_correct !== null);
    const c = mine.filter((a) => a.is_correct === true).length;
    return { prompt: q.prompt, type: q.type, topic: q.topic, difficulty: q.difficulty, answered: mine.length, pct: g.length ? Math.round((c / g.length) * 100) : null };
  });

  const csv = toCsv([
    ["Rank", "Participant", "Reference", "Score", "Status"],
    ...parts.map((p, i) => [i + 1, p.display_name, p.participant_ref ?? "", Number(p.score), p.status]),
    [],
    ["Question", "Type", "Topic", "Difficulty", "Answered", "% Correct"],
    ...questionStats.map((q, i) => [`Q${i + 1}`, q.type, q.topic ?? "", q.difficulty, q.answered, q.pct ?? "n/a"]),
  ]);

  return (
    <>
      <PageTitle
        title={session.title || (session.quizzes as { title: string } | null)?.title || "Session report"}
        subtitle={`Code ${session.join_code} · ${session.mode} · ${session.status}`}
        action={<div className="flex gap-2 print:hidden"><ExportButton filename={`session-${session.join_code}.csv`} csv={csv} /><PrintButton /></div>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Participants" value={parts.length} />
        <StatCard label="Average score" value={avg.toFixed(1)} />
        <StatCard label="Answer accuracy" value={`${accuracy.toFixed(0)}%`} />
        <StatCard label="Completion" value={`${completion}%`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Rankings</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b border-evergreen-900/10 text-left text-ink-soft"><th className="py-2 pr-2 font-medium">#</th><th className="py-2 pr-2 font-medium">Participant</th><th className="py-2 font-medium">Score</th></tr></thead>
            <tbody>
              {parts.map((p, i) => (
                <tr key={p.id} className="border-b border-evergreen-900/5">
                  <td className="py-2 pr-2 font-bold text-ink-soft">{i + 1}</td>
                  <td className="py-2 pr-2">{p.display_name}{p.participant_ref && <span className="block text-xs text-ink-soft">{p.participant_ref}</span>}</td>
                  <td className="py-2 font-semibold tabular-nums">{Number(p.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Question analysis</h2>
          <div className="mt-3 space-y-3">
            {questionStats.map((q, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 flex-1 text-sm font-medium"><span className="text-ink-soft">Q{i + 1}.</span> <RichContent doc={(q as { prompt_doc?: import("@/lib/content").RichDoc | null }).prompt_doc ?? null} text={q.prompt} /></p>
                  {q.pct !== null ? <Badge tone={q.pct >= 70 ? "green" : q.pct >= 40 ? "amber" : "red"}>{q.pct}%</Badge> : <Badge tone="gray">ungraded</Badge>}
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-evergreen-100">
                  <div className={`h-full ${(q.pct ?? 0) >= 70 ? "bg-evergreen-600" : (q.pct ?? 0) >= 40 ? "bg-gold-500" : "bg-red-500"}`} style={{ width: `${q.pct ?? 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-ink-soft">{q.answered} answers · {q.difficulty}{q.topic ? ` · ${q.topic}` : ""}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
