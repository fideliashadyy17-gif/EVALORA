import { Badge, Card, Input, PageTitle, Button } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import { setUserStatus } from "../actions";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin.from("profiles").select("*, organization_members(organization_id, role, organizations(name))").order("created_at", { ascending: false }).limit(100);
  if (sp.q) query = query.or(`email.ilike.%${sp.q}%,full_name.ilike.%${sp.q}%`);
  const { data: users } = await query;

  return (
    <>
      <PageTitle title="Users" subtitle="Every registered account. Suspending blocks sign-in immediately (enforced server-side)." />
      <form method="get" className="mb-4 flex gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search name or email…" className="max-w-sm" />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Platform role</th>
              <th className="px-4 py-3 font-semibold">Organizations</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-evergreen-900/5">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{u.full_name || "—"}</span>
                  <span className="block text-xs text-ink-soft">{u.email}</span>
                </td>
                <td className="px-4 py-2.5">
                  {u.platform_role === "super_admin" ? <Badge tone="gold">Super Admin</Badge> : <Badge tone="gray">User</Badge>}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">
                  {((u.organization_members as { role: string; organizations: { name: string } | null }[]) ?? [])
                    .map((m) => `${m.organizations?.name ?? "Org"} (${m.role})`)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-2.5"><Badge tone={u.status === "active" ? "green" : "red"}>{u.status}</Badge></td>
                <td className="px-4 py-2.5">
                  {u.platform_role !== "super_admin" && (
                    <form action={setUserStatus}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                      <button className={`text-sm font-medium underline-offset-2 hover:underline ${u.status === "active" ? "text-red-700" : "text-evergreen-700"}`}>
                        {u.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
