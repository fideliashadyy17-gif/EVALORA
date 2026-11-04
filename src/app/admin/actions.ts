"use server";

import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function audit(action: string, entity: string, entityId: string, orgId?: string | null, metadata?: Record<string, unknown>) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id, organization_id: orgId ?? null, action, entity, entity_id: entityId, metadata: metadata ?? {},
  });
}

/** Signed URL for a private payment proof (Super Admin review). */
export async function getProofUrl(path: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin.storage.from("payment-proofs").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function reviewPayment(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("note") ?? "").slice(0, 500) || null;

  const { data: pr } = await admin.from("payment_requests").select("*, plans(*)").eq("id", id).single();
  if (!pr || pr.status !== "pending") redirect("/admin/payments");

  if (decision === "approve") {
    await admin.from("payment_requests").update({
      status: "approved", reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString(), admin_note: note,
    }).eq("id", id);

    // Cancel other active/trialing subscriptions, then activate the paid one.
    await admin.from("subscriptions").update({ status: "cancelled" })
      .eq("organization_id", pr.organization_id).in("status", ["active", "trialing"]);
    const months = pr.billing_period === "yearly" ? 12 : 1;
    const end = new Date();
    end.setMonth(end.getMonth() + months);
    await admin.from("subscriptions").insert({
      organization_id: pr.organization_id,
      plan_id: pr.plan_id,
      status: "active",
      billing_period: pr.billing_period,
      current_period_start: new Date().toISOString(),
      current_period_end: end.toISOString(),
    });
  } else {
    await admin.from("payment_requests").update({
      status: "rejected", reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString(),
      admin_note: note, rejection_reason: note ?? "Payment could not be verified.",
    }).eq("id", id);
  }

  if (pr.submitted_by) {
    await admin.from("notifications").insert({
      user_id: pr.submitted_by,
      type: "payment",
      title: decision === "approve" ? "Payment approved — subscription active" : "Payment not approved",
      body: decision === "approve"
        ? `Your ${pr.plans.name} subscription (${money(pr.amount_cents, pr.currency)}, ref ${pr.transaction_ref}) is now active.`
        : `Your payment (ref ${pr.transaction_ref}) was not approved. ${note ?? "Please check the reference and try again."}`,
      link: "/dashboard/billing",
    });
  }
  await audit(decision === "approve" ? "payment.approved" : "payment.rejected", "payment_requests", id, pr.organization_id, { ref: pr.transaction_ref });
  revalidatePath("/admin/payments");
  redirect("/admin/payments");
}

export async function savePlan(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id") ?? "");
  let limits: unknown;
  try { limits = JSON.parse(String(formData.get("limits") ?? "{}")); } catch { redirect("/admin/plans?e=json"); }
  const features = String(formData.get("features") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const payload = {
    name: String(formData.get("name") ?? "").slice(0, 80),
    description: String(formData.get("description") ?? "").slice(0, 300) || null,
    price_monthly_cents: Math.round(parseFloat(String(formData.get("price_monthly") ?? "0")) * 100) || 0,
    price_yearly_cents: Math.round(parseFloat(String(formData.get("price_yearly") ?? "0")) * 100) || 0,
    currency: String(formData.get("currency") ?? "USD").slice(0, 3).toUpperCase(),
    trial_days: parseInt(String(formData.get("trial_days") ?? "14")) || 0,
    limits,
    features,
    is_active: formData.get("is_active") === "on",
  };
  if (id) {
    await admin.from("plans").update(payload).eq("id", id);
    await audit("plan.updated", "plans", id);
  } else {
    const slug = String(formData.get("slug") ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const { data } = await admin.from("plans").insert({ ...payload, slug }).select("id").single();
    if (data) await audit("plan.created", "plans", data.id);
  }
  revalidatePath("/admin/plans");
  redirect("/admin/plans");
}

export async function setUserStatus(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) === "suspended" ? "suspended" : "active";
  await admin.from("profiles").update({ status }).eq("id", id);
  await audit(`user.${status}`, "profiles", id);
  revalidatePath("/admin/users");
}

export async function setOrgStatus(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) === "suspended" ? "suspended" : "active";
  await admin.from("organizations").update({ status }).eq("id", id);
  await audit(`organization.${status}`, "organizations", id, id);
  revalidatePath("/admin/organizations");
}

export async function grantSubscription(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const planId = String(formData.get("plan_id"));
  const months = Math.max(1, parseInt(String(formData.get("months") ?? "12")) || 12);
  await admin.from("subscriptions").update({ status: "cancelled" }).eq("organization_id", orgId).in("status", ["active", "trialing"]);
  const end = new Date();
  end.setMonth(end.getMonth() + months);
  await admin.from("subscriptions").insert({
    organization_id: orgId, plan_id: planId, status: "active", billing_period: "one_time",
    current_period_start: new Date().toISOString(), current_period_end: end.toISOString(),
  });
  await audit("subscription.granted", "subscriptions", orgId, orgId, { months });
  revalidatePath("/admin/organizations");
  redirect("/admin/organizations");
}

export async function saveSetting(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const key = String(formData.get("key"));
  let value: unknown;
  try { value = JSON.parse(String(formData.get("value") ?? "null")); } catch { redirect("/admin/settings?e=json"); }
  await admin.from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  await audit("settings.updated", "platform_settings", key);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

export async function setTicketStatus(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  await admin.from("support_tickets").update({ status: String(formData.get("status")) }).eq("id", String(formData.get("id")));
  revalidatePath("/admin/support");
}
