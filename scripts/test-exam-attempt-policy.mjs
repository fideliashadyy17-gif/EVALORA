/**
 * Compile the real production modules to CommonJS and load them.
 *
 * The sources use extensionless relative imports and some `.ts` specifiers,
 * which Node's ESM loader cannot resolve, so each file is transpiled on the
 * fly into a flat CJS tree with every relative specifier normalised. Nothing
 * is mocked: the tests below assert the shipped logic.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const outDir = "/tmp/evalora-attempt-policy-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`);

const built = new Set();
function build(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const source = readFileSync(rel, "utf8");
  const emitted = ts.transpileModule(source, {
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
  for (const dep of deps) {
    build(path.join(path.dirname(rel), `${dep.replace(/\.ts$/, "")}.ts`));
  }
}
for (const entry of ["src/lib/examRetake.ts", "src/lib/exam-access.ts", "src/lib/responseTools.ts", "src/lib/live.ts"]) {
  build(entry);
}

const require = createRequire(import.meta.url);
const retake = require(`${outDir}/lib/examRetake.js`);
const access = require(`${outDir}/lib/exam-access.js`);
const tools = require(`${outDir}/lib/responseTools.js`);
const live = require(`${outDir}/lib/live.js`);

let passed = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── The paper's own attempt policy ────────────────────────────────── */
ok("a paper defaults to limited attempts with a single attempt",
  access.parseExamAccessSettings({}).attemptMode === "limited"
  && access.parseExamAccessSettings({}).maxAttempts === 1);
ok("unlimited attempts is stored as a mode, not a huge number",
  access.parseExamAccessSettings({ attempt_mode: "unlimited" }).attemptMode === "unlimited");
ok("an unknown attempt mode falls back to limited, never unlimited",
  access.parseExamAccessSettings({ attempt_mode: "forever" }).attemptMode === "limited");
ok("a limited bound is clamped to the schema ceiling",
  access.parseExamAccessSettings({ max_attempts: 500 }).maxAttempts === access.MAX_LIMITED_ATTEMPTS);
ok("a non-numeric limited bound falls back to one attempt",
  access.parseExamAccessSettings({ max_attempts: "many" }).maxAttempts === 1);
ok("a fractional bound is floored, never rounded up",
  access.parseExamAccessSettings({ max_attempts: 3.9 }).maxAttempts === 3);
ok("the exam access parse exposes every other setting it did before",
  access.parseExamAccessSettings({ access_mode: "registered_students_only" }).accessMode === "registered_students_only");

/* ── Grant ceiling: what an approval authorizes ─────────────────────── */
ok("null and undefined mean unlimited, not zero attempts",
  retake.grantCeiling(null).unlimited === true
  && retake.grantCeiling(undefined).unlimited === true
  && retake.grantCeiling("").unlimited === true);
ok("a numeric grant is limited and clamped to the schema ceiling",
  retake.grantCeiling(5).unlimited === false
  && retake.grantCeiling(5).granted === 5
  && retake.grantCeiling(999).granted === retake.MAX_GRANTED_ATTEMPTS
  && retake.grantCeiling(999).unlimited === false);
ok("a grant of zero or a negative becomes one attempt, never unlimited",
  retake.grantCeiling(0).granted === 1
  && retake.grantCeiling(0).unlimited === false
  && retake.grantCeiling(-4).granted === 1);
ok("an unreadable grant is unlimited rather than silently one attempt",
  retake.grantCeiling("lots").unlimited === true);
ok("the schema ceiling is 20, matching the Limited Attempts bound",
  retake.MAX_GRANTED_ATTEMPTS === 20
  && retake.MAX_GRANTED_ATTEMPTS === access.MAX_LIMITED_ATTEMPTS);

const now = new Date("2026-11-10T12:00:00.000Z");
const approved = {
  status: "approved",
  retake_code: "ABCDEFGHJK",
  retake_code_consumed_at: null,
  access_expires_at: "2026-11-17T12:00:00.000Z",
};

ok("an unlimited grant reports unbounded remaining attempts",
  retake.usableGrant({ ...approved, granted_attempts: null }, { attemptsUsed: 7, now })?.remaining === Number.POSITIVE_INFINITY);
