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

  const payload = {
    organization_id: orgId,
    name,
    code: fstr(formData, "code", 40),
    academic_year_id: fstr(formData, "academic_year_id", 60),
    level_id: fstr(formData, "level_id", 60),
    department_id: fstr(formData, "department_id", 60),
    teacher_id: fstr(formData, "teacher_id", 60),
    capacity: Math.max(1, Math.min(1000, fint(formData, "capacity") ?? 40)),
    room: fstr(formData, "room", 60),
    description: fstr(formData, "description", 500),
    status: String(formData.get("status")) === "archived" ? "archived" : "active",
    updated_at: new Date().toISOString(),
  };

  if (!id) {
    let dup = admin.from("classes").select("id").eq("organization_id", orgId).ilike("name", name!);
    dup = payload.academic_year_id ? dup.eq("academic_year_id", payload.academic_year_id) : dup.is("academic_year_id", null);
    const { data: existing } = await dup.maybeSingle();
    if (existing) redirect(`${dest}&e=duplicate`);
  }

  const { data, error } = id
    ? await admin.from("classes").update(payload).eq("id", id).eq("organization_id", orgId).select("id").single()
    : await admin.from("classes").insert(payload).select("id").single();
  if (error || !data) redirect(`${dest}&e=${error?.code === "23505" ? "code" : "failed"}`);
  await audit(ctx, id ? "class.updated" : "class.created", "classes", data!.id, orgId, { name });
  revalidatePath("/admin/classes");
  redirect(`${dest}&ok=saved`);
}
