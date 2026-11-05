import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "./auth";

/**
 * Plan entitlements are resolved and enforced on the SERVER.
 * Limits use -1 for "unlimited". The active entitlement comes from the
 * organization's latest active/trialing subscription; if none (or the
 * trial/subscription has lapsed) the Free plan applies.
 *
 * `getEntitlementFor()` is the single centralized wrapper used by EVALORA
 * server actions/pages: it derives the platform-owner bypass from the
 * verified session profile rather than trusting a caller-supplied flag.
 * The underlying `getEntitlement()` is retained for explicit customer-facing
 * plan inspection (e.g. an organization's Subscription tab).
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
  institutional: boolean;
  max_classes: number;
  max_students: number;
  multi_class_operations: boolean;
  central_asset_management: boolean;
  configurable_limits: boolean;
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
  institutional: false,
  max_classes: -1,
  max_students: -1,
  multi_class_operations: true,
  central_asset_management: false,
  configurable_limits: false,
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

/**
 * The platform owner is never metered: unlimited everything. Owner privileges
 * are represented by a distinct `owner` plan identity, NOT by the customer
 * Institutional plan; authorization rules make that distinction explicit.
 */
export const UNLIMITED_LIMITS: PlanLimits = {
  max_quizzes: -1,
  max_participants_per_session: -1,
  max_exams: -1,
  max_members: -1,
  max_questions: -1,
  proctoring: true,
  advanced_reports: true,
  storage_mb: -1,
  institutional: false,
  max_classes: -1,
  max_students: -1,
  multi_class_operations: true,
  central_asset_management: false,
  configurable_limits: false,
};

/**
 * Resolve an organization's entitlement.
 *
 * `ownerBypass` implements the platform-owner privilege SERVER-SIDE:
 * when the acting user is the Super Admin (verified from the session
 * profile by `getEntitlementFor`), commercial limits do not apply — the
 * owner never has to buy a plan to operate the platform. This bypasses
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

/** Centralized session-aware entitlement resolver for server-side access. */
export async function getEntitlementFor(
  supabase: SupabaseClient,
  ctx: SessionContext,
  organizationId: string,
): Promise<Entitlement> {
  return getEntitlement(supabase, organizationId, {
    ownerBypass: ctx.profile.platform_role === "super_admin",
  });
}

export function withinLimit(limit: number, current: number) {
  return limit === -1 || current < limit;
}
