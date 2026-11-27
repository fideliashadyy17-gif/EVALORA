// Platform-wide route, table-accessibility, navigation, and bug-regression suite
// covering all 191 Next.js App Router page.tsx routes across Super Admin (/admin),
// Organization Workspace (/dashboard), Student & Candidate Assessment flows,
// Multi-tenant Portals, Live Screens, and Public/Auth surfaces.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walkPages(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkPages(full, acc);
    else if (entry === "page.tsx") acc.push(full.replace(/\\/g, "/"));
  }
  return acc.sort();
}

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
}

const allPages = walkPages("src/app");
const adminPages = allPages.filter((p) => p.startsWith("src/app/admin/"));
const dashboardPages = allPages.filter((p) => p.startsWith("src/app/dashboard/"));
const otherPages = allPages.filter(
  (p) => !p.startsWith("src/app/admin/") && !p.startsWith("src/app/dashboard/"),
);

check("route inventory accounts for all 195 page.tsx routes (96 admin, 62 dashboard, 37 public/auth/student/portal)", () => {
  // 95 = 89 + the five Platform Control Center surfaces added for the centralized
  //      configuration architecture: /admin/control-center (global defaults),
  //      /admin/control-center/organizations (per-organization overrides list),
  //      /admin/control-center/organizations/[id] (one organization's overrides),
  //      /admin/control-center/history (versioned revisions + rollback) and
  //      /admin/control-center/presets (reusable configuration presets)
  //      + /admin/questions/templates (the Question Studio template library that
  //        Super Admin curates for every tenant)
  //      + /admin/control-center/notifications (the notification wording console:
  //        every event EVALORA generates, the copy in force for the platform or
  //        for one organization, a live preview and a test delivery).
  assert.equal(adminPages.length, 96, `expected 96 admin pages, found ${adminPages.length}`);
  // 57 = 46 + /dashboard/monitoring + /dashboard/exams/links + /dashboard/exams/[id]/hints
  //      + /dashboard/exams/[id]/adjustments (controlled score adjustments)
  //      + /dashboard/score-adjustments (the single workspace Score Adjustment studio;
  //        the per-exam route above delegates to it).
  //      + /dashboard/settings/configuration (the organization-level Control
  //        Center, showing inherited vs customized values with Reset to Inherit)
  //      + /dashboard/questions/templates (the read-only template library authors
  //        start a question from)
  //      + the four Assessment Contributions & Grade Consolidation surfaces:
  //        /dashboard/assessments (workspace: create, class-wide and individual
  //        assessment records), /dashboard/assessments/[id] (the gradebook for one
  //        assessment), /dashboard/exams/[id]/grade-adjustments (the unlimited
  //        individual adjustment ledger) and /dashboard/exams/[id]/consolidation
  //        (the configurable consolidation engine with preview and publication)
  //      + /dashboard/settings/notifications (the organization's own notification
  //        wording, with the same resolver and the same store as the platform
  //        console, scoped from the session rather than from a posted field).
  // 62 = 58 + the four AI-core surfaces:
  //      /dashboard/ai (the native assistant), /dashboard/ai/agents (external
  //      agent credentials and narrowing), /dashboard/ai/approvals (the human
  //      approval queue) and /dashboard/ai/activity (the AI operation journal).
  assert.equal(dashboardPages.length, 62, `expected 62 dashboard pages, found ${dashboardPages.length}`);
  // 37 = 36 + /maintenance, the public holding page the middleware rewrites to
  //      while platform_behavior.maintenance_mode is on.
  assert.equal(otherPages.length, 37, `expected 37 public/student/portal pages, found ${otherPages.length}`);
  assert.equal(allPages.length, 195);
});

check("the landing page advertises the census this suite just walked", () => {
  // src/lib/landing.ts sells three figures on the public home page: a
  // "Product routes" stat and two "Verified in /admin|/dashboard (N routes)"
  // evidence lines under the role workspaces. Its comment claimed the figure was
  // asserted rather than typed in by hand, but nothing read the file, and the
  // claim had drifted four routes behind the tree. Reading it here makes the
  // comment true and turns the next new page into a failing check instead of a
  // stale advertisement.
  const landing = readFileSync("src/lib/landing.ts", "utf8");

  const product = /k: "Product routes", v: "(\d+)"/.exec(landing);
  assert.ok(product, "the landing stats still advertise a product-route count");
  assert.equal(
    Number(product?.[1]),
    allPages.length,
    `the home page advertises ${product?.[1]} product routes; the tree has ${allPages.length}`,
  );

  const admin = /Verified in \/admin \((\d+) routes\)/.exec(landing);
  assert.ok(admin, "the Super Admin workspace still cites its route count");
  assert.equal(
    Number(admin?.[1]),
    adminPages.length,
    `the home page advertises ${admin?.[1]} /admin routes; the tree has ${adminPages.length}`,
  );

  const dashboard = /Verified in \/dashboard \((\d+) routes\)/.exec(landing);
  assert.ok(dashboard, "the organization workspace still cites its route count");
  assert.equal(
    Number(dashboard?.[1]),
    dashboardPages.length,
    `the home page advertises ${dashboard?.[1]} /dashboard routes; the tree has ${dashboardPages.length}`,
  );
});

