"use server";

import { audit } from "@/lib/admin";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { getEntitlementFor, isPlanLimitError, planLimitMessage, withinLimit } from "@/lib/entitlements";
import { isValidEmail, normalizeDateOfBirth, normalizeGender } from "@/lib/studentImport";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * School-workspace student registration. Classes and years are always
 * resolved within the caller's own organization; a class ID from
 * another school can never be enrolled into.
 */

export interface RegisterStudentInput {
  full_name: string;
  email?: string;
  student_ref?: string;
  gender?: string;
  date_of_birth?: string;
  phone?: string;
  guardian_name?: string;
  guardian_contact?: string;
  class_id?: string;
}

export interface RegisterStudentResult {
  ok: boolean;
  error?: string;
  student?: { id: string; full_name: string };
}

export async function registerStudent(input: RegisterStudentInput): Promise<RegisterStudentResult> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { ok: false, error: "No active school workspace." };
  if (!can(ctx, org.id, CREATOR_ROLES)) return { ok: false, error: "You do not have permission to register students." };

  const fullName = String(input.full_name ?? "").trim().slice(0, 160);
  if (!fullName) return { ok: false, error: "The student's full name is required." };
  const email = String(input.email ?? "").trim().toLowerCase();
  if (email && !isValidEmail(email)) return { ok: false, error: "That email address is not valid." };
  const dobRaw = String(input.date_of_birth ?? "").trim();
  const dob = dobRaw ? normalizeDateOfBirth(dobRaw) : null;
  if (dobRaw && !dob) return { ok: false, error: "Date of birth must be a real date (YYYY-MM-DD)." };
  const studentRef = String(input.student_ref ?? "").trim().slice(0, 60) || null;

  const supabase = await createClient();

  // Class must belong to this school (and be active).
  let cls: { id: string; academic_year_id: string | null } | null = null;
  if (input.class_id) {
    const { data } = await supabase.from("classes")
      .select("id, academic_year_id, status")
      .eq("id", input.class_id).eq("organization_id", org.id).maybeSingle();
    if (!data) return { ok: false, error: "That class does not belong to your school." };
    if (data.status !== "active") return { ok: false, error: "That class is archived. Restore it before enrolling students." };
    cls = data;
  }

  // Duplicate protection within the school.
  if (studentRef) {
    const { data } = await supabase.from("students").select("id")
      .eq("organization_id", org.id).ilike("student_ref", studentRef).maybeSingle();
    if (data) return { ok: false, error: `A student with reference “${studentRef}” already exists in your school.` };
  }
  if (email) {
    const { data } = await supabase.from("students").select("id")
      .eq("organization_id", org.id).ilike("email", email).maybeSingle();
    if (data) return { ok: false, error: `A student with email “${email}” already exists in your school.` };
  }

  // Quota enforcement: check max_students capacity
  const ent = await getEntitlementFor(supabase, ctx, org.id);
  const { count: studentCount } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  if (!withinLimit(ent.limits.max_students, studentCount ?? 0)) {
    return {
      ok: false,
      error: `Your workspace has reached its limit of ${ent.limits.max_students} students for the ${ent.planName} plan. Upgrade in Billing to add more.`,
    };
  }

  const { data: student, error } = await supabase.from("students").insert({
    organization_id: org.id,
    full_name: fullName,
    email: email || null,
    student_ref: studentRef,
    gender: normalizeGender(String(input.gender ?? "")),
    date_of_birth: dob,
    phone: String(input.phone ?? "").trim().slice(0, 40) || null,
    guardian_name: String(input.guardian_name ?? "").trim().slice(0, 160) || null,
    guardian_contact: String(input.guardian_contact ?? "").trim().slice(0, 120) || null,
    status: "active",
  }).select("id, full_name").single();
  if (error || !student) {
    if (isPlanLimitError(error)) return { ok: false, error: planLimitMessage(error) };
    return { ok: false, error: "The student could not be registered. Please try again." };
  }

  if (cls) {
    const { error: enrollError } = await supabase.from("student_enrollments").insert({
      organization_id: org.id, student_id: student.id, class_id: cls.id,
      academic_year_id: cls.academic_year_id, status: "active",
    });
    if (enrollError) {
      await supabase.from("students").delete().eq("id", student.id);
      return { ok: false, error: "Enrollment into that class failed; nothing was saved." };
    }
  }

  await audit(ctx, "student.registered", "students", student.id, org.id, { class_id: cls?.id ?? null });
  revalidatePath("/dashboard/students");
  revalidatePath("/dashboard/academics/classes");
  return { ok: true, student };
}

export interface UpdateStudentInput {
  id: string;
  full_name: string;
  email?: string;
  student_ref?: string;
  gender?: string;
  date_of_birth?: string;
  phone?: string;
  guardian_name?: string;
  guardian_contact?: string;
  class_id?: string;
  status?: string;
}

