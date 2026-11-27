/**
 * Assessment Contributions & Grade Consolidation — server layer.
 *
 * Every mutation in this module passes through ONE authorization boundary:
 *
 *   route → authorizeAssessmentActor() → tenant/role/RBAC check → service-role
 *   client write (RLS grants no client writes on these tables) → audit event.
 *
 * Rules enforced here (never only in the UI):
 *  - the actor's ACTIVE organization is the only organization they can touch; a
 *    client-supplied organization id can never widen that;
 *  - learners, candidates, parents and participants are refused outright;
 *  - the Founder / Demo Viewer role is strictly READ-ONLY;
 *  - teachers are additionally restricted to the classes and subjects they are
 *    actually assigned to (`classes.teacher_id`, `teacher_subjects`,
 *    `class_subjects`), so they cannot reach another teacher's cohort;
 *  - publication requires the `results.publish` permission;
 *  - every write appends to `assessment_contribution_events` and
 *    `audit_logs` with actor, target, previous state, new state and reason.
 *
 * Examination data is read-only from here: papers, questions, versions,
 * candidates, sessions, attempts, answers, original marks and publication flags
 * are never modified. Consolidation writes only to its own tables.
 */

import { audit } from "./admin";
import { canOperate } from "./operationalAccess";
import {
  computeConsolidation,
  isUuid,
  normalizeScore,
  round2,
  resolveCategory,
  scorePercent,
  validateAssessmentDraft,
  type AssessmentCategory,
  type AssessmentDraft,
  type ConsolidationAssessmentInput,
  type ConsolidationAttemptInput,
  type ConsolidationProfileInput,
  type ConsolidationResult,
  type ContributionMethod,
} from "./assessmentContributions";
import {
  criterionLedgerDelta,
  foldLedgerEntries,
  groupLedgerHistory,
  normalizeAdjustmentMagnitude,
  normalizeDirection,
  normalizeReasonCode,
  planAdjustment,
  type LedgerCategoryType,
  type LedgerEntry,
} from "./gradeAdjustmentLedger";
import type { SessionContext } from "./auth";
import type { createAdminClient } from "./supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

const LEARNER_ROLES = new Set(["student", "candidate", "parent", "participant"]);
const READ_ONLY_ROLES = new Set(["school_founder"]);

export type AssessmentAction = "view" | "edit" | "publish";

export interface AssessmentAuthorization {
  allowed: boolean;
  status: number;
  error: string | null;
  role: string;
  isSuper: boolean;
  /** Founder / Demo Viewer: may read, may never write. */
  readOnly: boolean;
}

/**
 * Single authorization decision point for the whole feature.
 * `organizationId` is the organization the TARGET data belongs to — resolved
 * from the database, never from the request body.
 */
export async function authorizeAssessmentActor(
  ctx: SessionContext,
  organizationId: string,
  action: AssessmentAction,
): Promise<AssessmentAuthorization> {
  const deny = (status: number, error: string, role = "none"): AssessmentAuthorization => ({
    allowed: false,
    status,
    error,
    role,
    isSuper: false,
    readOnly: false,
  });

  if (!ctx || ctx.profile.status !== "active") return deny(403, "Your account is not active.");

  const isSuper = ctx.profile.platform_role === "super_admin";
  if (isSuper) {
    return { allowed: true, status: 200, error: null, role: "super_admin", isSuper: true, readOnly: false };
  }

  const membership = ctx.memberships.find((m) => m.organization_id === organizationId);
  if (!membership || membership.organizations?.status !== "active") {
    return deny(403, "This data does not belong to your active organization.");
  }

  const role = String(membership.role ?? "").toLowerCase();
  if (LEARNER_ROLES.has(role)) return deny(403, "Your role cannot access assessment contributions.", role);

  const readOnly = READ_ONLY_ROLES.has(role);
  if (readOnly && action !== "view") {
    return {
      allowed: false,
      status: 403,
      error: "Institutional supervision accounts are read-only and cannot modify contributions, grades or publication.",
      role,
      isSuper: false,
      readOnly: true,
    };
  }

  const required =
    action === "publish"
      ? "results.publish"
      : action === "edit"
        ? "grading.edit"
        : "grading.view";

  const allowed = await canOperate(ctx, organizationId, required, "exam_results");
  if (!allowed) {
    if (action === "view") {
      // Reading is also permitted with results.view (e.g. a supervisor-style role).
      const fallback = await canOperate(ctx, organizationId, "results.view", "exam_results");
      if (!fallback) {
        return deny(403, `Insufficient permissions (${required} required).`, role);
      }
    } else {
      return deny(
        403,
        action === "publish"
          ? "Publishing requires the Publish Results permission (results.publish)."
          : "Editing assessment contributions requires the Edit Grading permission (grading.edit).",
        role,
      );
    }
  }

  return { allowed: true, status: 200, error: null, role, isSuper: false, readOnly };
}

/**
 * Teacher scoping. Administrators, owners and Super Admin see the whole
 * organization; a teacher only sees the classes they teach and the subjects they
 * are assigned to. Returns `restricted: false` when no narrowing applies.
 */
export async function resolveTeacherScope(
  admin: AdminClient,
  organizationId: string,
  ctx: SessionContext,
): Promise<{ restricted: boolean; classIds: string[]; subjectIds: string[] }> {
  const membership = ctx.memberships.find((m) => m.organization_id === organizationId);
  const role = String(membership?.role ?? "").toLowerCase();
  if (ctx.profile.platform_role === "super_admin") return { restricted: false, classIds: [], subjectIds: [] };
  if (["owner", "admin", "school_owner", "school_admin"].includes(role)) {
    return { restricted: false, classIds: [], subjectIds: [] };
  }

  const [{ data: taughtClasses }, { data: assignedSubjects }] = await Promise.all([
    admin.from("classes").select("id").eq("organization_id", organizationId).eq("teacher_id", ctx.user.id).limit(500),
    admin
      .from("teacher_subjects")
      .select("subject_id")
      .eq("organization_id", organizationId)
      .eq("profile_id", ctx.user.id)
      .limit(500),
  ]);

  const classIds = (taughtClasses ?? []).map((row) => String(row.id));
  const subjectIds = [...new Set((assignedSubjects ?? []).map((row) => String(row.subject_id)))];

  // A teacher assigned to a subject also reaches the classes that teach it.
  if (subjectIds.length > 0) {
    const { data: classSubjectRows } = await admin
      .from("class_subjects")
      .select("class_id")
      .in("subject_id", subjectIds)
      .limit(1000);
    for (const row of classSubjectRows ?? []) {
      const id = String(row.class_id);
      if (!classIds.includes(id)) classIds.push(id);
    }
  }

  return { restricted: classIds.length > 0 || subjectIds.length > 0, classIds, subjectIds };
}

// ─────────────────────────────── Audit helper ───────────────────────────────

export interface AuditEventInput {
  organizationId: string;
  eventType: string;
  contributionId?: string | null;
  profileId?: string | null;
  attemptId?: string | null;
  studentId?: string | null;
  actorRole?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string | null;
}

async function recordEvent(
  admin: AdminClient,
  ctx: SessionContext,
  input: AuditEventInput,
): Promise<void> {
  await admin.from("assessment_contribution_events").insert({
    organization_id: input.organizationId,
    contribution_id: input.contributionId ?? null,
    profile_id: input.profileId ?? null,
    attempt_id: input.attemptId ?? null,
    student_id: input.studentId ?? null,
    event_type: input.eventType,
    actor_id: ctx.user.id,
    actor_email: ctx.profile.email ?? ctx.user.email ?? null,
    actor_role: input.actorRole ?? null,
    previous_state: input.previousState ?? null,
    new_state: input.newState ?? null,
    reason: input.reason ?? null,
  });

  await admin.from("audit_logs").insert({
    actor_id: ctx.user.id,
    organization_id: input.organizationId,
    action: `assessment.${input.eventType}`,
    entity: input.contributionId ? "assessment_contributions" : "grade_consolidation_profiles",
    entity_id: input.contributionId ?? input.profileId ?? input.attemptId ?? null,
    metadata: {
      event_type: input.eventType,
      student_id: input.studentId ?? null,
      reason: input.reason ?? null,
      previous_state: input.previousState ?? null,
      new_state: input.newState ?? null,
    },
  });
}

// ────────────────────────────── Workspace load ──────────────────────────────

export interface AssessmentWorkspace {
  organizationId: string;
  organizationName: string;
  categories: AssessmentCategory[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string; code: string | null }[];
  academicYears: { id: string; name: string; isCurrent: boolean }[];
  exams: { id: string; title: string; status: string; published: boolean }[];
  contributions: AssessmentSummary[];
  authorization: { canEdit: boolean; canPublish: boolean; readOnly: boolean; role: string };
  scope: { restricted: boolean; classIds: string[]; subjectIds: string[] };
}

export interface AssessmentSummary {
  id: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  assessedOn: string;
  maxScore: number;
  scope: string;
  status: string;
  subjectId: string | null;
  subjectName: string | null;
  classId: string | null;
  className: string | null;
  examId: string | null;
  examTitle: string | null;
  termLabel: string | null;
  contributionMethod: string;
  contributesToResult: boolean;
  recordedCount: number;
  averagePercent: number | null;
  createdAt: string;
}

