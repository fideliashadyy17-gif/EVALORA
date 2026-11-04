import { Badge, Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import { grantSubscription, setOrgStatus } from "../actions";

export const metadata: Metadata = { title: "Organizations" };
export const dynamic = "force-dynamic";

export default async function AdminOrganizations() {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [{ data: orgs }, { data: plans }] = await Promise.all([
    admin
      .from("organizations")
      .select("*, organization_members(id), quizzes(id), exams(id), subscriptions(status, plans(name, slug), trial_ends_at, current_period_end)")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("plans").select("id, name").eq("is_active", true).order("sort"),
  ]);

  return (
    <>
      <PageTitle title="Organizations" subtitle="Tenants of the platform. Grant complimentary subscriptions (institutional contracts) or suspend abusive workspaces." />
      <div className="space-y-4">
        {(orgs ?? []).map((o) => {
          const sub = ((o.subscriptions as { status: string; plans: { name: string; slug: string } | null; trial_ends_at: string | null; current_period_end: string | null }[]) ?? [])
            .find((s) => ["active", "trialing"].includes(s.status));
          return (
            <Card key={o.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold text-evergreen-950">{o.name}</p>
                  <p className="text-sm text-ink-soft">
                    {o.type.replace(/_/g, " ")} · since {fmtDate(o.created_at)} · {(o.organization_members as unknown[])?.length ?? 0} members · {(o.quizzes as unknown[])?.length ?? 0} quizzes · {(o.exams as unknown[])?.length ?? 0} exams
                  </p>
                  <p className="mt-1 text-sm">
                    {sub ? (
                      <><Badge tone="gold">{sub.plans?.name}</Badge> <span className="capitalize text-ink-soft">{sub.status}{sub.trial_ends_at && sub.status === "trialing" ? ` until ${fmtDate(sub.trial_ends_at)}` : ""}{sub.current_period_end && sub.status === "active" ? ` until ${fmtDate(sub.current_period_end)}` : ""}</span></>
                    ) : (
                      <Badge tone="gray">Free</Badge>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={o.status === "active" ? "green" : "red"}>{o.status}</Badge>
                  <form action={setOrgStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value={o.status === "active" ? "suspended" : "active"} />
                    <button className={`text-sm font-medium underline-offset-2 hover:underline ${o.status === "active" ? "text-red-700" : "text-evergreen-700"}`}>
                      {o.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </form>
                </div>
              </div>
              <form action={grantSubscription} className="mt-4 flex flex-wrap items-end gap-2 border-t border-evergreen-900/10 pt-4">
                <input type="hidden" name="organization_id" value={o.id} />
                <Field label="Grant plan">
                  <Select name="plan_id">
                    {(plans ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Months">
                  <Input name="months" type="number" min={1} max={60} defaultValue={12} className="w-24" />
                </Field>
                <Button type="submit" variant="outline">Grant subscription</Button>
              </form>
            </Card>
          );
        })}
        {(orgs ?? []).length === 0 && <p className="text-sm text-ink-soft">No organizations yet.</p>}
      </div>
    </>
  );
}
