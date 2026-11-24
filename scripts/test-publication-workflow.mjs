// Examination result publication workflow — 7-stage state machine, mandatory
// validation gate, audits, and candidate-side invisibility of unpublished
// results (backend/API level, not just UI).
//
//   node scripts/test-publication-workflow.mjs
import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let checks = 0;
const failures = [];
function ok(cond, message) {
  checks += 1;
  if (!cond) failures.push(message);
}
const read = (p) => readFileSync(p, "utf8");

// ── real state machine ──
mkdirSync(".tmp-test-lifecycle", { recursive: true });
const build = spawnSync(
  "npx",
  ["tsc", "src/lib/resultLifecycle.ts", "--target", "es2022", "--module", "commonjs", "--skipLibCheck", "--outDir", ".tmp-test-lifecycle"],
  { encoding: "utf8" },
);
ok(build.status === 0, `tsc transpile of resultLifecycle.ts failed: ${String(build.stderr).slice(0, 400)}`);
const L = require(`${process.cwd()}/.tmp-test-lifecycle/resultLifecycle.js`);

ok(L.RESULT_STAGES.length === 7, "exactly 7 lifecycle stages");
ok(
  JSON.stringify(L.RESULT_STAGES) === JSON.stringify([
    "draft", "in_progress", "submitted", "marking", "results_review", "validated", "published",
  ]),
  "stage order Draft → In Progress → Submitted → Marking → Results Review → Validated → Published",
);

const derive = L.deriveResultStage;
// Published wins over everything.
ok(derive({ examStatus: "closed", attemptCount: 3, submittedCount: 3, awaitingMarking: 0, resultsValidated: true, resultsPublished: true }).stage === "published", "published beats validated");
// Validated beats workflow stages.
ok(derive({ examStatus: "closed", attemptCount: 3, submittedCount: 3, awaitingMarking: 2, resultsValidated: true, resultsPublished: false }).stage === "validated", "validated beats marking");
// Draft.
ok(derive({ examStatus: "draft", attemptCount: 0, submittedCount: 0, awaitingMarking: 0, resultsValidated: false, resultsPublished: false }).stage === "draft", "draft");
// In progress: open, no attempts.
ok(derive({ examStatus: "open", attemptCount: 0, submittedCount: 0, awaitingMarking: 0, resultsValidated: false, resultsPublished: false }).stage === "in_progress", "open exam without attempts → in_progress");
// Submitted: still open, some candidates already handed in.
ok(derive({ examStatus: "open", attemptCount: 2, submittedCount: 1, awaitingMarking: 0, resultsValidated: false, resultsPublished: false }).stage === "submitted", "open + partial submissions → submitted");
// Marking: closed with pending written marking.
ok(derive({ examStatus: "closed", attemptCount: 5, submittedCount: 5, awaitingMarking: 3, resultsValidated: false, resultsPublished: false }).stage === "marking", "closed + awaiting marking → marking");
// Results review: closed, marking complete, not yet validated.
ok(derive({ examStatus: "closed", attemptCount: 5, submittedCount: 5, awaitingMarking: 0, resultsValidated: false, resultsPublished: false }).stage === "results_review", "closed + marked → results_review");
// Stage index matches position.
const reviewState = derive({ examStatus: "closed", attemptCount: 5, submittedCount: 5, awaitingMarking: 0, resultsValidated: false, resultsPublished: false });
ok(reviewState.index === 4, "results_review index = 4");
ok(derive({ examStatus: "open", attemptCount: 0, submittedCount: 0, awaitingMarking: 0, resultsValidated: false, resultsPublished: false }).index === 1, "in_progress index = 1");

// ── server actions: mandatory validation before publication + audits ──
const wsActions = read("src/app/dashboard/exams/actions.ts");
ok(wsActions.includes("currentSettings.results_validated !== true"), "workspace publish requires prior validation");
ok(wsActions.includes('redirect(`${back}?publish_error=validation`)' ), "unvalidated publish redirects with validation error");
ok(wsActions.includes("export async function validateResults"), "validateResults action exists");
ok(wsActions.includes("results_validated_by: ctx.user.id"), "validation stamps who validated");
ok(wsActions.includes("results_validated_at: now"), "validation stamps when");
ok(wsActions.includes('"exam.results_validated"'), "validation audited");
ok(wsActions.includes('"exam.results_published"'), "publish audited (who/when in audit_logs)");
ok(wsActions.includes('"exam.results_unpublished"'), "unpublish audited (post-publication correction path)");
ok(wsActions.includes('"exam.results_validation_reopened"'), "reopened validation audited");
ok(wsActions.includes("grades_published_by: published ? ctx.user.id : null"), "publish stamps grades_published_by");
ok(wsActions.includes("export async function unvalidateResults"), "unvalidate (reopen) exists for correction flows");

const adminActions = read("src/app/admin/examinations/actions.ts");
ok(adminActions.includes("currentSettings.results_validated !== true"), "admin publish also requires validation");
ok(adminActions.includes("export async function validateExamResultsAsAdmin"), "admin validation action exists");
ok(adminActions.includes('"exam.results_validated"'), "admin validation audited");

// ── UI: lifecycle stepper + gated buttons ──
const examPage = read("src/app/dashboard/exams/[id]/page.tsx");
ok(examPage.includes("<ResultLifecycle"), "exam workspace shows the lifecycle stepper");
ok(examPage.includes("action={validateResults}"), "validate button wired");
ok(examPage.includes("disabled={!settings.results_published && settings.results_validated !== true}"), "publish buttons disabled until validated");
const lifecycleComponent = read("src/components/exam/ResultLifecycle.tsx");
ok(lifecycleComponent.includes("aria-current={state === \"current\" ? \"step\" : undefined}"), "stepper exposes a11y step state");
const adminResultsPage = read("src/app/admin/examinations/results/page.tsx");
ok(adminResultsPage.includes("action={validateExamResultsAsAdmin}"), "admin results page validate button");
ok(adminResultsPage.includes("disabled={!published && !validated}"), "admin publish gated until validated");

// ── candidate invisibility: backend/API gates remain on results_published ──
const studentPage = read("src/app/student/page.tsx");
ok((studentPage.match(/results_published/g) ?? []).length >= 2, "student hub gates scores on results_published");
const stateRoute = read("src/app/api/exam/state/route.ts");
ok(stateRoute.includes("const resultsPublished = Boolean(settings.results_published)"), "state API computes publication server-side");
ok(stateRoute.includes("results_published: resultsPublished"), "state API exposes only the boolean flag");
const submitRoute = read("src/app/api/exam/submit/route.ts");
ok((submitRoute.match(/results_published/g) ?? []).length >= 2, "submit API keeps publication gates");
const resultToken = read("src/app/exam/result/[token]/page.tsx");
ok(resultToken.includes("results_published"), "token result page still gates on publication");
// The validation flag must never be the visibility gate (only publication is).
ok(!studentPage.includes("results_validated"), "student page does not leak validation state");

if (failures.length) {
  console.error(`publication-workflow: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`publication-workflow: ${checks} checks passed`);
