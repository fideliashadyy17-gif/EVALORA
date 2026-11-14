import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { ShieldCheck, UserCog, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Organization administrators" };
export const dynamic = "force-dynamic";

export default async function OrganizationAdministratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; role?: string; status?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("organization_members")
    .select("*, profiles(id, email, full_name, status, platform_role, is_primary), organizations(id, name, type)")
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: false })
    .limit(1000);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.role) query = query.eq("role", sp.role);
  if (sp.status) query = query.eq("status", sp.status);

  const [{ data: members }, { data: orgs }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = (members ?? []).filter((m) => {
    if (!q) return true;
    const profile = m.profiles as unknown as { email?: string; full_name?: string } | null;
    const org = m.organizations as unknown as { name?: string } | null;
    return [profile?.email, profile?.full_name, org?.name].some((v) => String(v ?? "").toLowerCase().includes(q));
  });

  const owners = filtered.filter((m) => m.role === "owner").length;
  const admins = filtered.filter((m) => m.role === "admin").length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageTitle
        eyebrow="Organizations & Tenants · Leadership Governance"
        title="Organization administrators"
        subtitle="Every organization owner and administrator across EVALORA. Open a user to change memberships, or an organization to manage its leadership."
        action={<ButtonLink href="/admin/users/new" variant="gold">+ Create user</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Owners shown" value={owners} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Administrators shown" value={admins} icon={<UserCog className="h-5 w-5" />} />
        <StatCard label="Leadership memberships" value={filtered.length} icon={<Users className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search administrator, email or organization…" aria-label="Search organization administrators" />
        </div>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="role" defaultValue={sp.role ?? ""} className="w-44" aria-label="Role">
          <option value="">Owners + admins</option>
          <option value="owner">Owners</option>
          <option value="admin">Administrators</option>
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Membership status">
          <option value="">All membership statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.org || sp.role || sp.status) && (
          <Link href="/admin/organizations/admins" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No organization administrators match.</p>
      ) : (
        <>
          <Table head={["Administrator", "Organization", "Role", "Membership", "Account", "Joined", "Actions"]}>
            {paged.map((m) => {
            const p = m.profiles as unknown as { id: string; email: string; full_name: string | null; status: string; platform_role: string; is_primary?: boolean } | null;
            const o = m.organizations as unknown as { id: string; name: string; type: string } | null;
            return (
              <tr key={m.id}>
                <td>
                  {p ? (
                    <Link href={`/admin/users/${p.id}`} className="font-medium text-evergreen-900 hover:underline">{p.full_name || p.email}</Link>
                  ) : "Unknown user"}
                  <span className="block text-xs text-ink-soft">{p?.email ?? "—"}</span>
                  {p?.platform_role === "super_admin" && <Badge tone="gold">{p.is_primary ? "Primary Super Admin" : "Super Admin"}</Badge>}
                </td>
                <td>
                  {o ? <Link href={`/admin/organizations/${o.id}`} className="font-medium text-evergreen-800 hover:underline">{o.name}</Link> : "—"}
                  <span className="block text-xs capitalize text-ink-soft">{o?.type.replace(/_/g, " ")}</span>
                </td>
                <td><Badge tone={m.role === "owner" ? "gold" : "green"}>{m.role}</Badge></td>
                <td><StatusBadge status={m.status} /></td>
                <td>{p ? <StatusBadge status={p.status} /> : "—"}</td>
                <td className="text-ink-soft">{fmtDate(m.created_at)}</td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {p && <Link href={`/admin/users/${p.id}`} className="font-medium text-evergreen-700 hover:underline">User</Link>}
                    {o && <Link href={`/admin/organizations/${o.id}?tab=members`} className="font-medium text-evergreen-700 hover:underline">Members</Link>}
                  </div>
                </td>
              </tr>
            );
          })}
          </Table>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            pathname="/admin/organizations/admins"
            query={{ q: sp.q, org: sp.org, role: sp.role, status: sp.status }}
            label="administrators"
          />
        </>
      )}
    </>
  );
}
