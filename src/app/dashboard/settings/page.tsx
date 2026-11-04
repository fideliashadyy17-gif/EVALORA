import { Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Settings" };

async function updateProfile(formData: FormData) {
  "use server";
  const ctx = await requireUser();
  const supabase = await createClient();
  await supabase.from("profiles").update({ full_name: String(formData.get("full_name") ?? "").slice(0, 120) }).eq("id", ctx.user.id);
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=profile");
}

async function updateOrg(formData: FormData) {
  "use server";
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/settings");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const type = String(formData.get("type") ?? "school");
  if (!name) redirect("/dashboard/settings");
  const supabase = await createClient();
  await supabase.from("organizations").update({ name, type, slug: slugify(name) }).eq("id", org.id);
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=org");
}

async function changePassword(formData: FormData) {
  "use server";
  await requireUser();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect("/dashboard/settings?e=password");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/dashboard/settings?e=password");
  redirect("/dashboard/settings?saved=password");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();
  const { data: orgFull } = await supabase.from("organizations").select("*").eq("id", org.id).single();

  return (
    <>
      <PageTitle title="Settings" subtitle="Your profile and your organization's configuration." />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Saved.</p>}
      {sp.e === "password" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Password must be at least 8 characters.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">My profile</h2>
          <form action={updateProfile} className="mt-4 space-y-3">
            <Field label="Full name">
              <Input name="full_name" defaultValue={ctx.profile.full_name ?? ""} />
            </Field>
            <Field label="Email">
              <Input value={ctx.profile.email} disabled />
            </Field>
            <Field label="My role in this organization">
              <Input value={org.role} disabled className="capitalize" />
            </Field>
            <Button type="submit">Save profile</Button>
          </form>
          <form action={changePassword} className="mt-6 space-y-3 border-t border-evergreen-900/10 pt-5">
            <h3 className="font-semibold text-evergreen-950">Change password</h3>
            <Field label="New password">
              <Input name="password" type="password" required autoComplete="new-password" placeholder="At least 8 characters" />
            </Field>
            <Button type="submit" variant="outline">Update password</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Organization</h2>
          {isManager ? (
            <form action={updateOrg} className="mt-4 space-y-3">
              <Field label="Organization name">
                <Input name="name" defaultValue={orgFull?.name ?? org.name} required />
              </Field>
              <Field label="Type">
                <Select name="type" defaultValue={orgFull?.type ?? "school"}>
                  <option value="school">School</option>
                  <option value="university">University / College</option>
                  <option value="training_center">Training center</option>
                  <option value="exam_board">Examination organization</option>
                  <option value="independent">Independent educator</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Workspace identifier">
                <Input value={orgFull?.slug ?? ""} disabled />
              </Field>
              <Button type="submit">Save organization</Button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">Only owners and administrators can change organization settings.</p>
          )}
          <div className="mt-6 rounded-xl bg-cream p-4 text-sm text-ink-soft">
            <p className="font-semibold text-evergreen-950">Data &amp; privacy</p>
            <p className="mt-1">
              Your workspace data is isolated from every other organization by database row-level
              security. To request a data export or deletion, contact support from the public site.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
