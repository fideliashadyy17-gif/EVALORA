import { Button, ButtonLink, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { LogoUpload } from "@/components/LogoUpload";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { ssoProviderStatus } from "@/lib/sso";
import { tenantPortalLabel, tenantPortalUrl } from "@/lib/tenant";
import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

async function updateOrgLogo(formData: FormData) {
  "use server";
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "organizations.edit", "org_settings"))) redirect("/dashboard/settings");
  const admin = createAdminClient();
  // Org-settings module gates org writes server-side, not just the page.
  const { entitlement: logoEnt } = await getCapabilities(admin, ctx, org.id);
  requireModule(logoEnt, "org_settings", "/dashboard/settings?e=module");
  const { data: current } = await admin.from("organizations").select("logo_url").eq("id", org.id).maybeSingle();
  const oldUrl = (current?.logo_url as string | null) ?? null;

  if (formData.get("remove_logo") === "on") {
    await admin.from("organizations").update({ logo_url: null }).eq("id", org.id);
    if (oldUrl) {
      const path = oldUrl.split("/org-logos/")[1]?.split("?")[0];
      if (path) await admin.storage.from("org-logos").remove([decodeURIComponent(path)]);
    }
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    redirect("/dashboard/settings?saved=logo");
  }

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) redirect("/dashboard/settings?e=logo");
  if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX_BYTES) redirect("/dashboard/settings?e=logo");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) redirect("/dashboard/settings?e=logo");
  const path = `${org.id}/logo-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage.from("org-logos").upload(path, file, { upsert: true });
  if (uploadError) redirect("/dashboard/settings?e=logo");
  const publicUrl = admin.storage.from("org-logos").getPublicUrl(path).data.publicUrl;
  const versioned = `${publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await admin.from("organizations").update({ logo_url: versioned }).eq("id", org.id);
  if (updateError) redirect("/dashboard/settings?e=logo");
  if (oldUrl) {
    const oldPath = oldUrl.split("/org-logos/")[1]?.split("?")[0];
    if (oldPath && decodeURIComponent(oldPath) !== path) await admin.storage.from("org-logos").remove([decodeURIComponent(oldPath)]);
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  redirect("/dashboard/settings?saved=logo");
}

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
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "organizations.edit", "org_settings"))) redirect("/dashboard/settings");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const type = String(formData.get("type") ?? "school");
  if (!name) redirect("/dashboard/settings");
  const supabase = await createClient();
  const { entitlement: orgEnt } = await getCapabilities(supabase, ctx, org.id);
  requireModule(orgEnt, "org_settings", "/dashboard/settings?e=module");
  await supabase.from("organizations").update({ name, type }).eq("id", org.id);
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
  if (org.role === "school_founder") redirect("/dashboard?e=forbidden");
  const isManager = await canOperate(ctx, org.id, "organizations.edit", "org_settings");
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "org_settings", "/dashboard?e=module");
  const { data: orgFull } = await supabase.from("organizations").select("*").eq("id", org.id).single();
  const ssoProviders = ssoProviderStatus();
  const anySsoEnabled = ssoProviders.some((provider) => provider.enabled);

  return (
    <>
      <PageTitle
        eyebrow="Workspace Administration · Profile, Identity & SSO"
        title="Settings"
        subtitle="Your profile and your organization's configuration."
        action={isManager ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/settings/templates" variant="outline">Paper templates →</ButtonLink>
            <ButtonLink href="/dashboard/settings/notifications" variant="outline">Notification wording →</ButtonLink>
            <ButtonLink href="/dashboard/settings/proctoring" variant="outline">Proctoring retention →</ButtonLink>
          </div>
        ) : undefined}
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Saved.</p>}
      {sp.e === "password" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Password must be at least 8 characters.</p>}
      {sp.e === "logo" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">The logo could not be saved. Use a PNG, JPEG or WebP image up to 2 MB.</p>}

      <Card className="mb-6 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Organization branding &amp; logo</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Your logo appears on your dashboard, school portal, official examination papers and candidate screens.
          Change it whenever you want — the new logo replaces the old one everywhere immediately.
        </p>
        {isManager ? (
          <form action={updateOrgLogo} className="mt-4 space-y-4">
            <LogoUpload currentUrl={(orgFull?.logo_url as string | null) ?? null} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">Save logo</Button>
              {(orgFull?.logo_url as string | null) && (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="remove_logo" className="h-4 w-4 accent-evergreen-700" /> Remove current logo
                </label>
              )}
            </div>
          </form>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Only owners and administrators can change the organization logo.</p>
        )}
      </Card>

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
              <Field label="Platform identifier">
                <Input value={orgFull?.slug ? tenantPortalLabel(orgFull.slug) : ""} disabled />
              </Field>
              <p className="text-xs text-ink-soft">
                Official platform URL: <a className="font-semibold text-evergreen-800 underline" href={orgFull?.slug ? tenantPortalUrl(orgFull.slug) : "#"}>{orgFull?.slug ? tenantPortalUrl(orgFull.slug) : "—"}</a>.
                Open, copy and share it from{" "}
                <Link href="/dashboard/platform" className="font-semibold text-evergreen-800 underline underline-offset-2">
                  My Institution&apos;s Platform
                </Link>
                . To change the identifier, contact EVALORA support — changes are reviewed and old links keep redirecting.
              </p>
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

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Single sign-on</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Staff can sign in with a school account instead of a password once a provider is enabled
            for this deployment.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {ssoProviders.map((provider) => (
              <li key={provider.id} className="flex items-center justify-between gap-3 rounded-lg border border-evergreen-900/10 px-4 py-3">
                <span className="font-medium text-evergreen-950">{provider.label}</span>
                <span
                  className={
                    provider.enabled
                      ? "rounded-full bg-evergreen-50 px-3 py-1 text-xs font-semibold text-evergreen-800"
                      : "rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink-soft"
                  }
                >
                  {provider.enabled ? "Enabled" : "Not configured"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-cream p-4 text-sm text-ink-soft">
            {anySsoEnabled ? (
              <p>
                Sign in at{" "}
                <a className="font-semibold text-evergreen-800 underline" href={orgFull?.slug ? tenantPortalUrl(orgFull.slug) : "#"}>
                  {orgFull?.slug ? tenantPortalLabel(orgFull.slug) : "your school portal"}
                </a>{" "}
                and choose “Continue with {ssoProviders.find((p) => p.enabled)?.label}”. Only accounts that are
                already members can get in — an uninvited account is signed straight back out with a message to
                ask an administrator.
              </p>
            ) : (
              <p>
                Single sign-on is not enabled in this deployment, so sign-in stays email and password. Enabling it
                requires a Google OAuth client plus a Supabase provider entry, then
                <code className="mx-1 rounded bg-white px-1 py-0.5 text-xs">NEXT_PUBLIC_GOOGLE_SSO_ENABLED=true</code>
                in the deployment environment. Until all three exist this page keeps saying “Not configured” rather
                than offering a button that cannot work.
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
