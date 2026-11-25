"use server";

import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Organization-scoped RBAC role assignment action.
 *
 * Reuses the centralized PostgreSQL RBAC RPC (`access_org_assign_role`), executed
 * under the caller's own authenticated session (never bypassing RLS/DB rules).
 * The database enforces:
 *   - Caller holds `roles.assign` in `org.id` (or active Super Admin)
 *   - Target user is an active member of `org.id`
 *   - No assignment of `super_admin` or `school_founder`
 *   - No cross-organization access or cross-org custom roles
 *   - No privilege escalation beyond the caller's own effective permissions
 *   - No self-modification or unauthorized owner modification
 */
export async function orgAssignRoleAction(formData: FormData): Promise<void> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/workspaces");

  if (!(await canOperate(ctx, org.id, "roles.assign", "accounts"))) {
    redirect("/dashboard/rbac?e=" + encodeURIComponent("You do not have permission to assign roles in this organization."));
  }

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const roleSlug = String(formData.get("role_slug") ?? "").trim();
  const expiresRaw = String(formData.get("expires_at") ?? "").trim();
  const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

  if (!targetUserId || !roleSlug) {
    redirect("/dashboard/rbac?e=" + encodeURIComponent("Select both a member and a permitted role."));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("access_org_assign_role", {
    p_organization_id: org.id,
    p_user_id: targetUserId,
    p_role_slug: roleSlug,
    p_expires_at: expiresAt,
  });

  if (error) {
    redirect("/dashboard/rbac?e=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/rbac");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/team");
  redirect("/dashboard/rbac?ok=assigned");
}

/**
 * Organization-scoped RBAC role revocation action.
 * Enforced in PostgreSQL by `access_org_revoke_role`.
 */
export async function orgRevokeRoleAction(formData: FormData): Promise<void> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/workspaces");

  if (!(await canOperate(ctx, org.id, "roles.assign", "accounts"))) {
    redirect("/dashboard/rbac?e=" + encodeURIComponent("You do not have permission to revoke roles in this organization."));
  }

  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  if (!assignmentId) {
    redirect("/dashboard/rbac?e=" + encodeURIComponent("Missing role assignment identifier."));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("access_org_revoke_role", {
    p_organization_id: org.id,
    p_assignment_id: assignmentId,
  });

  if (error) {
    redirect("/dashboard/rbac?e=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/rbac");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/team");
  redirect("/dashboard/rbac?ok=revoked");
}
