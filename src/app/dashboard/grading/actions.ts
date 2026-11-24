"use server";

/**
 * Organization grading systems — create, update, archive and attach to an
 * examination. Configurations are org-owned reusable rows in `grading_systems`;
 * curriculum REFERENCE data (MYP strands, AP structures) stays in code and is
 * never written here. Applying a system never publishes anything: results
 * remain behind the validate → publish workflow.
 */

import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { audit } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { GRADING_CURRICULA, type GradingCurriculum, type GradingSystemConfig } from "@/lib/gradingSystems";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code: string): never {
  redirect(`/dashboard/grading?e=${encodeURIComponent(code)}`);
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse the structured form into the stored config object. */
function parseConfig(curriculum: GradingCurriculum, formData: FormData): GradingSystemConfig {
  const config: GradingSystemConfig = {};
  const pass = formData.get("pass_percent");
  if (pass !== null && String(pass).trim() !== "") config.pass_percent = num(pass, 50);

  if (curriculum === "custom") {
    const labels = formData.getAll("boundary_label").map(String);
    const mins = formData.getAll("boundary_min").map(String);
    const boundaries = labels
      .map((label, i) => ({ label: label.trim(), min_percent: num(mins[i], 0) }))
      .filter((rule) => rule.label && rule.min_percent >= 0 && rule.min_percent <= 100)
      .sort((a, b) => a.min_percent - b.min_percent);
    if (boundaries.length) config.boundaries = boundaries;
  }

  if (curriculum === "beninese") {
    config.scale_max = num(formData.get("scale_max"), 20);
    const labels = formData.getAll("benin_label").map(String);
    const mins = formData.getAll("benin_min").map(String);
    const letters = labels
      .map((label, i) => ({ label: label.trim(), min: num(mins[i], 0) }))
      .filter((rule) => rule.label && rule.min >= 0 && rule.min <= config.scale_max!)
      .sort((a, b) => b.min - a.min);
    if (letters.length) config.benin_letters = letters;
  }

  if (curriculum === "ap") {
    const course = String(formData.get("ap_course") ?? "").trim().slice(0, 80);
    if (course) config.ap_course = course;
    const names = formData.getAll("ap_section_name").map(String);
    const weights = formData.getAll("ap_section_weight").map(String);
    const sections = names
      .map((name, i) => ({ name: name.trim(), weight_percent: num(weights[i], 0) }))
      .filter((section) => section.name && section.weight_percent > 0);
    if (sections.length) config.ap_sections = sections;
    const scores = formData.getAll("ap_score").map(String);
    const thresholds = formData.getAll("ap_threshold").map(String);
    const apScoreThresholds = scores
      .map((score, i) => ({ score: num(scores[i], 0), min_percent: num(thresholds[i], 0) }))
      .filter((rule) => rule.score >= 1 && rule.score <= 5 && rule.min_percent >= 0 && rule.min_percent <= 100)
      .sort((a, b) => b.min_percent - a.min_percent);
    if (apScoreThresholds.length) config.ap_score_thresholds = apScoreThresholds;
  }

  return config;
}

export async function saveGradingSystem(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/grading?e=forbidden");
  }

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  const curriculumRaw = String(formData.get("curriculum") ?? "");
  const curriculum = (GRADING_CURRICULA as readonly string[]).includes(curriculumRaw)
    ? (curriculumRaw as GradingCurriculum)
    : null;
  if (!name || !curriculum) fail("fields");

  const subjectRaw = String(formData.get("subject_id") ?? "");
  const subjectId = UUID.test(subjectRaw) ? subjectRaw : null;
  const gradeLabel = String(formData.get("grade_label") ?? "").trim().slice(0, 80) || null;
  const assessmentKind = ["exam", "quiz", "any"].includes(String(formData.get("assessment_kind") ?? ""))
    ? String(formData.get("assessment_kind"))
    : "any";
  const config = parseConfig(curriculum, formData);

  const supabase = await createClient();
  if (subjectId) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!subject) fail("subject");
  }

  if (id) {
    if (!UUID.test(id)) fail("id");
    const { error } = await supabase
      .from("grading_systems")
      .update({
        name,
        curriculum,
        subject_id: subjectId,
        grade_label: gradeLabel,
        assessment_kind: assessmentKind,
        config,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", org.id);
    if (error) fail("save");
    await audit(ctx, "grading_system.updated", "grading_systems", id, org.id, { name, curriculum });
  } else {
    const { data, error } = await supabase
      .from("grading_systems")
      .insert({
        organization_id: org.id,
        name,
        curriculum,
        subject_id: subjectId,
        grade_label: gradeLabel,
        assessment_kind: assessmentKind,
        config,
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error || !data) fail("save");
    await audit(ctx, "grading_system.created", "grading_systems", data.id, org.id, { name, curriculum });
  }

  revalidatePath("/dashboard/grading");
  redirect("/dashboard/grading?ok=saved");
}

export async function archiveGradingSystem(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/grading?e=forbidden");
  }
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) fail("id");
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("grading_systems")
    .select("id, name, status")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!row) fail("missing");
  const next = row.status === "archived" ? "active" : "archived";
  const { error } = await supabase
    .from("grading_systems")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) fail("save");
  await audit(ctx, next === "archived" ? "grading_system.archived" : "grading_system.restored", "grading_systems", id, org.id, {
    name: row.name,
  });
  revalidatePath("/dashboard/grading");
  redirect(`/dashboard/grading?ok=${next === "archived" ? "archived" : "restored"}`);
}

