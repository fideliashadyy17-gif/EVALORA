/**
 * The single MYP results loader (src/lib/mypResults.ts).
 *
 * A stub Supabase client serves fixture rows for two tenants so the checks can
 * prove the parts that matter at the boundary between the database and the UI:
 * tenant isolation, student-only reads excluding unreleased results, per-subject
 * configuration precedence, filter semantics and graceful degradation when the
 * configuration tables are not deployed yet.
 *
 * Run: node scripts/test-myp-results-loader.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const outDir = "/tmp/evalora-myp-loader-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`);

const built = new Set();
function build(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const emitted = ts.transpileModule(readFileSync(rel, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const deps = [...emitted.matchAll(/require\("(\.[^"]+)"\)/g)].map((match) => match[1]);
  const normalised = emitted.replace(/require\("(\.[^"]+?)(\.ts)?"\)/g, (_match, spec) => `require("${spec}.js")`);
  const dest = path.join(outDir, rel.replace(/^src\//, "").replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, normalised);
  for (const dep of deps) build(path.join(path.dirname(rel), `${dep.replace(/\.ts$/, "")}.ts`));
}
build("src/lib/mypResults.ts");

const require = createRequire(import.meta.url);
const L = require(`${outDir}/lib/mypResults.js`);

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Fixtures ────────────────────────────────────────────────────────── */
const ORG_OAK = "org-oak";
const ORG_PINE = "org-pine";

const organizations = [
  { id: ORG_OAK, name: "Oak International School", logo_url: "https://cdn.example/oak.png" },
  { id: ORG_PINE, name: "Pine Academy", logo_url: null },
];
const classes = [
  { id: "class-7", name: "Grade 7 — MYP 2", code: "G7-MYP2", grade_order: 7, organization_id: ORG_OAK },
  { id: "class-9", name: "Grade 9 — MYP 4", code: "G9-MYP4", grade_order: 9, organization_id: ORG_OAK },
  { id: "class-6", name: "Grade 6 — MYP 1", code: "G6-MYP1", grade_order: 6, organization_id: ORG_PINE },
];
const subjects = [
  { id: "subject-math", name: "Mathematics", code: "MATH", organization_id: ORG_OAK },
  { id: "subject-science", name: "Integrated Science", code: "SCI", organization_id: ORG_OAK },
  { id: "subject-math-pine", name: "Mathematics", code: "MATH", organization_id: ORG_PINE },
];
const mathCriteria = [
  ["A", "Knowing and understanding"],
  ["B", "Investigating patterns"],
  ["C", "Communicating"],
  ["D", "Applying mathematics in real-life contexts"],
].map(([code, title], index) => ({
  id: `crit-math-${code}`,
  organization_id: ORG_OAK,
  subject_id: "subject-math",
  code,
  title,
  description: null,
  position: index,
  max_level: 8,
}));
const scienceCriteria = [
  ["B", "Inquiring and designing"],
  ["C", "Processing and evaluating"],
  ["D", "Reflecting on the impacts of science"],
].map(([code, title], index) => ({
  id: `crit-sci-${code}`,
  organization_id: ORG_OAK,
  subject_id: "subject-science",
  code,
  title,
  description: null,
  position: index,
  max_level: 8,
}));
const levelBoundaries = [
  [0, 0], [1, 15], [2, 30], [3, 45], [4, 55], [5, 65], [6, 75], [7, 85], [8, 95],
].map(([level, minPercent]) => ({
  organization_id: ORG_OAK,
  subject_id: "subject-math",
  level,
  min_percent: minPercent,
  source: "Oak Mathematics level descriptors",
}));
const gradeBoundaries = [
  { organization_id: ORG_OAK, subject_id: null, min_total: 0, max_total: 4, grade: 1, source: "Oak MYP grade boundaries 2026" },
  { organization_id: ORG_OAK, subject_id: null, min_total: 5, max_total: 9, grade: 2, source: "Oak MYP grade boundaries 2026" },
  { organization_id: ORG_OAK, subject_id: null, min_total: 10, max_total: 14, grade: 3, source: "Oak MYP grade boundaries 2026" },
  { organization_id: ORG_OAK, subject_id: null, min_total: 15, max_total: 18, grade: 4, source: "Oak MYP grade boundaries 2026" },
  { organization_id: ORG_OAK, subject_id: null, min_total: 19, max_total: 22, grade: 5, source: "Oak MYP grade boundaries 2026" },
  { organization_id: ORG_OAK, subject_id: null, min_total: 23, max_total: 26, grade: 6, source: "Oak MYP grade boundaries 2026" },
  { organization_id: ORG_OAK, subject_id: null, min_total: 27, max_total: 32, grade: 7, source: "Oak MYP grade boundaries 2026" },
  { organization_id: ORG_OAK, subject_id: "subject-math", min_total: 0, max_total: 20, grade: 1, source: "Oak Mathematics grade boundaries" },
  { organization_id: ORG_OAK, subject_id: "subject-math", min_total: 21, max_total: 23, grade: 3, source: "Oak Mathematics grade boundaries" },
  { organization_id: ORG_OAK, subject_id: "subject-math", min_total: 24, max_total: 26, grade: 4, source: "Oak Mathematics grade boundaries" },
  { organization_id: ORG_OAK, subject_id: "subject-math", min_total: 27, max_total: 32, grade: 6, source: "Oak Mathematics grade boundaries" },
];
const frameworkConfig = [
  { organization_id: ORG_OAK, criteria_max_level: 8, require_all_criteria: true, framework: "ib_myp", note: "Oak" },
  { organization_id: ORG_PINE, criteria_max_level: 8, require_all_criteria: false, framework: "ib_myp", note: "Pine allows provisional grades" },
];

