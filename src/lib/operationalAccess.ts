import type { SessionContext } from "./auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlementFor } from "./entitlements";
import { moduleEnabled } from "./modules";
import { checkPermissions, hasPermission } from "./rbac";
import { createClient } from "./supabase/server";

/**
 * Operational authorization boundary: intersects centralized database RBAC
 * effective permissions with organization module entitlements (when a module
 * key is supplied). Fails closed when either check denies or is unavailable.
 */
export async function canOperate(
  ctx: SessionContext,
  organizationId: string | null,
  permission: string,
  module?: string,
): Promise<boolean> {
  try {
    if (!ctx || ctx.profile.status !== "active") return false;
    if (!organizationId && ctx.profile.platform_role !== "super_admin") return false;
    const allowed = await hasPermission(ctx, organizationId, permission);
    if (!allowed) return false;
    if (!module || !organizationId) return true;
    const supabase = await createClient();
    const entitlement = await getEntitlementFor(supabase, ctx, organizationId);
    return moduleEnabled(entitlement.modules, module);
  } catch {
    return false;
  }
}

/**
 * The same check, for a caller that ALREADY holds an authenticated client.
 *
 * `canOperate` asks `resolvePermission`, which verifies the identity through
 * `client.auth.getUser()` on a cookie-bound client. That is correct for a
 * browser and impossible for an external agent, whose request carries a bearer
 * token rather than a session cookie — the shared services would then refuse
 * every write the agent is actually entitled to make.
 *
 * This variant takes the client the agent path already authenticated as the
 * owner, so the permission question is answered by the same
 * `access_has_permission` resolver, under the same identity, with no cookies
 * involved. Passing the service-role client here would be a bug: it would
 * resolve the caller's stored permissions but not prove who is asking.
 */
export async function canOperateWithClient(
  client: SupabaseClient,
  ctx: SessionContext,
  organizationId: string | null,
  permission: string,
  module?: string,
): Promise<boolean> {
  try {
    if (!ctx || ctx.profile.status !== "active") return false;
    if (!organizationId && ctx.profile.platform_role !== "super_admin") return false;
    const { data, error } = await client.rpc("access_has_permission", {
      p_user_id: ctx.profile.id,
      p_organization_id: organizationId,
      p_permission_key: permission,
    });
    if (error || data !== true) return false;
    if (!module || !organizationId) return true;
    const entitlement = await getEntitlementFor(client, ctx, organizationId);
    return moduleEnabled(entitlement.modules, module);
  } catch {
    return false;
  }
}

export interface OperationCheck {
  permission: string;
  module?: string;
}

/**
 * Batch operational authorization check for pages/actions that inspect several
 * distinct permissions within one organization. Uses a single batch RPC call
 * and at most one entitlement lookup, failing closed on any error.
 */
export async function canOperateMany<K extends string>(
  ctx: SessionContext,
  organizationId: string | null,
  checks: Record<K, OperationCheck>,
): Promise<Record<K, boolean>> {
  const entries = Object.entries(checks) as [K, OperationCheck][];
  const result = Object.fromEntries(entries.map(([alias]) => [alias, false])) as Record<K, boolean>;
  if (!entries.length || !ctx || ctx.profile.status !== "active") return result;
  if (!organizationId && ctx.profile.platform_role !== "super_admin") return result;
  try {
    const keys = entries.map(([, c]) => c.permission);
    const needsModule = Boolean(organizationId && entries.some(([, c]) => Boolean(c.module)));
    const [permMap, entitlement] = await Promise.all([
      checkPermissions(ctx, organizationId, keys),
      needsModule && organizationId
        ? createClient().then((supabase) => getEntitlementFor(supabase, ctx, organizationId))
        : Promise.resolve(null),
    ]);
    for (const [alias, check] of entries) {
      const permAllowed = permMap[check.permission] === true;
      if (!permAllowed) {
        result[alias] = false;
      } else if (check.module && organizationId) {
        result[alias] = Boolean(entitlement && moduleEnabled(entitlement.modules, check.module));
      } else {
        result[alias] = true;
      }
    }
    return result;
  } catch {
    return result;
  }
}
