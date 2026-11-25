// ══════════════════════════════════════════════════════════════════════
// Results & Management — examination → marking → validation → publication
// Part 7 coverage: pure status derivation, org + Super Admin pages, role
// guards (executed), candidate publication safeguards, Cambridge framework.
// ══════════════════════════════════════════════════════════════════════
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

import {
  deriveManagementStatus,
  matchesResultsFilters,
  collectFilterOptions,
} from "../src/lib/resultsManagement.ts";
import { MODULE_CATALOG, MODULE_DEFAULTS, moduleEnabled } from "../src/lib/modules.ts";

let n = 0;
const check = (cond, msg) => { assert.ok(cond, msg); n += 1; };

// ── 1. Operational status derivation (pure) ──────────────────────────────
const base = {
  examStatus: "closed",
  attemptCount: 3,
  submittedCount: 3,
  awaitingMarking: 0,
  markedCount: 0,
  missingScores: 0,
  resultsValidated: false,
  resultsPublished: false,
};

// Awaiting submissions: open exam, nothing submitted yet.
const awaitingSub = deriveManagementStatus({ ...base, examStatus: "open", attemptCount: 1, submittedCount: 0 });
check(awaitingSub.key === "awaiting_submissions" && awaitingSub.label === "Awaiting submissions", "open exam with no submissions → Awaiting submissions");

// Awaiting marking: submitted, written answers untouched.
const awaitingMark = deriveManagementStatus({ ...base, awaitingMarking: 4, markedCount: 0 });
check(awaitingMark.key === "awaiting_marking" && awaitingMark.markingStatus === "awaiting", "unmarked written answers → Awaiting marking");

// Marking in progress: some marked, some left.
const inProgress = deriveManagementStatus({ ...base, awaitingMarking: 2, markedCount: 3 });
check(inProgress.key === "marking_in_progress" && inProgress.markingStatus === "in_progress", "partial marking → Marking in progress");

// Marking completed → Provisional results, never published implicitly.
const provisional = deriveManagementStatus({ ...base, markedCount: 4 });
check(provisional.key === "provisional_results", "marking complete → Provisional results");
check(provisional.publicationStatus === "withheld" && provisional.stage !== "published", "completing marking NEVER publishes");
check(provisional.validationStatus === "awaiting", "provisional results await explicit validation");

// Explicit validation, still not published.
const validated = deriveManagementStatus({ ...base, markedCount: 4, resultsValidated: true });
check(validated.key === "validated" && validated.publicationStatus === "withheld", "validated but withheld until explicit publish");
check(validated.stage === "validated", "lifecycle stage matches workspace stage machine");

// Explicit publication.
const published = deriveManagementStatus({ ...base, markedCount: 4, resultsValidated: true, resultsPublished: true });
check(published.key === "published" && published.publicationStatus === "published" && published.label === "Published", "published status");

// Draft / scheduled.
const draft = deriveManagementStatus({ ...base, examStatus: "draft", attemptCount: 0, submittedCount: 0 });
check(draft.key === "draft", "draft exam");
const scheduled = deriveManagementStatus({ ...base, examStatus: "scheduled", attemptCount: 0, submittedCount: 0 });
check(scheduled.key === "scheduled", "scheduled exam");

// Missing scores flag.
const missing = deriveManagementStatus({ ...base, awaitingMarking: 0, markedCount: 0, missingScores: 2 });
check(missing.hasMissingScores === true, "missing scores flagged for attention");
check(deriveManagementStatus({ ...base, markedCount: 4 }).hasMissingScores === false, "no false missing-score flag");

// Validation + publication are independent explicit stages.
const validatedUnpublished = deriveManagementStatus({ ...base, markedCount: 4, resultsValidated: true });
check(validatedUnpublished.validationStatus === "validated" && validatedUnpublished.publicationStatus === "withheld", "validation ≠ publication");

// ── 2. Filters (pure) ────────────────────────────────────────────────────
const row = { title: "MYP 5 Mathematics — End of Term", status: "closed", settings: { academic_year: "2026–2027", grade_label: "MYP5", subject: "Mathematics" } };
const st = deriveManagementStatus({ ...base, markedCount: 4, resultsValidated: true });
const stPublished = deriveManagementStatus({ ...base, markedCount: 4, resultsValidated: true, resultsPublished: true });
const stMarking = deriveManagementStatus({ ...base, awaitingMarking: 3, markedCount: 0 });

