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

// 4. Capability gates must reference REAL CapabilityKeys — a phantom key
//    (the previous bug) silently disabled nothing while the nav hid the
//    module, diverging navigation from backend authorization.
const gates = M.MODULE_CAPABILITY_GATES;
const capabilityKeys = new Set([
  "class_management", "student_management", "question_bank", "quiz_management",
  "examinations", "question_paper_builder", "live_competitions", "proctoring",
  "reports_analytics", "imports_exports", "institutional_administration",
  "configurable_limits", "central_asset_management", "multi_class_operations",
  "future_modules", "premium_exam_experience", "unrestricted_owner_access",
]);
for (const [moduleKey, capKey] of Object.entries(gates)) {
  ok(capabilityKeys.has(capKey), `gate ${moduleKey} → "${capKey}" is a real CapabilityKey`);
}
ok(gates.examinations === "examinations", "examinations module gates examinations capability");
ok(gates.quizzes === "quiz_management", 'quizzes module gates quiz_management (was a phantom key)');
ok(gates.paper_builder === "question_paper_builder", 'paper_builder gates question_paper_builder (was a phantom key)');
ok(gates.question_bank === "question_bank", "question_bank mapping");
ok(gates.competitions === "live_competitions", 'competitions gates live_competitions (was a phantom key)');
ok(gates.proctoring === "proctoring", "proctoring mapping");
ok(gates.org_reports === "reports_analytics", 'org_reports gates reports_analytics (was a phantom key)');
ok(!("teachers" in gates) && !("rubrics" in gates) && !("platform" in gates) && !("billing" in gates) && !("exam_reports" in gates),
  "modules without a real capability are enforced via requireModule instead of phantom gates");

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
ok(chrome.includes('from "@/lib/navModules"') && chrome.includes("isNavVisible("), "workspace nav maps hrefs → modules via the shared catalog rule");
ok(chrome.includes("isNavVisible(item, modules"), "workspace nav filters by resolved modules (incl. parent-module requirements)");
const layout = read("src/app/dashboard/layout.tsx");
ok(layout.includes("modules={modules}"), "dashboard layout passes resolved modules");

// Server-side (not menus-only) guards for fine-grained modules.
const examActions = read("src/app/dashboard/exams/actions.ts");
ok(examActions.includes('requireModule(pubEnt, "exam_publication"'), "publishResults guarded by exam_publication");
ok(examActions.includes('requireModule(accessEnt, "exam_share_codes"'), "share-link/access-code writes guarded");
ok(examActions.includes('requireModule(valEnt, "exam_validation"'), "validation guarded by exam_validation");
// The examination create body moved into the shared creation service (the AI
// core and agents create examinations through it too), so the calculator gate
// is asserted where it now lives.
const examService = read("src/lib/services/examinationCreation.ts");
ok(examService.includes('moduleEnabled(entitlement.modules, "exam_calculator")'), "calculator offering respects module");
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

// 6. Entitlement calculation rules (Part 1) — Tests A–E executed against the
//    REAL resolveEffectiveModule: INHERIT/ON/OFF/configured vs effective.
{
  const r = M.resolveEffectiveModule;
  // Test A — Inherit follows the plan.
  const planWith = { competitions: true, competition_code: true };
  const a1 = r(planWith, null, "competition_code");
  ok(a1.configured === "inherit" && a1.effective === true && a1.source === "plan",
    "Test A: INHERIT + plan includes → ENABLED (source PLAN)");
  const a2 = r({ competitions: false }, null, "competitions");
  ok(a2.configured === "inherit" && a2.effective === false && a2.source === "plan",
    "Test A: INHERIT + plan excludes → DISABLED (source PLAN)");
  const a3 = r(null, null, "anything_new");
  ok(a3.effective === true && a3.source === "default",
    "Test A: no plan map → PLATFORM DEFAULT (all-on, zero regression)");

  // Test B — explicit ON beats an excluding plan.
  const b = r({ competition_code: false }, { competition_code: true }, "competition_code");
  ok(b.configured === "on" && b.effective === true && b.source === "override",
    "Test B: ON override beats plan exclusion → ENABLED (source OVERRIDE)");

  // Test C — explicit OFF beats an including plan.
  const c = r({ competitions: true }, { competitions: false }, "competitions");
  ok(c.configured === "off" && c.effective === false && c.source === "override",
    "Test C: OFF override beats plan inclusion → DISABLED (source OVERRIDE)");

  // Test D — reset to INHERIT returns to the plan's configuration.
  const dPlan = { quizzes: true };
  const dOn = r(dPlan, { quizzes: false }, "quizzes");
  ok(dOn.effective === false, "Test D precondition: OFF override applied");
  const dReset = r(dPlan, null, "quizzes");
  ok(dReset.configured === "inherit" && dReset.effective === true && dReset.source === "plan",
    "Test D: reset to INHERIT → follows plan again");

  // Test E — plan change updates inherited modules; overrides remain.
  const planV2 = { competitions: false, quizzes: true };
  const e1 = r(planV2, { quizzes: false }, "quizzes");
  const e2 = r(planV2, { quizzes: false }, "competitions");
  ok(e1.effective === false && e1.source === "override", "Test E: explicit override survives a plan change");
  ok(e2.configured === "inherit" && e2.effective === false && e2.source === "plan",
    "Test E: inherited module follows the NEW plan automatically");

  // Configured vs effective vs source are never conflated.
  const conflated = r({ billing: true }, { billing: false }, "billing");
  ok(conflated.configured === "off" && conflated.effective === false && conflated.source === "override",
    "configured state, effective state and source are distinct fields");
  const all = M.resolveEffectiveModules({ competitions: false }, { competitions: true });
  ok(Object.keys(all).length === M.MODULE_CATALOG.length, "resolveEffectiveModules covers every catalog module");
}

