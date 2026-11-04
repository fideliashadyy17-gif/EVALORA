import { Badge, Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, money } from "@/lib/utils";
import type { Metadata } from "next";
import { getProofUrl, reviewPayment } from "../actions";

export const metadata: Metadata = { title: "Payment reviews" };
export const dynamic = "force-dynamic";

export default async function AdminPayments() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_requests")
    .select("*, plans(name), organizations(name), profiles!payment_requests_submitted_by_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(50);

  const withProof = await Promise.all(
    (data ?? []).map(async (p) => ({
      ...p,
      proofSigned: p.proof_url ? await getProofUrl(p.proof_url) : null,
    })),
  );

  const pending = withProof.filter((p) => p.status === "pending");
  const history = withProof.filter((p) => p.status !== "pending");

  return (
    <>
      <PageTitle title="Payment reviews" subtitle="Subscriptions activate ONLY when you approve here. Verify the reference against your bank/Mobile Money records first." />

      <h2 className="mb-3 font-display text-xl font-semibold text-evergreen-950">Awaiting review ({pending.length})</h2>
      {pending.length === 0 && <p className="mb-6 text-sm text-ink-soft">Nothing pending.</p>}
      <div className="space-y-4">
        {pending.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{(p.organizations as { name: string } | null)?.name} → {(p.plans as { name: string } | null)?.name} ({p.billing_period})</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {money(p.amount_cents, p.currency)} · {p.method ?? "—"} · Ref <span className="font-mono font-semibold text-evergreen-800">{p.transaction_ref}</span>
                </p>
                <p className="text-xs text-ink-soft">
                  Submitted {fmtDateTime(p.created_at)} by {(p.profiles as { full_name: string; email: string } | null)?.full_name || (p.profiles as { email: string } | null)?.email}
                </p>
                {p.proofSigned && (
                  <a href={p.proofSigned} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium text-evergreen-700 underline underline-offset-2">
                    View payment proof ↗
                  </a>
                )}
              </div>
              <Badge tone="amber">pending</Badge>
            </div>
            <form action={reviewPayment} className="mt-4 flex flex-wrap items-end gap-2 border-t border-evergreen-900/10 pt-4">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Note / rejection reason" className="flex-1 min-w-56">
                <Input name="note" placeholder="Visible to the organization on rejection" />
              </Field>
              <Button type="submit" name="decision" value="approve" variant="gold">✓ Approve & activate</Button>
              <Button type="submit" name="decision" value="reject" variant="danger">✕ Reject</Button>
            </form>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-display text-xl font-semibold text-evergreen-950">History</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Reference</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((p) => (
              <tr key={p.id} className="border-b border-evergreen-900/5">
                <td className="px-4 py-2.5 text-ink-soft">{fmtDateTime(p.created_at)}</td>
                <td className="px-4 py-2.5">{(p.organizations as { name: string } | null)?.name}</td>
                <td className="px-4 py-2.5">{(p.plans as { name: string } | null)?.name}</td>
                <td className="px-4 py-2.5">{money(p.amount_cents, p.currency)}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{p.transaction_ref}</td>
                <td className="px-4 py-2.5"><Badge tone={p.status === "approved" ? "green" : p.status === "rejected" ? "red" : "gray"}>{p.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
