"use server";

import { audit } from "@/lib/admin";
import { activeOrg, can, CREATOR_ROLES, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * School-workspace academic management.
 * Every query runs on the RLS client AND is scoped to the caller's
 * active organization (resolved from verified membership / tenant
 * hostname) — class and year IDs from the client are always re-checked
 * against that organization before use.
 */

const str = (fd: FormData, key: string, max = 300) => {
  const v = String(fd.get(key) ?? "").trim().slice(0, max);
  return v || null;
};
const back = (fd: FormData, fallback: string) => {
  const v = String(fd.get("back") ?? fallback);
  return v.startsWith("/dashboard") ? v : fallback;
};
const sep = (u: string) => (u.includes("?") ? "&" : "?");

async function schoolCtx(roles = CREATOR_ROLES) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  if (!can(ctx, org!.id, roles)) redirect("/dashboard/academics?e=forbidden");
  return { ctx, org: org!, supabase: await createClient() };
}

function revalidateAcademics() {
  revalidatePath("/dashboard/academics");
  revalidatePath("/dashboard/academics/classes");
  revalidatePath("/dashboard/students");
}

/* ─── Academic years ─────────────────────────────────────────────── */

export async function saveAcademicYear(formData: FormData) {
  const { ctx, org, supabase } = await schoolCtx(MANAGER_ROLES);
  const dest = back(formData, "/dashboard/academics");
  const id = str(formData, "id", 60);
  const name = str(formData, "name", 80);
  if (!name) redirect(`${dest}${sep(dest)}e=year_name`);
  const isCurrent = formData.get("is_current") === "on";
  const payload = {
    organization_id: org.id,
    name,
    starts_on: str(formData, "starts_on", 10),
    ends_on: str(formData, "ends_on", 10),
    is_current: isCurrent,
  };
  if (isCurrent) {
    await supabase.from("academic_years").update({ is_current: false }).eq("organization_id", org.id).eq("is_current", true);
  }
  const { error } = id
    ? await supabase.from("academic_years").update(payload).eq("id", id).eq("organization_id", org.id)
    : await supabase.from("academic_years").insert(payload);
  if (error) redirect(`${dest}${sep(dest)}e=year_failed`);
  await audit(ctx, id ? "academic_year.updated" : "academic_year.created", "academic_years", id ?? org.id, org.id, { name });
  revalidateAcademics();
  redirect(`${dest}${sep(dest)}ok=year_saved`);
}

export async function deleteAcademicYear(formData: FormData) {
  const { ctx, org, supabase } = await schoolCtx(MANAGER_ROLES);
  const dest = back(formData, "/dashboard/academics");
  const id = str(formData, "id", 60);
  if (!id) redirect(dest);
  const { count } = await supabase
    .from("classes").select("id", { count: "exact", head: true })
    .eq("organization_id", org.id).eq("academic_year_id", id!);
  if ((count ?? 0) > 0) redirect(`${dest}${sep(dest)}e=year_in_use`);
  await supabase.from("academic_years").delete().eq("id", id!).eq("organization_id", org.id);
  await audit(ctx, "academic_year.deleted", "academic_years", id!, org.id);
  revalidateAcademics();
  redirect(`${dest}${sep(dest)}ok=year_deleted`);
}

/* ─── Levels / departments / subjects (configurable per school) ──── */

const STRUCTURE_TABLES = { level: "education_levels", department: "departments", subject: "subjects" } as const;

