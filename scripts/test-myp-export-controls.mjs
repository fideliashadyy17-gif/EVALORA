/**
 * MYP surfaces, navigation and export controls.
 *
 * These are wiring checks: a report is only useful if every screen that should
 * offer it actually does, and a download is only safe if the route gates it.
 * The checks read the shipped source (the same technique the platform audit
 * suite uses) because the pages are server components whose authorization runs
 * against a live Supabase session.
 *
 * Run: node scripts/test-myp-export-controls.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};
const source = (path) => readFileSync(path, "utf8");

/* ── Export route ────────────────────────────────────────────────────── */
const route = source("src/app/api/myp/export/[format]/route.ts");

check("the export route supports PDF and XLSX only", () => {
  assert.match(route, /format !== "pdf" && format !== "xlsx"/);
  assert.match(route, /application\/pdf/);
  assert.match(route, /spreadsheetml\.sheet/);
});

check("an anonymous caller receives a 401, not a login page", () => {
  const unauthenticated = route.indexOf('status: 401');
  const tryBlock = route.indexOf('try {');
  assert.ok(unauthenticated > -1 && unauthenticated < tryBlock, "session check must run before the export try block");
  assert.match(route, /auth\.getUser\(\)/);
});

check("a redirect raised by an authorization helper never becomes a 500", () => {
  assert.match(route, /NEXT_REDIRECT/);
  assert.match(route, /status: 403/);
});

check("downloads are private and never cached", () => {
  assert.ok((route.match(/private, no-store/g) ?? []).length >= 2);
  assert.match(route, /"Cache-Control"/);
});

