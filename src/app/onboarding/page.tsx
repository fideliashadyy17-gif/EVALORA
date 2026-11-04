import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Input, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Set up your organization" };

async function createOrg(formData: FormData) {
  "use server";
  const ctx = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const type = String(formData.get("type") ?? "school");
  if (!name) redirect("/onboarding?error=1");

  const admin = createAdminClient();
  let slug = slugify(name) || "org";
  // Ensure unique slug
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name, slug, type, owner_id: ctx.user.id })
    .select()
    .single();
  if (error || !org) redirect("/onboarding?error=1");

  await admin.from("organization_members").insert({
    organization_id: org.id,
    user_id: ctx.user.id,
    role: "owner",
  });

  // Start the configurable free trial of Premium (trial_days from the plan,
  // overridable by the Super Admin's platform setting).
  const { data: plan } = await admin.from("plans").select("*").eq("slug", "premium").maybeSingle();
  const { data: setting } = await admin.from("platform_settings").select("value").eq("key", "trial_days").maybeSingle();
  const trialDays = Number(setting?.value ?? plan?.trial_days ?? 14);
  if (plan && trialDays > 0) {
    await admin.from("subscriptions").insert({
      organization_id: org.id,
      plan_id: plan.id,
      status: "trialing",
      billing_period: "monthly",
      trial_ends_at: new Date(Date.now() + trialDays * 86400000).toISOString(),
    });
  }

  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: org.id,
    action: "organization.created",
    entity: "organizations",
    entity_id: org.id,
    metadata: { name, type },
  });

  redirect("/dashboard");
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireUser();
  if (ctx.memberships.length > 0) redirect("/dashboard");
  const sp = await searchParams;

  return (
    <AuthShell
      title="Set up your organization"
      subtitle="Your school, university, center or practice gets its own private workspace — with a free Premium trial to start."
    >
      <form action={createOrg} className="space-y-4">
        {sp.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            Something went wrong creating the organization. Please try again.
          </p>
        )}
        <Field label="Organization name">
          <Input name="name" required placeholder="e.g. Riverdale International School" />
        </Field>
        <Field label="Organization type">
          <Select name="type" defaultValue="school">
            <option value="school">School</option>
            <option value="university">University / College</option>
            <option value="training_center">Training center</option>
            <option value="exam_board">Examination organization</option>
            <option value="independent">Independent educator</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Button type="submit" variant="gold" className="w-full py-3">
          Create organization &amp; start trial
        </Button>
        <p className="text-center text-xs text-ink-soft">
          Joining an existing organization instead? Ask your administrator for
          an invitation link — opening it while signed in adds you instantly.
        </p>
      </form>
    </AuthShell>
  );
}
