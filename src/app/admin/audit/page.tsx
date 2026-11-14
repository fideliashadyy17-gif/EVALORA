import { ExportButton } from "@/components/ExportTools";
import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, EmptyState, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import { Activity, Building2, Clock3, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Table } from "../ui";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

function renderMetadata(meta: unknown) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return <span className="text-xs text-ink-soft">—</span>;
  }
  const entries = Object.entries(meta as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return <span className="text-xs text-ink-soft">—</span>;
  return (
    <div className="flex max-w-md flex-wrap gap-1.5">
      {entries.slice(0, 6).map(([k, v]) => (
        <span
          key={k}
          className="inline-flex max-w-[16rem] truncate rounded-md border border-evergreen-900/15 bg-cream px-2 py-0.5 font-mono text-[11px] text-evergreen-950"
          title={`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`}
        >
          <span className="mr-1 font-semibold text-ink-soft">{k}:</span>
          {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </span>
      ))}
      {entries.length > 6 && (
        <span className="rounded-md bg-evergreen-50 px-1.5 py-0.5 text-[11px] font-medium text-evergreen-800">
          +{entries.length - 6} more
        </span>
      )}
    </div>
  );
}

export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; entity?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const orgFilter = (sp.org ?? "").trim();
  const entityFilter = (sp.entity ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 40;
  const admin = createAdminClient();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const head = { count: "exact" as const, head: true };

  let query = admin
    .from("audit_logs")
    .select("*, profiles!audit_logs_actor_id_fkey(id, email, full_name), organizations(id, name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (q) {
    const safe = q.replace(/[,%()]/g, " ").trim();
    if (safe) query = query.or(`action.ilike.%${safe}%,entity.ilike.%${safe}%`);
  }
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  if (entityFilter) query = query.ilike("entity", `%${entityFilter}%`);

  const [{ data, count: filteredTotal }, totalEvents, last24hEvents, orgsRes] = await Promise.all([
    query,
    admin.from("audit_logs").select("id", head).then((r) => r.count ?? 0),
    admin.from("audit_logs").select("id", head).gte("created_at", since24h).then((r) => r.count ?? 0),
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);

  const rows = data ?? [];
  const uniqueActorsOnPage = new Set(rows.map((r) => r.actor_id).filter(Boolean)).size;
  const uniqueOrgsOnPage = new Set(rows.map((r) => r.organization_id).filter(Boolean)).size;

  const csvRows: (string | number)[][] = [
    ["Timestamp", "Action", "Entity", "Actor", "Organization", "Details"],
    ...rows.map((a) => [
      a.created_at,
      a.action ?? "",
      a.entity ?? "",
      (a.profiles as { email?: string } | null)?.email ?? "System",
      (a.organizations as { name?: string } | null)?.name ?? "Platform",
      JSON.stringify(a.metadata ?? {}),
    ]),
  ];

  const hasFilters = Boolean(q || orgFilter || entityFilter);

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Governance & Forensics"
        title="Security & audit logs"
        subtitle="Immutable record of privileged operations across payments, entitlements, workspace entry, suspensions and platform configuration."
        action={
          <>
            <ButtonLink href="/admin/activity" variant="outline">Recent operations</ButtonLink>
            <ExportButton filename="evalora-audit-logs.csv" csv={toCsv(csvRows)} label="Export page CSV" />
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total audit records" value={totalEvents} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Last 24 hours" value={last24hEvents} hint="Privileged actions recorded" icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Matching filter" value={filteredTotal ?? 0} hint={`Actors in view: ${uniqueActorsOnPage}`} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Tenants in view" value={uniqueOrgsOnPage} hint="Scoped organization contexts" icon={<Building2 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl border border-evergreen-900/15 bg-paper p-4 shadow-[var(--shadow-card)]">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="audit-q" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Action or entity</label>
          <Input id="audit-q" name="q" defaultValue={q} placeholder="Search e.g. payment, workspace, plan, exam…" />
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="audit-org" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Organization</label>
          <Select id="audit-org" name="org" defaultValue={orgFilter}>
            <option value="">All organizations</option>
            {(orgsRes.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <label htmlFor="audit-entity" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Domain</label>
          <Select id="audit-entity" name="entity" defaultValue={entityFilter}>
            <option value="">All domains</option>
            <option value="organization">Organizations</option>
            <option value="subscription">Subscriptions</option>
            <option value="payment">Payments</option>
            <option value="exam">Examinations</option>
            <option value="competition">Competitions</option>
            <option value="user">Users & roles</option>
            <option value="setting">Platform settings</option>
          </Select>
        </div>
        <Button type="submit" variant="primary">Apply filters</Button>
        {hasFilters && (
          <Link href="/admin/audit" className="inline-flex min-h-10 items-center px-3 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No matching audit events" : "No audit entries yet"}
          body={hasFilters ? "Broaden your search query or clear the active filters to inspect earlier privileged operations." : "Privileged administrative actions will appear here automatically."}
          action={hasFilters ? <ButtonLink href="/admin/audit" variant="outline">Reset filters</ButtonLink> : undefined}
        />
      ) : (
        <Table head={["Timestamp", "Action", "Entity", "Actor", "Organization", "Context & Metadata"]}>
          {rows.map((a) => {
            const actor = a.profiles as { id?: string; email?: string; full_name?: string | null } | null;
            const org = a.organizations as { id?: string; name?: string } | null;
            const actionTone =
              String(a.action).includes("delete") || String(a.action).includes("suspend") || String(a.action).includes("reject")
                ? "red"
                : String(a.action).includes("approve") || String(a.action).includes("grant") || String(a.action).includes("create")
                  ? "green"
                  : "gold";
            return (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(a.created_at)}</td>
                <td>
                  <Badge tone={actionTone} className="font-mono text-[11px]">
                    {a.action}
                  </Badge>
                </td>
                <td className="text-xs font-medium text-evergreen-950">{a.entity ?? "—"}</td>
                <td>
                  {actor?.id ? (
                    <Link href={`/admin/users/${actor.id}`} className="font-medium text-evergreen-800 hover:underline">
                      {actor.email ?? actor.full_name ?? "Operator"}
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-soft">{actor?.email ?? "System"}</span>
                  )}
                </td>
                <td>
                  {org?.id ? (
                    <Link href={`/admin/organizations/${org.id}`} className="font-medium text-evergreen-800 hover:underline">
                      {org.name}
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-soft">Platform-wide</span>
                  )}
                </td>
                <td>{renderMetadata(a.metadata)}</td>
              </tr>
            );
          })}
        </Table>
      )}

      <PageNavigation
        page={page}
        pageSize={pageSize}
        total={filteredTotal ?? 0}
        pathname="/admin/audit"
        query={{ q: q || undefined, org: orgFilter || undefined, entity: entityFilter || undefined }}
        label="audit entries"
      />
    </>
  );
}
