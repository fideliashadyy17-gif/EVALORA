import { Badge, Card, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AdminAudit() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("audit_logs")
    .select("*, profiles!audit_logs_actor_id_fkey(email), organizations(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <PageTitle title="Audit log" subtitle="Privileged actions across the platform: payments, plans, suspensions, grants and settings." />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id} className="border-b border-evergreen-900/5">
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-soft">{fmtDateTime(a.created_at)}</td>
                <td className="px-4 py-2.5"><Badge tone="gray">{a.action}</Badge></td>
                <td className="px-4 py-2.5">{(a.profiles as { email: string } | null)?.email ?? "—"}</td>
                <td className="px-4 py-2.5">{(a.organizations as { name: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{JSON.stringify(a.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">No audit entries yet.</p>}
      </Card>
    </>
  );
}
