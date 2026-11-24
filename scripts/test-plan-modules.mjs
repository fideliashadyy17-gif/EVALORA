// Plan & Module Management — catalog, resolution order, enforcement wiring.
//
//   node scripts/test-plan-modules.mjs
//
// Runs the REAL src/lib/modules.ts (transpiled) plus source-level enforcement
// assertions: entitlements resolve → capabilities AND → nav filter → page and
// action guards → admin console save path.
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

// ── transpile the real module catalog ──
mkdirSync(".tmp-test-modules", { recursive: true });
const build = spawnSync(
  "npx",
  ["tsc", "src/lib/modules.ts", "--target", "es2022", "--module", "commonjs", "--skipLibCheck", "--outDir", ".tmp-test-modules"],
  { encoding: "utf8" },
);
ok(build.status === 0, `tsc transpile of modules.ts failed: ${String(build.stderr).slice(0, 400)}`);
const M = require(`${process.cwd()}/.tmp-test-modules/modules.js`);

// 1. Catalog integrity + defaults all-true (zero regression).
ok(Array.isArray(M.MODULE_CATALOG) && M.MODULE_CATALOG.length >= 40, `catalog size ${M.MODULE_CATALOG.length} >= 40`);
const keys = M.MODULE_CATALOG.map((m) => m.key);
ok(new Set(keys).size === keys.length, "module keys are unique");
ok(keys.every((k) => typeof M.MODULE_DEFAULTS[k] === "boolean"), "every key has a default");
ok(keys.every((k) => M.MODULE_DEFAULTS[k] === true), "ALL defaults are true (pre-existing plans unchanged)");

// 2. Brief-mandated modules present (assessments/competitions, quizzes, exams + retained).
const required = [
  // assessments & competitions
  "competitions", "competition_config", "competition_code", "competition_participants",
  "competition_phases", "competition_questions", "competition_results",
  "competition_monitoring", "competition_reports",
  // quizzes
  "quizzes", "paper_builder", "quiz_solutions", "quiz_assignment", "question_bank", "quiz_results",
  // exams
  "examinations", "exam_links", "exam_share_codes", "exam_hints", "exam_candidate_links",
  "exam_candidates", "exam_monitoring", "exam_results", "exam_validation", "exam_publication",
  "exam_reports", "exam_printable", "exam_templates", "exam_calculator",
  // retained institution features
  "classes", "students", "teachers", "rubrics", "proctoring", "org_reports", "platform", "billing",
];
for (const key of required) ok(keys.includes(key), `catalog missing required module: ${key}`);

// 3. Resolution semantics.
const nullResolve = M.resolveModules({});
ok(Object.values(nullResolve).every((v) => v === true), "null plan/override → all modules on");
const planOff = M.resolveModules({ planModules: { exam_publication: false, quizzes: false } });
ok(planOff.exam_publication === false && planOff.quizzes === false, "plan map disables modules");
ok(planOff.examinations === true, "unspecified keys keep defaults under a plan map");
const overridden = M.resolveModules({
  planModules: { exam_publication: false },
  overrideModules: { exam_publication: true, billing: false },
});
ok(overridden.exam_publication === true, "org override beats plan (re-enable)");
ok(overridden.billing === false, "org override can disable a plan-enabled module");
const owner = M.resolveModules({ planModules: { billing: false }, overrideModules: { everything: false }, ownerBypass: true });
ok(Object.values(owner).every((v) => v === true), "owner bypass → all true regardless of stored maps");
const junk = M.resolveModules({ planModules: "not-a-map", overrideModules: [1, 2, 3] });
ok(Object.values(junk).every((v) => v === true), "malformed stored values fall back to defaults");
ok(M.moduleEnabled(undefined, "anything") === true, "missing resolved map fails open (nav cosmetic only)");
ok(M.moduleEnabled({ exam_publication: false }, "exam_publication") === false, "moduleEnabled honours false");
ok(M.moduleEnabled({ exam_publication: false }, "unlisted_new_key") === true, "unknown key fails open");

