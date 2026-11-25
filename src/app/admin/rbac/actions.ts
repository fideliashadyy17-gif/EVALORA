"use server";

import {
  assignRole as rbacAssignRole,
  revokeRole as rbacRevokeRole,
  createCustomRole as rbacCreateCustomRole,
  updateCustomRole as rbacUpdateCustomRole,
  deleteCustomRole as rbacDeleteCustomRole,
  listPermissions as rbacListPermissions,
  listRoles as rbacListRoles,
  listUserRoles as rbacListUserRoles,
  getRoleBySlug as rbacGetRoleBySlug,
  resolvePermission as rbacResolvePermission,
  type RbacPermission,
  type RbacRole,
  type RbacUserRole,
} from "@/lib/rbac";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
async function audit(action: string, entity: string, entityId: string, organizationId: string | null, metadata: Record<string, unknown>) {
  const ctx = await requireSuperAdmin();
  const { error } = await createAdminClient().from("audit_logs").insert({ actor_id: ctx.user.id, action, entity, entity_id: entityId, organization_id: organizationId, metadata });
  if (error) throw new Error("Audit persistence failed.");
  revalidatePath("/admin/rbac", "layout");
}

/** -----------------------------------------------------------------------
 *  Permissions
 *  ----------------------------------------------------------------------- */

export async function rbacListPermissionsAction(): Promise<
  { ok: true; permissions: RbacPermission[] } | { ok: false; error: string }
> {
  try {
    await requireSuperAdmin();
    const permissions = await rbacListPermissions();
    return { ok: true, permissions };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load permissions." };
  }
}

/** -----------------------------------------------------------------------
 *  Roles
 *  ----------------------------------------------------------------------- */

export async function rbacListRolesAction(
  organizationId?: string | null,
): Promise<{ ok: true; roles: RbacRole[] } | { ok: false; error: string }> {
  try {
    await requireSuperAdmin();
    const roles = await rbacListRoles(organizationId);
    return { ok: true, roles };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load roles." };
  }
}

export async function rbacGetRoleAction(
  slug: string,
): Promise<{ ok: true; role: RbacRole | null } | { ok: false; error: string }> {
  try {
    await requireSuperAdmin();
    const role = await rbacGetRoleBySlug(slug);
    return { ok: true, role };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load role." };
  }
}

export async function rbacCreateCustomRoleAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  redirect?: string;
}> {
  const session = await requireSuperAdmin();
  const actor = session.profile;

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const description = String(formData.get("description") ?? "").trim() || null;
  const organizationId = String(formData.get("organization_id") ?? "").trim() || null;
  const permissionKeys = formData.getAll("permission_keys").map(String)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!name || !slug) {
    return { ok: false, error: "Name and slug are required." };
  }

  const result = await rbacCreateCustomRole(actor.id, {
    name,
    slug,
    description,
    organizationId,
    permissionKeys,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await audit("role.created", "access_roles", result.roleId!, null, {
    name, slug, description, organizationId, permissionKeys,
  });

  redirect(`/admin/rbac/roles?ok=created`);
}

export async function rbacUpdateCustomRoleAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  redirect?: string;
}> {
  const session = await requireSuperAdmin();
  const actor = session.profile;

  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || undefined;
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const isActiveRaw = String(formData.get("is_active") ?? "");
  const isActive = isActiveRaw === "on" ? true : false;
  const permissionKeysRaw = formData.getAll("permission_keys").map(String);
  const permissionKeys = permissionKeysRaw
    .map((s) => s.trim())
    .filter(Boolean);

  const result = await rbacUpdateCustomRole(actor.id, slug, {
    name,
    description: description === "" ? null : description,
    isActive,
    permissionKeys,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await audit("role.updated", "access_roles", slug, null, {
    name, description, isActive, permissionKeys,
  });

  redirect(`/admin/rbac/roles?ok=updated`);
}

export async function rbacDeleteCustomRoleAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  redirect?: string;
}> {
  const session = await requireSuperAdmin();
  const actor = session.profile;

  const slug = String(formData.get("slug") ?? "").trim();

  const result = await rbacDeleteCustomRole(actor.id, slug);
  if (!result.ok) return { ok: false, error: result.error };

  await audit("role.deleted", "access_roles", slug, null, { slug });

  redirect(`/admin/rbac/roles?ok=deleted`);
}

/** -----------------------------------------------------------------------
 *  Role assignments
 *  ----------------------------------------------------------------------- */

export async function rbacListUserRolesAction(
  organizationId?: string | null,
): Promise<{ ok: true; assignments: RbacUserRole[] } | { ok: false; error: string }> {
  try {
    await requireSuperAdmin();
    const assignments = await rbacListUserRoles(organizationId);
    return { ok: true, assignments };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load role assignments." };
  }
}

export async function rbacAssignRoleAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  redirect?: string;
}> {
  const session = await requireSuperAdmin();
  const actor = session.profile;

  let targetUserId = String(formData.get("target_user_id") ?? "").trim();
  const userEmail = String(formData.get("user_email") ?? "").trim().toLowerCase();
  const roleSlug = String(formData.get("role_slug") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim() || null;

  const founderEmail = String(formData.get("founder_email") ?? "").trim().toLowerCase();
  if (roleSlug === "school_founder" && founderEmail && formData.get("provision_founder_membership") === "on") {
    const client = await createClient();
    const { error } = await client.rpc("access_assign_founder", { p_email: founderEmail, p_org: organizationId, p_expires_at: expiresAt || null });
    if (error) redirect(`/admin/rbac/assignments?e=${encodeURIComponent(error.message)}`);
    revalidatePath("/admin/rbac", "layout");
    redirect("/admin/rbac/assignments?ok=assigned");
  }

  if (!targetUserId && userEmail) {
    const admin = createAdminClient();
    const { data: matchedProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", userEmail)
      .maybeSingle();
    if (!matchedProfile) {
      redirect(`/admin/rbac/assignments?e=${encodeURIComponent(`No existing account found for ${userEmail}. Create or invite the account first.`)}`);
    }
    targetUserId = matchedProfile.id;
  }

  if (!targetUserId || !roleSlug || !organizationId) {
    redirect(`/admin/rbac/assignments?e=${encodeURIComponent("User, role, and organization are required.")}`);
  }

  const result = await rbacAssignRole(actor.id, targetUserId, roleSlug, organizationId, {
    expiresAt,
  });

  if (!result.ok) redirect(`/admin/rbac/assignments?e=${encodeURIComponent(result.error ?? "Role assignment failed.")}`);

  await audit("role.assigned", "access_user_roles", targetUserId, organizationId, {
    roleSlug, targetUserId, expiresAt,
  });

  redirect(`/admin/rbac/assignments?ok=assigned`);
}

/**
 * Smart School Founder assignment & invitation flow:
 *  - If an account matching `email` already exists, assigns `school_founder`
 *    scoped to `organization_id` via `access_assign_founder` without creating
 *    a duplicate identity.
 *  - If no account exists yet, creates (or refreshes) a pending single-use
 *    `school_founder` invitation in `public.invitations` rather than assigning
 *    the role to someone else.
 */
export async function rbacProvisionOrInviteFounderAction(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin();
  const email = String(formData.get("founder_email") ?? "").trim().toLowerCase();
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim() || null;

  if (!email || !email.includes("@") || !organizationId) {
    redirect(`/admin/rbac/assignments?e=${encodeURIComponent("A valid email address and organization are required.")}`);
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, status")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org || org.status !== "active") {
    redirect(`/admin/rbac/assignments?e=${encodeURIComponent("Selected organization is not active.")}`);
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, email, platform_role, status")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    const client = await createClient();
    const { error } = await client.rpc("access_assign_founder", {
      p_email: existingProfile.email ?? email,
      p_org: organizationId,
      p_expires_at: expiresAt,
    });
    if (error) {
      redirect(`/admin/rbac/assignments?e=${encodeURIComponent(error.message)}`);
    }
    await audit("founder.assigned", "access_user_roles", existingProfile.id, organizationId, {
      email: existingProfile.email ?? email,
      expiresAt,
    });
    revalidatePath("/admin/rbac", "layout");
    redirect(`/admin/rbac/assignments?ok=founder_assigned&q=${encodeURIComponent(email)}`);
  }

  // Account does not exist yet: issue (or reuse) a clean pending school_founder invitation.
  const { data: existingInv } = await admin
    .from("invitations")
    .select("id, token, expires_at")
    .eq("organization_id", organizationId)
    .ilike("email", email)
    .eq("role", "school_founder")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existingInv) {
    revalidatePath("/admin/rbac", "layout");
    redirect(`/admin/rbac/assignments?ok=founder_invited&invite_email=${encodeURIComponent(email)}`);
  }

  const token = crypto.randomUUID().replaceAll("-", "");
  const inviteExpires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: created, error: invError } = await admin
    .from("invitations")
    .insert({
      organization_id: organizationId,
      email,
      role: "school_founder",
      token,
      status: "pending",
      invited_by: session.user.id,
      expires_at: inviteExpires,
    })
    .select("id")
    .single();

  if (invError || !created) {
    redirect(`/admin/rbac/assignments?e=${encodeURIComponent(invError?.message ?? "Could not create School Founder invitation.")}`);
  }

  await audit("founder.invitation.created", "invitations", created.id, organizationId, {
    email,
    role: "school_founder",
    expires_at: inviteExpires,
  });
  revalidatePath("/admin/rbac", "layout");
  redirect(`/admin/rbac/assignments?ok=founder_invited&invite_email=${encodeURIComponent(email)}`);
}

export async function rbacRevokeFounderInviteAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim() || null;
  if (!invitationId) {
    redirect(`/admin/rbac/assignments?e=${encodeURIComponent("Invitation ID is required.")}`);
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("status", "pending");
  if (error) {
    redirect(`/admin/rbac/assignments?e=${encodeURIComponent(error.message)}`);
  }
  await audit("founder.invitation.revoked", "invitations", invitationId, organizationId, { invitationId });
  revalidatePath("/admin/rbac", "layout");
  redirect("/admin/rbac/assignments?ok=invite_revoked");
}

export async function rbacRevokeRoleAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  redirect?: string;
}> {
  const session = await requireSuperAdmin();
  const actor = session.profile;

  const targetUserId = String(formData.get("target_user_id") ?? "").trim();
  const roleSlug = String(formData.get("role_slug") ?? "").trim();
  const organizationId = String(formData.get("organization_id") ?? "").trim();

  if (!targetUserId || !roleSlug || !organizationId) {
    return { ok: false, error: "User, role and organization are required." };
  }

  const result = await rbacRevokeRole(actor.id, targetUserId, roleSlug, organizationId);
  if (!result.ok) return { ok: false, error: result.error };

  await audit("role.revoked", "access_user_roles", targetUserId, organizationId, {
    roleSlug, targetUserId,
  });

  redirect(`/admin/rbac/assignments?ok=revoked`);
}

/** -----------------------------------------------------------------------
 *  Permission check (for server actions / route guards).
 *  ----------------------------------------------------------------------- */

export async function rbacHasPermissionAction(
  actorUserId: string,
  organizationId: string,
  permissionKey: string,
): Promise<{ ok: boolean; granted: boolean; reason?: string }> {
  const session = await requireSuperAdmin();
  if (actorUserId !== session.user.id) return { ok: false, granted: false };
  const resolved = await rbacResolvePermission(session, organizationId, permissionKey);
  return { ok: true, granted: resolved.effective, reason: resolved.reason };
}

/** Global disable is authoritative in the database resolver. */
export async function rbacSetPermissionEnabled(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const client = await createClient();
  const key = String(formData.get("permission_key") ?? "");
  const state = formData.get("enabled");
  if (state !== "true" && state !== "false") throw new Error("Invalid enabled state.");
  const { data, error } = await client.from("access_permissions").update({ enabled: state === "true" }).eq("key",key).select("id").single();
  if (error || !data) throw new Error("Permission update failed.");
  revalidatePath("/admin/rbac", "layout");
  revalidatePath("/supervision", "page");
}

export async function rbacSetOverride(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  const client = await createClient();
  const user = String(formData.get("user_id") ?? "");
  const organization = String(formData.get("organization_id") ?? "");
  const permission = String(formData.get("permission_id") ?? "");
  const state = formData.get("state");
  const { data: membership, error: memberError } = await client.from("organization_members").select("user_id").eq("user_id",user).eq("organization_id",organization).eq("status","active").single();
  if (memberError || !membership) throw new Error("Active membership required.");
  if (!["inherit","allow","deny"].includes(String(state))) throw new Error("Invalid override state.");
  const result = state === "inherit"
    ? await client.from("access_permission_overrides").delete().eq("user_id",user).eq("organization_id",organization).eq("permission_id",permission)
    : await client.from("access_permission_overrides").upsert({user_id:user,organization_id:organization,permission_id:permission,granted:state === "allow",assigned_by:ctx.user.id},{onConflict:"user_id,organization_id,permission_id"});
  if (result.error) throw new Error(result.error.message);
  revalidatePath("/admin/rbac", "layout");
  revalidatePath("/supervision", "page");
}
