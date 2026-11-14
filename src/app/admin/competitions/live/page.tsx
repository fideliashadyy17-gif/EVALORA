import { Badge, Button, ButtonLink, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { publicScreenPath } from "@/lib/liveDisplayToken";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Activity, CheckCircle2, Radio, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { adminEndSession } from "../../actions";
import { setCompetitionStatus, startCompetitionSession } from "../../actions/competitions";
import { ConfirmField, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Live competition monitoring" };
export const dynamic = "force-dynamic";

interface CompetitionRow {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  quiz_id: string | null;
  session_id: string | null;
  starts_at: string | null;
  organizations: { name: string } | null;
  quizzes: { title: string; status: string } | null;
}

interface SessionRow {
  id: string;
  quiz_id: string;
  organization_id: string;
  join_code: string;
  title: string | null;
  mode: string;
  status: string;
  current_question_index: number;
  display_token_version?: number;
  created_at: string;
  ended_at: string | null;
}

interface ParticipantRow {
  session_id: string;
  status: string;
  score: number;
  last_seen_at: string;
}

export default async function LiveCompetitionMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; view?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let compQuery = admin
    .from("competitions")
    .select("id, title, status, organization_id, quiz_id, session_id, starts_at, organizations(name), quizzes(title, status)")
    .in("status", ["live", "paused", "scheduled", "published"])
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (sp.org) compQuery = compQuery.eq("organization_id", sp.org);
  if (sp.view === "active") compQuery = compQuery.in("status", ["live", "paused"]);
  if (sp.view === "ready") compQuery = compQuery.in("status", ["scheduled", "published"]);

  const [{ data: rawComps }, { data: orgs }, { data: rawStandaloneSessions }] = await Promise.all([
    compQuery,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin
      .from("quiz_sessions")
      .select("*, organizations(name), quizzes(title), session_participants(count)")
      .in("status", ["lobby", "live", "paused"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const comps = (rawComps ?? []) as unknown as CompetitionRow[];
  const sessionIds = comps.map((c) => c.session_id).filter((v): v is string => Boolean(v));
  const quizIds = [...new Set(comps.map((c) => c.quiz_id).filter((v): v is string => Boolean(v)))];

  const [{ data: rawSessions }, { data: rawParticipants }, { data: rawAnswers }, { data: rawQuestions }] = await Promise.all([
    sessionIds.length
      ? admin.from("quiz_sessions").select("*").in("id", sessionIds)
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? admin.from("session_participants").select("session_id, status, score, last_seen_at").in("session_id", sessionIds).limit(20000)
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? admin.from("participant_answers").select("session_id, is_correct").in("session_id", sessionIds).limit(20000)
      : Promise.resolve({ data: [] }),
    quizIds.length
      ? admin.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds).limit(20000)
      : Promise.resolve({ data: [] }),
  ]);

  const sessionById = new Map(((rawSessions ?? []) as SessionRow[]).map((s) => [s.id, s]));
  const participants = (rawParticipants ?? []) as ParticipantRow[];
  const answers = (rawAnswers ?? []) as { session_id: string; is_correct: boolean | null }[];
  const bySession = new Map<string, ParticipantRow[]>();
  for (const p of participants) {
    const list = bySession.get(p.session_id) ?? [];
    list.push(p);
    bySession.set(p.session_id, list);
  }
  const answersBySession = new Map<string, number>();
  for (const a of answers) answersBySession.set(a.session_id, (answersBySession.get(a.session_id) ?? 0) + 1);
  const questionCounts = new Map<string, number>();
  for (const q of (rawQuestions ?? []) as { quiz_id: string }[]) {
    questionCounts.set(q.quiz_id, (questionCounts.get(q.quiz_id) ?? 0) + 1);
  }

  const connectedCutoff = Date.now() - 90_000;
  const activeComps = comps.filter((c) => ["live", "paused"].includes(c.status));
  const connected = participants.filter((p) => Date.parse(p.last_seen_at) >= connectedCutoff).length;
  const finished = participants.filter((p) => p.status === "finished").length;
  const linkedSessionIds = new Set(sessionIds);
  const standaloneSessions = (rawStandaloneSessions ?? []).filter((s) => !linkedSessionIds.has(s.id));

  const statusForm = (c: CompetitionRow, status: string, label: string, variant: "primary" | "gold" | "outline" | "danger" = "outline") => (
    <form key={`${c.id}-${status}`} action={setCompetitionStatus}>
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant} className="px-3 py-2 text-xs">{label}</Button>
    </form>
  );

  return (
    <>
      <PageTitle
        eyebrow="Live Competitions · Real-Time Operations Room"
        title="Live competition monitoring"
        subtitle="Monitor live and upcoming competitions, participant connection/progress, answer volume and lifecycle controls from one operations room. Refresh the page for the latest server snapshot."
        action={<ButtonLink href="/admin/competitions/live" variant="gold">↻ Refresh snapshot</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live / paused competitions" value={activeComps.length} icon={<Radio className="h-5 w-5" />} />
        <StatCard label="Participants in linked sessions" value={participants.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Connected in last 90 seconds" value={connected} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Finished participants" value={finished} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <Select name="org" defaultValue={sp.org ?? ""} className="min-w-[240px]" aria-label="Host organization">
          <option value="">All host organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="view" defaultValue={sp.view ?? ""} className="w-52" aria-label="Monitoring view">
          <option value="">Active + ready</option>
          <option value="active">Live / paused only</option>
          <option value="ready">Published / scheduled</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.org || sp.view) && (
          <Link href="/admin/competitions/live" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {comps.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No live or ready-to-start competitions match. Publish or schedule a competition to bring it into the operations room.
        </p>
      ) : (
        <Table head={["Competition", "Session", "Participants / progress", "Answers", "Status", "Controls"]}>
          {comps.map((c) => {
            const session = c.session_id ? sessionById.get(c.session_id) : undefined;
            const plist = session ? bySession.get(session.id) ?? [] : [];
            const connectedHere = plist.filter((p) => Date.parse(p.last_seen_at) >= connectedCutoff).length;
            const finishedHere = plist.filter((p) => p.status === "finished").length;
            const questions = c.quiz_id ? questionCounts.get(c.quiz_id) ?? 0 : 0;
            return (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/competitions/${c.id}`} className="font-semibold text-evergreen-950 hover:underline">{c.title}</Link>
                  <span className="block text-xs text-ink-soft">
                    {c.organizations?.name ?? "—"} · {c.quizzes?.title ?? "No quiz attached"}
                    {c.starts_at ? ` · starts ${fmtDateTime(c.starts_at)}` : ""}
                  </span>
                </td>
                <td>
                  {session ? (
                    <>
                      <span className="font-mono text-base font-bold tracking-widest">{session.join_code}</span>
                      <span className="block text-xs capitalize text-ink-soft">
                        {session.mode.replace(/_/g, " ")} · {session.status}
                        {questions ? ` · question ${Math.max(1, session.current_question_index + 1)} of ${questions}` : ""}
                      </span>
                    </>
                  ) : <Badge tone="amber">Not started</Badge>}
                </td>
                <td className="tabular-nums">
                  {plist.length} joined
                  <span className="block text-xs text-ink-soft">{connectedHere} connected · {finishedHere} finished</span>
                </td>
                <td className="tabular-nums">{session ? answersBySession.get(session.id) ?? 0 : 0}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>
                  <div className="flex max-w-[360px] flex-wrap gap-2">
                    <form action={startCompetitionSession}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="gold" className="px-3 py-2 text-xs" disabled={!c.quiz_id || questions === 0}>
                        {session ? "Open host console" : "Start live session"}
                      </Button>
                    </form>
                    {c.status === "live" && statusForm(c, "paused", "Pause")}
                    {c.status === "paused" && statusForm(c, "live", "Resume", "primary")}
                    {["live", "paused"].includes(c.status) && statusForm(c, "ended", "End", "danger")}
                    {session && (
                      <>
                        <Link href={`${publicScreenPath(c.id, session.id, session.display_token_version ?? 1)}&host=1`} target="_blank" className="inline-flex items-center rounded-lg border border-evergreen-700/50 bg-white px-3 py-2 text-xs font-medium text-evergreen-800 hover:bg-evergreen-50">Live screen ↗</Link>
                        <Link href={`/join?code=${session.join_code}`} target="_blank" className="inline-flex items-center rounded-lg border border-evergreen-700/50 bg-white px-3 py-2 text-xs font-medium text-evergreen-800 hover:bg-evergreen-50">Participant join</Link>
                      </>
                    )}
                    <Link href={`/admin/competitions/${c.id}`} className="inline-flex items-center px-1 py-2 text-xs font-medium text-evergreen-700 hover:underline">Full control room →</Link>
                  </div>
                  {!c.quiz_id && <p className="mt-1 text-xs text-amber-800">Attach a quiz in Settings before starting.</p>}
                  {c.quiz_id && questions === 0 && <p className="mt-1 text-xs text-amber-800">Attached quiz has no questions.</p>}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <Section title="Other active quiz sessions" hint="Ad-hoc organization quiz sessions that are not linked to a competition record.">
        {standaloneSessions.length === 0 ? (
          <p className="text-sm text-ink-soft">No other lobby, live or paused quiz sessions are active.</p>
        ) : (
          <Table head={["Session", "Organization", "Code", "Participants", "Status", "Emergency control"]}>
            {standaloneSessions.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.title || (s.quizzes as unknown as { title?: string } | null)?.title || "Quiz session"}<span className="block text-xs font-normal text-ink-soft">{fmtDateTime(s.created_at)}</span></td>
                <td className="text-ink-soft">{(s.organizations as unknown as { name?: string } | null)?.name ?? "—"}</td>
                <td className="font-mono font-bold">{s.join_code}</td>
                <td className="tabular-nums">{(s.session_participants as { count: number }[] | null)?.[0]?.count ?? 0}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>
                  <form action={adminEndSession} className="space-y-2">
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmField label="End this session for everyone" />
                    <Button type="submit" variant="danger" className="px-3 py-2 text-xs">End session</Button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