/** Attach (or detach) a grading system to ONE examination. */
export async function setExamGradingSystem(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/exams?e=forbidden");
  }
  const examId = String(formData.get("exam_id") ?? "");
  const systemId = String(formData.get("grading_system_id") ?? "");
  if (!UUID.test(examId)) fail("id");

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("settings")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) fail("missing");

  let nextSystemId: string | null = null;
  if (systemId) {
    if (!UUID.test(systemId)) fail("system");
    const { data: system } = await supabase
      .from("grading_systems")
      .select("id, status")
      .eq("id", systemId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!system || system.status !== "active") fail("system");
    nextSystemId = system.id;
  }

  const currentSettings = (exam.settings ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("exams")
    .update({
      settings: {
        ...currentSettings,
        ...(nextSystemId ? { grading_system_id: nextSystemId } : { grading_system_id: null }),
      },
    })
    .eq("id", examId)
    .eq("organization_id", org.id);
  if (error) fail("save");
  await audit(ctx, "exam.grading_system_set", "exams", examId, org.id, { grading_system_id: nextSystemId });
  revalidatePath(`/dashboard/exams/${examId}`);
  redirect(`/dashboard/exams/${examId}?ok=grading`);
}

/** Attach (or detach) a grading system to ONE quiz. */
export async function setQuizGradingSystem(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/quizzes?e=forbidden");
  }
  const quizId = String(formData.get("quiz_id") ?? "");
  const systemId = String(formData.get("grading_system_id") ?? "");
  if (!UUID.test(quizId)) fail("id");

  const supabase = await createClient();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("settings")
    .eq("id", quizId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!quiz) fail("missing");

  let nextSystemId: string | null = null;
  if (systemId) {
    if (!UUID.test(systemId)) fail("system");
    const { data: system } = await supabase
      .from("grading_systems")
      .select("id, status")
      .eq("id", systemId)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!system || system.status !== "active") fail("system");
    nextSystemId = system.id;
  }

  const currentSettings = (quiz.settings ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("quizzes")
    .update({
      settings: {
        ...currentSettings,
        ...(nextSystemId ? { grading_system_id: nextSystemId } : { grading_system_id: null }),
      },
    })
    .eq("id", quizId)
    .eq("organization_id", org.id);
  if (error) fail("save");
  await audit(ctx, "quiz.grading_system_set", "quizzes", quizId, org.id, { grading_system_id: nextSystemId });
  revalidatePath(`/dashboard/quizzes/${quizId}`);
  redirect(`/dashboard/quizzes/${quizId}?ok=grading`);
}
