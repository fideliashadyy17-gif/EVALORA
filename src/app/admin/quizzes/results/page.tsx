import { Badge, Button, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { Award, CheckCircle2, PlayCircle, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Quiz results" };
export const dynamic = "force-dynamic";

const round = (n: number) => Math.round(n * 10) / 10;

export default async function QuizResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; status?: string; session?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let sessionQuery = admin
    .from("quiz_sessions")
    .select("*, quizzes(title), organizations(name), session_participants(id, score, status)")
    .order("created_at", { ascending: false })
    .limit(250);
  if (sp.org) sessionQuery = sessionQuery.eq("organization_id", sp.org);
  if (sp.status) sessionQuery = sessionQuery.eq("status", sp.status);

  const [{ data: sessions }, { data: orgs }] = await Promise.all([
    sessionQuery,
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);

  const selected = (sessions ?? []).find((s) => s.id === sp.session);
  let leaderboard: {
    id: string; display_name: string; participant_ref: string | null; score: number;
    status: string; current_index: number; answered: number; correct: number; joined_at: string;
  }[] = [];
  let questionCount = 0;

  if (selected) {
    const [{ data: participants }, { data: answers }, { count }] = await Promise.all([
      admin.from("session_participants").select("*").eq("session_id", selected.id).order("score", { ascending: false }).limit(1000),
      admin.from("participant_answers").select("participant_id, is_correct").eq("session_id", selected.id).limit(20000),
      admin.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", selected.quiz_id),
    ]);
    questionCount = count ?? 0;
    const byParticipant = new Map<string, { answered: number; correct: number }>();
    for (const a of answers ?? []) {
      const row = byParticipant.get(a.participant_id) ?? { answered: 0, correct: 0 };
      row.answered += 1;
      if (a.is_correct) row.correct += 1;
      byParticipant.set(a.participant_id, row);
    }
    leaderboard = (participants ?? []).map((p) => ({
      ...p,
      answered: byParticipant.get(p.id)?.answered ?? 0,
      correct: byParticipant.get(p.id)?.correct ?? 0,
    }));
  }

  const csv = selected
    ? toCsv([
        ["Rank", "Participant", "Reference", "Score", "Answered", "Correct", "Completion %", "Status"],
        ...leaderboard.map((p, i) => [
          i + 1, p.display_name, p.participant_ref ?? "", p.score, p.answered, p.correct,
          questionCount ? round((p.answered / questionCount) * 100) : 0, p.status,
        ]),
      ])
    : "";

  const allParticipantScores = (sessions ?? []).flatMap((s) =>
    ((s.session_participants as { score: number }[]) ?? []).map((p) => Number(p.score)),
  );

  return (
    <>
      <PageTitle
        title="Quiz results"
        subtitle="Session-level scores and participant leaderboards for hosted quizzes. Competition rankings and examination marks have their own controlled result centers."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions shown" value={(sessions ?? []).length} icon={<PlayCircle className="h-5 w-5" />} />
        <StatCard label="Participants" value={allParticipantScores.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Average score" value={allParticipantScores.length ? round(allParticipantScores.reduce((a, b) => a + b, 0) / allParticipantScores.length) : 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Highest score" value={allParticipantScores.length ? Math.max(...allParticipantScores) : 0} icon={<Award className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <Select name="org" defaultValue={sp.org ?? ""} className="min-w-[240px]" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Session status">
          <option value="">All statuses</option>
          <option value="lobby">Lobby</option>
          <option value="live">Live</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      {selected && (
        <Section
          title={`Leaderboard — ${selected.title || "Selected session"}`}
          hint={`${questionCount} questions in the linked quiz. CSV opens directly in Excel.`}
        >
          <div className="mb-4">
            <ExportButton filename={`quiz-results-${selected.id}.csv`} csv={csv} label="Export leaderboard (CSV / Excel)" />
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-ink-soft">No participants have joined this session yet.</p>
          ) : (
            <Table head={["Rank", "Participant", "Reference", "Score", "Answered", "Correct", "Progress", "Status"]}>
              {leaderboard.map((p, i) => (
                <tr key={p.id}>
                  <td className="font-display font-bold">{i + 1}</td>
                  <td className="font-medium">{p.display_name}</td>
                  <td className="text-ink-soft">{p.participant_ref ?? "—"}</td>
                  <td className="font-semibold tabular-nums">{p.score}</td>
                  <td className="tabular-nums">{p.answered}</td>
                  <td className="tabular-nums">{p.correct}</td>
                  <td className="tabular-nums">{questionCount ? round((p.answered / questionCount) * 100) : 0}%</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      <Section title="Sessions">
        {(sessions ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No quiz sessions match.</p>
        ) : (
          <Table head={["Session / quiz", "Organization", "Participants", "Average", "Top score", "Status", "When", "Leaderboard"]}>
            {(sessions ?? []).map((s) => {
              const participants = (s.session_participants as { score: number; status: string }[]) ?? [];
              const scores = participants.map((p) => Number(p.score));
              return (
                <tr key={s.id}>
                  <td><span className="font-medium text-evergreen-950">{s.title}</span><span className="block text-xs text-ink-soft">{(s.quizzes as unknown as { title?: string } | null)?.title}</span></td>
                  <td className="text-ink-soft">{(s.organizations as unknown as { name?: string } | null)?.name ?? "—"}</td>
                  <td className="tabular-nums">{participants.length}<span className="block text-xs text-ink-soft">{participants.filter((p) => p.status === "finished").length} finished</span></td>
                  <td className="tabular-nums">{scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : "—"}</td>
                  <td className="tabular-nums">{scores.length ? Math.max(...scores) : "—"}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="text-ink-soft">{fmtDateTime(s.created_at)}{s.ended_at ? <span className="block text-xs">Ended {fmtDateTime(s.ended_at)}</span> : null}</td>
                  <td><Link href={`/admin/quizzes/results?session=${s.id}`} className="font-medium text-evergreen-700 hover:underline">View →</Link></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <p className="mt-4 flex flex-wrap gap-2 text-sm">
        <Badge tone="gold">Also available</Badge>
        <Link href="/admin/competitions/results" className="font-medium text-evergreen-700 hover:underline">Competition rankings</Link>
        <span>·</span>
        <Link href="/admin/examinations/results" className="font-medium text-evergreen-700 hover:underline">Examination results</Link>
      </p>
    </>
  );
}
