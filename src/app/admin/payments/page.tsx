import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, money, toCsv } from "@/lib/utils";
import { CircleDollarSign, Clock, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getProofUrl, reviewPayment } from "../actions";
import { StatusBadge, Table } from "../ui";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function AdminPayments({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("payment_requests")
    .select("*, plans(name), organizations(id, name), profiles!payment_requests_submitted_by_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.source) query = query.eq("source", sp.source);
  if (sp.q) query = query.or(`transaction_ref.ilike.%${sp.q}%,payer_name.ilike.%${sp.q}%`);
  const { data } = await query;

  const withProof = await Promise.all(
    (data ?? []).map(async (p) => ({
      ...p,
      proofSigned: p.proof_url ? await getProofUrl(p.proof_url) : null,
    })),
  );
  const pending = withProof.filter((p) => p.status === "pending");
  const listed = sp.status ? withProof : withProof.filter((p) => p.status !== "pending");
  const pagedListed = listed.slice((page - 1) * pageSize, page * pageSize);

  // Verified revenue = approved records ONLY. Never count pending money.
  const { data: approved } = await admin
    .from("payment_requests")
    .select("amount_cents, currency, created_at")
    .eq("status", "approved")
    .limit(5000);
  const byCurrency = new Map<string, number>();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let monthTotal = 0;
  for (const p of approved ?? []) {
    byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + p.amount_cents);
    if (new Date(p.created_at) >= monthStart) monthTotal += p.amount_cents;
  }
  const revenueLabel = [...byCurrency.entries()].map(([c, v]) => money(v, c)).join(" · ") || money(0);

  const csv = toCsv([
    ["Date", "Organization", "Plan", "Amount", "Currency", "Method", "Reference", "Source", "Status", "Payer"],
    ...withProof.map((p) => [
      fmtDateTime(p.created_at),
      (p.organizations as unknown as { name: string } | null)?.name ?? "",
      (p.plans as unknown as { name: string } | null)?.name ?? "",
      (p.amount_cents / 100).toFixed(2), p.currency, p.method ?? "", p.transaction_ref, p.source ?? "portal", p.status, p.payer_name ?? "",
    ]),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Commerce & Entitlements · Payment Verification"
        title="Payments"
        subtitle="Verify portal submissions and record money received outside the platform. Only approved payments count as revenue or activate subscriptions."
        action={<ButtonLink href="/admin/payments/new" variant="gold">+ Add payment</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting verification" value={pending.length} hint="Never counted as revenue yet" icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Verified revenue (all time)" value={revenueLabel} icon={<CircleDollarSign className="h-5 w-5" />} />
        <StatCard label="Approved this month" value={money(monthTotal)} icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold text-evergreen-950">Awaiting review ({pending.length})</h2>
      {pending.length === 0 && <p className="mb-8 text-sm text-ink-soft">Nothing pending. Record offline money with “Add payment”.</p>}
      <div className="space-y-4">
        {pending.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  <Link href={`/admin/payments/${p.id}`} className="hover:underline">
                    {(p.organizations as unknown as { name: string } | null)?.name}
                  </Link>
                  {(p.plans as unknown as { name: string } | null)?.name ? ` → ${(p.plans as unknown as { name: string }).name} (${p.billing_period})` : " → custom payment"}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {money(p.amount_cents, p.currency)} · {p.method ?? "—"} · Ref{" "}
                  <span className="font-mono font-semibold text-evergreen-800">{p.transaction_ref}</span>
                  {p.payer_name ? ` · Payer: ${p.payer_name}` : ""}
                </p>
                <p className="text-xs text-ink-soft">
                  {p.source === "portal" ? "Submitted" : "Recorded"} {fmtDateTime(p.created_at)} by{" "}
                  {(p.profiles as unknown as { full_name: string; email: string } | null)?.full_name ||
                    (p.profiles as unknown as { email: string } | null)?.email}
                  {p.description ? <> · {p.description}</> : null}
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
              <Field label="Note / rejection reason" className="min-w-56 flex-1">
                <Input name="note" placeholder="Visible to the organization on rejection" />
              </Field>
              <Button type="submit" name="decision" value="approve" variant="gold">✓ Approve{p.plan_id ? " & activate" : ""}</Button>
              <Button type="submit" name="decision" value="reject" variant="danger">✕ Reject</Button>
            </form>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl font-semibold text-evergreen-950">All transactions</h2>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Input name="q" defaultValue={sp.q} placeholder="Search reference or payer…" aria-label="Search payments" />
        </div>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Filter by status">
          <option value="">All statuses</option>
          {["pending", "approved", "rejected", "expired", "refunded", "cancelled"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select name="source" defaultValue={sp.source ?? ""} className="w-44" aria-label="Filter by source">
          <option value="">All sources</option>
          <option value="portal">Portal submissions</option>
          <option value="manual">Manual entries</option>
          <option value="adjustment">Adjustments</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.status || sp.source) && (
          <Link href="/admin/payments" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
        <ExportButton filename="payments.csv" csv={csv} label="Export payments" />
      </form>

      {listed.length === 0 ? (
        <p className="text-sm text-ink-soft">No transactions match.</p>
      ) : (
        <>
          <Table head={["Date", "Organization", "Amount", "Reference", "Source", "Status", "Actions"]}>
            {pagedListed.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(p.paid_at ?? p.created_at)}</td>
              <td>
                {(p.organizations as unknown as { id: string; name: string } | null) ? (
                  <Link href={`/admin/organizations/${(p.organizations as unknown as { id: string }).id}?tab=subscription`} className="font-medium text-evergreen-900 hover:underline">
                    {(p.organizations as unknown as { name: string }).name}
                  </Link>
                ) : "—"}
                {(p.plans as unknown as { name: string } | null)?.name && (
                  <span className="block text-xs text-ink-soft">{(p.plans as unknown as { name: string }).name} · {p.billing_period}</span>
                )}
              </td>
              <td className="font-medium tabular-nums">{money(p.amount_cents, p.currency)}</td>
              <td className="font-mono text-xs">{p.transaction_ref}{p.payer_name && <span className="block font-sans text-ink-soft">{p.payer_name}</span>}</td>
              <td className="capitalize text-xs">{p.source ?? "portal"}</td>
              <td><StatusBadge status={p.status} /></td>
              <td>
                <Link href={`/admin/payments/${p.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Details / edit</Link>
              </td>
            </tr>
          ))}
          </Table>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={listed.length}
            pathname="/admin/payments"
            query={{ q: sp.q, status: sp.status, source: sp.source }}
            label="transactions"
          />
        </>
      )}
    </>
  );
}
