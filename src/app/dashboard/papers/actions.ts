"use server";

import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { getEntitlementFor, withinLimit } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const PaperSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional().default(""),
  instructions: z.string().max(4000).optional().default(""),
  status: z.enum(["draft", "published", "archived"]),
  class_id: z.string().uuid().nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
  programme: z.string().max(120).optional().default(""),
  curriculum: z.string().max(120).optional().default(""),
  max_marks: z.number().finite().min(0).max(100000),
  randomize_questions: z.boolean().default(false),
  randomize_options: z.boolean().default(false),
  sections: z.array(z.object({ id: z.string().min(1).max(60), title: z.string().trim().min(1).max(100), question_ids: z.array(z.string().uuid()) })).max(30),
  items: z.array(z.object({ question_id: z.string().uuid(), points: z.number().finite().min(0).max(100000), section_id: z.string().min(1).max(60) })).max(500),
});

async function authorizedPaperWorkspace() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) return null;
  const supabase = await createClient();
  if (!(await hasCapability(supabase, ctx, org.id, "examinations")) || !(await hasCapability(supabase, ctx, org.id, "quiz_management"))) return null;
  return { ctx, org, supabase };
}

async function paperQuotaError(ctx: Awaited<ReturnType<typeof requireUser>>, orgId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const ent = await getEntitlementFor(supabase, ctx, orgId);
  const { count, error } = await supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  if (error || count === null) return "Current paper usage could not be confirmed. Please retry.";
  return withinLimit(ent.limits.max_quizzes, count) ? null : `Your ${ent.planName} plan allows ${ent.limits.max_quizzes} quizzes/papers. Upgrade in Billing to add more.`;
}

/** Create/edit reusable paper resources using EVALORA's existing quiz/question engine. */
export async function savePaper(raw: unknown) {
  const auth = await authorizedPaperWorkspace();
  if (!auth) return { error: "You do not have permission or this module is not included in your workspace plan." };
  const parsed = PaperSchema.safeParse(raw);
  if (!parsed.success) return { error: "Check the paper details, sections and question marks." };
  const p = parsed.data;
  const { ctx, org, supabase } = auth;

  if (p.class_id) {
    const { data } = await supabase.from("classes").select("id").eq("id", p.class_id).eq("organization_id", org.id).maybeSingle();
    if (!data) return { error: "The selected class does not belong to this organization." };
  }
  if (p.subject_id) {
    const { data } = await supabase.from("subjects").select("id").eq("id", p.subject_id).eq("organization_id", org.id).maybeSingle();
    if (!data) return { error: "The selected subject does not belong to this organization." };
  }
  if (p.items.length === 0 && p.status === "published") return { error: "Add at least one question before publishing." };
  if (new Set(p.items.map((i) => i.question_id)).size !== p.items.length) return { error: "A question can only appear once in a paper." };
  const sectionIds = new Set(p.sections.map((s) => s.id));
  if (p.items.some((i) => !sectionIds.has(i.section_id))) return { error: "Every question must belong to a section." };
  const orderedFromSections = p.sections.flatMap((s) => s.question_ids);
  if (orderedFromSections.length !== p.items.length || new Set(orderedFromSections).size !== p.items.length || p.items.some((i) => !orderedFromSections.includes(i.question_id)))
    return { error: "The section question order is inconsistent. Please review the paper." };

  const questionIds = p.items.map((i) => i.question_id);
  if (questionIds.length) {
    const { data: questions, error } = await supabase.from("questions").select("id, status").eq("organization_id", org.id).in("id", questionIds);
    if (error || questions?.length !== questionIds.length) return { error: "One or more selected questions are unavailable in this organization." };
    if (p.status === "published" && questions.some((q) => q.status !== "published")) return { error: "Publish each question in the Question Bank before publishing this paper." };
  }

  if (!p.id) {
    const quotaError = await paperQuotaError(ctx, org.id, supabase);
    if (quotaError) return { error: quotaError };
  }
  const { data: prior } = p.id
    ? await supabase.from("quizzes").select("id, settings").eq("id", p.id).eq("organization_id", org.id).maybeSingle()
    : { data: null };
  if (p.id && !prior) return { error: "This paper does not belong to the active organization." };
  if (p.id) {
    // Never change a paper already referenced by an examination or a live session.
    // Duplicate it first; this preserves past exam composition and live state.
    const [{ count: examCount, error: examError }, { count: sessionCount, error: sessionError }] = await Promise.all([
      supabase.from("exams").select("id", { count: "exact", head: true }).eq("quiz_id", p.id),
      supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("quiz_id", p.id),
    ]);
    if (examError || sessionError) return { error: "Could not verify paper usage safely. Please retry." };
    if ((examCount ?? 0) > 0 || (sessionCount ?? 0) > 0) return { error: "This paper is attached to an examination or live session and is protected from edits. Duplicate it to make a new version." };
  }

  const settings = {
    ...((prior?.settings && typeof prior.settings === "object" && !Array.isArray(prior.settings)) ? prior.settings as Record<string, unknown> : {}),
    randomize_questions: p.randomize_questions,
    randomize_options: p.randomize_options,
    paper_builder: {
      version: 1,
      class_id: p.class_id ?? null,
      subject_id: p.subject_id ?? null,
      programme: p.programme.trim() || null,
      curriculum: p.curriculum.trim() || null,
      instructions: p.instructions.trim() || null,
      max_marks: p.max_marks,
      sections: p.sections.map((s) => ({ id: s.id, title: s.title, question_ids: s.question_ids })),
    },
  };
  const payload = { organization_id: org.id, title: p.title, description: p.description.trim() || null, status: p.status, settings, created_by: ctx.user.id, updated_at: new Date().toISOString() };
  let paperId = p.id;
  if (paperId) {
    const { error } = await supabase.from("quizzes").update(payload).eq("id", paperId).eq("organization_id", org.id);
    if (error) return { error: "Could not save paper details." };
    const { error: removeError } = await supabase.from("quiz_questions").delete().eq("quiz_id", paperId);
    if (removeError) return { error: "Paper details were saved, but question links could not be updated. Reload before retrying." };
  } else {
    const { data, error } = await supabase.from("quizzes").insert(payload).select("id").single();
    if (error || !data) return { error: "Could not create the question paper." };
    paperId = data.id;
  }
  const questionMap = new Map(p.items.map((item) => [item.question_id, item]));
  const orderedIds = p.sections.flatMap((section) => section.question_ids);
  if (orderedIds.length) {
    const { error } = await supabase.from("quiz_questions").insert(orderedIds.map((question_id, position) => ({
      quiz_id: paperId!, question_id, position, points: questionMap.get(question_id)!.points,
    })));
    if (error) return { error: "The paper metadata was saved, but its question list could not be confirmed. Please reload and review before continuing." };
  }

  revalidatePath("/dashboard/papers");
  revalidatePath("/dashboard/quizzes");
  revalidatePath("/dashboard/exams/new");
  return { ok: true, id: paperId };
}

