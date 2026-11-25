import "server-only";

/**
 * Server-only access-control services for the new permission center and
 * supervision workspace. Existing operational guards remain in force;
 * migrating all legacy actions to configurable permissions is separate work.
 * Resolution is delegated to access_has_permission in PostgreSQL: unknown or
 * disabled permission -> deny; verified active Super Admin -> allow; otherwise
 * active profile/tenant/membership required, explicit override/role deny wins,
 * then union of active, unexpired, in-scope role grants and explicit grants.
 */

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireSuperAdmin, type SessionContext } from "./auth";

/** Stable permission identifiers used across the platform. */
export type PermissionKey = string;

/** Result of resolving one permission for one user in one organization. */
export interface ResolvedPermission {
  key: PermissionKey;
  effective: boolean;
  source: "super_admin" | "override" | "role" | "default" | "database";
  reason: string;
}

/** A role the caller can assign / inspect. */
export interface RbacRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "system" | "custom";
  isSystem: boolean;
  isActive: boolean;
  organizationId: string | null;
  permissionCount: number;
  assignedUserCount: number;
}

/** A permission the caller can inspect / modify. */
export interface RbacPermission {
  id: string;
  key: PermissionKey;
  name: string;
  description: string | null;
  category: string;
  scope: "system" | "organization";
  isSystem: boolean;
  assignedRoleCount: number;
  enabled: boolean;
}

/** A user-to-role assignment. */
export interface RbacUserRole {
  id: string;
  userId: string;
  userEmail: string | null;
  userFullName: string | null;
  roleId: string;
  roleSlug: string;
  organizationId: string;
  organizationName: string;
  status: "active" | "revoked";
  assignedBy: string | null;
  assignedAt: string;
  expiresAt: string | null;
}

/** Categories used in the permission matrix. */
export const RBAC_PERMISSION_CATEGORIES = [
  "Dashboard and analytics",
  "User accounts and authentication",
  "Organizations and memberships",
  "Classes and academic structures",
  "Question bank and question management",
  "Paper Builder and assessment design",
  "Examination management",
  "Quizzes and live competitions",
  "Marking and grading",
  "Results management and publication",
  "Candidate admission links and exam access",
  "Students and candidate records",
  "Proctoring and monitoring",
  "Reports and analytics",
  "Subscription and billing",
  "System configuration",
  "Security and audit logs",
  "Role and permission administration",
] as const;

export type RbacCategory = (typeof RBAC_PERMISSION_CATEGORIES)[number];

/** Actions used in the permission matrix. */
export const RBAC_ACTIONS = [
  "View", "Create", "Edit", "Delete", "Manage", "Assign",
  "Import", "Export", "Publish", "Validate", "Grade", "Monitor", "Configure",
] as const;

export type RbacAction = (typeof RBAC_ACTIONS)[number];

/** System roles that must be protected from deletion / corruption. */
export const SYSTEM_ROLE_SLUGS = [
  "super_admin", "org_owner", "org_admin", "teacher", "organizer",
  "supervisor", "corrector", "school_founder", "candidate", "student", "parent",
] as const;

/** The School Founder / Institutional Supervisor role slug. */
export const SCHOOL_FOUNDER_ROLE_SLUG = "school_founder";

/** -----------------------------------------------------------------------
 *  Client-facing (server-component / server-action safe) helpers.
 *  ----------------------------------------------------------------------- */

/**
 * Resolve one effective permission for a user in an organization.
 * Server-side only — queries the database directly (bypasses RLS via the
 * service-role client so the check is authoritative).
 */
export async function resolvePermission(
  ctx: Pick<SessionContext, "profile"> | null,
  organizationId: string,
  permissionKey: PermissionKey,
): Promise<ResolvedPermission> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user || user.id !== ctx?.profile.id) {
    return { key: permissionKey, effective: false, source: "default", reason: "Authenticated identity required." };
  }
  const { data, error } = await client.rpc("access_has_permission", {
    p_user_id: user.id, p_organization_id: organizationId, p_permission_key: permissionKey,
  });
  if (error) throw new Error("Permission resolution unavailable.");
  return { key: permissionKey, effective: data === true, source: "database", reason: "Database effective permission resolution." };
}

/**
 * Boolean permission check. Use this in server actions, route handlers and
 * server components whenever authorization must be enforced.
 */
export async function hasPermission(
  ctx: Pick<SessionContext, "profile"> | null,
  organizationId: string,
  permissionKey: PermissionKey,
): Promise<boolean> {
  const resolved = await resolvePermission(ctx, organizationId, permissionKey);
  return resolved.effective;
}

/**
 * All effective permissions for a user in an organization, with sources.
 */
export async function getUserPermissions(
  ctx: Pick<SessionContext, "profile"> | null,
  organizationId: string,
  keys: PermissionKey[],
): Promise<Record<PermissionKey, ResolvedPermission>> {
  const out: Record<PermissionKey, ResolvedPermission> = {};
  await Promise.all(keys.map(async (key) => {
    out[key] = await resolvePermission(ctx, organizationId, key);
  }));
  return out;
}

