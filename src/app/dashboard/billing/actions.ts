"use server";

import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Manual payment submission. NOTHING activates here — the request is
 * stored as "pending" until a Super Admin verifies and approves it.
 */
export async function submitPayment(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/billing");

  const planId = String(formData.get("plan_id") ?? "");
  const period = String(formData.get("billing_period") ?? "monthly") === "yearly" ? "yearly" : "monthly";
  const ref = String(formData.get("transaction_ref") ?? "").trim().slice(0, 120);
  const method = String(formData.get("method") ?? "").trim().slice(0, 80) || null;
  if (!planId || !ref) redirect("/dashboard/billing?e=fields");

  const supabase = await createClient();
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).eq("is_active", true).single();
  if (!plan) redirect("/dashboard/billing?e=plan");

  // Optional proof upload to the private bucket, namespaced by user id.
  let proofPath: string | null = null;
  const proof = formData.get("proof");
  if (proof instanceof File && proof.size > 0) {
    if (proof.size > 5 * 1024 * 1024) redirect("/dashboard/billing?e=proof-size");
    if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(proof.type))
      redirect("/dashboard/billing?e=proof-type");
    const ext = proof.name.split(".").pop()?.toLowerCase() ?? "bin";
    proofPath = `${ctx.user.id}/${Date.now()}-proof.${ext}`;
    const { error } = await supabase.storage
      .from("payment-proofs")
      .upload(proofPath, proof, { contentType: proof.type });
    if (error) proofPath = null;
  }

  const amount = period === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;
  const { error } = await supabase.from("payment_requests").insert({
    organization_id: org.id,
    plan_id: plan.id,
    billing_period: period,
    amount_cents: amount,
    currency: plan.currency,
    method,
    transaction_ref: ref,
    proof_url: proofPath,
    submitted_by: ctx.user.id,
    status: "pending",
  });
  if (error) redirect("/dashboard/billing?e=submit");

  // Notify all super admins.
  const admin = createAdminClient();
  const { data: admins } = await admin.from("profiles").select("id").eq("platform_role", "super_admin");
  if (admins?.length) {
    await admin.from("notifications").insert(
      admins.map((a) => ({
        user_id: a.id,
        type: "payment",
        title: "New payment to review",
        body: `${org.name} submitted a ${plan.name} (${period}) payment: ${ref}`,
        link: "/admin/payments",
      })),
    );
  }
  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: org.id,
    action: "payment.submitted",
    entity: "payment_requests",
    metadata: { plan: plan.slug, period, ref },
  });

  revalidatePath("/dashboard/billing");
  redirect("/dashboard/billing?submitted=1");
}
