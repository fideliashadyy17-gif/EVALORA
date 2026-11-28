import "server-only";

/**
 * Shared examination creation service.
 *
 * The single implementation of "create an examination from a published paper".
 * Three callers use it and therefore cannot drift apart:
 *
 *   - the workspace form (`createExam` in dashboard/exams/actions.ts),
 *   - the native AI assistant,
 *   - an external agent's REST/MCP call.
 *
 * Everything that made the original action safe is preserved verbatim: the
 * worksheet's plan limit, the tenant check on the paper, the paper's
 * completeness, server-derived proctoring, and a single non-retried insert.
 * The only addition is that failures are RETURNED as a typed code as well as
 * redirected, so a non-browser caller learns exactly what was refused.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/server";
import { isPlanLimitError, withinLimit } from "../entitlements";
import { moduleEnabled } from "../modules";
import { normalizeExamLanguage } from "../examLanguage";
import { resolveAssessmentConfig, resolveExamDefaults } from "../assessmentConfig";
import type { Entitlement } from "../entitlements";
import type { SessionContext } from "../auth";
import { resolveSubjectIdByName } from "@/lib/subjects";

export type ExamCreateFailureCode =
  | "module"
  | "availability"
  | "limit"
  | "proctoring"
  | "fields"
  | "paper"
  | "window"
  | "create";

export type ExamCreateResult =
  | { ok: true; examId: string; accessCode: string; accessLink: string | null; roomError: boolean }
  | { ok: false; code: ExamCreateFailureCode };

export interface ExamCreateDeps {
  supabase: SupabaseClient;
  ctx: SessionContext;
  organizationId: string;
  isSuperAdmin: boolean;
  entitlement: Entitlement;
  capabilities: { examinations: boolean; proctoring: boolean };
  /** Optional hook so the caller can mirror the UI's redirect vocabulary. */
  onRoomCreated?: (examId: string) => Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a draft examination from a published paper in the same organization.
 *
 * `formData` is the same shape the workspace form posts, which is what makes the
 * AI path and the UI path literally the same code rather than two implementations
 * that agree today.
 */
