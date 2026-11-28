import { PageNavigation } from "@/components/PageNavigation";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { CopyResultLinkButton } from "@/components/CopyResultLinkButton";
import { CandidatePaperDownloadButton } from "@/components/CandidatePaperDownloadButton";
import { isAttemptEligibleForPaperPdf } from "@/lib/candidatePaper";
import { ExportButton, PrintButton } from "@/components/ExportTools";
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperateMany } from "@/lib/operationalAccess";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { getEntitlement } from "@/lib/entitlements";
import { isScoreAdjustmentPlanEligible } from "@/lib/scoreAdjustments";
import { isOperationalRole } from "@/lib/navAccess";
import {
  collectFilterOptions,
  deriveManagementStatus,
  matchesResultsFilters,
  type ResultsFilters,
} from "@/lib/resultsManagement";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/utils";
import { resolveAssessmentConfig } from "@/lib/assessmentConfig";
import { passMarkFrom } from "@/lib/examFeedback";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { publishResults, unvalidateResults, validateResults } from "../exams/actions";
import { requestFormatter } from "@/lib/formattingRequest";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";

export const metadata: Metadata = { title: "Results Management & Candidate Links" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  validated: "Results validated. Publication is now enabled for this examination.",
  reopened: "Validation reopened — results are provisional again and can be corrected before re-validation.",
  published: "Results published. Published results are now visible to the candidates' personal result links.",
  unpublished: "Results unpublished and withheld from candidates again.",
  forbidden: "You don't have permission to validate or publish results. Ask an organization administrator.",
  module: "Results Management & Candidate Links is disabled for this organization. A Super Admin can activate it in Plan & Module Management — no results or candidate data are deleted when a module is toggled.",
};

const RESULT_AUDIT_ACTIONS = [
  "exam.results_validated",
  "exam.results_validation_reopened",
  "exam.results_published",
  "exam.results_unpublished",
];

interface AttemptStat {
  id: string;
  status: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
}

interface ExamRow {
  id: string;
  title: string;
  status: string;
  settings: Record<string, unknown> | null;
  created_at: string;
  grades_published_at: string | null;
  exam_attempts: AttemptStat[];
}