check("the route reuses the single loader instead of doing its own arithmetic", () => {
  assert.match(route, /loadMypResult\(/);
  assert.match(route, /loadMypResults\(/);
  assert.match(route, /summarizeMyp/);
  assert.doesNotMatch(route, /points_awarded/);
  assert.doesNotMatch(route, /gradeFromTotal/);
});

check("the learner path is student-scoped and released-only", () => {
  assert.match(route, /includeUnpublished: false/);
  assert.match(route, /studentId: student\.id/);
  assert.match(route, /createAdminClient/);
  assert.match(route, /\.eq\("user_id", access\.ctx\.profile\.id\)/);
  assert.match(route, /\.eq\("organization_id", access\.org\.id\)/);
});

check("collective exports require export rights", () => {
  assert.match(route, /Not authorised to export collective results/);
  assert.match(route, /Not authorised to export results/);
});

/* ── Workspace surfaces ──────────────────────────────────────────────── */
const listPage = source("src/app/dashboard/myp-results/page.tsx");
const detailPage = source("src/app/dashboard/myp-results/[attemptId]/page.tsx");
const settingsPage = source("src/app/dashboard/myp-results/settings/page.tsx");

check("the workspace list refuses learners and empty org scopes", () => {
  assert.match(listPage, /isMypLearner/);
  assert.match(listPage, /organizationIds\.length/);
  assert.match(listPage, /redirect\("\/dashboard"\)/);
});

check("the workspace list offers both export formats with the active filters", () => {
  assert.match(listPage, /\/api\/myp\/export\/pdf/);
  assert.match(listPage, /\/api\/myp\/export\/xlsx/);
  assert.match(listPage, /searchParams|searchParamsPromise/);
});

check("the detail page links the individual reports and archives snapshots", () => {
  assert.match(detailPage, /scope=individual&attempt=/);
  assert.match(detailPage, /recordMypSnapshot/);
  assert.match(detailPage, /loadMypHistory/);
});

check("the settings page is gated on manage rights", () => {
  assert.match(settingsPage, /canManage|can_manage|mypAccess/);
  assert.match(settingsPage, /saveMypFramework|saveMypBoundaries|applyMypCriteriaPreset/);
});

check("configuration writes re-check the role on the server", () => {
  const actions = source("src/app/dashboard/myp-results/actions.ts");
  assert.match(actions, /requireUser\(\)/);
  assert.match(actions, /can\(ctx, org\.id/);
  assert.match(actions, /\["owner", "admin"\]/);
  assert.match(actions, /revalidatePath/);
});

/* ── Super Admin console ─────────────────────────────────────────────── */
const adminList = source("src/app/admin/myp-results/page.tsx");
const adminDetail = source("src/app/admin/myp-results/[attemptId]/page.tsx");

check("the Super Admin console requires the Super Admin role", () => {
  assert.match(adminList, /requireSuperAdmin/);
  assert.match(adminDetail, /requireSuperAdmin/);
});

check("the Super Admin console can export across organizations", () => {
  assert.match(adminList, /\/api\/myp\/export\/pdf/);
  assert.match(adminList, /mypAccess\(\{ global: true \}\)/);
  assert.match(adminList, /organization|org=/);
});

check("the Super Admin detail page is explicitly cross-tenant", () => {
  assert.match(adminDetail, /global: true/);
  assert.match(adminDetail, /organizationIds/);
});

/* ── Learner surface ─────────────────────────────────────────────────── */
const studentResult = source("src/app/student/results/[attemptId]/page.tsx");

check("the learner page only shows the learner's own released result", () => {
  assert.match(studentResult, /isMypLearner/);
  assert.match(studentResult, /studentId: student\.id/);
  assert.match(studentResult, /includeUnpublished: false/);
  assert.match(studentResult, /\.eq\("user_id", ctx\.profile\.id\)/);
});

check("the learner page can download the same individual report", () => {
  assert.match(studentResult, /\/api\/myp\/export\/pdf\?scope=individual&attempt=/);
});

/* ── Navigation and existing surfaces ────────────────────────────────── */
const dashboardNav = source("src/components/dashboard/DashboardChrome.tsx");
const adminNav = source("src/app/admin/AdminShell.tsx");
const examReport = source("src/app/dashboard/reports/exam/[id]/page.tsx");
const adminResults = source("src/app/admin/examinations/results/page.tsx");
const studentHub = source("src/app/student/page.tsx");

check("the workspace navigation exposes MYP Results", () => {
  assert.match(dashboardNav, /href: "\/dashboard\/myp-results"/);
});

check("the Super Admin navigation exposes MYP Results & Reports", () => {
  assert.match(adminNav, /href: "\/admin\/myp-results"/);
});

check("the examination report links the MYP results and exports for its paper", () => {
  assert.match(examReport, /\/dashboard\/myp-results\?\$\{mypQuery\}/);
  assert.match(examReport, /\/api\/myp\/export\/pdf\?scope=collective&\$\{mypQuery\}/);
  assert.match(examReport, /\/api\/myp\/export\/xlsx\?scope=collective&\$\{mypQuery\}/);
  assert.match(examReport, /hasCriteria/);
});

check("the Super Admin examination results link the MYP console and exports", () => {
  assert.match(adminResults, /\/admin\/myp-results\?exam=/);
  assert.match(adminResults, /\/api\/myp\/export\/pdf\?scope=collective&exam=/);
  assert.match(adminResults, /\/api\/myp\/export\/xlsx\?scope=collective&exam=/);
});

check("the learner workspace links a released result only", () => {
  assert.ok(studentHub.includes('/student/results/${attempt.id}'));
  assert.match(studentHub, /results_published/);
});

check("no surface builds its own grade arithmetic", () => {
  for (const path of [
    "src/app/dashboard/myp-results/page.tsx",
    "src/app/dashboard/myp-results/[attemptId]/page.tsx",
    "src/app/admin/myp-results/page.tsx",
    "src/app/admin/myp-results/[attemptId]/page.tsx",
    "src/app/student/results/[attemptId]/page.tsx",
  ]) {
    assert.doesNotMatch(source(path), /levelFromPercent|gradeFromTotal/, `${path} duplicates grading logic`);
  }
});

console.log(`\n${passed} checks passed — MYP surfaces, navigation and export controls`);