export async function loadAssessmentWorkspace(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
): Promise<AssessmentWorkspace | null> {
  const auth = await authorizeAssessmentActor(ctx, organizationId, "view");
  if (!auth.allowed) return null;

  const [{ data: orgRow }, { data: customRows }, { data: classRows }, { data: subjectRows }, { data: yearRows }, { data: examRows }] =
    await Promise.all([
      admin.from("organizations").select("id, name, status").eq("id", organizationId).maybeSingle(),
      admin.from("assessment_categories").select("key, label, description, is_active").eq("organization_id", organizationId).order("label").limit(200),
      admin.from("classes").select("id, name").eq("organization_id", organizationId).order("name").limit(500),
      admin.from("subjects").select("id, name, code").eq("organization_id", organizationId).order("name").limit(500),
      admin.from("academic_years").select("id, name, is_current").eq("organization_id", organizationId).order("name").limit(100),
      admin
        .from("exams")
        .select("id, title, status, settings, grades_published_at")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  if (!orgRow) return null;

  const scope = await resolveTeacherScope(admin, organizationId, ctx);
  const visibleClasses = scope.restricted
    ? (classRows ?? []).filter((row) => scope.classIds.includes(String(row.id)))
    : (classRows ?? []);
  const visibleSubjects = scope.restricted && scope.subjectIds.length > 0
    ? (subjectRows ?? []).filter((row) => scope.subjectIds.includes(String(row.id)))
    : (subjectRows ?? []);

  const categories: AssessmentCategory[] = [
    ...(await builtInCategories()),
    ...(customRows ?? [])
      .filter((row) => row.is_active !== false)
      .map((row) => ({
        key: String(row.key),
        label: String(row.label),
        builtin: false,
        description: row.description ? String(row.description) : undefined,
      })),
  ];

  let contributionsQuery = admin
    .from("assessment_contributions")
    .select(
      "id, title, category_key, category_label, assessed_on, max_score, scope, status, subject_id, class_id, exam_id, term_label, contribution_method, contributes_to_result, created_at, subject:subjects(id, name), class:classes(id, name), exam:exams(id, title)",
    )
    .eq("organization_id", organizationId)
    .order("assessed_on", { ascending: false })
    .limit(400);

  if (scope.restricted && scope.classIds.length > 0) {
    contributionsQuery = contributionsQuery.in("class_id", [...scope.classIds]);
  }

  const { data: contributionRows } = await contributionsQuery;

  const contributionIds = (contributionRows ?? []).map((row) => String(row.id));
  const scoreCounts = new Map<string, { count: number; totalPercent: number }>();
  for (let i = 0; i < contributionIds.length; i += 100) {
    const chunk = contributionIds.slice(i, i + 100);
    const { data: scoreRows } = await admin
      .from("assessment_contribution_scores")
      .select("contribution_id, score, max_score, status")
      .in("contribution_id", chunk)
      .limit(20000);
    for (const row of scoreRows ?? []) {
      if (row.status === "excluded") continue;
      const id = String(row.contribution_id);
      const entry = scoreCounts.get(id) ?? { count: 0, totalPercent: 0 };
      entry.count += 1;
      entry.totalPercent += scorePercent(Number(row.score ?? 0), Number(row.max_score ?? 0));
      scoreCounts.set(id, entry);
    }
  }

  const contributions: AssessmentSummary[] = (contributionRows ?? []).map((row) => {
    const stats = scoreCounts.get(String(row.id));
    const subject = row.subject as unknown as { name: string | null } | null;
    const klass = row.class as unknown as { name: string | null } | null;
    const exam = row.exam as unknown as { title: string | null } | null;
    return {
      id: String(row.id),
      title: String(row.title),
      categoryKey: String(row.category_key),
      categoryLabel: String(row.category_label),
      assessedOn: String(row.assessed_on),
      maxScore: Number(row.max_score),
      scope: String(row.scope),
      status: String(row.status),
      subjectId: row.subject_id ? String(row.subject_id) : null,
      subjectName: subject?.name ? String(subject.name) : null,
      classId: row.class_id ? String(row.class_id) : null,
      className: klass?.name ? String(klass.name) : null,
      examId: row.exam_id ? String(row.exam_id) : null,
      examTitle: exam?.title ? String(exam.title) : null,
      termLabel: row.term_label ? String(row.term_label) : null,
      contributionMethod: String(row.contribution_method),
      contributesToResult: Boolean(row.contributes_to_result),
      recordedCount: stats?.count ?? 0,
      averagePercent: stats && stats.count > 0 ? round2(stats.totalPercent / stats.count) : null,
      createdAt: String(row.created_at),
    };
  });

  const editAuth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  const publishAuth = await authorizeAssessmentActor(ctx, organizationId, "publish");

  return {
    organizationId,
    organizationName: String(orgRow.name ?? "Organization"),
    categories,
    classes: visibleClasses.map((row) => ({ id: String(row.id), name: String(row.name) })),
    subjects: visibleSubjects.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      code: row.code ? String(row.code) : null,
    })),
    academicYears: (yearRows ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      isCurrent: Boolean(row.is_current),
    })),
    exams: (examRows ?? []).map((row) => {
      const settings = (row.settings ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        published: settings.results_published === true || Boolean(row.grades_published_at),
      };
    }),
    contributions,
    authorization: {
      canEdit: editAuth.allowed,
      canPublish: publishAuth.allowed,
      readOnly: auth.readOnly,
      role: auth.role,
    },
    scope,
  };
}

async function builtInCategories(): Promise<AssessmentCategory[]> {
  const { BUILT_IN_ASSESSMENT_CATEGORIES } = await import("./assessmentContributions");
  return BUILT_IN_ASSESSMENT_CATEGORIES.map((category) => ({ ...category }));
}

// ─────────────────────────── Create / update assessment ─────────────────────

export type AssessmentMutationResult =
  | { ok: true; id: string }
  | { ok: false; status: number; code: string; error: string; fieldErrors?: { field: string; message: string }[] };

export interface CreateAssessmentPayload {
  title?: unknown;
  categoryKey?: unknown;
  assessedOn?: unknown;
  maxScore?: unknown;
  description?: unknown;
  subjectId?: unknown;
  classId?: unknown;
  academicYearId?: unknown;
  termLabel?: unknown;
  examId?: unknown;
  scope?: unknown;
  criterionCode?: unknown;
  framework?: unknown;
  source?: unknown;
  teacherComment?: unknown;
  contributionMethod?: unknown;
  contributionWeight?: unknown;
  contributionPoints?: unknown;
  contributesToResult?: unknown;
  /** Optional first scores for an individual assessment (single student). */
  scores?: { studentId: string; score: unknown; comment?: unknown }[];
}

/** Verifies that the class / subject / exam referenced by a payload really are
 * the organization's own, and inside the teacher's assignment scope. */
async function assertReferences(
  admin: AdminClient,
  organizationId: string,
  draft: AssessmentDraft,
  scope: { restricted: boolean; classIds: string[]; subjectIds: string[] },
): Promise<string | null> {
  if (draft.classId) {
    const { data } = await admin
      .from("classes")
      .select("id, organization_id, teacher_id")
      .eq("id", draft.classId)
      .maybeSingle();
    if (!data || String(data.organization_id) !== organizationId) return "class_not_found";
    if (scope.restricted && !scope.classIds.includes(draft.classId)) return "class_not_assigned";
  }
  if (draft.subjectId) {
    const { data } = await admin
      .from("subjects")
      .select("id, organization_id")
      .eq("id", draft.subjectId)
      .maybeSingle();
    if (!data || String(data.organization_id) !== organizationId) return "subject_not_found";
    if (scope.restricted && scope.subjectIds.length > 0 && !scope.subjectIds.includes(draft.subjectId)) {
      return "subject_not_assigned";
    }
  }
  if (draft.examId) {
    const { data } = await admin
      .from("exams")
      .select("id, organization_id, deleted_at")
      .eq("id", draft.examId)
      .maybeSingle();
    if (!data || String(data.organization_id) !== organizationId || data.deleted_at) return "exam_not_found";
  }
  if (draft.academicYearId) {
    const { data } = await admin
      .from("academic_years")
      .select("id, organization_id")
      .eq("id", draft.academicYearId)
      .maybeSingle();
    if (!data || String(data.organization_id) !== organizationId) return "academic_year_not_found";
  }
  return null;
}

const REFERENCE_MESSAGES: Record<string, string> = {
  class_not_found: "The selected class does not exist in your organization.",
  class_not_assigned: "You are not assigned to the selected class.",
  subject_not_found: "The selected subject does not exist in your organization.",
  subject_not_assigned: "You are not assigned to the selected subject.",
  exam_not_found: "The selected examination does not exist in your organization.",
  academic_year_not_found: "The selected academic year does not exist in your organization.",
};

export async function createAssessment(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  payload: CreateAssessmentPayload,
): Promise<AssessmentMutationResult> {
  const auth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const { data: customRows } = await admin
    .from("assessment_categories")
    .select("key, label, description")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  const validated = validateAssessmentDraft(payload, {
    customCategories: (customRows ?? []).map((row) => ({
      key: String(row.key),
      label: String(row.label),
      builtin: false,
      description: row.description ? String(row.description) : undefined,
    })),
  });
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      code: "invalid_assessment",
      error: validated.errors[0]?.message ?? "The assessment record is not valid.",
      fieldErrors: validated.errors,
    };
  }
  const draft = validated.value;

  const scope = await resolveTeacherScope(admin, organizationId, ctx);
  const refError = await assertReferences(admin, organizationId, draft, scope);
  if (refError) {
    return { ok: false, status: 403, code: refError, error: REFERENCE_MESSAGES[refError] ?? "Invalid reference." };
  }

  const { data: created, error } = await admin
    .from("assessment_contributions")
    .insert({
      organization_id: organizationId,
      title: draft.title,
      category_key: draft.categoryKey,
      category_label: draft.categoryLabel,
      category_is_builtin: draft.categoryIsBuiltin,
      assessed_on: draft.assessedOn,
      description: draft.description,
      subject_id: draft.subjectId,
      class_id: draft.classId,
      academic_year_id: draft.academicYearId,
      term_label: draft.termLabel,
      exam_id: draft.examId,
      scope: draft.scope,
      max_score: draft.maxScore,
      criterion_code: draft.criterionCode,
      framework: draft.framework,
      source: draft.source,
      teacher_comment: draft.teacherComment,
      contribution_method: draft.contributionMethod,
      contribution_weight: draft.contributionWeight,
      contribution_points: draft.contributionPoints,
      contributes_to_result: draft.contributesToResult,
      status: "draft",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { ok: false, status: 500, code: "create_failed", error: error?.message ?? "Could not create the assessment." };
  }
  const id = String(created.id);

  // An individual assessment may arrive with its single score already filled in.
  const initialScores = Array.isArray(payload.scores) ? payload.scores : [];
  if (initialScores.length > 0) {
    await saveScoresInternal(admin, ctx, organizationId, id, draft.maxScore, initialScores, auth.role);
  }

  await recordEvent(admin, ctx, {
    organizationId,
    eventType: "created",
    contributionId: id,
    actorRole: auth.role,
    newState: { ...draft },
    reason: draft.scope === "individual" ? "Individual assessment created" : "Class-wide assessment created",
  });
  await audit(ctx, "assessment.created", "assessment_contributions", id, organizationId, {
    title: draft.title,
    category: draft.categoryKey,
    scope: draft.scope,
  });

  return { ok: true, id };
}