/**
 * Guard: throw/redirect if the caller lacks a permission in an organization.
 * Returns the resolved permission on success.
 */
export async function requirePermission(
  ctx: Pick<SessionContext, "profile"> | null,
  organizationId: string,
  permissionKey: PermissionKey,
): Promise<ResolvedPermission> {
  const resolved = await resolvePermission(ctx, organizationId, permissionKey);
  if (!resolved.effective) {
    const err = new Error(
      `Permission denied: "${permissionKey}" is not effective for this user in this organization.`,
    ) as Error & { permissionKey?: PermissionKey; organizationId?: string };
    err.permissionKey = permissionKey;
    err.organizationId = organizationId;
    throw err;
  }
  return resolved;
}

/** -----------------------------------------------------------------------
 *  Role & permission catalog (Super Admin console).
 *  ----------------------------------------------------------------------- */

/** List all permissions with assignment counts. */
export async function listPermissions(): Promise<RbacPermission[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: perms, error } = await admin
    .from("access_permissions")
    .select(`
      id, key, name, description, category, scope, is_system, enabled, created_at,
      access_role_permissions (role_id)
    `)
    .order("category")
    .order("key");
  if (error) throw new Error(error.message);
  return (perms ?? []).map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description ?? null,
    category: p.category,
    scope: p.scope as "system" | "organization",
    isSystem: p.is_system,
    assignedRoleCount: (p.access_role_permissions ?? []).length,
    enabled: p.enabled,
  }));
}

/** List all roles with permission and assignment counts. */
export async function listRoles(organizationId?: string | null): Promise<RbacRole[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  let q = admin
    .from("access_roles")
    .select(`
      id, name, slug, description, type, is_system, is_active, organization_id,
      created_at, updated_at,
      access_role_permissions (id,granted),
      access_user_roles (id,status,expires_at)
    `)
    .order("name");
  if (organizationId) {
    q = q.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
  }
  const { data: roles, error } = await q;
  if (error) throw new Error(error.message);
  return (roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? null,
    type: r.type as "system" | "custom",
    isSystem: r.is_system,
    isActive: r.is_active,
    organizationId: r.organization_id ?? null,
    permissionCount: (r.access_role_permissions ?? []).filter(p => p.granted).length,
    assignedUserCount: (r.access_user_roles ?? []).filter(a => a.status === "active" && (!a.expires_at || a.expires_at > new Date().toISOString())).length,
  }));
}

/** Get one role by slug. */
export async function getRoleBySlug(slug: string): Promise<RbacRole | null> {
  const roles = await listRoles();
  return roles.find((r) => r.slug === slug) ?? null;
}

/** -----------------------------------------------------------------------
 *  Role assignment (Super Admin console).
 *  ----------------------------------------------------------------------- */

