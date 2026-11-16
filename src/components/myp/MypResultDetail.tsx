import { Badge, DataTable, StatCard } from "@/components/ui";
import {
  CRITERION_STATUS_LABEL,
  GRADE_STATUS_LABEL,
  criterionStatusTone,
  type MypResult,
} from "@/lib/myp";
import type { MypHistoryRow } from "@/lib/mypResults";
import { fmtDateTime } from "@/lib/utils";
import { MypStatusLegend, resultTone } from "./MypResultsTable";



/** Full criterion result page shared by the organization and global consoles. */
export function MypResultDetail({
  result,
  history,
  showOrganization,
  snapshotSlot,
}: {
  result: MypResult;
  history?: MypHistoryRow[];
  showOrganization?: boolean;
  snapshotSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Marks obtained" value={`${result.marksAwarded} / ${result.marksMax}`} hint={`${result.percent === null ? "—" : `${result.percent}%`} of the paper`} />
        <StatCard
          label="Overall MYP grade"
          value={result.overallGrade === null ? result.gradeStatusLabel : `${result.overallGrade} / 7`}
          hint={`${GRADE_STATUS_LABEL[result.gradeStatus]} · ${result.totalLevels ?? "—"} / ${result.totalLevelsMax} criterion levels`}
        />
        <StatCard label="Criteria assessed" value={`${result.criteria.filter((criterion) => criterion.status === "assessed").length} / ${result.criteria.length}`} hint={result.pendingCriteria.length ? `Pending: ${result.pendingCriteria.join(", ")}` : "No criterion awaiting a mark"} />
        <StatCard label="Publication" value={result.published ? "Released" : "Not released"} hint={result.publishedAt ? fmtDateTime(result.publishedAt) : "Publication status comes from the examination result release"} />
      </div>

      <div className="rounded-2xl border border-evergreen-900/15 bg-paper p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Student and examination</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Student", result.studentName],
            ["Student reference", result.studentRef ?? "Not recorded"],
            ...(showOrganization ? [["Organization", result.organizationName] as [string, string]] : []),
            ["MYP year", result.mypYearLabel ?? "Not mapped"],
            ["Class", result.className ?? "Not recorded"],
            ["Subject", result.subjectLabel],
            ["Examination", result.examTitle],
            ["Examination date", result.examDate ? new Date(result.examDate).toISOString().slice(0, 10) : "Not scheduled"],
            ["Attempt status", result.attemptStatus.replace(/_/g, " ")],
            ["Result status", result.publicationLabel],
            ["Reporting period", result.reportingPeriod ?? "Not set"],
            ["Criteria required", result.rules.requireAllCriteria ? "All criteria" : "Marked criteria (provisional grade)"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
              <dd className="mt-0.5 text-evergreen-950">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-2xl border border-evergreen-900/15 bg-paper p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Criterion results</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
              Achievement levels 0–8 are derived from the marks earned on this paper and then aggregated into the overall
              MYP grade. A blank level means the criterion was not assessed or is still being marked — it is not zero.
            </p>
          </div>
          <Badge tone={resultTone(result)}>{result.gradeStatusLabel}</Badge>
        </div>

        <div className="mt-4">
          <MypStatusLegend />
        </div>

        {result.errorCriteria.length > 0 && (
          <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            <strong>Marking data error.</strong> {result.errorCriteria.map((code) => `Criterion ${code}`).join(", ")} contains a
            mark that is not a valid number. It is excluded from the overall grade and is not treated as zero — correct the
            marking before releasing this result.
          </p>
        )}

        {result.zeroFilledQuestions > 0 && (
          <p className="mt-4 rounded-lg border border-evergreen-900/15 bg-evergreen-50/60 px-4 py-3 text-xs text-evergreen-900">
            {result.zeroFilledQuestions} question{result.zeroFilledQuestions === 1 ? " was" : "s were"} left unanswered when this
            attempt ended. Those questions are part of the assessment, so they score zero and the criteria they belong to are
            still fully assessed. A zero here is a result, not missing data.
          </p>
        )}

        {!result.hasCriteria ? (
          <p className="mt-4 rounded-lg border border-dashed border-evergreen-900/30 px-4 py-6 text-sm text-ink-soft">
            This paper is not criterion-mapped: its questions carry no MYP criterion, so no criterion levels or overall MYP
            grade can be derived. The examination marks remain valid.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {result.criteria.map((criterion) => (
              <div key={criterion.code} className="rounded-xl border border-evergreen-900/15 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-evergreen-950">{criterion.heading}</h3>
                    {criterion.description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">{criterion.description}</p>}
                    {!criterion.configured && (
                      <p className="mt-1 text-[11px] text-amber-800">
                        This subject has no configured criterion set, so the letter is reported from the paper. Configure the
                        subject in MYP grading settings to add the official criterion name.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={criterionStatusTone(criterion.status)}>{CRITERION_STATUS_LABEL[criterion.status]}</Badge>
                    <span className="rounded-lg bg-evergreen-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-evergreen-900">
                      {criterion.level === null ? "Level —" : `Level ${criterion.level} / 8`}
                    </span>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Marks</dt>
                    <dd className="text-sm tabular-nums text-evergreen-950">{criterion.questionCount === 0 ? "—" : `${criterion.marksAwarded} / ${criterion.marksMax}`}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Percentage</dt>
                    <dd className="text-sm tabular-nums text-evergreen-950">{criterion.percent === null ? "—" : `${criterion.percent}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Questions</dt>
                    <dd className="text-sm tabular-nums text-evergreen-950">
                      {criterion.markedCount + criterion.zeroFilledCount} / {criterion.questionCount} resolved
                      {criterion.zeroFilledCount > 0 && (
                        <span className="block text-[10px] font-normal text-ink-soft">
                          {criterion.zeroFilledCount} unanswered, scored 0
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Achievement level</dt>
                    <dd className="text-sm tabular-nums text-evergreen-950">
                      {criterion.level === null ? "Not awarded" : `${criterion.level} / 8`}
                      {criterion.assessedAtZero && (
                        <span className="ml-1 text-[10px] font-semibold text-evergreen-800">assessed — genuine 0</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {criterion.assessedAtZero && (
                  <p className="mt-2 rounded-lg bg-evergreen-50 px-3 py-2 text-xs text-evergreen-900">
                    This criterion was fully marked and earned no marks. That is an assessed level 0 — it is different from a
                    criterion that was not assessed, and it is never treated as missing data.
                  </p>
                )}
                {criterion.feedback && (
                  <p className="mt-3 text-xs leading-relaxed text-ink">
                    <span className="font-semibold text-evergreen-900">Teacher feedback: </span>
                    {criterion.feedback}
                  </p>
                )}
                {criterion.strengths.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Demonstrated strengths</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink">
                      {criterion.strengths.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {criterion.improvements.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Areas requiring improvement</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink">
                      {criterion.improvements.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {criterion.topics.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="text-ink-soft">
                          <th className="py-1 pr-3 font-semibold">Topic</th>
                          <th className="py-1 pr-3 text-right font-semibold">Marks</th>
                          <th className="py-1 text-right font-semibold">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {criterion.topics.map((topic) => (
                          <tr key={topic.topic} className="border-t border-evergreen-900/10">
                            <td className="py-1 pr-3">{topic.topic}</td>
                            <td className="py-1 pr-3 text-right tabular-nums">{topic.awarded} / {topic.max}</td>
                            <td className="py-1 text-right tabular-nums">{topic.percent}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {criterion.status === "pending_marking" || criterion.status === "partially_marked" ? (
                  <p className="mt-2 text-[11px] text-amber-800">
                    {criterion.pendingCount} question{criterion.pendingCount === 1 ? "" : "s"} in this criterion still await a mark.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-lg border border-evergreen-900/15 bg-cream px-4 py-3 text-xs leading-relaxed text-ink">
          <p className="font-semibold text-evergreen-900">
            Overall MYP grade: {result.overallGrade === null ? result.gradeStatusLabel : `${result.overallGrade} / 7`}
            {result.overallGrade !== null && ` (${GRADE_STATUS_LABEL[result.gradeStatus]})`}
          </p>
          <p className="mt-1">{result.gradeNote}</p>
          <p className="mt-2"><span className="font-semibold">Grade boundaries:</span> {result.gradeSource}</p>
          <p><span className="font-semibold">Criterion levels:</span> {result.levelSource}</p>
          <details className="mt-2">
            <summary className="cursor-pointer font-semibold text-evergreen-900">Assessment status vocabulary</summary>
            <div className="mt-2">
              <MypStatusLegend />
            </div>
          </details>
        </div>
      </div>

      <div className="rounded-2xl border border-evergreen-900/15 bg-paper p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Feedback summary</h2>
        {result.teacherFeedback.length === 0 && result.strengths.length === 0 && result.improvements.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No criterion feedback has been recorded for this result yet.</p>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Teacher feedback</h3>
              {result.teacherFeedback.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-ink">
                  {result.teacherFeedback.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-ink-soft">None recorded.</p>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Demonstrated strengths</h3>
              {result.strengths.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-ink">
                  {result.strengths.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-ink-soft">None recorded.</p>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Areas requiring improvement</h3>
              {result.improvements.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-ink">
                  {result.improvements.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-ink-soft">None recorded.</p>
              )}
            </div>
          </div>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
          Strengths and improvement points are derived from the marks recorded against each criterion and are not a substitute
          for the teacher&apos;s professional judgement. Criterion levels describe the evidence on this paper; they are not an
          IB eAssessment result.
        </p>
      </div>

      {snapshotSlot && (
        <div className="rounded-2xl border border-evergreen-900/15 bg-paper p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Result history</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-soft">
            The numbers above are always recomputed from the authoritative answer marks, so a moderation or regrade is
            reflected immediately. Archive a snapshot when a result is released or moderated: snapshots are append-only and
            preserve the criterion levels and overall grade as they stood at that moment.
          </p>
          {snapshotSlot}
          {history && history.length > 0 ? (
            <div className="mt-4">
              <DataTable head={["Recorded", "Reason", "Marks", "%", "Levels", "Overall grade", "Status", "By"]} label="MYP result snapshots">
                {history.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(row.created_at)}</td>
                    <td className="text-xs capitalize">{row.reason.replace(/_/g, " ")}</td>
                    <td className="text-xs tabular-nums">{Number(row.marks_awarded ?? 0)} / {Number(row.marks_max ?? 0)}</td>
                    <td className="text-xs tabular-nums">{row.percent === null ? "—" : `${Number(row.percent)}%`}</td>
                    <td className="text-xs tabular-nums">{row.total_levels ?? "—"} / {row.total_levels_max ?? "—"}</td>
                    <td className="text-xs tabular-nums">{row.overall_grade ?? row.grade_status}</td>
                    <td className="text-xs capitalize">{row.grade_status}</td>
                    <td className="text-xs text-ink-soft">{row.recorded_by_email ?? "System"}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink-soft">No snapshot has been archived for this result yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