export async function updateAssessment(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  assessmentId: string,
  payload: CreateAssessmentPayload,
): Promise<AssessmentMutationResult> {
  if (!isUuid(assessmentId)) return { ok: false, status: 400, code: "invalid_id", error: "Invalid assessment ID." };

  const auth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const { data: existing, error: readError } = await admin
    .from("assessment_contributions")
    .select("*")
    .eq("id", assessmentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (readError || !existing) {
    return { ok: false, status: 404, code: "not_found", error: "Assessment not found in your organization." };
  }

  const { data: customRows } = await admin
    .from("assessment_categories")
    .select("key, label, description")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  const merged: CreateAssessmentPayload = {
    title: payload.title ?? existing.title,
    categoryKey: payload.categoryKey ?? existing.category_key,
    assessedOn: payload.assessedOn ?? existing.assessed_on,
    maxScore: payload.maxScore ?? existing.max_score,
    description: payload.description !== undefined ? payload.description : existing.description,
    subjectId: payload.subjectId !== undefined ? payload.subjectId : existing.subject_id,
    classId: payload.classId !== undefined ? payload.classId : existing.class_id,
    academicYearId: payload.academicYearId !== undefined ? payload.academicYearId : existing.academic_year_id,
    termLabel: payload.termLabel !== undefined ? payload.termLabel : existing.term_label,
    examId: payload.examId !== undefined ? payload.examId : existing.exam_id,
    scope: payload.scope ?? existing.scope,
    criterionCode: payload.criterionCode !== undefined ? payload.criterionCode : existing.criterion_code,
    framework: payload.framework ?? existing.framework,
    source: payload.source ?? existing.source,
    teacherComment: payload.teacherComment !== undefined ? payload.teacherComment : existing.teacher_comment,
    contributionMethod: payload.contributionMethod ?? existing.contribution_method,
    contributionWeight: payload.contributionWeight ?? existing.contribution_weight,
    contributionPoints: payload.contributionPoints ?? existing.contribution_points,
    contributesToResult:
      payload.contributesToResult !== undefined
        ? payload.contributesToResult
        : existing.contributes_to_result,
  };

  const validated = validateAssessmentDraft(merged, {
    customCategories: (customRows ?? []).map((row) => ({
      key: String(row.key),
      label: String(row.label),
      builtin: false,
      description: row.description ? String(row.description) : undefined,
    })),
  });
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      code: "invalid_assessment",
      error: validated.errors[0]?.message ?? "The assessment record is not valid.",
      fieldErrors: validated.errors,
    };
  }
  const draft = validated.value;

  const scope = await resolveTeacherScope(admin, organizationId, ctx);
  const refError = await assertReferences(admin, organizationId, draft, scope);
  if (refError) {
    return { ok: false, status: 403, code: refError, error: REFERENCE_MESSAGES[refError] ?? "Invalid reference." };
  }

  // Raising the maximum below an already-recorded score would silently invalidate
  // that score, so it is refused instead of applied.
  if (draft.maxScore < Number(existing.max_score)) {
    const { data: above } = await admin
      .from("assessment_contribution_scores")
      .select("id")
      .eq("contribution_id", assessmentId)
      .gt("score", draft.maxScore)
      .limit(1);
    if ((above ?? []).length > 0) {
      return {
        ok: false,
        status: 409,
        code: "scores_above_new_max",
        error: "Recorded scores are higher than the new maximum. Re-record those scores first.",
      };
    }
  }

  const { error } = await admin
    .from("assessment_contributions")
    .update({
      title: draft.title,
      category_key: draft.categoryKey,
      category_label: draft.categoryLabel,
      category_is_builtin: draft.categoryIsBuiltin,
      assessed_on: draft.assessedOn,
      description: draft.description,
      subject_id: draft.subjectId,
      class_id: draft.classId,
      academic_year_id: draft.academicYearId,
      term_label: draft.termLabel,
      exam_id: draft.examId,
      scope: draft.scope,
      max_score: draft.maxScore,
      criterion_code: draft.criterionCode,
      framework: draft.framework,
      teacher_comment: draft.teacherComment,
      contribution_method: draft.contributionMethod,
      contribution_weight: draft.contributionWeight,
      contribution_points: draft.contributionPoints,
      contributes_to_result: draft.contributesToResult,
    })
    .eq("id", assessmentId)
    .eq("organization_id", organizationId);

  if (error) return { ok: false, status: 500, code: "update_failed", error: error.message };

  await recordEvent(admin, ctx, {
    organizationId,
    eventType: "updated",
    contributionId: assessmentId,
    actorRole: auth.role,
    previousState: publicState(existing),
    newState: publicState(draft),
    reason: "Assessment details updated",
  });
  await audit(ctx, "assessment.updated", "assessment_contributions", assessmentId, organizationId, {});

  return { ok: true, id: assessmentId };
}

function publicState(value: object): Record<string, unknown> {
  // Timestamps are the database's own bookkeeping, not part of the state an
  // auditor is being shown changed — strip them and keep everything else.
  const rest: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete rest.created_at;
  delete rest.updated_at;
  return rest;
}

// ─────────────────────────────── Score entry ────────────────────────────────

export interface ScoreEntryPayload {
  studentId: string;
  score: unknown;
  comment?: unknown;
  criterionCode?: unknown;
  excluded?: boolean;
  attemptId?: string | null;
}

export type ScoreSaveResult =
  | { ok: true; saved: number; skipped: { studentId: string; error: string }[] }
  | { ok: false; status: number; code: string; error: string };

async function saveScoresInternal(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  contributionId: string,
  assessmentMaxScore: number,
  entries: ScoreEntryPayload[],
  actorRole: string,
): Promise<ScoreSaveResult> {
  const { data: studentRows } = await admin
    .from("students")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .in(
      "id",
      entries.map((e) => e.studentId).filter(isUuid),
    )
    .limit(2000);
  const students = new Map((studentRows ?? []).map((row) => [String(row.id), String(row.full_name)]));

  const saved: string[] = [];
  const skipped: { studentId: string; error: string }[] = [];
  const events: {
    studentId: string;
    studentName: string;
    type: string;
    previous: Record<string, unknown> | null;
    next: Record<string, unknown>;
  }[] = [];

  for (const entry of entries) {
    const studentId = String(entry.studentId ?? "").trim();
    const studentName = students.get(studentId);
    if (!studentId || !isUuid(studentId) || !studentName) {
      skipped.push({ studentId, error: "Student not found in your organization." });
      continue;
    }

    const { data: prior } = await admin
      .from("assessment_contribution_scores")
      .select("id, score, max_score, comment, status")
      .eq("contribution_id", contributionId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (entry.excluded === true) {
      if (!prior) {
        skipped.push({ studentId, error: "No recorded score to exclude." });
        continue;
      }
      await admin
        .from("assessment_contribution_scores")
        .update({ status: "excluded", updated_at: new Date().toISOString() })
        .eq("id", String(prior.id));
      events.push({
        studentId,
        studentName,
        type: "score_excluded",
        previous: { score: Number(prior.score), maxScore: Number(prior.max_score), status: String(prior.status) },
        next: { status: "excluded" },
      });
      continue;
    }

    const normalized = normalizeScore(entry.score, assessmentMaxScore);
    if (!normalized.ok) {
      skipped.push({ studentId, error: normalized.error });
      continue;
    }

    const row = {
      contribution_id: contributionId,
      organization_id: organizationId,
      student_id: studentId,
      attempt_id: isUuid(entry.attemptId) ? String(entry.attemptId) : null,
      student_name: studentName,
      score: normalized.score,
      max_score: round2(assessmentMaxScore),
      criterion_code:
        typeof entry.criterionCode === "string" && entry.criterionCode.trim()
          ? entry.criterionCode.trim().toUpperCase()
          : null,
      comment: typeof entry.comment === "string" ? entry.comment.trim().slice(0, 2000) || null : null,
      status: "recorded" as const,
      recorded_by: ctx.user.id,
    };

    if (prior) {
      const { error } = await admin
        .from("assessment_contribution_scores")
        .update({ ...row, contribution_id: undefined, organization_id: undefined, student_id: undefined })
        .eq("id", String(prior.id));
      if (error) {
        skipped.push({ studentId, error: error.message });
        continue;
      }
      events.push({
        studentId,
        studentName,
        type: "score_modified",
        previous: { score: Number(prior.score), maxScore: Number(prior.max_score), status: String(prior.status) },
        next: { score: normalized.score, maxScore: row.max_score, status: "recorded" },
      });
    } else {
      const { error } = await admin.from("assessment_contribution_scores").insert(row);
      if (error) {
        skipped.push({ studentId, error: error.message });
        continue;
      }
      events.push({
        studentId,
        studentName,
        type: "score_recorded",
        previous: null,
        next: { score: normalized.score, maxScore: row.max_score, status: "recorded" },
      });
    }
    saved.push(studentId);
  }

  for (const event of events) {
    await recordEvent(admin, ctx, {
      organizationId,
      eventType: event.type,
      contributionId,
      studentId: event.studentId,
      actorRole,
      previousState: event.previous,
      newState: { ...event.next, student_name: event.studentName },
      reason: event.type === "score_modified" ? "Score re-entered" : undefined,
    });
  }

  return { ok: true, saved: saved.length, skipped };
}

/**
 * Class-wide OR individual score entry. Bulk is a convenience, never a
 * requirement: a single entry updates exactly one student and cannot touch
 * another student's score.
 */
export async function saveAssessmentScores(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  contributionId: string,
  entries: ScoreEntryPayload[],
): Promise<ScoreSaveResult> {
  if (!isUuid(contributionId)) return { ok: false, status: 400, code: "invalid_id", error: "Invalid assessment ID." };
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, status: 400, code: "no_entries", error: "Provide at least one score." };
  }
  if (entries.length > 2000) {
    return { ok: false, status: 400, code: "too_many_entries", error: "Save at most 2000 scores at a time." };
  }

  const auth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const { data: assessment } = await admin
    .from("assessment_contributions")
    .select("id, organization_id, max_score, status, class_id, subject_id")
    .eq("id", contributionId)
    .maybeSingle();
  if (!assessment || String(assessment.organization_id) !== organizationId) {
    return { ok: false, status: 404, code: "not_found", error: "Assessment not found in your organization." };
  }

  const scope = await resolveTeacherScope(admin, organizationId, ctx);
  if (scope.restricted) {
    if (assessment.class_id && !scope.classIds.includes(String(assessment.class_id))) {
      return { ok: false, status: 403, code: "class_not_assigned", error: "You are not assigned to this assessment's class." };
    }
    if (assessment.subject_id && scope.subjectIds.length > 0 && !scope.subjectIds.includes(String(assessment.subject_id))) {
      return { ok: false, status: 403, code: "subject_not_assigned", error: "You are not assigned to this assessment's subject." };
    }
  }

  const result = await saveScoresInternal(
    admin,
    ctx,
    organizationId,
    contributionId,
    Number(assessment.max_score),
    entries,
    auth.role,
  );

  if (result.ok && result.saved > 0) {
    await audit(ctx, "assessment.scores_saved", "assessment_contributions", contributionId, organizationId, {
      saved: result.saved,
      skipped: result.skipped.length,
    });
  }
  return result;
}