/** Assign a role to a user within an organization. */
export async function assignRole(
  actorUserId: string,
  targetUserId: string,
  roleSlug: string,
  organizationId: string,
  opts?: { expiresAt?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperAdmin();
  if (session.user.id !== actorUserId) throw new Error("Actor identity mismatch.");
  const admin = createAdminClient();

  // Protect: only Super Admin can assign roles.
  const { data: actor } = await admin
    .from("profiles")
    .select("platform_role, status")
    .eq("id", actorUserId)
    .single();
  if (!actor || actor.platform_role !== "super_admin" || actor.status !== "active") {
    return { ok: false, error: "Only an active Super Admin can assign roles." };
  }

  if (roleSlug === SCHOOL_FOUNDER_ROLE_SLUG) {
    const { data: target, error: lookupError } = await admin.from("profiles").select("email").eq("id",targetUserId).single();
    if (lookupError || !target?.email) return { ok: false, error: "Existing registered account required." };
    const client = await createClient();
    const { error } = await client.rpc("access_assign_founder", {p_email:target.email,p_org:organizationId,p_expires_at:opts?.expiresAt ?? null});
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  // Resolve role id.
  const { data: role } = await admin
    .from("access_roles")
    .select("id, is_active, is_system, organization_id")
    .eq("slug", roleSlug)
    .single();
  if (!role || !role.is_active) {
    return { ok: false, error: "Role not found or inactive." };
  }

  if (roleSlug === "super_admin") return { ok: false, error: "Platform administrators are managed separately." };
  if (role.organization_id && role.organization_id !== organizationId) return { ok: false, error: "Role belongs to another organization." };
  const { error } = await admin.from("access_user_roles").upsert({
    user_id: targetUserId,
    role_id: role.id,
    organization_id: organizationId,
    assigned_by: actorUserId,
    status: "active",
    expires_at: opts?.expiresAt ?? null,
    assigned_at: new Date().toISOString(),
  }, { onConflict: "user_id,role_id,organization_id" });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/** Revoke a role assignment. */
export async function revokeRole(
  actorUserId: string,
  targetUserId: string,
  roleSlug: string,
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperAdmin();
  if (session.user.id !== actorUserId) throw new Error("Actor identity mismatch.");
  const admin = createAdminClient();

  const { data: actor } = await admin
    .from("profiles")
    .select("platform_role, status")
    .eq("id", actorUserId)
    .single();
  if (!actor || actor.platform_role !== "super_admin" || actor.status !== "active") {
    return { ok: false, error: "Only an active Super Admin can revoke roles." };
  }

  // Protect the last Super Admin.
  if (roleSlug === "super_admin") {
    const { data: sas } = await admin
      .from("profiles")
      .select("id")
      .eq("platform_role", "super_admin")
      .eq("status", "active");
    const superAdminIds = new Set((sas ?? []).map((s) => s.id));
    if (superAdminIds.size <= 1 && superAdminIds.has(targetUserId)) {
      return { ok: false, error: "Cannot revoke the last Super Admin." };
    }
  }

  const { data: role } = await admin
    .from("access_roles")
    .select("id")
    .eq("slug", roleSlug)
    .single();
  if (!role) return { ok: false, error: "Role not found." };

  const { error } = await admin
    .from("access_user_roles")
    .update({ status: "revoked" })
    .eq("user_id", targetUserId)
    .eq("role_id", role.id)
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** List user-role assignments for an organization (or all for Super Admin). */
export async function listUserRoles(organizationId?: string | null): Promise<RbacUserRole[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  let q = admin
    .from("access_user_roles")
    .select(`
      id, user_id, role_id, organization_id, status, assigned_by, assigned_at, expires_at,
      profiles!access_user_roles_user_id_fkey (email, full_name),
      access_roles!access_user_roles_role_id_fkey (slug, name),
      organizations!access_user_roles_organization_id_fkey (name)
    `)
    .order("assigned_at", { ascending: false });
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  return (rows ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userEmail: (r.profiles as unknown as {email:string}|null)?.email ?? null,
    userFullName: (r.profiles as unknown as {full_name:string}|null)?.full_name ?? null,
    roleId: r.role_id,
    roleSlug: (r.access_roles as unknown as {slug:string}|null)?.slug ?? "",
    organizationId: r.organization_id,
    organizationName: (r.organizations as unknown as {name:string}|null)?.name ?? "",
    status: r.status as "active" | "revoked",
    assignedBy: r.assigned_by ?? null,
    assignedAt: r.assigned_at,
    expiresAt: r.expires_at ?? null,
  }));
}

/** -----------------------------------------------------------------------
 *  Custom role management (Super Admin console).
 *  ----------------------------------------------------------------------- */

/** Create a custom role. System roles cannot be created through this path. */
export async function createCustomRole(
  actorUserId: string,
  payload: {
    name: string;
    slug: string;
    description?: string | null;
    organizationId?: string | null;
    permissionKeys: PermissionKey[];
  },
): Promise<{ ok: boolean; roleId?: string; error?: string }> {
  const session = await requireSuperAdmin();
  if (session.user.id !== actorUserId) throw new Error("Actor identity mismatch.");
  const client = await createClient();
  const { data, error } = await client.rpc("access_save_role", {
    p_slug: payload.slug, p_name: payload.name, p_description: payload.description ?? null,
    p_organization_id: payload.organizationId ?? null, p_active: true,
    p_permission_keys: payload.permissionKeys, p_create: true,
  });
  return error ? { ok: false, error: error.message } : { ok: true, roleId: data };

}

/** Update a custom role's details and permissions. */
export async function updateCustomRole(
  actorUserId: string,
  roleSlug: string,
  payload: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    permissionKeys?: PermissionKey[] | null; // null = untouched, [] = clear all
  },
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperAdmin();
  if (session.user.id !== actorUserId) throw new Error("Actor identity mismatch.");
  const client = await createClient();
  const { error } = await client.rpc("access_save_role", {
    p_slug: roleSlug, p_name: payload.name ?? null, p_description: payload.description ?? null,
    p_organization_id: null, p_active: payload.isActive ?? null,
    p_permission_keys: payload.permissionKeys ?? null, p_create: false,
  });
  return error ? { ok: false, error: error.message } : { ok: true };

}

/** Delete a custom role (system roles are protected). */
export async function deleteCustomRole(
  actorUserId: string,
  roleSlug: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSuperAdmin();
  if (session.user.id !== actorUserId) throw new Error("Actor identity mismatch.");
  const admin = createAdminClient();

  const { data: actor } = await admin
    .from("profiles")
    .select("platform_role, status")
    .eq("id", actorUserId)
    .single();
  if (!actor || actor.platform_role !== "super_admin" || actor.status !== "active") {
    return { ok: false, error: "Only an active Super Admin can delete roles." };
  }

  const { data: role } = await admin
    .from("access_roles")
    .select("id, is_system")
    .eq("slug", roleSlug)
    .single();
  if (!role) return { ok: false, error: "Role not found." };
  if (role.is_system) {
    return { ok: false, error: "System roles cannot be deleted." };
  }

  const { error } = await admin.from("access_roles").delete().eq("id", role.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
