"use server";

import { normalizeAccountEmail, validateInitialPassword } from "@/lib/organizationAccounts";
import { hashSetupCode, setupRecordState } from "@/lib/orgAdminSetup";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Redeem an organization owner set-up code and create the institution's first
 * Organization Owner account.
 *
 * Security properties:
 *  - the code is looked up by SHA-256 hash, inside the organization it was
 *    issued for, and must be unused and unexpired;
 *  - the account is created in Supabase Auth with a confirmed email; the
 *    password exists only in Auth (never in an application table, never logged);
 *  - the new membership is always `owner` in THAT organization — the form
 *    cannot choose an organization, and a platform Super Admin email is refused;
 *  - redeeming is single-use: the record is stamped `used_at` in the same flow.
 */
export async function provisionOrganizationAdmin(formData: FormData) {
  const slug = String(formData.get("org") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const code = String(formData.get("code") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 160);
  const email = normalizeAccountEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const back = `/portal/${slug}/admin-setup`;

  if (!slug) redirect("/");

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug, status, portal_enabled, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!org || org.status !== "active" || org.portal_enabled === false) {
    redirect(`${back}?e=organization`);
  }

  const codeHash = hashSetupCode(code);
  const { data: setup } = await admin
    .from("organization_admin_setup")
    .select("id, used_at, expires_at")
    .eq("organization_id", org!.id)
    .eq("code_hash", codeHash)
    .maybeSingle();
  const state = setupRecordState(setup);
  if (state !== "usable") redirect(`${back}?e=${state}`);

  if (!fullName) redirect(`${back}?e=name`);
  if (!email) redirect(`${back}?e=email`);
  const pw = validateInitialPassword(password, { email, name: fullName });
  if (!pw.ok) redirect(`${back}?e=password`);
  if (password !== confirm) redirect(`${back}?e=confirm`);

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, platform_role, email")
    .ilike("email", email)
    .maybeSingle();
  if (existingProfile?.platform_role === "super_admin") redirect(`${back}?e=protected`);

  let userId = existingProfile?.id ?? null;
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !created?.user) redirect(`${back}?e=create_failed`);
    userId = created!.user.id;
  }
  // An existing EVALORA account keeps its current password; the person can
  // reset it from the sign-in page. Only a brand-new account uses this password.

  const { error: memberError } = await admin.from("organization_members").upsert(
    { organization_id: org!.id, user_id: userId!, role: "owner", status: "active" },
    { onConflict: "organization_id,user_id" },
  );
  if (memberError) redirect(`${back}?e=membership_failed`);

  // A single canonical owner per organization: demote any previous owner
  // membership to administrator (access is preserved, no data is touched).
  await admin
    .from("organization_members")
    .update({ role: "admin" })
    .eq("organization_id", org!.id)
    .eq("role", "owner")
    .neq("user_id", userId!);

  await admin.from("profiles").update({ full_name: fullName }).eq("id", userId!);
  await admin.from("organizations").update({ owner_id: userId! }).eq("id", org!.id);
  await admin
    .from("organization_admin_setup")
    .update({ used_at: new Date().toISOString() })
    .eq("id", setup!.id)
    .is("used_at", null);

  await admin.from("audit_logs").insert({
    actor_id: userId,
    organization_id: org!.id,
    action: "organization.admin_provisioned",
    entity: "organizations",
    entity_id: org!.id,
    metadata: { email, source: "organization_setup_code", previous_owner_id: org!.owner_id },
  });

  revalidatePath("/admin/organizations");
  redirect(`/login?org=${encodeURIComponent(org!.slug)}&switch=1&next=/dashboard&provisioned=1`);
}
