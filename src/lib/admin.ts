import { requireSuperAdmin, type SessionContext } from "./auth";
import { createAdminClient } from "./supabase/server";
import { validateSubdomain } from "./tenant";
import { slugify } from "./utils";

/**
 * Shared server-side helpers for the Super Admin console.
 * Every mutation goes through requireSuperAdmin() + audit() so the
 * platform-owner bypass never weakens accountability.
 */

export async function audit(
  ctx: SessionContext,
  action: string,
  entity: string,
  entityId: string,
  orgId?: string | null,
  metadata?: Record<string, unknown>,
) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: orgId ?? null,
    action,
    entity,
    entity_id: entityId,
    metadata: metadata ?? {},
  });
}

export { requireSuperAdmin };

/** One-time admin flash message cookie (see admin user actions). */
export const FLASH_COOKIE = "evalora_flash";

/** FormData helpers — bounded, trimmed, predictable. */
export const fstr = (fd: FormData, key: string, max = 2000) => {
  const v = String(fd.get(key) ?? "").trim();
  return v.slice(0, max) || null;
};
export const fnum = (fd: FormData, key: string) => {
  const v = parseFloat(String(fd.get(key) ?? ""));
  return Number.isFinite(v) ? v : null;
};
export const fint = (fd: FormData, key: string) => {
  const v = parseInt(String(fd.get(key) ?? ""), 10);
  return Number.isFinite(v) ? v : null;
};
export const fdate = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
export const fday = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

/**
 * Unique organization slug = tenant subdomain. Reserved/invalid base
 * names fall back to "<base>-school"; collisions get a short suffix.
 */
export async function uniqueOrgSlug(name: string, requested?: string | null): Promise<string> {
  const admin = createAdminClient();
  let base = requested ? slugify(requested) : slugify(name);
  if (!base || !validateSubdomain(base).ok) base = `${base || slugify(name) || "organization"}-school`;
  base = base.slice(0, 63).replace(/-+$/g, "");
  let slug = base;
  for (let i = 0; i < 6; i++) {
    const { data } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base.slice(0, 55)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36)}`;
}

export interface PaymentConfig {
  methods: string[];
  currencies: string[];
  categories: string[];
}

export const PAYMENT_CONFIG_DEFAULTS: PaymentConfig = {
  methods: ["Bank transfer", "Mobile money", "Cash", "Manual deposit", "Card", "Other"],
  currencies: ["USD", "EUR", "XOF", "NGN", "GHS", "KES"],
  categories: ["Subscription", "Service", "Competition entry", "Other"],
};

export async function getPaymentConfig(): Promise<PaymentConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_config")
      .maybeSingle();
    const v = (data?.value as Partial<PaymentConfig> | null) ?? {};
    return {
      methods: v.methods?.length ? v.methods : PAYMENT_CONFIG_DEFAULTS.methods,
      currencies: v.currencies?.length ? v.currencies : PAYMENT_CONFIG_DEFAULTS.currencies,
      categories: v.categories?.length ? v.categories : PAYMENT_CONFIG_DEFAULTS.categories,
    };
  } catch {
    return PAYMENT_CONFIG_DEFAULTS;
  }
}

/**
 * Activate (or extend) an organization's paid subscription after a
 * VERIFIED payment. Cancels other active/trialing subscriptions so
 * exactly one commercial entitlement governs the workspace.
 */
export async function activatePaidSubscription(
  organizationId: string,
  planId: string,
  billingPeriod: string,
) {
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("organization_id", organizationId)
    .in("status", ["active", "trialing"]);
  const months = billingPeriod === "yearly" ? 12 : 1;
  const end = new Date();
  end.setMonth(end.getMonth() + months);
  const { data } = await admin
    .from("subscriptions")
    .insert({
      organization_id: organizationId,
      plan_id: planId,
      status: "active",
      source: "paid",
      billing_period: billingPeriod,
      current_period_start: new Date().toISOString(),
      current_period_end: end.toISOString(),
    })
    .select("id")
    .single();
  return data?.id ?? null;
}
