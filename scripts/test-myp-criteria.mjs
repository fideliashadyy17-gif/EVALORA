/**
 * MYP criterion aggregation (src/lib/examResults.ts) and the result summary
 * that consumes it.
 *
 * The bug this guards against is a label drifting out of step with the paper:
 * "Criterion C" must mean "Communicating" on the candidate's screen, on a
 * teacher report and on a printed export, and the same percentage must produce
 * the same level band everywhere. The vocabulary and the aggregation now live
 * in one module instead of being inlined twice in the exam runner.
 *
 * Run: node scripts/test-myp-criteria.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const outDir = "/tmp/evalora-myp-criteria-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`);

const built = new Set();
function build(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const emitted = ts.transpileModule(readFileSync(rel, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = [...emitted.matchAll(/require\("(\.[^"]+)"\)/g)].map((m) => m[1]);
  const normalised = emitted.replace(
    /require\("(\.[^"]+?)(\.ts)?"\)/g,
    (_match, spec) => `require("${spec}.js")`,
  );
  const dest = path.join(outDir, rel.replace(/^src\//, "").replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, normalised);
  for (const dep of deps) build(path.join(path.dirname(rel), `${dep.replace(/\.ts$/, "")}.ts`));
}
build("src/lib/examResults.ts");
build("src/lib/examFeedback.ts");

const require = createRequire(import.meta.url);
const criteria = require(`${outDir}/lib/examResults.js`);
const feedback = require(`${outDir}/lib/examFeedback.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  \u2713 ${name}`);
};

/* ── The four criteria and their official names ─────────────────────── */
ok("the four MYP criteria are reported in order",
  JSON.stringify(criteria.MYP_CRITERIA) === JSON.stringify(["A", "B", "C", "D"]));
ok("each criterion has its official MYP name",
  criteria.MYP_CRITERION_TITLES.A === "Knowing and understanding"
  && criteria.MYP_CRITERION_TITLES.B === "Investigating patterns"
  && criteria.MYP_CRITERION_TITLES.C === "Communicating"
  && criteria.MYP_CRITERION_TITLES.D === "Applying mathematics in real-life contexts");
ok("a criterion letter is recognised case-insensitively",
  criteria.isMypCriterion("a") && criteria.isMypCriterion("D") && !criteria.isMypCriterion("E"));

/* ── Normalisation and labels ───────────────────────────────────────── */
ok("a criterion key is trimmed and upper-cased so spellings aggregate together",
  criteria.normalizeCriterion("a") === "A"
  && criteria.normalizeCriterion(" A ") === "A"
  && criteria.normalizeCriterion("d") === "D");
ok("an empty or non-string criterion is null, never an empty row",
  criteria.normalizeCriterion("") === null
  && criteria.normalizeCriterion("   ") === null
  && criteria.normalizeCriterion(null) === null
  && criteria.normalizeCriterion(7) === null);
ok("the title lookup is null when a letter has no mapping, never invented",
  criteria.criterionTitle("A") === "Knowing and understanding"
  && criteria.criterionTitle("Z") === null
  && criteria.criterionTitle(null) === null);
ok("the short label reads 'Criterion A'",
  criteria.criterionLabel("A") === "Criterion A" && criteria.criterionLabel(null) === null);
ok("the full heading names the criterion",
  criteria.criterionHeading("C") === "Criterion C — Communicating"
  && criteria.criterionHeading("Z") === "Criterion Z");

/* ── Bands and indicative levels ────────────────────────────────────── */
ok("a percentage maps to one indicative level band",
  criteria.criterionLevelBand(90) === "7–8"
  && criteria.criterionLevelBand(85) === "7–8"
  && criteria.criterionLevelBand(70) === "5–6"
  && criteria.criterionLevelBand(65) === "5–6"
  && criteria.criterionLevelBand(50) === "3–4"
  && criteria.criterionLevelBand(40) === "3–4"
  && criteria.criterionLevelBand(39.9) === "1–2"
  && criteria.criterionLevelBand(0) === "1–2");