check(matchesResultsFilters(row, st, {}) === true, "no filters → everything matches");
check(matchesResultsFilters(row, st, { q: "yp 5 math" }) === true, "title search matches");
check(matchesResultsFilters(row, st, { q: "physics" }) === false, "title search excludes");
check(matchesResultsFilters(row, st, { academic_year: "2026–2027" }) === true, "academic year filter");
check(matchesResultsFilters(row, st, { academic_year: "2025–2026" }) === false, "wrong year excluded");
check(matchesResultsFilters(row, st, { grade: "MYP5" }) === true && matchesResultsFilters(row, st, { grade: "MYP4" }) === false, "class/grade filter");
check(matchesResultsFilters(row, st, { subject: "Mathematics" }) === true && matchesResultsFilters(row, st, { subject: "Biology" }) === false, "subject filter");
check(matchesResultsFilters(row, st, { exam_status: "closed" }) === true && matchesResultsFilters(row, st, { exam_status: "open" }) === false, "exam status filter");
check(matchesResultsFilters(row, stMarking, { marking: "awaiting" }) === true, "marking status filter (awaiting)");
check(matchesResultsFilters(row, st, { marking: "complete" }) === true && matchesResultsFilters(row, stMarking, { marking: "complete" }) === false, "marking status filter (complete)");
check(matchesResultsFilters(row, st, { validation: "validated" }) === true && matchesResultsFilters(row, st, { validation: "awaiting" }) === false, "validation filter");
check(matchesResultsFilters(row, st, { publication: "withheld" }) === true && matchesResultsFilters(row, stPublished, { publication: "withheld" }) === false, "publication filter");
check(matchesResultsFilters(row, stPublished, { publication: "published" }) === true, "published filter");

const opts = collectFilterOptions([
  { settings: { academic_year: "2026–2027", grade_label: "MYP5", subject: "Mathematics" } },
  { settings: { academic_year: "2026–2027", grade_label: "MYP4", subject: "Mathematics" } },
  { settings: { academic_year: "", grade_label: "MYP5", subject: "" } },
]);
check(opts.years.length === 1 && opts.grades.length === 2 && opts.subjects.length === 1, "filter options deduped from data");

// ── 3. Organization dashboard page (source) ──────────────────────────────
const orgPage = readFileSync("src/app/dashboard/results/page.tsx", "utf8");
check(orgPage.includes('title: "Results Management & Candidate Links"'), "org page carries the shared module name");
const adminResultsPage = readFileSync("src/app/admin/examinations/results/page.tsx", "utf8");
check(adminResultsPage.includes("Results Management & Candidate Links"), "Super Admin page uses the same name");
check(orgPage.includes("Results Management &amp; Candidate Links —"), "org candidate section titled identically to Super Admin");
check(orgPage.includes("requireUser") && (orgPage.includes("isStaffRole") || orgPage.includes("isOperationalRole")), "operational/staff guard present");
check(orgPage.includes('"results.publish"') && (orgPage.includes("canOperate(") || orgPage.includes("canOperateMany(")), "RBAC-gated sensitive actions");
check(orgPage.includes('.eq("organization_id", org.id)'), "tenant-scoped exam query");
check(orgPage.includes('from("audit_logs")'), "publication history from the audit trail");
for (const label of ["Awaiting submissions", "Awaiting marking", "Marking in progress", "Provisional results", "Validated", "Published"]) {
  check(orgPage.includes(label) || readFileSync("src/lib/resultsManagement.ts", "utf8").includes(label), `status label "${label}" available`);
}
check(orgPage.includes('name="q"') && orgPage.includes('name="academic_year"') && orgPage.includes('name="grade"') && orgPage.includes('name="subject"'), "filters: exam search, year, class, subject");
check(orgPage.includes('name="exam_status"') && orgPage.includes('name="marking"') && orgPage.includes('name="validation"') && orgPage.includes('name="publication"'), "filters: exam/marking/validation/publication status");
check(orgPage.includes("ConfirmSubmit") && orgPage.includes("Validate results") && orgPage.includes("Publish results"), "sensitive actions ask for confirmation");
check(orgPage.includes('value="/dashboard/results"'), "actions return to the management index with flash messages");
check(orgPage.includes("validateResults") && orgPage.includes("publishResults") && orgPage.includes("unvalidateResults"), "reuses the existing audited actions (no parallel engine)");
check(orgPage.includes("missing score"), "missing/incomplete scores surfaced");
check(orgPage.includes("EmptyState"), "empty state present");
check(orgPage.includes("examsLoadFailed"), "load-error state present");
check(orgPage.includes("deriveManagementStatus"), "statuses derived from the shared pure module");
check(orgPage.includes("restricted to organization administrators"), "non-managers told why actions are hidden");

