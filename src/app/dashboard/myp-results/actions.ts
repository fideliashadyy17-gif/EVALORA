"use server";

import { activeOrg, can, requireUser } from "@/lib/auth";
import { MYP_STAFF_ROLES } from "@/lib/mypAccess";
import { MYP_CRITERION_PRESETS, normalizeCriterion } from "@/lib/myp";
import { loadMypResult } from "@/lib/mypResults";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS_PATH = "/dashboard/myp-results/settings";

/**
 * MYP result and grading-configuration writes.
 *
 * Every action re-checks the verified organization role on the server and then
 * relies on RLS for the write itself. Nothing here recalculates a grade: the
 * snapshot is a copy of the result the authoritative engine just produced and
 * the database refuses to alter it afterwards.
 */

async function staffGuard(options: { manage?: boolean } = {}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  const isSuperAdmin = ctx.profile.platform_role === "super_admin";
  if (!org || (org.status !== "active" && !isSuperAdmin)) redirect("/dashboard");
  const allowed = options.manage
    ? can(ctx, org.id, ["owner", "admin"])
    : can(ctx, org.id, [...MYP_STAFF_ROLES]);
  if (!allowed) redirect("/dashboard");
  return { ctx, org, isSuperAdmin };
}

function text(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

/** Archive the current authoritative result as an append-only snapshot. */
export async function recordMypSnapshot(formData: FormData) {
  const { ctx, org } = await staffGuard();
  const attemptId = String(formData.get("attemptId") ?? "");
  const returnTo = text(formData, "returnTo", 400) || "/dashboard/myp-results";
  if (!UUID.test(attemptId)) redirect(`${returnTo}?e=attempt`);

  const requestedReason = text(formData, "reason", 40) || "snapshot";
  const reason = ["publication", "moderation", "regrade", "snapshot", "configuration_change"].includes(requestedReason)
    ? requestedReason
    : "snapshot";
  const note = text(formData, "note", 2000) || null;

  const supabase = await createClient();
  const result = await loadMypResult(supabase, {
    attemptId,
    organizationIds: [org.id],
  });
  if (!result) redirect(`${returnTo}?e=scope`);

  const { error } = await supabase.from("myp_result_history").insert({
    organization_id: org.id,
    exam_id: result.examId,
    attempt_id: result.attemptId,
    subject_id: result.subjectId,
    myp_year: result.mypYear,
    reason,
    marks_awarded: result.marksAwarded,
    marks_max: result.marksMax,
    percent: result.percent,
    total_levels: result.totalLevels,
    total_levels_max: result.totalLevelsMax,
    overall_grade: result.overallGrade,
    grade_status: result.gradeStatus,
    criterion_snapshot: result.criteria.map((criterion) => ({
      code: criterion.code,
      title: criterion.title,
      status: criterion.status,
      marksAwarded: criterion.marksAwarded,
      marksMax: criterion.marksMax,
      percent: criterion.percent,
      level: criterion.level,
      feedback: criterion.feedback,
    })),
    level_source: result.levelSource,
    grade_source: result.gradeSource,
    note,
    recorded_by: ctx.user.id,
    recorded_by_email: ctx.profile.email,
  });

  if (error) redirect(`${returnTo}?e=snapshot`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=snapshot`);
}

/** Save the organization-wide aggregation rule. */
export async function saveMypFramework(formData: FormData) {
  const { ctx, org } = await staffGuard({ manage: true });
  const requireAll = String(formData.get("require_all_criteria") ?? "true") === "true";
  const maxLevel = Number(formData.get("criteria_max_level") ?? 8);
  if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 8) {
    redirect(`${SETTINGS_PATH}?e=level`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("myp_framework_config").upsert(
    {
      organization_id: org.id,
      framework: "IB MYP",
      criteria_max_level: maxLevel,
      require_all_criteria: requireAll,
      note: requireAll
        ? "All criteria on the paper must be marked before an overall MYP grade is calculated."
        : "Overall grades may aggregate only the criteria that are fully marked; such a grade is reported as provisional.",
      updated_by: ctx.user.id,
    },
    { onConflict: "organization_id" },
  );
  if (error) redirect(`${SETTINGS_PATH}?e=framework`);
  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?ok=framework`);
}

/**
 * Save the percentage→level conversion and the 1–7 boundaries for one subject.
 * Both are configuration: the engine never invents either.
 */
export async function saveMypBoundaries(formData: FormData) {
  const { org } = await staffGuard({ manage: true });
  const subjectId = String(formData.get("subject_id") ?? "");
  if (!UUID.test(subjectId)) redirect(`${SETTINGS_PATH}?e=subject`);

  const supabase = await createClient();
  const { data: subject } = await supabase
    .from("subjects")
    .select("id, organization_id")
    .eq("id", subjectId)
    .maybeSingle();
  if (!subject || subject.organization_id !== org.id) redirect(`${SETTINGS_PATH}?e=subject`);

  const levelRows: { level: number; minPercent: number }[] = [];
  for (let level = 0; level <= 8; level += 1) {
    const raw = formData.get(`level_${level}`);
    const value = Number(raw ?? (level === 0 ? 0 : NaN));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=level`);
    }
    levelRows.push({ level, minPercent: Math.round(value * 100) / 100 });
  }
  // The conversion must ascend with the level: a higher level cannot need fewer
  // marks than a lower one.
  for (let index = 1; index < levelRows.length; index += 1) {
    if (levelRows[index].minPercent < levelRows[index - 1].minPercent) {
      redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=level_order`);
    }
  }

  const gradeRows: { minTotal: number; maxTotal: number; grade: number }[] = [];
  for (let grade = 1; grade <= 7; grade += 1) {
    const minTotal = Number(formData.get(`grade_${grade}_min`));
    const maxTotal = Number(formData.get(`grade_${grade}_max`));
    if (
      !Number.isFinite(minTotal) ||
      !Number.isFinite(maxTotal) ||
      minTotal < 0 ||
      maxTotal < minTotal ||
      maxTotal > 64
    ) {
      redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=grade`);
    }
    gradeRows.push({ minTotal: Math.round(minTotal), maxTotal: Math.round(maxTotal), grade });
  }
  // No total may fall into two grades, or a result could receive two answers.
  const sorted = [...gradeRows].sort((a, b) => a.minTotal - b.minTotal);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].minTotal <= sorted[index - 1].maxTotal) {
      redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=grade_overlap`);
    }
  }

  const levelSource =
    "School-configured criterion-level conversion — percentage of criterion marks to MYP achievement level";
  const gradeSource =
    "School-configured overall grade boundaries — total criterion levels mapped to grades 1–7";

  const levelUpsert = await supabase.from("myp_level_boundaries").upsert(
    levelRows.map((row) => ({
      organization_id: org.id,
      subject_id: subjectId,
      level: row.level,
      min_percent: row.minPercent,
      source: levelSource,
    })),
    { onConflict: "subject_id,level" },
  );
  if (levelUpsert.error) redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=level_save`);

  // Replace the subject's own boundary set so a removed band cannot linger.
  const { error: clearError } = await supabase
    .from("myp_grade_boundaries")
    .delete()
    .eq("organization_id", org.id)
    .eq("subject_id", subjectId);
  if (clearError) redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=grade_save`);

  const gradeInsert = await supabase.from("myp_grade_boundaries").insert(
    gradeRows.map((row) => ({
      organization_id: org.id,
      subject_id: subjectId,
      min_total: row.minTotal,
      max_total: row.maxTotal,
      grade: row.grade,
      source: gradeSource,
    })),
  );
  if (gradeInsert.error) redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=grade_save`);

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?subject=${subjectId}&ok=boundaries`);
}

