import { Button, Card, Field, Input, PageTitle, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { savePlan } from "../actions";

export const metadata: Metadata = { title: "Plans & Limits" };
export const dynamic = "force-dynamic";

const LIMIT_HINT = `{
  "max_quizzes": -1,
  "max_participants_per_session": 500,
  "max_exams": -1,
  "max_members": 50,
  "max_questions": -1,
  "proctoring": true,
  "advanced_reports": true,
  "storage_mb": 5120,
  "institutional": false,
  "max_classes": -1,
  "max_students": -1,
  "multi_class_operations": true,
  "central_asset_management": false,
  "configurable_limits": false
}`;

export default async function AdminPlans() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: plans } = await admin.from("plans").select("*").order("sort");

  return (
    <>
      <PageTitle title="Plans & Limits" subtitle="Limits are JSON — use -1 for unlimited. Changes apply immediately to every organization's entitlement checks (all server-side)." />
      <div className="space-y-6">
        {(plans ?? []).map((p) => (
          <Card key={p.id} className="p-6">
            <form action={savePlan} className="grid gap-4 lg:grid-cols-2">
              <input type="hidden" name="id" value={p.id} />
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-lg font-semibold text-evergreen-950">{p.name}</h2>
                  <code className="rounded bg-cream px-2 py-0.5 text-xs">{p.slug}</code>
                </div>
                <Field label="Display name"><Input name="name" defaultValue={p.name} required /></Field>
                <Field label="Description"><Textarea name="description" rows={2} defaultValue={p.description ?? ""} /></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Monthly price"><Input name="price_monthly" type="number" step="0.01" min={0} defaultValue={p.price_monthly_cents / 100} /></Field>
                  <Field label="Yearly price"><Input name="price_yearly" type="number" step="0.01" min={0} defaultValue={p.price_yearly_cents / 100} /></Field>
                  <Field label="Currency"><Input name="currency" defaultValue={p.currency} maxLength={3} /></Field>
                </div>
                <Field label="Trial days"><Input name="trial_days" type="number" min={0} max={90} defaultValue={p.trial_days} className="w-28" /></Field>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="is_active" defaultChecked={p.is_active} className="h-5 w-5 accent-evergreen-700" /> Active (visible on pricing)
                </label>
              </div>
              <div className="space-y-3">
                <Field label="Limits (JSON)" hint="-1 = unlimited. Booleans gate whole features.">
                  <Textarea name="limits" rows={9} className="font-mono text-xs" defaultValue={JSON.stringify(p.limits, null, 2)} />
                </Field>
                <Field label="Features (one per line)">
                  <Textarea name="features" rows={4} defaultValue={((p.features as string[]) ?? []).join("\n")} />
                </Field>
              </div>
              <div className="lg:col-span-2"><Button type="submit" variant="gold">Save {p.name}</Button></div>
            </form>
          </Card>
        ))}

        <Card className="border-dashed p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Create a new plan</h2>
          <form action={savePlan} className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Slug"><Input name="slug" placeholder="e.g. district" required /></Field>
              <Field label="Display name"><Input name="name" required /></Field>
              <Field label="Description"><Textarea name="description" rows={2} /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Monthly"><Input name="price_monthly" type="number" step="0.01" defaultValue={0} /></Field>
                <Field label="Yearly"><Input name="price_yearly" type="number" step="0.01" defaultValue={0} /></Field>
                <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} /></Field>
              </div>
              <Field label="Trial days"><Input name="trial_days" type="number" defaultValue={14} className="w-28" /></Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="is_active" defaultChecked className="h-5 w-5 accent-evergreen-700" /> Active
              </label>
            </div>
            <div className="space-y-3">
              <Field label="Limits (JSON)"><Textarea name="limits" rows={9} className="font-mono text-xs" defaultValue={LIMIT_HINT} /></Field>
              <Field label="Features (one per line)"><Textarea name="features" rows={4} /></Field>
            </div>
            <div className="lg:col-span-2"><Button type="submit">Create plan</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
