import { Badge, DataTable, StatCard } from "@/components/ui";
import { MypExportButton } from "./MypExportButton";
import {
  CRITERION_STATUS_LABEL,
  CRITERION_STATUS_MEANING,
  criterionStatusTone,
  type MypAnalytics,
  type MypResult,
} from "@/lib/myp";

/** Tone of the badge for a result, driven by grade status — never by a guess. */
export function resultTone(result: MypResult): "green" | "gold" | "amber" | "gray" | "red" {
  if (result.errorCriteria.length > 0) return "red";
  if (result.gradeStatus === "final") return result.overallGrade === null ? "gray" : "green";
  if (result.gradeStatus === "provisional") return "gold";
  if (result.gradeStatus === "incomplete") return "amber";
  return "gray";
}

const TONE_CLASS: Record<ReturnType<typeof criterionStatusTone>, string> = {
  green: "bg-evergreen-100 text-evergreen-800",
  amber: "bg-amber-100 text-amber-800",
  gray: "bg-stone-200 text-stone-700",
  red: "bg-red-100 text-red-800",
};

/**
 * What the colours mean. Status is always spelled out next to the colour, so a
 * teacher can read the page without relying on colour vision.
 */
export function MypStatusLegend({ compact = false }: { compact?: boolean }) {
  const rows = (Object.keys(CRITERION_STATUS_LABEL) as (keyof typeof CRITERION_STATUS_LABEL)[]).map((status) => ({
    status,
    label: CRITERION_STATUS_LABEL[status],
    tone: criterionStatusTone(status),
    meaning: CRITERION_STATUS_MEANING[status],
  }));
  return (
    <div className="rounded-xl border border-evergreen-900/15 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Criterion status key</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.status} className="flex items-start gap-2 text-[11px] leading-snug text-ink-soft">
            <span className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[row.tone]}`}>
              {row.label}
            </span>
            {!compact && <span>{row.meaning.replace(/^(Green|Amber|Grey|Red): /, "")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MypAnalyticsCards({ analytics }: { analytics: MypAnalytics }) {
  const maxCount = Math.max(1, ...analytics.gradeDistribution.map((bucket) => bucket.count));
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Results in scope"
          value={analytics.results}
          hint={`${analytics.published} released · ${analytics.unpublished} not released`}
        />
        <StatCard
          label="Average percentage"
          value={analytics.averagePercent === null ? "—" : `${analytics.averagePercent}%`}
          hint={
            analytics.highestPercent === null
              ? "No marked results yet"
              : `Highest ${analytics.highestPercent}% · lowest ${analytics.lowestPercent}%`
          }
        />
        <StatCard
          label="Average MYP grade"
          value={analytics.averageOverallGrade === null ? "—" : `${analytics.averageOverallGrade} / 7`}
          hint={`${analytics.complete} final · ${analytics.provisionalGrades} provisional · ${analytics.incomplete} incomplete`}
        />
        <StatCard
          label="Completion"
          value={`${analytics.completionRate}%`}
          hint={`${analytics.pendingMarking} result${analytics.pendingMarking === 1 ? "" : "s"} still being marked`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-evergreen-900/15 bg-paper p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Overall MYP grade distribution</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Grades 1–7 from the criterion-level totals. Incomplete results are not counted as a grade.
          </p>
          <div className="mt-4 flex items-end gap-2" role="img" aria-label="Overall MYP grade distribution">
            {analytics.gradeDistribution.map((bucket) => (
              <div key={bucket.grade} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] font-semibold tabular-nums text-ink-soft">{bucket.count}</span>
                <div
                  className={`w-full rounded-t ${bucket.count ? "bg-evergreen-700" : "bg-stone-200"}`}
                  style={{ height: `${Math.max(4, (bucket.count / maxCount) * 96)}px` }}
                />
                <span className="text-[11px] font-semibold text-evergreen-900">{bucket.grade}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-evergreen-900/15 bg-paper p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Criterion performance</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Averages include only criteria that are fully marked. Unmarked criteria are never averaged as zero.
          </p>
          <div className="mt-3 space-y-2">
            {analytics.criteria.length === 0 ? (
              <p className="text-sm text-ink-soft">No criterion-marked results in this scope.</p>
            ) : (
              analytics.criteria.map((criterion) => (
                <div key={criterion.code} className="rounded-lg border border-evergreen-900/10 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-evergreen-950">
                      Criterion {criterion.code}
                      {criterion.title ? ` — ${criterion.title}` : ""}
                    </span>
                    <span className="text-xs tabular-nums text-ink-soft">
                      {criterion.averagePercent === null
                        ? "No marks yet"
                        : `${criterion.averagePercent}% · avg level ${criterion.averageLevel ?? "—"} / 8`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-stone-200">
                    <div
                      className="h-full rounded bg-gold-500"
                      style={{ width: `${criterion.averagePercent === null ? 0 : Math.min(100, criterion.averagePercent)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-soft">
                    {criterion.assessed} assessed · {criterion.pending} pending · {criterion.notAssessed} not assessed
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** The authoritative results list linking to each detail page. */
export function MypResultsTable({
  results,
  detailBase,
  showOrganization,
  emptyMessage,
}: {
  results: MypResult[];
  detailBase: string;
  showOrganization: boolean;
  emptyMessage: string;
}) {
  if (!results.length) {
    return (
      <div className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center">
        <h3 className="font-display text-lg font-semibold text-evergreen-900">No results match these filters</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{emptyMessage}</p>
      </div>
    );
  }
  const head = [
    "Student",
    ...(showOrganization ? ["Organization"] : []),
    "MYP",
    "Class",
    "Subject",
    "Examination",
    "Marks",
    "%",
    "Criteria",
    "Overall grade",
    "Result status",
    "",
  ];
  return (
    <DataTable head={head} label="MYP examination results">
      {results.map((result) => (
        <tr key={result.attemptId}>
          <td>
            <a className="font-medium text-evergreen-900 underline-offset-2 hover:underline" href={`${detailBase}/${result.attemptId}`}>
              {result.studentName}
            </a>
            <span className="block text-[11px] text-ink-soft">
              {result.studentRef ? `${result.studentRef} · ` : ""}
              {result.attemptStatus.replace(/_/g, " ")}
            </span>
          </td>
          {showOrganization && <td className="text-xs text-ink-soft">{result.organizationName}</td>}
          <td className="text-xs">{result.mypYearLabel ?? <span className="text-ink-soft">—</span>}</td>
          <td className="max-w-[130px] truncate text-xs" title={result.className ?? ""}>
            {result.className ?? <span className="text-ink-soft">—</span>}
          </td>
          <td className="max-w-[150px] truncate text-xs" title={result.subjectLabel}>
            {result.subjectLabel}
          </td>
          <td className="max-w-[220px] text-xs">
            <span className="block truncate" title={result.examTitle}>{result.examTitle}</span>
            <span className="block text-[11px] text-ink-soft">
              {result.examDate ? new Date(result.examDate).toISOString().slice(0, 10) : "—"}
            </span>
          </td>
          <td className="whitespace-nowrap text-xs tabular-nums">
            {result.marksAwarded} / {result.marksMax}
          </td>
          <td className="text-xs tabular-nums">{result.percent === null ? "—" : `${result.percent}%`}</td>
          <td className="text-xs">
            {result.hasCriteria ? (
              <span className="inline-flex flex-wrap gap-1">
                {result.criteria
                  .filter((criterion) => criterion.questionCount > 0)
                  .map((criterion) => (
                    <span
                      key={criterion.code}
                      title={`${criterion.heading}: ${criterion.questionCount === 0 ? "not assessed" : `${criterion.marksAwarded}/${criterion.marksMax}`} · ${criterion.statusLabel}. ${CRITERION_STATUS_MEANING[criterion.status]}`}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[criterionStatusTone(criterion.status)]}`}
                    >
                      {criterion.code}
                      {criterion.level === null ? "…" : ` ${criterion.level}`}
                    </span>
                  ))}
              </span>
            ) : (
              <span className="text-ink-soft">Not criterion-mapped</span>
            )}
          </td>
          <td>
            {result.overallGrade === null ? (
              <Badge tone={resultTone(result)}>{result.gradeStatusLabel}</Badge>
            ) : (
              <Badge tone={resultTone(result)}>
                {result.overallGrade} / 7{result.gradeStatus === "provisional" ? " provisional" : ""}
              </Badge>
            )}
          </td>
          <td>
            <Badge tone={result.published ? "green" : "gray"}>{result.published ? "Released" : "Not released"}</Badge>
            {result.pendingCriteria.length > 0 && (
              <span className="mt-1 block text-[10px] font-medium text-amber-800">
                Pending: {result.pendingCriteria.join(", ")}
              </span>
            )}
            {result.errorCriteria.length > 0 && (
              <span className="mt-1 block text-[10px] font-semibold text-red-700">
                Marking data error: {result.errorCriteria.join(", ")}
              </span>
            )}
          </td>
          <td className="whitespace-nowrap text-right">
            <MypExportButton format="pdf" scope="individual" attemptId={result.attemptId} label="PDF" compact />
            <span className="mx-1 text-ink-soft">·</span>
            <MypExportButton format="xlsx" scope="individual" attemptId={result.attemptId} label="Excel" compact />
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
