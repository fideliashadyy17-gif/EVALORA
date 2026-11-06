"use server";

import { audit, fday, fint, FLASH_COOKIE, fstr, requireSuperAdmin } from "@/lib/admin";
import { isEmail, parseCsvRecords } from "@/lib/csv";
import { createAdminClient } from "@/lib/supabase/server";
import { genCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Admin = ReturnType<typeof createAdminClient>;

function backTo(orgId: string, tab: string, suffix: string): never {
  redirect(`/admin/organizations/${orgId}?tab=${tab}&${suffix}`);
}

/* ── Academic structure ─────────────────────────────────────────────── */

export async function saveAcademicYear(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const id = fstr(formData, "id", 60);
  const name = fstr(formData, "name", 80);
  if (!name) backTo(orgId, "academics", "e=name");
  const isCurrent = formData.get("is_current") === "on";
  if (isCurrent) {
    await admin.from("academic_years").update({ is_current: false }).eq("organization_id", orgId).neq("id", id ?? "");
  }
  const payload = {
    organization_id: orgId, name,
    starts_on: fday(formData, "starts_on"), ends_on: fday(formData, "ends_on"),
    is_current: isCurrent,
  };
  if (id) {
    await admin.from("academic_years").update(payload).eq("id", id);
    await audit(ctx, "academic_year.updated", "academic_years", id, orgId);
  } else {
    const { data } = await admin.from("academic_years").insert(payload).select("id").single();
    if (data) await audit(ctx, "academic_year.created", "academic_years", data.id, orgId);
  }
  revalidatePath(`/admin/organizations/${orgId}`);
  backTo(orgId, "academics", "ok=year_saved");
}

export async function deleteAcademicYear(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const id = String(formData.get("id"));
  await admin.from("academic_years").delete().eq("id", id);
  await audit(ctx, "academic_year.deleted", "academic_years", id, orgId);
  backTo(orgId, "academics", "ok=year_deleted");
}

const STRUCTURE_TABLES: Record<string, { table: string; entity: string }> = {
  level: { table: "education_levels", entity: "education_levels" },
  department: { table: "departments", entity: "departments" },
  subject: { table: "subjects", entity: "subjects" },
};

export async function saveStructureItem(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const kind = String(formData.get("kind"));
  const cfg = STRUCTURE_TABLES[kind];
  if (!cfg) backTo(orgId, "academics", "e=kind");
  const id = fstr(formData, "id", 60);
  const name = fstr(formData, "name", 120);
  if (!name) backTo(orgId, "academics", "e=name");
  const payload: Record<string, unknown> = { organization_id: orgId, name };
  if (kind === "level") payload.sort = fint(formData, "sort") ?? 0;
  if (kind === "subject") {
    payload.code = fstr(formData, "code", 30);
    payload.department_id = fstr(formData, "department_id", 60);
  }
  if (id) {
    await admin.from(cfg!.table).update(payload).eq("id", id);
    await audit(ctx, `${cfg!.entity}.updated`, cfg!.entity, id!, orgId);
  } else {
    const { data } = await admin.from(cfg!.table).insert(payload).select("id").single();
    if (data) await audit(ctx, `${cfg!.entity}.created`, cfg!.entity, data.id, orgId);
  }
  revalidatePath(`/admin/organizations/${orgId}`);
  backTo(orgId, "academics", "ok=saved");
}

export async function deleteStructureItem(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const cfg = STRUCTURE_TABLES[String(formData.get("kind"))];
  const id = String(formData.get("id"));
  if (!cfg) backTo(orgId, "academics", "e=kind");
  await admin.from(cfg!.table).delete().eq("id", id);
  await audit(ctx, `${cfg!.entity}.deleted`, cfg!.entity, id, orgId);
  backTo(orgId, "academics", "ok=deleted");
}

export async function saveClass(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const id = fstr(formData, "id", 60);
  const name = fstr(formData, "name", 120);
  if (!name) backTo(orgId, "academics", "e=name");
  const payload: Record<string, unknown> = {
    organization_id: orgId,
    name,
    academic_year_id: fstr(formData, "academic_year_id", 60),
    level_id: fstr(formData, "level_id", 60),
    teacher_id: fstr(formData, "teacher_id", 60),
    capacity: fint(formData, "capacity"),
    room: fstr(formData, "room", 60),
    updated_at: new Date().toISOString(),
  };
  // Newer class fields (only when the submitting form provides them).
  if (formData.has("code")) payload.code = fstr(formData, "code", 40);
  if (formData.has("department_id")) payload.department_id = fstr(formData, "department_id", 60);
  if (formData.has("description")) payload.description = fstr(formData, "description", 500);
  if (formData.has("status")) payload.status = String(formData.get("status")) === "archived" ? "archived" : "active";
  if (id) {
    await admin.from("classes").update(payload).eq("id", id).eq("organization_id", orgId);
    await audit(ctx, "class.updated", "classes", id, orgId);
  } else {
    const { data } = await admin.from("classes").insert(payload).select("id").single();
    if (data) await audit(ctx, "class.created", "classes", data.id, orgId);
  }
  revalidatePath(`/admin/organizations/${orgId}`);
  backTo(orgId, "academics", "ok=class_saved");
}

export async function deleteClass(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const id = String(formData.get("id"));
  const back = fstr(formData, "back", 300);
  // Safe deletion only: classes with enrollment history are archived.
  const { count } = await admin.from("student_enrollments")
    .select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("class_id", id);
  if ((count ?? 0) > 0) {
    await admin.from("classes").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", orgId);
    await audit(ctx, "class.archived", "classes", id, orgId, { reason: "delete_blocked_enrollments" });
    if (back) redirect(`${back}${back.includes("?") ? "&" : "?"}ok=class_archived`);
    backTo(orgId, "academics", "ok=class_archived");
  }
  await admin.from("classes").delete().eq("id", id).eq("organization_id", orgId);
  await audit(ctx, "class.deleted", "classes", id, orgId);
  if (back) redirect(`${back}${back.includes("?") ? "&" : "?"}ok=class_deleted`);
  backTo(orgId, "academics", "ok=class_deleted");
}

export async function archiveClass(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const id = String(formData.get("id"));
  const restore = String(formData.get("op")) === "restore";
  const back = fstr(formData, "back", 300);
  await admin.from("classes")
    .update({ status: restore ? "active" : "archived", updated_at: new Date().toISOString() })
    .eq("id", id).eq("organization_id", orgId);
  await audit(ctx, restore ? "class.restored" : "class.archived", "classes", id, orgId);
  if (back) redirect(`${back}${back.includes("?") ? "&" : "?"}ok=class_updated`);
  backTo(orgId, "academics", "ok=class_updated");
}

/* ── Students ───────────────────────────────────────────────────────── */

const STUDENT_STATUSES = ["active", "suspended", "graduated", "withdrawn"];

async function currentYearId(admin: Admin, orgId: string): Promise<string | null> {
  const { data } = await admin
    .from("academic_years")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_current", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function saveStudent(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const back = String(formData.get("back") ?? "");
  const id = fstr(formData, "id", 60);
  const fullName = fstr(formData, "full_name", 160);
  const fail = (e: string): never =>
    redirect(back.startsWith("/admin/") ? `${back}${back.includes("?") ? "&" : "?"}e=${e}` : `/admin/organizations/${orgId}?tab=students&e=${e}`);
  if (!fullName) fail("name");
  const email = fstr(formData, "email", 200)?.toLowerCase() ?? null;
  if (email && !isEmail(email)) fail("email");
  const statusRaw = String(formData.get("status") ?? "active");

  const payload = {
    organization_id: orgId,
    full_name: fullName,
    email,
    student_ref: fstr(formData, "student_ref", 60),
    gender: fstr(formData, "gender", 20),
    date_of_birth: fday(formData, "date_of_birth"),
    guardian_name: fstr(formData, "guardian_name", 160),
    guardian_contact: fstr(formData, "guardian_contact", 120),
    status: STUDENT_STATUSES.includes(statusRaw) ? statusRaw : "active",
    notes: fstr(formData, "notes", 1000),
    updated_at: new Date().toISOString(),
  };

  let studentId = id;
  if (id) {
    await admin.from("students").update(payload).eq("id", id);
    await audit(ctx, "student.updated", "students", id, orgId);
  } else {
    const { data, error } = await admin.from("students").insert(payload).select("id").single();
    if (error || !data) fail("failed");
    studentId = data!.id;
    await audit(ctx, "student.registered", "students", studentId!, orgId, { name: fullName });
  }

  const classId = fstr(formData, "class_id", 60);
  if (classId && studentId) {
    // The class must belong to THIS organization — never trust the form.
    const { data: cls } = await admin.from("classes")
      .select("id, academic_year_id, status").eq("id", classId).eq("organization_id", orgId).maybeSingle();
    if (!cls) fail("class_org");
    await admin.from("student_enrollments").upsert(
      {
        organization_id: orgId, student_id: studentId, class_id: classId,
        academic_year_id: cls!.academic_year_id ?? await currentYearId(admin, orgId), status: "active",
      },
      { onConflict: "student_id,class_id" },
    );
  }
  revalidatePath(`/admin/organizations/${orgId}`);
  redirect(back.startsWith("/admin/") ? `${back}${back.includes("?") ? "&" : "?"}ok=student_saved` : `/admin/organizations/${orgId}?tab=students&ok=student_saved`);
}

export async function studentOp(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  // Row buttons inside a bulk form encode "op:id:extra" in row_op.
  const rowOp = String(formData.get("row_op") ?? "");
  const [rOp, rId, rExtra] = rowOp ? rowOp.split(":") : [null, null, null];
  const id = rId ?? String(formData.get("id"));
  const op = rOp ?? String(formData.get("op"));
  const back = String(formData.get("back") ?? "");
  const dest = (s: string) =>
    back.startsWith("/admin/") ? `${back}${back.includes("?") ? "&" : "?"}${s}` : `/admin/organizations/${orgId}?tab=students&${s}`;

  if (op === "status") {
    const status = rExtra ?? String(formData.get("status"));
    if (!STUDENT_STATUSES.includes(status)) redirect(dest("e=status"));
    await admin.from("students").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    await audit(ctx, `student.${status}`, "students", id, orgId);
  } else if (op === "delete") {
    if (!rowOp && formData.get("confirm") !== "on") redirect(dest("e=confirm"));
    await admin.from("students").delete().eq("id", id);
    await audit(ctx, "student.deleted", "students", id, orgId);
  } else if (op === "enroll") {
    const classId = fstr(formData, "class_id", 60);
    if (!classId) redirect(dest("e=class"));
    await admin.from("student_enrollments").upsert(
      { organization_id: orgId, student_id: id, class_id: classId, academic_year_id: await currentYearId(admin, orgId), status: "active" },
      { onConflict: "student_id,class_id" },
    );
    await audit(ctx, "student.enrolled", "student_enrollments", id, orgId, { class_id: classId });
  } else if (op === "move") {
    const classId = fstr(formData, "class_id", 60);
    if (!classId) redirect(dest("e=class"));
    await admin.from("student_enrollments").update({ status: "withdrawn" }).eq("student_id", id).eq("status", "active");
    await admin.from("student_enrollments").upsert(
      { organization_id: orgId, student_id: id, class_id: classId, academic_year_id: await currentYearId(admin, orgId), status: "active" },
      { onConflict: "student_id,class_id" },
    );
    await audit(ctx, "student.moved_class", "student_enrollments", id, orgId, { class_id: classId });
  } else if (op === "unenroll") {
    const enrollmentId = String(formData.get("enrollment_id"));
    await admin.from("student_enrollments").update({ status: "withdrawn" }).eq("id", enrollmentId);
    await audit(ctx, "student.unenrolled", "student_enrollments", enrollmentId, orgId);
  }
  revalidatePath(`/admin/organizations/${orgId}`);
  redirect(dest("ok=student_updated"));
}

export async function bulkStudentOp(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const back = String(formData.get("back") ?? `/admin/organizations/${orgId}?tab=students`);
  const ids = formData.getAll("ids").map(String).filter(Boolean).slice(0, 500);
  const op = String(formData.get("op"));
  if (ids.length === 0) redirect(`${back}${back.includes("?") ? "&" : "?"}e=none_selected`);

  if (op === "status") {
    const status = String(formData.get("status"));
    if (!STUDENT_STATUSES.includes(status)) redirect(`${back}&e=status`);
    await admin.from("students").update({ status, updated_at: new Date().toISOString() }).in("id", ids);
    await audit(ctx, "student.bulk_status", "students", orgId, orgId, { count: ids.length, status });
  } else if (op === "enroll") {
    const classId = fstr(formData, "class_id", 60);
    if (!classId) redirect(`${back}&e=class`);
    const yearId = await currentYearId(admin, orgId);
    await admin.from("student_enrollments").upsert(
      ids.map((student_id) => ({ organization_id: orgId, student_id, class_id: classId, academic_year_id: yearId, status: "active" })),
      { onConflict: "student_id,class_id" },
    );
    await audit(ctx, "student.bulk_enrolled", "student_enrollments", orgId, orgId, { count: ids.length, class_id: classId });
  }
  revalidatePath(`/admin/organizations/${orgId}`);
  redirect(`${back}${back.includes("?") ? "&" : "?"}ok=bulk_done`);
}

export async function importStudents(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const back = String(formData.get("back") ?? `/admin/organizations/${orgId}?tab=students`);
  const csvText = String(formData.get("csv") ?? "");
  const classId = fstr(formData, "class_id", 60);
  const sep = back.includes("?") ? "&" : "?";
  if (!csvText.trim()) redirect(`${back}${sep}e=empty_csv`);

  const { records } = parseCsvRecords(csvText);
  if (records.length === 0) redirect(`${back}${sep}e=empty_csv`);
  if (records.length > 1000) redirect(`${back}${sep}e=too_many`);

  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];
  records.forEach((r, i) => {
    const line = i + 2;
    const name = (r.full_name || r.name || "").trim();
    if (!name) return errors.push(`Row ${line}: missing full_name`);
    const email = (r.email || "").trim().toLowerCase();
    if (email && !isEmail(email)) return errors.push(`Row ${line}: invalid email "${email}"`);
    const dob = (r.date_of_birth || r.dob || "").trim();
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return errors.push(`Row ${line}: date_of_birth must be YYYY-MM-DD`);
    rows.push({
      organization_id: orgId,
      full_name: name.slice(0, 160),
      email: email || null,
      student_ref: (r.student_ref || r.ref || "").trim() || null,
      gender: (r.gender || "").trim() || null,
      date_of_birth: dob || null,
      guardian_name: (r.guardian_name || "").trim() || null,
      guardian_contact: (r.guardian_contact || r.guardian_phone || "").trim() || null,
      status: "active",
    });
    return undefined;
  });

  let inserted = 0;
  if (rows.length > 0) {
    const { data, error } = await admin.from("students").insert(rows).select("id");
    if (error) errors.push(`Database error: ${error.message}`);
    else {
      inserted = data?.length ?? 0;
      if (classId && data) {
        const yearId = await currentYearId(admin, orgId);
        await admin.from("student_enrollments").upsert(
          data.map((s) => ({ organization_id: orgId, student_id: s.id, class_id: classId, academic_year_id: yearId, status: "active" })),
          { onConflict: "student_id,class_id" },
        );
      }
    }
  }
  await audit(ctx, "student.imported", "students", orgId, orgId, { inserted, failed: errors.length });

  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(
    `Student import: ${inserted} registered, ${errors.length} row(s) skipped.${errors.length ? " " + errors.slice(0, 12).join(" · ") : ""}`,
  ), { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 180 });

  revalidatePath(`/admin/organizations/${orgId}`);
  redirect(`${back}${sep}ok=import_done`);
}