const exam = (id, organizationId, classId, quizId, title, startsAt, published, settings = {}) => ({
  id,
  title,
  organization_id: organizationId,
  class_id: classId,
  quiz_id: quizId,
  starts_at: startsAt,
  ends_at: null,
  created_at: startsAt,
  status: "published",
  settings: { results_published: published, ...settings },
  grades_published_at: null,
  organizations: organizations.find((organization) => organization.id === organizationId),
  classes: classes.find((classRow) => classRow.id === classId),
});
const exams = [
  exam("exam-1", ORG_OAK, "class-7", "quiz-1", "MYP 2 Mathematics — Term 1", "2026-10-01T08:00:00Z", true, {
    reporting_period: "2026 Term 1",
    myp_level: "MYP 2",
  }),
  exam("exam-2", ORG_OAK, "class-7", "quiz-2", "MYP 2 Mathematics — Term 1 Re-sit", "2026-10-05T08:00:00Z", false, {
    myp_level: "MYP 2",
  }),
  exam("exam-3", ORG_PINE, "class-6", "quiz-3", "MYP 1 Mathematics", "2026-09-20T08:00:00Z", true),
  exam("exam-4", ORG_OAK, "class-9", "quiz-4", "MYP 4 Science Investigation", "2026-10-11T08:00:00Z", true, {
    myp_level: "MYP 4",
  }),
  exam("exam-5", ORG_OAK, "class-7", "quiz-5", "MYP 2 Non-criterion Quiz", "2026-10-12T08:00:00Z", true),
];

const question = (id, subjectId, criterion, points = 10, index = 0) => ({
  id,
  points,
  type: "short_answer",
  topic: `Topic ${index + 1}`,
  subject_id: subjectId,
  prompt: `Question ${id}`,
  config: criterion ? { myp_criterion: criterion } : {},
});
const questions = [
  question("q1", "subject-math", "A"),
  question("q2", "subject-math", "B"),
  question("q3", "subject-math", "C"),
  question("q4", "subject-math", "D"),
  question("q5", "subject-math", "A"),
  question("q6", "subject-math", "B"),
  question("q7", "subject-math", "C"),
  question("q8", "subject-math", "D"),
  question("p1", "subject-math-pine", "A"),
  question("p2", "subject-math-pine", "B"),
  question("p3", "subject-math-pine", "C"),
  question("p4", "subject-math-pine", "D"),
  question("s1", "subject-science", "B"),
  question("s2", "subject-science", "C"),
  question("n1", null, null),
];
const paper = (quizId, ids) => ids.map((questionId) => ({ quiz_id: quizId, question_id: questionId, questions: questions.find((row) => row.id === questionId) }));
const quizQuestions = [
  ...paper("quiz-1", ["q1", "q2", "q3", "q4"]),
  ...paper("quiz-2", ["q5", "q6", "q7", "q8"]),
  ...paper("quiz-3", ["p1", "p2", "p3", "p4"]),
  ...paper("quiz-4", ["s1", "s2"]),
  ...paper("quiz-5", ["n1"]),
];