ok("a limited grant counts down and stops at zero",
  retake.usableGrant({ ...approved, granted_attempts: 3 }, { attemptsUsed: 1, now })?.remaining === 2
  && retake.usableGrant({ ...approved, granted_attempts: 3 }, { attemptsUsed: 3, now })?.remaining === 0);
ok("the retake state machine treats an unlimited grant as still active after many uses",
  retake.retakeState({
    attemptStatus: "submitted",
    attemptNumber: 6,
    requests: [{ id: "r", status: "approved", created_at: "2026-11-09T10:00:00Z", granted_attempts: null, access_expires_at: "2026-11-20T12:00:00Z" }],
    attemptsUsedByRequest: { r: 5 },
    now,
  }).canStartAuthorizedRetake === true);
ok("the retake state machine still locks a limited grant once it is used up",
  retake.retakeState({
    attemptStatus: "submitted",
    attemptNumber: 2,
    requests: [{ id: "r2", status: "approved", created_at: "2026-11-09T10:00:00Z", granted_attempts: 2, access_expires_at: "2026-11-20T12:00:00Z" }],
    attemptsUsedByRequest: { r2: 2 },
    now,
  }).canStartAuthorizedRetake === false);
ok("an unlimited grant is still bounded by its access window",
  retake.retakeAccessProblem({ ...approved, granted_attempts: null, access_expires_at: "2026-11-09T12:00:00.000Z" }, 0, now) === "expired");

/* ── What the Super Admin's form can authorize ──────────────────────── */
ok("the approval form accepts 'unlimited' as a mode, stored as null",
  retake.normalizeGrantedAttempts("unlimited") === null
  && retake.normalizeGrantedAttempts("UNLIMITED") === null);
ok("the approval form clamps a limited bound to the schema ceiling",
  retake.normalizeGrantedAttempts(12) === 12
  && retake.normalizeGrantedAttempts(50) === retake.MAX_GRANTED_ATTEMPTS);
ok("the approval form still defaults an empty or broken value to one attempt",
  retake.normalizeGrantedAttempts(null) === 1
  && retake.normalizeGrantedAttempts("abc") === 1
  && retake.normalizeGrantedAttempts(0) === 1);

/* ── A restart the paper itself authorizes ──────────────────────────── */
const submittedOnce = { attemptStatus: "submitted", attemptNumber: 1, requests: [], now };

ok("a one-attempt paper still locks after submission and asks for approval",
  retake.retakeState(submittedOnce).canStartAuthorizedRetake === false
  && retake.retakeState(submittedOnce).canRequest === true
  && retake.retakeState(submittedOnce).policyAllowsRestart === false);

const unlimitedPaper = { ...submittedOnce, attemptMode: "unlimited" };
ok("an unlimited paper lets the candidate start again without an approval",
  retake.retakeState(unlimitedPaper).canStartAuthorizedRetake === true
  && retake.retakeState(unlimitedPaper).policyAllowsRestart === true);
ok("an unlimited paper does not send the candidate to ask for a redundant retake",
  retake.retakeState(unlimitedPaper).canRequest === false);
ok("the unlimited copy names the next attempt",
  /second attempt/i.test(retake.retakeState(unlimitedPaper).message));
ok("an unlimited paper has no grant row, because no approval was involved",
  retake.retakeState(unlimitedPaper).grant === null);
ok("an unlimited paper keeps working after many sittings",
  retake.retakeState({ ...unlimitedPaper, attemptNumber: 9 }).canStartAuthorizedRetake === true);
ok("an unlimited paper still stops at the attempt-number ceiling",
  retake.retakeState({ ...unlimitedPaper, attemptNumber: retake.MAX_GRANTED_ATTEMPTS }).canStartAuthorizedRetake === false);

ok("a limited paper authorizes restarts up to its bound",
  retake.retakeState({ ...submittedOnce, attemptMode: "limited", maxAttempts: 3 }).canStartAuthorizedRetake === true
  && retake.retakeState({ ...submittedOnce, attemptMode: "limited", maxAttempts: 3, attemptNumber: 2 }).canStartAuthorizedRetake === true
  && retake.retakeState({ ...submittedOnce, attemptMode: "limited", maxAttempts: 3, attemptNumber: 3 }).canStartAuthorizedRetake === false);
