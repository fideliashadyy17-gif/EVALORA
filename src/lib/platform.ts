import type { SessionContext } from "./auth";
import { createAdminClient } from "./supabase/server";

/**
 * Platform feature flags, stored in platform_settings (key = 'features')
 * and managed from Super Admin → Modules & Features. Read server-side
 * with the service role so enforcement works for every caller, and
 * enforced at the choke points that start live sessions, create
 * examinations, and mint proctoring tokens.
 *
 * `isFeatureEnabledFor()` gives the verified Super Admin unrestricted
 * operational access. Ordinary customers — including Institutional ones —
 * remain subject to global module toggles and their plan entitlements.
 */
export type FeatureKey = "live_quizzes" | "examinations" | "proctoring";

export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  live_quizzes: true,
  examinations: true,
  proctoring: true,
};

export async function getFeatureFlags(): Promise<Record<FeatureKey, boolean>> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "features")
      .maybeSingle();
    const stored = (data?.value as Partial<Record<FeatureKey, boolean>> | null) ?? {};
    return { ...FEATURE_DEFAULTS, ...stored };
  } catch {
    return { ...FEATURE_DEFAULTS };
  }
}

export async function isFeatureEnabled(
  key: FeatureKey,
  opts?: { ownerBypass?: boolean },
): Promise<boolean> {
  if (opts?.ownerBypass) return true;
  const flags = await getFeatureFlags();
  return flags[key] !== false;
}

/** Session-aware centralized feature check for server actions and APIs. */
export async function isFeatureEnabledFor(
  ctx: Pick<SessionContext, "profile">,
  key: FeatureKey,
): Promise<boolean> {
  return isFeatureEnabled(key, {
    ownerBypass: ctx.profile.status === "active" && ctx.profile.platform_role === "super_admin",
  });
}