const students = [
  { id: "student-1", full_name: "Amina Diallo", student_ref: "OAK-001" },
  { id: "student-2", full_name: "Kwame Mensah", student_ref: "OAK-002" },
  { id: "student-3", full_name: "Léa Kponou", student_ref: "PIN-001" },
];
const attemptRow = (id, examId, studentId, extras = {}) => {
  const student = students.find((row) => row.id === studentId);
  return {
    id,
    exam_id: examId,
    status: "submitted",
    submitted_at: "2026-10-01T09:00:00Z",
    started_at: "2026-10-01T08:00:00Z",
    score: null,
    max_score: null,
    published_at: null,
    class_id: null,
    student_id: studentId,
    first_name: null,
    last_name: null,
    exam_candidates: {
      full_name: student?.full_name ?? null,
      candidate_ref: student?.student_ref ?? null,
      student_id: studentId,
      class_id: null,
      first_name: null,
      last_name: null,
    },
    ...extras,
  };
};
const attempts = [
  attemptRow("attempt-1", "exam-1", "student-1"),
  attemptRow("attempt-2", "exam-2", "student-2"),
  attemptRow("attempt-3", "exam-3", "student-3"),
  attemptRow("attempt-4", "exam-4", "student-1"),
  attemptRow("attempt-5", "exam-5", "student-2"),
  attemptRow("attempt-6", "exam-1", "student-2", { status: "in_progress", submitted_at: null }),
];
const answer = (attemptId, questionId, pointsAwarded, note = null) => ({
  attempt_id: attemptId,
  question_id: questionId,
  points_awarded: pointsAwarded,
  is_correct: null,
  marker_note: note,
  moderation_status: null,
});
const answers = [
  answer("attempt-1", "q1", 8), answer("attempt-1", "q2", 9, "Generalise the rule."), answer("attempt-1", "q3", 7), answer("attempt-1", "q4", 8),
  answer("attempt-2", "q5", 8), answer("attempt-2", "q6", null), answer("attempt-2", "q7", 6), answer("attempt-2", "q8", 7),
  answer("attempt-3", "p1", 6), answer("attempt-3", "p2", 7), answer("attempt-3", "p3", 8), answer("attempt-3", "p4", 9),
  answer("attempt-4", "s1", 8), answer("attempt-4", "s2", 6),
  answer("attempt-5", "n1", 6),
];
const history = [
  {
    id: "history-1",
    attempt_id: "attempt-1",
    exam_id: "exam-1",
    reason: "moderated",
    marks_awarded: 30,
    marks_max: 40,
    percent: 75,
    total_levels: 21,
    total_levels_max: 32,
    overall_grade: 5,
    grade_status: "final",
    criterion_snapshot: [],
    note: "Sample moderated",
    recorded_by_email: "lead@oak.example",
    created_at: "2026-10-02T10:00:00Z",
  },
  {
    id: "history-2",
    attempt_id: "attempt-1",
    exam_id: "exam-1",
    reason: "regraded",
    marks_awarded: 32,
    marks_max: 40,
    percent: 80,
    total_levels: 24,
    total_levels_max: 32,
    overall_grade: 4,
    grade_status: "final",
    criterion_snapshot: [],
    note: "Script re-marked",
    recorded_by_email: "lead@oak.example",
    created_at: "2026-10-03T10:00:00Z",
  },
];

