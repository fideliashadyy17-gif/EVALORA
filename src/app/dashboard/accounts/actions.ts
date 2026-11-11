"use server";

import { audit } from "@/lib/admin";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { getEntitlementFor, withinLimit } from "@/lib/entitlements";
import {
  canManageAccount,
  isAssignableStaffRole,
  normalizeAccountEmail,
  validateInitialPassword,
} from "@/lib/organizationAccounts";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Organization-scoped account management.
 *
 * Every action resolves the caller's organization from the verified session,
 * then re-reads the target membership *with that organization id*. A crafted
 * form can therefore never address a member of another tenant — and the
 * platform Super Admin's account is refused explicitly.
 */

async function targetMembership(admin: ReturnType<typeof createAdminClient>, orgId: string, memberId: string) {
  const { data: membership } = await admin
    .from("organization_members")
    .select("id, user_id, role, status, organization_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!membership) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, platform_role, status")
    .eq("id", membership.user_id)
    .maybeSingle();
  return { membership, profile };
}

/** Send a password-reset / password-setup email for one member of this org. */
export async function resetMemberPassword(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/accounts?e=forbidden");

  const admin = createAdminClient();
  const memberId = String(formData.get("member_id") ?? "");
  const target = await targetMembership(admin, org.id, memberId);
  if (!target?.profile) redirect("/dashboard/accounts?e=missing");

  const check = canManageAccount({
    actorRole: org.role,
    actorUserId: ctx.user.id,
    targetUserId: target!.membership.user_id,
    targetRole: target!.membership.role,
    targetPlatformRole: target!.profile!.platform_role,
  });
  if (!check.ok) redirect(`/dashboard/accounts?e=${check.error?.includes("owner") ? "owner" : "forbidden"}`);
  if (!target!.profile!.email) redirect("/dashboard/accounts?e=no_email");

  const { error: resetError } = await admin.auth.resetPasswordForEmail(target!.profile!.email);
  if (resetError) {
    // Recovery mail could not even be queued (typically no SMTP configured).
    // Fall back to checking that the provider can issue a recovery link, and be
    // honest in the UI rather than claiming an email was sent.
    const { error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: target!.profile!.email,
    });
    if (linkError) redirect("/dashboard/accounts?e=reset_failed");
    await audit(ctx, "member.password_reset_blocked", "organization_members", target!.membership.id, org.id, {
      email: target!.profile!.email,
      reason: "mail_delivery_unavailable",
    });
    revalidatePath("/dashboard/accounts");
    redirect("/dashboard/accounts?ok=reset_link");
  }
  await audit(ctx, "member.password_reset_sent", "organization_members", target!.membership.id, org.id, {
    email: target!.profile!.email,
  });
  revalidatePath("/dashboard/accounts");
  redirect("/dashboard/accounts?ok=reset_sent");
}

/** Activate or suspend one member's access to this organization. */
export async function setMemberStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/accounts?e=forbidden");

  const admin = createAdminClient();
  const memberId = String(formData.get("member_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["active", "suspended"].includes(status)) redirect("/dashboard/accounts?e=status");

  const target = await targetMembership(admin, org.id, memberId);
  if (!target?.profile) redirect("/dashboard/accounts?e=missing");

  const check = canManageAccount({
    actorRole: org.role,
    actorUserId: ctx.user.id,
    targetUserId: target!.membership.user_id,
    targetRole: target!.membership.role,
    targetPlatformRole: target!.profile!.platform_role,
  });
  if (!check.ok) redirect(`/dashboard/accounts?e=${check.error?.includes("owner") ? "owner" : "forbidden"}`);

  const { error } = await admin
    .from("organization_members")
    .update({ status })
    .eq("id", target!.membership.id)
    .eq("organization_id", org.id);
  if (error) redirect("/dashboard/accounts?e=failed");

  await audit(ctx, `member.status_${status}`, "organization_members", target!.membership.id, org.id, {
    email: target!.profile!.email,
  });
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/team");
  redirect(`/dashboard/accounts?ok=${status}`);
}

/**
 * Create a staff account for this organization: either with an initial
 * password set by the administrator, or by sending an activation email.
 * The account is created in Supabase Auth — a password is never stored in an
 * application table, and it is never returned to the browser.
 */
export async function createStaffAccount(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/accounts?e=forbidden");

  const email = normalizeAccountEmail(String(formData.get("email") ?? ""));
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 160);
  // Only two screens may host this form; the return path is never taken from
  // arbitrary input, so an open redirect is impossible.
  const back = String(formData.get("back") ?? "") === "/dashboard/teachers" ? "/dashboard/teachers" : "/dashboard/accounts";
  const role = String(formData.get("role") ?? "teacher");
  const mode = String(formData.get("mode") ?? "password") === "invite" ? "invite" : "password";
  const password = String(formData.get("password") ?? "");

  if (!email) redirect(`${back}?e=email`);
  if (!fullName) redirect(`${back}?e=name`);
  if (!isAssignableStaffRole(role)) redirect(`${back}?e=role`);
  if (mode === "password") {
    const pw = validateInitialPassword(password, { email, name: fullName });
    if (!pw.ok) redirect(`${back}?e=password&detail=${encodeURIComponent(pw.error ?? "")}`);
  }

  const supabase = await createClient();
  const entitlement = await getEntitlementFor(supabase, ctx, org.id);
  const { count } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  if (!withinLimit(entitlement.limits.max_members, count ?? 0)) redirect(`${back}?e=limit`);

  const admin = createAdminClient();
  const { data: existingProfile } = await admin.from("profiles").select("id, platform_role").eq("email", email).maybeSingle();

  let userId = existingProfile?.id ?? null;
  if (userId) {
    // The person already has an EVALORA account: never overwrite its password.
    // Grant membership and send a password-setup email instead.
    if (existingProfile!.platform_role === "super_admin") redirect(`${back}?e=protected`);
    const { data: existingMember } = await admin
      .from("organization_members")
      .select("id, status")
      .eq("organization_id", org.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMember) redirect(`${back}?e=exists`);
  } else {
    const { data, error } =
      mode === "password"
        ? await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          })
        : await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
    if (error || !data?.user) redirect(`${back}?e=failed`);
    userId = data!.user.id;
  }

  const { error: memberError } = await admin.from("organization_members").upsert(
    { organization_id: org.id, user_id: userId!, role, status: "active" },
    { onConflict: "organization_id,user_id" },
  );
  if (memberError) redirect(`${back}?e=failed`);

  // Keep the profile name in step with what the administrator typed.
  await admin.from("profiles").update({ full_name: fullName }).eq("id", userId!);

  if (mode === "invite") await admin.auth.resetPasswordForEmail(email);
  await audit(ctx, "member.account_created", "organization_members", userId!, org.id, { email, role, mode });
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/teachers");
  redirect(`${back}?ok=${mode === "password" ? "account_created" : "invitation_sent"}`);
}
