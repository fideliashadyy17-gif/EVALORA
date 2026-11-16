import { buildXlsx, type XlsxColumn, type XlsxSheet } from "./xlsx";
import {
  CRITERION_STATUS_LABEL,
  CRITERION_STATUS_MEANING,
  GRADE_STATUS_LABEL,
  type MypAnalytics,
  type MypResult,
} from "./myp";

/**
 * MYP results workbook, built for a teacher rather than a database browser.
 *
 * Every sheet comes from the same `MypResult[]` the screens and the PDF use, so
 * the workbook can never disagree with the interface. Criterion columns are
 * generated from the subject's configured criteria, not hard-coded A–D, so a
 * subject with different letters still reads correctly.
 *
 *   1. Student Performance       one row per student: each criterion's mark,
 *                                its maximum and its achievement level, plus
 *                                totals, percentage and the overall 1–7 grade
 *   2. Detailed Criterion Results one row per student per criterion, with the
 *                                status, feedback and improvement notes
 *   3. Class Analytics           class/exam averages, per-criterion averages,
 *                                grade distribution, completion and marking
 *   4. Grading Information       the rules and boundaries actually applied,
 *                                plus the status key
 *
 * Numbers are real numeric cells, percentages use a percentage format and the
 * header row is frozen and filtered, so a teacher can sort a class immediately.
 */

const attemptStatusLabel = (status: string) => status.replace(/_/g, " ");

function dateCell(value: string | null): Date | string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date;
}

function unionCodes(results: MypResult[]): string[] {
  const ordered: string[] = [];
  for (const result of results) {
    for (const criterion of result.criteria) {
      if (!ordered.includes(criterion.code)) ordered.push(criterion.code);
    }
  }
  return ordered.sort((a, b) => a.localeCompare(b));
}

const GOOD = (value: number | null) => (value === null ? "" : value);

function studentPerformanceSheet(results: MypResult[]): XlsxSheet {
  const codes = unionCodes(results);
  const columns: XlsxColumn[] = [
    { header: "Student Name", width: 26, style: "text" },
    { header: "Student Reference", width: 16, style: "text" },
    { header: "Organization", width: 26, style: "text" },
    { header: "MYP Year", width: 10, style: "center" },
    { header: "Class", width: 20, style: "text" },
    { header: "Subject", width: 24, style: "text" },
    { header: "Examination", width: 38, style: "text" },
    { header: "Examination Date", width: 14, style: "date" },
    { header: "Attempt Status", width: 14, style: "text" },
    ...codes.flatMap<XlsxColumn>((code) => [
      { header: `Criterion ${code} Marks`, width: 11, style: "number" },
      { header: `Criterion ${code} Maximum`, width: 11, style: "number" },
      { header: `Criterion ${code} Level`, width: 10, style: "integer" },
    ]),
    { header: "Marks Obtained", width: 11, style: "number" },
    { header: "Maximum Marks", width: 11, style: "number" },
    { header: "Percentage", width: 11, style: "percent" },
    { header: "Total Criterion Levels", width: 12, style: "integer" },
    { header: "Overall MYP Grade (1-7)", width: 14, style: "integer" },
    { header: "Grade Status", width: 14, style: "text" },
    { header: "Pending Criteria", width: 15, style: "text" },
    { header: "Not Assessed Criteria", width: 15, style: "text" },
    { header: "Unanswered Scored Zero", width: 13, style: "integer" },
    { header: "Publication Status", width: 16, style: "text" },
  ];

  const rows = results.map((result) => {
    const byCode = new Map(result.criteria.map((criterion) => [criterion.code, criterion]));
    const criterionCells: (string | number)[] = [];
    for (const code of codes) {
      const criterion = byCode.get(code);
      if (!criterion || criterion.questionCount === 0) {
        criterionCells.push("", "", "");
        continue;
      }
      criterionCells.push(criterion.marksAwarded, criterion.marksMax, GOOD(criterion.level));
    }
    return [
      result.studentName,
      result.studentRef ?? "",
      result.organizationName,
      result.mypYearLabel ?? "",
      result.className ?? "",
      result.subjectLabel,
      result.examTitle,
      dateCell(result.examDate),
      attemptStatusLabel(result.attemptStatus),
      ...criterionCells,
      result.marksAwarded,
      result.marksMax,
      result.percent,
      result.totalLevels,
      result.overallGrade,
      result.gradeStatusLabel,
      result.pendingCriteria.join(", "),
      result.unassessedCriteria.join(", "),
      result.zeroFilledQuestions,
      result.published ? "Released" : "Not released",
    ];
  });

  return {
    name: "Student Performance",
    title: "EVALORA MYP results — student performance",
    subtitle:
      "One row per student. Each criterion shows the marks obtained, the maximum available and the achievement level (0–8). A blank level means the criterion is still being marked or was not assessed — it is never a zero.",
    columns,
    rows,
  };
}

