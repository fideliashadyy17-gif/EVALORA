// Complete Plan, Module, Subscription & Organization Workspace Integration Suite.
//
//   node scripts/test-plan-module-workspace-integration.mjs
//
// Verifies end-to-end:
//   1. Differentiated Free (12) / Premium (26) / Institution (41) plan matrices
//      in BOTH code (`PLAN_MODULE_TEMPLATES`) and non-destructive SQL migration.
//   2. Zero "Not yet available in the organization workspace" (`surface.kind === "none"`)
//      or org modules trapped in Super Admin only (`surface.kind === "admin"`).
//   3. Honest implementation / external-infrastructure status reporting
//      (`resolveModuleOperationalState` never reports unimplemented modules enabled).
//   4. Super Admin Plan & Module Management + Organization Subscription Tab
//      controls, plan presets, validity/source display, and platform boundary.
//   5. Live Monitoring & Examination Supervision workspace (`/dashboard/monitoring`),
//      per-exam monitor interventions (`/api/monitor/exams/[id]/extend`,
//      `/api/monitor/exams/[id]/restart`, `/api/monitor/exams/[id]/pause`),
//      Proctoring recordings & LiveKit status, and RBAC separation
//      (`proctoring.manage` vs `proctoring.view` / read-only Founder).
//   6. Exam Link & Expiration (`/dashboard/exams/links`), Examination Hints
//      (`/dashboard/exams/[id]/hints`), Candidate Links, Quiz Solutions /
//      Assignment / Results, Competition Phases / Questions / Monitoring / Reports.
//   7. Dynamic organization sidebar (`DashboardChrome` + `navModules`) &
//      strict separation of Platform Super Admin from Institution plan.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let checks = 0;
const failures = [];
const ok = (cond, msg) => {
  checks += 1;
  if (!cond) failures.push(msg);
};
const read = (p) => readFileSync(p, "utf8");

mkdirSync(".tmp-test-pmw", { recursive: true });
const build = spawnSync(
  "npx",
  [
    "tsc",
    "src/lib/modules.ts",
    "src/lib/navModules.ts",
    "src/lib/navAccess.ts",
    "src/lib/capability-rules.ts",
    "--target",
    "es2022",
    "--module",
    "commonjs",
    "--skipLibCheck",
    "--outDir",
    ".tmp-test-pmw",
  ],
  { encoding: "utf8" },
);
ok(build.status === 0, `tsc compile failed: ${String(build.stderr).slice(0, 500)}`);
const M = require(`${process.cwd()}/.tmp-test-pmw/modules.js`);
const N = require(`${process.cwd()}/.tmp-test-pmw/navModules.js`);
const C = require(`${process.cwd()}/.tmp-test-pmw/capability-rules.js`);

// ── 1. Differentiated Free / Premium / Institution matrices ──
{
  const free = M.PLAN_MODULE_TEMPLATES.free;
  const premium = M.PLAN_MODULE_TEMPLATES.premium;
  const inst = M.PLAN_MODULE_TEMPLATES.institution;

  const freeCount = Object.values(free).filter(Boolean).length;
  const premCount = Object.values(premium).filter(Boolean).length;
  const instCount = Object.values(inst).filter(Boolean).length;

  ok(freeCount === 12, `Free enables 12 essential modules (got ${freeCount})`);
  ok(premCount === 26, `Premium enables 26 modules (got ${premCount})`);
  ok(instCount === M.MODULE_CATALOG.length && instCount === 41, `Institution enables all 41 org modules (got ${instCount})`);
  ok(freeCount < premCount && premCount < instCount, "Strict tier progression: Free < Premium < Institution");

  // Strict subset hierarchy: Free ⊂ Premium ⊂ Institution.
  for (const key of M.MODULE_KEYS) {
    if (free[key]) ok(premium[key] === true, `Every Free module (${key}) is included in Premium`);
    if (premium[key]) ok(inst[key] === true, `Every Premium module (${key}) is included in Institution`);
  }

  // Spot-check key business differentiation rules.
  for (const k of ["classes", "students", "quizzes", "question_bank", "examinations", "exam_results", "quiz_results"]) {
    ok(free[k] === true, `Free includes essential module: ${k}`);
  }
  for (const k of ["exam_monitoring", "proctoring", "exam_links", "exam_share_codes", "exam_hints", "quiz_solutions", "paper_builder", "rubrics", "org_reports"]) {
    ok(free[k] === false, `Free excludes Premium+ module: ${k}`);
    ok(premium[k] === true, `Premium includes module: ${k}`);
    ok(inst[k] === true, `Institution includes module: ${k}`);
  }
  for (const k of ["competitions", "competition_phases", "competition_results", "academics", "teachers", "accounts", "platform", "exam_templates", "exam_reports"]) {
    ok(free[k] === false && premium[k] === false, `Free & Premium exclude Institutional module: ${k}`);
    ok(inst[k] === true, `Institution includes institutional module: ${k}`);
  }

  // Platform Super Admin separation: Institution never gets unrestricted_owner_access.
  const instCaps = C.resolveCapabilities({
    isSuperAdmin: false,
    planSlug: "institution",
    limits: {
      max_quizzes: -1, max_participants_per_session: 1000, max_exams: -1, max_members: -1,
      max_questions: -1, proctoring: true, advanced_reports: true, storage_mb: 51200,
      institutional: true, max_classes: -1, max_students: -1, multi_class_operations: true,
      central_asset_management: true, configurable_limits: true, premium_exam_experience: true,
      exam_duplicate_protection: true, exam_language_lock: true, floating_calculator: true,
      interactive_math_tools: true, premium_math_interface: true,
    },
    featureFlags: {
      live_quizzes: true, examinations: true, proctoring: true,
      question_paper_builder: true, scientific_calculator: true, official_exam_paper: true,
    },
  });
  ok(instCaps.institutional_administration === true, "Institution receives institutional_administration");
  ok(instCaps.unrestricted_owner_access === false, "Institution NEVER receives unrestricted_owner_access");
}