// 7. Naming match between Plan & Module Management and the dashboard (Part 5).
{
  const byKey = Object.fromEntries(M.MODULE_CATALOG.map((m) => [m.key, m]));
  const chrome = read("src/components/dashboard/DashboardChrome.tsx");
  ok(byKey.competitions.label === "Live Competitions", "Assessment module named exactly like its nav entry");
  ok(chrome.includes('label: "Live Competitions"'), "nav entry uses the same name");
  ok(byKey.competition_code.label === "Assessment Code", "Assessment Code module uses the reported name");
  ok(byKey.competition_code.description.includes("Live Competitions"), "Assessment Code points at its operational page");
  ok(chrome.includes('title: "Assessment"'), "Assessment nav section present");
  // The sidebar's href→module map is DERIVED from catalog nav surfaces
  // (src/lib/navModules.ts moduleForHref) — every sidebar href is backed by a
  // real catalog key and every catalog nav surface is offered in the sidebar.
  const navModulesSrc = read("src/lib/navModules.ts");
  ok(navModulesSrc.includes("moduleForHref") && navModulesSrc.includes("MODULE_CATALOG"), "href→module map derived from the catalog registry (navModules.ts)");
  ok(chrome.includes("isNavVisible("), "sidebar visibility runs through the shared isNavVisible rule");
  const navHrefs = new Set();
  for (const m of M.MODULE_CATALOG) {
    if (m.surface && m.surface.kind === "nav") for (const h of m.surface.hrefs) navHrefs.add(h);
  }
  ok(navHrefs.size >= 19, `catalog declares ${navHrefs.size} sidebar destinations`);
  const chromeHrefs = [...chrome.matchAll(/href: "(\/dashboard[^"]*)"/g)].map((x) => x[1]);
  ok(chromeHrefs.length >= 20, `sidebar lists ${chromeHrefs.length} destinations`);
  for (const h of chromeHrefs) {
    if (h === "/dashboard") continue;
    ok(navHrefs.has(h), `sidebar href ${h} is backed by a catalog nav surface`);
  }
  for (const h of navHrefs) ok(chromeHrefs.includes(h), `catalog nav surface ${h} is offered in the sidebar`);
}

