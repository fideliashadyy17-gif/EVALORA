import { Badge, Button, ButtonLink, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { ORG_TYPES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Organization settings" };
export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("organizations")
    .select("id, name, slug, type, status, settings, country, city, contact_email, created_at, profiles!organizations_owner_id_fkey(email, full_name), organization_members(id), students(id), subscriptions(status, source, plans(name)), classes(id), academic_years(id, is_current)")
    .order("name")
    .limit(500);
  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.type) query = query.eq("type", sp.type);
  if (sp.status) query = query.eq("status", sp.status);
  const { data: orgs } = await query;

  return (
    <>
      <PageTitle
        eyebrow="Organizations & Tenants · Configuration Matrix"
        title="Organization settings"
        subtitle="A platform-wide directory of each organization's ownership, operating scale and configuration entry points. Detailed settings remain safely scoped inside each organization."
        action={<ButtonLink href="/admin/organizations/new" variant="gold">+ Create organization</ButtonLink>}
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search organization…" aria-label="Search organizations" /></div>
        <Select name="type" defaultValue={sp.type ?? ""} className="w-52" aria-label="Organization type">
          <option value="">All types</option>
          {ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.type || sp.status) && (
          <Link href="/admin/organizations/settings" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {(orgs ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No organizations match.</p>
      ) : (
        <Table head={["Organization", "Owner / contact", "Scale", "Subscription", "Configuration", "Status", "Open settings"]}>
          {(orgs ?? []).map((o) => {
            const owner = o.profiles as unknown as { email?: string; full_name?: string } | null;
            const settings = (o.settings as Record<string, unknown> | null) ?? {};
            const sub = ((o.subscriptions as unknown as { status: string; source?: string; plans: { name: string } | null }[]) ?? []).find((s) => ["active", "trialing"].includes(s.status));
            const currentYear = ((o.academic_years as unknown as { is_current: boolean }[]) ?? []).some((y) => y.is_current);
            const len = (v: unknown) => Array.isArray(v) ? v.length : 0;
            return (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/organizations/${o.id}`} className="font-semibold text-evergreen-950 hover:underline">{o.name}</Link>
                  <span className="block text-xs text-ink-soft">{String(o.type).replace(/_/g, " ")} · {[o.city, o.country].filter(Boolean).join(", ") || o.slug}</span>
                  {Boolean(settings.platform_owned) && <Badge tone="gold">Platform workspace</Badge>}
                </td>
                <td className="text-ink-soft">
                  {owner?.full_name || owner?.email || "—"}
                  <span className="block text-xs">{o.contact_email || owner?.email || "No contact email"}</span>
                </td>
                <td className="text-xs text-ink-soft">
                  {len(o.organization_members)} members · {len(o.students)} students
                  <span className="block">{len(o.classes)} classes · created {fmtDate(o.created_at)}</span>
                </td>
                <td>
                  {sub ? <>{sub.plans?.name ?? "Plan"}<span className="block text-xs capitalize text-ink-soft">{sub.status} · {String(sub.source ?? "paid").replace(/_/g, " ")}</span></> : "Free / none"}
                </td>
                <td className="text-xs text-ink-soft">
                  {Object.keys(settings).length} saved setting key{Object.keys(settings).length === 1 ? "" : "s"}
                  <span className="block">{currentYear ? "Current academic year set" : "No current academic year"}</span>
                </td>
                <td><StatusBadge status={o.status} /></td>
                <td>
                  <div className="flex flex-col gap-1">
                    <Link href={`/admin/organizations/${o.id}`} className="font-medium text-evergreen-700 hover:underline">Overview & settings</Link>
                    <Link href={`/admin/organizations/${o.id}?tab=academics`} className="text-sm text-evergreen-700 hover:underline">Academic structure</Link>
                    <Link href={`/admin/organizations/${o.id}?tab=subscription`} className="text-sm text-evergreen-700 hover:underline">Subscription</Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