export async function updateStudent(input: UpdateStudentInput): Promise<RegisterStudentResult> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { ok: false, error: "No active school workspace." };
  if (!can(ctx, org.id, CREATOR_ROLES)) return { ok: false, error: "You do not have permission to edit students." };

  const id = String(input.id ?? "").trim();
  if (!id) return { ok: false, error: "Student ID is required." };
  const fullName = String(input.full_name ?? "").trim().slice(0, 160);
  if (!fullName) return { ok: false, error: "The student's full name is required." };
  const email = String(input.email ?? "").trim().toLowerCase();
  if (email && !isValidEmail(email)) return { ok: false, error: "That email address is not valid." };
  const dobRaw = String(input.date_of_birth ?? "").trim();
  const dob = dobRaw ? normalizeDateOfBirth(dobRaw) : null;
  const studentRef = String(input.student_ref ?? "").trim().slice(0, 60) || null;

  const supabase = await createClient();

  // Verify student exists in this school
  const { data: existingStudent } = await supabase
    .from("students")
    .select("id")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!existingStudent) return { ok: false, error: "Student not found in your school." };

  // Duplicate checks excluding self
  if (studentRef) {
    const { data } = await supabase.from("students").select("id")
      .eq("organization_id", org.id).ilike("student_ref", studentRef).neq("id", id).maybeSingle();
    if (data) return { ok: false, error: `A student with reference “${studentRef}” already exists in your school.` };
  }
  if (email) {
    const { data } = await supabase.from("students").select("id")
      .eq("organization_id", org.id).ilike("email", email).neq("id", id).maybeSingle();
    if (data) return { ok: false, error: `A student with email “${email}” already exists in your school.` };
  }

  const { error } = await supabase.from("students").update({
    full_name: fullName,
    email: email || null,
    student_ref: studentRef,
    gender: normalizeGender(input.gender ?? ""),
    date_of_birth: dob,
    phone: String(input.phone ?? "").trim().slice(0, 40) || null,
    guardian_name: String(input.guardian_name ?? "").trim().slice(0, 120) || null,
    guardian_contact: String(input.guardian_contact ?? "").trim().slice(0, 120) || null,
    status: ["active", "suspended", "graduated", "withdrawn"].includes(input.status ?? "") ? input.status : "active",
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("organization_id", org.id);

  if (error) return { ok: false, error: "The student could not be updated. Please try again." };

  // Update enrollment if class_id provided
  if (input.class_id) {
    const { data: cls } = await supabase.from("classes")
      .select("id, academic_year_id, status")
      .eq("id", input.class_id).eq("organization_id", org.id).maybeSingle();

    if (cls && cls.status === "active") {
      // Deactivate old active enrollments
      await supabase.from("student_enrollments")
        .update({ status: "transferred" })
        .eq("organization_id", org.id)
        .eq("student_id", id)
        .neq("class_id", cls.id)
        .eq("status", "active");

      // Upsert new active enrollment
      await supabase.from("student_enrollments").upsert({
        organization_id: org.id,
        student_id: id,
        class_id: cls.id,
        academic_year_id: cls.academic_year_id,
        status: "active",
      }, { onConflict: "organization_id,student_id,class_id" });
    }
  }

  await audit(ctx, "student.updated", "students", id, org.id);
  revalidatePath("/dashboard/students");
  revalidatePath("/dashboard/academics/classes");
  return { ok: true, student: { id, full_name: fullName } };
}

export async function updateStudentForm(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "");
  const email = String(formData.get("email") ?? "");
  const student_ref = String(formData.get("student_ref") ?? "");
  const gender = String(formData.get("gender") ?? "");
  const date_of_birth = String(formData.get("date_of_birth") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const guardian_name = String(formData.get("guardian_name") ?? "");
  const guardian_contact = String(formData.get("guardian_contact") ?? "");
  const class_id = String(formData.get("class_id") ?? "");
  const status = String(formData.get("status") ?? "active");

  const res = await updateStudent({
    id, full_name, email, student_ref, gender, date_of_birth, phone, guardian_name, guardian_contact, class_id, status
  });
  if (!res.ok) {
    redirect(`/dashboard/students?edit=${encodeURIComponent(id)}&e=${encodeURIComponent(res.error ?? "Update failed")}`);
  }
  redirect("/dashboard/students?ok=student_updated");
}

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max) || null;

export async function setStudentStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/students");
  const id = str(formData, "id", 60);
  const status = String(formData.get("status") ?? "");
  if (!id || !["active", "suspended", "graduated", "withdrawn"].includes(status)) {
    redirect("/dashboard/students?e=status");
  }
  const supabase = await createClient();
  await supabase.from("students").update({ status, updated_at: new Date().toISOString() })
    .eq("id", id!).eq("organization_id", org!.id);
  await audit(ctx, "student.status_changed", "students", id!, org!.id, { status });
  revalidatePath("/dashboard/students");
  redirect("/dashboard/students?ok=status");
}

/** Create/link a portal login for a roster student (set-password email). */
export async function createStudentLogin(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard/students");
  const id = str(formData, "id", 60);
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("*")
    .eq("id", id ?? "").eq("organization_id", org!.id).maybeSingle();
  if (!student) redirect("/dashboard/students?e=student");
  if (!student!.email) redirect("/dashboard/students?e=student_email");

  const admin = createAdminClient();
  if (student!.user_id) {
    await admin.auth.resetPasswordForEmail(student!.email);
    await audit(ctx, "student.access_reset", "students", student!.id, org!.id);
    redirect("/dashboard/students?ok=reset_sent");
  }
  const { data: prof } = await admin.from("profiles").select("id").eq("email", student!.email).maybeSingle();
  let userId = prof?.id ?? null;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: student!.email, email_confirm: true,
      password: `Ev-${crypto.randomUUID()}!a9`,
      user_metadata: { full_name: student!.full_name },
    });
    if (error || !data?.user) redirect("/dashboard/students?e=login_failed");
    userId = data!.user.id;
    await admin.auth.resetPasswordForEmail(student!.email);
  }
  await admin.from("students").update({ user_id: userId }).eq("id", student!.id).eq("organization_id", org!.id);
  await admin.from("organization_members").upsert(
    { organization_id: org!.id, user_id: userId, role: "student", status: "active" },
    { onConflict: "organization_id,user_id" },
  );
  await audit(ctx, "student.account_created", "students", student!.id, org!.id);
  revalidatePath("/dashboard/students");
  redirect("/dashboard/students?ok=login_sent");
}
