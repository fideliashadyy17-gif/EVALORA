import { Badge, Button, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Award, Eye, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResultsTab } from "../[id]/tabs/ResultsTab";
import { StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Competition results" };
export const dynamic = "force-dynamic";

interface CompetitionRow {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  quiz_id: string | null;
  session_id: string | null;
  results_published: boolean;
  organizations: { name: string } | null;
}

const round = (n: number) => Math.round(n * 10) / 10;

export default async function CompetitionResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string; published?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("competitions")
    .select("id, title, status, organization_id, quiz_id, session_id, results_published, organizations(name)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (sp.published === "yes") query = query.eq("results_published", true);
  if (sp.published === "no") query = query.eq("results_published", false);
  const { data: rawComps } = await query;
  const comps = (rawComps ?? []) as unknown as CompetitionRow[];
  const selected =
    (sp.comp && comps.find((c) => c.id === sp.comp)) ||
    comps.find((c) => c.session_id && c.status === "ended") ||
    comps.find((c) => c.session_id) ||
    comps[0];

  const sessionIds = comps.map((c) => c.session_id).filter((v): v is string => Boolean(v));
  const { data: participants } = sessionIds.length
    ? await admin.from("session_participants").select("session_id, score, status").in("session_id", sessionIds).not("status", "in", '("rejected","blocked")').limit(20000)
    : { data: [] };
  const bySession = new Map<string, { count: number; total: number; top: number; finished: number }>();
  for (const p of participants ?? []) {
    const row = bySession.get(p.session_id) ?? { count: 0, total: 0, top: 0, finished: 0 };
    row.count += 1;
    row.total += Number(p.score);
    row.top = Math.max(row.top, Number(p.score));
    if (p.status === "finished") row.finished += 1;
    bySession.set(p.session_id, row);
  }

  return (
    <>
      <PageTitle
        eyebrow="Live Competitions · Official Rankings & Publication"
        title="Competition rankings & results"
        subtitle="Review individual and organization rankings, validate them, control publication, and export or print the official table."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Competitions" value={comps.length} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="With result sessions" value={comps.filter((c) => c.session_id).length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Published results" value={comps.filter((c) => c.results_published).length} icon={<Eye className="h-5 w-5" />} />
        <StatCard label="Participants ranked" value={(participants ?? []).length} icon={<Award className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block min-w-[320px] flex-1">
          <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Competition</span>
          <Select name="comp" defaultValue={selected?.id ?? ""}>
            {comps.map((c) => (
              <option key={c.id} value={c.id}>{c.title} — {c.organizations?.name ?? "Organization"} ({c.status})</option>
            ))}
          </Select>
        </label>
        <Select name="published" defaultValue={sp.published ?? ""} className="w-48" aria-label="Publication filter">
          <option value="">All publication states</option>
          <option value="yes">Published</option>
          <option value="no">Not published</option>
        </Select>
        <Button type="submit" variant="outline">Open results</Button>
      </form>

      {selected ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-evergreen-950">{selected.title}</h2>
            <StatusBadge status={selected.status} />
            <Badge tone={selected.results_published ? "green" : "amber"}>{selected.results_published ? "Results published" : "Results under review"}</Badge>
            <Link href={`/admin/competitions/${selected.id}?tab=results`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Open in competition workspace →</Link>
          </div>
          <ResultsTab comp={selected} sp={sp} />
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No competitions exist yet.</p>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">All competition result states</h2>
        <div className="mt-3">
          {comps.length === 0 ? (
            <p className="text-sm text-ink-soft">No competitions match.</p>
          ) : (
            <Table head={["Competition", "Host", "Participants", "Average", "Top score", "Finished", "Publication", "Open"]}>
              {comps.map((c) => {
                const stats = c.session_id ? bySession.get(c.session_id) : undefined;
                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.title}<span className="block text-xs font-normal capitalize text-ink-soft">{c.status}</span></td>
                    <td className="text-ink-soft">{c.organizations?.name ?? "—"}</td>
                    <td className="tabular-nums">{stats?.count ?? 0}</td>
                    <td className="tabular-nums">{stats?.count ? round(stats.total / stats.count) : "—"}</td>
                    <td className="tabular-nums">{stats?.count ? stats.top : "—"}</td>
                    <td className="tabular-nums">{stats?.finished ?? 0}</td>
                    <td><Badge tone={c.results_published ? "green" : "amber"}>{c.results_published ? "Published" : "Review"}</Badge></td>
                    <td><Link href={`/admin/competitions/results?comp=${c.id}`} className="font-medium text-evergreen-700 hover:underline">Rankings →</Link></td>
                  </tr>
                );
              })}
            </Table>
          )}
        </div>
      </section>
    </>
  );
}