interface AnswerStat {
  id: string;
  attempt_id: string;
  is_correct: boolean | null;
  questions: { type: string } | null;
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export default async function ResultsManagementPage({
  searchParams,
}: {
  searchParams: Promise<ResultsFilters & { page?: string; ok?: string; e?: string; exam?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the session's own organization.
  const { dateTime: fmtDateTime } = await requestFormatter(org?.id ?? null);
  const sp = await searchParams;
  if (!isOperationalRole(org.role)) redirect("/student");

  const { canView, isManager, canManageLinks, canGrade } = await canOperateMany(ctx, org.id, {
    canView: { permission: "results.view", module: "exam_results" },
    isManager: { permission: "results.publish" },
    canManageLinks: { permission: "candidate_links.edit", module: "exam_share_codes" },
    canGrade: { permission: "grading.edit", module: "exam_results" },
  });
  if (!canView) redirect("/dashboard?e=forbidden");
  const supabase = await createClient();
  // Module activation (Plan & Module Management) gates this feature
  // server-side — disabling it hides the nav entry AND blocks the page,
  // without touching any results, links or examination data.
  const { entitlement } = await getCapabilities(supabase, ctx, org.id);
  requireModule(entitlement, "exam_results", "/dashboard/results?e=module");
  const orgRealEntitlement = await getEntitlement(supabase, org.id);
  const scoreAdjustmentEligible = isScoreAdjustmentPlanEligible(orgRealEntitlement);

  const { data: rawExams, error: examsError } = await supabase
    .from("exams")
    .select(
      "id, title, status, settings, created_at, grades_published_at, exam_attempts(id, status, submitted_at, score, max_score)",
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (rawExams ?? []) as unknown as ExamRow[];
  const examsLoadFailed = Boolean(examsError);

  // Written-marking progress across every attempt of this organisation.
  const attemptIds = exams.flatMap((e) => e.exam_attempts.map((a) => a.id));
  const answers: AnswerStat[] = [];
  if (attemptIds.length) {
    for (const part of chunk(attemptIds, 200)) {
      const { data } = await supabase
        .from("exam_answers")
        .select("id, attempt_id, is_correct, questions(type)")
        .in("attempt_id", part);
      answers.push(...((data ?? []) as unknown as AnswerStat[]));
    }
  }
  const answersByAttempt = new Map<string, AnswerStat[]>();
  for (const answer of answers) {
    const list = answersByAttempt.get(answer.attempt_id) ?? [];
    list.push(answer);
    answersByAttempt.set(answer.attempt_id, list);
  }

  const rows = exams.map((exam) => {
    const attempts = exam.exam_attempts ?? [];
    const submitted = attempts.filter((a) => a.status !== "in_progress");
    const written = attempts.flatMap((a) => answersByAttempt.get(a.id) ?? []).filter((a) => a.questions?.type === "open_ended");
    const awaitingMarking = written.filter((a) => a.is_correct === null).length;
    const markedCount = written.length - awaitingMarking;
    const missingScores = submitted.filter((a) => a.score == null).length;
    const settings = (exam.settings ?? {}) as Record<string, unknown>;
    const status = deriveManagementStatus({
      examStatus: exam.status,
      attemptCount: attempts.length,
      submittedCount: submitted.length,
      awaitingMarking,
      markedCount,
      missingScores,
      resultsValidated: settings.results_validated === true,
      resultsPublished: settings.results_published === true,
    });
    return { exam, settings, attempts, submitted, awaitingMarking, markedCount, missingScores, status };
  });

  const options = collectFilterOptions(rows.map((r) => ({ settings: r.settings })));
  const filtered = rows.filter((r) => matchesResultsFilters({ ...r.exam, settings: r.settings }, r.status, sp));
  const pageSize = 12;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const totals = {
    exams: rows.length,
    awaitingMarking: rows.reduce((sum, r) => sum + r.awaitingMarking, 0),
    awaitingValidation: rows.filter((r) => r.status.validationStatus === "awaiting" && r.status.markingStatus === "complete" && r.submitted.length > 0).length,
    published: rows.filter((r) => r.status.publicationStatus === "published").length,
    missingScores: rows.reduce((sum, r) => sum + r.missingScores, 0),
  };

  // Audit history for publication/validation — org-scoped by RLS.
  const visibleIds = filtered.slice(0, 50).map((r) => r.exam.id);
  const { data: rawAudit } = visibleIds.length
    ? await supabase
        .from("audit_logs")
        .select("action, entity_id, created_at")
        .in("entity_id", visibleIds)
        .in("action", RESULT_AUDIT_ACTIONS)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] as { action: string; entity_id: string; created_at: string }[] };
  const auditByExam = new Map<string, { action: string; created_at: string }[]>();
  for (const entry of (rawAudit ?? []) as { action: string; entity_id: string; created_at: string }[]) {
    const list = auditByExam.get(entry.entity_id) ?? [];
    list.push({ action: entry.action, created_at: entry.created_at });
    auditByExam.set(entry.entity_id, list);
  }

  // ── Candidate links for the selected examination (tenant-scoped) ──────
  // Same secure mechanism as the Super Admin reference and the exam
  // workspace: one per-attempt access_token → /exam/result/<token>, which
  // only ever reveals that candidate's own result, and only once the
  // examination's results are published.
  const selectedExamId =
    typeof sp.exam === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.exam)
      ? sp.exam
      : null;
  interface CandidateAttempt {
    id: string;
    status: string;
    submitted_at: string | null;
    score: number | null;
    max_score: number | null;
    attempt_number?: number | null;
    access_token: string;
    exam_candidates: { full_name: string; candidate_ref: string | null; email: string | null; access_code?: string | null } | null;
  }
  let candidateSection:
    | { notFound: true }
    | {
        notFound?: false;
        exam: ExamRow & { settings: Record<string, unknown> };
        attempts: CandidateAttempt[];
        candidateTotal: number;
        passMark: number;
        percentages: number[];
        passes: number;
        csv: string;
        origin: string;
      }
    | null = null;
  if (selectedExamId) {
    const selectedRow = rows.find((r) => r.exam.id === selectedExamId);
    if (!selectedRow) {
      // Not in this organization's exams — indistinguishable from missing.
      candidateSection = { notFound: true };
    } else {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online";
      const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
      const [{ data: rawAttempts }, { count: candidateTotal }] = await Promise.all([
        supabase
          .from("exam_attempts")
          .select("id, status, submitted_at, score, max_score, attempt_number, access_token, exam_candidates(full_name, candidate_ref, email, access_code)")
          .eq("exam_id", selectedExamId)
          .order("score", { ascending: false, nullsFirst: false })
          .limit(1000),
        supabase.from("exam_candidates").select("id", { count: "exact", head: true }).eq("exam_id", selectedExamId),
      ]);
      const attempts = (rawAttempts ?? []) as unknown as CandidateAttempt[];
      const assessmentCfg = await resolveAssessmentConfig(org.id);
      const passMark = passMarkFrom(selectedRow.settings, assessmentCfg.defaultPassPercent);
      const scored = attempts.filter((a) => a.status !== "in_progress" && a.score != null && a.max_score);
      const percentages = scored.map((a) => (Number(a.score) / Math.max(1, Number(a.max_score))) * 100);
      const passes = percentages.filter((pct) => pct >= passMark).length;
      const published = selectedRow.settings.results_published === true;
      const csv = toCsv([
        ["Candidate", "Reference", "Email", "Status", "Score", "Maximum", "Percent", "Outcome", "Publication", "Individual Result Link", "Started", "Submitted"],
        ...attempts.map((a) => {
          const pct = a.score != null && a.max_score ? Math.round((Number(a.score) / Math.max(1, Number(a.max_score))) * 1000) / 10 : "";
          return [
            a.exam_candidates?.full_name ?? "",
            a.exam_candidates?.candidate_ref ?? "",
            a.exam_candidates?.email ?? "",
            a.status,
            a.score ?? "",
            a.max_score ?? "",
            pct,
            pct === "" ? "PENDING" : pct >= passMark ? "PASS" : "FAIL",
            published ? "Published" : "Withheld",
            `${origin}/exam/result/${a.access_token}`,
            a.submitted_at ?? "",
          ];
        }),
      ]);
      candidateSection = {
        exam: { ...selectedRow.exam, settings: selectedRow.settings },
        attempts,
        candidateTotal: candidateTotal ?? 0,
        passMark,
        percentages,
        passes,
        csv,
        origin,
      };
    }
  }

  const actionLabel: Record<string, string> = {
    "exam.results_validated": "Validated",
    "exam.results_validation_reopened": "Validation reopened",
    "exam.results_published": "Published",
    "exam.results_unpublished": "Unpublished",
  };
  const statusTone: Record<string, "green" | "gold" | "amber" | "gray" | "red"> = {
    published: "green",
    validated: "green",
    provisional_results: "gold",
    marking_in_progress: "amber",
    awaiting_marking: "amber",
    awaiting_submissions: "gray",
    scheduled: "gray",
    draft: "gray",
  };

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Examinations · Results & Candidate Links"
        title="Results Management & Candidate Links"
        subtitle="One operational view of every examination: submissions, marking progress, provisional scores, validation, publication and each candidate's individual result link. Completing marking never publishes anything — validation and publication are explicit, audited actions."
        action={
          typeof sp.exam === "string" && sp.exam ? (
            <div className="flex flex-wrap gap-2">
              <PrintButton />
            </div>
          ) : undefined
        }
      />

      {sp.ok && MESSAGES[sp.ok] && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {MESSAGES[sp.ok]}
        </p>
      )}
      {sp.e && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {sp.e === "forbidden"
            ? MESSAGES.forbidden
            : sp.e === "module"
              ? MESSAGES.module
              : "That results action could not be completed. Reload and try again."}
        </p>
      )}

      {examsLoadFailed && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          The examinations could not be loaded ({examsError?.message ?? "unknown error"}).
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Examinations" value={totals.exams} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Awaiting marking" value={totals.awaitingMarking} hint="written answers" icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="Awaiting validation" value={totals.awaitingValidation} hint="marking complete" icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Published" value={totals.published} hint="visible to candidates" icon={<Eye className="h-5 w-5" />} />
        <StatCard label="Missing scores" value={totals.missingScores} hint="submitted, unmarked totals" icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      {/* ── Candidate links (selected examination) ────────────────────── */}
      {selectedExamId && !candidateSection && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          That examination does not exist in this organization.
        </p>
      )}
      {candidateSection && "notFound" in candidateSection && candidateSection.notFound && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          That examination does not exist in this organization.
        </p>
      )}
      {candidateSection && !("notFound" in candidateSection) && (
        <Card className="p-5" data-testid="candidate-links-section">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-evergreen-900/10 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-evergreen-950">
                  Results Management &amp; Candidate Links — {candidateSection.exam.title}
                </h2>
                <Badge tone={candidateSection.exam.settings.results_published ? "green" : "amber"}>
                  {candidateSection.exam.settings.results_published ? "Published (links reveal results)" : "Withheld (links hide results)"}
                </Badge>
                {candidateSection.exam.settings.results_validated === true && (
                  <Badge tone="green">Validated</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                Each candidate receives a unique, secure personal link. Copy and distribute it —
                the link only ever shows that candidate&apos;s own result, and only after publication.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageLinks && (
                <ExportButton filename={`candidate-links-${candidateSection.exam.id}.csv`} csv={candidateSection.csv} label="Export links (CSV / Excel)" />
              )}
              <Link href={`/dashboard/results`} className="inline-flex min-h-10 items-center rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-800 hover:bg-cream">
                Back to overview
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Registered candidates" value={candidateSection.candidateTotal} icon={<FileCheck2 className="h-5 w-5" />} />
            <StatCard label="Submitted attempts" value={candidateSection.attempts.filter((a) => a.status !== "in_progress").length} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard label="Average score" value={candidateSection.percentages.length ? `${Math.round((candidateSection.percentages.reduce((a, b) => a + b, 0) / candidateSection.percentages.length) * 10) / 10}%` : "—"} icon={<Award className="h-5 w-5" />} />
            <StatCard label="Pass rate" value={candidateSection.percentages.length ? `${Math.round((candidateSection.passes / candidateSection.percentages.length) * 1000) / 10}%` : "—"} hint={`${candidateSection.passes}/${candidateSection.percentages.length} at ${candidateSection.passMark}%`} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard label="Link availability" value={candidateSection.exam.settings.results_published ? "Live" : "Withheld"} hint="per-candidate result links" icon={<Eye className="h-5 w-5" />} />
          </div>

          <div className="mt-4">
            {candidateSection.attempts.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-soft">
                No candidate attempts yet. As candidates start and submit their papers, their individual result links will appear here.
              </p>
            ) : (
              <DataTable
                head={["Candidate Name & Identifier", "Attempt", "Submission Status", "Score", "%", "Publication", "Individual Result Link", "Actions"]}
                label="Candidate individual result links"
              >
                {candidateSection.attempts.map((a, idx) => {
                  const pct = a.score != null && a.max_score ? (Number(a.score) / Math.max(1, Number(a.max_score))) * 100 : null;
                  const candName = a.exam_candidates?.full_name ?? "Candidate";
                  const candId = a.exam_candidates?.candidate_ref || a.exam_candidates?.email || (canManageLinks && a.exam_candidates?.access_code ? `Code: ${a.exam_candidates.access_code}` : null);
                  const resultUrl = canManageLinks ? `${candidateSection.origin}/exam/result/${a.access_token}` : null;
                  const published = candidateSection.exam.settings.results_published === true;
                  return (
                    <tr key={a.id} data-testid="candidate-link-row">
                      <td>
                        <span className="font-medium text-evergreen-950">{candName}</span>
                        {candId && <span className="block text-xs text-ink-soft">{candId}</span>}
                        <span className="block text-[11px] text-ink-soft">#{idx + 1}</span>
                      </td>
                      <td className="text-xs font-medium text-ink-soft">Attempt {a.attempt_number ?? 1}</td>
                      <td>
                        <Badge tone={a.status === "in_progress" ? "amber" : "green"}>{a.status.replace(/_/g, " ")}</Badge>
                        {a.submitted_at && <span className="block text-[11px] text-ink-soft">{fmtDateTime(a.submitted_at)}</span>}
                      </td>
                      <td className="tabular-nums text-sm font-semibold text-evergreen-900">
                        {a.status !== "in_progress" && a.score != null ? `${Number(a.score)} / ${Number(a.max_score ?? 0)}` : "—"}
                      </td>
                      <td className="tabular-nums text-sm">{pct === null ? "—" : `${Math.round(pct * 10) / 10}%`}</td>
                      <td>
                        <Badge tone={published ? "green" : "amber"}>{published ? "Published" : "Withheld"}</Badge>
                      </td>
                      <td className="max-w-xs">
                        {resultUrl ? (
                          <input
                            type="text"
                            readOnly
                            value={resultUrl}
                            className="w-full truncate rounded border border-evergreen-900/15 bg-cream/50 px-2 py-1 font-mono text-xs text-evergreen-950 select-all"
                            title={resultUrl}
                            aria-label={`Individual result link for ${candName}`}
                          />
                        ) : (
                          <span className="text-xs text-ink-soft">Protected</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isAttemptEligibleForPaperPdf(a.status) && (
                            <CandidatePaperDownloadButton
                              mode="staff"
                              examId={candidateSection.exam.id}
                              attemptId={a.id}
                              label="Download Candidate Paper (PDF)"
                              compact
                            />
                          )}
                          {resultUrl ? (
                            <>
                              <CopyResultLinkButton url={resultUrl} candidateName={candName} />
                              <Link href={`/exam/result/${a.access_token}`} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-xs font-semibold text-evergreen-800 underline underline-offset-2">
                                View
                              </Link>
                            </>
                          ) : !isAttemptEligibleForPaperPdf(a.status) ? (
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

          <p className="mt-3 text-[11px] text-ink-soft">
            Publication control: while results are withheld, every personal link shows only an official
            “received, awaiting review” confirmation — no marks, no answers, no other candidate&apos;s data.
            Unpublishing immediately withholds the links again (existing security mechanism, no separate revocation needed).
          </p>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Examination">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search title…" />
          </Field>
          <Field label="Academic year">
            <Select name="academic_year" defaultValue={sp.academic_year ?? ""}>
              <option value="">All years</option>
              {options.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Class / grade">
            <Select name="grade" defaultValue={sp.grade ?? ""}>
              <option value="">All classes</option>
              {options.grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select name="subject" defaultValue={sp.subject ?? ""}>
              <option value="">All subjects</option>
              {options.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Examination status">
            <Select name="exam_status" defaultValue={sp.exam_status ?? ""}>
              <option value="">Any status</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
          <Field label="Marking status">
            <Select name="marking" defaultValue={sp.marking ?? ""}>
              <option value="">Any marking</option>
              <option value="awaiting">Awaiting marking</option>
              <option value="in_progress">Marking in progress</option>
              <option value="complete">Marking completed</option>
            </Select>
          </Field>
          <Field label="Validation status">
            <Select name="validation" defaultValue={sp.validation ?? ""}>
              <option value="">Any validation</option>
              <option value="awaiting">Awaiting validation</option>
              <option value="validated">Validated</option>
            </Select>
          </Field>
          <Field label="Publication status">
            <Select name="publication" defaultValue={sp.publication ?? ""}>
              <option value="">Any publication</option>
              <option value="withheld">Withheld</option>
              <option value="published">Published</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="outline">Apply filters</Button>
            <Link href="/dashboard/results" className="inline-flex min-h-10 items-center px-1 text-sm font-medium text-evergreen-800 underline underline-offset-2">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No examinations yet" : "No examinations match these filters"}
          body={rows.length === 0 ? "Create an examination, run it, mark it — then validate and publish its results from here." : "Adjust or reset the filters to see examinations again."}
          action={<Link href="/dashboard/exams" className="text-sm font-medium text-evergreen-700 underline underline-offset-2">Go to examinations</Link>}
        />
      ) : (
        <div className="space-y-4">
          {filtered.slice((page - 1) * pageSize, page * pageSize).map(({ exam, settings, attempts, submitted, awaitingMarking, markedCount, missingScores, status }) => {
            const history = auditByExam.get(exam.id) ?? [];
            return (
              <Card key={exam.id} className="p-5" data-testid="results-management-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/exams/${exam.id}`} className="font-display text-base font-semibold text-evergreen-950 underline-offset-2 hover:underline">
                        {exam.title}
                      </Link>
                      <Badge tone={statusTone[status.key] ?? "gray"}>{status.label}</Badge>
                      {status.hasMissingScores && <Badge tone="red">{missingScores} missing score{missingScores === 1 ? "" : "s"}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {attempts.length} candidate attempt{attempts.length === 1 ? "" : "s"} · {submitted.length} submitted
                      {typeof settings.academic_year === "string" && settings.academic_year ? ` · ${settings.academic_year}` : ""}
                      {typeof settings.grade_label === "string" && settings.grade_label ? ` · ${settings.grade_label}` : ""}
                      {typeof settings.subject === "string" && settings.subject ? ` · ${settings.subject}` : ""}
                      {" · "}
                      {status.markingStatus === "none"
                        ? "no written marking tasks"
                        : status.markingStatus === "awaiting"
                          ? `${awaitingMarking} written answer${awaitingMarking === 1 ? "" : "s"} awaiting marking`
                          : status.markingStatus === "in_progress"
                            ? `marking in progress (${markedCount} marked, ${awaitingMarking} to go)`
                            : "marking completed"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {settings.results_validated === true
                        ? `Validated${typeof settings.results_validated_at === "string" ? ` · ${fmtDateTime(settings.results_validated_at as string)}` : ""}`
                        : "Not validated"}
                      {" · "}
                      {exam.grades_published_at
                        ? `Published · ${fmtDateTime(exam.grades_published_at)}`
                        : "Withheld from candidates"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/exams/${exam.id}`} className="rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-800 hover:bg-cream">
                      Marking queue
                    </Link>
                    {scoreAdjustmentEligible && canGrade && (
                      <Link href={`/dashboard/exams/${exam.id}/adjustments`} className="rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-800 hover:bg-cream">
                        Score adjustment
                      </Link>
                    )}
                    <Link href={`/dashboard/reports/exam/${exam.id}`} className="rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-800 hover:bg-cream">
                      Candidate results
                    </Link>
                    <Link href={`/dashboard/results?exam=${exam.id}`} className="rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-800 hover:bg-cream" data-testid="candidate-links-link">
                      Candidate links
                    </Link>
                    {isManager && attempts.length > 0 && settings.results_validated !== true && !settings.results_published && (
                      <form action={validateResults}>
                        <input type="hidden" name="exam_id" value={exam.id} />
                        <input type="hidden" name="back" value="/dashboard/results" />
                        <ConfirmSubmit
                          message={`Validate the results of “${exam.title}”? This records who validated and when, and enables publication.`}
                          variant="primary"
                          className="text-xs"
                        >
                          Validate results
                        </ConfirmSubmit>
                      </form>
                    )}
                    {isManager && settings.results_validated === true && !settings.results_published && (
                      <form action={unvalidateResults}>
                        <input type="hidden" name="exam_id" value={exam.id} />
                        <input type="hidden" name="back" value="/dashboard/results" />
                        <ConfirmSubmit
                          message={`Reopen validation for “${exam.title}”? Results become provisional again for correction.`}
                          variant="outline"
                          className="text-xs"
                        >
                          Reopen for correction
                        </ConfirmSubmit>
                      </form>
                    )}
                    {isManager && (
                      <form action={publishResults}>
                        <input type="hidden" name="exam_id" value={exam.id} />
                        <input type="hidden" name="publish" value={settings.results_published ? "0" : "1"} />
                        <input type="hidden" name="back" value="/dashboard/results" />
                        <ConfirmSubmit
                          message={
                            settings.results_published
                              ? `Unpublish the results of “${exam.title}”? Candidates will no longer see them.`
                              : `Publish the results of “${exam.title}”? They will become visible to candidates on their personal result links.`
                          }
                          variant={settings.results_published ? "outline" : "gold"}
                          className="text-xs"
                          disabled={!settings.results_published && settings.results_validated !== true}
                          title={!settings.results_published && settings.results_validated !== true ? "Validate the results first" : undefined}
                        >
                          {settings.results_published ? "Unpublish" : "Publish results"}
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </div>

                {!isManager && (
                  <p className="mt-2 text-[11px] text-ink-soft">
                    Validation and publication are restricted to organization administrators.
                  </p>
                )}
                {settings.results_validated !== true && !settings.results_published && attempts.length > 0 && isManager && (
                  <p className="mt-2 text-[11px] text-amber-800">Validate the results before publishing.</p>
                )}

                {history.length > 0 && (
                  <details className="mt-3" data-testid="results-audit-history">
                    <summary className="cursor-pointer text-xs font-semibold text-evergreen-800">
                      Publication history ({history.length} audited event{history.length === 1 ? "" : "s"})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {history.map((entry, i) => (
                        <li key={`${entry.action}-${entry.created_at}-${i}`} className="text-[11px] text-ink-soft">
                          {fmtDateTime(entry.created_at)} — {actionLabel[entry.action] ?? entry.action}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            );
          })}
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            pathname="/dashboard/results"
            query={{
              q: sp.q,
              academic_year: sp.academic_year,
              grade: sp.grade,
              subject: sp.subject,
              exam_status: sp.exam_status,
              marking: sp.marking,
              validation: sp.validation,
              publication: sp.publication,
            }}
            label="examinations"
          />
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-ink-soft">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        Only published results are visible to candidates — server-side checks on /exam/result and the student workspace enforce this independently of this page.
        <EyeOff className="h-4 w-4" aria-hidden />
      </p>
      <AssistantPanel title="Results assistant" />
    </div>
  );
}
