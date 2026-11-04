import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { getPaymentConfig } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import type { Metadata } from "next";
import { createManualPayment } from "../../actions/payments";
import { Notice } from "../../ui";

export const metadata: Metadata = { title: "Add payment" };
export const dynamic = "force-dynamic";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; org?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const [{ data: orgs }, { data: plans }, config] = await Promise.all([
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("plans").select("id, name, price_monthly_cents, price_yearly_cents, currency").eq("is_active", true).order("sort"),
    getPaymentConfig(),
  ]);

  return (
    <>
      <PageTitle
        title="Add a payment"
        subtitle="Record money received outside the portal — bank transfer, mobile money, cash or deposit. Approving a plan payment activates the subscription."
        action={<ButtonLink href="/admin/payments" variant="outline">← All payments</ButtonLink>}
      />
      <Notice
        e={sp.e}
        messages={{
          org: "Choose the paying organization.",
          amount: "Enter an amount greater than zero.",
          duplicate_ref: "That reference is already recorded for this organization — check Payments before adding it again.",
          failed: "The payment could not be recorded.",
        }}
      />

      <Card className="max-w-4xl p-6">
        <form action={createManualPayment} className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization *">
            <Select name="organization_id" defaultValue={sp.org ?? ""}>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Payer name"><Input name="payer_name" placeholder="Person or office that paid" /></Field>
          <Field label="Amount *"><Input name="amount" type="number" step="0.01" min={0} required placeholder="e.g. 190.00" /></Field>
          <Field label="Currency">
            <Select name="currency" defaultValue={config.currencies[0] ?? "USD"}>
              {config.currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Payment method">
            <Select name="method" defaultValue={config.methods[0]}>
              {config.methods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Transaction reference" hint="Bank/mobile-money receipt reference. Leave empty to generate one.">
            <Input name="transaction_ref" />
          </Field>
          <Field label="Payment date"><Input name="paid_at" type="date" /></Field>
          <Field label="Category">
            <Select name="category" defaultValue={config.categories[0]}>
              {config.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Related plan (activates on approval)">
            <Select name="plan_id" defaultValue="">
              <option value="">— No plan (service / other) —</option>
              {(plans ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.price_monthly_cents, p.currency)}/mo · {money(p.price_yearly_cents, p.currency)}/yr
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Billing period">
            <Select name="billing_period" defaultValue="monthly">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="one_time">One-time</option>
            </Select>
          </Field>
          <Field label="Record status">
            <Select name="status" defaultValue="approved">
              <option value="approved">Verified — count as revenue now</option>
              <option value="pending">Pending verification</option>
            </Select>
          </Field>
          <Field label="Record type">
            <Select name="source" defaultValue="manual">
              <option value="manual">Manual payment (external money received)</option>
              <option value="adjustment">Internal administrative adjustment</option>
            </Select>
          </Field>
          <Field label="Proof / receipt (optional)"><Input name="proof" type="file" /></Field>
          <Field label="Description"><Input name="description" placeholder="e.g. Premium yearly — paid at agency" /></Field>
          <Field label="Administrative notes" className="sm:col-span-2">
            <Textarea name="admin_note" rows={2} placeholder="Internal only" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="gold">Record payment</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
