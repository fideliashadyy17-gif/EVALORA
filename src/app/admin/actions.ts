"use server";

import { requireSuperAdmin } from "@/lib/auth";
import { FEATURE_DEFAULTS, type FeatureKey } from "@/lib/platform";
import { questionPublishError } from "@/lib/questionValidation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) === "suspended" ? "suspended" : "active";
  const { data: target } = await admin
    .from("profiles")
    .select("id, platform_role, is_primary")
    .eq("id", id)
    .maybeSingle();
  if (!target) redirect("/admin/users");
  // The Primary Super Admin can never be suspended through the console,
  // nobody can suspend themselves, and only the Primary may act on
  // another Super Admin. (A database trigger independently protects
  // platform_role / is_primary against every non-operator caller.)
  if (target.is_primary) redirect("/admin/users?e=primary");
  if (id === ctx.user.id) redirect("/admin/users?e=self");
  if (target.platform_role === "super_admin" && !ctx.profile.is_primary) redirect("/admin/users?e=admin");
  await admin.from("profiles").update({ status }).eq("id", id);
  await audit(`user.${status}`, "profiles", id);
  revalidatePath("/admin/users");
}

export async function setOrgStatus(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const rawStatus = String(formData.get("status"));
  const status = rawStatus === "suspended" ? "suspended" : rawStatus === "archived" ? "archived" : "active";
  await admin.from("organizations").update({ status }).eq("id", id);
  await audit(`organization.${status}`, "organizations", id, id);
  revalidatePath("/admin/organizations");
}

export async function grantSubscription(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const planId = String(formData.get("plan_id"));
  const months = Math.max(1, parseInt(String(formData.get("months") ?? "12")) || 12);
  await admin.from("subscriptions").update({ status: "cancelled" }).eq("organization_id", orgId).in("status", ["active", "trialing"]);
  const end = new Date();
  end.setMonth(end.getMonth() + months);
  await admin.from("subscriptions").insert({
    organization_id: orgId, plan_id: planId, status: "active", billing_period: "one_time",
    source: "admin_grant", granted_by: ctx.user.id,
    notes: "Administrative grant — no payment recorded.",
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

/* ─── Competitions / live sessions ─────────────────────────────────── */
export async function adminEndSession(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") redirect("/admin/competitions?e=confirm");
  const { data: s } = await admin.from("quiz_sessions").select("id, organization_id, status, join_code").eq("id", id).maybeSingle();
  if (s && s.status !== "ended") {
    await admin.from("quiz_sessions").update({ status: "ended", phase: "completed", phase_started_at: new Date().toISOString(), question_deadline_at: null, ended_at: new Date().toISOString() }).eq("id", id);
    await audit("session.ended_by_admin", "quiz_sessions", id, s.organization_id, { join_code: s.join_code, was: s.status });
  }
  revalidatePath("/admin/competitions");
  redirect("/admin/competitions?saved=1");
}

/* ─── Quizzes & questions (platform-wide) ──────────────────────────── */
export async function adminSetQuizStatus(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["draft", "published", "archived"].includes(status)) redirect("/admin/quizzes");
  const { data: q } = await admin.from("quizzes").select("id, organization_id").eq("id", id).maybeSingle();
  await admin.from("quizzes").update({ status }).eq("id", id);
  await audit(`quiz.status_${status}`, "quizzes", id, q?.organization_id ?? null);
  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes?saved=1");
}

export async function adminDeleteQuiz(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") redirect("/admin/quizzes?e=confirm");
  const { data: q } = await admin.from("quizzes").select("id, organization_id, title").eq("id", id).maybeSingle();
  await admin.from("quizzes").delete().eq("id", id);
  await audit("quiz.deleted_by_admin", "quizzes", id, q?.organization_id ?? null, { title: q?.title ?? null });
  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes?saved=1");
}

export async function adminSetQuestionStatus(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["draft", "pending_review", "published", "archived"].includes(status)) redirect("/admin/questions");
  const { data: q } = await admin
    .from("questions")
    .select("*, question_options(label, is_correct)")
    .eq("id", id)
    .maybeSingle();
  if (status === "published") {
    if (!q) redirect("/admin/questions?e=not_found");
    const publishError = questionPublishError({
      ...q!,
      options: (q!.question_options as { label: string; is_correct: boolean }[]) ?? [],
    });
    if (publishError) redirect("/admin/questions?e=not_ready");
  }
  await admin.from("questions").update({ status }).eq("id", id);
  await audit(`question.status_${status}`, "questions", id, q?.organization_id ?? null);
  revalidatePath("/admin/questions");
  redirect("/admin/questions?saved=1");
}

export async function adminDeleteQuestion(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") redirect("/admin/questions?e=confirm");
  const { data: q } = await admin.from("questions").select("id, organization_id").eq("id", id).maybeSingle();
  await admin.from("questions").delete().eq("id", id);
  await audit("question.deleted_by_admin", "questions", id, q?.organization_id ?? null);
  revalidatePath("/admin/questions");
  redirect("/admin/questions?saved=1");
}

/* ─── Examinations & proctoring ────────────────────────────────────── */
export async function adminSetExamStatus(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["draft", "scheduled", "open", "closed"].includes(status)) redirect("/admin/examinations");
  const { data: e } = await admin.from("exams").select("id, organization_id").eq("id", id).maybeSingle();
  await admin.from("exams").update({ status }).eq("id", id);
  await audit(`exam.status_${status}`, "exams", id, e?.organization_id ?? null);
  revalidatePath("/admin/examinations");
  redirect("/admin/examinations?saved=1");
}

