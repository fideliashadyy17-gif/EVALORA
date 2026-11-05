import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { getEntitlement } from "@/lib/entitlements";
import { resolveCapabilities, CAPABILITY_LABELS } from "@/lib/capability-rules";
import { getFeatureFlags } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { adminCancelSubscription } from "../../../actions";
import { assignSubscription, subscriptionOp } from "../../../actions/payments";
import { Notice, Section, StatusBadge, Table } from "../../../ui";

export async function SubscriptionTab({
  orgId,
  sp,
  back,
}: {
  orgId: string;
  sp: { ok?: string; e?: string };
  back: string;
}) {
  const admin = createAdminClient();
  const [ent, { data: subs }, { data: plans }, { data: payments }] = await Promise.all([
    getEntitlement(admin, orgId),
    admin
      .from("subscriptions")
      .select("*, plans(name), granted_by_profile:profiles!subscriptions_granted_by_fkey(email)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("plans").select("id, name").eq("is_active", true).order("sort"),
    admin
      .from("payment_requests")
      .select("id, amount_cents, currency, status, source, transaction_ref, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const limitRows: [string, string][] = [
    ["Quizzes", String(ent.limits.max_quizzes)],
    ["Questions", String(ent.limits.max_questions)],
    ["Examinations", String(ent.limits.max_exams)],
    ["Members", String(ent.limits.max_members)],
    ["Participants / session", String(ent.limits.max_participants_per_session)],
    ["Proctoring", ent.limits.proctoring ? "Included" : "Not included"],
    ["Advanced reports", ent.limits.advanced_reports ? "Included" : "Not included"],
  ];

  // This is the customer's entitlement, not the owner's. It is resolved from
  // the same centralized rules used by server actions and the workspace page.
  const featureFlags = await getFeatureFlags();
  const customerCapabilities = resolveCapabilities({
    isSuperAdmin: false,
    planSlug: ent.planSlug,
    limits: ent.limits,
    featureFlags,
  });
  const institutionalRows = [
    "institutional_administration",
    "multi_class_operations",
    "central_asset_management",
    "configurable_limits",
    "imports_exports",
    "reports_analytics",
    "proctoring",
  ] as const;

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          subscription_assigned: "Subscription assigned and effective immediately.",
          subscription_extend: "Subscription extended.",
          subscription_set_end: "End date updated.",
          subscription_suspend: "Subscription suspended — the workspace falls back to Free limits.",
          subscription_reactivate: "Subscription reactivated.",
          subscription_limits: "Custom limits saved.",
          subscription_notes: "Notes saved.",
          json: "Custom limits must be valid JSON (e.g. {\"max_members\": 200}).",
          assign: "Choose a plan to assign.",
          assign_failed: "Assignment failed. Please try again.",
          date: "Pick a valid end date.",
          sub: "Subscription not found.",
        }}
      />

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Effective entitlement: {ent.planName}</h2>
            <p className="mt-0.5 text-sm capitalize text-ink-soft">
              Status {ent.status} · source {String(ent.source).replace(/_/g, " ")}
              {ent.trialEndsAt && ent.status === "trialing" ? ` · trial ends ${fmtDate(ent.trialEndsAt)}` : ""}
              {ent.currentPeriodEnd && ent.status === "active" ? ` · renews/ends ${fmtDate(ent.currentPeriodEnd)}` : ""}
            </p>
          </div>
          <StatusBadge status={ent.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {limitRows.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-evergreen-900/10 bg-cream p-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
              <p className="mt-0.5 font-display text-base font-semibold text-evergreen-950">{value === "-1" ? "Unlimited" : value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          When you operate this workspace yourself, your platform-owner access is unlimited regardless of these customer limits.
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Institutional / Enterprise capabilities</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              Customer-side capabilities for the effective <strong>{ent.planName}</strong> entitlement. These are distinct from Super Admin owner privileges.
            </p>
          </div>
          <StatusBadge status={customerCapabilities.institutional_administration ? "active" : "inactive"} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {institutionalRows.map((key) => (
            <div key={key} className="rounded-xl border border-evergreen-900/10 bg-cream p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{CAPABILITY_LABELS[key]}</p>
              <p className={`mt-0.5 font-display text-base font-semibold ${customerCapabilities[key] ? "text-evergreen-800" : "text-red-700"}`}>
                {customerCapabilities[key] ? "Included" : "Restricted"}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Super Admin inspection and management of these entitlements is always available and audit-logged. Assign the Institution plan or a custom limits override above to enable the full institutional feature set for this customer.
        </p>
      </Card>

      <Section title="Assign / upgrade / grant" hint="Assigning replaces the current active subscription. Grants and complimentary access are clearly labelled — never recorded as payments.">
        <Card className="p-6">
          <form action={assignSubscription} className="grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="organization_id" value={orgId} />
            <input type="hidden" name="back" value={back} />
            <Field label="Plan">
              <Select name="plan_id">
                {(plans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kind">
              <Select name="kind" defaultValue="grant">
                <option value="grant">Administrative grant (active)</option>
                <option value="complimentary">Complimentary Premium (active)</option>
                <option value="trial">Free trial</option>
              </Select>
            </Field>
            <Field label="Billing period (for records)">
              <Select name="billing_period" defaultValue="one_time">
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="one_time">One-time</option>
              </Select>
            </Field>
            <Field label="Starts"><Input name="starts_at" type="date" /></Field>
            <Field label="Ends (or use months →)"><Input name="ends_at" type="date" /></Field>
            <Field label="Length in months (if no end date)"><Input name="months" type="number" min={1} max={60} defaultValue={12} /></Field>
            <Field label="Trial days (trial kind)"><Input name="trial_days" type="number" min={1} max={365} defaultValue={14} /></Field>
            <Field label="Notes"><Input name="notes" placeholder="Reason for the grant" /></Field>
            <Field label="Custom limits override (JSON, optional)" hint='Merged over plan limits, e.g. {"max_members":200,"max_participants_per_session":300}'>
              <Input name="limits_override" placeholder='{"max_members": 200}' />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" variant="gold">Assign subscription</Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="Subscription history">
        {(subs ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No subscriptions recorded — the organization is on the Free plan.</p>
        ) : (
          <Table head={["Plan", "Status", "Source", "Period", "Controls"]}>
            {(subs ?? []).map((s) => {
              const granter = (s as { granted_by_profile?: { email: string } | null }).granted_by_profile;
              return (
                <tr key={s.id}>
                  <td>
                    <span className="font-medium text-ink">{(s.plans as unknown as { name: string } | null)?.name}</span>
                    {s.notes && <span className="block text-xs text-ink-soft">{s.notes}</span>}
                  </td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="text-xs capitalize">
                    {String(s.source ?? "paid").replace(/_/g, " ")}
                    {granter?.email && <span className="block normal-case text-ink-soft">by {granter.email}</span>}
                  </td>
                  <td className="text-xs text-ink-soft">
                    {fmtDate(s.current_period_start)} → {s.status === "trialing" ? fmtDate(s.trial_ends_at) : fmtDate(s.current_period_end)}
                    <span className="block capitalize">{s.billing_period.replace(/_/g, " ")}</span>
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer font-medium text-evergreen-700">Manage</summary>
                      <div className="mt-3 space-y-3 border-t border-evergreen-900/10 pt-3">
                        <form action={subscriptionOp} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="op" value="extend" />
                          <input type="hidden" name="back" value={back} />
                          <Field label="Extend by days"><Input name="days" type="number" min={1} defaultValue={30} className="w-24" /></Field>
                          <Button type="submit" variant="outline">Extend</Button>
                        </form>
                        <form action={subscriptionOp} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="op" value="set_end" />
                          <input type="hidden" name="back" value={back} />
                          <Field label="Set end date"><Input name="ends_at" type="date" /></Field>
                          <Button type="submit" variant="outline">Set</Button>
                        </form>
                        <div className="flex flex-wrap gap-2">
                          {["active", "trialing"].includes(s.status) && (
                            <form action={subscriptionOp}>
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="op" value="suspend" />
                              <input type="hidden" name="back" value={back} />
                              <Button type="submit" variant="outline">Suspend</Button>
                            </form>
                          )}
                          {s.status === "suspended" && (
                            <form action={subscriptionOp}>
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="op" value="reactivate" />
                              <input type="hidden" name="back" value={back} />
                              <Button type="submit" variant="outline">Reactivate</Button>
                            </form>
                          )}
                          {["active", "trialing", "suspended"].includes(s.status) && (
                            <form action={adminCancelSubscription}>
                              <input type="hidden" name="id" value={s.id} />
                              <Button type="submit" variant="danger">Cancel</Button>
                            </form>
                          )}
                        </div>
                        <form action={subscriptionOp} className="space-y-2">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="op" value="limits" />
                          <input type="hidden" name="back" value={back} />
                          <Field label="Custom limits override (JSON — empty clears)">
                            <Textarea name="limits_override" rows={2} defaultValue={s.limits_override ? JSON.stringify(s.limits_override) : ""} />
                          </Field>
                          <Button type="submit" variant="outline">Save limits</Button>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Recent payments for this organization">
        {(payments ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No payments recorded for this organization.</p>
        ) : (
          <Table head={["Reference", "Amount", "Source", "Status", "Recorded"]}>
            {(payments ?? []).map((p) => (
              <tr key={p.id}>
                <td><a href={`/admin/payments/${p.id}`} className="font-medium text-evergreen-900 hover:underline">{p.transaction_ref}</a></td>
                <td>{(p.amount_cents / 100).toFixed(2)} {p.currency}</td>
                <td className="capitalize">{p.source}</td>
                <td><StatusBadge status={p.status} /></td>
                <td className="text-xs text-ink-soft">{fmtDate(p.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
