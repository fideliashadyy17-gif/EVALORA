"use server";

import { activatePaidSubscription, audit, fdate, fint, fnum, fstr, requireSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PAYMENT_STATUSES = ["pending", "approved", "rejected", "expired", "refunded", "cancelled"];

async function uploadProof(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > 10 * 1024 * 1024) return null;
  const admin = createAdminClient();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "proof";
  const path = `admin/${Date.now()}-${safe}`;
  const { error } = await admin.storage.from("payment-proofs").upload(path, file);
  return error ? null : path;
}

/**
 * Register a payment received outside the portal (bank transfer,
 * mobile money, cash…). A manual payment only counts as revenue once
 * approved — and approving one that names a plan activates the
 * organization's subscription exactly like a reviewed portal payment.
 */
export async function createManualPayment(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = fstr(formData, "organization_id", 60);
  const amount = fnum(formData, "amount");
  const status = String(formData.get("status")) === "approved" ? "approved" : "pending";
  const planId = fstr(formData, "plan_id", 60);
  if (!orgId) redirect("/admin/payments/new?e=org");
  if (!amount || amount <= 0) redirect("/admin/payments/new?e=amount");
  const category = fstr(formData, "category", 60);
  const source = String(formData.get("source")) === "adjustment" ? "adjustment" : "manual";

  // Duplicate protection: same org + reference may only be recorded once
  // (unless the earlier record was rejected/cancelled).
  const ref = fstr(formData, "transaction_ref", 120) ?? `MANUAL-${Date.now().toString(36).toUpperCase()}`;
  const { data: dupe } = await admin
    .from("payment_requests")
    .select("id")
    .eq("organization_id", orgId!)
    .eq("transaction_ref", ref)
    .not("status", "in", "(rejected,cancelled)")
    .maybeSingle();
  if (dupe) redirect("/admin/payments/new?e=duplicate_ref");

  const proofPath = await uploadProof(formData.get("proof") as File | null);
  const { data, error } = await admin
    .from("payment_requests")
    .insert({
      organization_id: orgId,
      plan_id: planId,
      billing_period: String(formData.get("billing_period") ?? "monthly"),
      amount_cents: Math.round(amount! * 100),
      currency: (fstr(formData, "currency", 3) ?? "USD").toUpperCase(),
      method: fstr(formData, "method", 60) ?? "Manual",
      transaction_ref: ref,
      proof_url: proofPath,
      status,
      source,
      payer_name: fstr(formData, "payer_name", 160),
      paid_at: fdate(formData, "paid_at") ?? new Date().toISOString(),
      description: [category, fstr(formData, "description", 500)].filter(Boolean).join(" — ") || null,
      admin_note: fstr(formData, "admin_note", 1000),
      submitted_by: ctx.user.id,
      reviewed_by: status === "approved" ? ctx.user.id : null,
      reviewed_at: status === "approved" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) redirect(error?.code === "23505" ? "/admin/payments/new?e=duplicate_ref" : "/admin/payments/new?e=failed");

  let subscriptionId: string | null = null;
  if (status === "approved" && planId) {
    subscriptionId = await activatePaidSubscription(orgId!, planId, String(formData.get("billing_period") ?? "monthly"));
    await notifyOrgAdmins(orgId!, "Subscription activated", `A payment of ${money(Math.round(amount! * 100), (fstr(formData, "currency", 3) ?? "USD").toUpperCase())} (ref ${ref}) was recorded and your subscription is now active.`, "/dashboard/billing");
  }
  await audit(ctx, "payment.manual_recorded", "payment_requests", data!.id, orgId, {
    amount_cents: Math.round(amount! * 100), ref, status, source, subscription: subscriptionId,
  });
  revalidatePath("/admin/payments");
  redirect(`/admin/payments/${data!.id}?ok=recorded`);
}

export async function updatePayment(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const { data: before } = await admin.from("payment_requests").select("*").eq("id", id).maybeSingle();
  if (!before) redirect("/admin/payments");

  const amount = fnum(formData, "amount");
  const statusRaw = String(formData.get("status") ?? before!.status);
  const status = PAYMENT_STATUSES.includes(statusRaw) ? statusRaw : before!.status;
  const planId = fstr(formData, "plan_id", 60);

  const proofPath = await uploadProof(formData.get("proof") as File | null);
  const patch: Record<string, unknown> = {
    payer_name: fstr(formData, "payer_name", 160),
    amount_cents: amount && amount > 0 ? Math.round(amount * 100) : before!.amount_cents,
    currency: (fstr(formData, "currency", 3) ?? before!.currency).toUpperCase(),
    method: fstr(formData, "method", 60) ?? before!.method,
    transaction_ref: fstr(formData, "transaction_ref", 120) ?? before!.transaction_ref,
    paid_at: fdate(formData, "paid_at") ?? before!.paid_at,
    description: fstr(formData, "description", 500),
    admin_note: fstr(formData, "admin_note", 1000),
    plan_id: planId,
    status,
  };
  if (proofPath) patch.proof_url = proofPath;
  if (status !== before!.status) {
    patch.reviewed_by = ctx.user.id;
    patch.reviewed_at = new Date().toISOString();
  }
  const { error: updError } = await admin.from("payment_requests").update(patch).eq("id", id);
  if (updError) {
    // 23505 = duplicate (organization_id, transaction_ref) per migration 0004.
    redirect(`/admin/payments/${id}?e=${updError.code === "23505" ? "duplicate_ref" : "failed"}`);
  }

  // Newly approved from pending → activate the subscription once.
  if (status === "approved" && before!.status === "pending" && planId) {
    await activatePaidSubscription(before!.organization_id, planId, before!.billing_period);
    await notifyOrgAdmins(before!.organization_id, "Payment approved — subscription active", `Your payment (ref ${patch.transaction_ref}) was verified and your subscription is active.`, "/dashboard/billing");
  }
  await audit(ctx, "payment.updated", "payment_requests", id, before!.organization_id, {
    before: { amount_cents: before!.amount_cents, status: before!.status, ref: before!.transaction_ref },
    after: { amount_cents: patch.amount_cents, status, ref: patch.transaction_ref },
  });
  revalidatePath("/admin/payments");
  redirect(`/admin/payments/${id}?ok=saved`);
}

export async function setPaymentStatusAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["refunded", "cancelled", "pending", "rejected"].includes(status)) redirect(`/admin/payments/${id}?e=status`);
  if (formData.get("confirm") !== "on") redirect(`/admin/payments/${id}?e=confirm`);
  const { data: before } = await admin.from("payment_requests").select("organization_id, status, amount_cents, currency").eq("id", id).maybeSingle();
  if (!before) redirect("/admin/payments");
  const note = fstr(formData, "note", 500);
  await admin
    .from("payment_requests")
    .update({ status, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString(), admin_note: note ?? undefined })
    .eq("id", id);
  await audit(ctx, `payment.${status}`, "payment_requests", id, before!.organization_id, {
    from: before!.status, amount_cents: before!.amount_cents, note,
  });
  if (status === "refunded") {
    await notifyOrgAdmins(before!.organization_id, "Payment refunded", `A payment of ${money(before!.amount_cents, before!.currency)} was refunded by the EVALORA team.`, "/dashboard/billing");
  }
  revalidatePath("/admin/payments");
  redirect(`/admin/payments/${id}?ok=status_${status}`);
}

