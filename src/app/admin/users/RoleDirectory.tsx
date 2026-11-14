import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import type { OrgRole } from "@/lib/brand";
import { ORG_ROLES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { Building2, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { StatusBadge, Table } from "../ui";

interface Props {
  eyebrow?: string;
  title: string;
  subtitle: string;
  pathname: string;
  roles: OrgRole[];
  organizationTypes?: string[];
  searchParams: { q?: string; org?: string; status?: string; role?: string; page?: string };
}

export async function RoleDirectory({ eyebrow, title, subtitle, pathname, roles, organizationTypes, searchParams: sp }: Props) {
  await requireSuperAdmin();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("organization_members")
    .select("*, profiles(id, email, full_name, status, platform_role, is_primary, created_at), organizations(id, name, type, status)")
    .in("role", roles)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.role && roles.includes(sp.role as OrgRole)) query = query.eq("role", sp.role);

  const [{ data: members }, { data: orgs }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name, type").order("name").limit(500),
  ]);

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = (members ?? []).filter((m) => {
    const p = m.profiles as unknown as { email?: string; full_name?: string } | null;
    const o = m.organizations as unknown as { name?: string; type?: string } | null;
    if (organizationTypes && o?.type && !organizationTypes.includes(o.type)) return false;
    if (!q) return true;
    return [p?.email, p?.full_name, o?.name, m.role].some((v) => String(v ?? "").toLowerCase().includes(q));
  });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const distinctUsers = new Set(filtered.map((m) => m.user_id)).size;
  const distinctOrgs = new Set(filtered.map((m) => m.organization_id)).size;
  const active = filtered.filter((m) => m.status === "active").length;
  const roleLabel = (role: string) => ORG_ROLES.find((r) => r.value === role)?.label ?? role;

  return (
    <>
      <PageTitle
        eyebrow={eyebrow ?? "Users & Identity · Scoped Role Directory"}
        title={title}
        subtitle={subtitle}
        action={<ButtonLink href="/admin/users/new" variant="gold">+ Create user</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="People" value={distinctUsers} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Memberships shown" value={filtered.length} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Active memberships" value={active} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Organizations represented" value={distinctOrgs} icon={<Building2 className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search name, email or organization…" aria-label="Search people" />
        </div>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? [])
            .filter((o) => !organizationTypes || organizationTypes.includes(o.type))
            .map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        {roles.length > 1 && (
          <Select name="role" defaultValue={sp.role ?? ""} className="w-52" aria-label="Role">
            <option value="">All roles in this view</option>
            {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </Select>
        )}
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Membership status">
          <option value="">All membership statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.org || sp.role || sp.status) && (
          <Link href={pathname} className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No people match this role view yet. Create a user, then assign the relevant organization role.
        </p>
      ) : (
        <>
          <Table head={["Person", "Organization", "Role", "Membership", "Account", "Account created", "Membership since", "Actions"]}>
            {paged.map((m) => {
              const p = m.profiles as unknown as { id: string; email: string; full_name: string | null; status: string; platform_role: string; is_primary?: boolean; created_at: string | null } | null;
              const o = m.organizations as unknown as { id: string; name: string; type: string; status: string } | null;
              return (
                <tr key={m.id}>
                  <td>
                    {p ? <Link href={`/admin/users/${p.id}`} className="font-medium text-evergreen-950 hover:underline">{p.full_name || p.email}</Link> : "Unknown user"}
                    <span className="block text-xs text-ink-soft">{p?.email ?? "—"}</span>
                    {p?.platform_role === "super_admin" && <Badge tone="gold">{p.is_primary ? "Primary Super Admin" : "Super Admin"}</Badge>}
                  </td>
                  <td>
                    {o ? <Link href={`/admin/organizations/${o.id}`} className="font-medium text-evergreen-800 hover:underline">{o.name}</Link> : "—"}
                    <span className="block text-xs capitalize text-ink-soft">{o?.type.replace(/_/g, " ")}</span>
                  </td>
                  <td><Badge tone={m.role === "owner" ? "gold" : "green"}>{roleLabel(m.role)}</Badge></td>
                  <td><StatusBadge status={m.status} /></td>
                  <td>{p ? <StatusBadge status={p.status} /> : "—"}</td>
                  <td className="text-ink-soft">{p?.created_at ? fmtDate(p.created_at) : "—"}</td>
                  <td className="text-ink-soft">{fmtDate(m.created_at)}</td>
                  <td>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {p && <Link href={`/admin/users/${p.id}`} className="font-medium text-evergreen-700 hover:underline">Manage user</Link>}
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
            pathname={pathname}
            query={{ q: sp.q, org: sp.org, role: sp.role, status: sp.status }}
            label="memberships"
          />
        </>
      )}
    </>
  );
}
