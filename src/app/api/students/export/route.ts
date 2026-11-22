import { activeOrg, can, CREATOR_ROLES, getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx || ctx.profile.status !== "active") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const org = activeOrg(ctx);
  if (!org) {
    return NextResponse.json({ error: "No active workspace." }, { status: 403 });
  }
  if (!can(ctx, org.id, CREATOR_ROLES)) {
    return NextResponse.json({ error: "Not authorized to export student registers." }, { status: 403 });
  }

  const url = new URL(request.url);
  const classFilter = url.searchParams.get("class");
  const statusFilter = url.searchParams.get("status");

  const supabase = await createClient();

  let classStudentIds: string[] | null = null;
  if (classFilter) {
    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("organization_id", org.id)
      .eq("class_id", classFilter)
      .eq("status", "active");
    classStudentIds = (enrollments ?? []).map((e) => e.student_id);
    if (classStudentIds.length === 0) {
      const emptyCsv = toCsv([["Full Name", "Student Reference", "Email", "Class", "Status", "Gender", "Date of Birth", "Guardian Name", "Guardian Contact", "Phone", "Portal Login", "Created At"]]);
      return new NextResponse(`\uFEFF${emptyCsv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${org.slug}-students-empty.csv"`,
        },
      });
    }
  }

  let query = supabase
    .from("students")
    .select("id, full_name, email, student_ref, date_of_birth, gender, guardian_name, guardian_contact, phone, status, user_id, created_at")
    .eq("organization_id", org.id)
    .order("full_name");

  if (statusFilter) query = query.eq("status", statusFilter);
  if (classStudentIds) query = query.in("id", classStudentIds);

  const [{ data: students }, { data: classes }, { data: allEnrollments }] = await Promise.all([
    query,
    supabase.from("classes").select("id, name").eq("organization_id", org.id),
    supabase.from("student_enrollments").select("student_id, class_id").eq("organization_id", org.id).eq("status", "active"),
  ]);

  const classNameMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const enrollmentMap = new Map((allEnrollments ?? []).map((e) => [e.student_id, e.class_id]));

  const csv = toCsv([
    ["Full Name", "Student Reference", "Email", "Class", "Status", "Gender", "Date of Birth", "Guardian Name", "Guardian Contact", "Phone", "Portal Login", "Created At"],
    ...(students ?? []).map((s) => [
      s.full_name,
      s.student_ref ?? "",
      s.email ?? "",
      enrollmentMap.has(s.id) ? classNameMap.get(enrollmentMap.get(s.id)!) ?? "" : "Not enrolled",
      s.status,
      s.gender ?? "",
      s.date_of_birth ?? "",
      s.guardian_name ?? "",
      s.guardian_contact ?? "",
      s.phone ?? "",
      s.user_id ? "Linked" : "None",
      s.created_at ?? "",
    ]),
  ]);

  await supabase.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: org.id,
    action: "students.register_exported",
    entity: "students",
    entity_id: org.id,
    metadata: {
      total_exported: students?.length ?? 0,
      class_filter: classFilter,
      status_filter: statusFilter,
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-students-${stamp}.csv"`,
      "Cache-Control": "private, no-cache, no-store",
    },
  });
}