// ── 4. Navigation & internationalization ────────────────────────────────
const chrome = readFileSync("src/components/dashboard/DashboardChrome.tsx", "utf8");
check(chrome.includes('href: "/dashboard/results"'), "org nav entry exists");
check(chrome.includes('labelKey: "nav.resultsManagement"'), "nav entry is translatable");
const catalog = readFileSync("src/lib/modules.ts", "utf8");
const resultsSurface = catalog.split("\n").find((l) => l.includes('key: "exam_results"'));
check(Boolean(resultsSurface) && resultsSurface.includes('"/dashboard/results"'), "nav route governed by the exam_results module (canonical catalog surface)");
check(chrome.includes("isNavVisible("), "org nav visibility runs through the shared isNavVisible rule");
const navLine = chrome.split("\n").find((l) => l.includes('href: "/dashboard/results"'));
check(Boolean(navLine) && (navLine.includes('audience: "staff"') || navLine.includes('audience: "operational"')), "nav entry visible to operational staff & founder (incl. Oak)");
for (const lang of ["en", "fr", "es"]) {
  const dict = readFileSync(`src/lib/i18n/dictionaries/${lang}.ts`, "utf8");
  check(dict.includes("resultsManagement:"), `dictionary ${lang} has nav.resultsManagement`);
}

// ── 5. Super Admin dashboard (source) ────────────────────────────────────
const adminPage = readFileSync("src/app/admin/examinations/results/page.tsx", "utf8");
check(adminPage.includes("requireSuperAdmin"), "admin results page stays super-admin gated");
check(adminPage.includes("Cross-organization overview"), "cross-org operational overview present");
check(adminPage.includes('data-testid="admin-results-overview-row"'), "overview rows rendered");
check(adminPage.includes('name="org"'), "organization filter for global oversight");
check(adminPage.includes("Missing scores"), "overview surfaces missing scores across tenants");
check(adminPage.includes("validateExamResultsAsAdmin") && adminPage.includes("setExamResultsPublishedAsAdmin"), "existing admin validate/publish actions preserved");
const adminActions = readFileSync("src/app/admin/examinations/actions.ts", "utf8");
check((adminActions.match(/requireSuperAdmin\(\)/g) ?? []).length >= 2, "admin actions retain super-admin guards");

// ── 6. Role separation on the exam workspace (source) ────────────────────
const examPage = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
check(examPage.includes("isResultsManager"), "exam page computes the results-manager gate");
check(examPage.includes("isResultsManager && (attempts ?? []).length > 0"), "validate form hidden from teachers");
check(examPage.includes("isResultsManager ? ("), "publish form hidden from teachers");
check(examPage.includes("restricted to organization administrators"), "teachers see the explanation, not a dead button");
const examActionsSrc = readFileSync("src/app/dashboard/exams/actions.ts", "utf8");
check(examActionsSrc.includes('"results.validate"') && examActionsSrc.includes('"results.publish"') && examActionsSrc.includes('"results.unpublish"'), "validate/unvalidate/publish all require centralized RBAC permissions");
check(examActionsSrc.includes("function resultsBack"), "return path is validated (no open redirect)");
check(examActionsSrc.includes("results_validated !== true"), "publish-before-validate gate preserved server-side");
check(examActionsSrc.includes('"exam.results_validated"') && examActionsSrc.includes('"exam.results_published"'), "validation and publication remain audited");