for (const pagePath of adminPages) {
  const src = readFileSync(pagePath, "utf8");
  check(`${pagePath}: uses unified <Table> (no raw <table> tags)`, () => {
    assert.ok(!src.includes("<table"), `${pagePath} still contains a raw <table tag`);
  });
  if (src.includes("<PageTitle")) {
    check(`${pagePath}: PageTitle carries executive eyebrow`, () => {
      assert.ok(src.includes("eyebrow="), `${pagePath} PageTitle is missing eyebrow`);
    });
  }
}

for (const pagePath of dashboardPages) {
  const src = readFileSync(pagePath, "utf8");
  if (!pagePath.endsWith("exams/[id]/paper/page.tsx")) {
    check(`${pagePath}: uses unified <DataTable> (no raw <table> tags)`, () => {
      assert.ok(!src.includes("<table"), `${pagePath} still contains a raw <table tag`);
    });
  }
  if (src.includes("<PageTitle")) {
    check(`${pagePath}: PageTitle carries workspace eyebrow`, () => {
      assert.ok(src.includes("eyebrow="), `${pagePath} PageTitle is missing eyebrow`);
    });
  }
}

check("Bug #1 regression: admin operations never links to nonexistent /dashboard/sessions", () => {
  const src = readFileSync("src/app/admin/operations/page.tsx", "utf8");
  assert.ok(!src.includes('"/dashboard/sessions"'));
  assert.ok(src.includes('"/dashboard/competitions"'));
  assert.ok(src.includes('"/dashboard/proctoring"'));
});

check("Bug #2 regression: admin organizations/access exposes <Select name=\"state\"> filter control", () => {
  const src = readFileSync("src/app/admin/organizations/access/page.tsx", "utf8");
  assert.ok(src.includes('name="state"'));
});

check("Bug #3 regression: admin questions table has 10 aligned headers including Class & Curriculum and Editorial Review", () => {
  const src = readFileSync("src/app/admin/questions/page.tsx", "utf8");
  assert.ok(src.includes('"Class & Curriculum"'));
  assert.ok(src.includes('"Editorial Review"'));
  assert.ok(src.includes("colSpan={10}"));
});

check("Bug #4 regression: admin competition events page is multi-tenant, neutral-titled, and links to valid ?exam= route", () => {
  const eventsSrc = readFileSync("src/app/admin/competitions/events/page.tsx", "utf8");
  const examsSrc = readFileSync("src/app/admin/examinations/page.tsx", "utf8");
  assert.ok(!eventsSrc.includes('"Oak event phases"'));
  assert.ok(eventsSrc.includes('name="event"'));
  assert.ok(!eventsSrc.includes("/admin/examinations/${"));
  assert.ok(eventsSrc.includes("/admin/examinations?exam="));
  assert.ok(examsSrc.includes("sp.exam"));
});

check("Bug #5 regression: organization settings links directly to /dashboard/settings/proctoring", () => {
  const src = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
  assert.ok(src.includes("/dashboard/settings/proctoring"));
});

check("Bug #6 regression: printable exam packet has no stray curly quote in candidate access_code fallback", () => {
  const src = readFileSync("src/app/dashboard/exams/[id]/paper/page.tsx", "utf8");
  assert.ok(!src.includes("—”"));
});

check("Bug #7 regression: createOrgCompetition persists max_participants in competitions insert", () => {
  const src = readFileSync("src/app/dashboard/competitions/actions.ts", "utf8");
  assert.ok(src.includes("max_participants: cappedParticipants"));
});

check("Student & candidate entry surfaces expose <main> landmarks and cross-links", () => {
  for (const entryPath of [
    "src/app/exam/page.tsx",
    "src/app/exam-access/page.tsx",
    "src/app/exam/join/[token]/JoinClient.tsx",
    "src/app/join/page.tsx",
    "src/app/retake/[requestId]/page.tsx",
    "src/app/workspaces/page.tsx",
    "src/app/student/page.tsx",
  ]) {
    const src = readFileSync(entryPath, "utf8");
    assert.ok(src.includes("<main"), `${entryPath} is missing <main> landmark`);
  }
  const pricingSrc = readFileSync("src/app/pricing/page.tsx", "utf8");
  assert.ok(!pricingSrc.includes("<table"), "pricing/page.tsx should use <DataTable>");
});

console.log(`✓ platform redesign & 195-route audit — ${passed} checks passed`);
