import { PageNavigation } from "@/components/PageNavigation";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Badge, Button, Card, EmptyState, Field, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/navAccess";
import {
  collectFilterOptions,
  deriveManagementStatus,
  matchesResultsFilters,
  type ResultsFilters,
} from "@/lib/resultsManagement";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { publishResults, unvalidateResults, validateResults } from "../exams/actions";

export const metadata: Metadata = { title: "Results & Management" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  validated: "Results validated. Publication is now enabled for this examination.",
  reopened: "Validation reopened — results are provisional again and can be corrected before re-validation.",
  published: "Results published. Published results are now visible to the candidates' personal result links.",
  unpublished: "Results unpublished and withheld from candidates again.",
  forbidden: "You don't have permission to validate or publish results. Ask an organization administrator.",
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
  searchParams: Promise<ResultsFilters & { page?: string; ok?: string; e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  if (!isStaffRole(org.role)) redirect("/student");

  const isManager = can(ctx, org.id, MANAGER_ROLES);
  const supabase = await createClient();

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
        eyebrow="Examinations · Results & Management"
        title="Results & Management"
        subtitle="One operational view of every examination: submissions, marking progress, provisional scores, validation and publication. Completing marking never publishes anything — validation and publication are explicit, audited actions."
      />

      {sp.ok && MESSAGES[sp.ok] && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {MESSAGES[sp.ok]}
        </p>
      )}
      {sp.e && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {sp.e === "forbidden" ? MESSAGES.forbidden : "That results action could not be completed. Reload and try again."}
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
                    <Link href={`/dashboard/reports/exam/${exam.id}`} className="rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-800 hover:bg-cream">
                      Candidate results
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
    </div>
  );
}