ok("an unreadable percentage falls back to the lowest band, never to a crash",
  criteria.criterionLevelBand(NaN) === "1–2"
  && criteria.criterionLevelBand(undefined) === "1–2");
ok("the at-a-glance band agrees with the level band",
  criteria.criterionBand(90) === "Strong"
  && criteria.criterionBand(70) === "Strong"
  && criteria.criterionBand(50) === "Developing"
  && criteria.criterionBand(40) === "Developing"
  && criteria.criterionBand(10) === "Needs work");

/* ── Aggregation ────────────────────────────────────────────────────── */
const paper = [
  { criterion: "A", points: 4, awarded: 4 },
  { criterion: "A", points: 6, awarded: 3 },
  { criterion: "B", points: 10, awarded: 9 },
  { criterion: "C", points: 5, awarded: 2 },
  { criterion: "D", points: 8, awarded: 0 },
];

const aggregated = criteria.aggregateCriteria(paper);
ok("criteria are reported in MYP order regardless of input order",
  JSON.stringify(aggregated.map((c) => c.criterion)) === JSON.stringify(["A", "B", "C", "D"]));
ok("marks are summed per criterion",
  aggregated[0].awarded === 7 && aggregated[0].max === 10
  && aggregated[1].awarded === 9 && aggregated[1].max === 10);
ok("each row carries its label, title, band and level",
  aggregated[1].label === "Criterion B"
  && aggregated[1].title === "Investigating patterns"
  && aggregated[1].percent === 90
  && aggregated[1].band === "Strong"
  && aggregated[1].level === "7–8");
ok("a criterion with no marks awarded still reports its level",
  aggregated[3].awarded === 0 && aggregated[3].max === 8 && aggregated[3].percent === 0
  && aggregated[3].band === "Needs work" && aggregated[3].level === "1–2");
ok("rows with no criterion are ignored rather than bucketed as a mystery row",
  criteria.aggregateCriteria([...paper, { criterion: null, points: 5, awarded: 5 }]).length === 4
  && criteria.aggregateCriteria([{ criterion: null, points: 5, awarded: 5 }]).length === 0);
ok("spellings of the same criterion aggregate into one row",
  criteria.aggregateCriteria([
    { criterion: "a", points: 4, awarded: 4 },
    { criterion: " A ", points: 6, awarded: 3 },
  ]).length === 1);
ok("an over-awarded mark is clamped to the question's worth, never trusted",
  criteria.aggregateCriteria([{ criterion: "A", points: 5, awarded: 99 }])[0].awarded === 5);
ok("a negative or corrupt mark is floored at zero",
  criteria.aggregateCriteria([{ criterion: "A", points: 5, awarded: -3 }])[0].awarded === 0
  && criteria.aggregateCriteria([{ criterion: "A", points: 5, awarded: "abc" }])[0].awarded === 0);
ok("an unreadable points value contributes nothing rather than NaN",
  criteria.aggregateCriteria([{ criterion: "A", points: "many", awarded: 2 }])[0].max === 0);
ok("a custom strand is reported after the MYP criteria, alphabetically",
  JSON.stringify(criteria.aggregateCriteria([
    { criterion: "E", points: 2, awarded: 1 },
    { criterion: "B", points: 2, awarded: 1 },
    { criterion: "Z", points: 2, awarded: 1 },
  ]).map((c) => c.criterion)) === JSON.stringify(["B", "E", "Z"]));
ok("a custom strand gets a label but no invented title",
  criteria.aggregateCriteria([{ criterion: "E", points: 2, awarded: 2 }])[0].title === null
  && criteria.aggregateCriteria([{ criterion: "E", points: 2, awarded: 2 }])[0].label === "Criterion E");
ok("a paper with no criteria at all produces no rows",
  criteria.aggregateCriteria([]).length === 0);
