"use server";

/**
 * Formula library — teachers create, edit and organize reusable formulas by
 * subject, topic and chapter. The candidate-facing sheet for an examination
 * is a SNAPSHOT saved in exams.settings.formula_sheet (see
 * updateExamFormulaSheet in ../exams/actions.ts), so editing the library
 * later never changes a paper that is already running.
 *
 * Guards: authenticated user, active organization, content-creator role,
 * subject must belong to the same organization (tenant isolation), every
 * write audited. No answer, hint or solution field exists — by design.
 */

import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { audit } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { validateFormulaInput, type FormulaLibraryEntry } from "@/lib/formulaLibrary";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function backWith(error: string): never {
  redirect(`/dashboard/formulas?e=${encodeURIComponent(error)}`);
}

export async function saveFormula(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) {
    redirect("/dashboard/formulas?e=forbidden");
  }

  const id = String(formData.get("id") ?? "");
  const raw = {
    topic: formData.get("topic"),
    chapter: formData.get("chapter"),
    title: formData.get("title"),
    latex: formData.get("latex"),
    note: formData.get("note"),
    subject_id: formData.get("subject_id"),
  };
  const parsed = validateFormulaInput(raw as Record<string, unknown>);
  if (!parsed.ok) backWith(parsed.error);

  const supabase = await createClient();

  // Tenant isolation: when a subject is chosen it must be the org's own.
  if (parsed.value.subject_id) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", parsed.value.subject_id)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!subject) backWith("subject");
  }

  if (id) {
    if (!UUID.test(id)) backWith("id");
    const { error } = await supabase
      .from("formula_library")
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", org.id);
    if (error) backWith("save");
    await audit(ctx, "formula.updated", "formula_library", id, org.id, { title: parsed.value.title });
  } else {
    const { data, error } = await supabase
      .from("formula_library")
      .insert({ ...parsed.value, organization_id: org.id, created_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !data) backWith("save");
    await audit(ctx, "formula.created", "formula_library", data.id, org.id, { title: parsed.value.title });
  }

  revalidatePath("/dashboard/formulas");
  redirect("/dashboard/formulas?ok=saved");
}

export async function deleteFormula(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) {
    redirect("/dashboard/formulas?e=forbidden");
  }
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) backWith("id");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("formula_library")
    .select("id, title")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!row) backWith("missing");

  const { error } = await supabase.from("formula_library").delete().eq("id", id).eq("organization_id", org.id);
  if (error) backWith("save");
  await audit(ctx, "formula.deleted", "formula_library", id, org.id, { title: row.title });
  revalidatePath("/dashboard/formulas");
  redirect("/dashboard/formulas?ok=deleted");
}

/** Load the whole library for one organization (server components only). */
export async function loadFormulaLibrary(orgId: string): Promise<FormulaLibraryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("formula_library")
    .select("*")
    .eq("organization_id", orgId)
    .order("topic")
    .order("chapter")
    .order("title");
  return (data ?? []) as FormulaLibraryEntry[];
}