ok("a used-up limited paper explains that the bound was reached",
  /3 attempts/.test(retake.retakeState({ ...submittedOnce, attemptMode: "limited", maxAttempts: 3, attemptNumber: 3 }).message));
ok("a broken maxAttempts never becomes an unlimited paper",
  retake.retakeState({ ...submittedOnce, attemptMode: "limited", maxAttempts: "many" }).canStartAuthorizedRetake === false
  && retake.retakeState({ ...submittedOnce, attemptMode: "limited", maxAttempts: 0 }).canStartAuthorizedRetake === false);

ok("a paper still in progress never offers a restart",
  retake.retakeState({ ...unlimitedPaper, attemptStatus: "in_progress" }).canStartAuthorizedRetake === false
  && retake.retakeState({ ...unlimitedPaper, attemptStatus: "in_progress" }).canRequest === false);
ok("a pending retake request still takes precedence over the paper's policy",
  retake.retakeState({
    ...unlimitedPaper,
    requests: [{ id: "r", status: "pending", created_at: "2026-11-10T10:00:00Z" }],
  }).canStartAuthorizedRetake === false);
ok("an approval in its window still takes precedence over the paper's policy",
  retake.retakeState({
    ...unlimitedPaper,
    requests: [{
      id: "ra", status: "approved", created_at: "2026-11-09T10:00:00Z",
      granted_attempts: 1, access_expires_at: "2026-11-20T12:00:00Z",
    }],
  }).policyAllowsRestart === false);

/* ── Per-question calculator ────────────────────────────────────────── */
const openEnded = {
  type: "open_ended",
  prompt: "Explain why the sequence converges.",
  prompt_doc: null,
  config: {},
};
ok("a calculator is off unless the paper enables it",
  tools.responseWorkspaceFor(openEnded).calculator.enabled === false);
ok("a paper that permits a calculator permits it by default",
  tools.responseWorkspaceFor(openEnded, { calculatorByDefault: true }).calculator.enabled === true);
ok("a question can override the paper and switch the calculator off",
  tools.responseWorkspaceFor({ ...openEnded, config: { calculator: false } }, { calculatorByDefault: true }).calculator.enabled === false);
ok("a question can switch the calculator on even when the paper does not",
  tools.responseWorkspaceFor({ ...openEnded, config: { calculator: true } }).calculator.enabled === true);
ok("calculator_policy: 'not_permitted' overrides the paper default",
  tools.responseWorkspaceFor({ ...openEnded, config: { calculator_policy: "not_permitted" } }, { calculatorByDefault: true }).calculator.enabled === false);
ok("calculator_policy: 'required' keeps the calculator on",
  tools.responseWorkspaceFor({ ...openEnded, config: { calculator_policy: "required" } }).calculator.enabled === true);
ok("an explicit question setting wins over the policy string",
  tools.responseWorkspaceFor({ ...openEnded, config: { calculator: true, calculator_policy: "not_permitted" } }).calculator.enabled === true);
ok("scientific mode is opt-in per question",
  tools.responseWorkspaceFor({ ...openEnded, config: { calculator: true } }).calculator.scientific === false
  && tools.responseWorkspaceFor({ ...openEnded, config: { calculator: true, calculator_scientific: true } }).calculator.scientific === true);
ok("the calculator is an aid, not one of the composition tools",
  tools.responseWorkspaceFor({ ...openEnded, config: { calculator: true } }, { calculatorByDefault: true }).tools.includes("calculator") === false);

/* ── Public question payload ────────────────────────────────────────── */
const row = (overrides = {}) => ({
  id: "qq-1",
  question_id: "q-1",
  position: 0,
  points: null,
  time_limit_seconds: null,
  questions: {
    id: "q-1",
    type: "single_choice",
    prompt: "What is $2+2$?",
    prompt_doc: null,
    explanation: "Two plus two equals four.",
    explanation_doc: null,
    points: 4,
    config: { myp_criterion: "A", question_number: 7, paper_section: "A", difficulty_level: "standard", marks: 4 },
    question_options: [
      { id: "o-wrong", label: "3", content_doc: null, is_correct: false, position: 0 },
      { id: "o-correct", label: "4", content_doc: null, is_correct: true, position: 1 },
    ],
  },
  ...overrides,
});

