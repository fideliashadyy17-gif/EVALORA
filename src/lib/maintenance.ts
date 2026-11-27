/**
 * Maintenance mode — pure policy.
 *
 * Maintenance mode is a platform-wide switch configured in the Platform
 * Control Center (platform_behavior.maintenance_mode). It is enforced in Edge
 * middleware because that is the only layer that reliably knows the request
 * pathname before any page renders.
 *
 * Two rules are non-negotiable and encoded here so they cannot be forgotten at
 * a call site:
 *
 *   1. A verified Super Admin is ALWAYS let through. A platform that could
 *      lock its own administrator out during maintenance would be unable to
 *      turn maintenance off.
 *   2. In-flight candidate and live-session routes stay open. Closing them
 *      mid-examination would destroy attempts that are already running, which
 *      the no-regression rules forbid.
 *
 * Pure module: no Next.js, no database, no React.
 */

/** Routes that keep serving while maintenance mode is on. */
export const MAINTENANCE_OPEN_PREFIXES: readonly string[] = [
  // The notice itself, plus assets and health checks.
  "/maintenance",
  "/api/health",
  "/_next",
  // Authentication must stay reachable so an administrator can sign in and
  // turn maintenance off again.
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth",
  // Candidate and live surfaces: an attempt in progress must never be cut off.
  "/take-exam",
  "/exam-access",
  "/exam",
  "/retake",
  "/play",
  "/join",
  "/live",
  "/supervision",
  "/student",
];

/** Exact paths that stay open. */
export const MAINTENANCE_OPEN_EXACT: readonly string[] = ["/", "/favicon.ico", "/robots.txt", "/sitemap.xml"];

/** True when a pathname must keep serving during maintenance. */
export function isMaintenanceOpenPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? "/").trim() || "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (MAINTENANCE_OPEN_EXACT.includes(normalized)) return true;
  return MAINTENANCE_OPEN_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/** The maintenance state read from configuration storage. */
export interface MaintenanceState {
  enabled: boolean;
  message: string;
}

export const DEFAULT_MAINTENANCE_MESSAGE =
  "EVALORA is undergoing scheduled maintenance. Service will resume shortly.";

/**
 * Parse stored configuration rows into a maintenance state. Anything
 * malformed resolves to "off": a configuration error must never take the
 * platform down.
 */
export function parseMaintenanceState(rows: unknown): MaintenanceState {
  let enabled = false;
  let message = DEFAULT_MAINTENANCE_MESSAGE;
  if (Array.isArray(rows)) {
    for (const row of rows as { key?: unknown; value?: unknown }[]) {
      if (row?.key === "maintenance_mode") enabled = row.value === true || row.value === "true";
      if (row?.key === "maintenance_message" && typeof row.value === "string" && row.value.trim()) {
        message = row.value.trim().slice(0, 600);
      }
    }
  }
  return { enabled, message };
}

/**
 * The decision, stated once so middleware and tests share it.
 * `isSuperAdmin` must come from a verified session, never from a header.
 */
export function shouldServeDuringMaintenance(params: {
  enabled: boolean;
  pathname: string;
  isSuperAdmin: boolean;
}): { serve: boolean; reason: string } {
  if (!params.enabled) return { serve: true, reason: "maintenance_off" };
  if (params.isSuperAdmin) return { serve: true, reason: "super_admin_bypass" };
  if (isMaintenanceOpenPath(params.pathname)) return { serve: true, reason: "protected_route" };
  return { serve: false, reason: "maintenance_notice" };
}
