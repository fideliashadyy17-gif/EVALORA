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
  source: string;
  limits: PlanLimits;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
}

/** The platform owner is never metered: unlimited everything. */
export const UNLIMITED_LIMITS: PlanLimits = {
  max_quizzes: -1,
  max_participants_per_session: -1,
  max_exams: -1,
  max_members: -1,
  max_questions: -1,
  proctoring: true,
  advanced_reports: true,
  storage_mb: -1,
};

/**
 * Resolve an organization's entitlement.
 *
 * `ownerBypass` implements the platform-owner privilege SERVER-SIDE:
 * when the acting user is the Super Admin (verified from the session
 * profile by the caller), commercial limits do not apply — the owner
 * never has to buy a plan to operate the platform. This bypasses
 * commerce only; RLS, audit logging and role checks still apply.
 *
 * A subscription's `limits_override` (set by the Super Admin from the
 * console) is merged over the plan limits for ordinary customers.
 */
export async function getEntitlement(
  supabase: SupabaseClient,
  organizationId: string,
  opts?: { ownerBypass?: boolean },
): Promise<Entitlement> {
  if (opts?.ownerBypass) {
    return {
      planName: "Platform Owner",
      planSlug: "owner",
      status: "owner",
      source: "owner",
      limits: UNLIMITED_LIMITS,
      currentPeriodEnd: null,
      trialEndsAt: null,
    };
  }
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
        source: (sub as { source?: string }).source ?? "paid",
        limits: {
          ...FREE_LIMITS,
          ...(sub.plans.limits as Partial<PlanLimits>),
          ...(((sub as { limits_override?: Partial<PlanLimits> | null }).limits_override ?? {}) as Partial<PlanLimits>),
        },
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
    source: "free",
    limits: free ? { ...FREE_LIMITS, ...(free.limits as Partial<PlanLimits>) } : FREE_LIMITS,
    currentPeriodEnd: null,
    trialEndsAt: null,
  };
}

export function withinLimit(limit: number, current: number) {
  return limit === -1 || current < limit;
}
