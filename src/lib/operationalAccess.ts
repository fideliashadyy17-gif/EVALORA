import "server-only";
import type { SessionContext } from "./auth";
import { hasPermission } from "./rbac";
import { createClient } from "./supabase/server";
import { getEntitlementFor } from "./entitlements";
import { moduleEnabled } from "./modules";

/**
 * Permission AND module entitlement. No caller-supplied privilege flag, no
 * owner/host shortcut and no fail-open fallback if the RBAC migration/read is
 * unavailable. Existing resource ownership/tenant checks remain independent.
 */
export async function canOperate(
  ctx: SessionContext,
  organizationId: string,
  permission: string,
  module: string,
): Promise<boolean> {
  try {
    if (!await hasPermission(ctx, organizationId, permission)) return false;
    const client = await createClient();
    const entitlement = await getEntitlementFor(client, ctx, organizationId);
    return moduleEnabled(entitlement.modules, module);
  } catch {
    return false;
  }
}