export async function duplicatePaper(formData: FormData) {
  const auth = await authorizedPaperWorkspace();
  if (!auth) redirect("/dashboard/papers?e=permission");
  const id = String(formData.get("id") ?? "");
  const { data: source } = await auth.supabase.from("quizzes").select("*").eq("id", id).eq("organization_id", auth.org.id).maybeSingle();
  if (!source) redirect("/dashboard/papers");
  if (await paperQuotaError(auth.ctx, auth.org.id, auth.supabase)) redirect("/dashboard/papers?e=limit");
  const { data: copy, error } = await auth.supabase.from("quizzes").insert({
    organization_id: auth.org.id,
    title: `${source.title} (copy)`.slice(0, 160),
    description: source.description,
    status: "draft",
    settings: source.settings,
    created_by: auth.ctx.user.id,
  }).select("id").single();
  if (error || !copy) redirect("/dashboard/papers?e=duplicate");
  const { data: links, error: linkError } = await auth.supabase.from("quiz_questions").select("question_id,position,points,time_limit_seconds").eq("quiz_id", id).order("position");
  if (linkError) redirect("/dashboard/papers?e=duplicate");
  if (links?.length) {
    const { error: insertError } = await auth.supabase.from("quiz_questions").insert(links.map((q) => ({ ...q, quiz_id: copy.id })));
    if (insertError) redirect("/dashboard/papers?e=duplicate");
  }
  revalidatePath("/dashboard/papers");
  redirect(`/dashboard/papers/${copy.id}`);
}

export async function setPaperStatus(formData: FormData) {
  const auth = await authorizedPaperWorkspace();
  if (!auth) redirect("/dashboard/papers?e=permission");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["published", "archived"].includes(status)) redirect("/dashboard/papers");
  const { data: quiz } = await auth.supabase.from("quizzes").select("id,status").eq("id", id).eq("organization_id", auth.org.id).maybeSingle();
  if (!quiz) redirect("/dashboard/papers");
  const { count, error } = await auth.supabase.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", id);
  if (status === "published" && (error || !count)) redirect(`/dashboard/papers/${id}?e=empty`);
  // Status transitions are intentionally disallowed on papers already linked to exams.
  const [{ count: attached, error: attachedError }, { count: sessions, error: sessionError }] = await Promise.all([
    auth.supabase.from("exams").select("id", { count: "exact", head: true }).eq("quiz_id", id),
    auth.supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).eq("quiz_id", id),
  ]);
  if (attachedError || sessionError || (attached ?? 0) > 0 || (sessions ?? 0) > 0) redirect(`/dashboard/papers/${id}?e=protected`);
  const { error: updateError } = await auth.supabase.from("quizzes").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", auth.org.id);
  if (updateError) redirect(`/dashboard/papers/${id}?e=save`);
  revalidatePath("/dashboard/papers");
  redirect(`/dashboard/papers/${id}?ok=${status}`);
}
