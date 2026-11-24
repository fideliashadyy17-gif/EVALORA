"use server";

/**
 * Teacher ↔ subject assignments, scoped to ONE organization.
 *
 * A teacher may teach Mathematics in one institution and Physics in another,
 * so assignments live in `teacher_subjects` (organization_id, profile_id,
 * subject_id) — never as a global column on profiles. The database guard
 * trigger verifies both the subject's tenant and that the profile is
 * teaching staff of that organization; this layer adds the manager role
 * check, org scoping on every query and an audit entry.
 *
 * Updates are DIFF-based (insert missing, delete removed): a failed insert
 * can never wipe existing assignments.
 */

import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { audit } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Subjects assigned to a teacher inside the active organization. */
export async function loadTeacherSubjects(profileId: string): Promise<{ id: string; name: string }[]> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !UUID.test(profileId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("teacher_subjects")
    .select("subject_id, subjects(id, name)")
    .eq("organization_id", org.id)
    .eq("profile_id", profileId);
  return ((data ?? []) as unknown as { subjects: { id: string; name: string } | null }[])
    .map((row) => row.subjects)
    .filter((s): s is { id: string; name: string } => Boolean(s));
}

/** Replace a teacher's subject set for this organization (diff-based). */
export async function setTeacherSubjects(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/teachers?e=forbidden");
  }
  const profileId = String(formData.get("profile_id") ?? "");
  if (!UUID.test(profileId)) redirect("/dashboard/teachers?e=subject_assign");

  const wanted = [...new Set(formData.getAll("subject_ids").map(String).filter((id) => UUID.test(id)))];

  const supabase = await createClient();

  // Tenant isolation: every subject must belong to this organization.
  if (wanted.length) {
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id")
      .eq("organization_id", org.id)
      .in("id", wanted);
    if ((subjects ?? []).length !== wanted.length) redirect("/dashboard/teachers?e=subject_unknown");
  }

  // The target must be a member of this organization (guard also enforces).
  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", org.id)
    .eq("user_id", profileId)
    .maybeSingle();
  if (!member) redirect("/dashboard/teachers?e=subject_assign");

  const { data: existingRows } = await supabase
    .from("teacher_subjects")
    .select("id, subject_id")
    .eq("organization_id", org.id)
    .eq("profile_id", profileId);
  const existing = (existingRows ?? []) as { id: string; subject_id: string }[];
  const wantedSet = new Set(wanted);
  const existingSet = new Set(existing.map((row) => row.subject_id));

  const toDelete = existing.filter((row) => !wantedSet.has(row.subject_id)).map((row) => row.id);
  const toInsert = wanted.filter((id) => !existingSet.has(id));

  if (toDelete.length) {
    const { error } = await supabase.from("teacher_subjects").delete().in("id", toDelete).eq("organization_id", org.id);
    if (error) redirect("/dashboard/teachers?e=subject_assign");
  }
  if (toInsert.length) {
    const { error } = await supabase.from("teacher_subjects").insert(
      toInsert.map((subjectId) => ({
        organization_id: org.id,
        profile_id: profileId,
        subject_id: subjectId,
        assigned_by: ctx.user.id,
      })),
    );
    if (error) redirect("/dashboard/teachers?e=subject_assign");
  }

  await audit(ctx, "teacher.subjects_assigned", "teacher_subjects", profileId, org.id, {
    count: wanted.length,
    added: toInsert.length,
    removed: toDelete.length,
  });
  revalidatePath("/dashboard/teachers");
  revalidatePath("/dashboard/questions/new");
  redirect(`/dashboard/teachers?ok=subjects&profile=${profileId}`);
}
