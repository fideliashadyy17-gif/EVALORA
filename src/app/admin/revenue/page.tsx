import { ExportButton, PrintButton } from "@/components/ExportTools";
import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Card, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, money, toCsv } from "@/lib/utils";
import type { Metadata } from "next";
import { Section, Table } from "../ui";

export const metadata: Metadata = { title: "Revenue & Reports" };
export const dynamic = "force-dynamic";

export default async function AdminRevenue({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  const [approved, counts, subs] = await Promise.all([
    admin
      .from("payment_requests")
      .select("amount_cents, currency, billing_period, transaction_ref, created_at, reviewed_at, organizations(name), plans(name)")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1000),
    Promise.all(
      ["pending", "approved", "rejected", "expired", "refunded"].map((s) =>
        admin.from("payment_requests").select("id", { count: "exact", head: true }).eq("status", s).then((r) => [s, r.count ?? 0] as const),
      ),
    ),
    admin.from("subscriptions").select("status, plans(name)").in("status", ["active", "trialing"]).limit(1000),
  ]);

  const rows = approved.data ?? [];
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount_cents);

  // Monthly revenue (last 12 months, by review/creation date), first currency grouping kept simple & explicit.
  const months = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const d = new Date(r.reviewed_at ?? r.created_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) months.set(key, new Map());
    const m = months.get(key)!;
    m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount_cents);
  }
  const monthRows = [...months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12);

  const dist = new Map<string, { active: number; trialing: number }>();
  for (const s of subs.data ?? []) {
    const name = (s.plans as { name?: string } | null)?.name ?? "Plan";
    const d = dist.get(name) ?? { active: 0, trialing: 0 };
    if (s.status === "active") d.active++; else d.trialing++;
    dist.set(name, d);
  }

  const csv = toCsv([
    ["Date", "Organization", "Plan", "Billing", "Amount (cents)", "Currency", "Reference"],
    ...rows.map((r) => [
      fmtDate(r.created_at),
      (r.organizations as { name?: string } | null)?.name ?? "",
      (r.plans as { name?: string } | null)?.name ?? "",
      r.billing_period,
      r.amount_cents,
      r.currency,
      r.transaction_ref,
    ]),
  ]);

  const totalLabel = [...totals.entries()].map(([c, v]) => money(v, c)).join(" · ") || money(0, "USD");

  return (
    <>
      <PageTitle
        eyebrow="Commerce & Entitlements · Recognized Revenue"
        title="Revenue & commercial reports"
        subtitle="Real figures from approved manual payments only — pending submissions never count as revenue."
        action={<span className="flex gap-2"><ExportButton filename="evalora-approved-payments.csv" csv={csv} /><PrintButton /></span>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recognized revenue (approved)" value={totalLabel} />
        <StatCard label="Approved payments" value={rows.length} />
        {counts.slice(0, 2).map(([s, n]) => (
          <StatCard key={s} label={s === "pending" ? "Awaiting review" : "Approved (all time)"} value={n} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Monthly revenue</h2>
          {monthRows.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No approved payments yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
              {monthRows.map(([m, byCur]) => (
                <li key={m} className="flex items-center justify-between py-2">
                  <span className="font-medium">{m}</span>
                  <span className="tabular-nums">{[...byCur.entries()].map(([c, v]) => money(v, c)).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-6 font-display text-lg font-semibold text-evergreen-950">Payment pipeline</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {counts.map(([s, n]) => (
              <Badge key={s} tone={s === "approved" ? "green" : s === "pending" ? "amber" : "gray"}>{s}: {n}</Badge>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Subscription distribution</h2>
          {dist.size === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No active or trialing subscriptions yet.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {[...dist.entries()].map(([name, d]) => {
                const total = d.active + d.trialing;
                const max = Math.max(...[...dist.values()].map((x) => x.active + x.trialing), 1);
                return (
                  <li key={name}>
                    <div className="mb-1 flex justify-between">
                      <span className="font-medium">{name}</span>
                      <span className="text-ink-soft">{d.active} paid · {d.trialing} trial</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-evergreen-100">
                      <div className="h-full bg-evergreen-700" style={{ width: `${(total / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Section title="Approved payment ledger" hint="Paginated recognized-revenue ledger across all organizations.">
        <Table head={["Date", "Organization", "Plan", "Amount", "Reference"]}>
          {rows.slice((page - 1) * pageSize, page * pageSize).map((r, i) => (
            <tr key={i}>
              <td className="text-ink-soft">{fmtDate(r.created_at)}</td>
              <td className="font-medium text-evergreen-950">{(r.organizations as { name?: string } | null)?.name ?? "—"}</td>
              <td>{(r.plans as { name?: string } | null)?.name ?? "—"} <span className="text-ink-soft">({r.billing_period})</span></td>
              <td className="font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</td>
              <td className="font-mono text-xs">{r.transaction_ref}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-soft">No approved payments yet.</td></tr>
          )}
        </Table>
        <PageNavigation
          page={page}
          pageSize={pageSize}
          total={rows.length}
          pathname="/admin/revenue"
          label="approved payments"
        />
      </Section>
    </>
  );
}
