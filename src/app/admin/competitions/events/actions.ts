"use server";

import { audit, fint, fstr, requireSuperAdmin } from "@/lib/admin";
import { approveQualification, computeQualifications, overrideQualification } from "../../actions/event-operations";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const dest = (eventId: string, extra: string) => `/admin/competitions/events/${eventId}?${extra}`;

/** Create a multi-phase competition event shell with its three phases. */
export async function createCompetitionEvent(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = fstr(formData, "organization_id", 60);
  const name = fstr(formData, "name", 200);
  const yearId = fstr(formData, "academic_year_id", 60);
  if (!orgId || !name) redirect("/admin/competitions/events?e=name");
  if (yearId) {
    const { data: year, error: yearError } = await admin.from("academic_years").select("id")
      .eq("id", yearId).eq("organization_id", orgId).maybeSingle();
    if (yearError || !year) redirect("/admin/competitions/events?e=scope");
  }

  const { data: existing } = await admin
    .from("competition_events")
    .select("id")
    .eq("organization_id", orgId!)
    .eq("name", name!)
    .maybeSingle();
  if (existing) redirect(dest(existing.id, "ok=exists"));

  const { data: ev, error } = await admin
    .from("competition_events")
    .insert({
      organization_id: orgId,
      academic_year_id: yearId,
      name,
      description: fstr(formData, "description", 1000),
      status: "draft",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !ev) redirect("/admin/competitions/events?e=failed");

  const { error: phaseError } = await admin.from("competition_event_phases").insert([
    { event_id: ev!.id, phase_key: "elimination", phase_type: "examination", title: `${name} — Elimination Round`, max_questions: 20, sort: 1, qualification_rule: { top_n: 10, min_percent: 50 } },
    { event_id: ev!.id, phase_key: "semi_final", phase_type: "live_competition", title: `${name} — Semi-Final`, max_questions: 25, sort: 2, qualification_rule: { top_n: 10, min_percent: 50 } },
    { event_id: ev!.id, phase_key: "grand_final", phase_type: "live_competition", title: `${name} — Grand Final`, max_questions: 30, sort: 3, qualification_rule: { top_n: 5, min_percent: 50 } },
  ]);
  if (phaseError) redirect(dest(ev!.id, "e=phases_partial"));
  await audit(ctx, "competition_event.created", "competition_events", ev!.id, orgId, { name });
  revalidatePath("/admin/competitions/events");
  redirect(dest(ev!.id, "ok=created"));
}

export async function setEventPhaseStatus(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const eventId = fstr(formData, "event_id", 60)!;
  const phaseId = fstr(formData, "phase_id", 60);
  const status = String(formData.get("status") ?? "draft");
  if (!["draft", "scheduled", "open", "completed", "archived"].includes(status)) redirect(dest(eventId, "e=status"));
  if (phaseId) {
    const { data: phase, error: phaseError } = await admin.from("competition_event_phases").select("id, sort").eq("id", phaseId).eq("event_id", eventId).maybeSingle();
    if (phaseError || !phase) redirect(dest(eventId, "e=phase"));
    if (status === "open" && phase!.sort > 1) {
      const { data: previous, error: previousError } = await admin.from("competition_event_phases").select("id, status").eq("event_id", eventId).lt("sort", phase!.sort).order("sort", { ascending: false }).limit(1).maybeSingle();
      if (previousError || !previous || previous.status !== "completed") redirect(dest(eventId, "e=previous"));
      const { data: classes, error: classError } = await admin.from("competition_phase_classes").select("class_id").eq("phase_id", phaseId);
      if (classError || !classes?.length) redirect(dest(eventId, "e=qualification_gate"));
      for (const cls of classes!) {
        const [approved, pending] = await Promise.all([
          admin.from("qualification_records").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("from_phase_id", previous!.id).eq("to_phase_id", phaseId).eq("class_id", cls.class_id).in("status", ["approved", "manual_approved"]).eq("approval_status", "approved"),
          admin.from("qualification_records").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("from_phase_id", previous!.id).eq("to_phase_id", phaseId).eq("class_id", cls.class_id).eq("status", "eligible"),
        ]);
        if (approved.error || pending.error || !approved.count || pending.count) redirect(dest(eventId, "e=qualification_gate"));
      }
    }
    const { error } = await admin.from("competition_event_phases").update({ status }).eq("id", phaseId).eq("event_id", eventId);
    if (error) redirect(dest(eventId, "e=status_failed"));
    const { error: classUpdateError } = await admin.from("competition_phase_classes").update({ status }).eq("phase_id", phaseId);
    if (classUpdateError) redirect(dest(eventId, "e=status_partial"));
    await audit(ctx, "competition_event.phase_status", "competition_event_phases", phaseId, null, { status });
  } else {
    const { error } = await admin.from("competition_events").update({ status, updated_at: new Date().toISOString() }).eq("id", eventId);
    if (error) redirect(dest(eventId, "e=status_failed"));
    await audit(ctx, "competition_event.status", "competition_events", eventId, null, { status });
  }
  revalidatePath(`/admin/competitions/events/${eventId}`);
  redirect(dest(eventId, "ok=status"));
}

export async function updateQualificationRule(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const eventId = fstr(formData, "event_id", 60)!;
  const phaseId = fstr(formData, "phase_id", 60)!;
  const rule = {
    top_n: Math.max(1, Math.min(500, fint(formData, "top_n") ?? 10)),
    min_percent: Math.max(0, Math.min(100, fint(formData, "min_percent") ?? 50)),
  };
  const { data: updated, error } = await admin.from("competition_event_phases").update({ qualification_rule: rule }).eq("id", phaseId).eq("event_id", eventId).select("id").maybeSingle();
  if (error || !updated) redirect(dest(eventId, "e=rule_failed"));
  await audit(ctx, "competition_event.qualification_rule", "competition_event_phases", phaseId, null, rule);
  revalidatePath(`/admin/competitions/events/${eventId}`);
  redirect(dest(eventId, "ok=rule"));
}

/**
 * Compute class-by-class eligibility from a completed source phase and
 * write traceable qualification records for organizer approval.
 */
export async function computeEligibility(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const eventId = fstr(formData, "event_id", 60)!;
  const fromId = fstr(formData, "from_phase_id", 60)!;
  const toId = fstr(formData, "to_phase_id", 60)!;
  const [{ data: from }, { data: to }] = await Promise.all([
    admin.from("competition_event_phases").select("id, status, sort").eq("id", fromId).eq("event_id", eventId).maybeSingle(),
    admin.from("competition_event_phases").select("id, sort").eq("id", toId).eq("event_id", eventId).maybeSingle(),
  ]);
  if (!from || !to) redirect(dest(eventId, "e=phase"));
  if (from!.status !== "completed" || to!.sort !== from!.sort + 1) redirect(dest(eventId, "e=previous"));
  // Use the deployed transaction and identity model, rather than the old
  // local display-name based implementation. It redirects to review.
  await computeQualifications(formData);
}

/** Organizer decision on a qualification record — always audited. */
export async function decideQualification(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const eventId = fstr(formData, "event_id", 60)!;
  const id = fstr(formData, "id", 60)!;
  const decision = String(formData.get("decision") ?? "");
  const notes = fstr(formData, "notes", 500) ?? "";
  if (!["approved", "rejected", "manual_approved", "manual_rejected"].includes(decision)) redirect(dest(eventId, "e=decision"));
  const { data: record } = await admin.from("qualification_records").select("id").eq("id", id).eq("event_id", eventId).maybeSingle();
  if (!record) redirect(dest(eventId, "e=decision"));
  const forwarded = new FormData();
  forwarded.set("record_id", id);
  if (decision === "approved") {
    forwarded.set("note", notes);
    // The canonical action generates and displays the one-time admission token.
    await approveQualification(forwarded);
  } else {
    if (notes.length < 3) redirect(dest(eventId, "e=notes"));
    forwarded.set("new_status", decision);
    forwarded.set("reason", notes);
    await overrideQualification(forwarded);
  }
}