export async function saveStructureItem(formData: FormData) {
  const { ctx, org, supabase } = await schoolCtx(MANAGER_ROLES);
  const dest = back(formData, "/dashboard/academics");
  const kind = String(formData.get("kind") ?? "") as keyof typeof STRUCTURE_TABLES;
  const table = STRUCTURE_TABLES[kind];
  if (!table) redirect(dest);
  const id = str(formData, "id", 60);
  const name = str(formData, "name", 120);
  if (!name) redirect(`${dest}${sep(dest)}e=name`);
  const sort = Math.max(0, Math.min(999, parseInt(String(formData.get("sort") ?? "0"), 10) || 0));
  const payload: Record<string, unknown> = { organization_id: org.id, name, code: str(formData, "code", 30), sort };
  if (kind === "subject") {
    // Optional level/department must belong to this school.
    const levelId = str(formData, "level_id", 60);
    const deptId = str(formData, "department_id", 60);
    if (levelId) {
      const { data } = await supabase.from("education_levels").select("id").eq("id", levelId).eq("organization_id", org.id).maybeSingle();
      if (!data) redirect(`${dest}${sep(dest)}e=level`);
      payload.level_id = levelId;
    }
    if (deptId) {
      const { data } = await supabase.from("departments").select("id").eq("id", deptId).eq("organization_id", org.id).maybeSingle();
      if (!data) redirect(`${dest}${sep(dest)}e=department`);
      payload.department_id = deptId;
    }
  }
  const { error } = id
    ? await supabase.from(table).update(payload).eq("id", id).eq("organization_id", org.id)
    : await supabase.from(table).insert(payload);
  if (error) redirect(`${dest}${sep(dest)}e=save_failed`);
  await audit(ctx, `academic_structure.${id ? "updated" : "created"}`, table, id ?? org.id, org.id, { name, kind });
  revalidateAcademics();
  redirect(`${dest}${sep(dest)}ok=saved`);
}

export async function deleteStructureItem(formData: FormData) {
  const { ctx, org, supabase } = await schoolCtx(MANAGER_ROLES);
  const dest = back(formData, "/dashboard/academics");
  const kind = String(formData.get("kind") ?? "") as keyof typeof STRUCTURE_TABLES;
  const table = STRUCTURE_TABLES[kind];
  const id = str(formData, "id", 60);
  if (!table || !id) redirect(dest);
  // Safety: never delete structure still referenced by classes.
  if (kind === "level" || kind === "department") {
    const { count } = await supabase
      .from("classes").select("id", { count: "exact", head: true })
      .eq("organization_id", org.id).eq(kind === "level" ? "level_id" : "department_id", id!);
    if ((count ?? 0) > 0) redirect(`${dest}${sep(dest)}e=in_use`);
  }
  const { error } = await supabase.from(table).delete().eq("id", id!).eq("organization_id", org.id);
  if (error) redirect(`${dest}${sep(dest)}e=in_use`);
  await audit(ctx, "academic_structure.deleted", table, id!, org.id, { kind });
  revalidateAcademics();
  redirect(`${dest}${sep(dest)}ok=deleted`);
}

/* ─── Classes ────────────────────────────────────────────────────── */

export interface ClassInput {
  id?: string | null;
  name: string;
  code?: string | null;
  academic_year_id?: string | null;
  level_id?: string | null;
  department_id?: string | null;
  teacher_id?: string | null;
  capacity?: number | null;
  description?: string | null;
  status?: "active" | "archived";
}

export interface ClassResult {
  ok: boolean;
  error?: string;
  class?: { id: string; name: string; code: string | null; academic_year_id: string | null; level_id: string | null; department_id: string | null; status: string };
}

async function assertOrgRefs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  input: ClassInput,
): Promise<string | null> {
  const checks: [string, string | null | undefined, string][] = [
    ["academic_years", input.academic_year_id, "That academic year does not belong to your school."],
    ["education_levels", input.level_id, "That education level does not belong to your school."],
    ["departments", input.department_id, "That department does not belong to your school."],
  ];
  for (const [table, id, message] of checks) {
    if (!id) continue;
    const { data } = await supabase.from(table).select("id").eq("id", id).eq("organization_id", orgId).maybeSingle();
    if (!data) return message;
  }
  if (input.teacher_id) {
    const { data } = await supabase
      .from("organization_members").select("id")
      .eq("organization_id", orgId).eq("user_id", input.teacher_id).eq("status", "active").maybeSingle();
    // Super Admin operating a workspace without membership is also valid.
    if (!data) {
      const { data: profile } = await supabase.from("profiles").select("id, platform_role").eq("id", input.teacher_id).maybeSingle();
      if (!profile || profile.platform_role !== "super_admin") return "The class teacher must be a member of your school.";
    }
  }
  return null;
}

