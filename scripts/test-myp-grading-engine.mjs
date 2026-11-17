/**
 * MYP grading engine (src/lib/myp.ts).
 *
 * These checks pin the rules that make an MYP report trustworthy:
 *   · MYP 1–5 is derived from the class/override, never assumed;
 *   · criteria come from the subject's configuration plus the paper, so
 *     Mathematics' A–D is not applied to an unconfigured subject;
 *   · a pending or unassessed criterion is never turned into level 0, while a
 *     fully marked criterion that earned nothing IS level 0;
 *   · the overall 1–7 grade comes from summed criterion levels and configured
 *     boundaries, not from the raw examination percentage;
 *   · analytics never average unmarked work.
 *
 * Run: node scripts/test-myp-grading-engine.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const outDir = "/tmp/evalora-myp-grading-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`);

const built = new Set();
function build(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const emitted = ts.transpileModule(readFileSync(rel, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = [...emitted.matchAll(/require\("(\.[^"]+)"\)/g)].map((match) => match[1]);
  const normalised = emitted.replace(/require\("(\.[^"]+?)(\.ts)?"\)/g, (_match, spec) => `require("${spec}.js")`);
  const dest = path.join(outDir, rel.replace(/^src\//, "").replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, normalised);
  for (const dep of deps) build(path.join(path.dirname(rel), `${dep.replace(/\.ts$/, "")}.ts`));
}
build("src/lib/myp.ts");

const require = createRequire(import.meta.url);
const M = require(`${outDir}/lib/myp.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── MYP year resolution ─────────────────────────────────────────────── */
ok("class name 'Grade 9 — MYP 4' resolves to MYP 4", M.resolveMypYear({ className: "Grade 9 — MYP 4" }) === 4);
ok("class code G6-MYP1 resolves to MYP 1", M.resolveMypYear({ classCode: "G6-MYP1" }) === 1);
ok("plain 'MYP5' text resolves to MYP 5", M.resolveMypYear({ className: "MYP5" }) === 5);
ok("class ladder grade order 6 → MYP 1", M.resolveMypYear({ gradeOrder: 6, className: "Grade 6" }) === 1);
ok("class ladder grade order 10 → MYP 5", M.resolveMypYear({ gradeOrder: 10, className: "Grade 10" }) === 5);
ok("explicit override beats the class name", M.resolveMypYear({ override: "MYP 3", className: "Grade 7 — MYP 2" }) === 3);
ok("a non-MYP class has no MYP year", M.resolveMypYear({ className: "Grade 12", gradeOrder: 12 }) === null);
ok("MYP 1–5 labels are canonical", M.MYP_YEAR_LABEL[1] === "MYP 1" && M.MYP_YEAR_LABEL[5] === "MYP 5");

/* ── Configured criteria, not hardcoded Mathematics ──────────────────── */
const mathConfig = M.presetForSubject("Mathematics").criteria;
const scienceConfig = M.presetForSubject("Integrated Science").criteria;
const frenchConfig = M.presetForSubject("Français").criteria;
ok("Mathematics preset has the four standard criteria titles", mathConfig[0].title === "Knowing and understanding" && mathConfig[1].title === "Investigating patterns" && mathConfig[2].title === "Communicating" && mathConfig[3].title === "Applying mathematics in real-life contexts");
ok("Sciences uses its own criteria, not Mathematics'", scienceConfig[1].title === "Inquiring and designing" && scienceConfig[3].title === "Reflecting on the impacts of science");
ok("Français maps to language acquisition criteria", frenchConfig[2].title.startsWith("Communicating in response"));
ok("an unrecognised subject has no invented preset", M.presetForSubject("Underwater Basket Weaving") === null);

const configured = [
  { code: "A", title: "Knowing and understanding", description: null, position: 0 },
  { code: "B", title: "Inquiring and designing", description: null, position: 1 },
  { code: "C", title: "Processing and evaluating", description: null, position: 2 },
  { code: "D", title: "Reflecting on the impacts of science", description: null, position: 3 },
];
const paperOnly = M.criteriaForPaper([], ["A", "B"]);
ok("without configuration, only the paper's letters are reported", paperOnly.length === 2 && paperOnly.every((criterion) => criterion.title === ""));
ok("configured criteria are reported with their own titles", M.criteriaForPaper(configured, ["A", "B"])[1].title === "Inquiring and designing");
const union = M.criteriaForPaper(configured, ["D", "E"]);
ok("a paper criterion outside the configuration is still reported", union.some((criterion) => criterion.code === "E"));
ok("criterion order follows configuration then letter", union.map((criterion) => criterion.code).join("") === "ABCDE");

