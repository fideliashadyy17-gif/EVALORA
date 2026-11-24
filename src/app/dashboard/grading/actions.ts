"use server";

/**
 * Organization grading systems — create, update, archive and attach to an
 * examination. Configurations are org-owned reusable rows in `grading_systems`;
 * curriculum REFERENCE data (MYP strands, AP structures) stays in code and is
 * never written here. Applying a system never publishes anything: results
 * remain behind the validate → publish workflow.
 */

import { activeOrg, can, CREATOR_ROLES, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { audit } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { GRADING_CURRICULA, type GradingCurriculum, type GradingSystemConfig } from "@/lib/gradingSystems";
import { buildMypExamConfigFromForm, parseMypExamConfig } from "@/lib/mypExamConfig";
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

  if (curriculum === "cambridge") {
    const qualification = String(formData.get("cambridge_qualification") ?? "").trim().slice(0, 120);
    const level = String(formData.get("cambridge_level") ?? "").trim().slice(0, 80);
    if (qualification) config.cambridge_qualification = qualification;
    if (level) config.cambridge_level = level;
    const codes = formData.getAll("cambridge_component_code").map(String);
    const names = formData.getAll("cambridge_component_name").map(String);
    const weights = formData.getAll("cambridge_component_weight").map(String);
    const components = codes
      .map((code, i) => ({
        code: code.trim().slice(0, 16),
        name: (names[i] ?? "").trim().slice(0, 120),
        weight_percent: num(weights[i], 0),
      }))
      .filter((c) => c.code && c.name && c.weight_percent > 0 && c.weight_percent <= 100);
    if (components.length) config.cambridge_components = components;
    const grades = formData.getAll("cambridge_grade").map(String);
    const mins = formData.getAll("cambridge_min").map(String);
    const thresholds = grades
      .map((grade, i) => ({ grade: grade.trim().slice(0, 24), min_percent: num(mins[i], 0) }))
      .filter((t) => t.grade && t.min_percent >= 0 && t.min_percent <= 100)
      .sort((a, b) => b.min_percent - a.min_percent);
    if (thresholds.length) config.cambridge_thresholds = thresholds;
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
  let curriculum: GradingCurriculum | null = (GRADING_CURRICULA as readonly string[]).includes(curriculumRaw)
    ? (curriculumRaw as GradingCurriculum)
    : null;

  // Editing: a stale client (or a disabled/absent curriculum field) must
  // not wipe the stored framework — fall back to the row's own curriculum
  // instead of failing the whole save. Only a genuinely invalid CREATE
  // (no id, no valid curriculum) is rejected.
  if (id) {
    if (!UUID.test(id)) fail("id");
    const supabaseEarly = await createClient();
    const { data: existing } = await supabaseEarly
      .from("grading_systems")
      .select("curriculum")
      .eq("id", id)
      .eq("organization_id", org.id)
      .maybeSingle();
    if (!existing) fail("missing");
    if (!curriculum && (GRADING_CURRICULA as readonly string[]).includes(existing.curriculum)) {
      curriculum = existing.curriculum;
    }
  }
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
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) {
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
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) {
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

// ═══ MYP criteria & strand configuration (per examination) ══════════════

/**
 * Save the MYP criteria/strand selection as a versioned SNAPSHOT inside
 * `exams.settings.myp_grading`. Titles and descriptions are copied with the
 * selection, so later reference-library edits never change this examination's
 * historical grading structure. Marking screens read the snapshot.
 */
export async function saveMypExamGrading(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) {
    redirect("/dashboard/exams?e=forbidden");
  }
  const examId = String(formData.get("exam_id") ?? "");
  if (!UUID.test(examId)) fail("id");

  const built = buildMypExamConfigFromForm(formData, String(formData.get("subject_group") ?? ""));
  if (!built.ok) fail(`myp_${built.error}`);

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("settings")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) fail("missing");

  const currentSettings = (exam.settings ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("exams")
    .update({
      settings: { ...currentSettings, myp_grading: built.config },
    })
    .eq("id", examId)
    .eq("organization_id", org.id);
  if (error) fail("save");
  await audit(ctx, "exam.myp_grading_saved", "exams", examId, org.id, {
    subject_group: built.config.subject_group,
    criteria: built.config.criteria.map((criterion) => criterion.code).join(","),
    strands: built.config.criteria.reduce((sum, c) => sum + c.strands.length, 0),
    reference: built.config.reference,
  });
  revalidatePath(`/dashboard/exams/${examId}`);
  redirect(`/dashboard/exams/${examId}?ok=mypgrading`);
}

/**
 * Build an assessment rubric FROM the saved MYP snapshot and associate it
 * with the examination (examination-wide link, so the marking queue offers
 * criterion-level scoring against the selected structure). Idempotent: an
 * already-generated rubric for this examination refuses a duplicate.
 */
export async function generateMypRubricFromConfig(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || (org.status !== "active" && ctx.profile.platform_role !== "super_admin") || !can(ctx, org.id, CREATOR_ROLES)) {
    redirect("/dashboard/exams?e=forbidden");
  }
  const examId = String(formData.get("exam_id") ?? "");
  if (!UUID.test(examId)) fail("id");

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, settings")
    .eq("id", examId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) fail("missing");

  const config = parseMypExamConfig((exam.settings as Record<string, unknown> | null)?.myp_grading);
  if (!config) fail("myp_no_config");

  // One generated rubric per examination: detect an existing linked rubric
  // carrying the generation marker.
  const { data: existingLinks } = await supabase
    .from("exam_rubric_links")
    .select("rubric_id, grading_rubrics(title, description, curriculum)")
    .eq("exam_id", examId)
    .eq("organization_id", org.id);
  const alreadyGenerated = ((existingLinks ?? []) as unknown as {
    grading_rubrics: { description?: string | null } | null;
  }[]).some((link) =>
    (link.grading_rubrics?.description ?? "").includes("Generated from MYP criteria snapshot"),
  );
  if (alreadyGenerated) fail("myp_rubric_exists");

  const marker = "Generated from MYP criteria snapshot — edit by duplicating; scored exams keep this version.";
  const title = `MYP ${config.subject_group_label} · ${exam.title}`.slice(0, 200);

  const { data: rubric, error: rubricError } = await supabase
    .from("grading_rubrics")
    .insert({
      organization_id: org.id,
      title,
      description: marker,
      framework: "IB MYP",
      curriculum: "myp",
      grade_label: config.subject_group_label.slice(0, 80),
      status: "draft",
      version: 1,
      created_by: ctx.user.id,
    })
    .select("id")
    .maybeSingle();
  if (rubricError || !rubric) fail("myp_rubric");

  const rows = config.criteria.map((criterion, index) => {
    const strandLines = criterion.strands.length
      ? "\n\nSelected strands:\n" +
        criterion.strands.map((strand) => `- ${strand.code} ${strand.title} — ${strand.description}`).join("\n")
      : "";
    return {
      rubric_id: rubric.id,
      organization_id: org.id,
      position: index,
      code: criterion.code,
      label: criterion.title,
      description: `${criterion.description}${strandLines}`.slice(0, 4000),
      max_marks: criterion.marks ?? 10,
      weight: criterion.weight,
      levels: null,
    };
  });
  const { error: criteriaError } = await supabase.from("grading_rubric_criteria").insert(rows);
  if (criteriaError) fail("myp_rubric");

  const { error: linkError } = await supabase.from("exam_rubric_links").insert({
    organization_id: org.id,
    exam_id: examId,
    question_id: null,
    rubric_id: rubric.id,
    created_by: ctx.user.id,
  });
  if (linkError) fail("myp_rubric");

  await audit(ctx, "exam.myp_rubric_generated", "grading_rubrics", rubric.id, org.id, {
    exam_id: examId,
    subject_group: config.subject_group,
    criteria: config.criteria.length,
  });
  revalidatePath(`/dashboard/exams/${examId}`);
  revalidatePath(`/dashboard/rubrics/${rubric.id}`);
  redirect(`/dashboard/exams/${examId}?ok=myp_rubric`);
}
