/**
 * Who sees which dashboard navigation entry.
 *
 * This only decides what is *offered*. Every page and server action re-checks
 * the verified organization role against the database (see can() in lib/auth),
 * so hiding a link is never the security boundary — it just stops teachers and
 * staff from being shown administration modules they cannot use.
 */
export type NavAudience = "all" | "staff" | "managers";

/** Roles that may administer the organization (team, billing, settings). */
export const MANAGEMENT_ORG_ROLES = ["owner", "admin"] as const;

/** Roles that work inside the organization (teaching, organizing, marking). */
export const STAFF_ORG_ROLES = ["owner", "admin", "teacher", "organizer", "supervisor", "corrector"] as const;

export function isManagementRole(role: string | null | undefined): boolean {
  return MANAGEMENT_ORG_ROLES.includes((role ?? "") as (typeof MANAGEMENT_ORG_ROLES)[number]);
}

export function isStaffRole(role: string | null | undefined): boolean {
  return STAFF_ORG_ROLES.includes((role ?? "") as (typeof STAFF_ORG_ROLES)[number]);
}

export function canSeeAudience(audience: NavAudience | undefined, role: string | null | undefined): boolean {
  if (!audience || audience === "all") return true;
  if (audience === "managers") return isManagementRole(role);
  return isStaffRole(role);
}

/** Filter one navigation list for a verified organization role. */
export function filterNavItems<T extends { audience?: NavAudience }>(
  items: readonly T[],
  role: string | null | undefined,
): T[] {
  return items.filter((item) => canSeeAudience(item.audience, role));
}

/**
 * Human label for the workspace a role lands in after sign-in.
 * Used by the dashboard header so a teacher knows they are in the teacher
 * workspace, not an administrator one.
 */
export function workspaceLabel(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "Organization owner workspace";
    case "admin":
      return "Administrator workspace";
    case "teacher":
      return "Teacher workspace";
    case "organizer":
      return "Organizer workspace";
    case "supervisor":
      return "Supervisor workspace";
    case "corrector":
      return "Corrector workspace";
    case "student":
    case "candidate":
    case "participant":
      return "Student workspace";
    case "parent":
      return "Guardian workspace";
    default:
      return "Workspace";
  }
}