export async function adminReviewIncident(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["open", "valid", "invalid", "investigating"].includes(status)) redirect("/admin/proctoring");
  const reviewNote = String(formData.get("review_note") ?? "").trim().slice(0, 2000) || null;
  await admin.from("proctoring_incidents").update({ status, reviewed_by: ctx.user.id, review_note: reviewNote }).eq("id", id);
  await audit(`incident.${status}`, "proctoring_incidents", id);
  revalidatePath("/admin/proctoring");
  redirect("/admin/proctoring?saved=1");
}

/* ─── Subscriptions ────────────────────────────────────────────────── */
export async function adminCancelSubscription(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") redirect("/admin/subscriptions?e=confirm");
  const { data: s } = await admin.from("subscriptions").select("id, organization_id").eq("id", id).maybeSingle();
  await admin.from("subscriptions").update({ status: "cancelled" }).eq("id", id);
  await audit("subscription.cancelled_by_admin", "subscriptions", id, s?.organization_id ?? null);
  revalidatePath("/admin/subscriptions");
  redirect("/admin/subscriptions?saved=1");
}

export async function adminReactivateSubscription(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const { data: s } = await admin.from("subscriptions").select("*").eq("id", id).maybeSingle();
  if (!s) redirect("/admin/subscriptions");
  const end = s.current_period_end && new Date(s.current_period_end) > new Date()
    ? new Date(s.current_period_end)
    : new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await admin.from("subscriptions").update({ status: "active", current_period_end: end.toISOString() }).eq("id", id);
  await audit("subscription.reactivated_by_admin", "subscriptions", id, s.organization_id);
  revalidatePath("/admin/subscriptions");
  redirect("/admin/subscriptions?saved=1");
}

/* ─── Notifications: platform broadcast ────────────────────────────── */
export async function broadcastNotification(formData: FormData) {
  await requireSuperAdmin();
  const title = String(formData.get("title") ?? "").trim().slice(0, 140);
  const body = String(formData.get("body") ?? "").trim().slice(0, 1000) || null;
  const link = String(formData.get("link") ?? "").trim().slice(0, 300) || null;
  if (!title) redirect("/admin/notifications?e=title");
  // Session client on purpose: the RPC itself re-verifies is_super_admin()
  // against the caller's JWT (database-level authorization).
  const supabase = await createClient();
  const { data: sent, error } = await supabase.rpc("admin_broadcast_notification", {
    p_title: title, p_body: body, p_link: link,
  });
  if (error) redirect("/admin/notifications?e=send");
  await audit("notification.broadcast", "notifications", "broadcast", null, { title, recipients: sent ?? 0 });
  revalidatePath("/admin/notifications");
  redirect(`/admin/notifications?sent=${sent ?? 0}`);
}

/* ─── Modules & Features ───────────────────────────────────────────── */
export async function saveFeatures(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const value = Object.fromEntries(
    (Object.keys(FEATURE_DEFAULTS) as FeatureKey[]).map((k) => [k, formData.get(k) === "on"]),
  );
  await admin.from("platform_settings").upsert(
    { key: "features", value, updated_at: new Date().toISOString() }, { onConflict: "key" },
  );
  await audit("features.updated", "platform_settings", "features", null, value as Record<string, unknown>);
  revalidatePath("/admin/modules");
  redirect("/admin/modules?saved=1");
}

/* ─── Targeted notifications (organization admins / one user) ─────── */
export async function sendTargetedNotification(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const body = String(formData.get("body") ?? "").trim().slice(0, 1000) || null;
  const link = String(formData.get("link") ?? "/dashboard").trim() || "/dashboard";
  const audience = String(formData.get("audience") ?? "org");
  if (!title) redirect("/admin/notifications?e=title");

  let userIds: string[] = [];
  let orgId: string | null = null;
  if (audience === "org") {
    orgId = String(formData.get("organization_id") ?? "");
    const { data: members } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("status", "active");
    userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  } else {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!prof) redirect("/admin/notifications?e=user");
    userIds = [prof!.id];
  }
  if (userIds.length === 0) redirect("/admin/notifications?e=empty");

  await admin.from("notifications").insert(
    userIds.map((user_id) => ({ user_id, type: "system", title, body, link })),
  );
  await audit("notification.targeted_sent", "notifications", orgId ?? userIds[0], orgId, {
    recipients: userIds.length, title, audience,
  });
  void ctx;
  redirect(`/admin/notifications?sent=${userIds.length}`);
}
