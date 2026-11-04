"use server";

import { audit } from "@/lib/admin";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
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
  if (error || !student) return { ok: false, error: "The student could not be registered. Please try again." };

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
