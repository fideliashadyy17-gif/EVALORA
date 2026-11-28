import "server-only";

/**
 * Shared student registration service.
 *
 * `registerStudent` (the server action) and the school-management MCP tools
 * both call this. The action supplies the browser's session; an agent supplies
 * the identity it authenticated as, a bound session context and a client that
 * proves it. The rules are identical because the code is identical: the
 * `students.create` permission, tenant-scoped class resolution, duplicate
 * protection, and enrollment that is rolled back if it fails.
 *
 * WHY THIS EXISTS
 *
 * The action resolved its own user with `requireUser()` and its own workspace
 * with `activeOrg(ctx)`. Both read the request's cookies, so an MCP call — which
 * carries a bearer token and no cookie — could not reuse it, and the obvious
 * shortcut (write the insert again inside the tool handler) is exactly the
 * duplication the brief forbids: two implementations that agree today and
 * diverge at the first fix. Splitting the logic out means the agent path runs
 * the same validation, the same tenant check and the same audit as the
 * dashboard form.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { audit } from "../admin";
import { canOperate } from "../operationalAccess";
import { isValidEmail, normalizeDateOfBirth, normalizeGender } from "../studentImport";

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
  student?: { id: string; full_name: string; class_id?: string | null };
}

export interface StudentActor {
  ctx: Parameters<typeof canOperate>[0];
  organizationId: string;
  /** The acting user's client, or the client an agent was authenticated with. */
  supabase: SupabaseClient;
  /** Permission check for a caller with no browser cookie. */
  authorize?: (permission: string, module?: string) => Promise<boolean>;
  /** Skip Next.js cache invalidation when running outside a request. */
  revalidate?: () => void;
}

export async function registerStudentForActor(
  input: RegisterStudentInput,
  actor: StudentActor,
): Promise<RegisterStudentResult> {
  const { ctx, organizationId, supabase } = actor;
  const allowed = actor.authorize
    ? await actor.authorize("students.create", "students")
    : await canOperate(ctx, organizationId, "students.create", "students");
  if (!allowed) return { ok: false, error: "You do not have permission to register students." };

  const fullName = String(input.full_name ?? "").trim().slice(0, 160);
  if (!fullName) return { ok: false, error: "The student's full name is required." };

  const email = String(input.email ?? "").trim().toLowerCase();
  if (email && !isValidEmail(email)) return { ok: false, error: "That email address is not valid." };

  const dobRaw = String(input.date_of_birth ?? "").trim();
  const dob = dobRaw ? normalizeDateOfBirth(dobRaw) : null;
  if (dobRaw && !dob) return { ok: false, error: "Date of birth must be a real date (YYYY-MM-DD)." };

  const studentRef = String(input.student_ref ?? "").trim().slice(0, 60) || null;

  // The class must belong to THIS organization and be active. A class id from
  // another school is refused, not silently dropped.
  let cls: { id: string; academic_year_id: string | null } | null = null;
  if (input.class_id) {
    const { data, error } = await supabase
      .from("classes")
      .select("id, academic_year_id, status")
      .eq("id", input.class_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) return { ok: false, error: `That class could not be checked: ${error.message}` };
    if (!data) return { ok: false, error: "That class does not belong to your school." };
    if (data.status !== "active") {
      return { ok: false, error: "That class is archived. Restore it before enrolling students." };
    }
    cls = { id: data.id as string, academic_year_id: (data.academic_year_id as string | null) ?? null };
  }

  if (studentRef) {
    const { data } = await supabase
      .from("students")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("student_ref", studentRef)
      .maybeSingle();
    if (data) return { ok: false, error: `A student with reference "${studentRef}" already exists in your school.` };
  }
  if (email) {
    const { data } = await supabase
      .from("students")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("email", email)
      .maybeSingle();
    if (data) return { ok: false, error: `A student with email "${email}" already exists in your school.` };
  }

  const { data: student, error } = await supabase
    .from("students")
    .insert({
      organization_id: organizationId,
      full_name: fullName,
      email: email || null,
      student_ref: studentRef,
      gender: normalizeGender(String(input.gender ?? "")),
      date_of_birth: dob,
      phone: String(input.phone ?? "").trim().slice(0, 40) || null,
      guardian_name: String(input.guardian_name ?? "").trim().slice(0, 160) || null,
      guardian_contact: String(input.guardian_contact ?? "").trim().slice(0, 120) || null,
      status: "active",
    })
    .select("id, full_name")
    .single();
  if (error || !student) {
    return { ok: false, error: error?.message ?? "The student could not be registered. Please try again." };
  }

  if (cls) {
    const { error: enrollError } = await supabase.from("student_enrollments").insert({
      organization_id: organizationId,
      student_id: student.id,
      class_id: cls.id,
      academic_year_id: cls.academic_year_id,
      status: "active",
    });
    if (enrollError) {
      // A student created but not enrolled is a silent misplacement; the brief
      // forbids it. Undo the insert and report the failure.
      await supabase.from("students").delete().eq("id", student.id).eq("organization_id", organizationId);
      return { ok: false, error: `Enrollment into that class failed; nothing was saved. ${enrollError.message}` };
    }
  }

  await audit(ctx, "student.registered", "students", student.id as string, organizationId, {
    class_id: cls?.id ?? null,
  });
  actor.revalidate?.();

  return {
    ok: true,
    student: { id: student.id as string, full_name: student.full_name as string, class_id: cls?.id ?? null },
  };
}
