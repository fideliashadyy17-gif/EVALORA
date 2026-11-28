import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Teaching responsibilities, and the authorization they imply.
 *
 * The platform used to answer "may this teacher touch this subject?" with a
 * single organization-wide role. `can_create_content(org)` returns true for any
 * member whose role is `teacher`, and every question and examination policy
 * called it with only the organization id — so a Physics teacher held edit
 * rights over the Literature examination in the same school. Nothing recorded
 * which teacher taught which subject, in which class, at all:
 *
 *   teacher_subjects (profile_id, subject_id)   a subject, with no class
 *   classes.teacher_id                          a class, with no subject
 *
 * `teaching_assignments` supplies the missing dimension, and this module is the
 * application-side reader of it. Keeping the rule here as well as in the
 * database is deliberate: the RLS predicates answer "may this row be touched",
 * which cannot express "the caller is a teacher of subject X in class Y" without
 * a join the policy engine cannot make cheaply, and a server action that trusts a
 * hidden button is not an access control.
 */

export type TeachingRole = "class_teacher" | "subject_teacher";

export interface TeachingAssignment {
  id: string;
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  role: TeachingRole;
}

/**
 * Everything one teacher is responsible for in one organization.
 *
 * Returns `configured: false` when the teacher has no assignments at all. That
 * distinction matters: "no rows" is not "no permissions" in this codebase,
 * because before this table existed nobody had rows and everybody had full
 * organization-wide reach. Collapsing the two would either lock out every
 * existing teacher or silently restore the defect.
 */
export async function loadTeachingContext(
  supabase: SupabaseClient,
  organizationId: string,
  teacherId: string,
): Promise<{ configured: boolean; assignments: TeachingAssignment[] }> {
  const { data, error } = await supabase
    .from("teaching_assignments")
    .select("id, teacher_id, class_id, subject_id, role")
    .eq("organization_id", organizationId)
    .eq("teacher_id", teacherId);

  if (error) return { configured: false, assignments: [] };

  const assignments = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    teacherId: row.teacher_id as string,
    classId: (row.class_id as string | null) ?? null,
    subjectId: (row.subject_id as string | null) ?? null,
    role: row.role as TeachingRole,
  }));

  return { configured: assignments.length > 0, assignments };
}

/**
 * May this teacher author or edit content in this subject?
 *
 * `true` when they hold a subject assignment for it. A teacher with NO
 * assignments at all keeps the previous behaviour rather than being locked out —
 * see `loadTeachingContext`. The alternative silently breaks every existing
 * teacher the day this ships, which is a worse failure than the one being fixed.
 */
export async function canAuthorInSubject(
  supabase: SupabaseClient,
  organizationId: string,
  teacherId: string,
  subjectId: string | null,
): Promise<boolean> {
  if (!subjectId) return true;
  const { configured, assignments } = await loadTeachingContext(supabase, organizationId, teacherId);
  if (!configured) return true;
  return assignments.some(
    (assignment) => assignment.role === "subject_teacher" && assignment.subjectId === subjectId,
  );
}

/**
 * May this teacher act on content for this subject IN THIS CLASS?
 *
 * Stricter than `canAuthorInSubject`: a subject assignment that names a class
 * only covers that class. This is the check that stops a teacher assigned to
 * JSS 1A Mathematics marking JSS 2B Mathematics, which the brief calls out.
 */
export async function canAuthorInClassSubject(
  supabase: SupabaseClient,
  organizationId: string,
  teacherId: string,
  classId: string | null,
  subjectId: string | null,
): Promise<boolean> {
  if (!subjectId) return true;
  const { configured, assignments } = await loadTeachingContext(supabase, organizationId, teacherId);
  if (!configured) return true;
  return assignments.some(
    (assignment) =>
      assignment.role === "subject_teacher" &&
      assignment.subjectId === subjectId &&
      (assignment.classId === null || classId === null || assignment.classId === classId),
  );
}

