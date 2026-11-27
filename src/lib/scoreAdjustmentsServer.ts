import crypto from "node:crypto";
import { getEntitlement } from "@/lib/entitlements";
import { canOperate } from "@/lib/operationalAccess";
import {
  buildScoreAdjustmentPreview,
  computeAdjustedAttemptScore,
  extractAdjustmentCategories,
  isExamOpenForScoreAdjustment,
  isScoreAdjustmentPlanEligible,
  normalizeAdjustmentPoints,
  type AdjustmentAttemptInput,
  type AdjustmentCapReason,
  type AdjustmentCategory,
  type AdjustmentCategoryType,
  type AdjustmentPaperQuestion,
  type AdjustmentScope,
  type PriorAdjustmentItem,
  type ScoreAdjustmentPreview,
} from "@/lib/scoreAdjustments";
import type { SessionContext } from "@/lib/auth";
import type { createAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ScoreAdjustmentHistoryItem {
  id: string;
  attemptId: string;
  candidateName: string;
  categoryType: AdjustmentCategoryType;
  categoryKey: string;
  categoryMaxScore: number;
  originalCategoryScore: number;
  adjustedCategoryScore: number;
  examMaxScore: number;
  originalExamScore: number;
  adjustedExamScore: number;
  pointsRequested: number;
  pointsApplied: number;
  capped: boolean;
  capReason: AdjustmentCapReason | null;
  createdAt: string;
}

export interface ScoreAdjustmentHistoryBatch {
  id: string;
  organizationId: string;
  examId: string;
  categoryType: AdjustmentCategoryType;
  categoryKey: string;
  categoryLabel: string;
  pointsRequested: number;
  scope: AdjustmentScope;
  reason: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string;
  actorConsole: "workspace" | "super_admin";
  studentsAffectedCount: number;
  cappedStudentsCount: number;
  totalPointsAdded: number;
  createdAt: string;
  items: ScoreAdjustmentHistoryItem[];
}

export interface ExamScoreAdjustmentContext {
  exam: {
    id: string;
    organizationId: string;
    organizationName: string;
    quizId: string | null;
    title: string;
    status: string;
    resultsValidated: boolean;
    resultsPublished: boolean;
    archived: boolean;
  };
  plan: {
    slug: string;
    name: string;
    status: string;
    eligible: boolean;
  };
  lifecycle: {
    allowed: boolean;
    code: string | null;
    reason: string | null;
  };
  categories: AdjustmentCategory[];
  paper: AdjustmentPaperQuestion[];
  attempts: AdjustmentAttemptInput[];
  priorAdjustments: PriorAdjustmentItem[];
  history: ScoreAdjustmentHistoryBatch[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Loads the complete, authoritative Score Adjustment context for an examination.
 * Always resolves the TARGET organization's real plan entitlement (never ownerBypass)
 * so Super Admin cannot accidentally apply adjustments to non-Institution orgs.
 */
export async function loadExamScoreAdjustmentContext(
  admin: AdminClient,
  examId: string,
  options?: { requiredOrganizationId?: string },
): Promise<ExamScoreAdjustmentContext | null> {
  if (!isUuid(examId)) return null;

  const { data: examRow } = await admin
    .from("exams")
    .select(
      "id, organization_id, quiz_id, title, status, settings, grades_published_at, deleted_at, organization:organizations(id, name)",
    )
    .eq("id", examId)
    .maybeSingle();

  if (!examRow) return null;
  const orgId = String(examRow.organization_id);
  if (options?.requiredOrganizationId && orgId !== options.requiredOrganizationId) {
    return null;
  }

  const orgObj = examRow.organization as unknown as { id: string; name: string } | null;
  const settings = (examRow.settings ?? {}) as Record<string, unknown>;

  // Always check target org's actual subscription plan — never bypass with Super Admin!
  const entitlement = await getEntitlement(admin, orgId);
  const planEligible = isScoreAdjustmentPlanEligible(entitlement);
  const lifecycle = isExamOpenForScoreAdjustment({
    status: examRow.status,
    deleted_at: examRow.deleted_at,
    grades_published_at: examRow.grades_published_at,
    settings,
  });

  // Load paper questions (quiz_questions + questions)
  const paper: AdjustmentPaperQuestion[] = [];
  const subjectIds = new Set<string>();
  if (examRow.quiz_id) {
    const { data: qqRows } = await admin
      .from("quiz_questions")
      .select(
        "question_id, position, points, assessment, question:questions(id, points, subject_id, config)",
      )
      .eq("quiz_id", examRow.quiz_id)
      .order("position");

    for (const row of qqRows ?? []) {
      const q = row.question as unknown as {
        id: string;
        points: number;
        subject_id: string | null;
        config: Record<string, unknown> | null;
      } | null;
      if (!q) continue;
      if (q.subject_id) subjectIds.add(q.subject_id);
      const pts = Number(row.points ?? q.points ?? 0);
      const qConfig = (q.config ?? {}) as Record<string, unknown>;
      const qqAssessment = (row.assessment ?? {}) as Record<string, unknown>;
      const mergedMeta: Record<string, unknown> = { ...qConfig, ...qqAssessment };
      paper.push({
        questionId: q.id,
        points: Number.isFinite(pts) ? pts : 0,
        criterion:
          typeof mergedMeta.myp_criterion === "string"
            ? mergedMeta.myp_criterion
            : typeof mergedMeta.criterion === "string"
              ? mergedMeta.criterion
              : null,
        sectionId:
          typeof mergedMeta.section_id === "string"
            ? mergedMeta.section_id
            : typeof mergedMeta.paper_section === "string"
              ? mergedMeta.paper_section
              : typeof mergedMeta.section === "string"
                ? mergedMeta.section
                : null,
        sectionTitle:
          typeof mergedMeta.section_title === "string" ? mergedMeta.section_title : null,
        metadata: mergedMeta,
      });
    }
  }

  // Optional MYP criterion titles from subject configuration
  const mypCriteriaTitles = new Map<string, string>();
  if (subjectIds.size > 0) {
    const { data: critRows } = await admin
      .from("myp_criteria")
      .select("code, title")
      .eq("organization_id", orgId)
      .in("subject_id", [...subjectIds]);
    for (const row of critRows ?? []) {
      const code = String(row.code ?? "").trim().toUpperCase();
      const title = String(row.title ?? "").trim();
      if (code && title && !mypCriteriaTitles.has(code)) {
        mypCriteriaTitles.set(code, title);
      }
    }
  }

  // Load attempts + candidates + classes
  const { data: attemptRows } = await admin
    .from("exam_attempts")
    .select(
      "id, candidate_id, student_id, first_name, last_name, status, grading_status, pending_manual_count, score, max_score, submitted_at, class_id, candidate:exam_candidates(id, full_name, email), class:classes(id, name)",
    )
    .eq("exam_id", examId)
    .order("started_at", { ascending: true })
    .limit(2000);

  const attemptIds = (attemptRows ?? []).map((a) => String(a.id));

  // Load answers in chunks (avoid URL length limits on large cohorts)
  const answersByAttempt = new Map<string, Record<string, number | null>>();
  for (let i = 0; i < attemptIds.length; i += 150) {
    const chunk = attemptIds.slice(i, i + 150);
    const { data: ansRows } = await admin
      .from("exam_answers")
      .select("attempt_id, question_id, points_awarded")
      .in("attempt_id", chunk)
      .limit(10000);
    for (const row of ansRows ?? []) {
      const aid = String(row.attempt_id);
      let map = answersByAttempt.get(aid);
      if (!map) {
        map = {};
        answersByAttempt.set(aid, map);
      }
      map[String(row.question_id)] =
        row.points_awarded === null || row.points_awarded === undefined
          ? null
          : Number(row.points_awarded);
    }
  }

  const attempts: AdjustmentAttemptInput[] = (attemptRows ?? []).map((row) => {
    const cand = row.candidate as unknown as { id: string; full_name: string | null; email: string | null } | null;
    const cls = row.class as unknown as { id: string; name: string | null } | null;
    const fallbackName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    const candidateName =
      cand?.full_name?.trim() ||
      fallbackName ||
      cand?.email?.trim() ||
      `Candidate ${String(row.id).slice(0, 6)}`;

    return {
      attemptId: String(row.id),
      candidateId: row.candidate_id ? String(row.candidate_id) : null,
      studentId: row.student_id ? String(row.student_id) : null,
      candidateName,
      className: cls?.name?.trim() || null,
      status: String(row.status ?? ""),
      gradingStatus: row.grading_status ? String(row.grading_status) : null,
      pendingManualCount:
        row.pending_manual_count === null || row.pending_manual_count === undefined
          ? 0
          : Number(row.pending_manual_count),
      score:
        row.score === null || row.score === undefined ? null : Number(row.score),
      maxScore:
        row.max_score === null || row.max_score === undefined
          ? null
          : Number(row.max_score),
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      answersByQuestion: answersByAttempt.get(String(row.id)) ?? {},
    };
  });

  // Fallback max score if paper has no quiz_questions rows
  const fallbackExamMaxScore =
    attempts.find((a) => a.maxScore && a.maxScore > 0)?.maxScore ?? null;
  const categories = extractAdjustmentCategories(paper, {
    mypCriteriaTitles,
    fallbackExamMaxScore,
  });

  // Load immutable adjustment history (degrade gracefully if migration not yet applied)
  const priorAdjustments: PriorAdjustmentItem[] = [];
  const history: ScoreAdjustmentHistoryBatch[] = [];
  const { data: batchRows, error: batchError } = await admin
    .from("exam_score_adjustments")
    .select(
      "id, organization_id, exam_id, category_type, category_key, category_label, points_requested, scope, reason, actor_id, actor_email, actor_role, actor_console, students_affected_count, capped_students_count, total_points_added, created_at",
    )
    .eq("exam_id", examId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!batchError && batchRows && batchRows.length > 0) {
    const { data: itemRows } = await admin
      .from("exam_score_adjustment_items")
      .select(
        "id, adjustment_id, attempt_id, candidate_name, category_type, category_key, sequence_no, category_max_score, original_category_score, adjusted_category_score, exam_max_score, original_exam_score, adjusted_exam_score, points_requested, points_applied, capped, cap_reason, created_at",
      )
      .eq("exam_id", examId)
      .order("candidate_name", { ascending: true })
      .limit(5000);

    const itemsByBatch = new Map<string, ScoreAdjustmentHistoryItem[]>();
    for (const item of itemRows ?? []) {
      const parsed: PriorAdjustmentItem = {
        id: String(item.id),
        adjustmentId: String(item.adjustment_id),
        attemptId: String(item.attempt_id),
        categoryType: item.category_type as AdjustmentCategoryType,
        categoryKey: String(item.category_key),
        pointsRequested: Number(item.points_requested),
        pointsApplied: Number(item.points_applied),
        originalCategoryScore: Number(item.original_category_score),
        adjustedCategoryScore: Number(item.adjusted_category_score),
        categoryMaxScore: Number(item.category_max_score),
        originalExamScore: Number(item.original_exam_score),
        adjustedExamScore: Number(item.adjusted_exam_score),
        examMaxScore: Number(item.exam_max_score),
        capped: Boolean(item.capped),
        capReason: (item.cap_reason ?? null) as AdjustmentCapReason | null,
        // Tolerates a database where the repeated-adjustment migration has not
        // run yet: the ordinal simply falls back to 0 and ordering uses time.
        sequenceNo: Number(item.sequence_no ?? 0),
        createdAt: String(item.created_at),
      };
      priorAdjustments.push(parsed);

      const list = itemsByBatch.get(parsed.adjustmentId) ?? [];
      list.push({
        id: parsed.id,
        attemptId: parsed.attemptId,
        candidateName: String(item.candidate_name ?? "Candidate"),
        categoryType: parsed.categoryType,
        categoryKey: parsed.categoryKey,
        categoryMaxScore: parsed.categoryMaxScore,
        originalCategoryScore: parsed.originalCategoryScore,
        adjustedCategoryScore: parsed.adjustedCategoryScore,
        examMaxScore: parsed.examMaxScore,
        originalExamScore: parsed.originalExamScore,
        adjustedExamScore: parsed.adjustedExamScore,
        pointsRequested: parsed.pointsRequested,
        pointsApplied: parsed.pointsApplied,
        capped: parsed.capped,
        capReason: parsed.capReason,
        createdAt: parsed.createdAt,
      });
      itemsByBatch.set(parsed.adjustmentId, list);
    }

    for (const b of batchRows) {
      const id = String(b.id);
      history.push({
        id,
        organizationId: String(b.organization_id),
        examId: String(b.exam_id),
        categoryType: b.category_type as AdjustmentCategoryType,
        categoryKey: String(b.category_key),
        categoryLabel: String(b.category_label),
        pointsRequested: Number(b.points_requested),
        scope: b.scope as AdjustmentScope,
        reason: String(b.reason),
        actorId: b.actor_id ? String(b.actor_id) : null,
        actorEmail: b.actor_email ? String(b.actor_email) : null,
        actorRole: String(b.actor_role),
        actorConsole: b.actor_console === "super_admin" ? "super_admin" : "workspace",
        studentsAffectedCount: Number(b.students_affected_count),
        cappedStudentsCount: Number(b.capped_students_count),
        totalPointsAdded: Number(b.total_points_added),
        createdAt: String(b.created_at),
        items: itemsByBatch.get(id) ?? [],
      });
    }
  }

  return {
    exam: {
      id: String(examRow.id),
      organizationId: orgId,
      organizationName: orgObj?.name?.trim() || "Organization",
      quizId: examRow.quiz_id ? String(examRow.quiz_id) : null,
      title: String(examRow.title ?? "Examination"),
      status: String(examRow.status ?? ""),
      resultsValidated: settings.results_validated === true,
      resultsPublished:
        settings.results_published === true || Boolean(examRow.grades_published_at),
      archived: settings.archived === true,
    },
    plan: {
      slug: entitlement.planSlug,
      name: entitlement.planName,
      status: entitlement.status,
      eligible: planEligible,
    },
    lifecycle,
    categories,
    paper,
    attempts,
    priorAdjustments,
    history,
  };
}

export interface ScoreAdjustmentRequestPayload {
  categoryType: AdjustmentCategoryType;
  categoryKey: string;
  pointsRequested: unknown;
  scope: AdjustmentScope;
  attemptIds?: string[];
  reason?: string;
  idempotencyKey?: string;
}

export type ScoreAdjustmentPreviewResult =
  | {
      ok: true;
      preview: ScoreAdjustmentPreview;
      idempotencyKey: string;
    }
  | { ok: false; status: number; code: string; error: string };

export type ScoreAdjustmentApplyResult =
  | {
      ok: true;
      adjustmentId: string;
      studentsAffected: number;
      cappedStudents: number;
      totalPointsAdded: number;
    }
  | { ok: false; status: number; code: string; error: string };

/**
 * Verifies role & tenant authorization for applying score adjustments.
 */
export async function authorizeScoreAdjustmentActor(
  ctx: SessionContext,
  examOrganizationId: string,
  consoleType: "workspace" | "super_admin",
  activeOrgId?: string | null,
): Promise<{ allowed: true; actorRole: string } | { allowed: false; status: number; error: string }> {
  if (ctx.profile.status !== "active") {
    return { allowed: false, status: 403, error: "Your account is not active." };
  }
  const isSuper = ctx.profile.platform_role === "super_admin";

  if (consoleType === "super_admin") {
    if (!isSuper) {
      return { allowed: false, status: 403, error: "Super Admin privileges are required." };
    }
    return { allowed: true, actorRole: "super_admin" };
  }

  // Workspace console: strict tenant check + centralized RBAC (`grading.edit` + `exam_results` module)
  if (!activeOrgId || activeOrgId !== examOrganizationId) {
    return {
      allowed: false,
      status: 403,
      error: "This examination does not belong to your active organization.",
    };
  }
  if (isSuper) {
    return { allowed: true, actorRole: "super_admin" };
  }

  const membership = ctx.memberships.find((m) => m.organization_id === examOrganizationId);
  if (!membership || membership.organizations?.status !== "active") {
    return { allowed: false, status: 403, error: "You are not an active member of this organization." };
  }
  const roleLower = String(membership.role ?? "").toLowerCase();
  if (["student", "candidate", "parent", "participant", "school_founder"].includes(roleLower)) {
    return {
      allowed: false,
      status: 403,
      error: "Your role is not permitted to apply score adjustments.",
    };
  }

  const allowed = await canOperate(ctx, examOrganizationId, "grading.edit", "exam_results");
  if (!allowed) {
    return {
      allowed: false,
      status: 403,
      error: "Examination grading permission (grading.edit) is required to apply score adjustments.",
    };
  }
  return { allowed: true, actorRole: membership.role };
}

/**
 * Generates an authoritative server-side preview for a Score Adjustment request.
 * Performs ZERO database writes.
 */
export async function previewScoreAdjustmentServer(
  admin: AdminClient,
  ctx: SessionContext,
  examId: string,
  consoleType: "workspace" | "super_admin",
  activeOrgId: string | null,
  payload: ScoreAdjustmentRequestPayload,
): Promise<ScoreAdjustmentPreviewResult> {
  const context = await loadExamScoreAdjustmentContext(admin, examId, {
    requiredOrganizationId: consoleType === "workspace" ? activeOrgId ?? undefined : undefined,
  });
  if (!context) {
    return { ok: false, status: 404, code: "exam_not_found", error: "Examination not found." };
  }

  const auth = await authorizeScoreAdjustmentActor(
    ctx,
    context.exam.organizationId,
    consoleType,
    activeOrgId,
  );
  if (!auth.allowed) {
    return { ok: false, status: auth.status, code: "unauthorized", error: auth.error };
  }

  if (!context.plan.eligible) {
    return {
      ok: false,
      status: 403,
      code: "plan_ineligible",
      error: `Score adjustment is exclusively available for organizations on an active Institution plan (${context.exam.organizationName} is currently on ${context.plan.name}).`,
    };
  }

  if (!context.lifecycle.allowed) {
    return {
      ok: false,
      status: 409,
      code: context.lifecycle.code ?? "lifecycle_locked",
      error: context.lifecycle.reason ?? "Examination is locked for score adjustments.",
    };
  }

  const pointsRequested = normalizeAdjustmentPoints(payload.pointsRequested);
  if (pointsRequested === null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_points",
      error: "Please enter a valid positive number of adjustment points (between 0.01 and 1000).",
    };
  }

  const scope: AdjustmentScope = payload.scope === "selected" ? "selected" : "all_eligible";
  const categoryKey = String(payload.categoryKey ?? "").trim();
  const category = context.categories.find(
    (c) => c.categoryType === payload.categoryType && c.categoryKey === categoryKey,
  );
  if (!category) {
    return {
      ok: false,
      status: 400,
      code: "invalid_category",
      error: "Selected grading criterion or category does not exist on this examination paper.",
    };
  }

  const selectedIds = Array.isArray(payload.attemptIds)
    ? payload.attemptIds.map((id) => String(id).trim()).filter(isUuid)
    : [];
  if (scope === "selected" && selectedIds.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "no_students_selected",
      error: "Select at least one eligible student before previewing.",
    };
  }

  const preview = buildScoreAdjustmentPreview({
    category,
    pointsRequested,
    scope,
    selectedAttemptIds: selectedIds,
    paper: context.paper,
    attempts: context.attempts,
    priorAdjustments: context.priorAdjustments,
  });

  return {
    ok: true,
    preview,
    idempotencyKey: crypto.randomUUID(),
  };
}

/**
 * Applies a confirmed Score Adjustment atomically through PostgreSQL RPC
 * `public.apply_exam_score_adjustment`, recomputing all numbers server-side
 * and enforcing every plan, role, lifecycle, cap, and duplicate-prevention rule.
 */
export async function applyScoreAdjustmentServer(
  admin: AdminClient,
  ctx: SessionContext,
  examId: string,
  consoleType: "workspace" | "super_admin",
  activeOrgId: string | null,
  payload: ScoreAdjustmentRequestPayload,
): Promise<ScoreAdjustmentApplyResult> {
  const reason = String(payload.reason ?? "").trim();
  if (reason.length < 3 || reason.length > 1000) {
    return {
      ok: false,
      status: 400,
      code: "invalid_reason",
      error: "Please provide an audit reason / justification (at least 3 characters).",
    };
  }

  const idempotencyKey = String(payload.idempotencyKey ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return {
      ok: false,
      status: 400,
      code: "invalid_idempotency_key",
      error: "Missing confirmation token. Please preview the adjustment again before confirming.",
    };
  }

  const context = await loadExamScoreAdjustmentContext(admin, examId, {
    requiredOrganizationId: consoleType === "workspace" ? activeOrgId ?? undefined : undefined,
  });
  if (!context) {
    return { ok: false, status: 404, code: "exam_not_found", error: "Examination not found." };
  }

  const auth = await authorizeScoreAdjustmentActor(
    ctx,
    context.exam.organizationId,
    consoleType,
    activeOrgId,
  );
  if (!auth.allowed) {
    return { ok: false, status: auth.status, code: "unauthorized", error: auth.error };
  }

  if (!context.plan.eligible) {
    return {
      ok: false,
      status: 403,
      code: "plan_ineligible",
      error: `Score adjustment is exclusively available for organizations on an active Institution plan (${context.exam.organizationName} is currently on ${context.plan.name}).`,
    };
  }

  if (!context.lifecycle.allowed) {
    return {
      ok: false,
      status: 409,
      code: context.lifecycle.code ?? "lifecycle_locked",
      error: context.lifecycle.reason ?? "Examination is locked for score adjustments.",
    };
  }

  const pointsRequested = normalizeAdjustmentPoints(payload.pointsRequested);
  if (pointsRequested === null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_points",
      error: "Adjustment points must be a positive number between 0.01 and 1000.",
    };
  }

  const scope: AdjustmentScope = payload.scope === "selected" ? "selected" : "all_eligible";
  const categoryKey = String(payload.categoryKey ?? "").trim();
  const category = context.categories.find(
    (c) => c.categoryType === payload.categoryType && c.categoryKey === categoryKey,
  );
  if (!category) {
    return {
      ok: false,
      status: 400,
      code: "invalid_category",
      error: "Selected grading criterion or category does not exist on this examination paper.",
    };
  }

  const selectedIds = Array.isArray(payload.attemptIds)
    ? payload.attemptIds.map((id) => String(id).trim()).filter(isUuid)
    : [];
  if (scope === "selected" && selectedIds.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "no_students_selected",
      error: "Select at least one eligible student before confirming.",
    };
  }

  const preview = buildScoreAdjustmentPreview({
    category,
    pointsRequested,
    scope,
    selectedAttemptIds: selectedIds,
    paper: context.paper,
    attempts: context.attempts,
    priorAdjustments: context.priorAdjustments,
  });

  if (!preview.canConfirm || preview.applicableRows.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "no_applicable_students",
      error:
        preview.warnings[0] ??
        "No eligible students can receive additional points for this selection.",
    };
  }

  const rpcItems = preview.applicableRows.map((row) => ({
    attempt_id: row.attemptId,
    candidate_id: row.candidateId,
    student_id: row.studentId,
    candidate_name: row.candidateName,
    category_max_score: row.categoryMaxScore,
    original_category_score: row.originalCategoryScore,
    adjusted_category_score: row.adjustedCategoryScore,
    exam_max_score: row.examMaxScore,
    original_exam_score: row.originalExamScore,
    adjusted_exam_score: row.adjustedExamScore,
    points_applied: row.pointsApplied,
    capped: row.capped,
    cap_reason: row.capReason,
  }));

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "apply_exam_score_adjustment",
    {
      p_exam_id: examId,
      p_category_type: category.categoryType,
      p_category_key: category.categoryKey,
      p_category_label: category.categoryLabel,
      p_points_requested: pointsRequested,
      p_scope: scope,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
      p_actor_id: ctx.user.id,
      p_actor_email: ctx.profile.email ?? ctx.user.email ?? null,
      p_actor_role: auth.actorRole,
      p_actor_console: consoleType,
      p_items: rpcItems,
    },
  );

  if (rpcError || !rpcResult) {
    const rawMsg = rpcError?.message ?? "Failed to apply score adjustment.";
    if (rawMsg.includes("plan_ineligible")) {
      return {
        ok: false,
        status: 403,
        code: "plan_ineligible",
        error: "Score adjustment is exclusively available for organizations on an active Institution plan.",
      };
    }
    if (rawMsg.includes("exam_already_validated")) {
      return {
        ok: false,
        status: 409,
        code: "exam_already_validated",
        error: "Results were validated before this adjustment could be applied.",
      };
    }
    if (rawMsg.includes("exam_already_published")) {
      return {
        ok: false,
        status: 409,
        code: "exam_already_published",
        error: "Results are already published and can no longer be adjusted.",
      };
    }
    if (rawMsg.includes("duplicate_submission")) {
      return {
        ok: false,
        status: 409,
        code: "duplicate_submission",
        error: "This adjustment confirmation was already submitted and recorded.",
      };
    }
    if (rawMsg.includes("duplicate_adjustment")) {
      return {
        ok: false,
        status: 409,
        code: "duplicate_adjustment",
        error: "One or more targeted students already received an adjustment for this criterion/category.",
      };
    }
    if (rawMsg.includes("score_changed_since_preview")) {
      return {
        ok: false,
        status: 409,
        code: "score_changed_since_preview",
        error: "One or more student scores changed while you were reviewing. Please preview again before confirming.",
      };
    }
    if (rawMsg.includes("unauthorized")) {
      return {
        ok: false,
        status: 403,
        code: "unauthorized",
        error: "You are not authorized to apply score adjustments to this examination.",
      };
    }
    return {
      ok: false,
      status: 500,
      code: "apply_failed",
      error: rawMsg,
    };
  }

  const result = rpcResult as {
    adjustment_id: string;
    students_affected: number;
    capped_students: number;
    total_points_added: number;
  };

  return {
    ok: true,
    adjustmentId: String(result.adjustment_id),
    studentsAffected: Number(result.students_affected ?? 0),
    cappedStudents: Number(result.capped_students ?? 0),
    totalPointsAdded: Number(result.total_points_added ?? 0),
  };
}

/**
 * Loads cumulative applied score adjustments for an attempt and returns the
 * effective clamped total score (`rawAnswersTotal + adjustments`, capped at `maxScore`).
 *
 * Degrades cleanly to `rawAnswersTotal` (clamped) if the adjustment table is absent.
 */
export async function computeAttemptScoreWithAdjustments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  attemptId: string,
  rawAnswersTotal: number,
  maxScore: number | null | undefined,
): Promise<number> {
  try {
    const { data, error } = await client
      .from("exam_score_adjustment_items")
      .select("points_applied")
      .eq("attempt_id", attemptId);
    if (error || !Array.isArray(data) || data.length === 0) {
      return computeAdjustedAttemptScore(rawAnswersTotal, maxScore, []);
    }
    const items = data.map((row: { points_applied?: number | string | null }) => ({
      pointsApplied: Number(row.points_applied ?? 0),
    }));
    return computeAdjustedAttemptScore(rawAnswersTotal, maxScore, items);
  } catch {
    return computeAdjustedAttemptScore(rawAnswersTotal, maxScore, []);
  }
}
