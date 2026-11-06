"use server";

import { requireSuperAdmin } from "@/lib/auth";
import { isUuid, parseRetentionDays, runRetention, saveRetentionPolicy } from "@/lib/proctoring";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const BASE = "/admin/proctoring/retention";

/**
 * Platform-owner retention administration. The target organization comes from
 * the submitted form, is validated to exist, and the actor is re-verified as the
 * Super Admin server-side on every call.
 */
export async function adminSaveRetention(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const orgId = String(formData.get("organization_id") ?? "");
  if (!isUuid(orgId)) redirect(BASE);

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (!org) redirect(BASE);

  const evidence = parseRetentionDays(formData.get("evidence_retention_days"));
  const observation = parseRetentionDays(formData.get("observation_retention_days"));
  const reviewNote = parseRetentionDays(formData.get("review_note_retention_days"));
  if (evidence === "invalid" || observation === "invalid" || reviewNote === "invalid")
    redirect(`${BASE}?org=${orgId}&e=days`);

  const error = await saveRetentionPolicy(
    admin,
    orgId,
    {
      evidence_retention_days: evidence,
      observation_retention_days: observation,
      review_note_retention_days: reviewNote,
      legal_hold: formData.get("legal_hold") === "on",
      allow_evidence_export: formData.get("allow_evidence_export") === "on",
      note: String(formData.get("note") ?? "").trim().slice(0, 1000) || null,
    },
    ctx.user.id,
  );
  if (error) redirect(`${BASE}?org=${orgId}&e=save`);

  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: orgId,
    action: "proctoring.retention_policy_updated_by_platform",
    entity: "proctoring_retention_policies",
    entity_id: orgId,
    metadata: {
      evidence_retention_days: evidence,
      observation_retention_days: observation,
      review_note_retention_days: reviewNote,
      legal_hold: formData.get("legal_hold") === "on",
    },
  });

  revalidatePath(BASE);
  redirect(`${BASE}?org=${orgId}&saved=1`);
}

export async function adminRunRetention(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const orgId = String(formData.get("organization_id") ?? "");
  if (!isUuid(orgId)) redirect(BASE);
  const dryRun = String(formData.get("mode") ?? "dry_run") !== "apply";

  const admin = createAdminClient();
  const result = await runRetention(admin, orgId, dryRun);
  if (!result.ok) redirect(`${BASE}?org=${orgId}&e=run`);

  const r = result.result ?? {};
  if (r.reason === "no_policy_configured") redirect(`${BASE}?org=${orgId}&e=nopolicy`);
  if (r.reason === "legal_hold") redirect(`${BASE}?org=${orgId}&held=1`);

  if (!dryRun) {
    await admin.from("audit_logs").insert({
      actor_id: ctx.user.id,
      organization_id: orgId,
      action: "proctoring.retention_applied_by_platform",
      entity: "proctoring_retention_policies",
      entity_id: orgId,
      metadata: {
        observations_anonymized: r.observations_anonymized ?? 0,
        review_notes_redacted: r.review_notes_redacted ?? 0,
        room_events_purged: r.room_events_purged ?? 0,
        recordings_expired: r.recordings_expired ?? 0,
      },
    });
  }

  revalidatePath(BASE);
  const counts = `${r.observations_anonymized ?? 0}-${r.review_notes_redacted ?? 0}-${r.room_events_purged ?? 0}-${r.recordings_expired ?? 0}`;
  redirect(`${BASE}?org=${orgId}&${dryRun ? "dry" : "applied"}=${counts}`);
}