/* ── Level and grade boundaries ──────────────────────────────────────── */
ok("level 0 at 0%", M.levelFromPercent(0) === 0);
ok("level 4 at 50%", M.levelFromPercent(50) === 4);
ok("level 8 at 95%", M.levelFromPercent(95) === 8);
ok("level 8 at 100%", M.levelFromPercent(100) === 8);
ok("a configured boundary overrides the default", M.levelFromPercent(55, [{ level: 0, minPercent: 0 }, { level: 6, minPercent: 55 }]) === 6);
ok("grade 1 for a total of 0", M.gradeFromTotal(0) === 1);
ok("grade 1 for a total of 5", M.gradeFromTotal(5) === 1);
ok("grade 4 for 15–18", M.gradeFromTotal(16) === 4 && M.gradeFromTotal(18) === 4);
ok("grade 7 for 28–32", M.gradeFromTotal(28) === 7 && M.gradeFromTotal(32) === 7);
ok("a configured grade boundary set is honoured", M.gradeFromTotal(20, [{ minTotal: 0, maxTotal: 12, grade: 1 }, { minTotal: 13, maxTotal: 32, grade: 5 }]) === 5);
ok("a total outside every configured band yields no grade", M.gradeFromTotal(40) === null);
ok("grade boundaries normalise out invalid rows", M.normalizeGradeBoundaries([{ minTotal: 5, maxTotal: 2, grade: 3 }]).length === 0);

/* ── Fixtures ────────────────────────────────────────────────────────── */
const rules = {
  criteria: mathConfig.map((criterion, index) => ({ ...criterion, description: null, position: index })),
  levelBoundaries: M.DEFAULT_LEVEL_BOUNDARIES,
  gradeBoundaries: M.DEFAULT_GRADE_BOUNDARIES,
  levelSource: "test level source",
  gradeSource: "test grade source",
  requireAllCriteria: true,
  criteriaMaxLevel: 8,
  source: "configured",
};

const paper = [
  { questionId: "q1", points: 10, criterion: "A", topic: "Number" },
  { questionId: "q2", points: 10, criterion: "A", topic: "Algebra" },
  { questionId: "q3", points: 10, criterion: "B", topic: "Patterns" },
  { questionId: "q4", points: 10, criterion: "B", topic: "Patterns" },
  { questionId: "q5", points: 10, criterion: "C", topic: "Communication" },
  { questionId: "q6", points: 10, criterion: "C", topic: "Communication" },
  { questionId: "q7", points: 10, criterion: "D", topic: "Modelling" },
  { questionId: "q8", points: 10, criterion: "D", topic: "Modelling" },
];

const attemptBase = {
  attemptId: "attempt-1",
  examId: "exam-1",
  organizationId: "org-1",
  organizationName: "Oak International School",
  organizationLogoUrl: null,
  examTitle: "MYP 2 Mathematics — Term 1",
  examDate: "2026-11-02T08:00:00Z",
  attemptStatus: "submitted",
  submittedAt: "2026-11-02T09:00:00Z",
  score: 60,
  maxScore: 80,
  published: true,
  studentName: "Amina Diallo",
  studentRef: "OAK-001",
  className: "Grade 7 — MYP 2",
  classGradeOrder: 7,
  mypYear: 2,
  subjectNames: ["Mathematics"],
  subjectId: "subject-math",
  reportingPeriod: "2026-11",
};

const answered = (points) =>
  paper.map((question, index) => ({
    questionId: question.questionId,
    pointsAwarded: points[index] ?? null,
    markerNote: question.criterion === "B" ? "Show the general rule, not just the next term." : null,
  }));

