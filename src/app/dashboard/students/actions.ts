"use server";

import { audit } from "@/lib/admin";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import {
  registerStudentForActor,
  type RegisterStudentInput,
  type RegisterStudentResult,
} from "@/lib/services/studentRegistration";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * School-workspace student registration. Classes and years are always
 * resolved within the caller's own organization; a class ID from
 * another school can never be enrolled into.
 */

export type { RegisterStudentInput, RegisterStudentResult };

/**
 * Registers one student through the shared service.
 *
 * The rules — permission, tenant-scoped class resolution, duplicate protection,
 * enrollment rolled back on failure, audit — live in
 * `services/studentRegistration`, because the school-management MCP tools must
 * apply exactly the same ones. The action's only job is to bind the browser's
 * session to them.
 */
export async function registerStudent(input: RegisterStudentInput): Promise<RegisterStudentResult> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return { ok: false, error: "No active school workspace." };

  const supabase = await createClient();
  const result = await registerStudentForActor(input, {
    ctx,
    organizationId: org.id,
    supabase,
    revalidate: () => {
      revalidatePath("/dashboard/students");
      revalidatePath("/dashboard/academics/classes");
    },
  });
  return result;
}

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max) || null;

export async function setStudentStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "students.edit", "students"))) redirect("/dashboard/students");
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
  if (!org || !(await canOperate(ctx, org.id, "students.edit", "students"))) redirect("/dashboard/students");
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
