import { Badge, Button, ButtonLink, Card, Field, PageTitle, Textarea } from "@/components/ui";
import { getPaymentConfig } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { saveSetting } from "../actions";
import { savePaymentConfig } from "../actions/payments";

export const metadata: Metadata = { title: "Platform settings" };
export const dynamic = "force-dynamic";

const SETTING_META: Record<string, { title: string; badge: string; description: string }> = {
  super_admin: {
    title: "Primary Super Admin Descriptor",
    badge: "Identity metadata",
    description: "Identifies the Primary Super Admin (platform owner) account. Informational only: admin rights are granted explicitly at the database level and are never assigned by public registration.",
  },
  features: {
    title: "Raw Feature Gate Payload",
    badge: "System switches",
    description: "Underlying JSON object backing Modules & Features. Use the dedicated Modules & Features console for guided switch management.",
  },
  payment_instructions: {
    title: "Customer Billing & Transfer Instructions",
    badge: "Customer-facing",
    description: "Rendered on every organization's Billing & Plan page. Expected JSON shape: { \"methods\": [{ \"name\": \"...\", \"details\": \"...\" }], \"note\": \"...\" }.",
  },
  trial_days: {
    title: "Default Institutional Trial Window",
    badge: "Onboarding rule",
    description: "Default Premium trial length (in days) automatically provisioned for newly created organizations.",
  },
  support_email: {
    title: "Public Support Contact Address",
    badge: "Public contact",
    description: "Official support email address displayed across help and transactional surfaces.",
  },
};

export default async function AdminSettings({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; e?: string; ok?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin.from("platform_settings").select("*").order("key");
  const payConfig = await getPaymentConfig();
  const settings = (data ?? []).filter((s) => s.key !== "payment_config");

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Global Configuration"
        title="Platform settings"
        subtitle="Database-backed global configuration governing manual payment intake, customer billing instructions, onboarding trial windows and platform identity."
        action={
          <>
            <ButtonLink href="/admin/modules" variant="outline">Modules &amp; Features</ButtonLink>
            <ButtonLink href="/admin/plans" variant="outline">Subscription plans</ButtonLink>
          </>
        }
      />

      {sp.saved && (
        <p role="status" className="mb-4 rounded-xl bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900 ring-1 ring-evergreen-600/30">
          Platform setting saved and audit-logged.
        </p>
      )}
      {sp.ok === "payment_config" && (
        <p role="status" className="mb-4 rounded-xl bg-evergreen-50 px-4 py-3 text-sm font-medium text-evergreen-900 ring-1 ring-evergreen-600/30">
          Payment configuration saved — the Manual Payment intake form now offers these options.
        </p>
      )}
      {sp.e === "json" && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/30">
          Invalid JSON syntax — no changes were written to the database.
        </p>
      )}

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Badge tone="gold">Commerce intake options</Badge>
            <h2 className="mt-2 font-display text-xl font-semibold text-evergreen-950">Manual payment configuration</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Accepted payment rails, ISO currency codes and ledger categories offered when recording or verifying payments. Enter one value per line.
            </p>
          </div>
          <ButtonLink href="/admin/payments/new" variant="outline">Open manual payment form</ButtonLink>
        </div>
        <form action={savePaymentConfig} className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Payment methods" hint={`${payConfig.methods.length} configured`}>
            <Textarea name="methods" rows={6} defaultValue={payConfig.methods.join("\n")} />
          </Field>
          <Field label="Accepted currencies" hint={`${payConfig.currencies.length} configured`}>
            <Textarea name="currencies" rows={6} defaultValue={payConfig.currencies.join("\n")} />
          </Field>
          <Field label="Payment categories" hint={`${payConfig.categories.length} configured`}>
            <Textarea name="categories" rows={6} defaultValue={payConfig.categories.join("\n")} />
          </Field>
          <div className="sm:col-span-3 flex justify-end border-t border-evergreen-900/10 pt-4">
            <Button type="submit" variant="gold">Save payment configuration</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {settings.map((s) => {
          const meta = SETTING_META[s.key];
          const tall = s.key === "payment_instructions";
          return (
            <Card key={s.key} className={`p-6 ${tall ? "lg:col-span-2" : ""}`}>
              <form action={saveSetting}>
                <input type="hidden" name="key" value={s.key} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="green">{meta?.badge ?? "Platform key"}</Badge>
                      <code className="rounded bg-cream px-2 py-0.5 font-mono text-xs text-evergreen-900">{s.key}</code>
                    </div>
                    <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">
                      {meta?.title ?? s.key.replace(/_/g, " ")}
                    </h2>
                    {meta?.description && (
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{meta.description}</p>
                    )}
                  </div>
                  <Button type="submit" variant="gold">Save JSON</Button>
                </div>
                <Field label="Stored JSON value" className="mt-4">
                  <Textarea
                    name="value"
                    rows={tall ? 8 : 4}
                    className="font-mono text-xs"
                    defaultValue={JSON.stringify(s.value, null, 2)}
                  />
                </Field>
              </form>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 border-evergreen-900/15 bg-cream/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge tone="gray">Design system &amp; identity</Badge>
            <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">Platform brand tokens ({BRAND.name})</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-soft">
              Global brand name, tagline, typography and palette tokens are centralized in{" "}
              <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs">src/lib/brand.ts</code> and{" "}
              <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs">public/brand/</code>. Individual tenant logos and institution names remain isolated per organization in Organization Settings.
            </p>
          </div>
          <ButtonLink href="/admin/organizations/settings" variant="outline">Tenant settings</ButtonLink>
        </div>
      </Card>
    </>
  );
}