/* ── A complete paper ────────────────────────────────────────────────── */
const complete = M.buildMypResult({
  attempt: attemptBase,
  paper,
  answers: answered([8, 9, 7, 8, 6, 7, 8, 9]),
  rules,
});
ok("every criterion is assessed on a fully marked paper", complete.criteria.every((criterion) => criterion.status === "assessed"));
ok("criterion percentages are computed from criterion marks", complete.criteria[0].percent === 85);
ok("achievement level comes from the configured boundaries", complete.criteria[0].level === 7);
ok("total criterion levels are summed", complete.totalLevels === complete.criteria.reduce((sum, criterion) => sum + criterion.level, 0));
ok("a complete paper has a final grade", complete.gradeStatus === "final" && complete.overallGrade !== null);
ok("the overall grade uses boundaries, not the raw percentage",
  complete.overallGrade === M.gradeFromTotal(complete.totalLevels));
ok("the report names the boundary sources", complete.gradeSource === "test grade source" && complete.levelSource === "test level source");
ok("teacher feedback is carried from the marker notes", complete.criteria[1].feedback?.includes("general rule"));
ok("strengths and improvements are derived per criterion", complete.criteria[1].strengths.length > 0);

/* ── One question spanning two criteria (the printed matching exercise) ── */
const splitPaper = [
  {
    questionId: "split-1",
    points: 4,
    criterion: "C",
    criterionShares: [{ criterion: "C", points: 2 }, { criterion: "A", points: 2 }],
  },
];
const split = M.buildMypResult({
  attempt: attemptBase,
  paper: splitPaper,
  answers: [{ questionId: "split-1", pointsAwarded: 3 }],
  rules,
});
ok("a split question keeps each criterion's printed maximum",
  split.criteria.find((criterion) => criterion.code === "A")?.marksMax === 2 &&
  split.criteria.find((criterion) => criterion.code === "C")?.marksMax === 2);
ok("a split award is divided in proportion to the criterion shares",
  split.criteria.find((criterion) => criterion.code === "A")?.marksAwarded === 1.5 &&
  split.criteria.find((criterion) => criterion.code === "C")?.marksAwarded === 1.5);
ok("a split question is still counted once in the paper total",
  split.marksAwarded === 3 && split.marksMax === 4);

/* ── Same percentage, different criterion distribution ──────────────── */
const unevenPaper = [
  { questionId: "u1", points: 30, criterion: "A" },
  { questionId: "u2", points: 10, criterion: "B" },
  { questionId: "u3", points: 10, criterion: "C" },
  { questionId: "u4", points: 10, criterion: "D" },
];
const samePercentEven = M.buildMypResult({
  attempt: attemptBase,
  paper: unevenPaper,
  answers: [
    { questionId: "u1", pointsAwarded: 24 },
    { questionId: "u2", pointsAwarded: 8 },
    { questionId: "u3", pointsAwarded: 8 },
    { questionId: "u4", pointsAwarded: 8 },
  ],
  rules,
});
const samePercentSpiky = M.buildMypResult({
  attempt: attemptBase,
  paper: unevenPaper,
  answers: [
    { questionId: "u1", pointsAwarded: 28 },
    { questionId: "u2", pointsAwarded: 10 },
    { questionId: "u3", pointsAwarded: 5 },
    { questionId: "u4", pointsAwarded: 5 },
  ],
  rules,
});
ok("two papers can share a percentage", samePercentEven.percent === samePercentSpiky.percent);
ok("but their criterion levels differ, so the grades may differ",
  samePercentEven.totalLevels !== samePercentSpiky.totalLevels,
  );
ok("equal percentages do not force an equal MYP grade",
  samePercentEven.overallGrade !== samePercentSpiky.overallGrade);

/* ── Pending marking is not zero ────────────────────────────────────── */
const pending = M.buildMypResult({
  attempt: attemptBase,
  paper,
  answers: [
    { questionId: "q1", pointsAwarded: 8 },
    { questionId: "q2", pointsAwarded: 9 },
    { questionId: "q3", pointsAwarded: null },
    { questionId: "q4", pointsAwarded: null },
    { questionId: "q5", pointsAwarded: 6 },
    { questionId: "q6", pointsAwarded: 7 },
    { questionId: "q7", pointsAwarded: 8 },
    { questionId: "q8", pointsAwarded: 9 },
  ],
  rules,
});
const pendingB = pending.criteria.find((criterion) => criterion.code === "B");
ok("a criterion with no marks is pending, not level 0", pendingB.status === "pending_marking" && pendingB.level === null);
ok("a pending criterion is excluded from the total levels",
  pending.totalLevels === 7 + 5 + 7 &&
  pending.criteria.filter((criterion) => criterion.status === "assessed").length === 3);