// 8. Server-side page guards — disabled modules inaccessible by direct URL.
{
  const expectGuard = [
    ["src/app/dashboard/competitions/page.tsx", '"competitions"'],
    ["src/app/dashboard/teachers/page.tsx", '"teachers"'],
    ["src/app/dashboard/rubrics/page.tsx", '"rubrics"'],
    ["src/app/dashboard/myp-results/page.tsx", '"exam_reports"'],
    ["src/app/dashboard/platform/page.tsx", '"platform"'],
    ["src/app/dashboard/billing/page.tsx", '"billing"'],
    ["src/app/dashboard/reports/page.tsx", '"org_reports"'],
    ["src/app/dashboard/results/page.tsx", '"exam_results"'],
  ];
  for (const [file, key] of expectGuard) {
    const src = read(file);
    ok(src.includes(`requireModule(entitlement, ${key}`), `${file} guarded by requireModule ${key}`);
    ok(src.includes('"/dashboard?e=module"') || src.includes("?e=module"), `${file} explains the block (e=module)`);
  }
  const overview = read("src/app/dashboard/page.tsx");
  ok(overview.includes('sp?.e === "module"'), "dashboard overview explains module blocks");

  // Assessment Code operational: column + minting gated by the SAME key.
  const compPage = read("src/app/dashboard/competitions/page.tsx");
  ok(compPage.includes('moduleEnabled(entitlement.modules, "competition_code")'), "Assessment Code column driven by entitlement");
  ok(compPage.includes("codeEnabled ?"), "Admission-code column appears only when enabled");
  const compActions = read("src/app/dashboard/competitions/actions.ts");
  ok(compActions.includes('moduleEnabled(entitlement.modules, "competition_code")'), "admission codes minted only when module enabled");

  // Navigation and backend use the same resolution.
  const layout = read("src/app/dashboard/layout.tsx");
  ok(layout.includes("getCapabilities(supabase, ctx, org.id)"), "layout resolves entitlement per request (no stale cache)");
  ok(!/cache\(/.test(layout.slice(0, layout.indexOf("export default"))), "no module-level cache wrapper around entitlement");

  // Organization users cannot self-activate modules.
  const dashboardWrites = [];
  const { readdirSync, statSync } = require("node:fs");
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(full)) {
        const body = readFileSync(full, "utf8");
        if (/modules_override/.test(body) && !full.includes("/admin/")) dashboardWrites.push(full);
        if (/from\("plans"\)[\s\S]{0,80}\.update\(\{[\s\S]{0,40}modules/.test(body) && !full.includes("/admin/")) dashboardWrites.push(full);
      }
    }
  };
  walk("src/app/dashboard");
  walk("src/components");
  ok(dashboardWrites.length === 0, `no organization-side writer of plan/override modules: ${dashboardWrites.join(", ")}`);
}

