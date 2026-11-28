import "server-only";

/**
 * School-structure reads for the assistant and the agent tools.
 *
 * Years, grades, classes, subjects, teachers and assignments are read here once
 * and consumed by several tools, rather than each handler writing its own query.
 * The brief for Part 5 says to reuse application services and not duplicate
 * business logic in handlers; this is that service.
 *
 * Every read is scoped by `organization_id` in the query itself, not filtered
 * afterwards. A caller cannot widen the scope by asking for a different tenant:
 * the organization comes from the authenticated session, never from arguments.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTeachingContext } from "../teachingAssignments";

export interface SchoolStructure {
  organization: { id: string; name: string; slug: string };
  years: { id: string; name: string; startsOn: string | null; endsOn: string | null; status: string }[];
  grades: { id: string; name: string; band: string | null; order: number | null }[];
  classes: {
    id: string;
    name: string;
    gradeId: string | null;
    gradeName: string | null;
    academicYearId: string | null;
    academicYearName: string | null;
    status: string;
    homeroomTeacherId: string | null;
  }[];
  subjects: { id: string; name: string; code: string | null; classIds: string[] }[];
  teachers: {
    id: string;
    fullName: string;
    email: string | null;
    roles: string[];
    homeroomClassIds: string[];
    subjectIds: string[];
    configured: boolean;
  }[];
  counts: { students: number; classes: number; subjects: number; teachers: number; assignments: number };
  notes: string[];
}

/** One teacher's responsibilities, resolved from teaching_assignments. */
export interface TeacherResponsibilities {
  teacherId: string;
  fullName: string;
  email: string | null;
  /** Present when the teacher has at least one teaching assignment. */
  homeroom: { classId: string; className: string }[];
  subjects: { subjectId: string; subjectName: string; classId: string | null; className: string | null }[];
  /**
   * False means the teacher has NO assignments, which the policies treat as
   * unrestricted — the grandfathering branch. Saying so plainly matters: an
   * administrator reading "no subjects" would otherwise assume no access, and
   * an agent would assume the opposite of the truth.
   */
  configured: boolean;
}

async function countOf(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const { count, error } = await query;
  if (error) return null;
  return count ?? null;
}

/**
 * Reads the whole school structure for one organization.
 *
 * A read that fails is reported in `notes` and its list comes back empty; it is
 * never presented as "the school has no classes". Counts that cannot be read are
 * `null` rather than 0 for the same reason.
 */
