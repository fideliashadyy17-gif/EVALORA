// Module synchronization — Super Admin Plan & Module Management → entitlement
// → organization navigation → routes → backend, as ONE pipeline.
//
//   node scripts/test-module-sync.mjs
//
// Written against the production report "enabling modules in PMM does not make
// them appear in the Oak organization dashboard". Section R replays the exact
// production scenario (save → persist → resolve → nav) and asserts the DESIRED
// end state; before the synchronization fix those assertions FAIL, which is the
// reproduction. Sections A–K are the brief's integration tests.
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
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

// ── transpile the REAL src/lib/modules.ts (catalog, resolver, gates) ──
mkdirSync(".tmp-test-sync", { recursive: true });
const build = spawnSync(
  "npx",
  ["tsc", "src/lib/modules.ts", "--target", "es2022", "--module", "commonjs", "--skipLibCheck", "--outDir", ".tmp-test-sync"],
  { encoding: "utf8" },
);
ok(build.status === 0, `tsc transpile of modules.ts failed: ${String(build.stderr).slice(0, 400)}`);
const M = require(`${process.cwd()}/.tmp-test-sync/modules.js`);

const chromeSrc = read("src/components/dashboard/DashboardChrome.tsx");
const compPageSrc = read("src/app/dashboard/competitions/page.tsx");
const compActionsSrc = read("src/app/dashboard/competitions/actions.ts");
const pmmClientSrc = read("src/app/admin/plans/modules/PlanModulesAdminClient.tsx");
const enDict = read("src/lib/i18n/dictionaries/en.ts");
const frDict = read("src/lib/i18n/dictionaries/fr.ts");
const esDict = read("src/lib/i18n/dictionaries/es.ts");

// Consumer count for a module key across application code (the entitlement
// must actually be READ somewhere for the module to be operational).
function consumerCount(key) {
  let n = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(full) && !full.includes("/admin/")) {
        const body = readFileSync(full, "utf8");
        // exclude the catalog itself and pure display plumbing
        if (full.endsWith("src/lib/modules.ts") || full.endsWith("src/lib/navModules.ts")) continue;
        if (full.includes("PlanModulesAdminClient") || full.includes("plans/modules/page")) continue;
        n += (body.match(new RegExp(`"${key}"`, "g")) || []).length;
      }
    }
  };
  walk("src");
  return n;
}

// ── harness: execute the REAL Save Override server action with stubs ──
const ts = require("typescript");
const { Module } = require("node:module");
const path = require("node:path");
const actionsFile = path.resolve("scripts/__sync_actions.cjs");
const written = [];
const revalidated = [];
const actionCtx = { user: { id: "sa-1" }, profile: { platform_role: "super_admin", status: "active" } };
const subRow = {
  id: "e530a2db-023f-49e4-aa8a-5cc46c801c72", // Oak's real subscription id shape (UUID)
  organization_id: "0a400000-0000-4000-8000-000000000001",
  plan_id: "06ffc960-b0c8-410e-bb26-43f1c7e3db3f",
  modules_override: null,
};
const adminStub = {
  from(table) {
    ok(table === "subscriptions", "override writes target subscriptions");
    let patch = null;
    const q = {
      update(v) { patch = v; return q; },
      eq() { return q; },
      select() { return q; },
      async maybeSingle() {
        written.push(patch);
        subRow.modules_override = patch;
        return { data: { ...subRow }, error: null };
      },
    };
    return q;
  },
};
const actionStubs = {
  "@/lib/admin": { requireSuperAdmin: async () => actionCtx, audit: async () => {} },
  "@/lib/supabase/server": { createAdminClient: () => adminStub },
  "@/lib/modules": M,
  "next/cache": { revalidatePath: (p) => revalidated.push(p) },
  "next/navigation": { redirect: (u) => { const e = new Error(u); e.url = u; throw e; } },
};
{
  const load = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === actionsFile && request in actionStubs) return actionStubs[request];
    return load.apply(this, arguments);
  };
  const m = new Module(actionsFile);
  m.filename = actionsFile;
  m.paths = Module._nodeModulePaths(path.dirname(actionsFile));
  m._compile(
    ts.transpileModule(read("src/app/admin/plans/modules/actions.ts"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    actionsFile,
  );
  Module._load = load;
  globalThis.__syncSave = m.exports;
}
const saveOverride = async (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await globalThis.__syncSave.saveSubscriptionModules(fd);
    return null;
  } catch (e) {
    return e.url ?? null;
  }
};