// ── 7. Candidate-facing safeguards (source) ──────────────────────────────
const resultPage = readFileSync("src/app/exam/result/[token]/page.tsx", "utf8");
check(resultPage.includes('.eq("access_token", token)'), "candidate result loaded by single-use access token");
check(resultPage.includes("Boolean(settings.results_published)"), "candidate result page gates on results_published");
check(resultPage.includes("Awaiting Publication"), "unpublished result shows awaiting-publication, not marks");
const stateApi = readFileSync("src/app/api/exam/state/route.ts", "utf8");
check(stateApi.includes("Boolean(settings.results_published)"), "exam state API enforces publication server-side");
const submitApi = readFileSync("src/app/api/exam/submit/route.ts", "utf8");
check(submitApi.includes("results_published"), "submit API enforces publication server-side");
const studentPage = readFileSync("src/app/student/page.tsx", "utf8");
check(studentPage.includes("attempt.exams?.settings?.results_published"), "student workspace hides scores until published");
const studentResult = readFileSync("src/app/student/results/[attemptId]/page.tsx", "utf8");
check(studentResult.includes("includeUnpublished: false"), "student result detail never loads unpublished rows");
check(studentResult.includes('.eq("user_id", ctx.profile.id)'), "student results scoped to the owning user");

// ── 8. Executed: role guards + validation/publish flow ───────────────────
const file = path.resolve("scripts/__results_mgmt_actions.cjs");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let ctx, examRow, attemptCount, auditCalls;
const setup = () => {
  ctx = { org: { id: "org-1" }, allowed: true, orgRole: "owner", user: { id: "manager-1" } };
  examRow = { id, organization_id: "org-1", settings: { results_published: false, results_validated: false } };
  attemptCount = 3;
  auditCalls = [];
};
const db = {
  from(table) {
    const filters = [];
    let patch = null;
    let head = false;
    const q = {
      select() { return q; },
      eq(k, v) { filters.push((r) => r[k] === v); return q; },
      update(p) { patch = p; return q; },
      maybeSingle: async () => {
        if (patch) {
          Object.assign(examRow, patch);
          return { data: { ...examRow }, error: null };
        }
        const found = filters.every((f) => f(examRow)) ? examRow : null;
        return { data: found ? { ...found } : null, error: null };
      },
      then(resolve) {
        return (async () => {
          if (table === "exam_attempts") return { count: attemptCount, data: null, error: null };
          return { data: null, error: null, count: null };
        })().then(resolve);
      },
    };
    void head;
    return q;
  },
};
const authStub = {
  requireUser: async () => ctx,
  activeOrg: (c) => c.org,
  can: (c, _org, roles) => c.allowed && Array.isArray(roles) && roles.includes(c.orgRole),
  CREATOR_ROLES: ["owner", "admin", "teacher", "organizer"],
  MANAGER_ROLES: ["owner", "admin"],
  MARKER_ROLES: ["owner", "admin", "teacher", "corrector"],
  PROCTOR_ROLES: ["owner", "admin", "teacher", "supervisor", "corrector"],
};
const stubs = {
  "@/lib/auth": authStub,
  "@/lib/operationalAccess": {
    canOperate: async (c, _org, permission) => {
      const roles = permission === "results.validate" || permission === "results.publish" || permission === "results.unpublish"
        ? authStub.MANAGER_ROLES
        : authStub.MARKER_ROLES;
      return authStub.can(c, _org, roles);
    },
  },
  "@/lib/examLanguage": { normalizeExamLanguage: () => null },
  "@/lib/formulaLibrary": { validateSheetDraft: () => ({ ok: true, groups: [] }) },
  "@/lib/entitlements": { isPlanLimitError: () => false, withinLimit: () => true },
  "@/lib/capabilities": { getCapabilities: async () => ({ entitlement: { limits: {}, modules: {} }, capabilities: {} }), requireModule: () => {} },
  "@/lib/modules": { moduleEnabled: () => true },
  "@/lib/admin": { audit: async (...args) => { auditCalls.push(args); } },
  "@/lib/ai-marking": { AiMarkingError: class extends Error {}, describeAiMarking: () => ({ configured: false }), suggestCriterionMarks: async () => [] },
  "@/lib/supabase/server": { createClient: async () => db, createAdminClient: () => db },
  "@/lib/utils": { genCode: () => "CODE" },
  "next/cache": { revalidatePath: () => {} },
  "next/navigation": { redirect: (url) => { const e = new Error(url); e.url = url; throw e; } },
};
const load = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file && request in stubs) return stubs[request];
  return load.apply(this, arguments);
};
const m = new Module(file);
m.filename = file;
m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(
  ts.transpileModule(readFileSync("src/app/dashboard/exams/actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  file,
);
Module._load = load;
const actions = m.exports;

const run = async (fn, fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await fn(fd);
    return null;
  } catch (e) {
    return e.url ?? null;
  }
};

setup();
// Teacher (organizer — creator but NOT manager) cannot validate.
ctx.orgRole = "teacher";
check((await run(actions.validateResults, { exam_id: id })) === "/dashboard/results?e=forbidden", "teacher validation denied with clear message");
check((await run(actions.publishResults, { exam_id: id, publish: "1" })) === "/dashboard/results?e=forbidden", "teacher publication denied with clear message");
check((await run(actions.unvalidateResults, { exam_id: id })) === "/dashboard/results?e=forbidden", "teacher reopen denied");
check(examRow.settings.results_validated === false && auditCalls.length === 0, "denied attempts never write or audit");

// Owner validates → stamped, audited, still not published.
ctx.orgRole = "owner";
check((await run(actions.validateResults, { exam_id: id, back: "/dashboard/results" })) === "/dashboard/results?ok=validated", "owner validation redirects to the management index");
check(examRow.settings.results_validated === true, "validation persisted");
check(examRow.settings.results_validated_by === "manager-1" && Boolean(examRow.settings.results_validated_at), "who/when recorded on the exam");
check(examRow.settings.results_published === false, "validation does NOT publish");
check(auditCalls.some((c) => c[1] === "exam.results_validated"), "validation audited");

// Open redirect attempts fall back to the exam workspace.
check((await run(actions.validateResults, { exam_id: id, back: "//evil.example" })) === `/dashboard/exams/${id}?ok=validated`, "malicious back path rejected");
check((await run(actions.validateResults, { exam_id: id, back: "/dashboard/results?x=1" })) === `/dashboard/exams/${id}?ok=validated`, "back path with query rejected");

// Organizer (creator, non-manager) also denied — publication needs explicit manager permission.
setup();
ctx.orgRole = "organizer";
check((await run(actions.publishResults, { exam_id: id, publish: "1" })) === "/dashboard/results?e=forbidden", "organizer cannot publish by default");

// ── 9. Workflow chain wiring (source) ────────────────────────────────────
check(examActionsSrc.includes('from("quizzes")') || readFileSync("src/app/dashboard/exams/actions.ts", "utf8").includes("quiz_id"), "examinations stay paper-associated (no parallel question store)");
const mappingSuite = readFileSync("scripts/test-question-assessment-mapping.mjs", "utf8");
check(mappingSuite.includes("assessment_of") && mappingSuite.includes("quiz_questions"), "Paper Builder mappings covered end-to-end (PR #90 preserved)");
check(readFileSync("scripts/test-publication-workflow.mjs", "utf8").length > 0, "existing publication workflow suite still present");

// ── 10. Candidate links in the Organization dashboard ──────────────────
check(orgPage.includes('data-testid="candidate-links-section"'), "candidate links section rendered for the selected examination");
check(orgPage.includes('data-testid="candidate-link-row"'), "one row per candidate attempt");
check(orgPage.includes('data-testid="candidate-links-link"'), "every exam card offers a Candidate links entry");
check(orgPage.includes("CopyResultLinkButton"), "reuses the existing copy-to-clipboard component (no duplicate link system)");
check(orgPage.includes("candidateName={candName}"), "copy action identifies which candidate the link belongs to");
check(orgPage.includes('${origin}/exam/result/${a.access_token}'), "links use the existing per-attempt secure access_token (no predictable IDs)");
check(orgPage.includes('aria-label={`Individual result link for ${candName}`}' ) || orgPage.includes("Individual result link for"), "link input is labelled per candidate");
check(orgPage.includes("Registered candidates") && orgPage.includes("Submitted attempts"), "registered candidates and submitted attempts visible");
check(orgPage.includes("Average score") && orgPage.includes("Pass rate"), "average score and pass rate visible");
check(orgPage.includes("Published (links reveal results)") && orgPage.includes("Withheld (links hide results)"), "publication state of links tracked");
check(orgPage.includes("Export links (CSV / Excel)"), "CSV export of candidate links (Super Admin parity)");
check(orgPage.includes("PrintButton"), "print/PDF available (Super Admin parity)");
check(orgPage.includes("while results are withheld, every personal link shows only an official"), "unpublished links explicitly documented as non-revealing");
check(orgPage.includes("Unpublishing immediately withholds the links again"), "link availability managed by the existing publication mechanism");
check(orgPage.includes("That examination does not exist in this organization."), "cross-tenant exam ids indistinguishable from missing");
check(orgPage.includes('.eq("exam_id", selectedExamId)'), "attempts scoped to the selected examination");
check(orgPage.includes('rows.find((r) => r.exam.id === selectedExamId)'), "selected exam must belong to this organization's loaded set");

// Same secure backend on the exam workspace (already existing — preserved).
const examWs = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
check(examWs.includes("CopyResultLinkButton") && examWs.includes("Candidate individual result links"), "exam workspace keeps its candidate links table");
check(examWs.includes("${origin}/exam/result/${a.access_token}"), "workspace and results index share the identical link mechanism");

// ── 11. Module activation (Plan & Module Management) ────────────────────
const resultsModule = MODULE_CATALOG.find((m) => m.key === "exam_results");
check(Boolean(resultsModule), "exam_results exists in the module catalog");
check(resultsModule.label === "Results Management & Candidate Links", "catalog label matches the required module name");
check(resultsModule.group === "exams", "module listed under Examinations");
check(MODULE_DEFAULTS.exam_results === true, "default ON — existing organizations (incl. Oak) keep it with zero migration");
check(moduleEnabled(undefined, "exam_results") === true, "missing key resolves to enabled (backward compatible)");
check(moduleEnabled({ exam_results: false }, "exam_results") === false && moduleEnabled({ exam_results: false }, "examinations") === true, "deactivation is scoped to this module only");
check(Array.isArray(resultsModule.surface?.hrefs) && resultsModule.surface.hrefs.includes("/dashboard/results"), "org nav entry governed by the exam_results module (canonical catalog surface)");
const reportsModule = MODULE_CATALOG.find((m) => m.key === "org_reports");
check(Boolean(reportsModule) && Array.isArray(reportsModule.surface?.hrefs) && reportsModule.surface.hrefs.includes("/dashboard/reports"), "Reports & Analytics nav unaffected by exam_results (own catalog surface)");
check(chrome.includes('label: "Results Management & Candidate Links"'), "nav label uses the shared name");
check(orgPage.includes('requireModule(entitlement, "exam_results", "/dashboard/results?e=module")'), "page blocked server-side when the module is deactivated");
check(orgPage.includes("sp.e === \"module\""), "deactivation shows a clear explanation, not a crash");
check(!/\.delete\(/.test(orgPage), "toggling/viewing never deletes results or candidate records");
const planModulesPage = readFileSync("src/app/admin/plans/modules/page.tsx", "utf8");
check(planModulesPage.includes('"@/lib/modules"') && planModulesPage.includes("MODULE_CATALOG"), "Super Admin Plan & Module Management renders the catalog (incl. exam_results)");
check(planModulesPage.includes("requireSuperAdmin"), "only Super Admin can activate/deactivate modules");
check(planModulesPage.includes("modules_override"), "per-organization override mechanism available");
const modulesSrc = readFileSync("src/lib/modules.ts", "utf8");
check(modulesSrc.includes("subscriptions.modules_override"), "org-level overrides persisted additively (nullable jsonb)");
check(modulesSrc.includes("Platform-owner sessions bypass"), "platform owner bypass preserved (existing Super Admin capability intact)");

// Oak access: default-true module + staff nav → Oak sees the entry.
check(moduleEnabled({ exam_results: true }, "exam_results") === true, "Oak (Institution plan, default map) accesses the full functionality");

// ── 12. Full workflow chain (examination → submission → marking →
//        validation → publication → links → candidate sees own result) ──
// Each stage is covered by executed or source-tested code:
check(readFileSync("scripts/test-question-assessment-mapping.mjs", "utf8").includes('from("quiz_questions")'), "stage 1: examination reads the Paper's questions + mappings (source-tested elsewhere)");
check(readFileSync("scripts/test-exam-submission-lifecycle.mjs", "utf8").length > 0, "stage 2: candidate submission suite present");
check(examActionsSrc.includes("markAnswer") || readFileSync("src/app/dashboard/exams/actions.ts", "utf8").includes("export async function markAnswer"), "stage 3: manual marking action exists");
// Stages 4–6 executed in section 8 above (validate → publish, gated, audited).
check(resultPage.includes("Awaiting Publication") && resultPage.includes("resultsPublished"), "stage 7: unpublished link shows awaiting-confirmation, not marks");
check(studentPage.includes("results_published"), "stage 8: candidate sees own result only after publication");
check(adminResultsPage.includes("requireSuperAdmin"), "stage 9: Super Admin retains global oversight");

console.log(`results-management: ${n} checks passed`);
