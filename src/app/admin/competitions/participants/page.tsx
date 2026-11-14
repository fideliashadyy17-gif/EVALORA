import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { Trophy, UserCheck, UserX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { registrationOp } from "../../actions/competitions";
import { StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Competition participants" };
export const dynamic = "force-dynamic";

export default async function CompetitionParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; comp?: string; org?: string; status?: string; source?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("competition_registrations")
    .select("*, competitions(id, title, status), organizations(name), classes(name), competition_access_codes(code, label), session_participants(score, status)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (sp.comp) query = query.eq("competition_id", sp.comp);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.source) query = query.eq("source", sp.source);
  if (sp.q) query = query.or(`full_name.ilike.%${sp.q}%,participant_ref.ilike.%${sp.q}%`);

  const [{ data: regs }, { data: comps }, { data: orgs }] = await Promise.all([
    query,
    admin.from("competitions").select("id, title").order("created_at", { ascending: false }).limit(300),
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);

  const rows = regs ?? [];
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const csv = toCsv([
    ["Participant", "Reference", "Competition", "Organization", "Class", "Access code", "Source", "Registration status", "Live score", "Registered"],
    ...rows.map((r) => [
      r.full_name, r.participant_ref ?? "",
      (r.competitions as unknown as { title?: string } | null)?.title ?? "",
      (r.organizations as unknown as { name?: string } | null)?.name ?? "",
      (r.classes as unknown as { name?: string } | null)?.name ?? "",
      (r.competition_access_codes as unknown as { code?: string } | null)?.code ?? "",
      r.source, r.status,
      (r.session_participants as unknown as { score?: number } | null)?.score ?? "",
      fmtDateTime(r.created_at),
    ]),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Live Competitions · Participant Roster"
        title="Competition participants"
        subtitle="Every persisted registration across competitions, including school/class eligibility, the access code used, registration source and live-session linkage."
        action={
          <div className="flex flex-wrap gap-2">
            <ExportButton filename="competition-participants.csv" csv={csv} label="Export participants" />
            <ButtonLink href="/admin/competitions/register" variant="gold">Register participant</ButtonLink>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registrations shown" value={rows.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active registrations" value={rows.filter((r) => r.status !== "removed").length} icon={<UserCheck className="h-5 w-5" />} />
        <StatCard label="Removed" value={rows.filter((r) => r.status === "removed").length} icon={<UserX className="h-5 w-5" />} />
        <StatCard label="Competitions represented" value={new Set(rows.map((r) => r.competition_id)).size} icon={<Trophy className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search participant or reference…" aria-label="Search participants" /></div>
        <Select name="comp" defaultValue={sp.comp ?? ""} className="w-64" aria-label="Competition">
          <option value="">All competitions</option>
          {(comps ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Participant organization">
          <option value="">All participant organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Registration status">
          <option value="">All statuses</option>
          <option value="registered">Registered</option>
          <option value="admitted">Admitted</option>
          <option value="removed">Removed</option>
        </Select>
        <Select name="source" defaultValue={sp.source ?? ""} className="w-44" aria-label="Registration source">
          <option value="">All sources</option>
          <option value="admin">Admin</option>
          <option value="import">CSV import</option>
          <option value="code_join">Access-code join</option>
          <option value="self">Self-registration</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.comp || sp.org || sp.status || sp.source) && (
          <Link href="/admin/competitions/participants" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No competition registrations match.</p>
      ) : (
        <>
          <Table head={["Participant", "Competition", "School / class", "Access", "Source", "Live session", "Status", "Actions"]}>
            {pagedRows.map((r) => {
            const comp = r.competitions as unknown as { id: string; title: string; status: string } | null;
            const code = r.competition_access_codes as unknown as { code: string; label: string | null } | null;
            const live = r.session_participants as unknown as { score: number; status: string } | null;
            return (
              <tr key={r.id}>
                <td><span className="font-medium text-evergreen-950">{r.full_name}</span><span className="block text-xs text-ink-soft">{r.participant_ref || "No reference"} · {fmtDateTime(r.created_at)}</span></td>
                <td>{comp ? <Link href={`/admin/competitions/${comp.id}?tab=participants`} className="font-medium text-evergreen-800 hover:underline">{comp.title}</Link> : "—"}<span className="block text-xs text-ink-soft">{comp?.status}</span></td>
                <td className="text-ink-soft">{(r.organizations as unknown as { name?: string } | null)?.name ?? "Independent"}<span className="block text-xs">{(r.classes as unknown as { name?: string } | null)?.name ?? "No class"}</span></td>
                <td>{code ? <span className="font-mono font-semibold">{code.code}</span> : "—"}<span className="block text-xs text-ink-soft">{code?.label ?? ""}</span></td>
                <td><Badge tone="gray">{r.source.replace(/_/g, " ")}</Badge></td>
                <td>{live ? <>{live.score} pts<span className="block text-xs capitalize text-ink-soft">{live.status}</span></> : "Not joined"}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {comp && <Link href={`/admin/competitions/${comp.id}?tab=participants`} className="font-medium text-evergreen-700 hover:underline">Manage</Link>}
                    <form action={registrationOp}>
                      <input type="hidden" name="competition_id" value={r.competition_id} />
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value={r.status === "removed" ? "restore" : "remove"} />
                      <button className={`font-medium hover:underline ${r.status === "removed" ? "text-evergreen-700" : "text-red-700"}`}>
                        {r.status === "removed" ? "Restore" : "Remove"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
          </Table>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={rows.length}
            pathname="/admin/competitions/participants"
            query={{ q: sp.q, comp: sp.comp, org: sp.org, status: sp.status, source: sp.source }}
            label="participants"
          />
        </>
      )}
    </>
  );
}