/** Add the official MYP criteria for a subject from a subject-group preset. */
export async function applyMypCriteriaPreset(formData: FormData) {
  const { org } = await staffGuard({ manage: true });
  const subjectId = String(formData.get("subject_id") ?? "");
  const presetKey = text(formData, "preset", 40);
  const preset = MYP_CRITERION_PRESETS.find((entry) => entry.key === presetKey);
  if (!UUID.test(subjectId) || !preset) redirect(`${SETTINGS_PATH}?e=preset`);

  const supabase = await createClient();
  const { data: subject } = await supabase
    .from("subjects")
    .select("id, organization_id, name")
    .eq("id", subjectId)
    .maybeSingle();
  if (!subject || subject.organization_id !== org.id) redirect(`${SETTINGS_PATH}?e=preset`);

  const rows = preset.criteria.map((criterion, index) => ({
    organization_id: org.id,
    subject_id: subjectId,
    code: normalizeCriterion(criterion.code) ?? criterion.code,
    title: criterion.title,
    description: criterion.description,
    position: index,
    max_level: 8,
    source: preset.source,
  }));
  const { error } = await supabase
    .from("myp_criteria")
    .upsert(rows, { onConflict: "subject_id,code" });
  if (error) redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=preset_save`);

  // New subjects also need a percentage→level conversion to be usable.
  await supabase.from("myp_level_boundaries").upsert(
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((level) => ({
      organization_id: org.id,
      subject_id: subjectId,
      level,
      min_percent: [0, 1, 20, 35, 50, 65, 75, 85, 95][level],
      source:
        "EVALORA default criterion-level conversion — percentage of criterion marks to MYP achievement level (school-configurable; not an IB-published boundary)",
    })),
    { onConflict: "subject_id,level" },
  );

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?subject=${subjectId}&ok=preset`);
}

/** Remove one configured criterion (only when it carries no marks). */
export async function removeMypCriterion(formData: FormData) {
  const { org } = await staffGuard({ manage: true });
  const criterionId = String(formData.get("criterion_id") ?? "");
  const subjectId = String(formData.get("subject_id") ?? "");
  if (!UUID.test(criterionId) || !UUID.test(subjectId)) redirect(`${SETTINGS_PATH}?e=criterion`);

  const supabase = await createClient();
  const { data: criterion } = await supabase
    .from("myp_criteria")
    .select("id, organization_id, subject_id, code")
    .eq("id", criterionId)
    .maybeSingle();
  if (!criterion || criterion.organization_id !== org.id) redirect(`${SETTINGS_PATH}?e=criterion`);

  // A criterion that is used by any question on a paper is evidence: it can be
  // renamed, never removed.
  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("subject_id", subjectId)
    .eq("config->>myp_criterion", criterion.code);
  if ((count ?? 0) > 0) redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=criterion_used`);

  const { error } = await supabase.from("myp_criteria").delete().eq("id", criterionId);
  if (error) redirect(`${SETTINGS_PATH}?subject=${subjectId}&e=criterion_delete`);
  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?subject=${subjectId}&ok=criterion_removed`);
}