/** Create (or reset) a login account for a roster student. */
export async function createStudentLogin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const studentId = String(formData.get("id") ?? formData.get("student_btn") ?? "");
  const back = String(formData.get("back") ?? `/admin/organizations/${orgId}?tab=students`);
  const sep = back.includes("?") ? "&" : "?";

  const { data: student } = await admin.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!student) redirect(`${back}${sep}e=student`);
  if (!student!.email) redirect(`${back}${sep}e=student_email`);

  const store = await cookies();
  if (student!.user_id) {
    await admin.auth.resetPasswordForEmail(student!.email);
    await audit(ctx, "student.access_reset", "students", studentId, orgId);
    store.set(FLASH_COOKIE, encodeURIComponent(`Password reset email sent to ${student!.email}.`),
      { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 120 });
    redirect(`${back}${sep}ok=reset_sent`);
  }

  const tempPassword = `Ev!${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}a9`;
  const { data, error } = await admin.auth.admin.createUser({
    email: student!.email, password: tempPassword, email_confirm: true,
    user_metadata: { full_name: student!.full_name },
  });
  if (error || !data?.user) {
    // Account may already exist under another roster entry — link it.
    const { data: prof } = await admin.from("profiles").select("id").eq("email", student!.email).maybeSingle();
    if (!prof) redirect(`${back}${sep}e=login_failed`);
    await admin.from("students").update({ user_id: prof!.id }).eq("id", studentId);
    await admin.from("organization_members").upsert(
      { organization_id: orgId, user_id: prof!.id, role: "student", status: "active" },
      { onConflict: "organization_id,user_id" },
    );
    await audit(ctx, "student.account_linked", "students", studentId, orgId);
    redirect(`${back}${sep}ok=account_linked`);
  }

  await admin.from("students").update({ user_id: data!.user.id }).eq("id", studentId);
  await admin.from("organization_members").upsert(
    { organization_id: orgId, user_id: data!.user.id, role: "student", status: "active" },
    { onConflict: "organization_id,user_id" },
  );
  await audit(ctx, "student.account_created", "students", studentId, orgId);
  store.set(FLASH_COOKIE, encodeURIComponent(
    `Login for ${student!.full_name} (${student!.email}) — temporary password: ${tempPassword} — shown once; ask the student to change it after signing in.`,
  ), { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 180 });
  redirect(`${back}${sep}ok=account_created`);
}

