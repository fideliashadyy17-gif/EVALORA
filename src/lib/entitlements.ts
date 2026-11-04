import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plan entitlements are resolved and enforced on the SERVER.
 * Limits use -1 for "unlimited". The active entitlement comes from the
 * organization's latest active/trialing subscription; if none (or the
 * trial/subscription has lapsed) the Free plan applies.
 */

export interface PlanLimits {
  max_quizzes: number;
  max_participants_per_session: number;
  max_exams: number;
  max_members: number;
  max_questions: number;
  proctoring: boolean;
  advanced_reports: boolean;
  storage_mb: number;
}

export const FREE_LIMITS: PlanLimits = {
  max_quizzes: 5,
  max_participants_per_session: 30,
  max_exams: 2,
  max_members: 3,
  max_questions: 100,
  proctoring: false,
  advanced_reports: false,
  storage_mb: 100,
};

export interface Entitlement {
  planName: string;
  planSlug: string;
  status: string;
  limits: PlanLimits;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
}

export async function getEntitlement(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Entitlement> {
  const now = new Date().toISOString();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("organization_id", organizationId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    const end =
      sub.status === "trialing" ? sub.trial_ends_at : sub.current_period_end;
    const stillValid = !end || end > now;
    if (stillValid && sub.plans) {
      return {
        planName: sub.plans.name,
        planSlug: sub.plans.slug,
        status: sub.status,
        limits: { ...FREE_LIMITS, ...(sub.plans.limits as Partial<PlanLimits>) },
        currentPeriodEnd: sub.current_period_end,
        trialEndsAt: sub.trial_ends_at,
      };
    }
  }

  const { data: free } = await supabase
    .from("plans")
    .select("*")
    .eq("slug", "free")
    .maybeSingle();

  return {
    planName: free?.name ?? "Free",
    planSlug: "free",
    status: sub ? "expired" : "free",
    limits: free ? { ...FREE_LIMITS, ...(free.limits as Partial<PlanLimits>) } : FREE_LIMITS,
    currentPeriodEnd: null,
    trialEndsAt: null,
  };
}

export function withinLimit(limit: number, current: number) {
  return limit === -1 || current < limit;
}
