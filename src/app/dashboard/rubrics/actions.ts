"use server";

import { activeOrg, can, MARKER_ROLES, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin")) redirect("/dashboard");
  if (!can(ctx, org.id, MARKER_ROLES)) redirect("/dashboard");
  return { ctx, org };
}

function text(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export async function createRubric(formData: FormData) {
  const { ctx, org } = await guard();
  const title = text(formData, "title", 200);
  if (!title) redirect("/dashboard/rubrics?e=title");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_rubrics")
    .insert({
      organization_id: org.id,
      title,
      framework: text(formData, "framework", 60) || null,
      description: text(formData, "description", 4000) || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/dashboard/rubrics?e=create");
  revalidatePath("/dashboard/rubrics");
  redirect(`/dashboard/rubrics/${data.id}?ok=created`);
}

export async function updateRubric(formData: FormData) {
  const { org } = await guard();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect("/dashboard/rubrics");
  const title = text(formData, "title", 200);
  if (!title) redirect(`/dashboard/rubrics/${id}?e=title`);
  const status = String(formData.get("status") ?? "draft");
  if (!["draft", "published", "archived"].includes(status)) redirect(`/dashboard/rubrics/${id}?e=status`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_rubrics")
    .update({
      title,
      framework: text(formData, "framework", 60) || null,
      description: text(formData, "description", 4000) || null,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/dashboard/rubrics/${id}?e=save`);
  revalidatePath(`/dashboard/rubrics/${id}`);
  redirect(`/dashboard/rubrics/${id}?ok=saved`);
}

export async function addCriterion(formData: FormData) {
  const { org } = await guard();
  const rubricId = String(formData.get("rubric_id") ?? "");
  if (!UUID.test(rubricId)) redirect("/dashboard/rubrics");
  const label = text(formData, "label", 300);
  const maxMarks = Number(formData.get("max_marks"));
  if (!label) redirect(`/dashboard/rubrics/${rubricId}?e=label`);
  if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1000)
    redirect(`/dashboard/rubrics/${rubricId}?e=marks`);

  const supabase = await createClient();
  const { data: rubric } = await supabase
    .from("grading_rubrics")
    .select("id")
    .eq("id", rubricId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!rubric) redirect("/dashboard/rubrics");

  const { data: last } = await supabase
    .from("grading_rubric_criteria")
    .select("position")
    .eq("rubric_id", rubricId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("grading_rubric_criteria").insert({
    rubric_id: rubricId,
    organization_id: org.id,
    position: (last?.position ?? -1) + 1,
    code: text(formData, "code", 12) || null,
    label,
    description: text(formData, "description", 4000) || null,
    max_marks: Math.round(maxMarks * 100) / 100,
  });
  if (error) redirect(`/dashboard/rubrics/${rubricId}?e=criterion`);
  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  redirect(`/dashboard/rubrics/${rubricId}?ok=criterion`);
}

export async function updateCriterion(formData: FormData) {
  const { org } = await guard();
  const rubricId = String(formData.get("rubric_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(rubricId) || !UUID.test(id)) redirect("/dashboard/rubrics");
  const label = text(formData, "label", 300);
  const maxMarks = Number(formData.get("max_marks"));
  if (!label) redirect(`/dashboard/rubrics/${rubricId}?e=label`);
  if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1000)
    redirect(`/dashboard/rubrics/${rubricId}?e=marks`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_rubric_criteria")
    .update({
      code: text(formData, "code", 12) || null,
      label,
      description: text(formData, "description", 4000) || null,
      max_marks: Math.round(maxMarks * 100) / 100,
    })
    .eq("id", id)
    .eq("rubric_id", rubricId)
    .eq("organization_id", org.id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/dashboard/rubrics/${rubricId}?e=criterion`);
  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  redirect(`/dashboard/rubrics/${rubricId}?ok=criterion`);
}

export async function deleteCriterion(formData: FormData) {
  const { org } = await guard();
  const rubricId = String(formData.get("rubric_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(rubricId) || !UUID.test(id)) redirect("/dashboard/rubrics");
  const supabase = await createClient();
  // Refuse to remove a criterion that already carries marks: the scores are
  // evidence of how a grade was reached.
  const { count } = await supabase
    .from("answer_rubric_scores")
    .select("id", { count: "exact", head: true })
    .eq("criterion_id", id);
  if ((count ?? 0) > 0) redirect(`/dashboard/rubrics/${rubricId}?e=inuse`);
  const { error } = await supabase
    .from("grading_rubric_criteria")
    .delete()
    .eq("id", id)
    .eq("rubric_id", rubricId)
    .eq("organization_id", org.id);
  if (error) redirect(`/dashboard/rubrics/${rubricId}?e=criterion`);
  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  redirect(`/dashboard/rubrics/${rubricId}?ok=removed`);
}

export async function attachRubric(formData: FormData) {
  const { ctx, org } = await guard();
  const rubricId = String(formData.get("rubric_id") ?? "");
  const examId = String(formData.get("exam_id") ?? "");
  const questionId = String(formData.get("question_id") ?? "");
  if (!UUID.test(rubricId) || !UUID.test(examId)) redirect(`/dashboard/rubrics/${rubricId}`);
  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id, quiz_id")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) redirect(`/dashboard/rubrics/${rubricId}?e=exam`);

  let targetQuestion: string | null = null;
  if (UUID.test(questionId)) {
    // Only a question actually used by this examination may be targeted.
    const { data: used } = await supabase
      .from("exam_answers")
      .select("question_id, exam_attempts!inner(exam_id)")
      .eq("question_id", questionId)
      .eq("exam_attempts.exam_id", examId)
      .limit(1)
      .maybeSingle();
    let ok = Boolean(used);
    if (!ok) {
      const { data: quizQuestion } = await supabase
        .from("quiz_questions")
        .select("id, questions!inner(organization_id)")
        .eq("quiz_id", exam.quiz_id ?? "")
        .eq("question_id", questionId)
        .maybeSingle();
      ok = Boolean(quizQuestion);
    }
    if (!ok) redirect(`/dashboard/rubrics/${rubricId}?e=question`);
    targetQuestion = questionId;
  }

  const { error } = await supabase.from("exam_rubric_links").insert({
    organization_id: org.id,
    exam_id: examId,
    question_id: targetQuestion,
    rubric_id: rubricId,
    created_by: ctx.user.id,
  });
  if (error) redirect(`/dashboard/rubrics/${rubricId}?e=attach`);
  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  revalidatePath(`/dashboard/exams/${examId}`);
  redirect(`/dashboard/rubrics/${rubricId}?ok=attached`);
}

export async function detachRubric(formData: FormData) {
  const { org } = await guard();
  const rubricId = String(formData.get("rubric_id") ?? "");
  const linkId = String(formData.get("link_id") ?? "");
  if (!UUID.test(rubricId) || !UUID.test(linkId)) redirect("/dashboard/rubrics");
  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_rubric_links")
    .delete()
    .eq("id", linkId)
    .eq("organization_id", org.id);
  if (error) redirect(`/dashboard/rubrics/${rubricId}?e=detach`);
  revalidatePath(`/dashboard/rubrics/${rubricId}`);
  redirect(`/dashboard/rubrics/${rubricId}?ok=detached`);
}