/** Register an entire class's active students as examination candidates. */
export async function registerClassForExam(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const examId = String(formData.get("exam_id"));
  const classId = String(formData.get("class_id"));
  const back = String(formData.get("back") ?? "/admin/examinations");
  const sep = back.includes("?") ? "&" : "?";

  const { data: exam } = await admin.from("exams").select("id, organization_id, title").eq("id", examId).maybeSingle();
  if (!exam) redirect(`${back}${sep}e=exam`);

  const { data: enrollments } = await admin
    .from("student_enrollments")
    .select("students(id, full_name, email, student_ref, status)")
    .eq("class_id", classId)
    .eq("status", "active");
  const students = (enrollments ?? [])
    .map((e) => e.students as unknown as { id: string; full_name: string; email: string | null; student_ref: string | null; status: string } | null)
    .filter((s): s is NonNullable<typeof s> => Boolean(s && s.status === "active"));

  const { data: existing } = await admin.from("exam_candidates").select("candidate_ref, email").eq("exam_id", examId);
  const taken = new Set((existing ?? []).map((c) => `${c.candidate_ref ?? ""}|${c.email ?? ""}`));
  const toAdd = students
    .filter((s) => !taken.has(`${s.student_ref ?? ""}|${s.email ?? ""}`))
    .map((s) => ({
      exam_id: examId,
      full_name: s.full_name,
      email: s.email,
      candidate_ref: s.student_ref,
      access_code: genCode(10),
    }));

  if (toAdd.length > 0) await admin.from("exam_candidates").insert(toAdd);
  await audit(ctx, "exam.candidates_registered_from_class", "exams", examId, exam!.organization_id, {
    class_id: classId, added: toAdd.length, skipped: students.length - toAdd.length,
  });
  redirect(`${back}${sep}ok=candidates_added`);
}
