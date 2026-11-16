import { buildXlsx, type XlsxColumn, type XlsxSheet } from "./xlsx";
import {
  CRITERION_STATUS_LABEL,
  GRADE_STATUS_LABEL,
  type MypAnalytics,
  type MypResult,
} from "./myp";

/**
 * MYP results workbook.
 *
 * Four worksheets, built from the same `MypResult[]` the screens and the PDF
 * use:
 *   1. Student Results        - one row per attempt
 *   2. Criterion Breakdown    - one row per criterion per attempt
 *   3. Class Statistics       - per class/examination, with criterion averages
 *                               and the 1–7 grade distribution
 *   4. Grading Configuration  - the boundaries and aggregation rules actually
 *                               applied, with their sources
 *
 * Every number is a real numeric cell (percentages use a 0.0"%" format, dates
 * are date serials), so a school can sort, filter and pivot immediately.
 */

const attemptStatusLabel = (status: string) => status.replace(/_/g, " ");

function dateCell(value: string | null): Date | string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date;
}

function studentSheet(results: MypResult[]): XlsxSheet {
  const columns: XlsxColumn[] = [
    { header: "Student", width: 26, style: "text" },
    { header: "Student reference", width: 16, style: "text" },
    { header: "Organization", width: 28, style: "text" },
    { header: "MYP year", width: 10, style: "center" },
    { header: "Class", width: 22, style: "text" },
    { header: "Subject", width: 24, style: "text" },
    { header: "Examination", width: 40, style: "text" },
    { header: "Examination date", width: 14, style: "date" },
    { header: "Attempt status", width: 15, style: "text" },
    { header: "Marks obtained", width: 12, style: "number" },
    { header: "Maximum marks", width: 12, style: "number" },
    { header: "Percentage", width: 11, style: "percent" },
    { header: "Total criterion levels", width: 12, style: "integer" },
    { header: "Overall MYP grade (1-7)", width: 14, style: "integer" },
    { header: "Grade status", width: 14, style: "text" },
    { header: "Pending criteria", width: 16, style: "text" },
    { header: "Not assessed criteria", width: 16, style: "text" },
    { header: "Publication status", width: 16, style: "text" },
  ];
  return {
    name: "Student Results",
    title: "EVALORA MYP results — student results",
    subtitle: `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${results.length} result${results.length === 1 ? "" : "s"} · criterion levels derived from paper marks, overall grades from configured boundaries`,
    columns,
    rows: results.map((result) => [
      result.studentName,
      result.studentRef ?? "",
      result.organizationName,
      result.mypYearLabel ?? "",
      result.className ?? "",
      result.subjectLabel,
      result.examTitle,
      dateCell(result.examDate),
      attemptStatusLabel(result.attemptStatus),
      result.marksAwarded,
      result.marksMax,
      result.percent,
      result.totalLevels,
      result.overallGrade,
      result.gradeStatusLabel,
      result.pendingCriteria.join(", "),
      result.unassessedCriteria.join(", "),
      result.published ? "Released" : "Not released",
    ]),
  };
}