/* ── Stub Supabase client ────────────────────────────────────────────── */
function stubClient(options = {}) {
  const tables = {
    organizations,
    classes,
    subjects,
    myp_criteria: [...mathCriteria, ...scienceCriteria],
    myp_level_boundaries: levelBoundaries,
    myp_grade_boundaries: gradeBoundaries,
    myp_framework_config: frameworkConfig,
    exams,
    quiz_questions: quizQuestions,
    exam_attempts: attempts,
    exam_answers: answers,
    students,
    myp_result_history: history,
  };
  const log = [];
  const client = {
    log,
    from(table) {
      const state = { table, filters: [], limit: null, order: null };
      const builder = {
        select() {
          return builder;
        },
        in(column, values) {
          state.filters.push({ column, values });
          return builder;
        },
        eq(column, value) {
          state.filters.push({ column, values: [value] });
          return builder;
        },
        order(column, options = {}) {
          state.order = { column, ascending: options.ascending !== false };
          return builder;
        },
        limit(value) {
          state.limit = value;
          return builder;
        },
        then(resolve, reject) {
          log.push(state);
          if (options.failTables?.includes(table)) {
            return Promise.resolve({ data: null, error: { message: `${table} is not deployed` } }).then(resolve, reject);
          }
          let rows = [...(tables[table] ?? [])];
          for (const filter of state.filters) {
            rows = rows.filter((row) => filter.values.includes(String(row[filter.column])));
          }
          if (state.order) {
            const { column, ascending } = state.order;
            rows.sort((left, right) => {
              const a = left[column] ?? "";
              const b = right[column] ?? "";
              return (a < b ? -1 : a > b ? 1 : 0) * (ascending ? 1 : -1);
            });
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return client;
}

const codes = (result) => result.criteria.map((criterion) => criterion.code).join("");

/* ── Tenant scope ────────────────────────────────────────────────────── */
const oakClient = stubClient();
const oak = await L.loadMypResults(oakClient, { organizationIds: [ORG_OAK] });
ok("Oak scope returns only Oak results", oak.results.length > 0 && oak.results.every((result) => result.organizationId === ORG_OAK));
ok("the Pine result is invisible from the Oak scope", !oak.results.some((result) => result.attemptId === "attempt-3"));
ok("filter options are limited to the tenant", oak.options.organizations.length === 1 && oak.options.organizations[0].value === ORG_OAK);
const emptyClient = stubClient();
const empty = await L.loadMypResults(emptyClient, { organizationIds: [] });
ok("an empty organization list short-circuits", empty.results.length === 0 && emptyClient.log.length === 0);

const pine = await L.loadMypResults(stubClient(), { organizationIds: [ORG_PINE] });
ok("Pine scope returns only the Pine result", pine.results.length === 1 && pine.results[0].organizationId === ORG_PINE);
ok("a second tenant sees its own organization only", pine.options.organizations[0].label === "Pine Academy");

const bothOrgs = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK, ORG_PINE] });
ok("a global scope may span organizations", bothOrgs.results.some((result) => result.organizationId === ORG_PINE) && bothOrgs.results.some((result) => result.organizationId === ORG_OAK));
ok("the organization map carries logos for report headers", bothOrgs.organizations[ORG_OAK].logoUrl === "https://cdn.example/oak.png");

/* ── Configuration precedence ────────────────────────────────────────── */
const amina = oak.results.find((result) => result.attemptId === "attempt-1");
ok("the Oak Mathematics criteria are read from the subject configuration", codes(amina) === "ABCD");
ok("criterion titles are the subject's own", amina.criteria[0].title === "Knowing and understanding");
ok("Oak level boundaries override the defaults", amina.levelSource === "Oak Mathematics level descriptors");
ok("a mark of 80% maps to the configured level 6", amina.criteria[0].percent === 80 && amina.criteria[0].level === 6);
ok("subject grade boundaries take precedence over organization boundaries", amina.gradeSource === "Oak Mathematics grade boundaries");
ok("the overall grade uses the configured subject bands", amina.overallGrade === 4, `${amina.totalLevels} → ${amina.overallGrade}`);
ok("the reporting period comes from the examination settings", amina.reportingPeriod === "2026 Term 1");
ok("MYP 2 is read from the examination override", amina.mypYear === 2);
ok("the class name and code are resolved", amina.className === "Grade 7 — MYP 2" && amina.classCode === "G7-MYP2");
ok("student identity comes from the student record", amina.studentName === "Amina Diallo" && amina.studentRef === "OAK-001");
ok("the result records the boundary source used for the level", amina.levelSource.length > 0);

const science = oak.results.find((result) => result.attemptId === "attempt-4");
ok("Sciences are graded with the Sciences criteria, not Mathematics'", codes(science) === "BCD");
ok("a configured criterion absent from the paper is not assessed", science.criteria.find((criterion) => criterion.code === "D").status === "not_assessed");
ok("unassessed evidence prevents a final Science grade", science.overallGrade === null && science.gradeStatus === "incomplete");
ok("Science level boundaries fall back to the EVALORA defaults", science.levelSource.includes("EVALORA"));

/* ── Unpublished and student-scoped reads ────────────────────────────── */
const unpublished = oak.results.find((result) => result.attemptId === "attempt-2");
ok("an unreleased examination is marked as not released", unpublished && unpublished.published === false);
const studentView = await L.loadMypResults(stubClient(), {
  organizationIds: [ORG_OAK],
  studentId: "student-1",
  includeUnpublished: false,
});
ok("a student read returns only that student's results", studentView.results.every((result) => result.studentId === "student-1"));
ok("a student read never includes unreleased results", studentView.results.every((result) => result.published));
ok("the student sees both of their released papers", studentView.results.length === 2);
const releasedOnly = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], includeUnpublished: false });
ok("staff can also hide unreleased results", releasedOnly.results.every((result) => result.published));
ok("hiding unreleased results keeps the released ones", releasedOnly.results.length === 4, `n=${releasedOnly.results.length}`);
ok("a student read of another tenant's attempt is empty", (await L.loadMypResults(stubClient(), {
  organizationIds: [ORG_OAK],
  studentId: "student-3",
  includeUnpublished: false,
})).results.length === 0);

