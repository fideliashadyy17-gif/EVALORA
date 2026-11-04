import { MathText } from "@/components/MathText";
import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { ExportButton, PrintButton } from "@/components/ExportTools";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Examination report" };
export const dynamic = "force-dynamic";

export default async function ExamReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: exam } = await supabase.from("exams").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!exam) notFound();
  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const passMark = Number(settings.pass_mark_percent ?? 50);

  const [{ data: attempts }, { data: qq }, { count: candidateTotal }] = await Promise.all([
    supabase.from("exam_attempts").select("*, exam_candidates(full_name, candidate_ref), exam_answers(question_id, is_correct, points_awarded)").eq("exam_id", id).order("score", { ascending: false, nullsFirst: false }),
    supabase.from("quiz_questions").select("question_id, questions(prompt, type, topic, difficulty)").eq("quiz_id", exam.quiz_id),
    supabase.from("exam_candidates").select("id", { count: "exact", head: true }).eq("exam_id", id),
  ]);

  const list = attempts ?? [];
  const submitted = list.filter((a) => a.status !== "in_progress" && a.score !== null);
  const pcts = submitted.map((a) => (Number(a.score) / Math.max(1, Number(a.max_score ?? 1))) * 100);
  const avgPct = pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : 0;
  const passCount = pcts.filter((p) => p >= passMark).length;

  const qStats = (qq ?? []).map((r) => {
    const q = r.questions as unknown as { prompt: string; type: string; topic: string | null; difficulty: string };
    const answers = list.flatMap((a) =>
      ((a.exam_answers as { question_id: string; is_correct: boolean | null }[]) ?? []).filter((x) => x.question_id === r.question_id),
    );
    const graded = answers.filter((x) => x.is_correct !== null);
    const correct = answers.filter((x) => x.is_correct === true).length;
    return { ...q, answered: answers.length, pct: graded.length ? Math.round((correct / graded.length) * 100) : null };
  });

  const csv = toCsv([
    ["Candidate", "Reference", "Status", "Score", "Max", "%", "Result", "Submitted"],
    ...list.map((a) => {
      const pct = a.score !== null && a.max_score ? Math.round((Number(a.score) / Number(a.max_score)) * 1000) / 10 : "";
      return [
        (a.exam_candidates as { full_name: string } | null)?.full_name ?? "",
        (a.exam_candidates as { candidate_ref: string | null } | null)?.candidate_ref ?? "",
        a.status,
        a.score !== null ? Number(a.score) : "",
        a.max_score !== null ? Number(a.max_score) : "",
        pct,
        typeof pct === "number" ? (pct >= passMark ? "PASS" : "FAIL") : "",
        a.submitted_at ?? "",
      ];
    }),
    [],
    ["Question", "Type", "Topic", "Difficulty", "Answered", "% Correct"],
    ...qStats.map((q, i) => [`Q${i + 1}`, q.type, q.topic ?? "", q.difficulty, q.answered, q.pct ?? "n/a"]),
  ]);

  return (
    <>
      <PageTitle
        title={exam.title}
        subtitle={`Pass mark ${passMark}% · Results ${settings.results_published ? "published" : "not yet published"}`}
        action={<div className="flex gap-2 print:hidden"><ExportButton filename={`exam-${exam.access_code}.csv`} csv={csv} /><PrintButton /></div>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Registered candidates" value={candidateTotal ?? 0} />
        <StatCard label="Submitted" value={submitted.length} hint={`${list.filter((a) => a.status === "in_progress").length} still in progress`} />
        <StatCard label="Average" value={`${avgPct.toFixed(1)}%`} />
        <StatCard label="Pass rate" value={submitted.length ? `${Math.round((passCount / submitted.length) * 100)}%` : "—"} hint={`${passCount}/${submitted.length} passed`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Candidate results</h2>
          <div className="mt-3 max-h-[560px] overflow-y-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-2 font-medium">Candidate</th>
                  <th className="py-2 pr-2 font-medium">Score</th>
                  <th className="py-2 pr-2 font-medium">%</th>
                  <th className="py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const pct = a.score !== null && a.max_score ? (Number(a.score) / Number(a.max_score)) * 100 : null;
                  return (
                    <tr key={a.id} className="border-b border-evergreen-900/5">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{(a.exam_candidates as { full_name: string } | null)?.full_name}</span>
                        <span className="block text-xs text-ink-soft">{a.status.replace(/_/g, " ")}{a.submitted_at ? ` · ${fmtDateTime(a.submitted_at)}` : ""}</span>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{a.score !== null ? `${Number(a.score)}/${Number(a.max_score ?? 0)}` : "—"}</td>
                      <td className="py-2 pr-2 tabular-nums">{pct !== null ? `${pct.toFixed(0)}%` : "—"}</td>
                      <td className="py-2">{pct !== null ? <Badge tone={pct >= passMark ? "green" : "red"}>{pct >= passMark ? "PASS" : "FAIL"}</Badge> : <Badge tone="gray">Pending</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length === 0 && <p className="py-3 text-sm text-ink-soft">No attempts yet.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Question &amp; topic analysis</h2>
          <div className="mt-3 space-y-3">
            {qStats.map((q, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 flex-1 text-sm font-medium"><span className="text-ink-soft">Q{i + 1}.</span> <MathText text={q.prompt} /></p>
                  {q.pct !== null ? <Badge tone={q.pct >= 70 ? "green" : q.pct >= 40 ? "amber" : "red"}>{q.pct}%</Badge> : <Badge tone="gray">manual</Badge>}
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