ok("an incomplete paper has no overall grade", pending.overallGrade === null && pending.gradeStatus === "incomplete");
ok("the pending criterion is named on the result", pending.pendingCriteria.includes("B"));
ok("a partially marked criterion is reported separately",
  M.buildMypResult({
    attempt: attemptBase,
    paper,
    answers: [
      { questionId: "q1", pointsAwarded: 8 },
      { questionId: "q2", pointsAwarded: 9 },
      { questionId: "q3", pointsAwarded: 5 },
      { questionId: "q4", pointsAwarded: null },
      { questionId: "q5", pointsAwarded: 6 },
      { questionId: "q6", pointsAwarded: 7 },
      { questionId: "q7", pointsAwarded: 8 },
      { questionId: "q8", pointsAwarded: 9 },
    ],
    rules,
  }).criteria.find((criterion) => criterion.code === "B").status === "partially_marked");

/* ── Unassessed criterion ───────────────────────────────────────────── */
const partialPaper = paper.filter((question) => question.criterion !== "D");
const unassessed = M.buildMypResult({
  attempt: attemptBase,
  paper: partialPaper,
  answers: answered([8, 9, 7, 8, 6, 7]),
  rules,
});
const criterionD = unassessed.criteria.find((criterion) => criterion.code === "D");
ok("a configured criterion with no questions is not assessed", criterionD.status === "not_assessed" && criterionD.level === null);
ok("not assessed is named and prevents a final grade",
  unassessed.unassessedCriteria.includes("D") && unassessed.overallGrade === null);

/* ── Assessed at level zero ─────────────────────────────────────────── */
const zeroPaper = [{ questionId: "z1", points: 10, criterion: "A" }];
const zero = M.buildMypResult({
  attempt: attemptBase,
  paper: zeroPaper,
  answers: [{ questionId: "z1", pointsAwarded: 0 }],
  rules,
});
const zeroA = zero.criteria.find((criterion) => criterion.code === "A");
ok("a fully marked zero is level 0, assessed", zeroA.status === "assessed" && zeroA.level === 0 && zeroA.assessedAtZero === true);
ok("an assessed zero is not confused with not assessed", zeroA.status !== "not_assessed");
ok("as′s level 0 still participates in the total", zero.totalLevels === 0);

/* ── Partial aggregation only when the rules allow it ───────────────── */
const permissive = M.buildMypResult({
  attempt: attemptBase,
  paper,
  answers: [
    { questionId: "q1", pointsAwarded: 8 },
    { questionId: "q2", pointsAwarded: 9 },
    { questionId: "q3", pointsAwarded: null },
    { questionId: "q4", pointsAwarded: null },
    { questionId: "q5", pointsAwarded: 6 },
    { questionId: "q6", pointsAwarded: 7 },
    { questionId: "q7", pointsAwarded: 8 },
    { questionId: "q8", pointsAwarded: 9 },
  ],
  rules: { ...rules, requireAllCriteria: false },
});
ok("configuration may allow a provisional grade from marked criteria",
  permissive.gradeStatus === "provisional" && permissive.overallGrade !== null);
ok("the provisional grade still leaves the pending criterion out", permissive.pendingCriteria.includes("B"));

/* ── Open attempts and submission state ─────────────────────────────── */
const open = M.buildMypResult({
  attempt: { ...attemptBase, attemptStatus: "in_progress", submittedAt: null },
  paper,
  answers: [{ questionId: "q1", pointsAwarded: 8 }],
  rules,
});
ok("an open attempt never awards a level", open.criteria.every((criterion) => criterion.level === null));
ok("an open attempt has no overall grade", open.overallGrade === null);

/* ── A paper with no criteria at all ────────────────────────────────── */
const noCriteria = M.buildMypResult({
  attempt: attemptBase,
  paper: [{ questionId: "n1", points: 10, criterion: null }],
  answers: [{ questionId: "n1", pointsAwarded: 6 }],
  rules,
});
ok("a non-criterion paper reports not applicable", noCriteria.gradeStatus === "not_applicable" && noCriteria.hasCriteria === false);
ok("a non-criterion paper still reports its percentage", noCriteria.percent === 60);

