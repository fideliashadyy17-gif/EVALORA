"use server";

/**
 * Super Admin — Plan & Module Management mutations.
 *
 * Both writes are owner-gated (requireSuperAdmin), audited, and only touch
 * the two additive jsonb columns (plans.modules / subscriptions.modules_override).
 * No plan row, subscription row, organization or customer data is deleted;
 * entitlement changes take effect on the next server-side resolution.
 */
import { audit, requireSuperAdmin } from "@/lib/admin";
import { MODULE_KEYS, MODULE_CATALOG } from "@/lib/modules";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Persist a plan's full module map (explicit booleans for every catalog key). */
export async function savePlanModules(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const planId = String(formData.get("plan_id") ?? "");
  if (!UUID.test(planId)) redirect("/admin/plans/modules?e=invalid");

  const modules: Record<string, boolean> = {};
  for (const { key } of MODULE_CATALOG) {
    modules[key] = formData.get(`m_${key}`) === "on";
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("plans")
    .update({ modules })
    .eq("id", planId)
    .select("id, slug, name")
    .maybeSingle();
  if (error || !data) redirect("/admin/plans/modules?e=save");

  await audit(ctx, "plan.modules_updated", "plans", data.id, null, {
    plan: data.slug,
    disabled: MODULE_KEYS.filter((k) => !modules[k]),
    total: MODULE_KEYS.length,
  });
  revalidatePath("/admin/plans/modules");
  redirect("/admin/plans/modules?ok=plan");
}

/**
 * Persist one organization's module override (tri-state form: inherit / on /
 * off). Only explicit on/off entries are stored; `inherit` removes the key so
 * the plan value applies. An empty override map is stored as NULL (= pure
 * plan inheritance).
 */
export async function saveSubscriptionModules(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const subId = String(formData.get("subscription_id") ?? "");
  if (!UUID.test(subId)) redirect("/admin/plans/modules?e=invalid");

  const override: Record<string, boolean> = {};
  for (const { key } of MODULE_CATALOG) {
    const state = String(formData.get(`o_${key}`) ?? "inherit");
    if (state === "on") override[key] = true;
    else if (state === "off") override[key] = false;
  }
  const value = Object.keys(override).length > 0 ? override : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .update({ modules_override: value })
    .eq("id", subId)
    .select("id, organization_id, plan_id")
    .maybeSingle();
  if (error || !data) redirect("/admin/plans/modules?e=save");

  await audit(ctx, "subscription.modules_override_updated", "subscriptions", data.id, data.organization_id, {
    overridden_on: Object.keys(override).filter((k) => override[k]),
    overridden_off: Object.keys(override).filter((k) => !override[k]),
    cleared: value === null,
  });
  revalidatePath("/admin/plans/modules");
  redirect("/admin/plans/modules?ok=override");
}