/**
 * Homeroom rights: the roster, attendance and class-level reporting for a class.
 *
 * Deliberately NOT a grading permission. Being a class teacher is a pastoral
 * responsibility; it does not confer authority over a subject's official marks.
 */
export async function isHomeroomOf(
  supabase: SupabaseClient,
  organizationId: string,
  teacherId: string,
  classId: string,
): Promise<boolean> {
  const { assignments } = await loadTeachingContext(supabase, organizationId, teacherId);
  return assignments.some(
    (assignment) => assignment.role === "class_teacher" && assignment.classId === classId,
  );
}

/**
 * Replaces a teacher's assignments for one organization.
 *
 * Diff-based for the same reason `setTeacherSubjects` is: a failed insert must
 * never wipe the rows that were already correct. Every row is validated against
 * the organization before it is written, so a class or subject belonging to
 * another tenant cannot be attached to this teacher.
 */
export async function setTeachingAssignments(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    teacherId: string;
    assignedBy: string;
    desired: { classId: string | null; subjectId: string | null; role: TeachingRole }[];
  },
): Promise<{ added: number; removed: number }> {
  const { organizationId, teacherId, assignedBy, desired } = input;

  // Refuse anything that is not strictly well-formed before touching the table.
  for (const row of desired) {
    if (row.role === "class_teacher" && (!row.classId || row.subjectId)) {
      throw new Error("A homeroom assignment names a class and no subject.");
    }
    if (row.role === "subject_teacher" && !row.subjectId) {
      throw new Error("A subject assignment must name a subject.");
    }
  }

  // Every referenced class and subject must belong to this organization. This is
  // the tenant check the brief asks to verify; the database guard cannot make it
  // alone because it is not given both ids in every row.
  const classIds = [...new Set(desired.map((row) => row.classId).filter(Boolean))] as string[];
  const subjectIds = [...new Set(desired.map((row) => row.subjectId).filter(Boolean))] as string[];
  if (classIds.length) {
    const { data } = await supabase.from("classes").select("id").eq("organization_id", organizationId).in("id", classIds);
    if ((data ?? []).length !== classIds.length) throw new Error("A class does not belong to this organization.");
  }
  if (subjectIds.length) {
    const { data } = await supabase.from("subjects").select("id").eq("organization_id", organizationId).in("id", subjectIds);
    if ((data ?? []).length !== subjectIds.length) throw new Error("A subject does not belong to this organization.");
  }

  const { data: existingRows, error: readError } = await supabase
    .from("teaching_assignments")
    .select("id, class_id, subject_id, role")
    .eq("organization_id", organizationId)
    .eq("teacher_id", teacherId);
  if (readError) throw new Error("Existing assignments could not be read; nothing was changed.");

  const key = (row: { classId?: string | null; class_id?: string | null; subjectId?: string | null; subject_id?: string | null; role: string }) =>
    `${row.role}|${row.classId ?? row.class_id ?? ""}|${row.subjectId ?? row.subject_id ?? ""}`;

  const existing = (existingRows ?? []) as { id: string; class_id: string | null; subject_id: string | null; role: TeachingRole }[];
  const wantedKeys = new Set(desired.map(key));
  const existingKeys = new Set(existing.map(key));

  const toDelete = existing.filter((row) => !wantedKeys.has(key(row))).map((row) => row.id);
  const toInsert = desired.filter((row) => !existingKeys.has(key(row)));

  if (toDelete.length) {
    const { error } = await supabase.from("teaching_assignments").delete().in("id", toDelete).eq("organization_id", organizationId);
    if (error) throw new Error("Existing assignments could not be replaced; nothing was changed.");
  }
  if (toInsert.length) {
    const { error } = await supabase.from("teaching_assignments").insert(
      toInsert.map((row) => ({
        organization_id: organizationId,
        teacher_id: teacherId,
        class_id: row.classId,
        subject_id: row.subjectId,
        role: row.role,
        assigned_by: assignedBy,
      })),
    );
    if (error) throw new Error("The new assignments could not be saved.");
  }

  return { added: toInsert.length, removed: toDelete.length };
}