/* ── Pending marking ─────────────────────────────────────────────────── */
const pendingB = unpublished.criteria.find((criterion) => criterion.code === "B");
ok("a pending criterion has no achievement level", pendingB.level === null && pendingB.status === "pending_marking");
ok("a pending criterion is never coerced to level zero", !(pendingB.level === 0));
ok("the pending criterion is named", unpublished.pendingCriteria.join("") === "B");
ok("pending marking is visible as an incomplete result", unpublished.gradeStatus === "incomplete" && unpublished.overallGrade === null);
ok("an open attempt is never graded", (() => {
  const open = oak.results.find((result) => result.attemptId === "attempt-6");
  return open && open.criteria.every((criterion) => criterion.level === null);
})());

/* ── Non-criterion papers ────────────────────────────────────────────── */
const nonCriterion = oak.results.find((result) => result.attemptId === "attempt-5");
ok("a non-criterion paper is not applicable for MYP", nonCriterion && nonCriterion.gradeStatus === "not_applicable" && !nonCriterion.hasCriteria);
ok("a non-criterion paper still reports its examination percentage", nonCriterion.percent === 60);
ok("a non-criterion result has no configured criteria column filled", nonCriterion.criteria.length === 0);

/* ── Filters ─────────────────────────────────────────────────────────── */
const byStatusPending = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], status: "pending" });
ok("the pending filter keeps only results awaiting marks",
  byStatusPending.results.every((result) => result.pendingCriteria.length > 0) &&
  byStatusPending.results.some((result) => result.attemptId === "attempt-2"));
const byStatusComplete = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], status: "complete" });
ok("the complete filter keeps only final grades", byStatusComplete.results.every((result) => result.gradeStatus === "final"));
const byStatusIncomplete = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], status: "incomplete" });
ok("the incomplete filter includes not-applicable papers only when final evidence is missing", byStatusIncomplete.results.every((result) => result.gradeStatus === "incomplete"));
ok("the provisional filter is empty when no rules allow it", (await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], status: "provisional" })).results.length === 0);

const byYear = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], mypYear: 4 });
ok("the MYP year filter returns the MYP 4 paper only", byYear.results.length === 1 && byYear.results[0].mypYear === 4);
const byClass = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], className: "Grade 7 — MYP 2" });
ok("the class filter uses the displayed class name", byClass.results.every((result) => result.className === "Grade 7 — MYP 2"));
const bySubject = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], subjectId: "subject-science" });
ok("the subject filter keeps the Science paper", bySubject.results.length === 1 && bySubject.results[0].subjectLabel === "Integrated Science");
const byCriterion = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], criterion: "D" });
ok("the criterion filter excludes papers without that criterion", byCriterion.results.every((result) => result.criteria.some((criterion) => criterion.code === "D" && criterion.questionCount > 0)));
ok("the criterion filter keeps Mathematics and Science (not the non-criterion quiz)", byCriterion.results.length === 3);
const bySearch = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], search: "oak-002" });
ok("search matches the student reference case-insensitively", bySearch.results.every((result) => result.studentRef === "OAK-002"));
const byExam = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], examId: "exam-1" });
ok("the examination filter loads that examination only", byExam.results.every((result) => result.examId === "exam-1"));
ok("the examination filter keeps the filter dropdown recoverable", byExam.options.exams.length >= 1);