export async function createExaminationFromForm(
  formData: FormData,
  deps: ExamCreateDeps,
): Promise<ExamCreateResult> {
  const { supabase, ctx, organizationId, entitlement } = deps;

  if (!deps.capabilities.examinations) return { ok: false, code: "module" };

  // One `.eq` on purpose: no `.select` shape, no `.order`, no pagination. PostgREST
  // builders are thenable chains, not promises — the fewer verbs between `.from`
  // and the read, the fewer ways a caller's client shim can diverge from the real one.
  const { count, error: countError } = await supabase
    .from("exams")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  // An unavailable count must never be interpreted as zero usage.
  if (countError || count === null) return { ok: false, code: "availability" };
  if (!withinLimit(entitlement.limits.max_exams, count)) return { ok: false, code: "limit" };

  const proctoringWanted = formData.get("proctoring") === "on";
  if (proctoringWanted && !deps.capabilities.proctoring) return { ok: false, code: "proctoring" };

  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const quizId = String(formData.get("quiz_id") ?? "");
  if (!title || !UUID.test(quizId)) return { ok: false, code: "fields" };

  // A client dropdown is not an authorization check, including for a global
  // Super Admin operating within a selected customer workspace.
  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .maybeSingle();
  if (quizError || !quiz) return { ok: false, code: "paper" };

  const { data: paper, error: paperError, count: paperCount } = await supabase
    .from("quiz_questions")
    .select("id,points,questions(organization_id,points)", { count: "exact" })
    .eq("quiz_id", quizId)
    .limit(1000);
  type PaperRow = { points: number | null; questions: { organization_id: string; points: number } | null };
  const rows = paper as unknown as PaperRow[] | null;
  if (
    paperError ||
    !rows ||
    paperCount === null ||
    paperCount === 0 ||
    rows.length !== paperCount ||
    rows.some((row) => {
      const points = Number(row.points ?? row.questions?.points);
      return !row.questions || row.questions.organization_id !== organizationId || !Number.isFinite(points) || points < 0;
    })
  ) {
    return { ok: false, code: "paper" };
  }

  const [examDefaults, assessmentCfg] = await Promise.all([
    resolveExamDefaults(organizationId),
    resolveAssessmentConfig(organizationId),
  ]);
  const rawDuration = String(formData.get("duration_minutes") ?? examDefaults.durationMinutes).trim();
  const rawPass = String(formData.get("pass_mark_percent") ?? assessmentCfg.defaultPassPercent).trim();
  const duration = Number(rawDuration);
  const passMark = Number(rawPass);
  if (
    !rawDuration ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 1440 ||
    !rawPass ||
    !Number.isFinite(passMark) ||
    passMark < 0 ||
    passMark > 100
  ) {
    return { ok: false, code: "fields" };
  }
  const startRaw = String(formData.get("starts_at") ?? "").trim();
  const endRaw = String(formData.get("ends_at") ?? "").trim();
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  if (
    (start && !Number.isFinite(start.getTime())) ||
    (end && !Number.isFinite(end.getTime())) ||
    (start && end && end <= start)
  ) {
    return { ok: false, code: "window" };
  }

  const lockdownWanted = formData.get("lockdown_enabled") === "on";

  // The subject was only ever stored as a name inside `settings`, so every
  // examination landed with a NULL `subject_id` and the subject policies had
  // nothing to bind to — including the ones this file's callers rely on when they
  // write as a browser session rather than the service role. Setting the id here
  // as well as in the database trigger keeps the two paths honest: the trigger
  // covers callers written later, this covers the row being inserted now.
  const subjectName = String(formData.get("subject") ?? "").trim().slice(0, 120) || null;
  const subjectId = await resolveSubjectIdByName(supabase, organizationId, subjectName);

  // One insert only: a lost response can mean the insert succeeded. Retrying
  // blindly could create duplicate examinations.
  const { data: exam, error } = await supabase
    .from("exams")
    .insert({
      organization_id: organizationId,
      quiz_id: quizId,
      title,
      description: String(formData.get("description") ?? "").slice(0, 1000) || null,
      instructions: String(formData.get("instructions") ?? "").slice(0, 4000) || null,
      duration_minutes: duration,
      subject_id: subjectId,
      starts_at: start?.toISOString() ?? null,
      ends_at: end?.toISOString() ?? null,
      status: "draft",
      settings: {
        language: normalizeExamLanguage(formData.get("language")) ?? "auto",
        proctoring: proctoringWanted,
        require_screen_share: proctoringWanted && formData.get("require_screen_share") === "on",
        randomize_questions: formData.get("randomize_questions") === "on",
        randomize_options: formData.get("randomize_options") === "on",
        calculator: formData.get("calculator") === "on" && moduleEnabled(entitlement.modules, "exam_calculator"),
        calculator_mode: formData.get("calculator_mode") === "basic" ? "basic" : "scientific",
        calculator_angle_mode: formData.get("calculator_angle_mode") === "rad" ? "rad" : "deg",
        exam_period: String(formData.get("exam_period") ?? "").trim().slice(0, 120) || null,
        academic_year: String(formData.get("academic_year") ?? "").trim().slice(0, 40) || null,
        grade_label: String(formData.get("grade_label") ?? "").trim().slice(0, 80) || null,
        subject: subjectName,
        exam_paper_template_id: String(formData.get("exam_paper_template_id") ?? "").trim() || null,
        lockdown: {
          enabled: lockdownWanted,
          require_app: true,
          strict_multi_display: formData.get("lockdown_strict_multi_display") !== "off",
          block_clipboard: formData.get("lockdown_block_clipboard") !== "off",
          min_app_version: "1.0.0",
        },
        pass_mark_percent: passMark,
        results_published: false,
        access_mode: "shared_link",
        identity_fields: [],
        eligible_class_ids: [],
        attempt_policy: "single_resume",
        attempt_mode: "limited",
        max_attempts: 1,
      },
      created_by: ctx.user.id,
    })
    .select("id, access_code, invite_token, access_link")
    .single();
  if (error && isPlanLimitError(error)) return { ok: false, code: "limit" };
  if (error || !exam) return { ok: false, code: "create" };

  let roomError = false;
  if (proctoringWanted) {
    try {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      const result = await admin.from("proctoring_rooms").insert({
        exam_id: exam.id,
        organization_id: organizationId,
        room_name: `exam-${exam.id}`,
        created_by: ctx.user.id,
        status: "active",
        started_at: now,
        last_event_at: now,
        updated_at: now,
      });
      roomError = Boolean(result.error);
    } catch {
      roomError = true;
    }
  }

  return {
    ok: true,
    examId: exam.id as string,
    accessCode: (exam.access_code as string) ?? "",
    accessLink: (exam.access_link as string | null) ?? null,
    roomError,
  };
}
