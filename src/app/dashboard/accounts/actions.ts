"use server";

import crypto from "node:crypto";
import { audit } from "@/lib/admin";
import { activeOrg, requireUser } from "@/lib/auth";
import {
  OPERATIONAL_STAFF_MEMBER_ROLES,
  planPendingInvitationReconciliation,
} from "@/lib/accountCreationPolicy";
import { resolveAuthorizedAccountCreationRole } from "@/lib/accountCreationRoles";
import { getEntitlementFor, withinLimit } from "@/lib/entitlements";
import { canOperate } from "@/lib/operationalAccess";
import {
  canManageAccount,
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

/** Find an existing Supabase Auth user by exact case-insensitive email when not yet indexed in profiles. */
async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data?.users) return null;
    const match = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === email);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/** Generate a high-entropy unshared secret for recovery-only Auth provisioning (never logged or displayed). */
function generateUnsharedAuthSecret(): string {
  return `${crypto.randomBytes(24).toString("base64url")}Aa9!`;
}

/** Send a password-reset / password-setup email for one member of this org. */
export async function resetMemberPassword(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!(await canOperate(ctx, org.id, "organizations.manage_members", "accounts"))) redirect("/dashboard/accounts?e=forbidden");

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
  if (!(await canOperate(ctx, org.id, "organizations.manage_members", "accounts"))) redirect("/dashboard/accounts?e=forbidden");

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
  revalidatePath("/dashboard/rbac");
  redirect(`/dashboard/accounts?ok=${status}`);
}

/**
 * Create a staff, teacher, administrator, or School Founder account for this
 * organization using the centralized RBAC role catalog (`access_roles`).
 *
 * Security & provisioning guarantees:
 *  - Role options and authorization come exclusively from `access_roles` +
 *    `access_role_permissions` verified against the caller's effective
 *    permissions; `super_admin` and `org_owner` are never permitted here.
 *  - Passwords are never persisted in application tables or logged; activation
 *    email / password-setup flow is supported cleanly even if SMTP is absent.
 *  - `school_founder` requires a dedicated non-operational identity and writes
 *    both `organization_members` (`role = 'school_founder'`) and
 *    `access_user_roles` (`school_founder`), enforced by database triggers.
 *  - Existing pending invitations for the same email in this organization are
 *    reconciled cleanly to prevent duplicates or conflicting memberships.
 */