async function notifyOrgAdmins(orgId: string, title: string, body: string, link: string) {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .in("role", ["owner", "admin"])
    .eq("status", "active");
  if (members?.length) {
    await admin.from("notifications").insert(
      members.map((m) => ({ user_id: m.user_id, type: "payment", title, body, link })),
    );
  }
}

export async function savePaymentConfig(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const lines = (key: string, max: number) =>
    String(formData.get(key) ?? "").split("\n").map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, max);
  const value = {
    methods: lines("methods", 20),
    currencies: lines("currencies", 20).map((c) => c.toUpperCase()),
    categories: lines("categories", 20),
  };
  await admin.from("platform_settings").upsert({ key: "payment_config", value }, { onConflict: "key" });
  await audit(ctx, "settings.payment_config_updated", "platform_settings", "payment_config");
  redirect("/admin/settings?ok=payment_config");
}

/* ── Subscriptions: assignment & lifecycle ──────────────────────────── */

export async function assignSubscription(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = fstr(formData, "organization_id", 60);
  const planId = fstr(formData, "plan_id", 60);
  const kind = String(formData.get("kind") ?? "grant"); // grant | complimentary | trial
  const back = String(formData.get("back") ?? "/admin/subscriptions");
  const sep = back.includes("?") ? "&" : "?";
  if (!orgId || !planId) redirect(`${back}${sep}e=assign`);

  let limitsOverride: Record<string, unknown> | null = null;
  const rawOverride = String(formData.get("limits_override") ?? "").trim();
  if (rawOverride) {
    try {
      const parsed = JSON.parse(rawOverride);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) limitsOverride = parsed;
      else redirect(`${back}${sep}e=json`);
    } catch {
      redirect(`${back}${sep}e=json`);
    }
  }

  await admin.from("subscriptions").update({ status: "cancelled" }).eq("organization_id", orgId!).in("status", ["active", "trialing"]);

  const startStr = fdate(formData, "starts_at");
  const endStr = fdate(formData, "ends_at");
  const start = startStr ? new Date(startStr) : new Date();
  let payload: Record<string, unknown>;
  if (kind === "trial") {
    const days = Math.max(1, fint(formData, "trial_days") ?? 14);
    payload = {
      organization_id: orgId, plan_id: planId, status: "trialing", source: "trial",
      billing_period: "one_time", granted_by: ctx.user.id,
      trial_ends_at: new Date(start.getTime() + days * 86400000).toISOString(),
      current_period_start: start.toISOString(),
    };
  } else {
    const end = endStr ? new Date(endStr) : (() => { const d = new Date(start); d.setMonth(d.getMonth() + Math.max(1, fint(formData, "months") ?? 12)); return d; })();
    payload = {
      organization_id: orgId, plan_id: planId, status: "active",
      source: kind === "complimentary" ? "complimentary" : "admin_grant",
      billing_period: String(formData.get("billing_period") ?? "one_time"),
      granted_by: ctx.user.id,
      current_period_start: start.toISOString(), current_period_end: end.toISOString(),
    };
  }
  payload.limits_override = limitsOverride;
  payload.notes = fstr(formData, "notes", 500) ?? (kind === "grant" ? "Administrative grant — no payment recorded." : null);

  const { data, error } = await admin.from("subscriptions").insert(payload).select("id").single();
  if (error || !data) redirect(`${back}${sep}e=assign_failed`);
  await audit(ctx, "subscription.assigned", "subscriptions", data!.id, orgId, { kind, plan_id: planId });
  await notifyOrgAdmins(orgId!, "Subscription updated", "Your organization's plan was updated by the EVALORA team.", "/dashboard/billing");
  revalidatePath("/admin/subscriptions");
  redirect(`${back}${sep}ok=subscription_assigned`);
}

