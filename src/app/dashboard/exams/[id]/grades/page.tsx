import { Badge, ButtonLink, Card, EmptyState, PageTitle, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { CHANGE_TYPE_LABEL, MODERATION_LABEL, loadGradeHistory, loadModerationHistory } from "@/lib/grading";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Grade history" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "green" | "gold" | "amber" | "red" | "gray"> = {
  marked: "gray",
  regraded: "amber",
  moderated: "gold",
  ai_assisted: "gray",
  published: "green",
  cleared: "red",
};

export default async function ExamGradesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, grades_published_at, settings")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) notFound();

  const [history, moderation] = await Promise.all([
    loadGradeHistory(supabase, org.id, { examId: id, limit: 300 }),
    loadModerationHistory(supabase, org.id, { examId: id, limit: 300 }),
  ]);

  const published = Boolean((exam.settings as Record<string, unknown> | null)?.results_published);
  const adjustments = moderation.filter((m) => m.decision === "adjusted").length;
  const regrades = history.filter((h) => h.change_type === "regraded").length;

  return (
    <>
      <PageTitle
        title="Grade history"
        subtitle={`${exam.title} · every change to a mark is appended, attributed and never rewritten.`}
        action={<ButtonLink href={`/dashboard/exams/${id}`} variant="outline">Back to examination</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recorded changes" value={String(history.length)} />
        <StatCard label="Regrades" value={String(regrades)} />
        <StatCard label="Moderation decisions" value={String(moderation.length)} />
        <StatCard label="Adjusted by moderator" value={String(adjustments)} />
      </div>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={published ? "green" : "gray"}>{published ? "Results released" : "Results not released"}</Badge>
          <p className="text-sm text-ink-soft">
            {exam.grades_published_at
              ? `Released on ${fmtDateTime(exam.grades_published_at)}.`
              : "Marks are visible to staff only until results are released from the examination page."}
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Change log</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Newest first. Each row records the previous and new mark, the person responsible, and the note left at the time.
        </p>
        {history.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No grade changes yet"
              body="Once an answer is marked, regraded or moderated, the change appears here with its before and after values."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Change</th>
                  <th className="py-2 pr-3 font-medium">Question</th>
                  <th className="py-2 pr-3 font-medium">Mark</th>
                  <th className="py-2 pr-3 font-medium">Moderation</th>
                  <th className="py-2 pr-3 font-medium">Actor</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-evergreen-900/5 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-ink-soft">{fmtDateTime(row.created_at)}</td>
                    <td className="py-2 pr-3"><Badge tone={TONE[row.change_type] ?? "gray"}>{CHANGE_TYPE_LABEL[row.change_type] ?? row.change_type}</Badge></td>
                    <td className="py-2 pr-3 max-w-[240px] truncate text-ink-soft">
                      {row.exam_answers?.questions?.prompt ?? "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {row.previous_points === null ? "—" : Number(row.previous_points)}
                      {" → "}
                      {row.new_points === null ? "—" : Number(row.new_points)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-ink-soft">
                      {row.new_moderation ? MODERATION_LABEL[row.new_moderation] ?? row.new_moderation : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-soft">{row.actor_email ?? "system"}</td>
                    <td className="py-2 max-w-[220px] truncate text-xs text-ink-soft">{row.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Moderation decisions</h2>
        <p className="mt-1 text-xs text-ink-soft">
          An adjustment records the mark it replaced; an approval confirms the marker’s mark unchanged.
        </p>
        {moderation.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No moderation decisions recorded on this examination.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-evergreen-900/10 text-left text-ink-soft">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Decision</th>
                  <th className="py-2 pr-3 font-medium">Marks</th>
                  <th className="py-2 pr-3 font-medium">Moderator</th>
                  <th className="py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {moderation.map((row) => (
                  <tr key={row.id} className="border-b border-evergreen-900/5 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-ink-soft">{fmtDateTime(row.created_at)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={row.decision === "adjusted" ? "gold" : row.decision === "returned" ? "red" : "green"}>
                        {MODERATION_LABEL[row.decision] ?? row.decision}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {row.previous_marks === null ? "—" : Number(row.previous_marks)}
                      {row.proposed_marks !== null ? ` → ${Number(row.proposed_marks)}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-soft">{row.moderator_email ?? "—"}</td>
                    <td className="py-2 max-w-[280px] text-xs text-ink-soft">{row.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