// ── 2. Non-destructive SQL migration matches code matrices 1:1 ──
{
  const sql = read("supabase/migrations/20261125180000_differentiated_plan_modules.sql");
  const stmts = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  ok(!/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i.test(stmts), "Migration contains zero DROP/DELETE/TRUNCATE");
  ok(stmts.includes("WHERE slug = 'free'") && stmts.includes("WHERE slug = 'premium'") && stmts.includes("WHERE slug = 'institution'"),
    "Migration updates free, premium, and institution plan rows");
  for (const key of M.MODULE_KEYS) {
    ok(sql.includes(`'${key}'`), `Migration explicitly sets module key '${key}'`);
  }
}

// ── 3. Zero "Not yet available" & honest operational availability ──
{
  for (const m of M.MODULE_CATALOG) {
    ok(m.surface.kind === "nav" || m.surface.kind === "page", `Module ${m.key} has real org surface (got ${m.surface.kind})`);
    ok(m.availability === "implemented" || m.availability === "external_dependency",
      `Module ${m.key} has honest availability (${m.availability})`);
  }
  const proctor = M.MODULE_CATALOG.find((m) => m.key === "proctoring");
  ok(proctor.availability === "external_dependency" && typeof proctor.externalDependency === "string" && proctor.externalDependency.includes("LIVEKIT"),
    "Proctoring explicitly documents its LiveKit external infrastructure dependency");

  // Unimplemented / unknown module is NEVER reported as operationallyAvailable.
  const ghost = M.resolveModuleOperationalState({ imaginary_module: true }, { imaginary_module: true }, "imaginary_module");
  ok(ghost.operationallyAvailable === false && ghost.availability === "not_implemented",
    "Unimplemented module is NEVER reported as operationallyAvailable even when forced ON");

  // External dependency reports live readiness honestly.
  const procNoLivekit = M.resolveModuleOperationalState(M.PLAN_MODULE_TEMPLATES.premium, null, "proctoring", { livekitConfigured: false });
  const procWithLivekit = M.resolveModuleOperationalState(M.PLAN_MODULE_TEMPLATES.premium, null, "proctoring", { livekitConfigured: true });
  ok(procNoLivekit.operationallyAvailable === true && procNoLivekit.externalInfrastructureReady === false,
    "Proctoring reports externalInfrastructureReady=false when LiveKit is unconfigured");
  ok(procWithLivekit.operationallyAvailable === true && procWithLivekit.externalInfrastructureReady === true,
    "Proctoring reports externalInfrastructureReady=true when LiveKit is configured");

  // Free org cannot see Premium/Institution nav items; Institution org sees all.
  const freeNav = N.isNavVisible({ href: "/dashboard/monitoring", audience: "operational" }, M.PLAN_MODULE_TEMPLATES.free, "admin");
  const premNav = N.isNavVisible({ href: "/dashboard/monitoring", audience: "operational" }, M.PLAN_MODULE_TEMPLATES.premium, "admin");
  const instCompNav = N.isNavVisible({ href: "/dashboard/competitions", audience: "operational" }, M.PLAN_MODULE_TEMPLATES.institution, "admin");
  const premCompNav = N.isNavVisible({ href: "/dashboard/competitions", audience: "operational" }, M.PLAN_MODULE_TEMPLATES.premium, "admin");
  ok(freeNav === false, "Free org hides Live Monitoring nav item");
  ok(premNav === true, "Premium org exposes Live Monitoring nav item");
  ok(premCompNav === false, "Premium org hides Institution-only Live Competitions nav item");
  ok(instCompNav === true, "Institution org exposes Live Competitions nav item");
}