function criterionSheet(results: MypResult[]): XlsxSheet {
  const columns: XlsxColumn[] = [
    { header: "Student", width: 26, style: "text" },
    { header: "MYP year", width: 10, style: "center" },
    { header: "Class", width: 22, style: "text" },
    { header: "Subject", width: 22, style: "text" },
    { header: "Examination", width: 36, style: "text" },
    { header: "Criterion", width: 9, style: "center" },
    { header: "Criterion description", width: 44, style: "text" },
    { header: "Marks obtained", width: 12, style: "number" },
    { header: "Maximum marks", width: 12, style: "number" },
    { header: "Percentage", width: 11, style: "percent" },
    { header: "Achievement level (0-8)", width: 12, style: "integer" },
    { header: "Assessment status", width: 16, style: "text" },
    { header: "Teacher feedback", width: 46, style: "text" },
    { header: "Demonstrated strengths", width: 46, style: "text" },
    { header: "Areas for improvement", width: 46, style: "text" },
  ];
  const rows: (string | number | Date | null)[][] = [];
  for (const result of results) {
    if (!result.criteria.length) {
      rows.push([
        result.studentName,
        result.mypYearLabel ?? "",
        result.className ?? "",
        result.subjectLabel,
        result.examTitle,
        "",
        "Paper is not criterion-mapped",
        "",
        "",
        "",
        "",
        "Not applicable",
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const criterion of result.criteria) {
      rows.push([
        result.studentName,
        result.mypYearLabel ?? "",
        result.className ?? "",
        result.subjectLabel,
        result.examTitle,
        criterion.code,
        criterion.title || `Criterion ${criterion.code} (no title configured for this subject)`,
        // A criterion that was not assessed has no mark; it is left blank, never 0.
        criterion.status === "not_assessed" ? "" : criterion.marksAwarded,
        criterion.status === "not_assessed" ? "" : criterion.marksMax,
        criterion.percent,
        criterion.level,
        criterion.statusLabel,
        criterion.feedback ?? "",
        criterion.strengths.join(" · "),
        criterion.improvements.join(" · "),
      ]);
    }
  }
  return {
    name: "Criterion Breakdown",
    title: "EVALORA MYP results — criterion breakdown",
    subtitle:
      "A blank mark or level means the criterion was not assessed or is still being marked — it is never a zero. Level 0 appears only where a fully marked criterion earned nothing.",
    columns,
    rows,
  };
}

function classStatisticsSheet(results: MypResult[], analytics: MypAnalytics): XlsxSheet {
  const groups = new Map<string, MypResult[]>();
  for (const result of results) {
    const key = [result.className ?? "No class", result.subjectLabel, result.examTitle].join(" · ");
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  const criterionCodes = analytics.criteria.map((criterion) => criterion.code);
  const columns: XlsxColumn[] = [
    { header: "Class / subject / examination", width: 46, style: "text" },
    { header: "Students", width: 9, style: "integer" },
    { header: "Average marks", width: 11, style: "number" },
    { header: "Average %", width: 10, style: "percent" },
    { header: "Highest %", width: 10, style: "percent" },
    { header: "Lowest %", width: 10, style: "percent" },
    ...criterionCodes.map<XlsxColumn>((code) => ({
      header: `Criterion ${code} avg %`,
      width: 13,
      style: "percent",
    })),
    ...criterionCodes.map<XlsxColumn>((code) => ({
      header: `Criterion ${code} avg level`,
      width: 14,
      style: "number",
    })),
    ...[1, 2, 3, 4, 5, 6, 7].map<XlsxColumn>((grade) => ({
      header: `Grade ${grade}`,
      width: 8,
      style: "integer",
    })),
    { header: "Completion %", width: 11, style: "percent" },
    { header: "Pending marking", width: 12, style: "integer" },
    { header: "Released", width: 9, style: "integer" },
  ];

  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const rows = [...groups.entries()].map(([label, rows]) => {
    const percents = rows.map((row) => row.percent).filter((value): value is number => value !== null);
    const marks = rows.map((row) => row.marksAwarded);
    const grades = rows.map((row) => row.overallGrade).filter((value): value is number => value !== null);
    const criterionAverages = criterionCodes.map((code) => {
      const values = rows
        .flatMap((row) => row.criteria)
        .filter((criterion) => criterion.code === code && criterion.status === "assessed")
        .map((criterion) => criterion.percent)
        .filter((value): value is number => value !== null);
      return average(values);
    });
    const criterionLevels = criterionCodes.map((code) => {
      const values = rows
        .flatMap((row) => row.criteria)
        .filter((criterion) => criterion.code === code && criterion.level !== null)
        .map((criterion) => Number(criterion.level));
      return average(values);
    });
    return [
      label,
      rows.length,
      average(marks) ?? "",
      average(percents),
      percents.length ? Math.max(...percents) : "",
      percents.length ? Math.min(...percents) : "",
      ...criterionAverages.map((value) => (value === null ? "" : Math.round(value * 10) / 10)),
      ...criterionLevels.map((value) => (value === null ? "" : Math.round(value * 100) / 100)),
      ...[1, 2, 3, 4, 5, 6, 7].map((grade) => grades.filter((value) => value === grade).length),
      rows.length ? Math.round((rows.filter((row) => row.gradeStatus === "final").length / rows.length) * 1000) / 10 : "",
      rows.filter((row) => row.pendingCriteria.length > 0).length,
      rows.filter((row) => row.published).length,
    ];
  });

  rows.push([
    "ALL RESULTS IN SCOPE",
    analytics.results,
    results.length ? Math.round((results.reduce((sum, row) => sum + row.marksAwarded, 0) / Math.max(1, results.length)) * 100) / 100 : "",
    analytics.averagePercent ?? "",
    analytics.highestPercent ?? "",
    analytics.lowestPercent ?? "",
    ...criterionCodes.map((code) => {
      const row = analytics.criteria.find((criterion) => criterion.code === code);
      return row?.averagePercent ?? "";
    }),
    ...criterionCodes.map((code) => {
      const row = analytics.criteria.find((criterion) => criterion.code === code);
      return row?.averageLevel ?? "";
    }),
    ...analytics.gradeDistribution.map((bucket) => bucket.count),
    ((analytics.complete / Math.max(1, analytics.results)) * 100),
    analytics.pendingMarking,
    analytics.published,
  ]);

  return {
    name: "Class Statistics",
    title: "EVALORA MYP results — class statistics",
    subtitle: "Average, highest and lowest are computed only from marked results; unmarked criteria are excluded from averages and never counted as zero.",
    columns,
    rows,
  };
}

function configurationSheet(results: MypResult[], analytics: MypAnalytics): XlsxSheet {
  const columns: XlsxColumn[] = [
    { header: "Subject", width: 26, style: "text" },
    { header: "Framework", width: 12, style: "text" },
    { header: "Configured criteria", width: 52, style: "text" },
    { header: "Criteria required for an overall grade", width: 18, style: "text" },
    { header: "Aggregation rule", width: 54, style: "text" },
    { header: "Criterion level source", width: 58, style: "text" },
    { header: "Overall grade boundaries (total levels → grade)", width: 62, style: "text" },
    { header: "Grade boundary source", width: 58, style: "text" },
  ];

  const bySubject = new Map<string, MypResult>();
  for (const result of results) {
    const key = result.subjectId ?? `${result.organizationId}:${result.subjectLabel}`;
    if (!bySubject.has(key)) bySubject.set(key, result);
  }

  const rows = [...bySubject.values()].map((result) => {
    const rules = result.rules;
    const criteriaText = rules.criteria.length
      ? rules.criteria.map((criterion) => `${criterion.code} — ${criterion.title || "no title configured"}`).join("; ")
      : "No criteria configured for this subject — criterion letters are reported from the paper";
    const boundariesText = rules.gradeBoundaries
      .map((boundary) => `${boundary.minTotal}-${boundary.maxTotal}: ${boundary.grade}`)
      .join("; ");
    return [
      result.subjectLabel,
      "IB MYP",
      criteriaText,
      rules.requireAllCriteria ? "All criteria" : "Marked criteria only (provisional grade allowed)",
      rules.requireAllCriteria
        ? "Sum every criterion achievement level (0-8), then map the total through the 1-7 boundaries below."
        : "Sum the achievement levels of the criteria that are fully marked, then map through the boundaries; the grade is provisional while criteria are outstanding.",
      rules.levelSource,
      boundariesText,
      rules.gradeSource,
    ];
  });

  if (!rows.length) {
    rows.push(["No results in scope", "", "", "", "", "", "", ""]);
  }

  rows.push([
    "Grade distribution in this scope",
    "",
    analytics.gradeDistribution.map((bucket) => `Grade ${bucket.grade}: ${bucket.count}`).join("; "),
    "",
    "Provisional grades: " + analytics.provisionalGrades,
    "",
    "Incomplete results: " + analytics.incomplete,
    "Level 0 is a marked criterion with no marks earned; it is never used for missing work.",
  ]);

  return {
    name: "Grading Configuration",
    title: "EVALORA MYP results — grading configuration actually applied",
    subtitle:
      "Boundaries are configuration, not an estimate. The IB publishes the overall 1-7 boundaries; the percentage-to-level conversion is a school policy that this organization can change in MYP grading settings.",
    columns,
    rows,
  };
}

export interface MypWorkbookOptions {
  fileTitle: string;
  scope: string;
}

/** Build the workbook buffer for a filtered result set. */
export function buildMypWorkbook(results: MypResult[], analytics: MypAnalytics, options: MypWorkbookOptions): Buffer {
  const sheets: XlsxSheet[] = [
    studentSheet(results),
    criterionSheet(results),
    classStatisticsSheet(results, analytics),
    configurationSheet(results, analytics),
  ];
  // The workbook title/scope is carried by each sheet's subtitle, which keeps
  // the sheet names short and stable for downstream formulas.
  for (const sheet of sheets) {
    sheet.subtitle = `${options.fileTitle} · ${options.scope} · ${sheet.subtitle}`;
  }
  return buildXlsx(sheets);
}

export { CRITERION_STATUS_LABEL, GRADE_STATUS_LABEL };