const pubOff = live.publicQuestion(row(), {});
ok("the calculator flag is always present on the public question", typeof pubOff.calculator === "boolean");
ok("the calculator is off when the paper does not permit one", pubOff.calculator === false);
ok("the calculator is on for every question of a calculator paper",
  live.publicQuestion(row(), { calculatorByDefault: true }).calculator === true);
ok("a question may opt out of a calculator paper",
  live.publicQuestion(row({ questions: { ...row().questions, config: { ...row().questions.config, calculator: false } } }), { calculatorByDefault: true }).calculator === false);
ok("the calculator flag never carries answer material",
  !JSON.stringify(live.publicQuestion(row({ questions: { ...row().questions, config: { calculator: true, accepted_answers: ["4"] } } }), {})).includes("accepted_answers"));

ok("question metadata is published so the paper reads as the source paper does",
  pubOff.question_meta.criterion === "A"
  && pubOff.question_meta.criterion_label === "Criterion A"
  && pubOff.question_meta.question_number === 7
  && pubOff.question_meta.marks === 4
  && pubOff.question_meta.difficulty_level === "standard");
ok("question metadata falls back to the row's own marks",
  live.publicQuestion(row({ questions: { ...row().questions, config: {} }, points: 6 }), {}).question_meta.marks === 6);
ok("question metadata is null-safe when the config carries nothing",
  live.publicQuestion(row({ questions: { ...row().questions, config: {} } }), {}).question_meta.criterion === null);

/* ── Route and interface wiring ─────────────────────────────────────── */
const read = (rel) => readFileSync(rel, "utf8");
const retakeRoute = read("src/app/api/exam/retake/route.ts");
const panel = read("src/app/take-exam/[attemptId]/RetakePanel.tsx");
const invitations = read("src/app/admin/examinations/invitations/page.tsx");
const eventOps = read("src/app/admin/actions/event-operations.ts");

const loaderCalls = (retakeRoute.match(/await loadRetakeStateForCandidate\(/g) ?? []).length;
const wiredCalls = (retakeRoute.match(/examSettings: exam\.settings/g) ?? []).length;
ok("every retake state load passes the examination's attempt policy",
  loaderCalls > 0 && wiredCalls === loaderCalls);
ok("the start action accepts a restart the paper authorizes, not just an approval",
  /!grant && !state\.policyAllowsRestart/.test(retakeRoute)
  && /grant: grant \?\? null/.test(retakeRoute));
ok("the public retake state exposes whether the policy allows a restart",
  /policy_allows_restart: state\.policyAllowsRestart/.test(retakeRoute));
ok("the student panel offers a start button for a policy restart",
  /policy_allows_restart/.test(panel) && /Start another attempt/.test(panel));
ok("an unlimited approval is not hidden behind a remaining count",
  /grant\.unlimited \|\| view\.grant\.remaining === null/.test(panel));
ok("an organizer can choose Limited or Unlimited Attempts per paper",
  /name="attempt_mode"/.test(invitations) && /Unlimited Attempts/.test(invitations));
ok("the organizer's choice is persisted onto the examination settings",
  /settings\.attempt_mode = normalizeAttemptMode/.test(eventOps)
  && /settings\.max_attempts = normalizeMaxAttempts/.test(eventOps));

const migration = read("supabase/migrations/0120_exam_attempt_policy.sql");
ok("the migration widens the grant column instead of dropping rows or policies",
  /drop constraint if exists exam_retake_requests_granted_attempts_check/.test(migration)
  && /check \(granted_attempts is null or granted_attempts between 1 and 20\)/.test(migration)
  && !/drop table|truncate|delete from/i.test(migration));
ok("the migration keeps the student insert policy's ownership check",
  /requested_by = auth\.uid\(\)/.test(migration)
  && /s\.user_id = auth\.uid\(\)/.test(migration));

console.log(`\n${passed} attempt-policy checks passed (real modules, no DB/browser).`);
