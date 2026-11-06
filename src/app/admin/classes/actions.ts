"use server";

import { audit, fint, fstr, requireSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Global (Super Admin) class management across organizations. */
export async function saveGlobalClass(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id") ?? "");
  const id = fstr(formData, "id", 60);
  const name = fstr(formData, "name", 120);
  const dest = `/admin/classes?org=${orgId}`;
  if (!orgId) redirect("/admin/classes?e=organization");
  if (!name) redirect(`${dest}&e=name`);

  // Referenced year/level/department must belong to the same school.
  const refs: [string, string | null][] = [
    ["academic_years", fstr(formData, "academic_year_id", 60)],
    ["education_levels", fstr(formData, "level_id", 60)],
    ["departments", fstr(formData, "department_id", 60)],
  ];
  for (const [table, refId] of refs) {
    if (!refId) continue;
    const { data } = await admin.from(table).select("id").eq("id", refId).eq("organization_id", orgId).maybeSingle();
    if (!data) redirect(`${dest}&e=reference`);
  }

  const bandRaw = String(formData.get("level_band") ?? "");
  const payload = {
    organization_id: orgId,
    name,
    code: fstr(formData, "code", 40),
    academic_year_id: fstr(formData, "academic_year_id", 60),
    level_id: fstr(formData, "level_id", 60),
    department_id: fstr(formData, "department_id", 60),
    teacher_id: fstr(formData, "teacher_id", 60),
    level_band: ["early_years_primary", "myp_secondary", "advanced_secondary", "other"].includes(bandRaw) ? bandRaw : null,
    grade_order: fint(formData, "grade_order"),
    capacity: Math.max(1, Math.min(1000, fint(formData, "capacity") ?? 40)),
    room: fstr(formData, "room", 60),
    description: fstr(formData, "description", 500),
    status: String(formData.get("status")) === "archived" ? "archived" : "active",
    updated_at: new Date().toISOString(),
  };

  let dup = admin.from("classes").select("id").eq("organization_id", orgId).ilike("name", name!);
  dup = payload.academic_year_id ? dup.eq("academic_year_id", payload.academic_year_id) : dup.is("academic_year_id", null);
  if (id) dup = dup.neq("id", id);
  const { data: existing, error: duplicateError } = await dup.limit(1).maybeSingle();
  if (duplicateError) redirect(`${dest}&e=failed`);
  if (existing) redirect(`${dest}&e=duplicate`);

  const { data, error } = id
    ? await admin.from("classes").update(payload).eq("id", id).eq("organization_id", orgId).select("id").single()
    : await admin.from("classes").insert(payload).select("id").single();
  if (error || !data) redirect(`${dest}&e=${error?.code === "23505" ? "code" : "failed"}`);

  // The RPC validates all selected IDs and replaces both association sets in
  // one transaction. Class details above are a separate write; surface that
  // distinction if the association operation fails.
  if (formData.get("associations_present") === "1") {
    const subjectIds = formData.getAll("subject_ids").map(String).filter(Boolean);
    const programmes = formData.getAll("programme_ids").map(String).filter(Boolean).map((id) => ({
      id,
      course_label: fstr(formData, `course_${id}`, 120),
      needs_review: formData.get(`review_${id}`) === "1",
    }));
    const { error: associationError } = await admin.rpc("replace_class_associations", {
      p_class_id: data!.id, p_organization_id: orgId, p_subject_ids: subjectIds, p_programmes: programmes,
    });
    if (associationError) {
      revalidatePath("/admin/classes");
      redirect(`${dest}&e=associations_failed`);
    }
  }
  await audit(ctx, id ? "class.updated" : "class.created", "classes", data!.id, orgId, { name });
  revalidatePath("/admin/classes");
  redirect(`${dest}&ok=saved`);
}