const limited = await L.loadMypResults(stubClient(), { organizationIds: [ORG_OAK], limit: 1 });
ok("the row limit is honoured", limited.results.length === 1);
ok("a truncated dataset says so", limited.truncated === true);
ok("an untruncated dataset does not claim truncation", oak.truncated === false);

/* ── Analytics and filter options ────────────────────────────────────── */
ok("analytics are derived from the shown results", oak.analytics.results === oak.results.length);
ok("analytics count released and unreleased", oak.analytics.published + oak.analytics.unpublished === oak.analytics.results);
ok("analytics count pending marking", oak.analytics.pendingMarking >= 1 && oak.analytics.pendingMarking === oak.results.filter((result) => result.pendingCriteria.length > 0).length);
ok("analytics expose the criteria in scope", oak.analytics.criteria.map((criterion) => criterion.code).join("") === "ABCD");
ok("analytics never average the not-applicable paper into a grade", oak.analytics.averageOverallGrade === null || oak.analytics.averageOverallGrade > 0);

const optionValues = oak.options.criteria.map((option) => option.value);
ok("criterion options carry their configured titles", optionValues.join("") === "ABCD" && oak.options.criteria[0].label.includes("Knowing and understanding"));
ok("year options are labelled MYP 1–5", oak.options.years.every((option) => /^MYP [1-5]$/.test(option.label)));
ok("class options include the MYP year hint", oak.options.classes.some((option) => option.hint === "MYP 2"));
ok("subject options are de-duplicated", new Set(oak.options.subjects.map((option) => option.value)).size === oak.options.subjects.length);
ok("examination options list every exam in scope", oak.options.exams.length === 4);

/* ── Single-result and history reads ─────────────────────────────────── */
const one = await L.loadMypResult(stubClient(), { attemptId: "attempt-1", organizationIds: [ORG_OAK] });
ok("loadMypResult returns the same computed result as the list", one && one.totalLevels === amina.totalLevels && one.overallGrade === amina.overallGrade);
ok("loadMypResult refuses an attempt outside the tenant", (await L.loadMypResult(stubClient(), { attemptId: "attempt-3", organizationIds: [ORG_OAK] })) === null);
ok("loadMypResult refuses another student's attempt", (await L.loadMypResult(stubClient(), {
  attemptId: "attempt-1",
  organizationIds: [ORG_OAK],
  studentId: "student-2",
})) === null);
ok("loadMypResult refuses an unreleased attempt in a student view", (await L.loadMypResult(stubClient(), {
  attemptId: "attempt-2",
  organizationIds: [ORG_OAK],
  includeUnpublished: false,
})) === null);

const historyRows = await L.loadMypHistory(stubClient(), "attempt-1");
ok("history returns the audited snapshots newest first", historyRows.length === 2 && historyRows[0].reason === "regraded");
ok("history carries the snapshot values", historyRows[0].overall_grade === 4 && historyRows[0].criterion_snapshot !== undefined);
ok("history is scoped to its attempt", (await L.loadMypHistory(stubClient(), "attempt-2")).length === 0);
ok("history degrades to an empty list when it is not deployed", (await L.loadMypHistory(stubClient({ failTables: ["myp_result_history"] }), "attempt-1")).length === 0);

/* ── Graceful degradation before the migration is applied ────────────── */
const unmigrated = await L.loadMypResults(stubClient({ failTables: ["myp_criteria", "myp_level_boundaries", "myp_grade_boundaries", "myp_framework_config"] }), {
  organizationIds: [ORG_OAK],
});
ok("results still load when the configuration tables are missing", unmigrated.results.length === oak.results.length);
const unmigratedAmina = unmigrated.results.find((result) => result.attemptId === "attempt-1");
ok("a missing configuration falls back to the documented defaults", unmigratedAmina.gradeSource.includes("IB MYP published grade boundaries") && unmigratedAmina.rules.source === "default");
ok("a missing configuration still reports the paper's criteria letters", codes(unmigratedAmina) === "ABCD");
ok("a missing configuration does not invent criterion titles", unmigratedAmina.criteria.every((criterion) => criterion.title === ""));

/* ── Ordering ────────────────────────────────────────────────────────── */
const dates = oak.results.map((result) => Date.parse(result.examDate ?? ""));
ok("results are ordered newest examination first", dates.every((value, index) => index === 0 || dates[index - 1] >= value));

console.log(`\n${passed} checks passed — MYP results loader`);
