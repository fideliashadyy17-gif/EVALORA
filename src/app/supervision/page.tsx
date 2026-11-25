import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac";
import { MODULE_CATALOG, moduleEnabled } from "@/lib/modules";
import { Badge, Card, DataTable, PageTitle, StatCard } from "@/components/ui";
import { SignOutButton } from "@/components/SignOutButton";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Institutional Supervision" };
export const dynamic = "force-dynamic";

interface SupervisionOverview {
  organization_id: string;
  organization?: { id: string; name?: string; slug?: string | null; status?: string };
  enabled_modules?: {
    plan_slug: string;
    plan_name: string;
    subscription_status: string;
    current_period_end?: string | null;
    trial_ends_at?: string | null;
    effective_modules?: Record<string, boolean>;
  };
  summary?: {
    classes?: number | null;
    questions?: number | null;
    examinations?: number | null;
    competitions?: number | null;
    quizzes?: number | null;
  };
  participation_summary?: {
    total_registered_candidates?: number;
    total_attempts?: number;
    in_progress?: number;
    submitted?: number;
    graded?: number;
    awaiting_manual_grading?: number;
    average_score_pct?: number | null;
    completion_rate_pct?: number | null;
  };
  academic_structures?: {
    total_classes?: number;
    active_classes?: number;
    subjects_count?: number;
    departments_count?: number;
    academic_years_count?: number;
    grading_systems_count?: number;
    classes?: {
      id: string;
      name: string;
      code?: string | null;
      status?: string;
      level_band?: string | null;
      curriculum_track?: string | null;
    }[];
  };
  question_bank_overview?: {
    total?: number;
    published?: number;
    draft?: number;
    by_type?: Record<string, number>;
    by_difficulty?: Record<string, number>;
  };
  paper_builder_overview?: {
    total_papers?: number;
    published_papers?: number;
    draft_papers?: number;
    archived_papers?: number;
    templates_count?: number;
    recent_papers?: { id: string; title: string; status: string; updated_at?: string | null }[];
  };
  examinations?: {
    id: string;
    title: string;
    status: string;
    starts_at?: string | null;
    ends_at?: string | null;
    duration_minutes?: number | null;
    is_paused?: boolean;
    results_published?: boolean;
    results_validated?: boolean;
    grades_published_at?: string | null;
    publication_state?: string;
    total_attempts?: number;
    submitted_attempts?: number;
    in_progress_attempts?: number;
    graded_attempts?: number;
    awaiting_manual_attempts?: number;
    failed_grading_attempts?: number;
    pending_manual_items?: number;
    average_score_pct?: number | null;
  }[];
  assessment_configuration?: {
    exam_id: string;
    title: string;
    status: string;
    duration_minutes?: number | null;
    grading_system?: string | null;
    result_publication_mode?: string | null;
    proctoring_enabled?: boolean;
    lockdown_enabled?: boolean;
    calculator_enabled?: boolean;
    randomize_questions?: boolean;
    shared_link_enabled?: boolean;
  }[];
  candidate_admission_overview?: {
    shared_link_enabled_exams?: number;
    total_exams_with_admission?: number;
    total_candidates?: number;
    by_status?: Record<string, number>;
    by_source?: Record<string, number>;
  };
  marking_progress?: {
    total_attempts?: number;
    graded_attempts?: number;
    awaiting_manual_grading?: number;
    in_progress_attempts?: number;
    not_started_attempts?: number;
    grading_failed_attempts?: number;
    pending_manual_items?: number;
    correction_completion_pct?: number | null;
    total_answers?: number;
    graded_answers?: number;
    pending_manual_answers?: number;
    moderated_answers?: number;
  };
  results?: {
    submitted_attempts?: number;
    graded_attempts?: number;
    average_score_pct?: number | null;
    published_exam_count?: number;
    unpublished_exam_count?: number;
    awaiting_validation_exam_count?: number;
    ongoing_correction_exam_count?: number;
    published?: {
      exam_id: string;
      title: string;
      exam_status: string;
      grades_published_at?: string | null;
      submitted_attempts: number;
      graded_attempts: number;
      average_score_pct?: number | null;
      min_score_pct?: number | null;
      max_score_pct?: number | null;
    }[];
    unpublished?: {
      exam_id: string;
      title: string;
      exam_status: string;
      results_validated: boolean;
      total_attempts: number;
      submitted_attempts: number;
      in_progress_attempts: number;
      graded_attempts: number;
      awaiting_manual_attempts: number;
      failed_grading_attempts: number;
      pending_manual_items: number;
      correction_progress_pct?: number | null;
      average_score_pct?: number | null;
    }[];
    awaiting_validation?: {
      exam_id: string;
      title: string;
      exam_status: string;
      submitted_attempts: number;
      graded_attempts: number;
      awaiting_manual_attempts: number;
      correction_progress_pct?: number | null;
      average_score_pct?: number | null;
    }[];
    ongoing_correction?: {
      exam_id: string;
      title: string;
      exam_status: string;
      total_attempts: number;
      submitted_attempts: number;
      in_progress_attempts: number;
      graded_attempts: number;
      awaiting_manual_attempts: number;
      failed_grading_attempts: number;
      pending_manual_items: number;
      correction_progress_pct?: number | null;
    }[];
  };
  quizzes_overview?: {
    total?: number;
    published?: number;
    draft?: number;
    archived?: number;
    total_sessions?: number;
    live_sessions?: number;
    ended_sessions?: number;
  };
  competitions?: {
    id: string;
    title: string;
    status: string;
    format?: string | null;
    results_published?: boolean;
  }[];
  rankings_and_reports?: {
    exam_performance_rankings?: {
      exam_id: string;
      title: string;
      results_published: boolean;
      graded_attempts: number;
      average_score_pct?: number | null;
      pass_rate_pct?: number | null;
    }[];
    competitions_with_published_results?: number;
  };
  proctoring_overview?: {
    proctored_exams?: number;
    lockdown_exams?: number;
    total_rooms?: number;
    active_rooms?: number;
    total_incidents?: number;
    open_incidents?: number;
    investigating_incidents?: number;
    resolved_incidents?: number;
  };
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}