// ── 4. Live Monitoring & Supervision workspace + API interventions ──
{
  const monPage = read("src/app/dashboard/monitoring/page.tsx");
  const monActions = read("src/app/dashboard/monitoring/actions.ts");
  ok(monPage.includes('requireModule(entitlement, "exam_monitoring"'), "Monitoring page enforces exam_monitoring module");
  ok(monPage.includes('permission: "proctoring.view"') && monPage.includes('permission: "proctoring.manage"'),
    "Monitoring page separates read-only proctoring.view from privileged proctoring.manage");
  ok(monPage.includes("grantOrgAttemptExtension") && monPage.includes("pauseOrgExamFromMonitor") && monPage.includes("authorizeOrgRetake"),
    "Monitoring page wires extra time, pause/resume, and restart/retake interventions");
  ok(monPage.includes("proctoring_recordings") && monPage.includes("audit_logs"),
    "Monitoring page displays authorized recordings and recorded intervention history");

  ok(monActions.includes('canOperate(ctx, org.id, "proctoring.manage", "exam_monitoring")'),
    "Monitoring actions enforce proctoring.manage + exam_monitoring server-side");
  ok(monActions.includes("exam.organization_id !== org.id"), "Monitoring actions verify strict organization ownership");
  ok(monActions.includes("await audit("), "Monitoring interventions are audited");

  for (const apiPath of [
    "src/app/api/monitor/exams/[id]/extend/route.ts",
    "src/app/api/monitor/exams/[id]/restart/route.ts",
    "src/app/api/monitor/exams/[id]/pause/route.ts",
  ]) {
    ok(existsSync(apiPath), `Monitor intervention API exists: ${apiPath}`);
    const src = read(apiPath);
    ok(src.includes("staffExamAccess(id, { write: true })"), `${apiPath} requires proctoring.manage + exam_monitoring`);
  }

  const proctoringPage = read("src/app/dashboard/proctoring/page.tsx");
  ok(proctoringPage.includes("proctoring_recordings") && proctoringPage.includes("/dashboard/monitoring"),
    "Proctoring page integrates authorized recordings and Live Monitoring link");

  const livekitRoute = read("src/app/api/livekit/token/route.ts");
  ok(livekitRoute.includes('moduleEnabled(ent.modules, "proctoring")'),
    "LiveKit token route enforces proctoring module overrides in addition to plan limits");
}

// ── 5. Newly wired org surfaces (Exam Links, Exam Hints, Quiz & Competition modules) ──
{
  const linksPage = read("src/app/dashboard/exams/links/page.tsx");
  const linkActions = read("src/app/dashboard/exams/link-actions.ts");
  ok(linksPage.includes('requireModule(entitlement, "exam_links"') && linkActions.includes('requireModule(entitlement, "exam_links"'),
    "Org Exam Links route & actions enforce exam_links entitlement");
  ok(linkActions.includes('.eq("organization_id", org.id)'), "Org Exam Links mutations are strictly org-scoped");

  const hintsPage = read("src/app/dashboard/exams/[id]/hints/page.tsx");
  const hintActions = read("src/app/dashboard/exams/[id]/hints/actions.ts");
  ok(hintsPage.includes('requireModule(entitlement, "exam_hints"') && hintActions.includes("findHintLeaks"),
    "Org Exam Hints studio enforces exam_hints entitlement and answer-leak guard");

  const quizPage = read("src/app/dashboard/quizzes/[id]/page.tsx");
  const quizActions = read("src/app/dashboard/quizzes/actions.ts");
  ok(quizPage.includes('"quiz_solutions"') && quizPage.includes('"quiz_assignment"') && quizPage.includes('"quiz_results"'),
    "Quiz detail page wires quiz_solutions, quiz_assignment, and quiz_results");
  ok(quizActions.includes("updateQuizSolutionsPolicy") && quizActions.includes("updateQuizAssignment"),
    "Quiz actions persist solution release policy and class assignment");

  const compDetail = read("src/app/dashboard/competitions/[id]/page.tsx");
  const compActions = read("src/app/dashboard/competitions/actions.ts");
  ok(
    compDetail.includes('"competition_phases"') &&
      compDetail.includes('"competition_questions"') &&
      compDetail.includes('"competition_monitoring"') &&
      compDetail.includes('"competition_reports"'),
    "Competition detail page wires phases, questions, monitoring, and reports",
  );
  ok(compActions.includes("createOrgCompetitionPhase"), "Competition actions support org-scoped event phase creation");

  const pmmClient = read("src/app/admin/plans/modules/PlanModulesAdminClient.tsx");
  ok(pmmClient.includes("pmm-plan-comparison") && pmmClient.includes("resolveModuleOperationalState") && pmmClient.includes("applyRecommendedPlanModules"),
    "Super Admin PMM console displays plan comparison, operational availability, and recommended tier reset");

  const subTab = read("src/app/admin/organizations/[id]/tabs/SubscriptionTab.tsx");
  ok(subTab.includes("Effective module entitlements") && subTab.includes("/admin/plans/modules"),
    "Super Admin org SubscriptionTab displays effective module entitlements and override link");
}

