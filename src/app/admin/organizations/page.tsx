import { PlatformUrlActions } from "@/components/platform/PlatformUrlActions";
import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { ORG_TYPES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { organizationPlatformAccess } from "@/lib/tenant";
import { fmtDate } from "@/lib/utils";
import { Building2, GraduationCap, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setOrgStatus } from "../actions";
import { enterOrgWorkspace } from "../actions/orgs";
import { Notice, StatusBadge, Table } from "../ui";

export const metadata: Metadata = { title: "Organizations" };
export const dynamic = "force-dynamic";

export default async function AdminOrganizations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; ok?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("organizations")
    .select(
      "id, name, slug, type, status, country, city, created_at, portal_enabled, custom_domain, platform_domain_status, organization_members(id), students(id), quizzes(id), exams(id), competitions(id), subscriptions(status, source, plans(name), trial_ends_at, current_period_end)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.type) query = query.eq("type", sp.type);
  if (sp.status) query = query.eq("status", sp.status);
  const { data: orgs, count: filteredTotal } = await query;

  const head = { count: "exact" as const, head: true };
  const [total, schools, students] = await Promise.all([
    admin.from("organizations").select("id", head).eq("is_demo", false).then((r) => r.count ?? 0),
    admin.from("organizations").select("id", head).eq("type", "school").eq("is_demo", false).then((r) => r.count ?? 0),
    admin.from("students").select("id", head).eq("status", "active").then((r) => r.count ?? 0),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Organizations & Tenants · Directory"
        title="Organizations"
        subtitle="Create and operate schools, universities and examination centers — no payment required on the path."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/organizations/access" variant="outline">Organization platform access</ButtonLink>
            <ButtonLink href="/admin/organizations/new" variant="gold">+ Create organization</ButtonLink>
          </div>
        }
      />
      <Notice ok={sp.ok} e={sp.e} messages={{ deleted: "Organization permanently deleted." }} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Organizations" value={total} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Schools" value={schools} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Active students" value={students} hint="Across every school roster" icon={<Users className="h-5 w-5" />} />
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-2" method="get">
        <div className="min-w-[220px] flex-1">
          <Input name="q" placeholder="Search by name…" defaultValue={sp.q ?? ""} aria-label="Search organizations" />
        </div>
        <Select name="type" defaultValue={sp.type ?? ""} className="w-52" aria-label="Filter by type">
          <option value="">All types</option>
          {ORG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.type || sp.status) && (
          <Link href="/admin/organizations" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {(orgs ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No organizations match.{" "}
          <Link href="/admin/organizations/new" className="font-semibold text-evergreen-700 underline underline-offset-2">
            Create the first organization
          </Link>
          .
        </p>
      ) : (
        <Table head={["Organization", "Type", "Scale", "Plan", "Platform URL", "Status", "Actions"]}>
          {(orgs ?? []).map((o) => {
            const sub = ((o.subscriptions as unknown as { status: string; source?: string; plans: { name: string } | null; trial_ends_at: string | null; current_period_end: string | null }[]) ?? [])
              .find((s) => ["active", "trialing"].includes(s.status));
            const cnt = (k: string) => (o[k as keyof typeof o] as unknown[])?.length ?? 0;
            return (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/organizations/${o.id}`} className="font-semibold text-evergreen-900 hover:underline">
                    {o.name}
                  </Link>
                  <span className="block text-xs text-ink-soft">
                    {[o.city, o.country].filter(Boolean).join(", ") || o.slug} · since {fmtDate(o.created_at)}
                  </span>
                </td>
                <td className="capitalize">{o.type.replace(/_/g, " ")}</td>
                <td className="text-xs text-ink-soft">
                  {cnt("organization_members")} members · {cnt("students")} students
                  <span className="block">{cnt("quizzes")} quizzes · {cnt("exams")} exams · {cnt("competitions")} competitions</span>
                </td>
                <td>
                  {sub ? (
                    <>
                      <span className="font-medium text-ink">{sub.plans?.name}</span>
                      <span className="block text-xs capitalize text-ink-soft">
                        {sub.status}
                        {sub.source && sub.source !== "paid" ? ` · ${sub.source.replace(/_/g, " ")}` : ""}
                        {sub.status === "trialing" && sub.trial_ends_at ? ` until ${fmtDate(sub.trial_ends_at)}` : ""}
                        {sub.status === "active" && sub.current_period_end ? ` until ${fmtDate(sub.current_period_end)}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-soft">Free</span>
                  )}
                </td>
                <td>
                  {(() => {
                    const access = organizationPlatformAccess(o);
                    return (
                      <>
                        <Badge tone={access.tone}>{access.label}</Badge>
                        {access.url ? (
                          <a
                            href={access.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block max-w-[16rem] break-all font-mono text-[11px] text-evergreen-800 underline underline-offset-2"
                          >
                            {access.url}
                          </a>
                        ) : (
                          <span className="mt-1 block text-[11px] text-ink-soft">No working URL</span>
                        )}
                        <PlatformUrlActions url={access.url} size="sm" openLabel="Open" copyLabel="Copy" shareLabel="Share" className="mt-1" />
                      </>
                    );
                  })()}
                </td>
                <td><StatusBadge status={o.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/admin/organizations/${o.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                      Manage
                    </Link>
                    <form action={enterOrgWorkspace}>
                      <input type="hidden" name="organization_id" value={o.id} />
                      <button className="font-medium text-gold-800 underline-offset-2 hover:underline">Open workspace</button>
                    </form>
                    <form action={setOrgStatus}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value={o.status === "active" ? "suspended" : "active"} />
                      <button className={`font-medium underline-offset-2 hover:underline ${o.status === "active" ? "text-red-700" : "text-evergreen-700"}`}>
                        {o.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <PageNavigation
        page={page}
        pageSize={pageSize}
        total={filteredTotal ?? 0}
        pathname="/admin/organizations"
        query={{ q: sp.q, type: sp.type, status: sp.status }}
        label="organizations"
      />
    </>
  );
}
