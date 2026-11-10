"use server";

import { audit, FLASH_COOKIE, fstr, requireSuperAdmin } from "@/lib/admin";
import { reactivationExpiry, resolveLinkExpiry } from "@/lib/examLink";
import { loadExamLinkPolicy } from "@/lib/examLinkServer";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const LINKS = "/admin/examinations/links";

function backHref(formData: FormData) {
  const value = String(formData.get("back") ?? LINKS);
  return value.startsWith("/admin/examinations") ? value : LINKS;
}

function go(back: string, suffix: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}${suffix}`);
}

/** Precise, human explanation for the one-time banner. */
async function flash(message: string) {
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(message), {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 180,
  });
}

function revalidateAll() {
  revalidatePath(LINKS);
  revalidatePath("/admin/examinations/invitations");
  revalidatePath("/admin/examinations");
}

async function loadExam(admin: ReturnType<typeof createAdminClient>, examId: string) {
  const { data } = await admin
    .from("exams")
    .select("id,organization_id,title,status,starts_at,ends_at,invite_token,access_link,shared_link_enabled,invite_expires_at,invite_activates_at,invite_disabled_at,invite_no_expiry,invite_expiry_policy")
    .eq("id", examId)
    .maybeSingle();
  return data;
}

/**
 * EDIT LINK SETTINGS.
 *
 * Changes only the link's lifecycle: expiration, optional scheduled activation
 * and the no-expiry exemption. It NEVER regenerates the token, creates an
 * examination, deletes an examination or touches an attempt. The link URL and
 * examination code therefore stay exactly as students received them.
 */
export async function updateExamLinkSettingsAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const examId = String(formData.get("exam_id") ?? "");
  const exam = await loadExam(admin, examId);
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
  if (!expiry.ok) {
    await flash(expiry.error ?? "That expiration is not valid.");
    go(back, "e=expiry");
  }

  // Optional scheduled activation: empty means "active immediately".
  const activationRaw = String(formData.get("invite_activates_at") ?? "").trim();
  let activatesAt: string | null = null;
  if (activationRaw) {
    const ms = Date.parse(activationRaw);
    if (!Number.isFinite(ms)) {
      await flash("The activation date and time could not be read.");
      go(back, "e=activation");
    }
    if (expiry.expiresAt && ms >= Date.parse(expiry.expiresAt)) {
      await flash("The activation time must be before the expiration time.");
      go(back, "e=activation");
    }
    activatesAt = new Date(ms).toISOString();
  }

  const { error } = await admin
    .from("exams")
    .update({
      invite_expires_at: expiry.expiresAt,
      invite_no_expiry: expiry.policyKey === "none",
      invite_expiry_policy: expiry.policyKey === "none" ? "no_expiry_exempt" : expiry.policyKey,
      invite_activates_at: activatesAt,
      invite_last_edited_by: ctx.user.id,
      invite_last_edited_at: now.toISOString(),
    })
    .eq("id", exam.id);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.link_expiration_updated", "exams", exam.id, exam.organization_id, {
    previous_expires_at: exam.invite_expires_at,
    invite_expires_at: expiry.expiresAt,
    previous_policy: exam.invite_expiry_policy,
    policy: expiry.policyKey,
    previous_activates_at: exam.invite_activates_at,
    invite_activates_at: activatesAt,
    access_link: exam.access_link ?? null,
  });
  revalidateAll();
  go(back, "ok=link_updated");
}

/**
 * DISABLE A LINK. Stops new starts immediately. Candidates who already started
 * keep their paper, timer, answers and deadline — nothing in the attempt
 * routes reads the link's state.
 */
export async function disableExamLinkAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const examId = String(formData.get("exam_id") ?? "");
  const exam = await loadExam(admin, examId);
  if (!exam) go(back, "e=exam");
  if (exam!.shared_link_enabled === false) go(back, "ok=link_already_disabled");

  const now = new Date().toISOString();
  const { error } = await admin
    .from("exams")
    .update({
      shared_link_enabled: false,
      invite_disabled_at: now,
      invite_last_edited_by: ctx.user.id,
      invite_last_edited_at: now,
    })
    .eq("id", exam!.id);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.link_disabled", "exams", exam!.id, exam!.organization_id, {
    access_link: exam!.access_link ?? null,
    disabled_at: now,
    note: "Attempts already in progress continue; open attempts cannot start.",
  });
  revalidateAll();
  go(back, "ok=link_disabled");
}

/**
 * REACTIVATE A LINK. Requires a genuinely valid future expiration: either the
 * stored one (if it is still in the future) or a new one supplied with the
 * form. A reactivated link is never permanent by accident.
 */
export async function reactivateExamLinkAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const examId = String(formData.get("exam_id") ?? "");
  const exam = await loadExam(admin, examId);
  if (!exam) go(back, "e=exam");

  const policy = await loadExamLinkPolicy(admin);
  const now = new Date();
  const expiry = reactivationExpiry(
    {
      invite_expires_at: exam!.invite_expires_at,
      invite_no_expiry: exam!.invite_no_expiry,
      invite_expiry_policy: exam!.invite_expiry_policy,
    },
    {
      mode: String(formData.get("expiry_mode") ?? ""),
      preset: String(formData.get("expiry_preset") ?? ""),
      custom: String(formData.get("expiry_custom") ?? ""),
    },
    { now, policy },
  );
  if (!expiry.ok) {
    await flash(expiry.error ?? "Set a valid expiration before reactivating the link.");
    go(back, "e=reactivate_expiry");
  }

  const { error } = await admin
    .from("exams")
    .update({
      shared_link_enabled: true,
      invite_disabled_at: null,
      invite_expires_at: expiry.expiresAt,
      invite_no_expiry: expiry.policyKey === "none",
      invite_expiry_policy: expiry.policyKey === "none" ? "no_expiry_exempt" : expiry.policyKey,
      invite_last_edited_by: ctx.user.id,
      invite_last_edited_at: now.toISOString(),
    })
    .eq("id", exam!.id);
  if (error) go(back, "e=failed");

  await audit(ctx, "exam.link_reactivated", "exams", exam!.id, exam!.organization_id, {
    invite_expires_at: expiry.expiresAt,
    policy: expiry.policyKey,
    access_link: exam!.access_link ?? null,
  });
  revalidateAll();
  go(back, "ok=link_reactivated");
}

/**
 * Update the platform-level link policy. Only explicit platform policy can
 * permit permanent links; this action is Super Admin-only and audited.
 */
export async function updateExamLinkPolicyAsAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const back = backHref(formData);
  const allowNoExpiry = String(formData.get("allow_no_expiry") ?? "") === "1";
  const defaultDaysRaw = fstr(formData, "default_days", 4);
  const defaultDays = Math.max(1, Math.min(365, Number(defaultDaysRaw ?? 30) || 30));

  const { data: existing } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "exam_link_policy")
    .maybeSingle();
  const previous = (existing?.value as Record<string, unknown> | null) ?? {};

  const { error } = await admin
    .from("platform_settings")
    .upsert({
      key: "exam_link_policy",
      value: {
        ...previous,
        allow_no_expiry: allowNoExpiry,
        default_days: defaultDays,
        link_requires_expiry: !allowNoExpiry,
      },
      updated_at: new Date().toISOString(),
    });
  if (error) go(back, "e=failed");

  await audit(ctx, "platform.exam_link_policy_updated", "platform_settings", "exam_link_policy", null, {
    previous,
    allow_no_expiry: allowNoExpiry,
    default_days: defaultDays,
  });
  revalidateAll();
  go(back, "ok=policy_updated");
}