function stateBadgeTone(state: string | undefined): "green" | "amber" | "gold" | "gray" | "red" {
  switch (state) {
    case "published":
      return "green";
    case "validated_awaiting_publication":
      return "gold";
    case "awaiting_validation":
    case "ongoing_correction":
    case "in_progress":
      return "amber";
    default:
      return "gray";
  }
}

export default async function SupervisionPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || ctx.tenantDenied) redirect("/workspaces");
  await requirePermission(ctx, org.id, "dashboard.view");

  const client = await createClient();
  const { data, error } = await client.rpc("access_supervision_overview", { p_org: org.id });
  if (error || !data) {
    throw new Error("Institutional overview unavailable. Please contact your platform administrator.");
  }
  const overview = data as SupervisionOverview;
  const effectiveModules = overview.enabled_modules?.effective_modules ?? {};

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="gold">Institutional supervision · read-only</Badge>
        <SignOutButton />
      </div>

      <PageTitle
        title={overview.organization?.name ?? org.name}
        eyebrow="School Founder / Institutional Supervisor"
        subtitle="Comprehensive read-only oversight for your institution across examinations, published and unpublished results, validation and correction progress, academic structures, question bank, Paper Builder, competitions, proctoring summaries, and enabled modules. Mutations, candidate PII, access codes, answer keys, and live recordings are strictly disabled."
      />

      <nav aria-label="Supervision sections" className="flex flex-wrap gap-3 border-b border-evergreen-900/10 pb-3 text-sm font-semibold text-evergreen-800">
        <a href="#overview" className="hover:underline">Overview</a>
        <a href="#results" className="hover:underline">Results &amp; correction</a>
        <a href="#examinations" className="hover:underline">Examinations</a>
        <a href="#configuration" className="hover:underline">Assessment config</a>
        <a href="#admission" className="hover:underline">Admission</a>
        <a href="#academics" className="hover:underline">Academics</a>
        <a href="#content" className="hover:underline">Question bank &amp; papers</a>
        <a href="#competitions" className="hover:underline">Quizzes &amp; competitions</a>
        <a href="#rankings" className="hover:underline">Rankings &amp; reports</a>
        <a href="#proctoring" className="hover:underline">Proctoring</a>
        <a href="#modules" className="hover:underline">Enabled modules</a>
      </nav>

      {/* 1. Institutional Dashboard & Participation Summary */}
      <section id="overview" className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-evergreen-950">Institutional overview &amp; participation</h2>
        {overview.summary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {overview.summary.examinations !== null && overview.summary.examinations !== undefined && (
              <StatCard label="Examinations" value={overview.summary.examinations} />
            )}
            {overview.summary.classes !== null && overview.summary.classes !== undefined && (
              <StatCard label="Classes" value={overview.summary.classes} />
            )}
            {overview.summary.questions !== null && overview.summary.questions !== undefined && (
              <StatCard label="Questions in bank" value={overview.summary.questions} />
            )}
            {overview.summary.quizzes !== null && overview.summary.quizzes !== undefined && (
              <StatCard label="Quizzes & papers" value={overview.summary.quizzes} />
            )}
            {overview.summary.competitions !== null && overview.summary.competitions !== undefined && (
              <StatCard label="Competitions" value={overview.summary.competitions} />
            )}
          </div>
        )}
        {overview.participation_summary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {overview.participation_summary.total_registered_candidates !== undefined && (
              <StatCard label="Registered candidates" value={overview.participation_summary.total_registered_candidates} hint="Aggregate count only" />
            )}
            <StatCard label="Total attempts" value={overview.participation_summary.total_attempts ?? 0} />
            <StatCard label="Submitted" value={overview.participation_summary.submitted ?? 0} hint={`Completion ${pct(overview.participation_summary.completion_rate_pct)}`} />
            <StatCard label="In progress" value={overview.participation_summary.in_progress ?? 0} />
            <StatCard label="Average score" value={pct(overview.participation_summary.average_score_pct)} hint="Across graded attempts" />
          </div>
        )}
      </section>

      {/* 2. Results Visibility: Published, Unpublished, Awaiting Validation & Ongoing Correction */}
      {overview.results && (
        <section id="results" className="space-y-6">
          <div>
            <h2 className="font-display text-xl font-semibold text-evergreen-950">Results oversight &amp; correction progress</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Full visibility across published results, unpublished results, results awaiting validation, and ongoing manual correction — strictly read-only.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Published exams" value={overview.results.published_exam_count ?? 0} hint="Released to candidates" />
            <StatCard label="Unpublished exams" value={overview.results.unpublished_exam_count ?? 0} hint="Not yet released" />
            <StatCard label="Awaiting validation" value={overview.results.awaiting_validation_exam_count ?? 0} hint="Pending administrator sign-off" />
            <StatCard label="Ongoing correction" value={overview.results.ongoing_correction_exam_count ?? 0} hint="Manual marking or grading active" />
          </div>

          {overview.marking_progress && (
            <Card className="p-5">
              <h3 className="font-display text-base font-semibold text-evergreen-950">Marking &amp; grading progress</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <div><p className="text-xs text-ink-soft">Graded attempts</p><p className="text-lg font-semibold">{overview.marking_progress.graded_attempts ?? 0}</p></div>
                <div><p className="text-xs text-ink-soft">Awaiting manual</p><p className="text-lg font-semibold text-amber-800">{overview.marking_progress.awaiting_manual_grading ?? 0}</p></div>
                <div><p className="text-xs text-ink-soft">Pending manual items</p><p className="text-lg font-semibold">{overview.marking_progress.pending_manual_items ?? 0}</p></div>
                <div><p className="text-xs text-ink-soft">Grading alerts</p><p className="text-lg font-semibold">{overview.marking_progress.grading_failed_attempts ?? 0}</p></div>
                <div><p className="text-xs text-ink-soft">Moderated answers</p><p className="text-lg font-semibold">{overview.marking_progress.moderated_answers ?? 0}</p></div>
                <div><p className="text-xs text-ink-soft">Completion</p><p className="text-lg font-semibold">{pct(overview.marking_progress.correction_completion_pct)}</p></div>
              </div>
            </Card>
          )}

          {/* Ongoing correction progress */}
          <Card className="p-5">
            <h3 className="mb-3 font-display text-base font-semibold text-evergreen-950">
              Ongoing correction progress ({overview.results.ongoing_correction?.length ?? 0})
            </h3>
            {(overview.results.ongoing_correction?.length ?? 0) === 0 ? (
              <p className="text-sm text-ink-soft">No examinations currently have pending manual marking or incomplete grading.</p>
            ) : (
              <DataTable head={["Examination", "Status", "Submitted", "Graded", "Awaiting manual", "Pending items", "Progress"]} label="Ongoing correction progress">
                {(overview.results.ongoing_correction ?? []).map((r) => (
                  <tr key={r.exam_id}>
                    <td className="font-medium text-evergreen-950">{r.title}</td>
                    <td><Badge tone="amber">{r.exam_status}</Badge></td>
                    <td>{r.submitted_attempts}</td>
                    <td>{r.graded_attempts}</td>
                    <td>{r.awaiting_manual_attempts}</td>
                    <td>{r.pending_manual_items}</td>
                    <td className="font-semibold">{pct(r.correction_progress_pct)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          {/* Results awaiting validation */}
          <Card className="p-5">
            <h3 className="mb-3 font-display text-base font-semibold text-evergreen-950">
              Results awaiting validation ({overview.results.awaiting_validation?.length ?? 0})
            </h3>
            {(overview.results.awaiting_validation?.length ?? 0) === 0 ? (
              <p className="text-sm text-ink-soft">No examinations with submissions are currently awaiting validation.</p>
            ) : (
              <DataTable head={["Examination", "Status", "Submitted", "Graded", "Awaiting manual", "Correction %", "Provisional avg"]} label="Results awaiting validation">
                {(overview.results.awaiting_validation ?? []).map((r) => (
                  <tr key={r.exam_id}>
                    <td className="font-medium text-evergreen-950">{r.title}</td>
                    <td><Badge tone="amber">{r.exam_status}</Badge></td>
                    <td>{r.submitted_attempts}</td>
                    <td>{r.graded_attempts}</td>
                    <td>{r.awaiting_manual_attempts}</td>
                    <td>{pct(r.correction_progress_pct)}</td>
                    <td>{pct(r.average_score_pct)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          {/* Published vs Unpublished Results */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 font-display text-base font-semibold text-evergreen-950">
                Published results ({overview.results.published?.length ?? 0})
              </h3>
              {(overview.results.published?.length ?? 0) === 0 ? (
                <p className="text-sm text-ink-soft">No examination results have been published yet.</p>
              ) : (
                <DataTable head={["Examination", "Graded", "Avg", "Range", "Published"]} label="Published results">
                  {(overview.results.published ?? []).map((r) => (
                    <tr key={r.exam_id}>
                      <td className="font-medium text-evergreen-950">{r.title}</td>
                      <td>{r.graded_attempts}/{r.submitted_attempts}</td>
                      <td className="font-semibold">{pct(r.average_score_pct)}</td>
                      <td className="text-xs text-ink-soft">{pct(r.min_score_pct)} – {pct(r.max_score_pct)}</td>
                      <td className="text-xs text-ink-soft">{r.grades_published_at ? fmtDateTime(r.grades_published_at) : "Published"}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 font-display text-base font-semibold text-evergreen-950">
                Unpublished results ({overview.results.unpublished?.length ?? 0})
              </h3>
              {(overview.results.unpublished?.length ?? 0) === 0 ? (
                <p className="text-sm text-ink-soft">All examinations are published.</p>
              ) : (
                <DataTable head={["Examination", "Validated", "Graded", "Progress", "Provisional avg"]} label="Unpublished results">
                  {(overview.results.unpublished ?? []).map((r) => (
                    <tr key={r.exam_id}>
                      <td className="font-medium text-evergreen-950">{r.title}</td>
                      <td><Badge tone={r.results_validated ? "gold" : "gray"}>{r.results_validated ? "Validated" : "Not validated"}</Badge></td>
                      <td>{r.graded_attempts}/{r.submitted_attempts}</td>
                      <td>{pct(r.correction_progress_pct)}</td>
                      <td>{pct(r.average_score_pct)}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </div>
        </section>
      )}

      {/* 3. Examinations & Status */}
      {overview.examinations && (
        <section id="examinations" className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-evergreen-950">Examinations &amp; status ({overview.examinations.length})</h2>
          {overview.examinations.length === 0 ? (
            <p className="text-sm text-ink-soft">No examinations are configured for this institution.</p>
          ) : (
            <DataTable head={["Examination", "Exam status", "Publication stage", "Attempts", "Graded", "Avg score", "Schedule"]} label="Examinations overview">
              {overview.examinations.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium text-evergreen-950">{e.title}</td>
                  <td><Badge tone={e.status === "open" ? "green" : e.is_paused ? "amber" : "gray"}>{e.is_paused ? "paused" : e.status}</Badge></td>
                  <td><Badge tone={stateBadgeTone(e.publication_state)}>{(e.publication_state ?? "unknown").replaceAll("_", " ")}</Badge></td>
                  <td>{e.submitted_attempts ?? 0} submitted / {e.total_attempts ?? 0} total</td>
                  <td>{e.graded_attempts ?? 0}</td>
                  <td>{pct(e.average_score_pct)}</td>
                  <td className="text-xs text-ink-soft">{e.starts_at ? fmtDate(e.starts_at) : "Unscheduled"}{e.duration_minutes ? ` · ${e.duration_minutes}m` : ""}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      )}

      {/* 4. Assessment Configuration */}
      {overview.assessment_configuration && (
        <section id="configuration" className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-evergreen-950">Assessment configuration</h2>
          {overview.assessment_configuration.length === 0 ? (
            <p className="text-sm text-ink-soft">No assessment configurations available.</p>
          ) : (
            <DataTable head={["Examination", "Duration", "Grading system", "Publication mode", "Lockdown", "Proctoring", "Calculator", "Shared link"]} label="Assessment configuration">
              {overview.assessment_configuration.map((c) => (
                <tr key={c.exam_id}>
                  <td className="font-medium text-evergreen-950">{c.title}</td>
                  <td>{c.duration_minutes ? `${c.duration_minutes} min` : "—"}</td>
                  <td>{c.grading_system ?? "percentage"}</td>
                  <td>{c.result_publication_mode ?? "manual"}</td>
                  <td><Badge tone={c.lockdown_enabled ? "green" : "gray"}>{c.lockdown_enabled ? "On" : "Off"}</Badge></td>
                  <td><Badge tone={c.proctoring_enabled ? "green" : "gray"}>{c.proctoring_enabled ? "On" : "Off"}</Badge></td>
                  <td><Badge tone={c.calculator_enabled ? "green" : "gray"}>{c.calculator_enabled ? "On" : "Off"}</Badge></td>
                  <td><Badge tone={c.shared_link_enabled ? "green" : "gray"}>{c.shared_link_enabled ? "Enabled" : "Off"}</Badge></td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      )}

      {/* 5. Candidate Admission Overview */}
      {overview.candidate_admission_overview && (
        <section id="admission" className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-evergreen-950">Candidate admission overview</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total candidates" value={overview.candidate_admission_overview.total_candidates ?? 0} hint="Counts only; no candidate PII or tokens" />
            <StatCard label="Exams with shared link" value={overview.candidate_admission_overview.shared_link_enabled_exams ?? 0} />
            <StatCard label="Total exams tracked" value={overview.candidate_admission_overview.total_exams_with_admission ?? 0} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-evergreen-950">By admission status</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(overview.candidate_admission_overview.by_status ?? {}).map(([k, v]) => (
                  <Badge key={k}>{k.replaceAll("_", " ")}: {v}</Badge>
                ))}
                {Object.keys(overview.candidate_admission_overview.by_status ?? {}).length === 0 && (
                  <p className="text-xs text-ink-soft">No candidates registered yet.</p>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-evergreen-950">By admission source</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(overview.candidate_admission_overview.by_source ?? {}).map(([k, v]) => (
                  <Badge key={k}>{k.replaceAll("_", " ")}: {v}</Badge>
                ))}
                {Object.keys(overview.candidate_admission_overview.by_source ?? {}).length === 0 && (
                  <p className="text-xs text-ink-soft">No admission sources recorded yet.</p>
                )}
              </div>
            </Card>
          </div>
        </section>
      )}

      {/* 6. Classes & Academic Structures */}
      {overview.academic_structures && (
        <section id="academics" className="space-y-4">
          <h2 className="font-display text-xl font-semibold text-evergreen-950">Classes &amp; academic structures</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Classes" value={overview.academic_structures.total_classes ?? 0} hint={`${overview.academic_structures.active_classes ?? 0} active`} />
            {overview.academic_structures.subjects_count !== undefined && <StatCard label="Subjects" value={overview.academic_structures.subjects_count} />}
            {overview.academic_structures.departments_count !== undefined && <StatCard label="Departments" value={overview.academic_structures.departments_count} />}
            {overview.academic_structures.academic_years_count !== undefined && <StatCard label="Academic years" value={overview.academic_structures.academic_years_count} />}
            {overview.academic_structures.grading_systems_count !== undefined && <StatCard label="Grading systems" value={overview.academic_structures.grading_systems_count} />}
          </div>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold text-evergreen-950">Configured classes</h3>
            <div className="flex flex-wrap gap-2">
              {(overview.academic_structures.classes ?? []).map((cls) => (
                <Badge key={cls.id} tone={cls.status === "active" ? "green" : "gray"}>
                  {cls.name}{cls.curriculum_track ? ` · ${cls.curriculum_track}` : ""}
                </Badge>
              ))}
              {(overview.academic_structures.classes ?? []).length === 0 && (
                <p className="text-sm text-ink-soft">No classes are configured.</p>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* 7. Question Bank & Paper Builder Overview */}
      <section id="content" className="grid gap-6 md:grid-cols-2">
        {overview.question_bank_overview && (
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Question bank overview</h2>
            <p className="mt-1 text-xs text-ink-soft">Aggregate metadata only; prompts and answer keys are never exposed.</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-cream p-3"><p className="text-xs text-ink-soft">Total</p><p className="text-xl font-semibold">{overview.question_bank_overview.total ?? 0}</p></div>
              <div className="rounded-lg bg-cream p-3"><p className="text-xs text-ink-soft">Published</p><p className="text-xl font-semibold text-evergreen-800">{overview.question_bank_overview.published ?? 0}</p></div>
              <div className="rounded-lg bg-cream p-3"><p className="text-xs text-ink-soft">Draft</p><p className="text-xl font-semibold">{overview.question_bank_overview.draft ?? 0}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(overview.question_bank_overview.by_type ?? {}).map(([t, c]) => (
                <Badge key={t}>{t.replaceAll("_", " ")}: {c}</Badge>
              ))}
            </div>
          </Card>
        )}

        {overview.paper_builder_overview && (
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Paper Builder overview</h2>
            <p className="mt-1 text-xs text-ink-soft">Paper catalogue and official template counts (read-only).</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-cream p-3"><p className="text-xs text-ink-soft">Papers</p><p className="text-xl font-semibold">{overview.paper_builder_overview.total_papers ?? 0}</p></div>
              <div className="rounded-lg bg-cream p-3"><p className="text-xs text-ink-soft">Published</p><p className="text-xl font-semibold text-evergreen-800">{overview.paper_builder_overview.published_papers ?? 0}</p></div>
              <div className="rounded-lg bg-cream p-3"><p className="text-xs text-ink-soft">Templates</p><p className="text-xl font-semibold">{overview.paper_builder_overview.templates_count ?? 0}</p></div>
            </div>
            <div className="mt-4 space-y-2">
              {(overview.paper_builder_overview.recent_papers ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 py-1.5 text-sm">
                  <span className="truncate font-medium">{p.title}</span>
                  <Badge tone={p.status === "published" ? "green" : "gray"}>{p.status}</Badge>
                </div>
              ))}
              {(overview.paper_builder_overview.recent_papers ?? []).length === 0 && (
                <p className="text-sm text-ink-soft">No papers configured yet.</p>
              )}
            </div>
          </Card>
        )}
      </section>

      {/* 8. Quizzes & Live Competitions */}
      <section id="competitions" className="grid gap-6 md:grid-cols-2">
        {overview.quizzes_overview && (
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Quizzes &amp; live sessions</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Total quizzes" value={overview.quizzes_overview.total ?? 0} />
              <StatCard label="Published" value={overview.quizzes_overview.published ?? 0} />
              <StatCard label="Live sessions" value={overview.quizzes_overview.live_sessions ?? 0} hint={`${overview.quizzes_overview.ended_sessions ?? 0} ended`} />
            </div>
          </Card>
        )}
        {overview.competitions && (
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Competitions ({overview.competitions.length})</h2>
            <p className="mt-1 text-xs text-ink-soft">Competition lifecycle and publication visibility; join codes remain private.</p>
            <div className="mt-3 space-y-2">
              {overview.competitions.slice(0, 15).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 py-1.5 text-sm">
                  <span className="truncate font-medium">{c.title}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={c.status === "live" ? "green" : "gray"}>{c.status}</Badge>
                    {c.results_published && <Badge tone="gold">Results published</Badge>}
                  </div>
                </div>
              ))}
              {overview.competitions.length === 0 && <p className="text-sm text-ink-soft">No competitions configured.</p>}
            </div>
          </Card>
        )}
      </section>

      {/* 9. Rankings & Reports + Proctoring Overview */}
      <section id="rankings" className="space-y-4">
        {overview.rankings_and_reports && (
          <Card className="p-5">
            <h2 className="mb-1 font-display text-lg font-semibold text-evergreen-950">Rankings &amp; institutional performance reports</h2>
            <p className="mb-4 text-xs text-ink-soft">
              Aggregate examination performance bands without exposing individual student identities · {overview.rankings_and_reports.competitions_with_published_results ?? 0} competition(s) with published rankings.
            </p>
            {(overview.rankings_and_reports.exam_performance_rankings?.length ?? 0) === 0 ? (
              <p className="text-sm text-ink-soft">No graded examination performance data available yet.</p>
            ) : (
              <DataTable head={["Examination", "Release status", "Graded attempts", "Average score", "Pass rate (≥50%)"]} label="Institutional performance rankings">
                {(overview.rankings_and_reports.exam_performance_rankings ?? []).map((r) => (
                  <tr key={r.exam_id}>
                    <td className="font-medium text-evergreen-950">{r.title}</td>
                    <td><Badge tone={r.results_published ? "green" : "amber"}>{r.results_published ? "Published" : "Unpublished"}</Badge></td>
                    <td>{r.graded_attempts}</td>
                    <td className="font-semibold">{pct(r.average_score_pct)}</td>
                    <td>{pct(r.pass_rate_pct)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        )}
      </section>

      {overview.proctoring_overview && (
        <section id="proctoring" className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-evergreen-950">Proctoring overview</h2>
          <p className="text-xs text-ink-soft">Aggregate monitoring telemetry only; live camera feeds, recordings, and individual candidate reports are private.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Proctored / lockdown exams" value={`${overview.proctoring_overview.proctored_exams ?? 0} / ${overview.proctoring_overview.lockdown_exams ?? 0}`} />
            <StatCard label="Active rooms" value={overview.proctoring_overview.active_rooms ?? 0} hint={`${overview.proctoring_overview.total_rooms ?? 0} total`} />
            <StatCard label="Open / investigating" value={(overview.proctoring_overview.open_incidents ?? 0) + (overview.proctoring_overview.investigating_incidents ?? 0)} />
            <StatCard label="Resolved incidents" value={overview.proctoring_overview.resolved_incidents ?? 0} hint={`${overview.proctoring_overview.total_incidents ?? 0} total`} />
          </div>
        </section>
      )}

      {/* 10. Enabled Modules & Subscription */}
      <Card id="modules" className="p-5">
        <h2 className="font-display text-xl font-semibold text-evergreen-950">Enabled modules &amp; subscription</h2>
        <p className="my-2 text-sm text-ink-soft">
          <strong>{overview.enabled_modules?.plan_name ?? "Free"}</strong> · {overview.enabled_modules?.subscription_status ?? "free"}
          {overview.enabled_modules?.current_period_end ? ` · active through ${fmtDate(overview.enabled_modules.current_period_end)}` : ""}
          {" · "}Subscription and module settings are strictly read-only.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODULE_CATALOG.map((m) => {
            const enabled = moduleEnabled(effectiveModules, m.key);
            return (
              <div key={m.key} className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 py-2 text-sm">
                <span>{m.label}</span>
                <Badge tone={enabled ? "green" : "gray"}>{enabled ? "Enabled" : "Disabled"}</Badge>
              </div>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