// 9. Executed: Save Override persists tri-state and refreshes dashboards.
{
  const ts = require("typescript");
  const { Module } = require("node:module");
  const path = require("node:path");
  const file = path.resolve("scripts/__pmm_actions.cjs");
  const written = [];
  const revalidated = [];
  const audited = [];
  let ctx = { user: { id: "sa-1" }, profile: { platform_role: "super_admin", status: "active" } };
  const subRow = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organization_id: "org-1", plan_id: "p-1" };
  const admin = {
    from(table) {
      ok(table === "subscriptions", "override writes target subscriptions");
      let patch = null;
      const q = {
        update(v) { patch = v; return q; },
        eq() { return q; },
        select() { return q; },
        async maybeSingle() {
          written.push(patch);
          Object.assign(subRow, patch);
          return { data: { ...subRow }, error: null };
        },
      };
      return q;
    },
  };
  const stubs = {
    "@/lib/admin": { requireSuperAdmin: async () => ctx, audit: async (...a) => audited.push(a) },
    "@/lib/supabase/server": { createAdminClient: () => admin },
    "@/lib/modules": M,
    "next/cache": { revalidatePath: (p) => revalidated.push(p) },
    "next/navigation": { redirect: (u) => { const e = new Error(u); e.url = u; throw e; } },
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
    ts.transpileModule(readFileSync("src/app/admin/plans/modules/actions.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  Module._load = load;

  const run = async (fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    try { await m.exports.saveSubscriptionModules(fd); return null; } catch (e) { return e.url ?? null; }
  };

  // ON for one module, OFF for another, inherit for the rest.
  const subId = subRow.id;
  const url1 = await run({
    subscription_id: subId,
    o_competitions: "on",
    o_billing: "off",
    o_teachers: "inherit",
  });
  ok(url1 === "/admin/plans/modules?ok=override", `save redirects with success flash (got ${url1})`);
  ok(written.length === 1 && written[0].modules_override?.competitions === true && written[0].modules_override?.billing === false,
    "Test B/C executed: ON/OFF persisted as explicit booleans");
  ok(!("teachers" in written[0].modules_override), "INHERIT removes the key (plan applies again)");
  ok(audited.some((a) => a[1] === "subscription.modules_override_updated"), "override save audited");
  ok(revalidated.includes("/admin/plans/modules") && revalidated.includes("/dashboard"),
    "Test G: admin page AND organization dashboard caches invalidated");

  // Reset everything → NULL (pure inheritance).
  revalidated.length = 0;
  const url2 = await run({ subscription_id: subId, o_competitions: "inherit", o_billing: "inherit" });
  ok(url2 === "/admin/plans/modules?ok=override" && written[written.length - 1].modules_override === null,
    "Test D executed: all-INHERIT stores NULL (pure plan inheritance)");
  ok(revalidated.includes("/dashboard"), "reset also refreshes organization dashboards");

  // Invalid subscription id → error flash, no write.
  written.length = 0;
  const url3 = await run({ subscription_id: "not-a-uuid" });
  ok(url3 === "/admin/plans/modules?e=invalid" && written.length === 0, "invalid id rejected without writing");
}

// 10. Executed: entitlement resolution per organization (Tests E/F/G backend).
{
  const ts = require("typescript");
  const { Module } = require("node:module");
  const path = require("node:path");
  const file = path.resolve("scripts/__pmm_entitlements.cjs");
  const planInstitution = { id: "pl-1", slug: "institution", name: "Institution", modules: { competitions: true, competition_code: true, billing: false }, limits: { max_exams: 100 } };
  const planOther = { id: "pl-2", slug: "premium", name: "Premium", modules: { competitions: false }, limits: {} };
  const freePlan = { id: "pl-0", slug: "free", name: "Free", modules: null, limits: {} };
  const subs = [
    { id: "s-oak", organization_id: "org-oak", status: "active", plan_id: "pl-1", plans: planInstitution, modules_override: { competition_code: true }, created_at: "2026-01-01", current_period_end: null, trial_ends_at: null },
    { id: "s-other", organization_id: "org-other", status: "active", plan_id: "pl-2", plans: planOther, modules_override: { competitions: true }, created_at: "2026-01-02", current_period_end: null, trial_ends_at: null },
    { id: "s-expired", organization_id: "org-expired", status: "active", plan_id: "pl-1", plans: planInstitution, modules_override: { billing: true }, created_at: "2026-01-01", current_period_end: "2020-01-01", trial_ends_at: null },
  ];
  const db = {
    from(table) {
      if (table === "plans") {
        return {
          select() { return this; },
          eq(k, v) { this._slug = v; return this; },
          async maybeSingle() { return { data: this._slug === "free" ? freePlan : null, error: null }; },
        };
      }
      return {
        select() { return this; },
        eq(k, v) { this._org = v; return this; },
        in() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          const rows = subs.filter((s) => s.organization_id === this._org && ["active", "trialing"].includes(s.status));
          rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return { data: rows[0] ?? null, error: null };
        },
      };
    },
  };
  const load = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === file && request === "@/lib/auth") return {};
    return load.apply(this, arguments);
  };
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(
    ts.transpileModule(readFileSync("src/lib/entitlements.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  Module._load = load;

  // Test F — tenant isolation: each org resolves ONLY its own configuration.
  const oak = await m.exports.getEntitlement(db, "org-oak");
  const other = await m.exports.getEntitlement(db, "org-other");
  ok(oak.planSlug === "institution" && other.planSlug === "premium", "each org resolves its own plan");
  ok(oak.modules.competitions === true && oak.modules.competition_code === true,
    "Test A backend: Oak inherits plan + its ON override merges");
  ok(other.modules.competitions === true && other.modules.competitions !== oak.modules.billing,
    "Test F: other org's ON override independent of Oak");
  ok(!("billing" in other.modules), "Test F: Oak's OFF override key never appears in another org's map");
  ok(oak.modules.billing === false && other.modules.billing === undefined,
    "Test F: OFF override on one org never leaks to another");

  // Test E backend — plan change: swap the plan's map, overrides stay.
  planInstitution.modules = { competitions: false };
  const oakAfter = await m.exports.getEntitlement(db, "org-oak");
  ok(oakAfter.modules.competitions === false, "Test E backend: inherited module follows the plan change");
  ok(oakAfter.modules.competition_code === true, "Test E backend: explicit ON override still wins");

  // Subject-to-subscription: lapsed subscription falls back to free plan
  // (overrides stop applying — no valid subscription, no overrides).
  const expired = await m.exports.getEntitlement(db, "org-expired");
  ok(expired.planSlug === "free" && expired.status === "expired", "lapsed subscription → free plan");
  ok(!("billing" in expired.modules), "lapsed subscription reads ONLY the free plan — overrides stop applying with the subscription");
}

if (failures.length) {
  console.error(`plan-modules: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`plan-modules: ${checks} checks passed`);