function criterionDetailSheet(results: MypResult[]): XlsxSheet {
  const columns: XlsxColumn[] = [
    { header: "Student Name", width: 26, style: "text" },
    { header: "Class", width: 20, style: "text" },
    { header: "Subject", width: 24, style: "text" },
    { header: "Examination", width: 36, style: "text" },
    { header: "Criterion Identifier", width: 11, style: "center" },
    { header: "Criterion Name", width: 40, style: "text" },
    { header: "Marks Obtained", width: 11, style: "number" },
    { header: "Maximum Marks", width: 11, style: "number" },
    { header: "Percentage", width: 11, style: "percent" },
    { header: "Achievement Level (0-8)", width: 12, style: "integer" },
    { header: "Assessment Status", width: 17, style: "text" },
    { header: "Questions Resolved", width: 11, style: "integer" },
    { header: "Questions Total", width: 10, style: "integer" },
    { header: "Unanswered Scored Zero", width: 12, style: "integer" },
    { header: "Teacher Feedback", width: 44, style: "text" },
    { header: "Demonstrated Strengths", width: 44, style: "text" },
    { header: "Areas for Improvement", width: 44, style: "text" },
  ];

  const rows: (string | number | Date | null)[][] = [];
  for (const result of results) {
    if (!result.criteria.length) {
      rows.push([
        result.studentName,
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
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const criterion of result.criteria) {
      const assessed = criterion.questionCount > 0;
      rows.push([
        result.studentName,
        result.className ?? "",
        result.subjectLabel,
        result.examTitle,
        criterion.code,
        criterion.title || `Criterion ${criterion.code} (no title configured for this subject)`,
        // A criterion that was not assessed has no mark; it is left blank, never 0.
        assessed ? criterion.marksAwarded : "",
        assessed ? criterion.marksMax : "",
        criterion.percent,
        assessed ? criterion.level : "",
        criterion.statusLabel,
        assessed ? criterion.markedCount + criterion.zeroFilledCount : "",
        assessed ? criterion.questionCount : "",
        assessed ? criterion.zeroFilledCount : "",
        criterion.feedback ?? "",
        criterion.strengths.join(" · "),
        criterion.improvements.join(" · "),
      ]);
    }
  }

  return {
    name: "Detailed Criterion Results",
    title: "EVALORA MYP results — detailed criterion results",
    subtitle:
      "One row per student per criterion. A blank mark or level means the criterion was not assessed or is still being marked — it is never a zero. Level 0 appears only where a fully marked criterion earned nothing.",
    columns,
    rows,
  };
}

function classAnalyticsSheet(results: MypResult[]): XlsxSheet {
  const multipleOrganizations = new Set(results.map((result) => result.organizationId)).size > 1;
  const groups = new Map<string, MypResult[]>();
  for (const result of results) {
    const key = [
      ...(multipleOrganizations ? [result.organizationName] : []),
      result.className ?? "No class",
      result.subjectLabel,
      result.examTitle,
    ].join(" · ");
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  const codes = unionCodes(results);
  const columns: XlsxColumn[] = [
    { header: "Class / Subject / Examination", width: 44, style: "text" },
    { header: "Students", width: 9, style: "integer" },
    { header: "Average Marks", width: 11, style: "number" },
    { header: "Average Maximum", width: 11, style: "number" },
    { header: "Average Percentage", width: 11, style: "percent" },
    { header: "Highest Percentage", width: 11, style: "percent" },
    { header: "Lowest Percentage", width: 11, style: "percent" },
    ...codes.flatMap<XlsxColumn>((code) => [
      { header: `Criterion ${code} Average %`, width: 12, style: "percent" },
      { header: `Criterion ${code} Average Level`, width: 12, style: "number" },
    ]),
    ...[1, 2, 3, 4, 5, 6, 7].map<XlsxColumn>((grade) => ({
      header: `Grade ${grade}`,
      width: 8,
      style: "integer",
    })),
    { header: "Completion %", width: 11, style: "percent" },
    { header: "Pending Marking", width: 11, style: "integer" },
    { header: "Released", width: 9, style: "integer" },
    { header: "Unanswered Scored Zero", width: 12, style: "integer" },
  ];

  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const groupRow = (label: string, rows: MypResult[]) => {
    const percents = rows.map((row) => row.percent).filter((value): value is number => value !== null);
    const marks = rows.map((row) => row.marksAwarded);
    const maximums = rows.map((row) => row.marksMax);
    const grades = rows.map((row) => row.overallGrade).filter((value): value is number => value !== null);
    const criterionAverages = codes.map((code) => {
      const values = rows
        .flatMap((row) => row.criteria)
        .filter((criterion) => criterion.code === code && criterion.status === "assessed")
        .map((criterion) => criterion.percent)
        .filter((value): value is number => value !== null);
      return average(values);
    });
    const criterionLevels = codes.map((code) => {
      const values = rows
        .flatMap((row) => row.criteria)
        .filter((criterion) => criterion.code === code && criterion.level !== null)
        .map((criterion) => Number(criterion.level));
      return average(values);
    });
    return [
      label,
      rows.length,
      average(marks) === null ? "" : Math.round((average(marks) ?? 0) * 100) / 100,
      average(maximums) === null ? "" : Math.round((average(maximums) ?? 0) * 100) / 100,
      average(percents),
      percents.length ? Math.max(...percents) : "",
      percents.length ? Math.min(...percents) : "",
      ...criterionAverages.map((value) => (value === null ? "" : Math.round(value * 10) / 10)),
      ...criterionLevels.map((value) => (value === null ? "" : Math.round(value * 100) / 100)),
      ...[1, 2, 3, 4, 5, 6, 7].map((grade) => grades.filter((value) => value === grade).length),
      rows.length ? Math.round((rows.filter((row) => row.gradeStatus === "final").length / rows.length) * 1000) / 10 : "",
      rows.filter((row) => row.pendingCriteria.length > 0 || row.errorCriteria.length > 0).length,
      rows.filter((row) => row.published).length,
      rows.reduce((sum, row) => sum + row.zeroFilledQuestions, 0),
    ];
  };

  const rows = [...groups.entries()].map(([label, group]) => groupRow(label, group));
  rows.push(groupRow("ALL RESULTS IN SCOPE", results));

  return {
    name: "Class Analytics",
    title: "EVALORA MYP results — class analytics",
    subtitle:
      "Averages use marked results only; unmarked criteria are excluded and never averaged as zero. The final row aggregates every result in the exported scope.",
    columns,
    rows,
    // The last row is a total, so the filter covers the data rows only.
    autofilter: true,
  };
}

function gradingInformationSheet(results: MypResult[], analytics: MypAnalytics): XlsxSheet {
  const columns: XlsxColumn[] = [
    { header: "Subject", width: 26, style: "text" },
    { header: "Framework", width: 12, style: "text" },
    { header: "Configured Criteria", width: 48, style: "text" },
    { header: "Criteria Required for an Overall Grade", width: 20, style: "text" },
    { header: "Aggregation Rule", width: 48, style: "text" },
    { header: "Criterion Level Source", width: 46, style: "text" },
    { header: "Percentage to Level Boundaries", width: 56, style: "text" },
    { header: "Overall Grade Boundaries (Total Levels → Grade)", width: 52, style: "text" },
    { header: "Grade Boundary Source", width: 46, style: "text" },
    { header: "Notes", width: 46, style: "text" },
  ];

  const bySubject = new Map<string, MypResult>();
  for (const result of results) {
    const key = result.subjectId ?? `${result.organizationId}:${result.subjectLabel}`;
    if (!bySubject.has(key)) bySubject.set(key, result);
  }

  const rows: (string | number)[][] = [...bySubject.values()].map((result) => {
    const rules = result.rules;
    const criteriaText = rules.criteria.length
      ? rules.criteria.map((criterion) => `${criterion.code} — ${criterion.title || "no title configured"}`).join("; ")
      : "No criteria configured for this subject — criterion letters are reported from the paper";
    const levelText = rules.levelBoundaries
      .map((boundary) => `${boundary.minPercent}%+ → ${boundary.level}`)
      .sort()
      .join("; ");
    const gradeText = rules.gradeBoundaries
      .map((boundary) => `${boundary.minTotal}-${boundary.maxTotal} → ${boundary.grade}`)
      .join("; ");
    return [
      result.subjectLabel,
      "IB MYP",
      criteriaText,
      rules.requireAllCriteria ? "All criteria" : "Marked criteria only (provisional grade allowed)",
      rules.requireAllCriteria
        ? "Sum every criterion achievement level (0-8), then map the total through the 1-7 boundaries."
        : "Sum the achievement levels of the criteria that are fully marked, then map through the boundaries; the grade is provisional while criteria are outstanding.",
      rules.levelSource,
      levelText,
      gradeText,
      rules.gradeSource,
      result.zeroFilledQuestions > 0
        ? "Unanswered questions on a submitted attempt score zero and remain part of the assessment."
        : "Any question left unanswered when an attempt ends is scored zero, not left blank.",
    ];
  });

  if (!rows.length) {
    rows.push(["No results in scope", "", "", "", "", "", "", "", "", ""]);
  }

  rows.push([
    "Grade distribution in this scope",
    "",
    analytics.gradeDistribution.map((bucket) => `Grade ${bucket.grade}: ${bucket.count}`).join("; "),
    "",
    `Provisional grades: ${analytics.provisionalGrades}`,
    "",
    "",
    "",
    `Incomplete results: ${analytics.incomplete}`,
    "Level 0 is a marked criterion with no marks earned; it is never used for missing work.",
  ]);

  rows.push([
    "Criterion status key",
    "",
    "Assessed",
    "",
    CRITERION_STATUS_MEANING.assessed,
    "",
    "Partially marked / pending marking",
    "",
    CRITERION_STATUS_MEANING.pending_marking,
    CRITERION_STATUS_MEANING.partially_marked,
  ]);
  rows.push([
    "Criterion status key",
    "",
    "Not assessed",
    "",
    CRITERION_STATUS_MEANING.not_assessed,
    "",
    "Marking data error",
    "",
    CRITERION_STATUS_MEANING.error,
    "Colour is never the only signal: every sheet spells the status out.",
  ]);

  return {
    name: "Grading Information",
    title: "EVALORA MYP results — grading information actually applied",
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
    studentPerformanceSheet(results),
    criterionDetailSheet(results),
    classAnalyticsSheet(results),
    gradingInformationSheet(results, analytics),
  ];
  for (const sheet of sheets) {
    sheet.subtitle = `${options.fileTitle} · ${options.scope} · ${sheet.subtitle}`;
  }
  return buildXlsx(sheets);
}

export { CRITERION_STATUS_LABEL, GRADE_STATUS_LABEL };
