/** Paths are hints only; all destination routes must still authorize requests. */
export function safeLocalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://evalora.invalid");
    if (url.origin !== "https://evalora.invalid" || url.hash) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

const inArea = (path: string, root: string) => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}?`);
// Includes family accounts because no dedicated parent portal exists yet; they
// must not be sent to staff dashboards in the meantime.
export const isLearnerRole = (role: string | null | undefined) =>
  role === "student" || role === "candidate" || role === "participant" || role === "parent";

/** Called only with server-verified active profile and memberships. */
export function postAuthDestination(
  input: { platformRole: string; role?: string | null; hasOrg: boolean; tenantDenied?: boolean; needsSelection?: boolean },
  requested: string | null | undefined,
): string {
  const next = safeLocalPath(requested);
  // Platform administration is independent of the selected customer workspace.
  if (input.platformRole === "super_admin") return next && inArea(next, "/admin") ? next : "/admin";
  // Invitation flow must remain usable before a membership exists.
  if (next && inArea(next, "/invite")) return next;
  if (input.tenantDenied) return "/dashboard";
  if (input.needsSelection) return "/workspaces";
  if (!input.hasOrg) return "/onboarding";
  if (isLearnerRole(input.role)) {
    return next && (inArea(next, "/student") || inArea(next, "/exam-access") || inArea(next, "/join")) ? next : "/student";
  }
  return next && (inArea(next, "/dashboard") || inArea(next, "/exam-access") || inArea(next, "/join")) ? next : "/dashboard";
}