export async function createStaffAccount(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!(await canOperate(ctx, org.id, "organizations.manage_members", "accounts"))) redirect("/dashboard/accounts?e=forbidden");

  const email = normalizeAccountEmail(String(formData.get("email") ?? ""));
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 160);
  // Only two screens may host this form; the return path is never taken from
  // arbitrary input, so an open redirect is impossible.
  const back = String(formData.get("back") ?? "") === "/dashboard/teachers" ? "/dashboard/teachers" : "/dashboard/accounts";
  const requestedRole = String(formData.get("role") ?? "teacher");
  const mode = String(formData.get("mode") ?? "invite") === "password" ? "password" : "invite";
  const password = String(formData.get("password") ?? "");

  if (!email) redirect(`${back}?e=email`);
  if (!fullName) redirect(`${back}?e=name`);

  const selectedRole = await resolveAuthorizedAccountCreationRole(ctx, org.id, requestedRole);
  if (!selectedRole) redirect(`${back}?e=role`);

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
  const isFounderRole = selectedRole.slug === "school_founder";

  // Case-insensitive lookup so e.g. `Infos@oisbenin.bj` and `infos@oisbenin.bj`
  // always resolve to the exact same identity.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, platform_role, status")
    .ilike("email", email)
    .maybeSingle();

  let userId: string | null = existingProfile?.id ?? null;
  let existingPlatformRole = existingProfile?.platform_role ?? null;
  let createdNewAuthUser = false;
  let mailFallback = false;

  if (!userId) {
    // Also check if an Auth user exists without a matched profile row (e.g., an
    // earlier pending invite), so we never create a duplicate Auth identity.
    const authUserId = await findAuthUserIdByEmail(admin, email);
    if (authUserId) {
      userId = authUserId;
      const { data: matchedProfile } = await admin
        .from("profiles")
        .select("platform_role")
        .eq("id", authUserId)
        .maybeSingle();
      existingPlatformRole = matchedProfile?.platform_role ?? null;
    }
  }

  if (userId) {
    // Never touch platform administrators or overwrite an existing member.
    if (existingPlatformRole === "super_admin") redirect(`${back}?e=protected`);

    const { data: existingMember } = await admin
      .from("organization_members")
      .select("id, role, status")
      .eq("organization_id", org.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMember) redirect(`${back}?e=exists`);

    // Enforce Founder exclusivity before writing anything:
    // - A School Founder cannot be assigned to any existing admin/staff account.
    // - An existing School Founder cannot be assigned an operational staff role.
    const { data: allMemberships } = await admin
      .from("organization_members")
      .select("role, status")
      .eq("user_id", userId)
      .eq("status", "active");

    if (isFounderRole) {
      const hasOperationalRole = (allMemberships ?? []).some((m) =>
        OPERATIONAL_STAFF_MEMBER_ROLES.has(m.role),
      );
      if (hasOperationalRole) redirect(`${back}?e=founder_conflict`);
    } else if (OPERATIONAL_STAFF_MEMBER_ROLES.has(selectedRole.memberRole)) {
      const hasFounderMembership = (allMemberships ?? []).some((m) => m.role === "school_founder");
      if (hasFounderMembership) redirect(`${back}?e=founder_conflict`);
    }
  } else {
    if (mode === "password") {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data?.user) redirect(`${back}?e=failed`);
      userId = data.user.id;
      createdNewAuthUser = true;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (!error && data?.user) {
        userId = data.user.id;
        createdNewAuthUser = true;
      } else {
        // Mail delivery (SMTP) may be unavailable in this deployment: create the
        // Auth user with an unshared random secret and trigger password recovery
        // so the password is never exposed in UI or logs.
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: generateUnsharedAuthSecret(),
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createErr || !created?.user) redirect(`${back}?e=failed`);
        userId = created.user.id;
        createdNewAuthUser = true;
        const { error: resetErr } = await admin.auth.resetPasswordForEmail(email);
        if (resetErr) {
          mailFallback = true;
        }
      }
    }
  }

  // Insert organization membership first (required by `access_validate_assignment`
  // and `access_founder_assignment_guard` triggers on `access_user_roles`).
  const { error: memberError } = await admin
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: userId!,
      role: selectedRole.memberRole,
      status: "active",
    });
  if (memberError) {
    redirect(`${back}?e=${memberError.message?.toLowerCase().includes("founder") ? "founder_conflict" : "failed"}`);
  }

  // Sync the centralized RBAC role assignment (`access_user_roles`). This is
  // mandatory for `school_founder` (excluded from the legacy membership bridge)
  // and keeps all organization staff assignments aligned with centralized RBAC.
  const { error: rbacError } = await admin.from("access_user_roles").upsert(
    {
      user_id: userId!,
      role_id: selectedRole.id,
      organization_id: org.id,
      assigned_by: ctx.user.id,
      status: "active",
      assigned_at: new Date().toISOString(),
      expires_at: null,
    },
    { onConflict: "user_id,role_id,organization_id" },
  );
  if (rbacError) {
    if (isFounderRole) {
      // Never leave a half-provisioned Founder membership without its RBAC grant.
      await admin
        .from("organization_members")
        .delete()
        .eq("organization_id", org.id)
        .eq("user_id", userId!);
      redirect(`${back}?e=${rbacError.message?.toLowerCase().includes("founder") ? "founder_conflict" : "failed"}`);
    }
  }

  // Keep the profile display name aligned with what the administrator entered.
  await admin.from("profiles").update({ full_name: fullName }).eq("id", userId!);

  // Reconcile any existing pending invitations for this email in this organization
  // (e.g. a pending School Founder invitation for `infos@oisbenin.bj`) so zero
  // duplicate or stale invitations remain.
  const { data: pendingInvites } = await admin
    .from("invitations")
    .select("id, role, status")
    .eq("organization_id", org.id)
    .ilike("email", email)
    .eq("status", "pending");

  const { acceptIds, revokeIds } = planPendingInvitationReconciliation(
    pendingInvites ?? [],
    selectedRole.slug,
  );
  if (acceptIds.length) {
    await admin
      .from("invitations")
      .update({ status: "accepted" })
      .eq("organization_id", org.id)
      .in("id", acceptIds);
  }
  if (revokeIds.length) {
    await admin
      .from("invitations")
      .update({ status: "revoked" })
      .eq("organization_id", org.id)
      .in("id", revokeIds);
  }
  const reconciledCount = acceptIds.length + revokeIds.length;

  // Teacher subject assignments chosen on the creation form (multiple
  // subject_ids). Only teaching roles can carry subjects — the database
  // guard rejects any other role — and every subject must belong to THIS
  // organization (tenant isolation).
  if (selectedRole.memberRole === "teacher" || selectedRole.memberRole === "organizer") {
    const subjectIds = [...new Set(formData.getAll("subject_ids").map(String))]
      .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
      .slice(0, 30);
    if (subjectIds.length) {
      const { data: orgSubjects } = await admin
        .from("subjects")
        .select("id")
        .eq("organization_id", org.id)
        .in("id", subjectIds);
      const valid = new Set((orgSubjects ?? []).map((row) => row.id));
      const rows = subjectIds
        .filter((subjectId) => valid.has(subjectId))
        .map((subjectId) => ({
          organization_id: org.id,
          profile_id: userId!,
          subject_id: subjectId,
          assigned_by: ctx.user.id,
        }));
      if (rows.length) await admin.from("teacher_subjects").insert(rows);
    }
  }

  // If the account already existed and the manager chose invite mode, request a
  // password-setup/reset email cleanly without ever overwriting their password.
  if (mode === "invite" && !createdNewAuthUser) {
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email);
    if (resetErr) mailFallback = true;
  }

  await audit(ctx, "member.account_created", "organization_members", userId!, org.id, {
    email,
    role: selectedRole.memberRole,
    rbac_role_slug: selectedRole.slug,
    mode,
    reconciled_invitations: reconciledCount,
  });

  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/teachers");
  revalidatePath("/dashboard/rbac");

  const okCode =
    mode === "password"
      ? reconciledCount > 0
        ? "account_created_reconciled"
        : "account_created"
      : mailFallback
        ? reconciledCount > 0
          ? "account_created_recovery_reconciled"
          : "account_created_recovery"
        : reconciledCount > 0
          ? "invitation_sent_reconciled"
          : "invitation_sent";

  redirect(`${back}?ok=${okCode}`);
}