// 4. Capability gates mapping exists for the umbrella features.
const gates = M.MODULE_CAPABILITY_GATES;
ok(gates.examinations === "examinations", "examinations module gates examinations capability");
ok(gates.quizzes === "quizzes", "quizzes module gates quizzes capability");
ok(gates.paper_builder === "paper_builder", "paper_builder mapping");
ok(gates.question_bank === "question_bank", "question_bank mapping");
ok(gates.competitions === "competitions", "competitions mapping");
ok(gates.proctoring === "proctoring", "proctoring mapping");

// 5. Enforcement wiring (source contracts).
const capabilities = read("src/lib/capabilities.ts");
ok(capabilities.includes("MODULE_CAPABILITY_GATES"), "getCapabilities ANDs module gates");
ok(capabilities.includes("moduleEnabled(entitlement.modules"), "gates read entitlement.modules");
ok(/export function requireModule\(/.test(capabilities), "requireModule helper exported");

const entitlements = read("src/lib/entitlements.ts");
ok(!/from ["']\.\/modules["']/.test(entitlements), "entitlements keeps zero runtime relative imports (direct-ESM test contract)");
ok(entitlements.includes("coerceStoredModules((sub.plans as"), "subscription path merges plans.modules");
ok(entitlements.includes("coerceStoredModules((sub as { modules_override?"), "subscription path merges modules_override");
ok(entitlements.includes("coerceStoredModules((free as"), "free-plan path reads plans.modules");
ok(/modules: Record<string, boolean>/.test(entitlements), "Entitlement exposes modules map");
ok(entitlements.includes('modules: {}'), "owner entitlement resolves all-on via defaults");

const chrome = read("src/components/dashboard/DashboardChrome.tsx");
ok(chrome.includes("MODULE_FOR_HREF"), "workspace nav maps hrefs → modules");
ok(chrome.includes("moduleEnabled(modules"), "workspace nav filters by resolved modules");
const layout = read("src/app/dashboard/layout.tsx");
ok(layout.includes("modules={modules}"), "dashboard layout passes resolved modules");

// Server-side (not menus-only) guards for fine-grained modules.
const examActions = read("src/app/dashboard/exams/actions.ts");
ok(examActions.includes('requireModule(pubEnt, "exam_publication"'), "publishResults guarded by exam_publication");
ok(examActions.includes('requireModule(accessEnt, "exam_share_codes"'), "share-link/access-code writes guarded");
ok(examActions.includes('requireModule(valEnt, "exam_validation"'), "validation guarded by exam_validation");
ok(examActions.includes('moduleEnabled(ent.modules, "exam_calculator")'), "calculator offering respects module");
const paperPage = read("src/app/dashboard/exams/[id]/paper/page.tsx");
ok(paperPage.includes('"exam_printable"'), "printable papers page guarded");
const monitorPage = read("src/app/dashboard/exams/[id]/monitor/page.tsx");
ok(monitorPage.includes('"exam_monitoring"'), "live monitor page guarded");

// Admin console: owner-gated, audited saves.
const pmmPage = read("src/app/admin/plans/modules/page.tsx");
ok(pmmPage.includes("requireSuperAdmin"), "PMM page owner-gated");
const pmmActions = read("src/app/admin/plans/modules/actions.ts");
ok(pmmActions.includes("requireSuperAdmin"), "PMM saves owner-gated");
ok(pmmActions.includes("await audit("), "PMM saves audited");
ok(pmmActions.includes("savePlanModules") && pmmActions.includes("saveSubscriptionModules"), "both save actions exist");
const adminShell = read("src/app/admin/AdminShell.tsx");
ok(adminShell.includes("/admin/plans/modules"), "AdminShell links Plan & Module Management");

// Migration: additive-only storage.
const migration = read("supabase/migrations/20261124190000_plan_module_entitlements.sql");
ok(/add column if not exists modules jsonb/.test(migration), "plans.modules additive column");
ok(/add column if not exists modules_override jsonb/.test(migration), "subscriptions.modules_override additive column");
// Scan executable statements only (prose in comments may mention DROP/DELETE
// when documenting what this migration deliberately avoids).
const migrationStatements = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
ok(!/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bRESET\b/i.test(migrationStatements), "migration statements contain no destructive operations");
ok(!/\bUPDATE\b|\bINSERT\b/i.test(migrationStatements), "migration performs no data writes");

if (failures.length) {
  console.error(`plan-modules: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`plan-modules: ${checks} checks passed`);
