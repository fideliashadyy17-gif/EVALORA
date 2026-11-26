import { RichContent } from "@/components/RichContent";
import { AnswerResponseView } from "@/components/AnswerResponseView";
import { CandidatePaperDownloadButton } from "@/components/CandidatePaperDownloadButton";
import { assessPartsFromConfig, publicAssessParts } from "@/lib/assessParts";
import { describeIncidentType } from "@/lib/integrity";
import { ExaminationAccessCard } from "@/components/ExaminationAccessCard";
import { Badge, Button, ButtonLink, Card, DataTable, Field, Input, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { moduleEnabled } from "@/lib/modules";
import { canOperateMany } from "@/lib/operationalAccess";
import { GRADING_METHOD_LABEL, MODERATION_LABEL, rubricForQuestion, type ExamRubricLink, type RubricCriterion } from "@/lib/grading";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CheckCircle2, ClipboardList, FileCheck2, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { describeAiMarking } from "@/lib/ai-marking";
import { deriveResultStage } from "@/lib/resultLifecycle";
import { ResultLifecycle } from "@/components/exam/ResultLifecycle";
import { ExamFormulaSheetCard } from "@/components/formulas/ExamFormulaSheetCard";
import { setExamGradingSystem } from "@/app/dashboard/grading/actions";
import { MypExamGradingConfig } from "@/components/grading/MypExamGradingConfig";
import { MypMarkingStructure } from "@/components/grading/MypMarkingStructure";
import { QuestionAssessmentBadges } from "@/components/grading/QuestionAssessmentBadges";
import { mypReferenceGroup, parseMypExamConfig } from "@/lib/mypExamConfig";
import { getI18n } from "@/lib/i18n/server";
import { CopyResultLinkButton } from "./CopyResultLinkButton";
import { DeleteExamDialog } from "@/components/DeleteExamDialog";
import { buildLockdownLaunchUrl, parseLockdownSettings } from "@/lib/lockdown";
import {
  addCandidate, addCandidatesBulk, decideAiProposal, deleteExam, markAnswer, markWithRubric, moderateAnswer,
  pauseExam, proposeAiMarks, publishResults, removeCandidate, reviewIncident, setExamStatus, updateExamCalculator, updateExamLockdown, updateExamProctoring, updateWorkspaceExamAccess, validateResults, unvalidateResults,
} from "../actions";

export const metadata: Metadata = { title: "Examination" };
export const dynamic = "force-dynamic";

export default async function ExamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string; ok?: string; e?: string; myp_group?: string; mark_error?: string; mark_ok?: string; publish_error?: string; publish_ok?: string; validation_error?: string; access_ok?: string; access_error?: string; room_error?: string; candidate_error?: string; candidate_ok?: string; incident_error?: string; incident_ok?: string; moderation_ok?: string; moderation_error?: string; ai_ok?: string; ai_error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("*, quizzes(title)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!exam) notFound();

  const settings = (exam.settings ?? {}) as Record<string, unknown>;
  const lockdown = parseLockdownSettings(settings.lockdown);
  const { data: templates } = await supabase
    .from("exam_paper_templates")
    .select("id, name, is_default")
    .eq("organization_id", org.id)
    .order("is_default", { ascending: false });

  // Formula sheet source data (library + subjects) for the per-exam composer.
  const [{ data: formulaLibrary }, { data: gradingSystems }] = await Promise.all([
    supabase
      .from("formula_library")
      .select("id, topic, chapter, title, latex, note")
      .eq("organization_id", org.id)
      .order("topic")
      .order("title"),
    supabase
      .from("grading_systems")
      .select("id, name, curriculum, grade_label, status")
      .eq("organization_id", org.id)
      .eq("status", "active")
      .order("name"),
  ]);
  const selectedGradingSystemId =
    typeof settings.grading_system_id === "string" ? settings.grading_system_id : "";
  const selectedGradingSystem = (gradingSystems ?? []).find((gs) => gs.id === selectedGradingSystemId) ?? null;
  // MYP criteria & strand configuration: shown when the attached grading
  // framework is MYP. The saved snapshot lives on the exam settings.
  const mypSavedConfig = parseMypExamConfig(settings.myp_grading);
  const mypFrameworkActive = selectedGradingSystem?.curriculum === "myp";
  const requestedGroup = typeof sp.myp_group === "string" ? sp.myp_group : "";
  const mypGroupKey =
    requestedGroup && mypReferenceGroup(requestedGroup)
      ? requestedGroup
      : (mypSavedConfig?.subject_group ?? "mathematics");
  const rawSheet = (settings.formula_sheet ?? null) as Record<string, unknown> | null;
  const sheetForCard =
    rawSheet && typeof rawSheet === "object" && !Array.isArray(rawSheet)
      ? {
          title: typeof rawSheet.title === "string" ? rawSheet.title : "Formulas for this paper",
          enabled: rawSheet.enabled !== false,
          groups: Array.isArray(rawSheet.groups)
            ? (rawSheet.groups as { title?: unknown; items?: unknown }[])
                .filter((g) => g && typeof g === "object" && typeof g.title === "string")
                .map((g) => ({
                  title: g.title as string,
                  items: Array.isArray(g.items)
                    ? (g.items as { latex?: unknown; note?: unknown; source?: unknown }[])
                        .filter((it) => it && typeof it === "object" && typeof it.latex === "string" && it.latex)
                        .map((it) => ({
                          latex: it.latex as string,
                          ...(typeof it.note === "string" && it.note ? { note: it.note } : {}),
                          ...(typeof it.source === "string" ? { source: it.source } : {}),
                        }))
                    : [],
                }))
            : [],
        }
      : null;
  const accessLink = String(
    (exam as Record<string, unknown>).access_link
      ?? `/exam/join/${String((exam as Record<string, unknown>).invite_token ?? "")}`,
  );
  const shareUrl = `${origin}${accessLink}`;

  const [{ data: candidates }, { data: attempts }, { data: incidents }, { data: paperQuestions }] = await Promise.all([
    supabase.from("exam_candidates").select("*").eq("exam_id", id).order("full_name"),
    supabase
      .from("exam_attempts")
      .select("*, exam_candidates(id, full_name, candidate_ref, email, access_code), exam_answers(id, is_correct, points_awarded, answer, question_id, grading_method, moderation_status, questions(prompt, prompt_doc, points, type, config))")
      .eq("exam_id", id)
      .order("started_at"),
    supabase
      .from("proctoring_incidents")
      .select("*, exam_candidates(full_name)")
      .eq("exam_id", id)
      .order("created_at", { ascending: false }),
    exam.quiz_id
      ? supabase.from("quiz_questions").select("question_id, points, assessment").eq("quiz_id", exam.quiz_id)
      : Promise.resolve({ data: [] }),
  ]);
  const paperPoints = new Map((paperQuestions ?? []).map((q) => [q.question_id, q.points]));
  // Question-level assessment mapping from the Paper Builder (snapshot on
  // quiz_questions) — shown next to each question while marking.
  const assessmentByQuestion = new Map<string, unknown>(
    (paperQuestions ?? []).map((q) => [q.question_id, (q as { assessment?: unknown }).assessment ?? null]),
  );
  type MarkableAnswer = {
    id: string;
    question_id: string;
    is_correct: boolean | null;
    points_awarded: number | null;
    grading_method: string;
    moderation_status: string;
    answer: { text?: string };
    questions: { prompt: string; prompt_doc?: import("@/lib/content").RichDoc | null; points: number; type: string; config?: Record<string, unknown> | null };
  };
  const answersOf = (a: { exam_answers?: unknown; status: string }) =>
    ((a.exam_answers as MarkableAnswer[] | null) ?? []).filter(
      (ans) => ["open_ended", "assess_parts"].includes(ans.questions.type) && a.status !== "in_progress",
    );

  // Open-ended responses require a first human mark. Assess-parts responses
  // receive their typed-part partial credit automatically, then remain visible
  // below for a marker to inspect the submitted construction and moderate a
  // result when the saved working merits an adjustment.
  const awaitingMarking = (attempts ?? []).flatMap((a) =>
    answersOf(a).filter((ans) => ans.questions.type === "open_ended" && ans.is_correct === null).map((ans) => ({ attempt: a, ans })),
  );
  const gradedWritten = (attempts ?? []).flatMap((a) =>
    answersOf(a).filter((ans) => ans.is_correct !== null).map((ans) => ({ attempt: a, ans })),
  );

  // Rubrics attached to this examination plus every criterion score already
  // recorded for the written answers shown on this page.
  const { data: rubricLinksData } = await supabase
    .from("exam_rubric_links")
    .select("id, rubric_id, question_id, grading_rubrics(title, total_marks)")
    .eq("exam_id", id)
    .eq("organization_id", org.id);
  const rubricLinks = (rubricLinksData ?? []) as unknown as ExamRubricLink[];
  const rubricIds = [...new Set(rubricLinks.map((l) => l.rubric_id))];
  const shownAnswerIds = [...awaitingMarking, ...gradedWritten].map((entry) => entry.ans.id);

  // Mandatory publication workflow state (Draft → … → Published).
  const { t } = await getI18n();
  const submittedCount = (attempts ?? []).filter((a) => a.status !== "in_progress").length;
  const lifecycle = deriveResultStage({
    examStatus: exam.status,
    attemptCount: (attempts ?? []).length,
    submittedCount,
    awaitingMarking: awaitingMarking.length,
    resultsValidated: settings.results_validated === true,
    resultsPublished: settings.results_published === true,
  });
  const [{ data: rubricCriteriaData }, { data: answerScoresData }] = await Promise.all([
    rubricIds.length
      ? supabase.from("grading_rubric_criteria").select("*").in("rubric_id", rubricIds).order("position")
      : Promise.resolve({ data: [] as RubricCriterion[] }),
    shownAnswerIds.length
      ? supabase.from("answer_rubric_scores").select("answer_id, criterion_id, rubric_id, marks_awarded, grader_id, note").in("answer_id", shownAnswerIds)
      : Promise.resolve({ data: [] as { answer_id: string; criterion_id: string; rubric_id: string; marks_awarded: number; grader_id: string | null; note: string | null }[] }),
  ]);
  const criteriaByRubric = new Map<string, RubricCriterion[]>();
  for (const criterion of (rubricCriteriaData ?? []) as RubricCriterion[]) {
    criteriaByRubric.set(criterion.rubric_id, [...(criteriaByRubric.get(criterion.rubric_id) ?? []), criterion]);
  }
  type AiProposalRow = {
    id: string; answer_id: string; criterion_id: string; proposed_marks: number;
    rationale: string; provider: string; model: string;
  };
  const { data: aiProposalData } = shownAnswerIds.length
    ? await supabase
        .from("ai_marking_proposals")
        .select("id, answer_id, criterion_id, proposed_marks, rationale, provider, model")
        .in("answer_id", shownAnswerIds)
        .eq("status", "proposed")
        .order("created_at")
    : { data: [] as AiProposalRow[] };
  const proposalsByAnswer = new Map<string, AiProposalRow[]>();
  for (const row of (aiProposalData ?? []) as AiProposalRow[]) {
    proposalsByAnswer.set(row.answer_id, [...(proposalsByAnswer.get(row.answer_id) ?? []), row]);
  }
  const ai = describeAiMarking();

  type ScoreRow = { answer_id: string; criterion_id: string; marks_awarded: number; grader_id: string | null; note: string | null };
  const scoresByAnswer = new Map<string, ScoreRow[]>();
  for (const row of (answerScoresData ?? []) as ScoreRow[]) {
    scoresByAnswer.set(row.answer_id, [...(scoresByAnswer.get(row.answer_id) ?? []), row]);
  }
  const rubricFor = (questionId: string) => {
    const match = rubricForQuestion(rubricLinks, questionId);
    if (!match) return null;
    const criteria = criteriaByRubric.get(match.link.rubric_id) ?? [];
    if (criteria.length === 0) return null;
    return {
      rubricId: match.link.rubric_id,
      level: match.level,
      title: match.link.grading_rubrics?.title ?? "Rubric",
      criteria,
    };
  };
  const {
    canMark,
    isResultsManager,
    canEditExam,
    canDeleteExam,
    canManageLinks,
    canAddCandidates,
    canRevokeCandidates,
    canManageProctoring,
  } = await canOperateMany(ctx, org.id, {
    canMark: { permission: "grading.edit", module: "exam_results" },
    isResultsManager: { permission: "results.publish" },
    canEditExam: { permission: "exams.edit", module: "examinations" },
    canDeleteExam: { permission: "exams.delete", module: "examinations" },
    canManageLinks: { permission: "candidate_links.edit", module: "exam_share_codes" },
    canAddCandidates: { permission: "candidate_links.create", module: "exam_candidates" },
    canRevokeCandidates: { permission: "candidate_links.revoke", module: "exam_candidates" },
    canManageProctoring: { permission: "proctoring.manage", module: "proctoring" },
  });
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "examinations", "/dashboard?e=module");
  const examMonitoringEnabled = moduleEnabled(entitlement.modules, "exam_monitoring");
  const examLinksEnabled = moduleEnabled(entitlement.modules, "exam_links");
  const examHintsEnabled = moduleEnabled(entitlement.modules, "exam_hints");
  const examCandidateLinksEnabled = moduleEnabled(entitlement.modules, "exam_candidate_links");
  const examPrintableEnabled = moduleEnabled(entitlement.modules, "exam_printable");

  const markErrors: Record<string, string> = {
    invalid: "The answer, examination or paper could not be verified. No mark was saved.",
    in_progress: "A mark cannot be recorded while the attempt is in progress.",
    points: "Enter a valid mark between zero and the paper’s maximum for this question.",
    criteria: "Every criterion needs a mark between zero and its own maximum. Nothing was saved.",
    rubric: "That rubric is not attached to this examination, or has no criteria. Nothing was saved.",
    rubric_total: "The criterion marks add up to more than this question is worth. Adjust the criteria and retry.",
    failed: "The mark could not be saved. Please retry.",
    partial: "The answer mark may have been saved, but the attempt total could not be confirmed. Contact an administrator to check the mark and total.",
  };
  const moderationErrors: Record<string, string> = {
    invalid: "The answer or examination could not be verified. No decision was recorded.",
    decision: "Choose approve, adjust or return.",
    marks: "A corrected mark is required for an adjustment and must not exceed the question maximum.",
    failed: "The moderation decision could not be recorded. Nothing was changed.",
    partial: "The decision was recorded, but the attempt total could not be confirmed. Contact an administrator.",
  };

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Assessment Control & Marking Studio"
        title={exam.title}
        subtitle={`Paper: ${(exam.quizzes as { title: string } | null)?.title ?? "—"} · ${exam.duration_minutes} minutes · Pass mark ${String(settings.pass_mark_percent ?? 50)}%`}
        action={
          <div className="flex flex-wrap gap-2">
            {Boolean(settings.proctoring) && canManageProctoring && (
              <ButtonLink href={`/dashboard/exams/${id}/proctor`} variant="gold">🎥 Proctoring room</ButtonLink>
            )}
            {examMonitoringEnabled && (
              <ButtonLink href={`/dashboard/exams/${id}/monitor`} variant="outline">Live monitor</ButtonLink>
            )}
            {examLinksEnabled && (
              <ButtonLink href={`/dashboard/exams/links?q=${encodeURIComponent(exam.access_code)}`} variant="outline">
                Link &amp; expiry
              </ButtonLink>
            )}
            {examHintsEnabled && (
              <ButtonLink href={`/dashboard/exams/${id}/hints`} variant="outline">Exam hints</ButtonLink>
            )}
            <ButtonLink href={`/dashboard/exams/${id}/grades`} variant="outline">Grade history</ButtonLink>
            <ButtonLink href={`/dashboard/reports/exam/${id}`} variant="outline">Report</ButtonLink>
            {canEditExam && examPrintableEnabled && (
              <ButtonLink href={`/dashboard/exams/${id}/paper`} variant="outline">Print paper</ButtonLink>
            )}
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered candidates" value={(candidates ?? []).length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Attempts started" value={(attempts ?? []).length} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Awaiting marking" value={awaitingMarking.length} icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Marked written responses" value={gradedWritten.length} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      {sp.incident_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Observation review recorded.</p>}
      {sp.incident_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">The review could not be confirmed. The observation may have changed; reload before trying again.</p>}
      {sp.candidate_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Candidate removed.</p>}
      {sp.candidate_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">The candidate could not be removed. Candidates with recorded attempts are protected; check permissions and try again only if appropriate.</p>}
      {sp.access_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Examination access updated.</p>}
      {sp.access_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{sp.access_error === "audit" ? "Access changed, but the audit entry could not be confirmed. Do not retry a rotation until you check the current link and code; contact an administrator." : "Access could not be updated. Check your permissions and retry."}</p>}
      {sp.publish_error === "validation" && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{t("results.validationFirstError")}</p>}
      {sp.publish_error && sp.publish_error !== "validation" && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Results visibility could not be confirmed. Reload and try again.</p>}
      {sp.publish_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Results visibility updated.</p>}
      {sp.ok === "formula" && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Formula sheet saved for this examination.</p>}
      {sp.ok === "grading" && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Grading configuration saved for this examination.</p>}
      {sp.ok === "mypgrading" && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          MYP criteria and strand selection saved as a snapshot on this examination.
        </p>
      )}
      {sp.ok === "myp_rubric" && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          MYP rubric generated from the selected criteria and strands, and attached to this examination for marking.
        </p>
      )}
      {typeof sp.e === "string" && sp.e.startsWith("myp_") && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {sp.e === "myp_rubric_exists"
            ? "A MYP rubric has already been generated for this examination — edit or duplicate it from Rubrics instead of generating a second one."
            : sp.e === "myp_no_config"
              ? "Save the MYP criteria and strand selection first, then build the rubric."
              : `The MYP configuration could not be saved (${sp.e}). Check the subject group, criteria and strand selections.`}
        </p>
      )}
      {typeof sp.e === "string" && sp.e.startsWith("formula") && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          The formula sheet could not be saved ({sp.e}). Check every group has a title and at least one formula, then retry.
        </p>
      )}
      {sp.ok === "validated" && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{t("results.validatedMsg")}</p>}
      {sp.ok === "unvalidated" && <p role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("results.unvalidatedMsg")}</p>}
      {sp.validation_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{sp.validation_error === "empty" ? "There are no attempts to validate yet." : sp.validation_error === "published" ? "Results are published — unpublish before reopening validation." : "Validation could not be confirmed. Reload and try again."}</p>}
      {sp.e === "module" && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{t("errors.moduleDisabled")}</p>}
      {sp.mark_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{markErrors[sp.mark_error] ?? "The mark could not be saved."}</p>}
      {sp.mark_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{sp.mark_ok === "rubric" ? "Criterion marks saved, answer mark recalculated and the change added to the grade history." : "Mark saved and attempt total recalculated."}</p>}
      {sp.ai_ok && (
        <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          {sp.ai_ok === "proposed"
            ? "Suggestions saved for review. Nothing has been marked — accept or reject each criterion below."
            : sp.ai_ok === "rejected"
              ? "Suggestion rejected. No mark was written."
              : sp.ai_ok === "accepted"
                ? "Suggestion accepted, criterion mark written and the change logged as AI-assisted."
                : sp.ai_ok.startsWith("remaining-")
                  ? `Suggestion accepted and that criterion saved. ${sp.ai_ok.slice("remaining-".length)} criterion(s) still need a mark before the answer total is calculated.`
                  : "Suggestion decision recorded."}
        </p>
      )}
      {sp.ai_error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {sp.ai_error === "unconfigured"
            ? "No model credential is configured for this deployment, so no suggestions can be generated. Nothing was written."
            : sp.ai_error === "invalid_response"
              ? "The model's reply could not be used safely (a mark outside the criterion maximum, a missing criterion or no rationale). Nothing was written."
              : sp.ai_error === "marks"
                ? "The accepted mark must be between 0 and the criterion maximum. Nothing was written."
                : sp.ai_error === "decided"
                  ? "That suggestion has already been decided. Reload to see its current state."
                  : sp.ai_error === "partial"
                    ? "The criterion mark was saved and the suggestion accepted, but the answer total could not be confirmed. Check the mark before marking anything else."
                    : "The suggestion could not be completed. Nothing was written unless stated above."}
        </p>
      )}
      {sp.moderation_ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Moderation decision recorded — {MODERATION_LABEL[sp.moderation_ok]?.toLowerCase() ?? sp.moderation_ok}. Both the decision and the resulting mark change are in the grade history.</p>}
      {sp.moderation_error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{moderationErrors[sp.moderation_error] ?? "The moderation decision could not be recorded."}</p>}
      {exam.grades_published_at && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Grades were released to candidates on {fmtDateTime(exam.grades_published_at)}.</p>}
      {sp.added && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Added {sp.added} candidate(s). Each has a personal access code below.</p>}
      {sp.room_error && <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">The examination was created, but its proctoring room could not be confirmed. Contact an administrator before opening it.</p>}
      {sp.ok === "created" && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Examination created. Its unique link and access code are stored with the exam and shown below.</p>}
      {sp.ok === "paused" && <p role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Assessment paused. Every participant in progress is frozen: their answers, question position and remaining time are preserved, submissions are blocked, and each participant sees the pause notice. Resume when ready — the frozen time is added back automatically.</p>}
      {sp.ok === "resumed" && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Assessment resumed. Participants continue from their preserved position with their remaining time; the paused time was added to their deadline. No answers or attempts were changed.</p>}
      {sp.e === "not_open" && <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Only an open examination can be paused.</p>}
      {sp.e === "not_paused" && <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">This examination is not paused.</p>}
      {sp.e === "pause_failed" && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">The pause state could not be changed. Nothing was modified — try again.</p>}

      <div className="mb-6">
        {canManageLinks ? (
          <ExaminationAccessCard
            examTitle={exam.title}
            organizationName={org.name}
            shareUrl={shareUrl}
            accessLink={accessLink}
            accessCode={exam.access_code}
            exam={{
              status: exam.status,
              starts_at: exam.starts_at,
              ends_at: exam.ends_at,
              shared_link_enabled: exam.shared_link_enabled,
              invite_expires_at: exam.invite_expires_at,
            }}
            settings={settings}
          />
        ) : (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-evergreen-950">Candidate admission &amp; access status</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Shared candidate link is <strong>{exam.shared_link_enabled ? "enabled" : "disabled"}</strong>.
                  Sensitive access codes, join links, and candidate bearer tokens are hidden in read-only supervision mode.
                </p>
              </div>
              <Badge tone={exam.shared_link_enabled ? "green" : "gray"}>
                {exam.shared_link_enabled ? "Admission link active" : "Admission link disabled"}
              </Badge>
            </div>
          </Card>
        )}
      </div>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={exam.status === "open" ? "amber" : exam.status === "paused" ? "gold" : "gray"}>{exam.status}</Badge>
          <div className="min-w-[280px] flex-1">
            {canManageLinks ? (
              <p className="text-sm text-ink-soft">
                Legacy two-code entry: <strong>/exam-access</strong> with exam code{" "}
                <span className="font-mono text-base font-bold text-evergreen-800">{exam.access_code}</span> plus a personal candidate code.
              </p>
            ) : (
              <p className="text-sm text-ink-soft">
                Examination access credentials are protected for read-only supervision accounts.
              </p>
            )}
            {canManageLinks && <div className="mt-4 flex flex-wrap gap-2">
              <form action={updateWorkspaceExamAccess}><input type="hidden" name="exam_id" value={id} /><input type="hidden" name="access_action" value={exam.shared_link_enabled ? "disable" : "enable"} /><Button type="submit" variant="outline">{exam.shared_link_enabled ? "Disable shared link" : "Enable shared link"}</Button></form>
              <form action={updateWorkspaceExamAccess}><input type="hidden" name="exam_id" value={id} /><input type="hidden" name="access_action" value="new_link" /><Button type="submit" variant="outline">Regenerate link</Button></form>
              <form action={updateWorkspaceExamAccess}><input type="hidden" name="exam_id" value={id} /><input type="hidden" name="access_action" value="new_code" /><Button type="submit" variant="outline">Regenerate code</Button></form>
              <p className="w-full text-xs text-ink-soft">
                Regenerating immediately invalidates the previous link or code. Manage QR distribution, access policies, and candidate link controls across all examinations in{" "}
                <Link href="/dashboard/exams/links" className="font-semibold text-evergreen-800 underline underline-offset-2">
                  Exam Links &amp; Codes
                </Link>
                .
              </p>
            </div>}
          </div>
          {(canEditExam || isResultsManager || canDeleteExam) && (
            <div className="ml-auto flex flex-wrap gap-2">
              {canEditExam && (
                exam.status === "paused" ? (
                  /* A paused examination resumes ONLY through the pause RPC so
                     every attempt's frozen time is credited and its 'assessment'
                     pause reason cleared — never through the plain open toggle. */
                  <form action={pauseExam}><input type="hidden" name="id" value={id} /><input type="hidden" name="pause_action" value="resume" /><Button type="submit">Resume assessment</Button></form>
                ) : exam.status !== "open" ? (
                  <form action={setExamStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="open" /><Button type="submit">Open examination</Button></form>
                ) : (
                  <>
                    <form action={pauseExam}><input type="hidden" name="id" value={id} /><input type="hidden" name="pause_action" value="pause" /><Button type="submit" variant="outline">Pause assessment</Button></form>
                    <form action={setExamStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="closed" /><Button type="submit" variant="danger">Close examination</Button></form>
                  </>
                )
              )}
              {isResultsManager && (
                <form action={publishResults}>
                  <input type="hidden" name="exam_id" value={id} />
                  <input type="hidden" name="publish" value={settings.results_published ? "0" : "1"} />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!settings.results_published && settings.results_validated !== true}
                  >
                    {settings.results_published ? "Unpublish results" : "Publish results"}
                  </Button>
                  {!settings.results_published && settings.results_validated !== true && (
                    <p className="mt-1.5 text-xs text-amber-800">{t("results.publishGated")}</p>
                  )}
                </form>
              )}
              {canDeleteExam && (
                <DeleteExamDialog
                  examId={id}
                  examTitle={exam.title}
                  accessCode={exam.access_code}
                  attemptCount={(attempts ?? []).length}
                  candidateCount={(candidates ?? []).length}
                  action={deleteExam}
                />
              )}
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Results are currently <strong>{settings.results_published ? "visible to candidates" : "hidden from candidates"}</strong>.
          Objective questions are marked automatically on submission; written answers appear in the marking queue below.
        </p>
      </Card>

      {/* Secure Lockdown Environment Configuration */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-evergreen-900/10 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">
                Secure Lockdown Exam Environment
              </h2>
              <Badge tone={lockdown.enabled ? "green" : "gray"}>
                {lockdown.enabled ? "Lockdown Enabled" : "Standard Web Access (Disabled)"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {lockdown.enabled
                ? "This exam requires the official EVALORA Secure Exam Application. Ordinary web browsers cannot be used to start or resume this paper."
                : "Standard web browsers are permitted. Candidates can take this exam using Google Chrome, Microsoft Edge, Safari, or Firefox."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageLinks && lockdown.enabled && lockdown.require_app && (
              <a
                href={buildLockdownLaunchUrl({
                  token: exam.invite_token,
                  examCode: exam.access_code,
                  path: accessLink,
                })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 px-3 py-1.5 text-xs font-bold text-evergreen-950 shadow transition hover:bg-gold-400"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Launch Secure Browser
              </a>
            )}
            <ButtonLink href="/download/secure-browser" variant="outline" className="text-xs">
              View Application &amp; Download Links
            </ButtonLink>
          </div>
        </div>

        {canEditExam && (
          <form action={updateExamLockdown} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="rounded-xl border border-evergreen-900/10 bg-cream/50 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="lockdown_enabled"
                  defaultChecked={lockdown.enabled}
                  className="mt-0.5 h-5 w-5 accent-evergreen-700"
                />
                <div>
                  <span className="text-sm font-semibold text-evergreen-950">
                    Enable Secure Lockdown Environment for this examination
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    Strictly optional per-examination setting. When enabled, student access via standard browsers is
                    strictly denied, and candidates must satisfy the EVALORA Secure Exam Application verification handshake.
                  </p>
                </div>
              </label>

              <div className="mt-4 grid gap-3 border-t border-evergreen-900/10 pt-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-medium text-evergreen-900">
                  <input
                    type="checkbox"
                    name="lockdown_strict_multi_display"
                    defaultChecked={lockdown.strict_multi_display}
                    className="h-4 w-4 accent-evergreen-700"
                  />
                  Enforce single monitor (block multi-display)
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-evergreen-900">
                  <input
                    type="checkbox"
                    name="lockdown_block_clipboard"
                    defaultChecked={lockdown.block_clipboard}
                    className="h-4 w-4 accent-evergreen-700"
                  />
                  Strict in-app clipboard isolation
                </label>
              </div>
            </div>
            <Button type="submit" variant="primary" className="text-xs">
              Save Lockdown Settings
            </Button>
          </form>
        )}
      </Card>

      {/* Scientific calculator + official paper header */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-evergreen-900/10 pb-4">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Scientific Calculator &amp; Official Paper Header</h2>
          <Badge tone={settings.calculator ? "green" : "gray"}>{settings.calculator ? "Calculator on" : "Calculator off"}</Badge>
        </div>
        {canEditExam && (
          <form action={updateExamCalculator} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={id} />
            <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
              <input type="checkbox" name="calculator" defaultChecked={settings.calculator === true} className="h-5 w-5 accent-evergreen-700" />
              Scientific calculator available to candidates for this examination
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Calculator mode">
                <Select name="calculator_mode" defaultValue={settings.calculator_mode === "basic" ? "basic" : "scientific"}>
                  <option value="scientific">Scientific (full)</option>
                  <option value="basic">Basic (four operations)</option>
                </Select>
              </Field>
              <Field label="Default angle mode">
                <Select name="calculator_angle_mode" defaultValue={settings.calculator_angle_mode === "rad" ? "rad" : "deg"}>
                  <option value="deg">Degrees</option>
                  <option value="rad">Radians</option>
                </Select>
              </Field>
              <Field label="Examination period">
                <Input name="exam_period" defaultValue={typeof settings.exam_period === "string" ? settings.exam_period : ""} placeholder="First Term Examination" />
              </Field>
              <Field label="Academic year">
                <Input name="academic_year" defaultValue={typeof settings.academic_year === "string" ? settings.academic_year : ""} placeholder="2026–2027" />
              </Field>
              <Field label="Grade / Class">
                <Input name="grade_label" defaultValue={typeof settings.grade_label === "string" ? settings.grade_label : ""} placeholder="MYP4" />
              </Field>
              <Field label="Subject">
                <Input name="subject" defaultValue={typeof settings.subject === "string" ? settings.subject : ""} placeholder="Mathematics" />
              </Field>
            </div>
            <Field label="Official paper template">
              <Select name="exam_paper_template_id" defaultValue={typeof settings.exam_paper_template_id === "string" ? settings.exam_paper_template_id : ""}>
                <option value="">Organization defaults</option>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_default ? " (default)" : ""}</option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" className="text-xs">Save calculator &amp; header settings</Button>
              <ButtonLink href={`/dashboard/exams/${id}/paper`} variant="outline" className="text-xs">Preview official paper</ButtonLink>
            </div>
          </form>
        )}
      </Card>

      {/* Formula sheet — library selection, per-exam enable/disable */}
      <Card className="mb-6 p-6">
        <ExamFormulaSheetCard
          examId={id}
          library={(formulaLibrary ?? []) as { id: string; topic: string; chapter: string | null; title: string; latex: string; note: string | null }[]}
          sheet={sheetForCard}
          canEdit={canEditExam}
        />
      </Card>

      {/* Grading configuration — reusable system attached to this paper */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-evergreen-900/10 pb-4">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Grading configuration</h2>
          <Badge tone={selectedGradingSystemId ? "green" : "gray"}>
            {selectedGradingSystemId ? "System attached" : "Organization default"}
          </Badge>
        </div>
        {canEditExam ? (
          <form action={setExamGradingSystem} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="exam_id" value={id} />
            <Field label="Grading system for this examination">
              <Select name="grading_system_id" defaultValue={selectedGradingSystemId} className="min-w-64">
                <option value="">None — use organization defaults / raw marks</option>
                {(gradingSystems ?? []).map((gs) => (
                  <option key={gs.id} value={gs.id}>
                    {gs.name} ({gs.curriculum}{gs.grade_label ? ` · ${gs.grade_label}` : ""})
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="primary" className="text-xs">Save grading configuration</Button>
            <ButtonLink href="/dashboard/grading" variant="outline" className="text-xs">Manage grading systems</ButtonLink>
          </form>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            {selectedGradingSystemId
              ? "A grading system is attached to this examination."
              : "No grading system attached — raw marks apply."}
          </p>
        )}

        {mypFrameworkActive && (
          <MypExamGradingConfig
            examId={id}
            groupKey={mypGroupKey}
            savedConfig={mypSavedConfig}
            canEdit={canEditExam}
          />
        )}
      </Card>

      {/* Results Management & Individual Candidate Links */}
      <Card className="mb-6 p-6">
        <ResultLifecycle stage={lifecycle.stage} index={lifecycle.index} />
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-evergreen-900/10 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">
                Results Management &amp; Individual Candidate Links
              </h2>
              <Badge tone={settings.results_published ? "green" : "amber"}>
                {settings.results_published ? "Results Published (Visible to candidates)" : "Results Withheld (Hidden from candidates)"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Retrieve, copy, and distribute individual secure result links to candidates. Each link is uniquely associated with the candidate&apos;s attempt and strictly respects publication authorization.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {settings.results_validated === true && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                ✓ {t("results.validatedBadge")}
              </span>
            )}
            {isResultsManager && (attempts ?? []).length > 0 && settings.results_validated !== true && !settings.results_published && (
              <form action={validateResults}>
                <input type="hidden" name="exam_id" value={id} />
                <Button type="submit" variant="primary">{t("results.validateBtn")}</Button>
              </form>
            )}
            {isResultsManager && settings.results_validated === true && !settings.results_published && (
              <form action={unvalidateResults}>
                <input type="hidden" name="exam_id" value={id} />
                <Button type="submit" variant="outline">{t("results.unvalidateBtn")}</Button>
              </form>
            )}
            {isResultsManager ? (
              <form action={publishResults}>
                <input type="hidden" name="exam_id" value={id} />
                <input type="hidden" name="publish" value={settings.results_published ? "0" : "1"} />
                <Button
                  type="submit"
                  variant={settings.results_published ? "outline" : "primary"}
                  disabled={!settings.results_published && settings.results_validated !== true}
                >
                  {settings.results_published ? "Unpublish all results" : "Publish all results"}
                </Button>
                {!settings.results_published && settings.results_validated !== true && (
                  <p className="mt-1.5 max-w-[16rem] text-xs text-amber-800">{t("results.publishGated")}</p>
                )}
              </form>
            ) : (
              <p className="max-w-[18rem] text-xs text-ink-soft">
                Validation and publication are restricted to organization administrators.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-cream/70 p-3.5 text-xs text-ink-soft">
          <p>
            <strong>Publication Control:</strong>{" "}
            {settings.results_validated !== true && !settings.results_published && (
              <span className="mr-2 text-amber-900 font-medium">{t("results.validateNote")}</span>
            )}
            {settings.results_published ? (
              <span className="text-evergreen-900 font-medium">
                Results are published. Candidates who access their personal link can see their verified marks, percentage score, criterion performance, and question-by-question review.
              </span>
            ) : (
              <span className="text-amber-900 font-medium">
                Results are currently withheld. Candidates accessing their personal link will see an official confirmation that their paper was received and is awaiting teacher review, with all marks and answers withheld.
              </span>
            )}
          </p>
        </div>

        <div className="mt-4">
          {(attempts ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-soft">
              No examination attempts recorded yet. As students start and submit their papers, their individual result links will appear here.
            </p>
          ) : (
            <DataTable
              head={[
                "Student Name & Identifier",
                "Attempt",
                "Submission Status",
                "Score",
                "Publication Status",
                "Individual Result Link",
                "Actions",
              ]}
              label="Candidate individual result links"
            >
              {(attempts ?? []).map((a) => {
                const cand = a.exam_candidates as { full_name: string; candidate_ref?: string | null; email?: string | null; access_code?: string | null } | null;
                const candName = cand?.full_name || "Unknown Candidate";
                const candId = cand?.candidate_ref || cand?.email || (canManageLinks && cand?.access_code ? `Code: ${cand.access_code}` : null);
                const isSubmitted = a.status === "submitted" || a.status === "auto_submitted" || a.status === "marked";
                const pct = a.score !== null && a.max_score !== null && Number(a.max_score) > 0
                  ? ((Number(a.score) / Number(a.max_score)) * 100).toFixed(1)
                  : null;
                const resultUrl = canManageLinks && examCandidateLinksEnabled ? `${origin}/exam/result/${a.access_token}` : null;

                return (
                  <tr key={a.id}>
                    <td>
                      <span className="font-medium text-evergreen-950">{candName}</span>
                      {candId && <span className="block text-xs text-ink-soft">{candId}</span>}
                    </td>
                    <td className="text-xs font-medium text-ink-soft">
                      Attempt {a.attempt_number ?? 1}
                    </td>
                    <td>
                      <Badge tone={isSubmitted ? "green" : "amber"}>
                        {a.status.replace(/_/g, " ")}
                      </Badge>
                      {a.submitted_at && (
                        <span className="block text-[11px] text-ink-soft">
                          {fmtDateTime(a.submitted_at)}
                        </span>
                      )}
                    </td>
                    <td className="tabular-nums text-sm">
                      {isSubmitted && a.score !== null ? (
                        <span className="font-semibold text-evergreen-900">
                          {Number(a.score)} / {Number(a.max_score)} {pct ? `(${pct}%)` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-soft">{isSubmitted ? "Grading pending" : "In progress"}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={settings.results_published ? "green" : "amber"}>
                        {settings.results_published ? "Published" : "Withheld"}
                      </Badge>
                    </td>
                    <td className="max-w-xs">
                      {resultUrl ? (
                        <input
                          type="text"
                          readOnly
                          value={resultUrl}
                          className="w-full truncate rounded border border-evergreen-900/15 bg-cream/50 px-2 py-1 font-mono text-xs text-evergreen-950 select-all"
                          title={resultUrl}
                        />
                      ) : (
                        <span className="text-xs text-ink-soft">Protected</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isSubmitted && (
                          <CandidatePaperDownloadButton
                            mode="staff"
                            examId={id}
                            attemptId={a.id}
                            label="Download Candidate Paper (PDF)"
                            compact
                          />
                        )}
                        {resultUrl ? (
                          <>
                            <CopyResultLinkButton url={resultUrl} candidateName={candName} />
                            <ButtonLink
                              href={`/exam/result/${a.access_token}`}
                              variant="ghost"
                              className="text-xs px-2 py-1"
                            >
                              View
                            </ButtonLink>
                          </>
                        ) : !isSubmitted ? (
                          <span className="text-xs text-ink-soft">Read-only</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Candidates ({(candidates ?? []).length})</h2>
          <div className="mt-3 max-h-96 overflow-y-auto scroll-slim">
            {(candidates ?? []).length === 0 ? (
              <p className="py-3 text-sm text-ink-soft">No candidates registered yet.</p>
            ) : (
              <DataTable head={["Candidate", "Personal code", "Status", "Actions"]} label="Examination candidates">
                {(candidates ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="font-medium">{c.full_name}</span>
                      {c.candidate_ref && <span className="block text-xs text-ink-soft">{c.candidate_ref}{c.email ? ` · ${c.email}` : ""}</span>}
                    </td>
                    <td className="font-mono font-semibold text-evergreen-800">
                      {canManageLinks ? c.access_code : <span className="font-sans text-xs font-normal text-ink-soft">Protected</span>}
                    </td>
                    <td><Badge tone={c.status === "submitted" ? "green" : c.status === "in_progress" ? "amber" : "gray"}>{c.status.replace(/_/g, " ")}</Badge></td>
                    <td>
                      {canRevokeCandidates && c.status === "registered" && <form action={removeCandidate}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="exam_id" value={id} />
                        <button className="text-xs text-red-700 underline-offset-2 hover:underline">Remove</button>
                      </form>}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>

          {canAddCandidates && (
            <>
              <form action={addCandidate} className="mt-4 grid gap-2 border-t border-evergreen-900/10 pt-4 sm:grid-cols-3">
                <input type="hidden" name="exam_id" value={id} />
                <Input name="full_name" required placeholder="Full name" />
                <Input name="candidate_ref" placeholder="Ref / class (optional)" />
                <div className="flex gap-2">
                  <Input name="email" type="email" placeholder="Email (optional)" />
                  <Button type="submit">Add</Button>
                </div>
              </form>
              <form action={addCandidatesBulk} className="mt-4">
                <input type="hidden" name="exam_id" value={id} />
                <Field label="Bulk add — one per line: Full Name, email, reference">
                  <Textarea name="bulk" rows={4} placeholder={"Aya Ndiaye, aya@example.com, G9-A\nben olsen, ben@example.com, G9-B"} />
                </Field>
                <Button type="submit" variant="outline" className="mt-2">Add all</Button>
              </form>
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Attempts ({(attempts ?? []).length})</h2>
            <div className="mt-3">
              {(attempts ?? []).length === 0 ? (
                <p className="py-3 text-sm text-ink-soft">No attempts yet.</p>
              ) : (
                <DataTable head={["Candidate", "Started", "Status", "Track", "Score"]} label="Examination attempts">
                  {(attempts ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="font-medium">{(a.exam_candidates as { full_name: string } | null)?.full_name}</td>
                      <td className="text-ink-soft">{fmtDateTime(a.started_at)}</td>
                      <td><Badge tone={a.status === "in_progress" ? "amber" : "green"}>{a.status.replace(/_/g, " ")}</Badge></td>
                      <td className="text-ink-soft">{a.track === "AB" ? "AB (max 44)" : a.track === "BC" ? "BC (max 50)" : "—"}</td>
                      <td className="tabular-nums">{a.score !== null ? `${Number(a.score)} / ${Number(a.max_score ?? 0)}` : "—"}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Marking queue ({awaitingMarking.length})</h2>
            {mypSavedConfig && <div className="mt-3"><MypMarkingStructure config={mypSavedConfig} /></div>}
            {awaitingMarking.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No written answers awaiting a corrector. Objective questions mark themselves automatically.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {awaitingMarking.map(({ attempt, ans }) => {
                  const rubric = rubricFor(ans.question_id);
                  const existing = scoresByAnswer.get(ans.id) ?? [];
                  return (
                  <div key={ans.id} id={`ai-${ans.id}`} className="rounded-xl border border-evergreen-900/10 bg-cream p-4">
                    <p className="text-xs font-medium text-ink-soft">
                      {(attempt.exam_candidates as { full_name: string } | null)?.full_name} · max {Number(paperPoints.get(ans.question_id) ?? ans.questions.points)} pts
                    </p>
                    <div className="mt-1 font-medium"><RichContent doc={(ans.questions as unknown as { prompt_doc?: import("@/lib/content").RichDoc | null }).prompt_doc ?? null} text={ans.questions.prompt} /></div>
                    <QuestionAssessmentBadges assessment={assessmentByQuestion.get(ans.question_id) ?? null} />
                    <div className="mt-2 rounded-lg bg-white p-3">
                      <AnswerResponseView answer={ans.answer} assessParts={publicAssessParts(assessPartsFromConfig(ans.questions.config))} />
                    </div>
                    {rubric && canMark ? (
                      <div className="mt-3 rounded-lg border border-gold-600/30 bg-gold-50/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-evergreen-900">
                            {ai.configured
                              ? `AI suggestion draft · ${ai.provider} · ${ai.model} — proposals only, a person decides.`
                              : "AI suggestions are off: no model credential is configured for this deployment, and nothing is generated without one."}
                          </p>
                          {ai.configured && (
                            <form action={proposeAiMarks}>
                              <input type="hidden" name="answer_id" value={ans.id} />
                              <input type="hidden" name="attempt_id" value={attempt.id} />
                              <input type="hidden" name="exam_id" value={id} />
                              <input type="hidden" name="rubric_id" value={rubric.rubricId} />
                              <Button type="submit" variant="outline" className="text-xs">Suggest criterion marks</Button>
                            </form>
                          )}
                        </div>
                        {(proposalsByAnswer.get(ans.id) ?? []).length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {(proposalsByAnswer.get(ans.id) ?? []).map((proposal) => {
                              const criterion = rubric.criteria.find((c) => c.id === proposal.criterion_id);
                              return (
                                <li key={proposal.id} className="rounded-lg border border-evergreen-900/10 bg-white p-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-evergreen-900">
                                      {criterion?.code ? `${criterion.code} · ` : ""}{criterion?.label ?? "Criterion"}
                                    </span>
                                    <Badge tone="gold">
                                      suggested {Number(proposal.proposed_marks)} / {criterion ? Number(criterion.max_marks) : "?"}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-[11px] leading-snug text-ink-soft">{proposal.rationale}</p>
                                  <div className="mt-2 flex flex-wrap items-end gap-2">
                                    <form action={decideAiProposal} className="flex flex-wrap items-end gap-2">
                                      <input type="hidden" name="proposal_id" value={proposal.id} />
                                      <input type="hidden" name="answer_id" value={ans.id} />
                                      <input type="hidden" name="exam_id" value={id} />
                                      <input type="hidden" name="decision" value="accept" />
                                      <Field label="Accept mark">
                                        <Input
                                          name="marks"
                                          type="number"
                                          step="0.25"
                                          min={0}
                                          max={criterion ? Number(criterion.max_marks) : undefined}
                                          defaultValue={Number(proposal.proposed_marks)}
                                          className="w-20"
                                        />
                                      </Field>
                                      <Field label="Note">
                                        <Input name="note" placeholder="Optional" className="w-40" />
                                      </Field>
                                      <Button type="submit" className="text-xs">Accept</Button>
                                    </form>
                                    <form action={decideAiProposal}>
                                      <input type="hidden" name="proposal_id" value={proposal.id} />
                                      <input type="hidden" name="answer_id" value={ans.id} />
                                      <input type="hidden" name="exam_id" value={id} />
                                      <input type="hidden" name="decision" value="reject" />
                                      <Button type="submit" variant="outline" className="text-xs">Reject</Button>
                                    </form>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                    {rubric && canMark ? (
                      <form action={markWithRubric} className="mt-3 space-y-2">
                        <input type="hidden" name="answer_id" value={ans.id} />
                        <input type="hidden" name="attempt_id" value={attempt.id} />
                        <input type="hidden" name="exam_id" value={id} />
                        <input type="hidden" name="rubric_id" value={rubric.rubricId} />
                        <p className="text-xs font-medium text-evergreen-800">
                          {rubric.title} · {rubric.level === "question" ? "question rubric" : "examination rubric"} · {rubric.criteria.length} criteria
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {rubric.criteria.map((criterion) => {
                            const mine = existing.find((row) => row.criterion_id === criterion.id && row.grader_id === ctx.user.id);
                            const otherGraders = existing.filter((row) => row.criterion_id === criterion.id && row.grader_id !== ctx.user.id);
                            return (
                              <div key={criterion.id} className="rounded-lg border border-evergreen-900/10 bg-white p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-medium text-evergreen-900">
                                    {criterion.code ? `${criterion.code} · ` : ""}{criterion.label}
                                  </span>
                                  <label className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
                                    <input
                                      name={`criterion_${criterion.id}`}
                                      type="number"
                                      step="0.25"
                                      min={0}
                                      max={Number(criterion.max_marks)}
                                      defaultValue={mine ? Number(mine.marks_awarded) : ""}
                                      required
                                      className="w-16 rounded border border-evergreen-900/20 px-1 py-0.5 text-right tabular-nums"
                                    />
                                    / { Number(criterion.max_marks) }
                                  </label>
                                </div>
                                {criterion.description && <p className="mt-1 text-[11px] leading-snug text-ink-soft">{criterion.description}</p>}
                                {otherGraders.length > 0 && (
                                  <p className="mt-1 text-[11px] text-amber-800">
                                    Another marker scored this {otherGraders.map((row) => Number(row.marks_awarded)).join(", ")} — your judgement is stored separately.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label="Marker note">
                            <Input name="note" placeholder="Feedback…" className="w-56" />
                          </Field>
                          <Button type="submit">Save criterion marks</Button>
                        </div>
                        <p className="text-[11px] text-ink-soft">A single mark can be recorded instead by detaching the rubric from this examination.</p>
                      </form>
                    ) : canMark ? (
                      <form action={markAnswer} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="answer_id" value={ans.id} />
                        <input type="hidden" name="attempt_id" value={attempt.id} />
                        <input type="hidden" name="exam_id" value={id} />
                        <Field label="Points">
                          <Input name="points" type="number" step="0.5" min={0} max={Number(paperPoints.get(ans.question_id) ?? ans.questions.points)} required className="w-24" />
                        </Field>
                        <Field label="Marker note">
                          <Input name="note" placeholder="Feedback…" className="w-56" />
                        </Field>
                        <Button type="submit">Save mark</Button>
                      </form>
                    ) : (
                      <p className="mt-3 text-xs text-ink-soft">Awaiting authorized marker (read-only view).</p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Moderation ({gradedWritten.length} constructed responses marked)</h2>
              <ButtonLink href={`/dashboard/exams/${id}/grades`} variant="outline" className="text-xs">Full grade history</ButtonLink>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              A moderator may approve a mark, adjust it, or return it to the marker. Each decision is appended to the grade
              history with the previous mark and cannot be rewritten or deleted.
            </p>
            {gradedWritten.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No written answers have been marked on this examination yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {gradedWritten.map(({ attempt, ans }) => {
                  const scoreRows = scoresByAnswer.get(ans.id) ?? [];
                  const perGrader = new Map<string, number>();
                  for (const row of scoreRows) {
                    const key = row.grader_id ?? "unknown";
                    perGrader.set(key, Math.round(((perGrader.get(key) ?? 0) + Number(row.marks_awarded)) * 100) / 100);
                  }
                  const maxPoints = Number(paperPoints.get(ans.question_id) ?? ans.questions.points);
                  const tone = ans.moderation_status === "approved" ? "green" : ans.moderation_status === "adjusted" ? "gold" : ans.moderation_status === "returned" ? "red" : "gray";
                  return (
                    <div key={ans.id} className="rounded-xl border border-evergreen-900/10 bg-cream p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge tone={tone}>{MODERATION_LABEL[ans.moderation_status] ?? ans.moderation_status}</Badge>
                        <span className="font-medium">{(attempt.exam_candidates as { full_name: string } | null)?.full_name ?? "Candidate"}</span>
                        <span className="tabular-nums">{Number(ans.points_awarded ?? 0)} / {maxPoints}</span>
                        <span className="ml-auto text-xs text-ink-soft">{GRADING_METHOD_LABEL[ans.grading_method] ?? ans.grading_method}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-ink-soft">{ans.questions.prompt}</p>
                      <QuestionAssessmentBadges assessment={assessmentByQuestion.get(ans.question_id) ?? null} />
                      {ans.questions.type === "assess_parts" ? (
                        <details className="mt-2 rounded-lg border border-evergreen-900/10 bg-white p-2">
                          <summary className="cursor-pointer text-xs font-semibold text-evergreen-800">Review typed answers and submitted working</summary>
                          <div className="mt-2">
                            <AnswerResponseView answer={ans.answer} assessParts={publicAssessParts(assessPartsFromConfig(ans.questions.config))} />
                          </div>
                        </details>
                      ) : null}
                      {perGrader.size > 0 && (
                        <p className="mt-1 text-[11px] text-ink-soft">
                          Criterion totals by marker: {[...perGrader.values()].map((v) => Number(v)).join(" · ")}
                        </p>
                      )}
                      {canMark && (
                        <form action={moderateAnswer} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="answer_id" value={ans.id} />
                          <input type="hidden" name="exam_id" value={id} />
                          <Field label="Decision">
                            <Select name="decision" defaultValue="approved" className="w-40">
                              <option value="approved">Approve mark</option>
                              <option value="adjusted">Adjust mark</option>
                              <option value="returned">Return to marker</option>
                            </Select>
                          </Field>
                          <Field label="Corrected mark" hint="Only for an adjustment">
                            <Input name="proposed_marks" type="number" step="0.25" min={0} max={maxPoints} className="w-24" />
                          </Field>
                          <Field label="Reason">
                            <Input name="note" placeholder="Why…" className="w-52" />
                          </Field>
                          <Button type="submit" variant="outline">Record decision</Button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {canEditExam && canManageProctoring && (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold text-evergreen-950">
                    Video proctoring &amp; screen sharing (LiveKit)
                  </h2>
                  <p className="mt-1 text-xs text-ink-soft">
                    Configure live candidate camera, microphone, and optional screen sharing for this examination.
                    Supabase integrity incident logging and human review remain operational regardless of live video state.
                  </p>
                </div>
                <Badge tone={Boolean(settings.proctoring) ? "green" : "gray"}>
                  {Boolean(settings.proctoring)
                    ? Boolean(settings.require_screen_share)
                      ? "Video + screen share"
                      : "Video active"
                    : "Video off"}
                </Badge>
              </div>
              <form action={updateExamProctoring} className="mt-4 flex flex-wrap items-center gap-4">
                <input type="hidden" name="exam_id" value={id} />
                <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
                  <input
                    type="checkbox"
                    name="proctoring"
                    defaultChecked={Boolean(settings.proctoring)}
                    className="h-4 w-4 accent-evergreen-700"
                  />
                  Enable LiveKit video proctoring
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
                  <input
                    type="checkbox"
                    name="require_screen_share"
                    defaultChecked={Boolean(settings.require_screen_share)}
                    className="h-4 w-4 accent-evergreen-700"
                  />
                  Require screen sharing
                </label>
                <Button type="submit" variant="outline">Save proctoring settings</Button>
                {Boolean(settings.proctoring) && (
                  <ButtonLink href={`/dashboard/exams/${id}/proctor`} variant="gold">
                    Open live video room →
                  </ButtonLink>
                )}
              </form>
            </Card>
          )}

          {(Boolean(settings.proctoring) || (incidents ?? []).length > 0) && (
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">Proctoring incidents ({(incidents ?? []).length})</h2>
              <p className="mt-1 text-xs text-ink-soft">Incidents are observations for human review — never automatic proof of misconduct.</p>
              <div className="mt-3 space-y-2">
                {(incidents ?? []).map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-evergreen-900/10 bg-cream px-3 py-2.5 text-sm">
                    <Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"}>{i.severity}</Badge>
                    <span className="font-medium">{(i.exam_candidates as { full_name: string } | null)?.full_name ?? "—"}</span>
                    <span className="text-ink-soft">{describeIncidentType(i.type)}{i.note && !String(i.type).startsWith("integrity_") ? ` — ${i.note}` : ""}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <Badge tone={i.status === "open" ? "amber" : "green"}>{i.status}</Badge>
                      {canManageProctoring && ["open", "investigating"].includes(i.status) && (
                        <>
                          {(["valid", "invalid", "investigating"] as const).filter((s) => s !== i.status).map((s) => (
                            <form key={s} action={reviewIncident}>
                              <input type="hidden" name="id" value={i.id} />
                              <input type="hidden" name="exam_id" value={id} />
                              <input type="hidden" name="expected_status" value={i.status} />
                              <input type="hidden" name="status" value={s} />
                              <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">{s}</button>
                            </form>
                          ))}
                        </>
                      )}
                    </span>
                  </div>
                ))}
                {(incidents ?? []).length === 0 && <p className="text-sm text-ink-soft">No incidents recorded.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