// ── harness: execute the REAL getEntitlement against a fake db ──
function makeEntitlement(dbState) {
  const file = path.resolve("scripts/__sync_entitlements.cjs");
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(
    ts.transpileModule(read("src/lib/entitlements.ts"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  const fake = {
    from(table) {
      if (table === "subscriptions") {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return this; },
          order() { return this; },
          limit() { return this; },
          async maybeSingle() {
            const row = dbState.subs.find((s) => s.organization_id === dbState.currentOrg);
            return { data: row ? { ...row, plans: row.plan } : null, error: null };
          },
        };
      }
      if (table === "plans") {
        return {
          select() { return this; },
          eq(_c, slug) {
            return { async maybeSingle() {
              const p = dbState.plans.find((x) => x.slug === slug);
              return { data: p ? { ...p } : null, error: null };
            } };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return m.exports.getEntitlement(fake, dbState.currentOrg);
}

// Institution-plan shape as in production (all keys the org plan carries).
const institutionModules = {};
for (const { key } of M.MODULE_CATALOG) institutionModules[key] = true;
const freePlan = { slug: "free", name: "Free", modules: null, limits: {} };

// ══════════════════════════════════════════════════════════════════════
// R — REPRODUCTION: the exact production scenario the user reported.
// ══════════════════════════════════════════════════════════════════════
{
  // R.1 Super Admin saves the three modules the user enabled (everything else
  // left at INHERIT) for Oak's subscription.
  const form = { subscription_id: subRow.id, o_examinations: "on", o_competition_code: "on", o_competition_results: "on" };
  for (const { key } of M.MODULE_CATALOG) if (!(`o_${key}` in form)) form[`o_${key}`] = "inherit";
  const url = await saveOverride(form);
  ok(url === "/admin/plans/modules?ok=override", `R: save redirects ok (got ${url})`);
  const patch = written[written.length - 1];
  const persisted = patch && patch.modules_override;
  ok(
    persisted &&
      persisted.examinations === true &&
      persisted.competition_code === true &&
      persisted.competition_results === true &&
      Object.keys(persisted).length === 3,
    `R: exactly the three user-enabled keys persist (got ${JSON.stringify(persisted)})`,
  );
  ok(revalidated.includes("/dashboard"), "R: save invalidates /dashboard so the org nav refreshes");

  // R.2 The saved override resolves to ENABLED for the org.
  const ent = await makeEntitlement({
    currentOrg: subRow.organization_id,
    plans: [{ slug: "institution", name: "Institution", modules: institutionModules, limits: {} }, freePlan],
    subs: [{ organization_id: subRow.organization_id, status: "active", current_period_end: null, trial_ends_at: null, plans: null, modules_override: { ...persisted }, plan: { slug: "institution", name: "Institution", modules: institutionModules, limits: {} } }],
  });
  ok(ent.planSlug === "institution", `R: Oak resolves the institution plan (${ent.planSlug})`);
  ok(ent.modules.examinations === true, "R: examinations effective ENABLED after save");
  ok(ent.modules.competition_code === true, "R: competition_code effective ENABLED after save");
  ok(ent.modules.competition_results === true, "R: competition_results effective ENABLED after save");

  // R.3 DESIRED END-STATE — these fail before the synchronization fix and are
  // the reproduction of "I enabled it and nothing appeared".
  ok(existsSync("src/lib/navModules.ts"), "R-DESIRABLE: single derived nav-module registry exists (src/lib/navModules.ts)");
  ok(chromeSrc.includes("/dashboard/competitions/rankings"), "R-DESIRABLE: organization sidebar has a Rankings & Results entry");
  const rankingsRoute = "src/app/dashboard/competitions/rankings/page.tsx";
  ok(existsSync(rankingsRoute), `R-DESIRABLE: organization rankings route exists (${rankingsRoute})`);
  if (existsSync(rankingsRoute)) {
    const rs = read(rankingsRoute);
    ok(rs.includes('requireModule(entitlement, "competition_results"'), "R-DESIRABLE: rankings route is entitlement-guarded by competition_results");
    ok(rs.includes('requireModule(entitlement, "competitions"'), "R-DESIRABLE: rankings route is entitlement-guarded by its parent competitions module");
    ok(rs.includes('eq("organization_id"'), "R-DESIRABLE: rankings data is organization-scoped (tenant isolation)");
    ok(rs.includes("session_participants"), "R-DESIRABLE: rankings read the real session participant scores");
  }
  ok(compPageSrc.includes("competition_results"), "R-DESIRABLE: Live Competitions page surfaces the competition_results feature");
  ok(pmmClientSrc.includes("pmm-surface"), "R-DESIRABLE: PMM console tells the Super Admin WHERE each module appears");
}

// ══════════════════════════════════════════════════════════════════════
// A–G — integration through the REAL pipeline (save → resolve → nav → route).
// ══════════════════════════════════════════════════════════════════════
const navModulesAvailable = existsSync("src/lib/navModules.ts");
let N = null;
if (navModulesAvailable) {
  const navBuild = spawnSync(
    "npx",
    ["tsc", "src/lib/modules.ts", "src/lib/navModules.ts", "src/lib/navAccess.ts", "--target", "es2022", "--module", "commonjs", "--skipLibCheck", "--outDir", ".tmp-test-sync"],
    { encoding: "utf8" },
  );
  ok(navBuild.status === 0, `tsc transpile of navModules failed: ${String(navBuild.stderr).slice(0, 400)}`);
  if (navBuild.status === 0) N = require(`${process.cwd()}/.tmp-test-sync/navModules.js`);
}

async function entitlementFor(override, planModules) {
  return makeEntitlement({
    currentOrg: subRow.organization_id,
    plans: [{ slug: "institution", name: "Institution", modules: planModules ?? institutionModules, limits: {} }, freePlan],
    subs: [{ organization_id: subRow.organization_id, status: "active", current_period_end: null, trial_ends_at: null, plans: null, modules_override: override, plan: { slug: "institution", name: "Institution", modules: planModules ?? institutionModules, limits: {} } }],
  });
}

// Test A — ON override appears in navigation + guards the route.
{
  const form = { subscription_id: subRow.id, o_competition_results: "on" };
  for (const { key } of M.MODULE_CATALOG) if (!(`o_${key}` in form)) form[`o_${key}`] = "inherit";
  await saveOverride(form);
  const ent = await entitlementFor({ competition_results: true }, null);
  ok(ent.modules.competition_results === true, "A: ON override resolves effective ENABLED");
  if (N) {
    const hrefs = N.moduleForHref();
    ok(hrefs["/dashboard/competitions/rankings"] === "competition_results", "A: rankings nav href maps to competition_results");
    ok(N.isNavVisible({ href: "/dashboard/competitions/rankings", audience: "staff" }, ent.modules, "admin") === true, "A: enabled module is VISIBLE in nav for staff");
  }
  const rs = existsSync("src/app/dashboard/competitions/rankings/page.tsx") ? read("src/app/dashboard/competitions/rankings/page.tsx") : "";
  ok(rs.includes("requireModule"), "A: route enforces the entitlement server-side");
}

// Test B — OFF override disappears from nav and blocks the direct route.
{
  const form = { subscription_id: subRow.id, o_competitions: "off" };
  for (const { key } of M.MODULE_CATALOG) if (!(`o_${key}` in form)) form[`o_${key}`] = "inherit";
  await saveOverride(form);
  const ent = await entitlementFor({ competitions: false }, null);
  ok(ent.modules.competitions === false, "B: OFF override resolves effective DISABLED");
  if (N) {
    ok(N.isNavVisible({ href: "/dashboard/competitions", audience: "staff" }, ent.modules, "admin") === false, "B: disabled module HIDDEN from nav");
    ok(N.isNavVisible({ href: "/dashboard/competitions/rankings", audience: "staff" }, ent.modules, "admin") === false, "B: rankings entry also hidden (parent off)");
  }
  ok(compPageSrc.includes('requireModule(entitlement, "competitions"'), "B: direct route /dashboard/competitions is blocked server-side");
  const rs = existsSync("src/app/dashboard/competitions/rankings/page.tsx") ? read("src/app/dashboard/competitions/rankings/page.tsx") : "";
  ok(rs.includes('requireModule(entitlement, "competitions"'), "B: direct rankings route blocked when parent module off");
}

// Test C — INHERIT follows the plan.
{
  const form = { subscription_id: subRow.id };
  for (const { key } of M.MODULE_CATALOG) form[`o_${key}`] = "inherit";
  await saveOverride(form);
  const onPlan = await entitlementFor(null, { ...institutionModules, competitions: true });
  const offPlan = await entitlementFor(null, { ...institutionModules, competitions: false });
  ok(onPlan.modules.competitions === true, "C: INHERIT → plan enabled → effective ENABLED");
  ok(offPlan.modules.competitions === false, "C: INHERIT → plan disabled → effective DISABLED");
}

// Test D — plan change updates inherited modules; explicit override survives.
{
  const planA = { ...institutionModules, competitions: false };
  const planB = { ...institutionModules, competitions: true, competition_code: false };
  const override = { competition_code: true };
  const before = await entitlementFor(override, planA);
  const after = await entitlementFor(override, planB);
  ok(before.modules.competitions === false && after.modules.competitions === true, "D: inherited module follows the plan change");
  ok(before.modules.competition_code === true && after.modules.competition_code === true, "D: explicit ON override survives the plan change");
}

// Test E — reset to INHERIT removes the override key and returns to the plan.
{
  const form = { subscription_id: subRow.id, o_competition_results: "on" };
  for (const { key } of M.MODULE_CATALOG) if (!(`o_${key}` in form)) form[`o_${key}`] = "inherit";
  await saveOverride(form);
  const withOverride = written[written.length - 1];
  ok(withOverride && withOverride.modules_override && withOverride.modules_override.competition_results === true, "E: ON persisted before reset");
  const resetForm = { subscription_id: subRow.id };
  for (const { key } of M.MODULE_CATALOG) resetForm[`o_${key}`] = "inherit";
  await saveOverride(resetForm);
  const afterReset = written[written.length - 1];
  ok(afterReset && afterReset.modules_override === null, `E: all-INHERIT stores NULL (${JSON.stringify(afterReset)})`);
}

// Test F — two organizations keep independent overrides.
{
  const orgA = { organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "active", current_period_end: null, trial_ends_at: null, plans: null, modules_override: { competitions: false }, plan: { slug: "institution", modules: institutionModules, limits: {} } };
  const orgB = { organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "active", current_period_end: null, trial_ends_at: null, plans: null, modules_override: { competitions: true }, plan: { slug: "institution", modules: { ...institutionModules, competitions: false }, limits: {} } };
  const entA = await makeEntitlement({ currentOrg: orgA.organization_id, plans: [freePlan], subs: [orgA] });
  const entB = await makeEntitlement({ currentOrg: orgB.organization_id, plans: [freePlan], subs: [orgB] });
  ok(entA.modules.competitions === false, "F: org A OFF stays OFF");
  ok(entB.modules.competitions === true, "F: org B ON stays ON (no bleed from A)");
}

// Test G — persistence: a fresh read after the save sees the same state
// (entitlements are resolved per request — no stale session/cache layer).
{
  const form = { subscription_id: subRow.id, o_examinations: "on", o_competition_code: "on", o_competition_results: "on" };
  for (const { key } of M.MODULE_CATALOG) if (!(`o_${key}` in form)) form[`o_${key}`] = "inherit";
  await saveOverride(form);
  const saved = written[written.length - 1].modules_override;
  const read1 = await entitlementFor({ ...saved }, null);
  const read2 = await entitlementFor({ ...saved }, null);
  ok(read1.modules.competition_results === true && read2.modules.competition_results === true, "G: repeated fresh reads agree after save (refresh-safe)");
  const layout = read("src/app/dashboard/layout.tsx");
  ok(layout.includes("getCapabilities(supabase, ctx, org.id)"), "G: dashboard layout re-resolves entitlement every request");
}

// ══════════════════════════════════════════════════════════════════════
// H — canonical catalog consistency (every module classified & honest).
// ══════════════════════════════════════════════════════════════════════
{
  const kinds = new Set();
  for (const m of M.MODULE_CATALOG) {
    ok(!!m.surface, `H: ${m.key} declares a surface (where it appears)`);
    if (!m.surface) continue;
    kinds.add(m.surface.kind);
    const n = consumerCount(m.key);
    if (m.surface.kind === "nav") {
      ok(Array.isArray(m.surface.hrefs) && m.surface.hrefs.length > 0, `H: ${m.key} nav surface lists hrefs`);
      for (const href of m.surface.hrefs ?? []) {
        ok(chromeSrc.includes(`"${href}"`), `H: ${m.key} nav href ${href} exists in the sidebar`);
      }
      ok(chromeSrc.includes("isNavVisible"), `H: sidebar visibility runs through the shared isNavVisible rule (${m.key})`);
      // Every sidebar destination is blocked server-side when its module is off.
      for (const href of m.surface.hrefs ?? []) {
        const rel = href.replace(/^\/dashboard/, "") || "";
        const pageFile = `src/app/dashboard${rel}/page.tsx`;
        ok(existsSync(pageFile), `H: ${href} has an organization route`);
        if (existsSync(pageFile)) {
          ok(
            read(pageFile).includes(`requireModule(entitlement, "${m.key}"`),
            `H: ${href} redirects when ${m.key} is disabled (direct URL blocked)`,
          );
        }
      }
    } else if (m.surface.kind === "page") {
      ok(typeof m.surface.href === "string" && m.surface.href.startsWith("/dashboard"), `H: ${m.key} page surface points into the org dashboard`);
      const rel = m.surface.href.replace(/^\/dashboard/, "") || "";
      const pageFile = `src/app/dashboard${rel}/page.tsx`;
      ok(existsSync(pageFile), `H: ${m.key} page route exists (${pageFile})`);
      ok(typeof m.surface.where === "string" && m.surface.where.length > 0, `H: ${m.key} page surface says WHERE inside the page`);
      ok(n > 0, `H: ${m.key} is wired to real code (${n} reads)`);
    } else if (m.surface.kind === "admin") {
      ok(m.surface.href.startsWith("/admin"), `H: ${m.key} admin surface points at the Super Admin console`);
      const rel = m.surface.href.replace(/^\/admin/, "");
      ok(existsSync(`src/app/admin${rel}`) || existsSync(`src/app/admin${rel}/page.tsx`), `H: ${m.key} admin route exists (${m.surface.href})`);
      ok(n === 0, `H: ${m.key} is console-only — organization code must NOT pretend to gate it (${n} org reads)`);
    } else if (m.surface.kind === "none") {
      ok(typeof m.surface.why === "string" && m.surface.why.length > 0, `H: ${m.key} explains why it is not available`);
      ok(n === 0, `H: ${m.key} marked unavailable has NO organization consumer (${n} found)`);
    }
  }
  ok(kinds.size >= 3, `H: catalog classifies modules across surface kinds (${[...kinds].join(", ")})`);

  // Sidebar hrefs (except Overview) are all derived from the catalog.
  const navHrefs = [...chromeSrc.matchAll(/href: "(\/dashboard[^"]*)"/g)].map((x) => x[1]);
  ok(navHrefs.length >= 20, `H: sidebar exposes destination entries (${navHrefs.length})`);
  if (N) {
    const map = N.moduleForHref();
    for (const href of navHrefs) {
      if (href === "/dashboard") continue;
      ok(Boolean(map[href]), `H: sidebar href ${href} is driven by a catalog nav surface`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// I — Ranking Results: config → navigation → route → authorization.
// ══════════════════════════════════════════════════════════════════════
{
  const cat = M.MODULE_CATALOG.find((m) => m.key === "competition_results");
  ok(!!cat, "I: Ranking Results exists as a catalog module (competition_results)");
  ok(cat && cat.surface && cat.surface.kind === "nav", "I: Ranking Results surfaces as a real sidebar entry (not a phantom toggle)");
  ok(enDict.includes('rankingsResults: "Rankings & Results"'), "I: nav label exists in English");
  ok(frDict.includes('rankingsResults: "Classements & résultats"'), "I: nav label exists in French");
  ok(esDict.includes('rankingsResults: "Clasificaciones y resultados"'), "I: nav label exists in Spanish");
  ok(chromeSrc.includes('labelKey: "nav.rankingsResults"'), "I: sidebar entry uses the shared dictionary key");
  ok(chromeSrc.includes('href: "/dashboard/competitions/rankings"'), "I: sidebar entry links the operational rankings route");
}

// ══════════════════════════════════════════════════════════════════════
// J — Assessment (the section the user configured): group vs module honesty.
// ══════════════════════════════════════════════════════════════════════
{
  ok(chromeSrc.includes('titleKey: "nav.assessments"'), "J: sidebar keeps its Assessment section");
  ok(chromeSrc.includes('href: "/dashboard/exams"') && chromeSrc.includes('href: "/dashboard/competitions"'), "J: Assessment section lists Examinations and Live Competitions");
  ok(enDict.includes('assessments: "Assessment"'), "J: PMM group label and sidebar section share one name (no divergent registry)");
  // Every module the user can toggle in the Assessment group declares where it
  // appears — the console can no longer imply a sidebar entry that does not exist.
  ok(pmmClientSrc.includes("surface"), "J: PMM console renders the surface (location) of each module");
}

// ══════════════════════════════════════════════════════════════════════
// K — Assessment Code: column + minting + detail panel, one key.
// ══════════════════════════════════════════════════════════════════════
{
  const cat = M.MODULE_CATALOG.find((m) => m.key === "competition_code");
  ok(!!cat && cat.surface && cat.surface.kind === "page", "K: Assessment Code classified as a Live Competitions page feature");
  ok(compPageSrc.includes('moduleEnabled(entitlement.modules, "competition_code")'), "K: list column driven by the entitlement");
  ok(compPageSrc.includes("codeEnabled ?"), "K: column hidden when disabled, shown when enabled");
  ok(compActionsSrc.includes('moduleEnabled(entitlement.modules, "competition_code")'), "K: admission-code minting gated by the same key");
  const detail = read("src/app/dashboard/competitions/[id]/page.tsx");
  ok(detail.includes("competition_code"), "K: competition detail code panel gated by competition_code");
}

// ── report ──
if (failures.length) {
  console.error(`\nmodule-sync: ${failures.length} FAILURE(S) — ${checks} checks run`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`module-sync: ${checks} checks passed`);