/** Create/update a class and return it — used by the inline "Create New
 *  Class" control inside student registration (no navigation away). */
export async function saveClassInline(input: ClassInput): Promise<ClassResult> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { ok: false, error: "No active school workspace." };
  if (!can(ctx, org.id, CREATOR_ROLES)) return { ok: false, error: "You do not have permission to manage classes." };
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Class name is required." };
  const supabase = await createClient();
  const refError = await assertOrgRefs(supabase, org.id, input);
  if (refError) return { ok: false, error: refError };
  const payload = {
    organization_id: org.id,
    name,
    code: input.code?.trim().slice(0, 40) || null,
    academic_year_id: input.academic_year_id || null,
    level_id: input.level_id || null,
    department_id: input.department_id || null,
    teacher_id: input.teacher_id || null,
    capacity: Math.max(1, Math.min(1000, Math.floor(input.capacity ?? 40) || 40)),
    description: input.description?.trim().slice(0, 500) || null,
    status: input.status === "archived" ? "archived" : "active",
    updated_at: new Date().toISOString(),
  };
  // Avoid accidental duplicates: same name in same school + year.
  if (!input.id) {
    let dup = supabase.from("classes").select("id").eq("organization_id", org.id).ilike("name", name);
    dup = payload.academic_year_id ? dup.eq("academic_year_id", payload.academic_year_id) : dup.is("academic_year_id", null);
    const { data: existing } = await dup.maybeSingle();
    if (existing) return { ok: false, error: `A class named “${name}” already exists for that academic year.` };
  }
  const { data, error } = input.id
    ? await supabase.from("classes").update(payload).eq("id", input.id).eq("organization_id", org.id)
        .select("id, name, code, academic_year_id, level_id, department_id, status").single()
    : await supabase.from("classes").insert(payload)
        .select("id, name, code, academic_year_id, level_id, department_id, status").single();
  if (error || !data) {
    return { ok: false, error: error?.code === "23505" ? "That class code is already used in this academic year." : "The class could not be saved. Please try again." };
  }
  await audit(ctx, input.id ? "class.updated" : "class.created", "classes", data.id, org.id, { name, code: payload.code });
  revalidateAcademics();
  return { ok: true, class: data };
}

export async function saveClassForm(formData: FormData) {
  const dest = back(formData, "/dashboard/academics/classes");
  const result = await saveClassInline({
    id: str(formData, "id", 60),
    name: String(formData.get("name") ?? ""),
    code: str(formData, "code", 40),
    academic_year_id: str(formData, "academic_year_id", 60),
    level_id: str(formData, "level_id", 60),
    department_id: str(formData, "department_id", 60),
    teacher_id: str(formData, "teacher_id", 60),
    capacity: parseInt(String(formData.get("capacity") ?? "40"), 10) || 40,
    description: str(formData, "description", 500),
    status: String(formData.get("status")) === "archived" ? "archived" : "active",
  });
  if (!result.ok) redirect(`${dest}${sep(dest)}e=${encodeURIComponent(result.error ?? "failed")}`);
  redirect(`${dest}${sep(dest)}ok=class_saved`);
}