ok("the criteria on a paper are listed in reporting order with no scores",
  JSON.stringify(criteria.criteriaOnPaper([{ criterion: "D" }, { criterion: "a" }, { criterion: "B" }]))
  === JSON.stringify(["A", "B", "D"]));

/* ── The result summary uses the same vocabulary ────────────────────── */
const summary = feedback.resultSummary([
  { type: "single_choice", criterion: "A", points: 10, topic: "Algebra", result: { points_awarded: 9, is_correct: true } },
  { type: "open_ended", criterion: "B", points: 10, topic: "Patterns", result: { points_awarded: 8, is_correct: null } },
  { type: "numeric", criterion: "A", points: 10, topic: "Algebra", result: { points_awarded: 0, is_correct: false } },
], 50);

ok("the summary reports one row per criterion, in MYP order",
  JSON.stringify(summary.criteria.map((c) => c.criterion)) === JSON.stringify(["A", "B"]));
ok("the summary's criterion rows carry the shared label and title",
  summary.criteria[0].label === "Criterion A"
  && summary.criteria[0].title === "Knowing and understanding"
  && summary.criteria[1].title === "Investigating patterns");
ok("the summary's criterion band and level come from the shared rules",
  summary.criteria[0].percent === 45
  && summary.criteria[0].band === criteria.criterionBand(45)
  && summary.criteria[0].level === criteria.criterionLevelBand(45));
ok("the summary's totals are unchanged by the extraction",
  summary.awarded === 17 && summary.max === 30 && summary.percent === 56.7 && summary.passed === true);

ok("a question awaiting a human mark is excluded from the criterion totals",
  feedback.resultSummary([
    { type: "open_ended", criterion: "A", points: 10, result: null },
    { type: "single_choice", criterion: "A", points: 10, result: { points_awarded: 5, is_correct: false } },
  ], 50).criteria[0].max === 10);

const splitSummary = feedback.resultSummary([
  {
    type: "matching", criterion: "C", points: 4,
    criterionShares: [{ criterion: "C", points: 2 }, { criterion: "A", points: 2 }],
    result: { points_awarded: 3, is_correct: false },
  },
], 50);
ok("a split question keeps both printed criterion maxima in the feedback summary",
  splitSummary.criteria.find((c) => c.criterion === "A")?.max === 2
  && splitSummary.criteria.find((c) => c.criterion === "C")?.max === 2);
ok("a split award is divided in the same proportion in the feedback summary",
  splitSummary.criteria.find((c) => c.criterion === "A")?.awarded === 1.5
  && splitSummary.criteria.find((c) => c.criterion === "C")?.awarded === 1.5);
ok("a split question is counted once in the feedback totals",
  splitSummary.awarded === 3 && splitSummary.max === 4);

/* ── The labels live in exactly one place ───────────────────────────── */
const runner = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
const live = readFileSync("src/lib/live.ts", "utf8");
const feedbackSource = readFileSync("src/lib/examFeedback.ts", "utf8");

ok("the exam runner no longer inlines the criterion names",
  !/Knowing and understanding/.test(runner)
  && !/Investigating patterns/.test(runner)
  && !/Applying mathematics in real-life contexts/.test(runner));
ok("the exam runner reads the criterion title from the shared module",
  /criterionTitle\(current\.criterion\)/.test(runner)
  && /criterion\.title \?\? ""/.test(runner));
ok("the feedback summary no longer keeps its own band or level rules",
  !/function levelBand/.test(feedbackSource)
  && /const band = criterionBand;/.test(feedbackSource)
  && /aggregateCriteria\(criterionRows\)/.test(feedbackSource));
ok("the published question falls back to the shared title when the paper has none",
  /criterionTitle\(typeof cfg\.myp_criterion === "string" \? cfg\.myp_criterion : null\)/.test(live));

console.log(`\n${passed} checks passed (MYP criteria: real modules, no DB/browser).`);
