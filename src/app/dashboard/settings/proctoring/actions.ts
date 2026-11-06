"use server";

import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { parseRetentionDays, runRetention, saveRetentionPolicy } from "@/lib/proctoring";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const BASE = "/dashboard/settings/proctoring";

async function guard() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin"))
    redirect("/dashboard");
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/proctoring");
  return { ctx, org };
}

/**
 * Retention is configured by the organization that owns the evidence. Periods
 * are optional: leaving a field empty means "retain indefinitely", which is the
 * default and is never silently replaced by a guessed legal duration.
 */
export async function saveProctoringRetention(formData: FormData) {
  const { ctx, org } = await guard();

  const evidence = parseRetentionDays(formData.get("evidence_retention_days"));
  const observation = parseRetentionDays(formData.get("observation_retention_days"));
  const reviewNote = parseRetentionDays(formData.get("review_note_retention_days"));
  if (evidence === "invalid" || observation === "invalid" || reviewNote === "invalid")
    redirect(`${BASE}?e=days`);

  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  const supabase = await createClient();
  const error = await saveRetentionPolicy(
    supabase,
    org.id,
    {
      evidence_retention_days: evidence,
      observation_retention_days: observation,
      review_note_retention_days: reviewNote,
      legal_hold: formData.get("legal_hold") === "on",
      allow_evidence_export: formData.get("allow_evidence_export") === "on",
      note,
    },
    ctx.user.id,
  );
  if (error) redirect(`${BASE}?e=save`);

  await supabase.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: org.id,
    action: "proctoring.retention_policy_updated",
    entity: "proctoring_retention_policies",
    entity_id: org.id,
    metadata: {
      evidence_retention_days: evidence,
      observation_retention_days: observation,
      review_note_retention_days: reviewNote,
      legal_hold: formData.get("legal_hold") === "on",
    },
  });

  revalidatePath(BASE);
  revalidatePath("/dashboard/proctoring");
  redirect(`${BASE}?ok=saved`);
}

/**
 * Apply (or dry-run) the configured policy. Runs with the service role because
 * the retention routine is deliberately not executable by end users; the guard
 * above has already proven the actor may manage this organization.
 */
export async function applyProctoringRetention(formData: FormData) {
  const { org } = await guard();
  const dryRun = String(formData.get("mode") ?? "dry_run") !== "apply";
  const admin = createAdminClient();
  const result = await runRetention(admin, org.id, dryRun);
  if (!result.ok) redirect(`${BASE}?e=run`);

  const r = result.result ?? {};
  if (r.reason === "no_policy_configured") redirect(`${BASE}?e=nopolicy`);
  if (r.reason === "legal_hold") redirect(`${BASE}?ok=held`);

  revalidatePath(BASE);
  revalidatePath("/dashboard/proctoring");
  const counts = `${r.observations_anonymized ?? 0}-${r.review_notes_redacted ?? 0}-${r.room_events_purged ?? 0}-${r.recordings_expired ?? 0}`;
  redirect(`${BASE}?${dryRun ? "dry" : "ok"}=${counts}`);
}
