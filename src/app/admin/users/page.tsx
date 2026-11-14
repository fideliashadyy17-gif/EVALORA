import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { setUserStatus } from "../actions";
import { Notice, StatusBadge, Table } from "../ui";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; ok?: string; e?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select("*, organization_members(role, organizations(name))", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (sp.q) query = query.or(`email.ilike.%${sp.q}%,full_name.ilike.%${sp.q}%`);
  if (sp.role === "super_admin") query = query.eq("platform_role", "super_admin");
  if (sp.role === "user") query = query.eq("platform_role", "user");
  if (sp.status) query = query.eq("status", sp.status);
  const { data: users, count: filteredTotal } = await query;

  return (
    <>
      <PageTitle
        title="Users"
        subtitle="Every platform account. Create users, manage memberships and roles, reset access and administer platform administrators."
        action={<ButtonLink href="/admin/users/new" variant="gold">+ Create user</ButtonLink>}
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          user_deleted: "User account deleted.",
          primary: "The Primary Super Admin account is protected — it cannot be suspended or demoted.",
          self: "You cannot suspend your own account.",
          admin: "Only the Primary Super Admin can suspend another Super Admin.",
          primary_only: "Only the Primary Super Admin can manage administrator privileges.",
        }}
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search name or email…" aria-label="Search users" />
        </div>
        <Select name="role" defaultValue={sp.role ?? ""} className="w-48" aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="super_admin">Administrators</option>
          <option value="user">Standard users</option>
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-40" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      {(users ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No users match. <Link href="/admin/users/new" className="font-semibold text-evergreen-700 underline underline-offset-2">Create a user</Link>.
        </p>
      ) : (
        <Table head={["User", "Platform role", "Organizations", "Joined", "Status", "Actions"]}>
          {(users ?? []).map((u) => (
            <tr key={u.id}>
              <td>
                <Link href={`/admin/users/${u.id}`} className="font-medium text-evergreen-900 hover:underline">
                  {u.full_name || "—"}
                </Link>
                <span className="block text-xs text-ink-soft">{u.email}</span>
              </td>
              <td>
                {u.platform_role === "super_admin" ? (
                  <Badge tone="gold">{u.is_primary ? "Primary Super Admin" : "Super Admin"}</Badge>
                ) : (
                  <Badge tone="gray">User</Badge>
                )}
              </td>
              <td className="max-w-[260px] truncate text-ink-soft">
                {((u.organization_members as { role: string; organizations: { name: string } | null }[]) ?? [])
                  .map((m) => `${m.organizations?.name ?? "Org"} (${m.role})`)
                  .join(", ") || "—"}
              </td>
              <td className="text-ink-soft">{fmtDate(u.created_at)}</td>
              <td><StatusBadge status={u.status} /></td>
              <td>
                <div className="flex gap-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Manage</Link>
                  {!u.is_primary && (
                    <form action={setUserStatus}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                      <button className={`font-medium underline-offset-2 hover:underline ${u.status === "active" ? "text-red-700" : "text-evergreen-700"}`}>
                        {u.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <PageNavigation
        page={page}
        pageSize={pageSize}
        total={filteredTotal ?? 0}
        pathname="/admin/users"
        query={{ q: sp.q, role: sp.role, status: sp.status }}
        label="users"
      />
    </>
  );
}