/* ── Scenario B: an incomplete examination still grades every criterion ─ */
const incomplete = M.buildMypResult({
  attempt: attemptBase,
  paper,
  // The candidate answered A fully and one B question, then submitted.
  answers: [
    { questionId: "q1", pointsAwarded: 8 },
    { questionId: "q2", pointsAwarded: 9 },
    { questionId: "q3", pointsAwarded: 5 },
  ],
  rules,
});
ok("an incomplete examination still assesses every criterion", incomplete.criteria.every((criterion) => criterion.status === "assessed"));
ok("the attempted criterion keeps its real marks", incomplete.criteria.find((c) => c.code === "A").marksAwarded === 17);
ok("a partly attempted criterion earns the marks it earned", incomplete.criteria.find((c) => c.code === "B").marksAwarded === 5);
ok("a criterion the candidate never reached is a genuine zero, not pending", (() => {
  const c = incomplete.criteria.find((criterion) => criterion.code === "C");
  return c.marksAwarded === 0 && c.marksMax === 20 && c.level === 0 && c.status === "assessed" && c.assessedAtZero;
})());
ok("unanswered questions are counted and explained", incomplete.zeroFilledQuestions === 5 && incomplete.criteria.find((c) => c.code === "B").zeroFilledCount === 1);
ok("nothing is left pending when every question is resolved", incomplete.pendingCriteria.length === 0 && incomplete.errorCriteria.length === 0);
ok("the incomplete attempt still gets an overall grade once every criterion is resolved",
  incomplete.gradeStatus === "final" && incomplete.overallGrade === M.gradeFromTotal(incomplete.totalLevels),
  `${incomplete.totalLevels} → ${incomplete.overallGrade}`);
ok("the overall marks include the unanswered questions as zero",
  incomplete.marksAwarded === 22 && incomplete.marksMax === 80 && incomplete.percent === 27.5,
  `${incomplete.marksAwarded}/${incomplete.marksMax} = ${incomplete.percent}%`);

/* ── Blank saved answers versus unmarked answers ─────────────────────── */
const blankAnswer = M.buildMypResult({
  attempt: attemptBase,
  paper,
  answers: [
    { questionId: "q1", pointsAwarded: 8 },
    { questionId: "q2", pointsAwarded: 9 },
    { questionId: "q3", pointsAwarded: 5 },
    { questionId: "q4", pointsAwarded: null, hasContent: false },
  ],
  rules,
});
ok("a saved but empty answer is zero on a final attempt", blankAnswer.criteria.find((c) => c.code === "B").marksAwarded === 5 && blankAnswer.criteria.find((c) => c.code === "B").status === "assessed");
const unmarkedAnswer = M.buildMypResult({
  attempt: attemptBase,
  paper,
  answers: [
    { questionId: "q1", pointsAwarded: 8 },
    { questionId: "q2", pointsAwarded: 9 },
    { questionId: "q3", pointsAwarded: 5 },
    { questionId: "q4", pointsAwarded: null, hasContent: true },
  ],
  rules,
});
const unmarkedB = unmarkedAnswer.criteria.find((c) => c.code === "B");
ok("an answer with content and no mark stays pending, not zero", unmarkedB.status === "partially_marked" && unmarkedB.level === null && unmarkedB.pendingCount === 1);
ok("pending marking is named while the other criteria keep their results", unmarkedAnswer.pendingCriteria.join("") === "B" && unmarkedAnswer.criteria.find((c) => c.code === "A").level !== null);
ok("a pending criterion withholds the overall grade", unmarkedAnswer.overallGrade === null && unmarkedAnswer.gradeStatus === "incomplete");

