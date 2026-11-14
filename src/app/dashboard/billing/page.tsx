import { Badge, Button, Card, DataTable, Field, Input, PageTitle, Select } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { getEntitlementFor } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, money } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { submitPayment } from "./actions";

export const metadata: Metadata = { title: "Billing & Plan" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "amber" | "green" | "red" | "gray"> = {
  pending: "amber", approved: "green", rejected: "red", expired: "gray", refunded: "gray",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; e?: string; plan?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();

  const [{ data: plans }, { data: payments }, { data: setting }, ent, usage] = await Promise.all([
    supabase.from("plans").select("*").eq("is_active", true).order("sort"),
    supabase.from("payment_requests").select("*, plans(name)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("platform_settings").select("value").eq("key", "payment_instructions").maybeSingle(),
    getEntitlementFor(supabase, ctx, org.id),
    Promise.all([
      supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
      supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    ]),
  ]);

  const instructions = (setting?.value ?? {}) as { methods?: { name: string; details: string }[]; note?: string };
  const paidPlans = (plans ?? []).filter((p) => p.price_monthly_cents > 0);
  const selectedPlanId = sp.plan ?? paidPlans[0]?.id;

  const usageRows = [
    ["Quizzes", usage[0].count ?? 0, ent.limits.max_quizzes],
    ["Questions", usage[1].count ?? 0, ent.limits.max_questions],
    ["Examinations", usage[2].count ?? 0, ent.limits.max_exams],
    ["Team members", usage[3].count ?? 0, ent.limits.max_members],
  ] as const;

  return (
    <>
      <PageTitle
        eyebrow="Workspace Administration · Entitlements & Verification"
        title="Billing & Plan"
        subtitle="Your entitlement is enforced on the server. Paid plans activate only after manual payment verification."
      />
      {sp.submitted && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Payment submitted and now <strong>pending verification</strong>. You&apos;ll be notified as soon as our team reviews it — paid features activate only after approval.
        </p>
      )}
      {sp.e && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Something needs attention — please check the form and try again.</p>}

      <Card className="mb-6 border-evergreen-700/30 bg-evergreen-50 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="gold" className="px-3 py-1 text-sm">{ent.planName}</Badge>
          <span className="font-medium capitalize text-ink">{ent.status}</span>
          {ent.trialEndsAt && ent.status === "trialing" && <span className="text-sm text-ink-soft">Trial ends {fmtDate(ent.trialEndsAt)}</span>}
          {ent.currentPeriodEnd && ent.status === "active" && <span className="text-sm text-ink-soft">Renews / ends {fmtDate(ent.currentPeriodEnd)}</span>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {usageRows.map(([label, used, limit]) => (
            <div key={label} className="rounded-xl border border-evergreen-900/10 bg-paper p-3">
              <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
              <p className="mt-0.5 font-display text-xl font-semibold text-evergreen-950">{used} <span className="text-sm font-normal text-ink-soft">/ {limit === -1 ? "∞" : limit}</span></p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Video proctoring: {ent.limits.proctoring ? "included" : "not included"} · Advanced reports: {ent.limits.advanced_reports ? "included" : "not included"} · Up to {ent.limits.max_participants_per_session === -1 ? "unlimited" : ent.limits.max_participants_per_session} participants per live session
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Institutional / Enterprise: {ent.limits.institutional ? "included" : "not included"} · Multi-class operations: {ent.limits.multi_class_operations ? "included" : "restricted"} · Centralized resources: {ent.limits.central_asset_management ? "included" : "restricted"} · Configurable limits: {ent.limits.configurable_limits ? "included" : "restricted"} · Classes: {ent.limits.max_classes === -1 ? "unlimited" : ent.limits.max_classes} · Students: {ent.limits.max_students === -1 ? "unlimited" : ent.limits.max_students}
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-3">
        {(plans ?? []).map((p) => (
          <Card key={p.id} className={p.slug === ent.planSlug ? "border-2 border-evergreen-700 p-6" : "p-6"}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">{p.name}</h2>
              {p.slug === ent.planSlug && <Badge tone="green">Current</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-soft">{p.description}</p>
            <p className="mt-3 font-display text-3xl font-bold text-evergreen-900">
              {money(p.price_monthly_cents, p.currency)}<span className="text-sm font-normal text-ink-soft">/mo</span>
            </p>
            <p className="text-xs text-ink-soft">or {money(p.price_yearly_cents, p.currency)}/year</p>
            <ul className="mt-3 space-y-1.5">
              {((p.features as string[]) ?? []).slice(0, 5).map((f) => (
                <li key={f} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-600" />{f}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {isManager ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">1 · Make your payment</h2>
            {(instructions.methods ?? []).map((m) => (
              <div key={m.name} className="mt-3 rounded-xl bg-cream p-4">
                <p className="font-semibold text-evergreen-950">{m.name}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{m.details}</p>
              </div>
            ))}
            <p className="mt-3 text-sm text-ink-soft">{instructions.note}</p>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">2 · Submit your reference</h2>
            <form action={submitPayment} className="mt-4 space-y-3" encType="multipart/form-data">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Plan">
                  <Select name="plan_id" defaultValue={selectedPlanId} required>
                    {paidPlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Billing period">
                  <Select name="billing_period" defaultValue="monthly">
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </Select>
                </Field>
              </div>
              <Field label="Payment method used">
                <Input name="method" placeholder="e.g. Mobile Money / Bank transfer" />
              </Field>
              <Field label="Transaction reference" hint="Exactly as it appears on your receipt — our team verifies this.">
                <Input name="transaction_ref" required placeholder="e.g. MP260404.1032.A12345" />
              </Field>
              <Field label="Payment proof (optional, image/PDF ≤ 5 MB)">
                <Input name="proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />
              </Field>
              <Button type="submit" variant="gold" className="w-full py-3">Submit for verification</Button>
              <p className="text-xs text-ink-soft">
                Submitting does <strong>not</strong> activate anything by itself. A Super Admin reviews
                every request; you&apos;re notified on approval or rejection (with a reason).
              </p>
            </form>
          </Card>
        </div>
      ) : (
        <Card className="mt-6 p-6">
          <p className="text-sm text-ink-soft">Billing is managed by your organization owner or administrators.</p>
        </Card>
      )}

      <Card className="mt-6 p-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-evergreen-950">Payment history</h2>
        {(payments ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No payment requests yet.</p>
        ) : (
          <DataTable head={["Submitted", "Plan", "Amount", "Reference", "Status"]} label="Payment request history">
            {(payments ?? []).map((p) => (
              <tr key={p.id}>
                <td className="text-ink-soft">{fmtDateTime(p.created_at)}</td>
                <td>{(p.plans as { name: string } | null)?.name} ({p.billing_period})</td>
                <td className="tabular-nums">{money(p.amount_cents, p.currency)}</td>
                <td className="font-mono text-xs">{p.transaction_ref}</td>
                <td>
                  <Badge tone={STATUS_TONE[p.status] ?? "gray"}>{p.status}</Badge>
                  {p.status === "rejected" && p.rejection_reason && (
                    <span className="block text-xs text-red-700">{p.rejection_reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
