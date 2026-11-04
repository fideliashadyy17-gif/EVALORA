import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { getPaymentConfig } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, money } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProofUrl, reviewPayment } from "../../actions";
import { setPaymentStatusAdmin, updatePayment } from "../../actions/payments";
import { ConfirmField, Notice, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: p }, { data: plans }, config, { data: trail }] = await Promise.all([
    admin
      .from("payment_requests")
      .select("*, plans(name), organizations(id, name), submitter:profiles!payment_requests_submitted_by_fkey(full_name, email), reviewer:profiles!payment_requests_reviewed_by_fkey(full_name, email)")
      .eq("id", id)
      .maybeSingle(),
    admin.from("plans").select("id, name").order("sort"),
    getPaymentConfig(),
    admin.from("audit_logs").select("action, created_at, metadata, profiles(email)").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (!p) notFound();

  const proofUrl = p.proof_url ? await getProofUrl(p.proof_url) : null;
  const org = p.organizations as unknown as { id: string; name: string } | null;
  const submitter = p.submitter as unknown as { full_name: string | null; email: string } | null;
  const reviewer = p.reviewer as unknown as { full_name: string | null; email: string } | null;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/payments" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">← All payments</Link>
      </p>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          recorded: "Payment recorded.",
          saved: "Payment updated (before/after values are in the audit trail).",
          status_refunded: "Payment marked refunded.",
          status_cancelled: "Payment record cancelled.",
          status_pending: "Payment moved back to pending.",
          status_rejected: "Payment rejected.",
          confirm: "Tick the confirmation box for status changes.",
          status: "That status change is not available here.",
          duplicate_ref: "That transaction reference is already used by another payment for this organization — the change was not saved.",
          failed: "The change could not be saved. Please check the values and try again.",
        }}
      />

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold text-evergreen-950">{money(p.amount_cents, p.currency)}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Ref <span className="font-mono font-semibold text-evergreen-800">{p.transaction_ref}</span> · {p.method ?? "—"} ·{" "}
              {org && <Link href={`/admin/organizations/${org.id}?tab=subscription`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">{org.name}</Link>}
              {(p.plans as unknown as { name: string } | null)?.name ? ` → ${(p.plans as unknown as { name: string }).name} (${p.billing_period})` : " · no plan attached"}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Source: <span className="capitalize">{p.source ?? "portal"}</span>
              {p.payer_name && <> · Payer: {p.payer_name}</>}
              {p.paid_at && <> · Paid {fmtDate(p.paid_at)}</>}
              {" "}· Recorded {fmtDateTime(p.created_at)} by {submitter?.full_name || submitter?.email || "system"}
              {reviewer && <> · Reviewed by {reviewer.full_name || reviewer.email} {p.reviewed_at ? `on ${fmtDateTime(p.reviewed_at)}` : ""}</>}
            </p>
            {p.description && <p className="mt-2 text-sm text-ink">{p.description}</p>}
            {proofUrl && (
              <a href={proofUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-evergreen-700 underline underline-offset-2">
                View / download payment proof ↗
              </a>
            )}
          </div>
          <StatusBadge status={p.status} />
        </div>

        {p.status === "pending" && (
          <form action={reviewPayment} className="mt-5 flex flex-wrap items-end gap-2 border-t border-evergreen-900/10 pt-4">
            <input type="hidden" name="id" value={id} />
            <Field label="Note / rejection reason" className="min-w-56 flex-1"><Input name="note" placeholder="Visible to the organization on rejection" /></Field>
            <Button type="submit" name="decision" value="approve" variant="gold">✓ Approve{p.plan_id ? " & activate subscription" : ""}</Button>
            <Button type="submit" name="decision" value="reject" variant="danger">✕ Reject</Button>
          </form>
        )}
      </Card>

      <Section title="Edit record" hint="Every edit is written to the audit trail with before/after values. Moving a pending payment to approved activates its plan once.">
        <Card className="p-6">
          <form action={updatePayment} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={id} />
            <Field label="Payer name"><Input name="payer_name" defaultValue={p.payer_name ?? ""} /></Field>
            <Field label="Amount"><Input name="amount" type="number" step="0.01" min={0} defaultValue={(p.amount_cents / 100).toFixed(2)} /></Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={p.currency}>
                {config.currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {!config.currencies.includes(p.currency) && <option value={p.currency}>{p.currency}</option>}
              </Select>
            </Field>
            <Field label="Method">
              <Select name="method" defaultValue={p.method ?? config.methods[0]}>
                {config.methods.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {p.method && !config.methods.includes(p.method) && <option value={p.method}>{p.method}</option>}
              </Select>
            </Field>
            <Field label="Transaction reference"><Input name="transaction_ref" defaultValue={p.transaction_ref} /></Field>
            <Field label="Payment date"><Input name="paid_at" type="date" defaultValue={p.paid_at ? String(p.paid_at).slice(0, 10) : ""} /></Field>
            <Field label="Related plan">
              <Select name="plan_id" defaultValue={p.plan_id ?? ""}>
                <option value="">— No plan —</option>
                {(plans ?? []).map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={p.status}>
                {["pending", "approved", "rejected", "expired", "refunded", "cancelled"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Replace proof"><Input name="proof" type="file" /></Field>
            <Field label="Description"><Input name="description" defaultValue={p.description ?? ""} /></Field>
            <Field label="Administrative notes" className="sm:col-span-2"><Textarea name="admin_note" rows={2} defaultValue={p.admin_note ?? ""} /></Field>
            <div className="sm:col-span-2"><Button type="submit">Save payment</Button></div>
          </form>
        </Card>
      </Section>

      {p.status !== "pending" && (
        <Section title="Refund / cancel">
          <Card className="p-6">
            <form action={setPaymentStatusAdmin} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={id} />
              <Field label="New status">
                <Select name="status" defaultValue="refunded">
                  <option value="refunded">Refunded (money returned)</option>
                  <option value="cancelled">Cancelled (incorrect record)</option>
                  <option value="rejected">Rejected</option>
                  <option value="pending">Back to pending</option>
                </Select>
              </Field>
              <Field label="Reason note" className="min-w-[220px] flex-1"><Input name="note" placeholder="Why?" /></Field>
              <ConfirmField label="Confirm status change" />
              <Button type="submit" variant="danger">Apply</Button>
            </form>
          </Card>
        </Section>
      )}

      <Section title="Immutable audit trail">
        {(trail ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No audit entries for this record yet.</p>
        ) : (
          <Table head={["When", "Action", "Actor", "Details"]}>
            {(trail ?? []).map((t, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(t.created_at)}</td>
                <td className="font-medium">{t.action}</td>
                <td className="text-xs text-ink-soft">{(t.profiles as unknown as { email: string } | null)?.email ?? "system"}</td>
                <td className="max-w-[320px] truncate font-mono text-[11px] text-ink-soft">{JSON.stringify(t.metadata ?? {})}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
