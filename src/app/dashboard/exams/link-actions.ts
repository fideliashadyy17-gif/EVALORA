"use server";

/**
 * Organization Exam Link & Expiration lifecycle server actions (`exam_links`).
 *
 * Strictly org-scoped (`organization_id = org.id`), RBAC-gated (`exams.edit`),
 * entitlement-gated (`exam_links`), and audited. Changes ONLY link activation,
 * expiration, and active/disabled state — never breaks attempts already in progress.
 */
import { audit } from "@/lib/admin";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { reactivationExpiry, resolveLinkExpiry } from "@/lib/examLink";
import { loadExamLinkPolicy } from "@/lib/examLinkServer";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeBack(formData: FormData): string {
  const raw = String(formData.get("back") ?? "/dashboard/exams/links");
  return raw.startsWith("/dashboard/exams") ? raw : "/dashboard/exams/links";
}

function go(back: string, query: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}${query}`);
}

async function authorizeLinkWrite(back: string) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  const supabase = await createClient();
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "examinations", "/dashboard?e=module");
  requireModule(entitlement, "exam_links", "/dashboard/exams?e=module");
  if (!(await canOperate(ctx, org.id, "exams.edit", "exam_links"))) {
    go(back, "e=forbidden");
  }
  return { ctx, org };
}

export async function updateOrgExamLinkSettings(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await authorizeLinkWrite(back);
  const examId = String(formData.get("exam_id") ?? "");
  if (!UUID.test(examId)) go(back, "e=exam");

  const admin = createAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id,organization_id,title,invite_expires_at,invite_activates_at,invite_no_expiry,invite_expiry_policy")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) go(back, "e=exam");

  const policy = await loadExamLinkPolicy(admin);
  const now = new Date();
  const expiry = resolveLinkExpiry(
    {
      mode: String(formData.get("expiry_mode") ?? "preset"),
      preset: String(formData.get("expiry_preset") ?? ""),
      custom: String(formData.get("expiry_custom") ?? ""),
    },
    { now, policy },
  );
  if (!expiry.ok) go(back, "e=expiry");

  const activationRaw = String(formData.get("invite_activates_at") ?? "").trim();
  let activatesAt: string | null = null;
  if (activationRaw) {
    const ms = Date.parse(activationRaw);
    if (!Number.isFinite(ms)) go(back, "e=activation");
    if (expiry.expiresAt && ms >= Date.parse(expiry.expiresAt)) go(back, "e=activation");
    activatesAt = new Date(ms).toISOString();
  }

  const isNoExpiry = expiry.policyKey === "none" || expiry.policyKey === "no_expiry_exempt";
  const { error } = await admin
    .from("exams")
    .update({
      invite_expires_at: expiry.expiresAt,
      invite_no_expiry: isNoExpiry,
      invite_expiry_policy: expiry.policyKey,
      invite_activates_at: activatesAt,
      invite_disabled_at: null,
      shared_link_enabled: true,
      invite_last_edited_by: ctx.user.id,
      invite_last_edited_at: now.toISOString(),
    })
    .eq("id", examId)
    .eq("organization_id", org.id);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.link_settings_updated", "exams", examId, org.id, {
    exam_title: exam.title,
    invite_expires_at: expiry.expiresAt,
    invite_no_expiry: isNoExpiry,
    invite_activates_at: activatesAt,
    source: "organization_workspace",
  });

  revalidatePath("/dashboard/exams/links");
  revalidatePath(`/dashboard/exams/${examId}`);
  go(back, "ok=link_updated");
}

export async function disableOrgExamLink(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await authorizeLinkWrite(back);
  const examId = String(formData.get("exam_id") ?? "");
  if (!UUID.test(examId)) go(back, "e=exam");

  const admin = createAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id, organization_id, title, invite_disabled_at")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) go(back, "e=exam");
  if (exam.invite_disabled_at) go(back, "ok=link_already_disabled");

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("exams")
    .update({
      shared_link_enabled: false,
      invite_disabled_at: nowIso,
      invite_last_edited_by: ctx.user.id,
      invite_last_edited_at: nowIso,
    })
    .eq("id", examId)
    .eq("organization_id", org.id);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.link_disabled", "exams", examId, org.id, {
    exam_title: exam.title,
    source: "organization_workspace",
  });

  revalidatePath("/dashboard/exams/links");
  revalidatePath(`/dashboard/exams/${examId}`);
  go(back, "ok=link_disabled");
}

export async function reactivateOrgExamLink(formData: FormData) {
  const back = safeBack(formData);
  const { ctx, org } = await authorizeLinkWrite(back);
  const examId = String(formData.get("exam_id") ?? "");
  if (!UUID.test(examId)) go(back, "e=exam");

  const admin = createAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id, organization_id, title, invite_expires_at, invite_no_expiry, invite_expiry_policy")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) go(back, "e=exam");

  const policy = await loadExamLinkPolicy(admin);
  const now = new Date();
  const nextExpiry = reactivationExpiry(
    exam,
    {
      mode: String(formData.get("expiry_mode") ?? "preset"),
      preset: String(formData.get("expiry_preset") ?? "24h"),
      custom: String(formData.get("expiry_custom") ?? ""),
    },
    { now, policy },
  );
  if (!nextExpiry.ok) go(back, "e=reactivate_expiry");

  const nextNoExpiry = nextExpiry.policyKey === "none" || nextExpiry.policyKey === "no_expiry_exempt";
  const nowIso = now.toISOString();
  const { error } = await admin
    .from("exams")
    .update({
      shared_link_enabled: true,
      invite_disabled_at: null,
      invite_expires_at: nextExpiry.expiresAt,
      invite_no_expiry: nextNoExpiry,
      invite_expiry_policy: nextExpiry.policyKey,
      invite_last_edited_by: ctx.user.id,
      invite_last_edited_at: nowIso,
    })
    .eq("id", examId)
    .eq("organization_id", org.id);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.link_reactivated", "exams", examId, org.id, {
    exam_title: exam.title,
    invite_expires_at: nextExpiry.expiresAt,
    source: "organization_workspace",
  });

  revalidatePath("/dashboard/exams/links");
  revalidatePath(`/dashboard/exams/${examId}`);
  go(back, "ok=link_reactivated");
}
