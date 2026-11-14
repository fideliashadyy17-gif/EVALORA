import { Badge, Button, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CalendarClock, FileCheck2, PlayCircle, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "../../actions/orgs";
import { Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Quiz assignments" };
export const dynamic = "force-dynamic";

export default async function QuizAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; status?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let sessionQuery = admin
    .from("quiz_sessions")
    .select("*, quizzes(title, status), organizations(name), session_participants(count)")
    .order("created_at", { ascending: false })
    .limit(250);
  if (sp.org) sessionQuery = sessionQuery.eq("organization_id", sp.org);
  if (sp.status) sessionQuery = sessionQuery.eq("status", sp.status);

  let compQuery = admin
    .from("competitions")
    .select("id, title, status, starts_at, quiz_id, organization_id, quizzes(title), organizations(name)")
    .not("quiz_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.org) compQuery = compQuery.eq("organization_id", sp.org);

  let examQuery = admin
    .from("exams")
    .select("id, title, status, starts_at, ends_at, duration_minutes, quiz_id, organization_id, quizzes(title), organizations(name), exam_candidates(count)")
    .not("quiz_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.org) examQuery = examQuery.eq("organization_id", sp.org);

  const [{ data: sessions }, { data: competitions }, { data: exams }, { data: orgs }] = await Promise.all([
    sessionQuery,
    compQuery,
    examQuery,
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Delivery Channels"
        title="Quiz assignments"
        subtitle="A quiz reaches learners in three controlled ways: a hosted quiz session, a live competition, or a proctored examination. This page brings every assignment channel together without duplicating data."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Quiz sessions" value={(sessions ?? []).length} icon={<PlayCircle className="h-5 w-5" />} />
        <StatCard label="Live / lobby sessions" value={(sessions ?? []).filter((s) => ["live", "lobby", "paused"].includes(s.status)).length} icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label="Competition assignments" value={(competitions ?? []).length} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Examination assignments" value={(exams ?? []).length} icon={<FileCheck2 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <Select name="org" defaultValue={sp.org ?? ""} className="min-w-[240px]" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Session status">
          <option value="">All session statuses</option>
          <option value="lobby">Lobby</option>
          <option value="live">Live</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <Section title="Hosted quiz sessions" hint="Synchronized and self-paced runs. Open the quiz workspace to create a new session or host an existing lobby.">
        {(sessions ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No quiz sessions match.</p>
        ) : (
          <Table head={["Session / quiz", "Organization", "Mode", "Join code", "Participants", "Status", "Created", "Actions"]}>
            {(sessions ?? []).map((s) => {
              const quiz = s.quizzes as unknown as { title: string; status: string } | null;
              const org = s.organizations as unknown as { name: string } | null;
              return (
                <tr key={s.id}>
                  <td><span className="font-medium text-evergreen-950">{s.title || quiz?.title || "Quiz session"}</span><span className="block text-xs text-ink-soft">{quiz?.title} · {quiz?.status}</span></td>
                  <td className="text-ink-soft">{org?.name ?? "—"}</td>
                  <td><Badge tone="gray">{String(s.mode).replace(/_/g, " ")}</Badge></td>
                  <td className="font-mono font-semibold">{s.join_code}</td>
                  <td className="tabular-nums">{(s.session_participants as { count: number }[] | null)?.[0]?.count ?? 0}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="text-ink-soft">{fmtDateTime(s.created_at)}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link href={`/admin/quizzes/results?session=${s.id}`} className="font-medium text-evergreen-700 hover:underline">Results</Link>
                      <form action={enterOrgWorkspace}>
                        <input type="hidden" name="organization_id" value={s.organization_id} />
                        <input type="hidden" name="next" value={`/dashboard/quizzes/${s.quiz_id}`} />
                        <button className="font-medium text-evergreen-700 hover:underline">Host / manage</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Competition assignments">
          {(competitions ?? []).length === 0 ? (
            <p className="text-sm text-ink-soft">No competitions are linked to a quiz under this filter.</p>
          ) : (
            <Table head={["Competition", "Quiz", "Status", "Start"]}>
              {(competitions ?? []).map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/admin/competitions/${c.id}`} className="font-medium text-evergreen-800 hover:underline">{c.title}</Link><span className="block text-xs text-ink-soft">{(c.organizations as unknown as { name?: string } | null)?.name}</span></td>
                  <td className="text-ink-soft">{(c.quizzes as unknown as { title?: string } | null)?.title ?? "—"}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="text-ink-soft">{c.starts_at ? fmtDateTime(c.starts_at) : "Not scheduled"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Examination assignments">
          {(exams ?? []).length === 0 ? (
            <p className="text-sm text-ink-soft">No examinations are linked to a quiz under this filter.</p>
          ) : (
            <Table head={["Examination", "Quiz", "Candidates", "Window / duration"]}>
              {(exams ?? []).map((e) => (
                <tr key={e.id}>
                  <td><Link href={`/admin/examinations?exam=${e.id}`} className="font-medium text-evergreen-800 hover:underline">{e.title}</Link><span className="block text-xs text-ink-soft">{(e.organizations as unknown as { name?: string } | null)?.name} · {e.status}</span></td>
                  <td className="text-ink-soft">{(e.quizzes as unknown as { title?: string } | null)?.title ?? "—"}</td>
                  <td className="tabular-nums">{(e.exam_candidates as { count: number }[] | null)?.[0]?.count ?? 0}</td>
                  <td className="text-ink-soft">{e.starts_at ? fmtDateTime(e.starts_at) : "No start"} · {e.duration_minutes} min</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>
    </>
  );
}
