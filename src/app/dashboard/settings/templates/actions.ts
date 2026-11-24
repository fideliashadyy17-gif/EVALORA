"use server";

import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function str(formData: FormData, key: string, max: number): string | null {
  const value = String(formData.get(key) ?? "").trim().slice(0, max);
  return value || null;
}

export async function saveTemplate(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/settings/templates");
  const name = str(formData, "name", 160);
  if (!name) redirect("/dashboard/settings/templates?e=name");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim() || null;
  const isDefault = formData.get("is_default") === "on";

  const payload = {
    organization_id: org.id,
    name,
    period: str(formData, "period", 120),
    academic_year: str(formData, "academic_year", 40),
    grade_label: str(formData, "grade_label", 80),
    subject: str(formData, "subject", 120),
    instructions: String(formData.get("instructions") ?? "").slice(0, 4000) || null,
    show_logo: formData.get("show_logo") === "on",
    is_default: isDefault,
    created_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };

  if (isDefault) {
    await supabase.from("exam_paper_templates").update({ is_default: false }).eq("organization_id", org.id).neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  }

  if (id) {
    const { error } = await supabase.from("exam_paper_templates").update(payload).eq("id", id).eq("organization_id", org.id);
    if (error) redirect("/dashboard/settings/templates?e=save");
  } else {
    const { error } = await supabase.from("exam_paper_templates").insert(payload);
    if (error) redirect("/dashboard/settings/templates?e=save");
  }
  revalidatePath("/dashboard/settings/templates");
  redirect("/dashboard/settings/templates?saved=1");
}

export async function deleteTemplate(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/settings/templates");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  await supabase.from("exam_paper_templates").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/dashboard/settings/templates");
  redirect("/dashboard/settings/templates?saved=1");
}
