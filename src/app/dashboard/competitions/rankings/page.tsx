import { Badge, Card, DataTable, EmptyState, PageTitle, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { canOperate } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Award, Trophy } from "lucide-react";

export const metadata: Metadata = { title: "Competition rankings & results" };
export const dynamic = "force-dynamic";

interface ParticipantRow {
  session_id: string;
  display_name: string | null;
  participant_ref: string | null;
  score: number | null;
  status: string | null;
}

interface CompRow {
  id: string;
  title: string;
  status: string;
  results_published: boolean;
  session_id: string;
}

/**
 * Organization-side Rankings & Results — the operational surface of the
 * `competition_results` module (Plan & Module Management). Shows the official
 * per-competition rankings computed from the live session participants of
 * THIS organization only; publication state comes from the competition row.
 * Gated by the parent `competitions` module and by `competition_results`
 * itself, so a disabled module is unreachable by direct URL as well.
 */
export default async function CompetitionRankingsPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "competitions", "/dashboard?e=module");
  requireModule(entitlement, "competition_results", "/dashboard?e=module");
  if (!(await canOperate(ctx, org.id, "competitions.view", "competition_results"))) redirect("/dashboard?e=forbidden");

  const { data: comps } = await supabase
    .from("competitions")
    .select("id, title, status, results_published, session_id")
    .eq("organization_id", org.id)
    .not("session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = ((comps ?? []) as unknown as CompRow[]);
  const sessionIds = [...new Set(rows.map((c) => c.session_id))];
  const { data: participants } = sessionIds.length
    ? await supabase
        .from("session_participants")
        .select("session_id, display_name, participant_ref, score, status")
        .in("session_id", sessionIds)
        .order("score", { ascending: false })
        .limit(5000)
    : { data: [] as ParticipantRow[] };

  const bySession = new Map<string, ParticipantRow[]>();
  for (const p of (participants ?? []) as unknown as ParticipantRow[]) {
    const list = bySession.get(p.session_id) ?? [];
    list.push(p);
    bySession.set(p.session_id, list);
  }
  for (const list of bySession.values()) {
    list.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  }

  const ranked = rows.filter((c) => (bySession.get(c.session_id) ?? []).length > 0);
  const published = rows.filter((c) => c.results_published).length;
  const participantTotal = [...bySession.values()].reduce((n, l) => n + l.length, 0);

  return (
    <>
      <PageTitle
        eyebrow="Live Competitions · Official Rankings"
        title="Rankings & results"
        subtitle={`Official per-competition rankings for ${org.name}, computed from each competition's live session. Publication is controlled from the competition screens.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Competitions with sessions" value={rows.length} icon={<Trophy className="h-5 w-5" />} />
        <StatCard label="Ranked participants" value={participantTotal} icon={<Award className="h-5 w-5" />} />
        <StatCard label="Results published" value={published} />
        <StatCard label="Module" value="competition_results" hint="Plan & Module Management" />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No competition sessions yet"
            body="Rankings appear once a competition runs a live session with scored participants."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {ranked.length === 0 && (
            <Card className="p-6">
              <p className="text-sm text-ink-soft">
                Sessions exist but no scored participants yet — rankings render as soon as scores arrive.
              </p>
            </Card>
          )}
          {ranked.map((c) => {
            const list = bySession.get(c.session_id) ?? [];
            return (
              <Card key={c.id} className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-evergreen-950">{c.title}</h2>
                    <p className="mt-0.5 text-xs text-ink-soft">Session rankings · {list.length} participant{list.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={c.status === "live" ? "green" : "gray"}>{c.status}</Badge>
                    {c.results_published ? <Badge tone="gold">Published</Badge> : <Badge tone="amber">Not published</Badge>}
                  </div>
                </div>
                <div className="mt-4">
                  <DataTable head={["#", "Participant", "Reference", "Score", "Status"]} label={`Rankings for ${c.title}`}>
                    {list.map((p, i) => (
                      <tr key={`${p.session_id}-${p.participant_ref ?? i}-${i}`}>
                        <td className="font-display font-semibold">
                          {i + 1}
                          {i === 0 ? " 🥇" : i === 1 ? " 🥈" : i === 2 ? " 🥉" : ""}
                        </td>
                        <td className="font-medium text-evergreen-950">{p.display_name ?? "Participant"}</td>
                        <td className="font-mono text-xs text-ink-soft">{p.participant_ref ?? "—"}</td>
                        <td className="text-right font-semibold">{Number(p.score ?? 0)}</td>
                        <td className="text-xs text-ink-soft">{p.status ?? "—"}</td>
                      </tr>
                    ))}
                  </DataTable>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
