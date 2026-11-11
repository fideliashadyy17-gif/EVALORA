"use server";

import { activeOrg, can, CREATOR_ROLES, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { COMPETITION_FORMATS, COMPETITION_STATUSES } from "@/lib/brand";
import { audit } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const FORMATS = COMPETITION_FORMATS.map((f) => f.value) as readonly string[];
const STATUSES = COMPETITION_STATUSES as readonly string[];

const text = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max) || null;

async function accessCode(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

/**
 * Create a competition inside the active organization.
 *
 * Organization-scoped: the row is always written with the caller's verified
 * organization id (never a value from the form), the optional quiz must belong
 * to the same organization, and the action requires a creator role in that
 * organization. The platform-wide admin version of this action stays separate.
 */
export async function createOrgCompetition(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/competitions?e=forbidden");

  const admin = createAdminClient();
  const title = text(formData, "title", 160);
  if (!title) redirect("/dashboard/competitions?e=title");

  const formatRaw = String(formData.get("format") ?? "live_synchronous");
  const format = FORMATS.includes(formatRaw) ? formatRaw : "live_synchronous";
  const quizId = text(formData, "quiz_id", 60);
  if (quizId) {
    const { data: quiz } = await admin.from("quizzes").select("id, organization_id").eq("id", quizId).maybeSingle();
    if (!quiz || quiz.organization_id !== org.id) redirect("/dashboard/competitions?e=quiz");
  }

  const statusRaw = String(formData.get("status") ?? "draft");
  const status = STATUSES.includes(statusRaw) && statusRaw !== "live" ? statusRaw : "draft";
  const maxParticipants = parseInt(String(formData.get("max_participants") ?? ""), 10);

  const { data, error } = await admin
    .from("competitions")
    .insert({
      organization_id: org.id,
      quiz_id: quizId,
      title,
      description: text(formData, "description", 1000),
      format,
      status,
      created_by: ctx.user.id,
      scoring: { points_per_correct: 100, show_leaderboard: true },
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) redirect("/dashboard/competitions?e=failed");

  // Every competition starts with one shareable admission code.
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error: codeError } = await admin
      .from("competition_access_codes")
      .insert({ competition_id: data!.id, code: await accessCode(), label: "General admission", created_by: ctx.user.id });
    if (!codeError) break;
  }

  await audit(ctx, "competition.created", "competitions", data!.id, org.id, { title, format, source: "organization_dashboard" });
  revalidatePath("/dashboard/competitions");
  redirect("/dashboard/competitions?ok=created");
}

/** Publish / schedule / close / archive a competition in this organization. */
export async function setOrgCompetitionStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/competitions?e=forbidden");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  // Live/paused transitions belong to the host console, not this list action.
  const allowed = ["draft", "published", "scheduled", "ended", "cancelled", "archived"] as const;
  if (!id || !allowed.includes(status as (typeof allowed)[number])) {
    redirect("/dashboard/competitions?e=status");
  }

  const admin = createAdminClient();
  const { data: comp } = await admin
    .from("competitions")
    .select("id, organization_id, status, session_id")
    .eq("id", id)
    .maybeSingle();
  if (!comp || comp.organization_id !== org.id) redirect("/dashboard/competitions?e=missing");

  // Closing a competition also closes its live session, exactly like the
  // platform console does — but never touches an unrelated session.
  if (comp.session_id && ["ended", "cancelled", "archived"].includes(status)) {
    await admin
      .from("quiz_sessions")
      .update({
        status: "ended",
        phase: "completed",
        phase_started_at: new Date().toISOString(),
        question_deadline_at: null,
        ended_at: new Date().toISOString(),
      })
      .eq("id", comp.session_id)
      .neq("status", "ended");
  }
  await admin.from("competitions").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", org.id);
  await audit(ctx, `competition.status_${status}`, "competitions", id, org.id, { source: "organization_dashboard" });
  revalidatePath("/dashboard/competitions");
  redirect(`/dashboard/competitions?ok=${status}`);
}

/** Remove a draft competition that was created by mistake. */
export async function deleteDraftCompetition(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/competitions?e=forbidden");

  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { data: comp } = await admin
    .from("competitions")
    .select("id, organization_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!comp || comp.organization_id !== org.id) redirect("/dashboard/competitions?e=missing");
  if (comp.status !== "draft") redirect("/dashboard/competitions?e=not_draft");

  await admin.from("competition_access_codes").delete().eq("competition_id", id);
  await admin.from("competitions").delete().eq("id", id).eq("organization_id", org.id);
  await audit(ctx, "competition.deleted", "competitions", id, org.id, { source: "organization_dashboard" });
  revalidatePath("/dashboard/competitions");
  redirect("/dashboard/competitions?ok=deleted");
}