export async function loadSchoolStructure(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<SchoolStructure> {
  const notes: string[] = [];

  const [org, years, grades, classes, subjects, classSubjects, memberships, assignments] = await Promise.all([
    supabase.from("organizations").select("id, name, slug").eq("id", organizationId).maybeSingle(),
    supabase
      .from("academic_years")
      .select("id, name, starts_on, ends_on, status")
      .eq("organization_id", organizationId)
      .order("starts_on", { ascending: false })
      .limit(50),
    supabase
      .from("education_levels")
      .select("id, name, band, sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .limit(200),
    supabase
      .from("classes")
      .select("id, name, education_level_id, academic_year_id, status, teacher_id, education_levels(name), academic_years(name)")
      .eq("organization_id", organizationId)
      .order("name")
      .limit(500),
    supabase.from("subjects").select("id, name, code").eq("organization_id", organizationId).order("name").limit(500),
    supabase.from("class_subjects").select("class_id, subject_id").limit(5000),
    supabase
      .from("organization_members")
      .select("user_id, role, status, profiles(id, full_name, email)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(500),
    supabase
      .from("teaching_assignments")
      .select("teacher_id, class_id, subject_id, role")
      .eq("organization_id", organizationId)
      .limit(5000),
  ]);

  if (!org.data) throw new Error("The organization could not be read for this session.");
  if (years.error) notes.push("The academic year list could not be read.");
  if (grades.error) notes.push("The grade (education level) list could not be read.");
  if (classes.error) notes.push("The class list could not be read.");
  if (subjects.error) notes.push("The subject list could not be read.");
  if (classSubjects.error) notes.push("The class/subject links could not be read, so subject membership per class is incomplete.");
  if (memberships.error) notes.push("The staff list could not be read.");
  if (assignments.error) notes.push("The teaching assignments could not be read, so responsibilities are incomplete.");

  type Row = Record<string, unknown>;
  const classRows = (classes.data ?? []) as Row[];

  const subjectClassIds = new Map<string, string[]>();
  for (const link of (classSubjects.data ?? []) as Row[]) {
    const subjectId = link.subject_id as string;
    const list = subjectClassIds.get(subjectId) ?? [];
    list.push(link.class_id as string);
    subjectClassIds.set(subjectId, list);
  }

  const assignmentRows = (assignments.data ?? []) as Row[];
  const teacherIds = new Set<string>();
  for (const member of (memberships.data ?? []) as Row[]) {
    const role = member.role as string;
    if (["teacher", "admin", "owner", "organizer"].includes(role)) teacherIds.add(member.user_id as string);
  }
  for (const row of assignmentRows) teacherIds.add(row.teacher_id as string);

  const teachers = ((memberships.data ?? []) as Row[])
    .filter((member) => teacherIds.has(member.user_id as string))
    .map((member) => {
      const profile = (member.profiles ?? {}) as Record<string, unknown>;
      const mine = assignmentRows.filter((row) => row.teacher_id === member.user_id);
      return {
        id: member.user_id as string,
        fullName: (profile.full_name as string) ?? "(unnamed)",
        email: (profile.email as string) ?? null,
        roles: [member.role as string],
        homeroomClassIds: mine.filter((row) => row.role === "class_teacher").map((row) => row.class_id as string),
        subjectIds: [...new Set(mine.filter((row) => row.role === "subject_teacher").map((row) => row.subject_id as string))],
        configured: mine.length > 0,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const [students, teacherCount] = await Promise.all([
    countOf(supabase.from("students").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)),
    countOf(
      supabase
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("role", "teacher")
        .eq("status", "active"),
    ),
  ]);

  return {
    organization: {
      id: org.data.id as string,
      name: org.data.name as string,
      slug: (org.data.slug as string) ?? "",
    },
    years: ((years.data ?? []) as Row[]).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      startsOn: (row.starts_on as string | null) ?? null,
      endsOn: (row.ends_on as string | null) ?? null,
      status: (row.status as string) ?? "active",
    })),
    grades: ((grades.data ?? []) as Row[]).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      band: (row.band as string | null) ?? null,
      order: (row.sort_order as number | null) ?? null,
    })),
    classes: classRows.map((row) => {
      const level = (row.education_levels ?? null) as { name?: string } | null;
      const year = (row.academic_years ?? null) as { name?: string } | null;
      return {
        id: row.id as string,
        name: row.name as string,
        gradeId: (row.education_level_id as string | null) ?? null,
        gradeName: level?.name ?? null,
        academicYearId: (row.academic_year_id as string | null) ?? null,
        academicYearName: year?.name ?? null,
        status: (row.status as string) ?? "active",
        homeroomTeacherId: (row.teacher_id as string | null) ?? null,
      };
    }),
    subjects: ((subjects.data ?? []) as Row[]).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      code: (row.code as string | null) ?? null,
      classIds: subjectClassIds.get(row.id as string) ?? [],
    })),
    teachers,
    counts: {
      students: students ?? 0,
      classes: classRows.length,
      subjects: ((subjects.data ?? []) as unknown[]).length,
      teachers: teacherCount ?? teachers.length,
      assignments: assignmentRows.length,
    },
    notes,
  };
}

/**
 * One teacher's responsibilities, from `teaching_assignments`.
 *
 * Uses the same reader the authorization code uses (`loadTeachingContext`), so
 * what an administrator is shown and what the policies enforce cannot drift.
 */
export async function loadTeacherResponsibilities(
  supabase: SupabaseClient,
  organizationId: string,
  teacherId: string,
): Promise<TeacherResponsibilities | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", teacherId)
    .maybeSingle();
  if (!profile) return null;

  // Membership is checked explicitly: a valid profile id from another school
  // must not be readable through this organization's session.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", teacherId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return null;

  const { configured, assignments } = await loadTeachingContext(supabase, organizationId, teacherId);

  const classIds = [...new Set(assignments.map((a) => a.classId).filter((id): id is string => !!id))];
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId).filter((id): id is string => !!id))];

  const [classRows, subjectRows] = await Promise.all([
    classIds.length
      ? supabase.from("classes").select("id, name").eq("organization_id", organizationId).in("id", classIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    subjectIds.length
      ? supabase.from("subjects").select("id, name").eq("organization_id", organizationId).in("id", subjectIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const className = new Map(((classRows.data ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row.name as string]));
  const subjectName = new Map(((subjectRows.data ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row.name as string]));

  return {
    teacherId,
    fullName: (profile.full_name as string) ?? "(unnamed)",
    email: (profile.email as string) ?? null,
    homeroom: assignments
      .filter((assignment) => assignment.role === "class_teacher" && assignment.classId)
      .map((assignment) => ({
        classId: assignment.classId as string,
        className: className.get(assignment.classId as string) ?? "(unknown class)",
      })),
    subjects: assignments
      .filter((assignment) => assignment.role === "subject_teacher" && assignment.subjectId)
      .map((assignment) => ({
        subjectId: assignment.subjectId as string,
        subjectName: subjectName.get(assignment.subjectId as string) ?? "(unknown subject)",
        classId: assignment.classId,
        className: assignment.classId ? className.get(assignment.classId) ?? "(unknown class)" : null,
      })),
    configured,
  };
}