/** Publish / unpublish / archive an assessment. Publication needs results.publish. */
export async function setAssessmentStatus(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  contributionId: string,
  status: "draft" | "published" | "archived",
): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> {
  if (!isUuid(contributionId)) return { ok: false, status: 400, code: "invalid_id", error: "Invalid assessment ID." };

  const action: AssessmentAction = status === "published" ? "publish" : "edit";
  const auth = await authorizeAssessmentActor(ctx, organizationId, action);
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const { data: existing } = await admin
    .from("assessment_contributions")
    .select("id, organization_id, status")
    .eq("id", contributionId)
    .maybeSingle();
  if (!existing || String(existing.organization_id) !== organizationId) {
    return { ok: false, status: 404, code: "not_found", error: "Assessment not found in your organization." };
  }

  const patch: Record<string, unknown> = { status };
  if (status === "published") {
    patch.published_at = new Date().toISOString();
    patch.published_by = ctx.user.id;
  }

  const { error } = await admin
    .from("assessment_contributions")
    .update(patch)
    .eq("id", contributionId)
    .eq("organization_id", organizationId);
  if (error) return { ok: false, status: 500, code: "update_failed", error: error.message };

  const eventType = status === "published" ? "published" : status === "archived" ? "archived" : "unpublished";
  await recordEvent(admin, ctx, {
    organizationId,
    eventType,
    contributionId,
    actorRole: auth.role,
    previousState: { status: String(existing.status) },
    newState: { status },
    reason: `Assessment ${status}`,
  });
  await audit(ctx, `assessment.${eventType}`, "assessment_contributions", contributionId, organizationId, {});
  return { ok: true };
}

