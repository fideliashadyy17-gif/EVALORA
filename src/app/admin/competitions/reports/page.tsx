import { Button, Card, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton, PrintButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { COMPETITION_FORMATS } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { BarChart3, CheckCircle2, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Competition reports" };
export const dynamic = "force-dynamic";

const FORMAT_LABELS = Object.fromEntries(COMPETITION_FORMATS.map((f) => [f.value, f.label]));
const round = (n: number) => Math.round(n * 10) / 10;

interface CompetitionRow {
  id: string;
  title: string;
  status: string;
  format: string;
  organization_id: string;
  quiz_id: string | null;
  session_id: string | null;
  results_published: boolean;
  starts_at: string | null;
  created_at: string;
  organizations: { name: string } | null;
  quizzes: { title: string } | null;
  competition_registrations: { id: string; status: string; source: string }[];
  competition_access_codes: { id: string; is_active: boolean }[];
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  const total = rows.reduce((sum, [, v]) => sum + v, 0);
  return (
    <Card className="p-5">
      <h3 className="font-display font-semibold text-evergreen-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-ink-soft">No data yet.</p>}
        {rows.map(([label, value]) => {
          const pct = total ? Math.round((value / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="mb-1 flex justify-between gap-3 text-sm"><span className="capitalize">{label.replace(/_/g, " ")}</span><span className="tabular-nums text-ink-soft">{value} · {pct}%</span></div>
              <div className="h-2 rounded-full bg-evergreen-900/10"><div className="h-full rounded-full bg-evergreen-600" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default async function CompetitionReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; status?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("competitions")
    .select("id, title, status, format, organization_id, quiz_id, session_id, results_published, starts_at, created_at, organizations(name), quizzes(title), competition_registrations(id, status, source), competition_access_codes(id, is_active)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.status) query = query.eq("status", sp.status);

  const [{ data: rawComps }, { data: orgs }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);
  const comps = (rawComps ?? []) as unknown as CompetitionRow[];
  const sessionIds = comps.map((c) => c.session_id).filter((v): v is string => Boolean(v));

  const [{ data: participants }, { data: answers }] = await Promise.all([
    sessionIds.length
      ? admin.from("session_participants").select("session_id, score, status").in("session_id", sessionIds).not("status", "in", '("rejected","blocked")').limit(20000)
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? admin.from("participant_answers").select("session_id, is_correct").in("session_id", sessionIds).limit(20000)
      : Promise.resolve({ data: [] }),
  ]);

  const pStats = new Map<string, { count: number; total: number; top: number; finished: number }>();
  for (const p of participants ?? []) {
    const row = pStats.get(p.session_id) ?? { count: 0, total: 0, top: 0, finished: 0 };
    row.count += 1;
    row.total += Number(p.score);
    row.top = Math.max(row.top, Number(p.score));
    if (p.status === "finished") row.finished += 1;
    pStats.set(p.session_id, row);
  }
  const aStats = new Map<string, { answered: number; correct: number }>();
  for (const a of answers ?? []) {
    const row = aStats.get(a.session_id) ?? { answered: 0, correct: 0 };
    row.answered += 1;
    if (a.is_correct) row.correct += 1;
    aStats.set(a.session_id, row);
  }

  const reportRows = comps.map((c) => {
    const regs = c.competition_registrations.filter((r) => r.status !== "removed");
    const codes = c.competition_access_codes;
    const p = c.session_id ? pStats.get(c.session_id) : undefined;
    const a = c.session_id ? aStats.get(c.session_id) : undefined;
    return {
      c,
      registrations: regs.length,
      codes: codes.length,
      activeCodes: codes.filter((x) => x.is_active).length,
      participants: p?.count ?? 0,
      finished: p?.finished ?? 0,
      average: p?.count ? round(p.total / p.count) : null,
      top: p?.count ? p.top : null,
      answered: a?.answered ?? 0,
      accuracy: a?.answered ? round((a.correct / a.answered) * 100) : null,
    };
  });

  const by = (key: (c: CompetitionRow) => string) => {
    const m = new Map<string, number>();
    for (const c of comps) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const sourceRows = (() => {
    const m = new Map<string, number>();
    for (const c of comps) for (const r of c.competition_registrations) if (r.status !== "removed") m.set(r.source, (m.get(r.source) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]) as [string, number][];
  })();

  const csv = toCsv([
    ["Competition", "Host organization", "Format", "Status", "Quiz", "Registrations", "Access codes", "Active codes", "Session participants", "Finished", "Average score", "Top score", "Answers", "Accuracy %", "Results published", "Starts"],
    ...reportRows.map((r) => [
      r.c.title, r.c.organizations?.name ?? "", FORMAT_LABELS[r.c.format] ?? r.c.format, r.c.status, r.c.quizzes?.title ?? "",
      r.registrations, r.codes, r.activeCodes, r.participants, r.finished, r.average ?? "", r.top ?? "", r.answered, r.accuracy ?? "",
      r.c.results_published ? "yes" : "no", r.c.starts_at ? fmtDateTime(r.c.starts_at) : "",
    ]),
  ]);

  const totalRegistrations = reportRows.reduce((sum, r) => sum + r.registrations, 0);
  const totalAnswers = reportRows.reduce((sum, r) => sum + r.answered, 0);
  const totalCorrect = [...aStats.values()].reduce((sum, r) => sum + r.correct, 0);

  return (
    <>
      <PageTitle
        eyebrow="Live Competitions · Portfolio Analytics & Export"
        title="Competition reports"
        subtitle="Cross-competition reporting for reach, participation, completion, accuracy and result publication. Export uses Excel-compatible CSV; Print produces a PDF-ready report."
        action={<div className="flex flex-wrap gap-2"><ExportButton filename="competition-report.csv" csv={csv} label="Export report (CSV / Excel)" /><PrintButton /></div>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Competitions" value={comps.length} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Active registrations" value={totalRegistrations} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Answers submitted" value={totalAnswers} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Overall accuracy" value={totalAnswers ? `${round((totalCorrect / totalAnswers) * 100)}%` : "—"} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <Select name="org" defaultValue={sp.org ?? ""} className="min-w-[240px]" aria-label="Host organization">
          <option value="">All host organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Status">
          <option value="">All statuses</option>
          {["draft", "published", "scheduled", "live", "paused", "ended", "cancelled", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Button type="submit" variant="outline">Filter report</Button>
      </form>

      <Section title="Portfolio breakdown">
        <div className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="Competitions by status" rows={by((c) => c.status)} />
          <Breakdown title="Competitions by format" rows={by((c) => FORMAT_LABELS[c.format] ?? c.format)} />
          <Breakdown title="Registrations by source" rows={sourceRows} />
        </div>
      </Section>

      <Section title="Competition performance register">
        {reportRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">No competitions match this report.</p>
        ) : (
          <Table head={["Competition", "Reach", "Session performance", "Accuracy", "Results", "Open"]}>
            {reportRows.map((r) => (
              <tr key={r.c.id}>
                <td>
                  <Link href={`/admin/competitions/${r.c.id}`} className="font-semibold text-evergreen-950 hover:underline">{r.c.title}</Link>
                  <span className="block text-xs text-ink-soft">{r.c.organizations?.name} · {FORMAT_LABELS[r.c.format] ?? r.c.format}</span>
                </td>
                <td className="tabular-nums">{r.registrations} registered<span className="block text-xs text-ink-soft">{r.activeCodes}/{r.codes} codes active</span></td>
                <td className="tabular-nums">{r.participants} joined · {r.finished} finished<span className="block text-xs text-ink-soft">avg {r.average ?? "—"} · top {r.top ?? "—"}</span></td>
                <td className="tabular-nums">{r.accuracy != null ? `${r.accuracy}%` : "—"}<span className="block text-xs text-ink-soft">{r.answered} answers</span></td>
                <td><StatusBadge status={r.c.status} /><span className="block text-xs text-ink-soft">{r.c.results_published ? "Published" : "Not published"}</span></td>
                <td>
                  <div className="flex flex-col gap-1">
                    <Link href={`/admin/competitions/results?comp=${r.c.id}`} className="font-medium text-evergreen-700 hover:underline">Rankings</Link>
                    <Link href={`/admin/competitions/${r.c.id}`} className="text-sm text-evergreen-700 hover:underline">Manage</Link>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
