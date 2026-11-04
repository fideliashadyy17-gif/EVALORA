import { createAdminClient } from "./supabase/server";

/**
 * Platform feature flags, stored in platform_settings (key = 'features')
 * and managed from Super Admin → Modules & Features. Read server-side
 * with the service role so enforcement works for every caller, and
 * enforced at the choke points that start live sessions, create
 * examinations, and mint proctoring tokens.
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

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[key] !== false;
}
