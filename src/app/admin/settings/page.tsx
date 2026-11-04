import { Button, Card, Field, PageTitle, Textarea } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { saveSetting } from "../actions";

export const metadata: Metadata = { title: "Platform settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettings({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin.from("platform_settings").select("*").order("key");

  return (
    <>
      <PageTitle title="Platform settings" subtitle="Global configuration stored in the database. Values are JSON — take care with the payment instructions shown to every customer." />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Setting saved.</p>}
      {sp.e === "json" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Invalid JSON — nothing was saved.</p>}

      <div className="space-y-5">
        {(data ?? []).map((s) => (
          <Card key={s.key} className="p-5">
            <form action={saveSetting}>
              <input type="hidden" name="key" value={s.key} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-base font-semibold">{s.key}</h2>
                <Button type="submit" variant="gold">Save</Button>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {s.key === "super_admin" && "The account with this email becomes Super Admin when it registers. Changing it does not demote existing admins."}
                {s.key === "payment_instructions" && "Shown on every organization's Billing page. Structure: { methods: [{name, details}], note }."}
                {s.key === "trial_days" && "Default Premium trial length (days) granted to newly created organizations."}
                {s.key === "support_email" && "Public support address."}
              </p>
              <Field label="Value (JSON)" className="mt-3">
                <Textarea name="value" rows={s.key === "payment_instructions" ? 8 : 3} className="font-mono text-xs" defaultValue={JSON.stringify(s.value, null, 2)} />
              </Field>
            </form>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Brand</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Brand name, tagline, colors and logo paths are centralized in <code className="rounded bg-cream px-1">src/lib/brand.ts</code> —
          currently <strong>{BRAND.name}</strong>. Logo files live in <code className="rounded bg-cream px-1">public/brand/</code>.
          Update those two places to rebrand the entire platform; no component hardcodes brand values.
        </p>
      </Card>
    </>
  );
}