export async function subscriptionOp(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const op = String(formData.get("op"));
  const back = String(formData.get("back") ?? "/admin/subscriptions");
  const sep = back.includes("?") ? "&" : "?";
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", id).maybeSingle();
  if (!sub) redirect(`${back}${sep}e=sub`);

  if (op === "extend") {
    const days = Math.max(1, fint(formData, "days") ?? 30);
    if (sub!.status === "trialing") {
      const base = sub!.trial_ends_at ? new Date(sub!.trial_ends_at) : new Date();
      await admin.from("subscriptions").update({ trial_ends_at: new Date(base.getTime() + days * 86400000).toISOString() }).eq("id", id);
    } else {
      const base = sub!.current_period_end && new Date(sub!.current_period_end) > new Date() ? new Date(sub!.current_period_end) : new Date();
      await admin.from("subscriptions").update({
        current_period_end: new Date(base.getTime() + days * 86400000).toISOString(),
        status: sub!.status === "expired" || sub!.status === "cancelled" ? "active" : sub!.status,
      }).eq("id", id);
    }
    await audit(ctx, "subscription.extended", "subscriptions", id, sub!.organization_id, { days });
  } else if (op === "set_end") {
    const end = fdate(formData, "ends_at");
    if (!end) redirect(`${back}${sep}e=date`);
    await admin.from("subscriptions").update(
      sub!.status === "trialing" ? { trial_ends_at: end } : { current_period_end: end },
    ).eq("id", id);
    await audit(ctx, "subscription.end_changed", "subscriptions", id, sub!.organization_id, { end });
  } else if (op === "suspend") {
    await admin.from("subscriptions").update({ status: "suspended" }).eq("id", id);
    await audit(ctx, "subscription.suspended", "subscriptions", id, sub!.organization_id);
  } else if (op === "reactivate") {
    await admin.from("subscriptions").update({ status: sub!.trial_ends_at && new Date(sub!.trial_ends_at) > new Date() && !sub!.current_period_end ? "trialing" : "active" }).eq("id", id);
    await audit(ctx, "subscription.reactivated", "subscriptions", id, sub!.organization_id);
  } else if (op === "limits") {
    const raw = String(formData.get("limits_override") ?? "").trim();
    let parsed: Record<string, unknown> | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) redirect(`${back}${sep}e=json`);
      } catch {
        redirect(`${back}${sep}e=json`);
      }
    }
    await admin.from("subscriptions").update({ limits_override: parsed }).eq("id", id);
    await audit(ctx, "subscription.limits_overridden", "subscriptions", id, sub!.organization_id, { override: parsed });
  } else if (op === "notes") {
    await admin.from("subscriptions").update({ notes: fstr(formData, "notes", 500) }).eq("id", id);
    await audit(ctx, "subscription.notes_updated", "subscriptions", id, sub!.organization_id);
  }
  revalidatePath("/admin/subscriptions");
  redirect(`${back}${sep}ok=subscription_${op}`);
}
