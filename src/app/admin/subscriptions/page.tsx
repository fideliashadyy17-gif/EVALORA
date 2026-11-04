import { Badge, Button, Card, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import { adminCancelSubscription, adminReactivateSubscription } from "../actions";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

const tone = (s: string) =>
  (s === "active" ? "green" : s === "trialing" ? "gold" : "gray") as "green" | "gold" | "gray";

export default async function AdminSubscriptions({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; saved?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("subscriptions")
    .select("*, organizations(name), plans(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.status) query = query.eq("status", sp.status);
  const { data: subs } = await query;

  return (
    <>
      <PageTitle
        title="Subscriptions"
        subtitle="Every organization's subscription state. Entitlements resolve server-side from the newest active/trialing row; cancelling takes effect immediately. Grant or replace a subscription from Organizations."
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}
      {sp.e === "confirm" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Tick the confirmation box before cancelling.</p>}

      <form method="get" className="mb-4 flex gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-evergreen-900/55 bg-white px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past due</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Billing</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Period / trial end</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {(subs ?? []).map((s) => (
              <tr key={s.id} className="border-b border-evergreen-900/10">
                <td className="px-4 py-2.5 font-medium">{(s.organizations as { name?: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-2.5">{(s.plans as { name?: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">{s.billing_period}</td>
                <td className="px-4 py-2.5"><Badge tone={tone(s.status)}>{s.status}</Badge></td>
                <td className="px-4 py-2.5 text-ink-soft">
                  {s.status === "trialing" && s.trial_ends_at ? fmtDate(s.trial_ends_at) : s.current_period_end ? fmtDate(s.current_period_end) : "—"}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{fmtDate(s.created_at)}</td>
                <td className="px-4 py-2.5">
                  {s.status === "active" || s.status === "trialing" ? (
                    <form action={adminCancelSubscription} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <label className="flex items-center gap-1 text-xs text-ink-soft">
                        <input type="checkbox" name="confirm" required className="h-4 w-4 accent-red-700" /> sure?
                      </label>
                      <button className="text-sm font-medium text-red-700 underline-offset-2 hover:underline">Cancel</button>
                    </form>
                  ) : (
                    <form action={adminReactivateSubscription}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Reactivate</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(subs ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">No subscriptions match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