/** Organization-defined assessment category (built-in keys are rejected by SQL). */
export async function createAssessmentCategory(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  payload: { key?: unknown; label?: unknown; description?: unknown },
): Promise<{ ok: true; key: string } | { ok: false; status: number; code: string; error: string }> {
  const auth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const key = String(payload.key ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
  const label = String(payload.label ?? "").trim().slice(0, 80);
  if (key.length < 2 || label.length < 2) {
    return { ok: false, status: 400, code: "invalid_category", error: "A category key and label are required." };
  }

  const { error } = await admin.from("assessment_categories").insert({
    organization_id: organizationId,
    key,
    label,
    description: String(payload.description ?? "").trim().slice(0, 500) || null,
    created_by: ctx.user.id,
  });
  if (error) {
    if (error.message.includes("reserved_category_key")) {
      return { ok: false, status: 409, code: "reserved_category_key", error: "That category is built in and cannot be redefined." };
    }
    if (error.code === "23505") {
      return { ok: false, status: 409, code: "duplicate_category", error: "That category already exists." };
    }
    return { ok: false, status: 500, code: "create_failed", error: error.message };
  }

  await recordEvent(admin, ctx, {
    organizationId,
    eventType: "created",
    actorRole: auth.role,
    newState: { assessment_category: key, label },
    reason: "Custom assessment category defined",
  });
  return { ok: true, key };
}

// ───────────────────────────── Assessment detail ────────────────────────────

export interface AssessmentDetail {
  id: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  assessedOn: string;
  description: string | null;
  maxScore: number;
  scope: string;
  status: string;
  termLabel: string | null;
  framework: string;
  criterionCode: string | null;
  source: string;
  teacherComment: string | null;
  contributionMethod: string;
  contributionWeight: number;
  contributionPoints: number;
  contributesToResult: boolean;
  subject: { id: string; name: string } | null;
  klass: { id: string; name: string } | null;
  exam: { id: string; title: string; published: boolean } | null;
  academicYear: { id: string; name: string } | null;
  scores: AssessmentScoreRow[];
  roster: { studentId: string; name: string; hasScore: boolean }[];
  events: AssessmentEventRow[];
}

export interface AssessmentScoreRow {
  id: string;
  studentId: string;
  studentName: string;
  attemptId: string | null;
  score: number;
  maxScore: number;
  percent: number;
  criterionCode: string | null;
  comment: string | null;
  status: string;
  updatedAt: string;
}

export interface AssessmentEventRow {
  id: string;
  eventType: string;
  studentId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  reason: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  createdAt: string;
}

export async function loadAssessmentDetail(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  contributionId: string,
): Promise<AssessmentDetail | null> {
  if (!isUuid(contributionId)) return null;
  const auth = await authorizeAssessmentActor(ctx, organizationId, "view");
  if (!auth.allowed) return null;

  const { data: row } = await admin
    .from("assessment_contributions")
    .select(
      "*, subject:subjects(id, name), class:classes(id, name, organization_id), exam:exams(id, title, settings, grades_published_at), academic_year:academic_years(id, name)",
    )
    .eq("id", contributionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) return null;

  const { data: scoreRows } = await admin
    .from("assessment_contribution_scores")
    .select("*")
    .eq("contribution_id", contributionId)
    .order("student_name")
    .limit(2000);

  const { data: eventRows } = await admin
    .from("assessment_contribution_events")
    .select("id, event_type, student_id, actor_email, actor_role, reason, previous_state, new_state, created_at")
    .eq("contribution_id", contributionId)
    .order("created_at", { ascending: false })
    .limit(300);

  const scores: AssessmentScoreRow[] = (scoreRows ?? []).map((score) => ({
    id: String(score.id),
    studentId: String(score.student_id),
    studentName: String(score.student_name),
    attemptId: score.attempt_id ? String(score.attempt_id) : null,
    score: Number(score.score),
    maxScore: Number(score.max_score),
    percent: scorePercent(Number(score.score), Number(score.max_score)),
    criterionCode: score.criterion_code ? String(score.criterion_code) : null,
    comment: score.comment ? String(score.comment) : null,
    status: String(score.status),
    updatedAt: String(score.updated_at),
  }));

  // The class roster: every applicable student appears in the gradebook whether
  // or not a score has been entered yet.
  const roster: { studentId: string; name: string; hasScore: boolean }[] = [];
  if (row.class_id) {
    const { data: enrollmentRows } = await admin
      .from("student_enrollments")
      .select("student_id, status, student:students(id, full_name)")
      .eq("class_id", String(row.class_id))
      .eq("status", "active")
      .limit(2000);
    const scoredIds = new Set(scores.map((s) => s.studentId));
    for (const enrollment of enrollmentRows ?? []) {
      const student = enrollment.student as unknown as { id: string; full_name: string } | null;
      if (!student) continue;
      roster.push({
        studentId: String(student.id),
        name: String(student.full_name),
        hasScore: scoredIds.has(String(student.id)),
      });
    }
    roster.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  const exam = row.exam as unknown as
    | { id: string; title: string; settings: Record<string, unknown> | null; grades_published_at: string | null }
    | null;
  const klass = row.class as unknown as { id: string; name: string } | null;
  const subject = row.subject as unknown as { id: string; name: string } | null;
  const year = row.academic_year as unknown as { id: string; name: string } | null;

  return {
    id: String(row.id),
    title: String(row.title),
    categoryKey: String(row.category_key),
    categoryLabel: String(row.category_label),
    assessedOn: String(row.assessed_on),
    description: row.description ? String(row.description) : null,
    maxScore: Number(row.max_score),
    scope: String(row.scope),
    status: String(row.status),
    termLabel: row.term_label ? String(row.term_label) : null,
    framework: String(row.framework),
    criterionCode: row.criterion_code ? String(row.criterion_code) : null,
    source: String(row.source),
    teacherComment: row.teacher_comment ? String(row.teacher_comment) : null,
    contributionMethod: String(row.contribution_method),
    contributionWeight: Number(row.contribution_weight),
    contributionPoints: Number(row.contribution_points),
    contributesToResult: Boolean(row.contributes_to_result),
    subject: subject ? { id: String(subject.id), name: String(subject.name) } : null,
    klass: klass ? { id: String(klass.id), name: String(klass.name) } : null,
    exam: exam
      ? {
          id: String(exam.id),
          title: String(exam.title),
          published: exam.settings?.results_published === true || Boolean(exam.grades_published_at),
        }
      : null,
    academicYear: year ? { id: String(year.id), name: String(year.name) } : null,
    scores,
    roster,
    events: (eventRows ?? []).map((event) => ({
      id: String(event.id),
      eventType: String(event.event_type),
      studentId: event.student_id ? String(event.student_id) : null,
      actorEmail: event.actor_email ? String(event.actor_email) : null,
      actorRole: event.actor_role ? String(event.actor_role) : null,
      reason: event.reason ? String(event.reason) : null,
      previousState: (event.previous_state ?? null) as Record<string, unknown> | null,
      newState: (event.new_state ?? null) as Record<string, unknown> | null,
      createdAt: String(event.created_at),
    })),
  };
}

// ─────────────────────── Unlimited individual adjustments ───────────────────

export interface AdjustmentLedgerContext {
  exam: {
    id: string;
    title: string;
    organizationId: string;
    resultsPublished: boolean;
    resultsValidated: boolean;
  };
  attempts: AdjustmentLedgerAttempt[];
  entries: LedgerEntry[];
  canEdit: boolean;
  canPublish: boolean;
}

export interface AdjustmentLedgerAttempt {
  attemptId: string;
  studentId: string | null;
  candidateId: string | null;
  candidateName: string;
  className: string | null;
  status: string;
  originalExamScore: number;
  examMaxScore: number;
  effectiveExamScore: number;
  categories: { type: LedgerCategoryType; key: string; label: string; maxScore: number; currentValue: number }[];
  history: ReturnType<typeof groupLedgerHistory>;
}

/**
 * Loads the unlimited adjustment ledger for one examination. The ORIGINAL score
 * on `exam_attempts.score` is read as the immutable baseline; the effective
 * score is derived from the ledger, never stored over the original.
 */
export async function loadAdjustmentLedgerContext(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  examId: string,
): Promise<AdjustmentLedgerContext | null> {
  if (!isUuid(examId)) return null;
  const auth = await authorizeAssessmentActor(ctx, organizationId, "view");
  if (!auth.allowed) return null;

  const { data: examRow } = await admin
    .from("exams")
    .select("id, title, organization_id, settings, grades_published_at, deleted_at")
    .eq("id", examId)
    .maybeSingle();
  if (!examRow || String(examRow.organization_id) !== organizationId || examRow.deleted_at) return null;

  const settings = (examRow.settings ?? {}) as Record<string, unknown>;

  const { data: attemptRows } = await admin
    .from("exam_attempts")
    .select(
      "id, candidate_id, student_id, first_name, last_name, status, score, max_score, class:classes(id, name), candidate:exam_candidates(id, full_name, email)",
    )
    .eq("exam_id", examId)
    .order("started_at", { ascending: true })
    .limit(2000);

  const { data: entryRows } = await admin
    .from("exam_grade_adjustment_entries")
    .select("*")
    .eq("exam_id", examId)
    .order("created_at", { ascending: true })
    .limit(20000);

  const entriesByAttempt = new Map<string, LedgerEntry[]>();
  const entries: LedgerEntry[] = [];
  for (const row of entryRows ?? []) {
    const entry = mapLedgerEntry(row);
    entries.push(entry);
    const list = entriesByAttempt.get(entry.attemptId) ?? [];
    list.push(entry);
    entriesByAttempt.set(entry.attemptId, list);
  }

  const attempts: AdjustmentLedgerAttempt[] = (attemptRows ?? []).map((row) => {
    const attemptId = String(row.id);
    const attemptEntries = entriesByAttempt.get(attemptId) ?? [];
    const originalExamScore = round2(Number(row.score ?? 0));
    const examMaxScore = round2(Number(row.max_score ?? 0));
    const candidate = row.candidate as unknown as { full_name: string | null; email: string | null } | null;
    const klass = row.class as unknown as { name: string | null } | null;
    const fallback = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();

    const overallEntries = attemptEntries.filter((e) => e.categoryType === "overall");
    const effectiveExamScore = foldLedgerEntries(originalExamScore, examMaxScore, overallEntries);

    const categoryEntries = new Map<string, LedgerEntry[]>();
    for (const entry of attemptEntries) {
      const key = `${entry.categoryType}:${entry.categoryKey}`;
      const list = categoryEntries.get(key) ?? [];
      list.push(entry);
      categoryEntries.set(key, list);
    }

    const categories = [...categoryEntries.entries()].map(([key, list]) => {
      const [type, ...rest] = key.split(":");
      const categoryKey = rest.join(":");
      const latest = list[list.length - 1];
      return {
        type: type as LedgerCategoryType,
        key: categoryKey,
        label: latest.categoryLabel,
        maxScore: latest.categoryMaxScore,
        currentValue: latest.newValue,
      };
    });

    return {
      attemptId,
      studentId: row.student_id ? String(row.student_id) : null,
      candidateId: row.candidate_id ? String(row.candidate_id) : null,
      candidateName:
        candidate?.full_name?.trim() || fallback || candidate?.email?.trim() || `Candidate ${attemptId.slice(0, 6)}`,
      className: klass?.name?.trim() || null,
      status: String(row.status ?? ""),
      originalExamScore,
      examMaxScore,
      effectiveExamScore,
      categories,
      history: groupLedgerHistory(attemptEntries),
    };
  });

  const editAuth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  const publishAuth = await authorizeAssessmentActor(ctx, organizationId, "publish");

  return {
    exam: {
      id: String(examRow.id),
      title: String(examRow.title),
      organizationId,
      resultsPublished: settings.results_published === true || Boolean(examRow.grades_published_at),
      resultsValidated: settings.results_validated === true,
    },
    attempts,
    entries,
    canEdit: editAuth.allowed,
    canPublish: publishAuth.allowed,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLedgerEntry(row: any): LedgerEntry {
  return {
    id: String(row.id),
    attemptId: String(row.attempt_id),
    studentId: row.student_id ? String(row.student_id) : null,
    candidateId: row.candidate_id ? String(row.candidate_id) : null,
    candidateName: String(row.candidate_name),
    categoryType: String(row.category_type) as LedgerCategoryType,
    categoryKey: String(row.category_key),
    categoryLabel: String(row.category_label),
    categoryMaxScore: Number(row.category_max_score),
    direction: row.direction === "decrease" ? "decrease" : "increase",
    pointsDelta: Number(row.points_delta),
    previousValue: Number(row.previous_value),
    newValue: Number(row.new_value),
    baselineExamScore: Number(row.baseline_exam_score),
    effectiveExamScore: Number(row.effective_exam_score),
    examMaxScore: Number(row.exam_max_score),
    reasonCode: String(row.reason_code) as LedgerEntry["reasonCode"],
    reason: String(row.reason),
    teacherComment: row.teacher_comment ? String(row.teacher_comment) : null,
    capped: Boolean(row.capped),
    capReason: (row.cap_reason ?? null) as LedgerEntry["capReason"],
    sequenceNo: Number(row.sequence_no),
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorEmail: row.actor_email ? String(row.actor_email) : null,
    actorRole: String(row.actor_role),
    actorConsole: row.actor_console === "super_admin" ? "super_admin" : "workspace",
    createdAt: String(row.created_at),
  };
}

export interface IndividualAdjustmentPayload {
  attemptId?: unknown;
  categoryType?: unknown;
  categoryKey?: unknown;
  categoryLabel?: unknown;
  categoryMaxScore?: unknown;
  direction?: unknown;
  pointsDelta?: unknown;
  reasonCode?: unknown;
  reason?: unknown;
  teacherComment?: unknown;
}

export type IndividualAdjustmentResult =
  | {
      ok: true;
      entryId: string;
      previousValue: number;
      newValue: number;
      appliedDelta: number;
      effectiveExamScore: number;
      capped: boolean;
      sequenceNo: number;
    }
  | { ok: false; status: number; code: string; error: string };

/**
 * Records ONE individual adjustment. There is deliberately no ceiling on how
 * many times this can be called for the same student and criterion: every call
 * appends a new immutable entry with its own reason, actor and before/after
 * values, and the effective score is recomputed from the whole ledger.
 */
export async function applyIndividualAdjustment(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  examId: string,
  payload: IndividualAdjustmentPayload,
): Promise<IndividualAdjustmentResult> {
  if (!isUuid(examId)) return { ok: false, status: 400, code: "invalid_id", error: "Invalid examination ID." };

  const auth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const attemptId = String(payload.attemptId ?? "").trim();
  if (!isUuid(attemptId)) return { ok: false, status: 400, code: "invalid_attempt", error: "Invalid attempt ID." };

  const reasonCode = normalizeReasonCode(payload.reasonCode);
  if (!reasonCode) return { ok: false, status: 400, code: "invalid_reason_code", error: "Choose an adjustment reason." };

  const reason = String(payload.reason ?? "").trim();
  if (reason.length < 3 || reason.length > 1000) {
    return { ok: false, status: 400, code: "invalid_reason", error: "Provide an adjustment justification (at least 3 characters)." };
  }

  const pointsDelta = normalizeAdjustmentMagnitude(payload.pointsDelta);
  if (pointsDelta === null) {
    return { ok: false, status: 400, code: "invalid_points", error: "Adjustment points must be between 0.01 and 1000." };
  }
  const direction = normalizeDirection(payload.direction);

  const categoryTypeRaw = String(payload.categoryType ?? "overall");
  const categoryType: LedgerCategoryType = (["myp_criterion", "paper_section", "overall", "custom"] as string[]).includes(
    categoryTypeRaw,
  )
    ? (categoryTypeRaw as LedgerCategoryType)
    : "overall";
  const categoryKey = String(payload.categoryKey ?? (categoryType === "overall" ? "overall" : "")).trim();
  const categoryLabel = String(payload.categoryLabel ?? categoryKey).trim() || categoryKey;
  if (!categoryKey) {
    return { ok: false, status: 400, code: "invalid_category", error: "Choose the criterion or category to adjust." };
  }
  const categoryMaxScoreRaw = Number(payload.categoryMaxScore ?? 0);
  const categoryMaxScore = Number.isFinite(categoryMaxScoreRaw) ? round2(Math.max(0, categoryMaxScoreRaw)) : 0;

  const { data: examRow } = await admin
    .from("exams")
    .select("id, organization_id, deleted_at")
    .eq("id", examId)
    .maybeSingle();
  if (!examRow || String(examRow.organization_id) !== organizationId || examRow.deleted_at) {
    return { ok: false, status: 404, code: "exam_not_found", error: "Examination not found in your organization." };
  }

  const { data: attemptRow } = await admin
    .from("exam_attempts")
    .select("id, exam_id, candidate_id, student_id, status, score, max_score, first_name, last_name, candidate:exam_candidates(id, full_name, email)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attemptRow || String(attemptRow.exam_id) !== examId) {
    return { ok: false, status: 404, code: "attempt_not_found", error: "Attempt not found for this examination." };
  }
  if (!["submitted", "auto_submitted", "marked"].includes(String(attemptRow.status))) {
    return {
      ok: false,
      status: 409,
      code: "attempt_not_submitted",
      error: "Only submitted attempts can receive grade adjustments.",
    };
  }

  const baselineExamScore = round2(Number(attemptRow.score ?? 0));
  const examMaxScore = round2(Number(attemptRow.max_score ?? 0));

  // Replay the existing ledger for this attempt to know exactly where we start.
  const { data: priorRows } = await admin
    .from("exam_grade_adjustment_entries")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("created_at", { ascending: true })
    .limit(20000);
  const priorEntries = (priorRows ?? []).map(mapLedgerEntry);
  const priorOverall = priorEntries.filter((e) => e.categoryType === "overall");
  const currentEffective = foldLedgerEntries(baselineExamScore, examMaxScore, priorOverall);

  const categoryEntries = priorEntries.filter(
    (e) => e.categoryType === categoryType && e.categoryKey === categoryKey,
  );
  const currentCategoryValue =
    categoryType === "overall"
      ? currentEffective
      : categoryEntries.length > 0
        ? categoryEntries[categoryEntries.length - 1].newValue
        : 0;

  const plan = planAdjustment({
    categoryType,
    categoryMaxScore: categoryType === "overall" ? examMaxScore : categoryMaxScore,
    currentCategoryValue,
    baselineExamScore,
    currentEffectiveExamScore: currentEffective,
    examMaxScore,
    direction,
    pointsDelta,
  });

  if (plan.blocked) {
    return { ok: false, status: 409, code: "no_headroom", error: plan.blockedReason ?? "This adjustment cannot be applied." };
  }

  const candidate = attemptRow.candidate as unknown as { full_name: string | null; email: string | null } | null;
  const fallbackName = [attemptRow.first_name, attemptRow.last_name].filter(Boolean).join(" ").trim();
  const candidateName =
    candidate?.full_name?.trim() || fallbackName || candidate?.email?.trim() || `Candidate ${attemptId.slice(0, 6)}`;

  const { data: inserted, error } = await admin
    .from("exam_grade_adjustment_entries")
    .insert({
      organization_id: organizationId,
      exam_id: examId,
      attempt_id: attemptId,
      candidate_id: attemptRow.candidate_id ? String(attemptRow.candidate_id) : null,
      student_id: attemptRow.student_id ? String(attemptRow.student_id) : null,
      candidate_name: candidateName,
      category_type: categoryType,
      category_key: categoryKey,
      category_label: categoryLabel,
      category_max_score: categoryType === "overall" ? examMaxScore : categoryMaxScore,
      direction,
      points_delta: pointsDelta,
      previous_value: plan.previousValue,
      new_value: plan.newValue,
      baseline_exam_score: baselineExamScore,
      effective_exam_score: plan.effectiveExamScore,
      exam_max_score: examMaxScore,
      reason_code: reasonCode,
      reason,
      teacher_comment: String(payload.teacherComment ?? "").trim().slice(0, 4000) || null,
      capped: plan.capped,
      cap_reason: plan.capReason,
      actor_id: ctx.user.id,
      actor_email: ctx.profile.email ?? ctx.user.email ?? null,
      actor_role: auth.role,
      actor_console: "workspace",
    })
    .select("id, sequence_no")
    .single();

  if (error || !inserted) {
    return { ok: false, status: 500, code: "apply_failed", error: error?.message ?? "Could not record the adjustment." };
  }

  await recordEvent(admin, ctx, {
    organizationId,
    eventType: "adjustment_recorded",
    attemptId,
    studentId: attemptRow.student_id ? String(attemptRow.student_id) : null,
    actorRole: auth.role,
    previousState: {
      categoryType,
      categoryKey,
      value: plan.previousValue,
      effectiveExamScore: currentEffective,
      baselineExamScore,
    },
    newState: {
      categoryType,
      categoryKey,
      value: plan.newValue,
      appliedDelta: direction === "decrease" ? -plan.appliedDelta : plan.appliedDelta,
      effectiveExamScore: plan.effectiveExamScore,
      capped: plan.capped,
    },
    reason: `${reasonCode}: ${reason}`,
  });
  await audit(ctx, "assessment.adjustment_recorded", "exam_grade_adjustment_entries", String(inserted.id), organizationId, {
    attempt_id: attemptId,
    category: `${categoryType}:${categoryKey}`,
    direction,
    points_delta: pointsDelta,
    reason_code: reasonCode,
  });

  return {
    ok: true,
    entryId: String(inserted.id),
    previousValue: plan.previousValue,
    newValue: plan.newValue,
    appliedDelta: direction === "decrease" ? -plan.appliedDelta : plan.appliedDelta,
    effectiveExamScore: plan.effectiveExamScore,
    capped: plan.capped,
    sequenceNo: Number(inserted.sequence_no),
  };
}

// ─────────────────────────── Consolidation engine ───────────────────────────

export interface ConsolidationContext {
  exam: { id: string; title: string; resultsPublished: boolean; resultsValidated: boolean };
  assessments: ConsolidationAssessmentInput[];
  attempts: ConsolidationAttemptInput[];
  profiles: ConsolidationProfileSummary[];
  canEdit: boolean;
  canPublish: boolean;
}

export interface ConsolidationProfileSummary {
  id: string;
  name: string;
  method: string;
  examWeight: number;
  scope: string;
  status: string;
  attemptIds: string[];
  settings: Record<string, unknown>;
  inclusions: {
    id: string;
    contributionId: string;
    included: boolean;
    weight: number;
    pointValue: number;
    criterionCode: string | null;
  }[];
  overrides: {
    id: string;
    attemptId: string;
    contributionId: string | null;
    included: boolean;
    weightOverride: number | null;
    pointValueOverride: number | null;
    reason: string;
  }[];
  createdAt: string;
}

/**
 * Loads everything the consolidation engine needs for one examination:
 * the ORIGINAL attempt scores, the signed ledger totals, every contributing
 * assessment with its per-attempt scores, and any saved profiles.
 */
export async function loadConsolidationContext(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  examId: string,
  options?: { classId?: string | null },
): Promise<ConsolidationContext | null> {
  if (!isUuid(examId)) return null;
  const auth = await authorizeAssessmentActor(ctx, organizationId, "view");
  if (!auth.allowed) return null;

  const { data: examRow } = await admin
    .from("exams")
    .select("id, title, settings, grades_published_at, deleted_at")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!examRow || examRow.deleted_at) return null;
  const settings = (examRow.settings ?? {}) as Record<string, unknown>;

  const { data: attemptRows } = await admin
    .from("exam_attempts")
    .select("id, student_id, score, max_score, status, first_name, last_name, class_id, candidate:exam_candidates(id, full_name, email)")
    .eq("exam_id", examId)
    .order("started_at", { ascending: true })
    .limit(2000);

  const attemptList = (attemptRows ?? []).filter((row) =>
    options?.classId ? String(row.class_id ?? "") === options.classId : true,
  );
  const attemptIds = attemptList.map((row) => String(row.id));

  // Signed ledger totals per attempt (overall + per criterion).
  const ledgerByAttempt = new Map<string, LedgerEntry[]>();
  if (attemptIds.length > 0) {
    for (let i = 0; i < attemptIds.length; i += 200) {
      const chunk = attemptIds.slice(i, i + 200);
      const { data: ledgerRows } = await admin
        .from("exam_grade_adjustment_entries")
        .select("attempt_id, category_type, category_key, direction, points_delta")
        .in("attempt_id", chunk)
        .limit(50000);
      for (const row of ledgerRows ?? []) {
        const id = String(row.attempt_id);
        const list = ledgerByAttempt.get(id) ?? [];
        list.push(mapLedgerEntry(row));
        ledgerByAttempt.set(id, list);
      }
    }
  }

  // Contributing assessments: any assessment linked to this exam, or any
  // assessment for the exam's class/subject that is switched on.
  let assessmentsQuery = admin
    .from("assessment_contributions")
    .select("id, title, category_key, category_label, max_score, criterion_code, contribution_method, contribution_weight, contribution_points, contributes_to_result, status, class_id, subject_id")
    .eq("organization_id", organizationId)
    .eq("contributes_to_result", true)
    .neq("status", "archived")
    .order("assessed_on", { ascending: true })
    .limit(400);
  const classFilter = options?.classId;
  if (isUuid(classFilter)) {
    assessmentsQuery = assessmentsQuery.or(`exam_id.eq.${examId},class_id.eq.${classFilter}`);
  } else {
    assessmentsQuery = assessmentsQuery.eq("exam_id", examId);
  }
  const { data: assessmentRows } = await assessmentsQuery;

  const assessmentIds = (assessmentRows ?? []).map((row) => String(row.id));
  const scoresByAssessment = new Map<string, Record<string, number | null>>();
  const studentByAttempt = new Map<string, string | null>(
    attemptList.map((row) => [String(row.id), row.student_id ? String(row.student_id) : null]),
  );

  for (let i = 0; i < assessmentIds.length; i += 100) {
    const chunk = assessmentIds.slice(i, i + 100);
    const { data: scoreRows } = await admin
      .from("assessment_contribution_scores")
      .select("contribution_id, student_id, attempt_id, score, status")
      .in("contribution_id", chunk)
      .eq("status", "recorded")
      .limit(50000);

    for (const row of scoreRows ?? []) {
      const contributionId = String(row.contribution_id);
      const map = scoresByAssessment.get(contributionId) ?? {};
      const score = Number(row.score);
      if (row.attempt_id && studentByAttempt.has(String(row.attempt_id))) {
        map[String(row.attempt_id)] = score;
      } else if (row.student_id) {
        // A class-wide assessment is matched to the attempt by student.
        for (const [attemptId, studentId] of studentByAttempt.entries()) {
          if (studentId === String(row.student_id) && map[attemptId] === undefined) {
            map[attemptId] = score;
          }
        }
      }
      scoresByAssessment.set(contributionId, map);
    }
  }

  const assessments: ConsolidationAssessmentInput[] = (assessmentRows ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    categoryKey: String(row.category_key),
    categoryLabel: String(row.category_label),
    maxScore: Number(row.max_score),
    weight: Number(row.contribution_weight ?? 0),
    pointValue: Number(row.contribution_points ?? 0),
    criterionCode: row.criterion_code ? String(row.criterion_code) : null,
    included: String(row.status) === "published",
    scoresByAttempt: scoresByAssessment.get(String(row.id)) ?? {},
  }));

  const attempts: ConsolidationAttemptInput[] = attemptList.map((row) => {
    const attemptId = String(row.id);
    const ledger = ledgerByAttempt.get(attemptId) ?? [];
    const candidate = row.candidate as unknown as { full_name: string | null; email: string | null } | null;
    const fallback = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return {
      attemptId,
      studentId: row.student_id ? String(row.student_id) : null,
      candidateName:
        candidate?.full_name?.trim() || fallback || candidate?.email?.trim() || `Candidate ${attemptId.slice(0, 6)}`,
      originalExamScore: round2(Number(row.score ?? 0)),
      examMaxScore: round2(Number(row.max_score ?? 0)),
      adjustmentTotal: foldLedgerEntries(Number(row.score ?? 0), Number(row.max_score ?? 0), ledger) -
        round2(Number(row.score ?? 0)),
      included: ["submitted", "auto_submitted", "marked"].includes(String(row.status)),
    };
  });

  const { data: profileRows } = await admin
    .from("grade_consolidation_profiles")
    .select("*")
    .eq("exam_id", examId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  const profileIds = (profileRows ?? []).map((row) => String(row.id));
  const inclusionsByProfile = new Map<string, ConsolidationProfileSummary["inclusions"]>();
  const overridesByProfile = new Map<string, ConsolidationProfileSummary["overrides"]>();
  if (profileIds.length > 0) {
    const { data: inclusionRows } = await admin
      .from("grade_consolidation_inclusions")
      .select("*")
      .in("profile_id", profileIds)
      .limit(2000);
    for (const row of inclusionRows ?? []) {
      const id = String(row.profile_id);
      const list = inclusionsByProfile.get(id) ?? [];
      list.push({
        id: String(row.id),
        contributionId: String(row.contribution_id),
        included: Boolean(row.included),
        weight: Number(row.weight),
        pointValue: Number(row.point_value),
        criterionCode: row.criterion_code ? String(row.criterion_code) : null,
      });
      inclusionsByProfile.set(id, list);
    }
    const { data: overrideRows } = await admin
      .from("grade_consolidation_overrides")
      .select("*")
      .in("profile_id", profileIds)
      .limit(5000);
    for (const row of overrideRows ?? []) {
      const id = String(row.profile_id);
      const list = overridesByProfile.get(id) ?? [];
      list.push({
        id: String(row.id),
        attemptId: String(row.attempt_id),
        contributionId: row.contribution_id ? String(row.contribution_id) : null,
        included: Boolean(row.included),
        weightOverride: row.weight_override === null || row.weight_override === undefined ? null : Number(row.weight_override),
        pointValueOverride:
          row.point_value_override === null || row.point_value_override === undefined ? null : Number(row.point_value_override),
        reason: String(row.reason),
      });
      overridesByProfile.set(id, list);
    }
  }

  const profiles: ConsolidationProfileSummary[] = (profileRows ?? []).map((row) => {
    const id = String(row.id);
    return {
      id,
      name: String(row.name),
      method: String(row.method),
      examWeight: Number(row.exam_weight),
      scope: String(row.scope),
      status: String(row.status),
      attemptIds: Array.isArray(row.attempt_ids) ? (row.attempt_ids as string[]).map(String) : [],
      settings: (row.settings ?? {}) as Record<string, unknown>,
      inclusions: inclusionsByProfile.get(id) ?? [],
      overrides: overridesByProfile.get(id) ?? [],
      createdAt: String(row.created_at),
    };
  });

  const editAuth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  const publishAuth = await authorizeAssessmentActor(ctx, organizationId, "publish");

  return {
    exam: {
      id: String(examRow.id),
      title: String(examRow.title),
      resultsPublished: settings.results_published === true || Boolean(examRow.grades_published_at),
      resultsValidated: settings.results_validated === true,
    },
    assessments,
    attempts,
    profiles,
    canEdit: editAuth.allowed,
    canPublish: publishAuth.allowed,
  };
}

/** Applies per-student and per-assessment overrides onto the engine inputs. */
export function applyOverrides(args: {
  assessments: readonly ConsolidationAssessmentInput[];
  attempts: readonly ConsolidationAttemptInput[];
  overrides: ConsolidationProfileSummary["overrides"];
  scopeAttemptIds?: readonly string[];
}): { assessments: ConsolidationAssessmentInput[]; attempts: ConsolidationAttemptInput[] } {
  const assessments = args.assessments.map((assessment) => ({
    ...assessment,
    scoresByAttempt: { ...assessment.scoresByAttempt },
  }));
  const attempts = args.attempts.map((attempt) => ({ ...attempt }));
  const byId = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const attemptById = new Map(attempts.map((attempt) => [attempt.attemptId, attempt]));

  if (args.scopeAttemptIds && args.scopeAttemptIds.length > 0) {
    const allowed = new Set(args.scopeAttemptIds.map(String));
    for (const attempt of attempts) attempt.included = attempt.included && allowed.has(attempt.attemptId);
  }

  for (const override of args.overrides) {
    const attempt = attemptById.get(override.attemptId);
    if (!attempt) continue;
    if (!override.contributionId) {
      attempt.included = override.included;
      continue;
    }
    const assessment = byId.get(override.contributionId);
    if (!assessment) continue;
    if (!override.included) {
      assessment.scoresByAttempt[override.attemptId] = null;
      continue;
    }
    if (override.weightOverride !== null) assessment.weight = override.weightOverride;
    if (override.pointValueOverride !== null) assessment.pointValue = override.pointValueOverride;
  }

  return { assessments, attempts };
}

export interface ConsolidationPreviewRequest {
  method?: unknown;
  examWeight?: unknown;
  allowMissingScores?: unknown;
  scopeAttemptIds?: unknown;
  inclusions?: { contributionId: string; included?: boolean; weight?: number; pointValue?: number; criterionCode?: string | null }[];
  profileId?: string | null;
}

export type ConsolidationPreviewResult =
  | { ok: true; result: ConsolidationResult }
  | { ok: false; status: number; code: string; error: string };

/**
 * The one calculation path. `preview` and `publish` both call it, so what a
 * teacher reviews is exactly what gets stored.
 */
export async function previewConsolidation(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  examId: string,
  request: ConsolidationPreviewRequest,
): Promise<ConsolidationPreviewResult> {
  const auth = await authorizeAssessmentActor(ctx, organizationId, "view");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const context = await loadConsolidationContext(admin, ctx, organizationId, examId);
  if (!context) return { ok: false, status: 404, code: "exam_not_found", error: "Examination not found in your organization." };

  const methodRaw = String(request.method ?? "record_only");
  const method: ContributionMethod = (
    ["direct_points", "weighted", "points_based", "criterion", "record_only"] as string[]
  ).includes(methodRaw)
    ? (methodRaw as ContributionMethod)
    : "record_only";

  const examWeightRaw = Number(request.examWeight ?? 100);
  const examWeight = Number.isFinite(examWeightRaw) ? round2(Math.min(100, Math.max(0, examWeightRaw))) : 100;

  const profile: ConsolidationProfileInput = {
    method,
    examWeight,
    allowMissingScores: request.allowMissingScores === true,
  };

  const scopeAttemptIds = Array.isArray(request.scopeAttemptIds)
    ? request.scopeAttemptIds.map(String).filter(isUuid)
    : undefined;

  // Saved profile inclusions win unless the request supplies its own.
  const saved = request.profileId ? context.profiles.find((p) => p.id === request.profileId) : undefined;
  let assessments = context.assessments.map((assessment) => ({ ...assessment, scoresByAttempt: { ...assessment.scoresByAttempt } }));

  if (Array.isArray(request.inclusions) && request.inclusions.length > 0) {
    const requested = new Map(request.inclusions.map((i) => [String(i.contributionId), i]));
    assessments = assessments.map((assessment) => {
      const override = requested.get(assessment.id);
      if (!override) return { ...assessment, included: false };
      return {
        ...assessment,
        included: override.included !== false,
        weight: Number.isFinite(Number(override.weight)) ? round2(Number(override.weight)) : assessment.weight,
        pointValue: Number.isFinite(Number(override.pointValue))
          ? round2(Number(override.pointValue))
          : assessment.pointValue,
        criterionCode:
          override.criterionCode !== undefined
            ? String(override.criterionCode ?? "").trim().toUpperCase() || null
            : assessment.criterionCode,
      };
    });
  } else if (saved) {
    const inclusionById = new Map(saved.inclusions.map((i) => [i.contributionId, i]));
    assessments = assessments.map((assessment) => {
      const inclusion = inclusionById.get(assessment.id);
      return inclusion
        ? {
            ...assessment,
            included: inclusion.included,
            weight: inclusion.weight,
            pointValue: inclusion.pointValue,
            criterionCode: inclusion.criterionCode ?? assessment.criterionCode,
          }
        : { ...assessment, included: false };
    });
  }

  const withOverrides = applyOverrides({
    assessments,
    attempts: context.attempts,
    overrides: saved?.overrides ?? [],
    scopeAttemptIds,
  });

  const result = computeConsolidation({ profile, assessments: withOverrides.assessments, attempts: withOverrides.attempts });
  return { ok: true, result };
}

export interface SaveConsolidationPayload extends ConsolidationPreviewRequest {
  name?: unknown;
  scope?: unknown;
  overrides?: {
    attemptId: string;
    contributionId?: string | null;
    included?: boolean;
    weightOverride?: number | null;
    pointValueOverride?: number | null;
    reason?: string;
  }[];
}

export type SaveConsolidationResult =
  | { ok: true; profileId: string; preview: ConsolidationResult }
  | { ok: false; status: number; code: string; error: string };

/** Saves (or updates) a consolidation profile and stores the computed snapshot. */
export async function saveConsolidationProfile(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  examId: string,
  payload: SaveConsolidationPayload,
): Promise<SaveConsolidationResult> {
  const auth = await authorizeAssessmentActor(ctx, organizationId, "edit");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const preview = await previewConsolidation(admin, ctx, organizationId, examId, payload);
  if (!preview.ok) return preview;

  const name = String(payload.name ?? "Grade consolidation").trim().slice(0, 160) || "Grade consolidation";
  const scopeRaw = String(payload.scope ?? "class");
  const scope = (["class", "group", "individual"] as string[]).includes(scopeRaw) ? scopeRaw : "class";
  const profileIdInput = isUuid(payload.profileId) ? String(payload.profileId) : null;

  const { data: examRow } = await admin
    .from("exams")
    .select("id, organization_id")
    .eq("id", examId)
    .maybeSingle();
  if (!examRow || String(examRow.organization_id) !== organizationId) {
    return { ok: false, status: 404, code: "exam_not_found", error: "Examination not found in your organization." };
  }

  let profileId = profileIdInput;
  const row = {
    organization_id: organizationId,
    exam_id: examId,
    name,
    method: preview.result.method,
    exam_weight: preview.result.examWeight,
    scope,
    attempt_ids: Array.isArray(payload.scopeAttemptIds) ? payload.scopeAttemptIds.map(String).filter(isUuid) : [],
    settings: { allow_missing_scores: payload.allowMissingScores === true },
    created_by: ctx.user.id,
  };

  if (profileId) {
    const { error } = await admin
      .from("grade_consolidation_profiles")
      .update({ ...row, organization_id: undefined, exam_id: undefined, created_by: undefined })
      .eq("id", profileId)
      .eq("organization_id", organizationId);
    if (error) return { ok: false, status: 500, code: "save_failed", error: error.message };
  } else {
    const { data: created, error } = await admin
      .from("grade_consolidation_profiles")
      .insert({ ...row, status: "draft" })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, status: 500, code: "save_failed", error: error?.message ?? "Could not save the consolidation profile." };
    }
    profileId = String(created.id);
  }

  // Replace inclusions for this profile (they are configuration, not history —
  // every change is written to the audit trail below).
  await admin.from("grade_consolidation_inclusions").delete().eq("profile_id", profileId);
  const includedAssessments = preview.result.rows.flatMap((r) => r.contributions).length
    ? preview.result.rows[0].contributions
    : [];
  if (includedAssessments.length > 0) {
    const inclusionRows = includedAssessments.map((contribution) => ({
      profile_id: profileId as string,
      organization_id: organizationId,
      contribution_id: contribution.id,
      included: contribution.included,
      weight: contribution.weight,
      point_value: contribution.pointValue,
      criterion_code: contribution.criterionCode,
    }));
    const { error } = await admin.from("grade_consolidation_inclusions").insert(inclusionRows);
    if (error) return { ok: false, status: 500, code: "save_failed", error: error.message };
  }

  // Individual overrides.
  if (Array.isArray(payload.overrides)) {
    for (const override of payload.overrides) {
      if (!isUuid(override.attemptId)) continue;
      const reason = String(override.reason ?? "").trim();
      if (reason.length < 3) continue;
      const contributionId = isUuid(override.contributionId) ? String(override.contributionId) : null;
      await admin.from("grade_consolidation_overrides").upsert(
        {
          profile_id: profileId,
          organization_id: organizationId,
          attempt_id: override.attemptId,
          contribution_id: contributionId,
          included: override.included !== false,
          weight_override: override.weightOverride ?? null,
          point_value_override: override.pointValueOverride ?? null,
          reason,
          created_by: ctx.user.id,
        },
        { onConflict: "profile_id,attempt_id,coalesce(contribution_id, '00000000-0000-0000-0000-000000000000'::uuid)" },
      );
    }
  }

  // Store the computed snapshot per attempt (draft, never published yet).
  for (const resultRow of preview.result.includedRows) {
    await admin.from("grade_consolidation_results").upsert(
      {
        profile_id: profileId,
        organization_id: organizationId,
        exam_id: examId,
        attempt_id: resultRow.attemptId,
        student_id: resultRow.studentId,
        candidate_name: resultRow.candidateName,
        original_exam_score: resultRow.originalExamScore,
        exam_max_score: resultRow.examMaxScore,
        adjustment_total: resultRow.adjustmentTotal,
        contribution_total: resultRow.contributionTotal,
        consolidated_score: resultRow.consolidatedScore,
        consolidated_max: resultRow.consolidatedMax,
        breakdown: {
          method: preview.result.method,
          exam_weight: preview.result.examWeight,
          contributions: resultRow.contributions,
          criteria: resultRow.criterionBreakdown,
        },
        status: "draft",
        computed_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,attempt_id" },
    );
  }

  await recordEvent(admin, ctx, {
    organizationId,
    eventType: profileIdInput ? "consolidation_changed" : "consolidation_created",
    profileId,
    actorRole: auth.role,
    newState: {
      method: preview.result.method,
      exam_weight: preview.result.examWeight,
      scope,
      included_students: preview.result.includedCount,
      invalid_rows: preview.result.invalidRowCount,
    },
    reason: `Consolidation rules saved (${preview.result.method})`,
  });
  await audit(ctx, "assessment.consolidation_saved", "grade_consolidation_profiles", profileId, organizationId, {
    method: preview.result.method,
    exam_weight: preview.result.examWeight,
    students: preview.result.includedCount,
  });

  return { ok: true, profileId, preview: preview.result };
}

/**
 * Publishes a consolidated result. Requires `results.publish`, refuses while any
 * included row is invalid, and — when the examination result is already
 * published — records that fact in the audit trail instead of silently changing
 * what candidates already saw.
 */
export async function publishConsolidation(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  examId: string,
  profileId: string,
): Promise<{ ok: true; published: number } | { ok: false; status: number; code: string; error: string }> {
  if (!isUuid(profileId)) return { ok: false, status: 400, code: "invalid_id", error: "Invalid consolidation profile." };

  const auth = await authorizeAssessmentActor(ctx, organizationId, "publish");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const { data: profile } = await admin
    .from("grade_consolidation_profiles")
    .select("id, organization_id, exam_id, status")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile || String(profile.organization_id) !== organizationId || String(profile.exam_id) !== examId) {
    return { ok: false, status: 404, code: "not_found", error: "Consolidation profile not found." };
  }

  const preview = await previewConsolidation(admin, ctx, organizationId, examId, { profileId });
  if (!preview.ok) return preview;
  if (!preview.result.canPublish) {
    return {
      ok: false,
      status: 409,
      code: "invalid_consolidation",
      error:
        preview.result.errors[0] ??
        "This consolidation cannot be published because at least one student's calculation is invalid.",
    };
  }

  const { data: examRow } = await admin
    .from("exams")
    .select("id, settings, grades_published_at")
    .eq("id", examId)
    .maybeSingle();
  const examSettings = (examRow?.settings ?? {}) as Record<string, unknown>;
  const examAlreadyPublished = examSettings.results_published === true || Boolean(examRow?.grades_published_at);

  let published = 0;
  for (const row of preview.result.includedRows) {
    const { error } = await admin
      .from("grade_consolidation_results")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .eq("attempt_id", row.attemptId);
    if (!error) published += 1;
  }

  await admin
    .from("grade_consolidation_profiles")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: ctx.user.id })
    .eq("id", profileId);

  await recordEvent(admin, ctx, {
    organizationId,
    eventType: "consolidation_published",
    profileId,
    actorRole: auth.role,
    newState: {
      published_students: published,
      method: preview.result.method,
      exam_already_published: examAlreadyPublished,
    },
    reason: examAlreadyPublished
      ? "Consolidated results published over an already-published examination result"
      : "Consolidated results published",
  });
  await audit(ctx, "assessment.consolidation_published", "grade_consolidation_profiles", profileId, organizationId, {
    published,
    exam_already_published: examAlreadyPublished,
  });

  return { ok: true, published };
}

