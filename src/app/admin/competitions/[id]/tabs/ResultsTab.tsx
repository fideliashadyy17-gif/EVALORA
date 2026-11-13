import { Button, Card } from "@/components/ui";
import { ExportButton, PrintButton, ExportExcelButton, ExportWordButton } from "@/components/ExportTools";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import Link from "next/link";
import { setResultsPublished } from "../../../actions/competitions";
import { Notice, StatusBadge, Table } from "../../../ui";
import type { DocxReport } from "@/lib/docxExport";
import { MYP_CRITERIA, criterionOfConfig, formatCriterionStats, participantCriterionStats, sumCriterionStats, type CriterionQuestion } from "@/lib/examResults";

interface CompRow {
  id: string;
  organization_id: string;
  session_id: string | null;
  quiz_id: string | null;
  results_published: boolean;
  status: string;
  title?: string | null;
}

export async function ResultsTab({ comp, sp }: { comp: CompRow; sp: { ok?: string; e?: string } }) {
  const admin = createAdminClient();

  if (!comp.session_id) {
    return (
      <Card className="p-8 text-center">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">No results yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
          Results appear here once the live session has run. Start the session from the Overview tab,
          then return to validate and publish the rankings.
        </p>
      </Card>
    );
  }

  const [{ data: participants }, { data: answers }, { data: regs }, { data: questions }] = await Promise.all([
    admin
      .from("session_participants")
      .select("id, display_name, participant_ref, score, status")
      .eq("session_id", comp.session_id)
      .not("status", "in", '("rejected","blocked")')
      .order("score", { ascending: false })
      .limit(500),
    admin
      .from("participant_answers")
      .select("participant_id, question_id, is_correct, points_awarded")
      .eq("session_id", comp.session_id),
    admin
      .from("competition_registrations")
      .select("participant_id, organizations(name), classes(name)")
      .eq("competition_id", comp.id)
      .not("participant_id", "is", null),
    comp.quiz_id
      ? admin
          .from("quiz_questions")
          .select("question_id, points, position, questions(config, points)")
          .eq("quiz_id", comp.quiz_id)
          .order("position")
      : Promise.resolve({ data: [] }),
  ]);

  const stats = new Map<string, { answered: number; correct: number }>();
  for (const a of answers ?? []) {
    const s = stats.get(a.participant_id) ?? { answered: 0, correct: 0 };
    s.answered++;
    if (a.is_correct) s.correct++;
    stats.set(a.participant_id, s);
  }
  const regByParticipant = new Map(
    (regs ?? []).map((r) => [
      r.participant_id as string,
      {
        org: (r.organizations as unknown as { name: string } | null)?.name ?? null,
        cls: (r.classes as unknown as { name: string } | null)?.name ?? null,
      },
    ]),
  );

  const byOrg = new Map<string, { participants: number; totalScore: number; best: number; ids: string[] }>();
  for (const p of participants ?? []) {
    const org = regByParticipant.get(p.id)?.org ?? "Independent / unassigned";
    const row = byOrg.get(org) ?? { participants: 0, totalScore: 0, best: 0, ids: [] };
    row.ids.push(p.id);
    row.participants++;
    row.totalScore += Number(p.score);
    row.best = Math.max(row.best, Number(p.score));
    byOrg.set(org, row);
  }
  const orgRanking = [...byOrg.entries()]
    .map(([org, v]) => ({ org, ...v, avg: v.participants ? Math.round(v.totalScore / v.participants) : 0 }))
    .sort((a, b) => b.avg - a.avg || b.totalScore - a.totalScore);

  // --- MYP Criterion Aggregation ---
  // The paper: each question's criterion (questions.config.myp_criterion) and the
  // marks it carries in this quiz (the quiz's own override, else the question's).
  const paper: CriterionQuestion[] = ((questions ?? []) as unknown as {
    question_id: string;
    points: number | null;
    questions: { config: Record<string, unknown> | null; points: number | null } | null;
  }[]).map((row) => ({
    question_id: row.question_id,
    criterion: criterionOfConfig(row.questions?.config),
    points: row.points ?? row.questions?.points ?? 0,
  }));
  // One breakdown per participant, one per organisation, and one for the session.
  const criteriaByParticipant = participantCriterionStats((participants ?? []).map((p) => p.id), answers ?? [], paper);
  const criterionStats = sumCriterionStats(criteriaByParticipant.values(), paper);
  const criteriaByOrg = new Map(
    [...byOrg.entries()].map(([org, v]) => [org, sumCriterionStats(v.ids.map((id) => criteriaByParticipant.get(id)), paper)]),
  );
  const criterionHead = MYP_CRITERIA.map((c) => `Criterion ${c}`);
  const criterionCells = (id: string) => MYP_CRITERIA.map((c) => formatCriterionStats(criteriaByParticipant.get(id)?.[c]));

  const rankingHead = ["Rank", "Participant", "Ref", "Organization", "Class", "Score", "Answered", "Correct", "Status", ...criterionHead];
  const rankingRows = (participants ?? []).map((p, i) => {
    const s = stats.get(p.id) ?? { answered: 0, correct: 0 };
    const reg = regByParticipant.get(p.id);
    return [i + 1, p.display_name, p.participant_ref ?? "", reg?.org ?? "", reg?.cls ?? "", Number(p.score), s.answered, s.correct, p.status, ...criterionCells(p.id)];
  });

  const csv = toCsv([rankingHead, ...rankingRows]);

  // Excel Data
  const excelData = [rankingHead, ...rankingRows];

  // Word document (built as data; every value is escaped by the .docx builder)
  const wordReport: DocxReport = {
    title: comp.title ? `Competition Results: ${comp.title}` : "Competition Results",
    subtitle: `Publication state: ${comp.results_published ? "Published" : "Under review (not published)"} · Generated ${fmtDateTime(new Date().toISOString())}`,
    sections: [
      {
        heading: "Individual Ranking",
        emptyNote: "Nobody has joined the session yet.",
        table: {
          head: ["#", "Participant", "Organization / class", "Score", "Answered", "Correct", "Status", ...criterionHead],
          rows: (participants ?? []).map((p, i) => {
            const s = stats.get(p.id) ?? { answered: 0, correct: 0 };
            const reg = regByParticipant.get(p.id);
            return [
              `${i + 1}${i === 0 ? " 🥇" : i === 1 ? " 🥈" : i === 2 ? " 🥉" : ""}`,
              `${p.display_name}${p.participant_ref ? `\nref ${p.participant_ref}` : ""}`,
              `${reg?.org ?? "—"}${reg?.cls ? `\n${reg.cls}` : ""}`,
              Number(p.score).toLocaleString(),
              s.answered,
              s.correct,
              p.status,
              ...criterionCells(p.id),
            ];
          }),
        },
      },
      {
        heading: "Organization Ranking",
        table: {
          head: ["#", "Organization", "Participants", "Average score", "Best score", "Total", ...criterionHead],
          rows: orgRanking.map((r, i) => [
            i + 1, r.org, r.participants, r.avg.toLocaleString(), r.best.toLocaleString(), r.totalScore.toLocaleString(),
            ...MYP_CRITERIA.map((c) => formatCriterionStats(criteriaByOrg.get(r.org)?.[c], "percent")),
          ]),
        },
      },
      {
        heading: "Criterion Breakdown",
        paragraphs: ["All participants together: marks awarded out of the marks available on each criterion."],
        bullets: [
          `Criterion A (Knowing/Understanding): ${formatCriterionStats(criterionStats.A)}`,
          `Criterion B (Investigating Patterns): ${formatCriterionStats(criterionStats.B)}`,
          `Criterion C (Communicating): ${formatCriterionStats(criterionStats.C)}`,
          `Criterion D (Applying Mathematics): ${formatCriterionStats(criterionStats.D)}`,
        ],
      },
    ],
  };

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          results_published: "Results published — rankings are now official.",
          results_unpublished: "Results unpublished.",
        }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-soft">
          Publication state:{" "}
          <strong className={comp.results_published ? "text-evergreen-700" : "text-amber-700"}>
            {comp.results_published ? "Published" : "Under review (not published)"}
          </strong>
        </span>
        <form action={setResultsPublished}>
          <input type="hidden" name="id" value={comp.id} />
          <input type="hidden" name="published" value={comp.results_published ? "0" : "1"} />
          <Button type="submit" variant={comp.results_published ? "outline" : "gold"}>
            {comp.results_published ? "Unpublish results" : "Validate & publish rankings"}
          </Button>
        </form>

        <ExportButton filename="competition-results.csv" csv={csv} label="Export CSV" />
        <ExportExcelButton filename="competition-results.xlsx" data={excelData} label="Export Excel" />
        <ExportWordButton filename="competition-results.docx" report={wordReport} label="Export Word" />
        <PrintButton />
        <Link href={`/dashboard/reports/session/${comp.session_id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
          Full session analytics (workspace) →
        </Link>
      </div>

      <h2 className="font-display text-lg font-semibold text-evergreen-950">Individual ranking</h2>
      <div className="mt-3">
        {(participants ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">Nobody has joined the session yet.</p>
        ) : (
          <Table head={["#", "Participant", "Organization / class", "Score", "Answered", "Correct", "Status", ...criterionHead]}>
            {(participants ?? []).map((p, i) => {
              const s = stats.get(p.id) ?? { answered: 0, correct: 0 };
              const reg = regByParticipant.get(p.id);
              return (
                <tr key={p.id} className={i < 3 ? "bg-gold-50" : undefined}>
                  <td className="font-display font-semibold">{i + 1}{i === 0 ? " 🥇" : i === 1 ? " 🥈" : i === 2 ? " 🥉" : ""}</td>
                  <td>
                    <span className="font-medium">{p.display_name}</span>
                    {p.participant_ref && <span className="block text-xs text-ink-soft">ref {p.participant_ref}</span>}
                  </td>
                  <td className="text-xs">{reg?.org ?? "—"}{reg?.cls && <span className="block">{reg.cls}</span>}</td>
                  <td className="font-display text-lg font-semibold tabular-nums">{Number(p.score).toLocaleString()}</td>
                  <td className="tabular-nums">{s.answered}</td>
                  <td className="tabular-nums">{s.correct}</td>
                  <td><StatusBadge status={p.status} /></td>

                  {/* Criterion Columns: this participant's marks on each criterion */}
                  {MYP_CRITERIA.map((c) => (
                    <td key={c} className="tabular-nums">{formatCriterionStats(criteriaByParticipant.get(p.id)?.[c], "marks")}</td>
                  ))}
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-evergreen-950">Organization ranking (school-vs-school)</h2>
      <p className="mt-0.5 text-sm text-ink-soft">Ranked by average participant score. Generated {fmtDateTime(new Date().toISOString())}.</p>
      <div className="mt-3">
        <Table head={["#", "Organization", "Participants", "Average score", "Best score", "Total", ...criterionHead]}>
          {orgRanking.map((r, i) => (
            <tr key={r.org}>
              <td className="font-display font-semibold">{i + 1}</td>
              <td className="font-medium">{r.org}</td>
              <td className="tabular-nums">{r.participants}</td>
              <td className="tabular-nums">{r.avg.toLocaleString()}</td>
              <td className="tabular-nums">{r.best.toLocaleString()}</td>
              <td className="tabular-nums">{r.totalScore.toLocaleString()}</td>

              {/* This organisation's criterion averages */}
              {MYP_CRITERIA.map((c) => (
                <td key={c} className="tabular-nums">{formatCriterionStats(criteriaByOrg.get(r.org)?.[c], "percent")}</td>
              ))}
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