export async function classLifecycle(formData: FormData) {
  const dest = back(formData, "/dashboard/academics/classes");
  const op = String(formData.get("op") ?? "");
  const id = str(formData, "id", 60);
  if (!id) redirect(dest);
  const { ctx, org, supabase } = await schoolCtx(op === "delete" ? MANAGER_ROLES : CREATOR_ROLES);
  if (op === "archive" || op === "restore") {
    await supabase.from("classes")
      .update({ status: op === "archive" ? "archived" : "active", updated_at: new Date().toISOString() })
      .eq("id", id!).eq("organization_id", org.id);
    await audit(ctx, op === "archive" ? "class.archived" : "class.restored", "classes", id!, org.id);
  } else if (op === "delete") {
    if (formData.get("confirm") !== "on") redirect(`${dest}${sep(dest)}e=${encodeURIComponent("Tick the confirmation box to delete this class.")}`);
    const { count } = await supabase.from("student_enrollments")
      .select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("class_id", id!);
    if ((count ?? 0) > 0) {
      redirect(`${dest}${sep(dest)}e=${encodeURIComponent("This class has student enrollment history and cannot be deleted. Archive it instead.")}`);
    }
    await supabase.from("classes").delete().eq("id", id!).eq("organization_id", org.id);
    await audit(ctx, "class.deleted", "classes", id!, org.id);
  }
  revalidateAcademics();
  redirect(`${dest}${sep(dest)}ok=class_updated`);
}

/* ─── Enrollment: transfer / withdraw ────────────────────────────── */

export async function transferStudent(formData: FormData) {
  const dest = back(formData, "/dashboard/students");
  const { ctx, org, supabase } = await schoolCtx(CREATOR_ROLES);
  const studentId = str(formData, "student_id", 60);
  const classId = str(formData, "class_id", 60);
  if (!studentId || !classId) redirect(`${dest}${sep(dest)}e=${encodeURIComponent("Choose a student and a destination class.")}`);

  const [{ data: student }, { data: cls }] = await Promise.all([
    supabase.from("students").select("id, full_name").eq("id", studentId!).eq("organization_id", org.id).maybeSingle(),
    supabase.from("classes").select("id, name, academic_year_id, status").eq("id", classId!).eq("organization_id", org.id).maybeSingle(),
  ]);
  if (!student) redirect(`${dest}${sep(dest)}e=${encodeURIComponent("That student does not belong to your school.")}`);
  if (!cls || cls.status !== "active") redirect(`${dest}${sep(dest)}e=${encodeURIComponent("That class does not belong to your school or is archived.")}`);

  // End other active enrollments for the same academic year, then enroll.
  let ending = supabase.from("student_enrollments").update({ status: "transferred" })
    .eq("organization_id", org.id).eq("student_id", studentId!).eq("status", "active").neq("class_id", classId!);
  ending = cls.academic_year_id ? ending.eq("academic_year_id", cls.academic_year_id) : ending.is("academic_year_id", null);
  await ending;
  const { error } = await supabase.from("student_enrollments").upsert(
    { organization_id: org.id, student_id: studentId!, class_id: classId!, academic_year_id: cls.academic_year_id, status: "active" },
    { onConflict: "student_id,class_id" },
  );
  if (error) redirect(`${dest}${sep(dest)}e=${encodeURIComponent("The transfer could not be completed.")}`);
  await audit(ctx, "student.transferred", "student_enrollments", studentId!, org.id, { class_id: classId, class_name: cls.name });
  revalidateAcademics();
  redirect(`${dest}${sep(dest)}ok=transferred`);
}

export async function withdrawEnrollment(formData: FormData) {
  const dest = back(formData, "/dashboard/students");
  const { ctx, org, supabase } = await schoolCtx(CREATOR_ROLES);
  const enrollmentId = str(formData, "enrollment_id", 60);
  if (!enrollmentId) redirect(dest);
  await supabase.from("student_enrollments").update({ status: "withdrawn" })
    .eq("id", enrollmentId!).eq("organization_id", org.id);
  await audit(ctx, "student.unenrolled", "student_enrollments", enrollmentId!, org.id);
  revalidateAcademics();
  redirect(`${dest}${sep(dest)}ok=unenrolled`);
}