/** Unpublishes a consolidated result (authorized rollback; never deletes data). */
export async function unpublishConsolidation(
  admin: AdminClient,
  ctx: SessionContext,
  organizationId: string,
  profileId: string,
): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> {
  const auth = await authorizeAssessmentActor(ctx, organizationId, "publish");
  if (!auth.allowed) return { ok: false, status: auth.status, code: "unauthorized", error: auth.error ?? "Not authorized." };

  const { data: profile } = await admin
    .from("grade_consolidation_profiles")
    .select("id, organization_id, status")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile || String(profile.organization_id) !== organizationId) {
    return { ok: false, status: 404, code: "not_found", error: "Consolidation profile not found." };
  }

  await admin.from("grade_consolidation_results").update({ status: "applied" }).eq("profile_id", profileId);
  await admin.from("grade_consolidation_profiles").update({ status: "applied" }).eq("id", profileId);

  await recordEvent(admin, ctx, {
    organizationId,
    eventType: "consolidation_unpublished",
    profileId,
    actorRole: auth.role,
    previousState: { status: String(profile.status) },
    newState: { status: "applied" },
    reason: "Consolidated results withdrawn",
  });
  await audit(ctx, "assessment.consolidation_unpublished", "grade_consolidation_profiles", profileId, organizationId, {});
  return { ok: true };
}

