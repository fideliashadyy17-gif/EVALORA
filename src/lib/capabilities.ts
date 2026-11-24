import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "./auth";
import {
  resolveCapabilities,
  type CapabilityKey,
  type CapabilitySet,
  type FeatureFlags,
} from "./capability-rules";
import { getEntitlementFor, type Entitlement } from "./entitlements";
import { MODULE_CAPABILITY_GATES, moduleEnabled } from "./modules";
import { getFeatureFlags } from "./platform";
import { redirect } from "next/navigation";

export interface CapabilityResult {
  entitlement: Entitlement;
  featureFlags: FeatureFlags;
  capabilities: CapabilitySet;
  isSuperAdmin: boolean;
}

/**
 * Single server-side authorization / entitlement resolution point. It uses
 * the verified session, the single `plans`/subscriptions entitlement source,
 * and platform feature flags. Never rely on a frontend-only bypass.
 */
export async function getCapabilities(
  supabase: SupabaseClient,
  ctx: SessionContext,
  organizationId: string,
): Promise<CapabilityResult> {
  const [entitlement, featureFlags] = await Promise.all([
    getEntitlementFor(supabase, ctx, organizationId),
    getFeatureFlags(),
  ]);
  const isSuperAdmin = ctx.profile.status === "active" && ctx.profile.platform_role === "super_admin";
  const capabilities = resolveCapabilities({
    isSuperAdmin,
    planSlug: entitlement.planSlug,
    limits: entitlement.limits,
    featureFlags,
  });
  // Module entitlements (Plan & Module Management) are ANDed into the same
  // capability set every page and server action already consults — disabling
  // a module therefore takes effect server-side everywhere at once, not just
  // in a menu. Role checks keep applying independently on top.
  for (const [moduleKey, capabilityKey] of Object.entries(MODULE_CAPABILITY_GATES)) {
    if (!moduleEnabled(entitlement.modules, moduleKey)) {
      (capabilities as Record<string, boolean>)[capabilityKey] = false;
    }
  }
  return { entitlement, featureFlags, capabilities, isSuperAdmin };
}

/**
 * Redirect guard for a fine-grained module (validation, publication, links,
 * hints, templates, printable papers, calculator…). Use inside server pages
 * and actions AFTER requireUser/capability checks so roles and entitlements
 * are both enforced.
 */
export function requireModule(
  entitlement: Entitlement,
  moduleKey: string,
  redirectTo: string,
): void {
  if (!moduleEnabled(entitlement.modules, moduleKey)) redirect(redirectTo);
}

/** Redirect-based guard for server actions; returns the resolved result. */
export async function requireCapability(
  supabase: SupabaseClient,
  ctx: SessionContext,
  organizationId: string,
  capability: CapabilityKey,
  redirectTo: string,
): Promise<CapabilityResult> {
  const result = await getCapabilities(supabase, ctx, organizationId);
  if (!result.capabilities[capability]) redirect(redirectTo);
  return result;
}