// ── 6. Final-fix invariants: dynamic coverage, controlled UI, exact workspace paths, zero stale messages ──
{
  const freeCov = M.computePlanCoverage(M.recommendedModulesForPlan("free"));
  const premCov = M.computePlanCoverage(M.recommendedModulesForPlan("premium"));
  const instCov = M.computePlanCoverage(M.recommendedModulesForPlan("institution"));
  ok(
    freeCov.enabled === 12 && freeCov.total === 41 && freeCov.percentLabel === "29.27%",
    `Free plan coverage computed dynamically: ${freeCov.enabled}/${freeCov.total} (${freeCov.percentLabel})`,
  );
  ok(
    premCov.enabled === 26 && premCov.total === 41 && premCov.percentLabel === "63.41%",
    `Premium plan coverage computed dynamically: ${premCov.enabled}/${premCov.total} (${premCov.percentLabel})`,
  );
  ok(
    instCov.enabled === 41 && instCov.total === 41 && instCov.percentLabel === "100%",
    `Institution plan coverage computed dynamically: ${instCov.enabled}/${instCov.total} (${instCov.percentLabel})`,
  );

  // Verify dynamic recalculation when a custom DB map has 15 modules (not hardcoded).
  const customMap = Object.fromEntries(M.MODULE_KEYS.map((k, idx) => [k, idx < 15]));
  const customCov = M.computePlanCoverage(customMap);
  ok(
    customCov.enabled === 15 && customCov.total === 41 && customCov.percentLabel === "36.59%",
    `Custom saved plan map recalculates dynamically: ${customCov.enabled}/${customCov.total} (${customCov.percentLabel})`,
  );

  // Institution with NULL modules (pure default inheritance) ALSO yields 41/41 — 100%.
  const nullPlanCov = M.computePlanCoverage(null);
  ok(
    nullPlanCov.enabled === 41 && nullPlanCov.total === 41 && nullPlanCov.percentLabel === "100%",
    "Null plan modules default-inherit all 41 modules (100%)",
  );

  // Override breakdown for Oak International School (Institution + null overrides)
  const oakBreakdown = M.computeOverrideBreakdown(M.recommendedModulesForPlan("institution"), null);
  ok(
    oakBreakdown.enabled === 41 &&
      oakBreakdown.total === 41 &&
      oakBreakdown.percentLabel === "100%" &&
      oakBreakdown.inherited === 41 &&
      oakBreakdown.inheritedEnabled === 41 &&
      oakBreakdown.explicitOn === 0 &&
      oakBreakdown.explicitOff === 0,
    "Oak Institution breakdown: 41/41 (100%), 41 inherited, 0 explicitly enabled, 0 explicitly disabled",
  );

  // Override breakdown for Free with 2 explicitly enabled & 1 explicitly disabled
  const mixedBreakdown = M.computeOverrideBreakdown(M.recommendedModulesForPlan("free"), {
    proctoring: true,
    exam_monitoring: true,
    quizzes: false,
  });
  ok(
    mixedBreakdown.enabled === 13 &&
      mixedBreakdown.inherited === 38 &&
      mixedBreakdown.inheritedEnabled === 11 &&
      mixedBreakdown.explicitOn === 2 &&
      mixedBreakdown.explicitOff === 1,
    `Mixed override breakdown accurately separates inherited vs explicit on/off (got enabled=${mixedBreakdown.enabled})`,
  );

  // Every single one of the 41 modules has a verified workspacePath, real existing /dashboard route file,
  // zero "none" surfaces, zero "not_implemented" availability, and strictly /admin/* reference links.
  const routeToPageFile = (href) => {
    const clean = href.split("?")[0].replace(/\/+$/, "");
    if (!clean.startsWith("/dashboard")) return null;
    const rel = clean.slice("/dashboard".length).replace(/^\/+/, "");
    return rel ? `src/app/dashboard/${rel}/page.tsx` : "src/app/dashboard/page.tsx";
  };
  for (const m of M.MODULE_CATALOG) {
    ok(
      typeof m.workspacePath === "string" && m.workspacePath.startsWith("Dashboard → "),
      `${m.key}: has explicit workspacePath (${m.workspacePath})`,
    );
    ok(m.surface.kind !== "none", `${m.key}: has real organization workspace surface (${m.surface.kind})`);
    ok(m.availability !== "not_implemented", `${m.key}: availability is operational (${m.availability})`);
    if (m.adminReferenceHref) {
      ok(
        m.adminReferenceHref.startsWith("/admin/"),
        `${m.key}: adminReferenceHref stays strictly under /admin/* (${m.adminReferenceHref})`,
      );
    }
    const hrefs = m.surface.kind === "nav" ? m.surface.hrefs : m.surface.kind === "page" ? [m.surface.href] : [];
    ok(hrefs.length > 0, `${m.key}: exposes at least one real organization route`);
    for (const h of hrefs) {
      const pageFile = routeToPageFile(h);
      ok(pageFile && existsSync(pageFile), `${m.key}: route ${h} exists on disk at ${pageFile}`);
    }
  }

  // PlanModulesAdminClient uses 100% controlled inputs, distinct color coding, progress bars, and workspace locations.
  const pmmClient = read("src/app/admin/plans/modules/PlanModulesAdminClient.tsx");
  ok(!pmmClient.includes("defaultChecked"), "PlanModulesAdminClient does not use uncontrolled defaultChecked");
  ok(!pmmClient.includes("defaultValue"), "PlanModulesAdminClient does not use uncontrolled defaultValue");
  ok(pmmClient.includes("checked={isIncluded}"), "PlanModulesAdminClient binds checkboxes via controlled checked={isIncluded}");
  ok(pmmClient.includes("value={state}"), "PlanModulesAdminClient binds override dropdowns via controlled value={state}");
  ok(pmmClient.includes("Organization Workspace Location"), "PlanModulesAdminClient renders Organization Workspace Location");
  ok(pmmClient.includes("Included in plan") && pmmClient.includes("Not included in plan"), "PlanModulesAdminClient separates Included vs Not included badges");
  ok(pmmClient.includes("Implemented &amp; operational") && pmmClient.includes("External dependency") && pmmClient.includes("Not implemented"), "PlanModulesAdminClient renders explicit technical implementation status pills");
  ok(pmmClient.includes('role="progressbar"'), "PlanModulesAdminClient renders visual coverage progress bars");
  ok(pmmClient.includes("Explicitly enabled") && pmmClient.includes("Explicitly disabled") && pmmClient.includes("Inherited from"), "PlanModulesAdminClient distinguishes inherited vs explicitly enabled/disabled org overrides");

  const pmmActions = read("src/app/admin/plans/modules/actions.ts");
  ok(pmmActions.includes("redirect(`/admin/plans/modules?plan=${planId}&ok=plan`)"), "savePlanModules preserves selected plan on redirect");

  // Zero stale "not yet available in this workspace" / "not yet available in the organization workspace" strings in dashboard.
  const { execFileSync } = await import("node:child_process");
  const staleHits = execFileSync(
    "bash",
    ["-lc", 'grep -Rni "not yet available in \\(this\\|the organization\\) workspace" src/app/dashboard || true'],
    { encoding: "utf8" },
  ).trim();
  ok(staleHits === "", `Zero stale 'not yet available' workspace messages in src/app/dashboard (found: ${staleHits || "none"})`);
}

if (failures.length) {
  console.error(`plan-module-workspace-integration: ${failures.length} FAILURE(S) (${checks} checks)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`plan-module-workspace-integration: ${checks} checks passed`);
