import { Button, Card, Field, Input, PageTitle, Select, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { adminCancelSubscription } from "../actions";
import { assignSubscription, subscriptionOp } from "../actions/payments";
import { ConfirmField, Notice, StatusBadge, Table } from "../ui";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

export default async function AdminSubscriptions({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; ok?: string; e?: string; saved?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("subscriptions")
    .select("*, organizations(id, name), plans(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.source) query = query.eq("source", sp.source);
  const [{ data: subs }, { data: orgs }, { data: plans }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("plans").select("id, name").eq("is_active", true).order("sort"),
  ]);

  return (
    <>
      <PageTitle
        title="Subscriptions"
        subtitle="Assign plans, grant complimentary Premium and override limits — without any customer checkout. Grants are labelled as grants, never as payments."
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          subscription_assigned: "Subscription assigned and effective immediately.",
          subscription_extend: "Subscription extended.",
          subscription_set_end: "End date updated.",
          subscription_suspend: "Subscription suspended.",
          subscription_reactivate: "Subscription reactivated.",
          subscription_limits: "Custom limits saved.",
          json: "Custom limits must be valid JSON.",
          assign: "Choose an organization and a plan.",
          assign_failed: "Assignment failed.",
          confirm: "Tick the confirmation box before cancelling.",
          date: "Pick a valid end date.",
        }}
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}

      <Card className="mb-8 p-6" >
        <h2 id="assign" className="font-display text-lg font-semibold text-evergreen-950">Assign a subscription</h2>
        <p className="mt-1 text-sm text-ink-soft">Replaces the organization&apos;s current active/trialing subscription.</p>
        <form action={assignSubscription} className="mt-4 grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="back" value="/admin/subscriptions" />
          <Field label="Organization *">
            <Select name="organization_id">
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Plan *">
            <Select name="plan_id">
              {(plans ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Kind">
            <Select name="kind" defaultValue="grant">
              <option value="grant">Administrative grant</option>
              <option value="complimentary">Complimentary Premium</option>
              <option value="trial">Free trial</option>
            </Select>
          </Field>
          <Field label="Starts"><Input name="starts_at" type="date" /></Field>
          <Field label="Ends (or months →)"><Input name="ends_at" type="date" /></Field>
          <Field label="Months"><Input name="months" type="number" min={1} max={60} defaultValue={12} /></Field>
          <Field label="Trial days"><Input name="trial_days" type="number" min={1} max={365} defaultValue={14} /></Field>
          <Field label="Notes"><Input name="notes" placeholder="Reason for the grant" /></Field>
          <Field label="Custom limits (JSON, optional)" hint='e.g. {"max_members":200}'>
            <Input name="limits_override" placeholder='{"max_members": 200}' />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="gold">Assign subscription</Button>
          </div>
        </form>
      </Card>

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Select name="status" defaultValue={sp.status ?? ""} className="w-48" aria-label="Filter by status">
          <option value="">All statuses</option>
          {["trialing", "active", "past_due", "suspended", "expired", "cancelled"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select name="source" defaultValue={sp.source ?? ""} className="w-52" aria-label="Filter by source">
          <option value="">All sources</option>
          <option value="paid">Paid</option>
          <option value="admin_grant">Administrative grants</option>
          <option value="complimentary">Complimentary</option>
          <option value="trial">Trials</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        <span className="ml-auto self-center text-sm text-ink-soft">{subs?.length ?? 0} shown</span>
      </form>

      {(subs ?? []).length === 0 ? (
        <p className="text-sm text-ink-soft">No subscriptions match. Assign one above — it takes effect immediately.</p>
      ) : (
        <Table head={["Organization", "Plan", "Status", "Source", "Period", "Controls"]}>
          {(subs ?? []).map((s) => {
            const org = s.organizations as unknown as { id: string; name: string } | null;
            return (
              <tr key={s.id}>
                <td>
                  {org ? (
                    <Link href={`/admin/organizations/${org.id}?tab=subscription`} className="font-medium text-evergreen-900 hover:underline">{org.name}</Link>
                  ) : "—"}
                  {s.limits_override && <span className="block text-xs text-gold-800">custom limits</span>}
                </td>
                <td className="font-medium">{(s.plans as unknown as { name: string } | null)?.name}</td>
                <td><StatusBadge status={s.status} /></td>
                <td className="text-xs capitalize">{String(s.source ?? "paid").replace(/_/g, " ")}</td>
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
                        <input type="hidden" name="back" value="/admin/subscriptions" />
                        <Field label="Extend by days"><Input name="days" type="number" min={1} defaultValue={30} className="w-24" /></Field>
                        <Button type="submit" variant="outline">Extend</Button>
                      </form>
                      <div className="flex flex-wrap gap-2">
                        {["active", "trialing"].includes(s.status) && (
                          <form action={subscriptionOp}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="op" value="suspend" />
                            <input type="hidden" name="back" value="/admin/subscriptions" />
                            <Button type="submit" variant="outline">Suspend</Button>
                          </form>
                        )}
                        {s.status === "suspended" && (
                          <form action={subscriptionOp}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="op" value="reactivate" />
                            <input type="hidden" name="back" value="/admin/subscriptions" />
                            <Button type="submit" variant="outline">Reactivate</Button>
                          </form>
                        )}
                        {["active", "trialing", "suspended"].includes(s.status) && (
                          <form action={adminCancelSubscription} className="flex items-end gap-2">
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmField label="Cancel" />
                            <Button type="submit" variant="danger">Cancel subscription</Button>
                          </form>
                        )}
                      </div>
                      <form action={subscriptionOp} className="space-y-2">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="op" value="limits" />
                        <input type="hidden" name="back" value="/admin/subscriptions" />
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
    </>
  );
}
