import "server-only";

import type { SessionContext } from "@/lib/auth";
import {
  filterAccountCreationRoles,
  normalizeRequestedStaffRoleSlug,
  type AccountCreationRoleOption,
  type CatalogRoleRecord,
} from "@/lib/accountCreationPolicy";
import { checkPermissions } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";

/**
 * Load the organization-scoped roles available for staff account creation
 * directly from the centralized RBAC catalog (`access_roles` +
 * `access_role_permissions`), filtered strictly by the caller's verified
 * effective permissions in `organizationId`.
 *
 * Uses the caller's authenticated Supabase client (RLS-enforced) and
 * PostgreSQL `access_check_permissions`.
 */
export async function loadAccountCreationRoles(
  ctx: SessionContext,
  organizationId: string,
): Promise<AccountCreationRoleOption[]> {
  const supabase = await createClient();
  const isSuperAdmin = ctx.profile.platform_role === "super_admin";

  const [{ data: rolesData, error: rolesError }, { data: rolePermsData, error: permsError }] =
    await Promise.all([
      supabase
        .from("access_roles")
        .select("id, slug, name, description, type, is_system, is_active, organization_id")
        .eq("is_active", true)
        .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
        .order("name"),
      supabase
        .from("access_role_permissions")
        .select("role_id, granted, access_permissions(key, enabled)")
        .eq("granted", true),
    ]);

  if (rolesError || permsError || !rolesData) return [];

  const rolePermissions = new Map<string, string[]>();
  const allPermissionKeys = new Set<string>(["organizations.manage_members", "users.create"]);

  for (const row of (rolePermsData ?? []) as unknown as {
    role_id: string;
    granted: boolean;
    access_permissions: { key: string; enabled: boolean } | { key: string; enabled: boolean }[] | null;
  }[]) {
    const perm = Array.isArray(row.access_permissions) ? row.access_permissions[0] : row.access_permissions;
    if (!row.granted || !perm?.enabled || !perm.key) continue;
    const list = rolePermissions.get(row.role_id) ?? [];
    list.push(perm.key);
    rolePermissions.set(row.role_id, list);
    allPermissionKeys.add(perm.key);
  }

  const callerEffectivePermissions = isSuperAdmin
    ? {}
    : await checkPermissions(ctx, organizationId, [...allPermissionKeys]);

  const callerCanManageMembers =
    isSuperAdmin || callerEffectivePermissions["organizations.manage_members"] === true;

  return filterAccountCreationRoles({
    organizationId,
    isSuperAdmin,
    callerCanManageMembers,
    roles: rolesData as CatalogRoleRecord[],
    rolePermissions,
    callerEffectivePermissions,
  });
}

/**
 * Resolve one requested form role (canonical RBAC slug such as `org_admin`,
 * `school_founder`, `teacher`, or legacy alias such as `admin`) against the
 * caller's currently authorized account-creation catalog for `organizationId`.
 */
export async function resolveAuthorizedAccountCreationRole(
  ctx: SessionContext,
  organizationId: string,
  requestedRole: string | null | undefined,
): Promise<AccountCreationRoleOption | null> {
  const normalizedSlug = normalizeRequestedStaffRoleSlug(requestedRole);
  if (!normalizedSlug) return null;
  const available = await loadAccountCreationRoles(ctx, organizationId);
  return available.find((option) => option.slug === normalizedSlug) ?? null;
}
