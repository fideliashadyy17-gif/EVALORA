"use server";

import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { getCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function guardBuilder(permission: string) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, permission, "paper_builder"))) redirect("/dashboard/paper-builder");
  const supabase = await createClient();
  const { capabilities } = await getCapabilities(supabase, ctx, org.id);
  if (!capabilities.question_paper_builder) redirect("/dashboard/paper-builder");
  return { ctx, org, supabase };
}

export async function duplicatePaper(formData: FormData) {
  const { ctx, org, supabase } = await guardBuilder("paper_builder.create");
  const id = String(formData.get("id") ?? "");
  const { data: src } = await supabase.from("quizzes").select("*").eq("id", id).eq("organization_id", org.id).single();
  if (!src) redirect("/dashboard/paper-builder");
  const { data: copy } = await supabase
    .from("quizzes")
    .insert({
      organization_id: org.id,
      title: `${src.title} (copy)`,
      description: src.description,
      status: "draft",
      settings: src.settings,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (copy) {
    const { data: qq } = await supabase.from("quiz_questions").select("*").eq("quiz_id", id).order("position");
    if (qq?.length)
      await supabase.from("quiz_questions").insert(
        qq.map((r) => ({ quiz_id: copy.id, question_id: r.question_id, position: r.position, points: r.points, time_limit_seconds: r.time_limit_seconds })),
      );
  }
  revalidatePath("/dashboard/paper-builder");
  redirect(copy ? `/dashboard/paper-builder/${copy.id}` : "/dashboard/paper-builder");
}

export async function publishPaper(formData: FormData) {
  const { org, supabase } = await guardBuilder("paper_builder.publish");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["draft", "published", "archived"].includes(status)) redirect("/dashboard/paper-builder");
  await supabase.from("quizzes").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", org.id);
  revalidatePath("/dashboard/paper-builder");
  redirect("/dashboard/paper-builder");
}

export async function archivePaper(formData: FormData) {
  const { org, supabase } = await guardBuilder("paper_builder.delete");
  const id = String(formData.get("id") ?? "");
  await supabase.from("quizzes").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", org.id);
  revalidatePath("/dashboard/paper-builder");
  redirect("/dashboard/paper-builder");
}