// ───────────────────────── Candidate result paper ───────────────────────────

export interface CandidateSupplementaryResult {
  available: boolean;
  method: ContributionMethod | null;
  originalExamScore: number;
  examMaxScore: number;
  adjustmentSummary: { label: string; delta: number; reasonCode: string }[];
  contributions: {
    title: string;
    categoryLabel: string;
    score: number;
    maxScore: number;
    percent: number;
    points: number;
    criterionCode: string | null;
  }[];
  consolidatedScore: number | null;
  consolidatedMax: number | null;
  criterionBreakdown: { code: string; total: number; totalMax: number }[];
  teacherFeedback: string | null;
}

const EMPTY_CANDIDATE_RESULT: CandidateSupplementaryResult = {
  available: false,
  method: null,
  originalExamScore: 0,
  examMaxScore: 0,
  adjustmentSummary: [],
  contributions: [],
  consolidatedScore: null,
  consolidatedMax: null,
  criterionBreakdown: [],
  teacherFeedback: null,
};

/**
 * The ONLY supplementary data a candidate may see, resolved from the attempt
 * token's own attempt id. Draft assessments, unpublished consolidations and any
 * other student's records are structurally unreachable here.
 */
export async function loadCandidateSupplementaryResult(
  admin: AdminClient,
  attemptId: string,
): Promise<CandidateSupplementaryResult> {
  if (!isUuid(attemptId)) return EMPTY_CANDIDATE_RESULT;

  const { data: resultRow } = await admin
    .from("grade_consolidation_results")
    .select(
      "id, profile_id, original_exam_score, exam_max_score, adjustment_total, contribution_total, consolidated_score, consolidated_max, breakdown, status, profile:grade_consolidation_profiles(id, method, status)",
    )
    .eq("attempt_id", attemptId)
    .eq("status", "published")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!resultRow) return EMPTY_CANDIDATE_RESULT;

  const profile = resultRow.profile as unknown as { method: string; status: string } | null;
  if (!profile || profile.status !== "published") return EMPTY_CANDIDATE_RESULT;

  const breakdown = (resultRow.breakdown ?? {}) as {
    contributions?: {
      id: string;
      title: string;
      categoryLabel: string;
      score: number | null;
      maxScore: number;
      percent: number | null;
      points: number;
      criterionCode: string | null;
      included: boolean;
    }[];
    criteria?: { code: string; total: number; totalMax: number }[];
  };

  // Adjustment summary — aggregate per reason, never the actor or the ledger id.
  const { data: ledgerRows } = await admin
    .from("exam_grade_adjustment_entries")
    .select("category_label, direction, points_delta, reason_code")
    .eq("attempt_id", attemptId)
    .order("created_at", { ascending: true })
    .limit(500);

  const summary = new Map<string, { label: string; delta: number; reasonCode: string }>();
  for (const row of ledgerRows ?? []) {
    const code = String(row.reason_code);
    const entry = summary.get(code) ?? { label: String(row.category_label), delta: 0, reasonCode: code };
    entry.delta = round2(entry.delta + (row.direction === "decrease" ? -Number(row.points_delta) : Number(row.points_delta)));
    summary.set(code, entry);
  }

  return {
    available: true,
    method: (profile.method as ContributionMethod) ?? null,
    originalExamScore: round2(Number(resultRow.original_exam_score)),
    examMaxScore: round2(Number(resultRow.exam_max_score)),
    adjustmentSummary: [...summary.values()].filter((entry) => Math.abs(entry.delta) > 0.001),
    contributions: (breakdown.contributions ?? [])
      .filter((contribution) => contribution.included && contribution.score !== null)
      .map((contribution) => ({
        title: contribution.title,
        categoryLabel: contribution.categoryLabel,
        score: round2(Number(contribution.score)),
        maxScore: round2(Number(contribution.maxScore)),
        percent: round2(Number(contribution.percent ?? 0)),
        points: round2(Number(contribution.points ?? 0)),
        criterionCode: contribution.criterionCode ?? null,
      })),
    consolidatedScore: round2(Number(resultRow.consolidated_score)),
    consolidatedMax: round2(Number(resultRow.consolidated_max)),
    criterionBreakdown: (breakdown.criteria ?? []).map((criterion) => ({
      code: criterion.code,
      total: round2(Number(criterion.total)),
      totalMax: round2(Number(criterion.totalMax)),
    })),
    teacherFeedback: null,
  };
}

/** Signed criterion delta from the unlimited ledger, for criterion-based papers. */
export function ledgerCriterionDelta(
  entries: readonly LedgerEntry[],
  criterionCode: string,
): number {
  return criterionLedgerDelta(entries, criterionCode);
}

export { resolveCategory, scorePercent };