/* ── Scenario D: marking data error is red, never zero ──────────────── */
const badMark = M.buildMypResult({
  attempt: attemptBase,
  paper,
  answers: [
    { questionId: "q1", pointsAwarded: 8 },
    { questionId: "q2", pointsAwarded: Number.NaN },
    { questionId: "q3", pointsAwarded: 5 },
  ],
  rules,
});
ok("a non-numeric mark is reported as a marking data error", badMark.criteria.find((c) => c.code === "A").status === "error" && badMark.errorCriteria.join("") === "A");
ok("the other criteria are unaffected by the error", badMark.criteria.find((c) => c.code === "B").status === "assessed" && badMark.criteria.find((c) => c.code === "C").status === "assessed");
ok("a marking data error withholds the overall grade instead of scoring zero", badMark.overallGrade === null && badMark.gradeStatus === "incomplete");
ok("an invalid mark never poisons the paper totals", Number.isFinite(badMark.marksAwarded) && Number.isFinite(badMark.marksMax) && badMark.percent !== null);
ok("the error carries a teacher-facing meaning and a red tone",
  M.CRITERION_STATUS_MEANING.error.includes("never converted to zero") && M.criterionStatusTone("error") === "red");

/* ── Status vocabulary and tones ─────────────────────────────────────── */
ok("assessed is green, including a genuine zero", M.criterionStatusTone("assessed") === "green" && M.criterionStatusTone(zeroA.status) === "green");
ok("pending and partially marked are amber", M.criterionStatusTone("pending_marking") === "amber" && M.criterionStatusTone("partially_marked") === "amber");
ok("not assessed is grey", M.criterionStatusTone("not_assessed") === "gray");
ok("every status has a plain-language meaning", Object.values(M.CRITERION_STATUS_MEANING).every((text) => text.length > 20));

/* ── Scenario H: MYP 1-5 and another subject's criteria ─────────────── */
for (let year = 1; year <= 5; year += 1) {
  const result = M.buildMypResult({
    attempt: { ...attemptBase, attemptId: `attempt-myp-${year}`, mypYear: year, className: `Grade ${year + 5} - MYP ${year}` },
    paper,
    answers: answered([8, 9, 7, 8, 6, 7, 8, 9]),
    rules,
  });
  ok(`MYP ${year} produces a complete graded result`, result.mypYear === year && result.mypYearLabel === `MYP ${year}` && result.criteria.every((c) => c.status === "assessed") && result.overallGrade !== null);
}
const scienceRules = {
  ...rules,
  criteria: scienceConfig.map((criterion, index) => ({ ...criterion, description: null, position: index })),
};
const sciencePaper = [
  { questionId: "s1", points: 8, criterion: "A" },
  { questionId: "s2", points: 8, criterion: "B" },
  { questionId: "s3", points: 8, criterion: "C" },
  { questionId: "s4", points: 8, criterion: "D" },
];
const scienceResult = M.buildMypResult({
  attempt: { ...attemptBase, subjectNames: ["Integrated Science"], subjectId: "subject-science" },
  paper: sciencePaper,
  answers: [{ questionId: "s1", pointsAwarded: 7 }, { questionId: "s2", pointsAwarded: 6 }],
  rules: scienceRules,
});
ok("another subject uses its own criterion names in the report", scienceResult.criteria[1].title === "Inquiring and designing" && scienceResult.criteria[3].title === "Reflecting on the impacts of science");
ok("the other subject grades unanswered criteria as zero and still produces a grade",
  scienceResult.criteria.find((c) => c.code === "D").level === 0 && scienceResult.gradeStatus === "final");

/* ── Analytics ──────────────────────────────────────────────────────── */
const analytics = M.summarizeMyp([complete, pending, unassessed]);
ok("analytics counts every result", analytics.results === 3);
ok("analytics counts pending marking separately from not assessed", analytics.pendingMarking === 1);
ok("analytics counts complete results", analytics.complete === 1 && analytics.incomplete === 2);
ok("grade distribution counts assessed grades only", analytics.gradeDistribution.reduce((sum, bucket) => sum + bucket.count, 0) === 1);
ok("criterion averages exclude not-assessed rows",
  analytics.criteria.find((criterion) => criterion.code === "D").assessed === 2);
ok("completion rate reflects final grades", analytics.completionRate === Math.round((1 / 3) * 1000) / 10);
ok("year analytics groups MYP 2", analytics.years.find((year) => year.year === 2).count === 3);
const emptyAnalytics = M.summarizeMyp([]);
ok("an empty result set produces null averages, not zero", emptyAnalytics.averagePercent === null && emptyAnalytics.averageOverallGrade === null);

console.log(`\n${passed} checks passed — MYP grading engine`);
