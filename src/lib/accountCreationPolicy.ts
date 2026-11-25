/**
 * Pure RBAC policy for organization staff account creation.
 *
 * Drives the role dropdown and server-side validation for `/dashboard/accounts`
 * (and related member provisioning flows) directly from the centralized
 * `access_roles` + `access_role_permissions` catalog instead of a hardcoded
 * role list.
 */

export interface CatalogRoleRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  is_system: boolean;
  is_active: boolean;
  organization_id: string | null;
}

export interface AccountCreationRoleOption {
  /** `access_roles.id` — persisted into `access_user_roles.role_id`. */
  id: string;
  /** Canonical RBAC slug in `access_roles.slug` (e.g. `org_admin`, `school_founder`, `teacher`). */
  slug: string;
  /** Corresponding value persisted in `organization_members.role` (e.g. `admin`, `school_founder`, `teacher`). */
  memberRole: string;
  /** Raw catalog name from `access_roles.name`. */
  name: string;
  /** Institutional display label shown in the Oak / organization UI. */
  label: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
}

/**
 * Roles that must NEVER be exposed or assignable from an organization's
 * staff account-creation screen:
 *   - `super_admin` / `org_owner`: platform-managed authority.
 *   - `student`, `candidate`, `participant`, `parent`: learner/guardian roles
 *     (students have their dedicated Student Accounts section).
 *   - `director_demo`: legacy demonstration viewer superseded by `school_founder`.
 */
export const EXCLUDED_ACCOUNT_CREATION_ROLE_SLUGS = new Set<string>([
  "super_admin",
  "org_owner",
  "owner",
  "student",
  "candidate",
  "participant",
  "parent",
  "director_demo",
]);

/** Roles considered active operational staff (incompatible with dedicated `school_founder`). */
export const OPERATIONAL_STAFF_MEMBER_ROLES = new Set<string>([
  "owner",
  "admin",
  "teacher",
  "organizer",
  "supervisor",
  "corrector",
]);

const ROLE_DISPLAY_ORDER = new Map<string, number>([
  ["org_admin", 10],
  ["school_founder", 20],
  ["teacher", 30],
  ["organizer", 40],
  ["supervisor", 50],
  ["corrector", 60],
]);

/** Map a canonical `access_roles.slug` to `organization_members.role`. */
export function rbacSlugToMemberRole(slug: string): string {
  const normalized = String(slug ?? "").trim().toLowerCase();
  if (normalized === "org_admin") return "admin";
  if (normalized === "org_owner") return "owner";
  return normalized;
}

/** Map an `organization_members.role` (or legacy form input) to its canonical `access_roles.slug`. */
export function memberRoleToRbacSlug(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "admin") return "org_admin";
  if (normalized === "owner") return "org_owner";
  return normalized;
}

/** Normalize a submitted form role value (`admin`, `org_admin`, `school_founder`, etc.) into a canonical RBAC slug. */
export function normalizeRequestedStaffRoleSlug(input: string | null | undefined): string {
  return memberRoleToRbacSlug(input);
}

/** Human-facing institutional role label shared by Oak accounts, team and RBAC screens. */
export function formatOrganizationRoleLabel(
  slugOrMemberRole: string | null | undefined,
  catalogName?: string | null,
): string {
  const slug = memberRoleToRbacSlug(slugOrMemberRole);
  switch (slug) {
    case "org_owner":
      return "Organization Owner";
    case "org_admin":
      return "School Administrator (Organization Admin)";
    case "school_founder":
      return "School Founder / Institutional Supervisor";
    case "teacher":
      return "Teacher / Quiz Creator";
    case "organizer":
      return "Quiz Organizer";
    case "supervisor":
      return "Supervisor / Proctor";
    case "corrector":
      return "Corrector / Examiner";
    case "student":
      return "Student";
    case "candidate":
      return "Examination Candidate";
    case "participant":
      return "Participant";
    case "parent":
      return "Parent / Guardian";
    default:
      return catalogName?.trim() || String(slugOrMemberRole ?? "Member");
  }
}

/**
 * Filter active centralized RBAC catalog roles down to those available for
 * organization staff account creation by the current caller.
 *
 * Security invariants enforced:
 *  - `super_admin` and `org_owner` are NEVER returned (even to a Super Admin
 *    operating inside an organization workspace).
 *  - Inactive roles and roles scoped to another organization are excluded.
 *  - Non-Super-Admin managers can only create accounts with roles whose
 *    enabled permissions are a subset of the caller's own effective
 *    permissions in this organization (no privilege escalation).
 */
export function filterAccountCreationRoles(input: {
  organizationId: string;
  isSuperAdmin: boolean;
  callerCanManageMembers: boolean;
  roles: readonly CatalogRoleRecord[];
  rolePermissions: ReadonlyMap<string, readonly string[]>;
  callerEffectivePermissions: Readonly<Record<string, boolean>>;
}): AccountCreationRoleOption[] {
  if (!input.isSuperAdmin && !input.callerCanManageMembers) return [];

  const eligible: AccountCreationRoleOption[] = [];
  const seenSlugs = new Set<string>();

  for (const role of input.roles) {
    const slug = String(role.slug ?? "").trim().toLowerCase();
    if (!slug || seenSlugs.has(slug)) continue;
    if (!role.is_active) continue;
    if (EXCLUDED_ACCOUNT_CREATION_ROLE_SLUGS.has(slug)) continue;
    if (role.organization_id && role.organization_id !== input.organizationId) continue;

    // Validate the mapped member role conforms to `organization_members_role_check`.
    const memberRole = rbacSlugToMemberRole(slug);
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(memberRole)) continue;

    const grantedKeys = input.rolePermissions.get(role.id) ?? [];
    if (!input.isSuperAdmin) {
      const callerHoldsAll = grantedKeys.every((permKey) => input.callerEffectivePermissions[permKey] === true);
      if (!callerHoldsAll) continue;
    }

    seenSlugs.add(slug);
    eligible.push({
      id: role.id,
      slug,
      memberRole,
      name: role.name,
      label: formatOrganizationRoleLabel(slug, role.name),
      description: role.description ?? null,
      isSystem: Boolean(role.is_system),
      permissionCount: grantedKeys.length,
    });
  }

  eligible.sort((a, b) => {
    const orderA = ROLE_DISPLAY_ORDER.get(a.slug) ?? 100;
    const orderB = ROLE_DISPLAY_ORDER.get(b.slug) ?? 100;
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  });

  return eligible;
}

export interface PendingInvitationRecord {
  id: string;
  role: string;
  status: string;
}

/**
 * Determine how to safely reconcile existing pending invitations for an email
 * in this organization when the account is provisioned directly:
 *   - Matching role (normalized across `admin`/`org_admin`) → mark `accepted`.
 *   - Any other pending invitation for the same email in this org → mark `revoked`
 *     so a stale link cannot later overwrite or conflict with the new membership.
 */
export function planPendingInvitationReconciliation(
  pendingInvitations: readonly PendingInvitationRecord[],
  provisionedRoleSlug: string,
): { acceptIds: string[]; revokeIds: string[] } {
  const targetSlug = memberRoleToRbacSlug(provisionedRoleSlug);
  const acceptIds: string[] = [];
  const revokeIds: string[] = [];

  for (const inv of pendingInvitations) {
    if (inv.status !== "pending") continue;
    const invSlug = memberRoleToRbacSlug(inv.role);
    if (invSlug === targetSlug) {
      acceptIds.push(inv.id);
    } else {
      revokeIds.push(inv.id);
    }
  }
  return { acceptIds, revokeIds };
}
