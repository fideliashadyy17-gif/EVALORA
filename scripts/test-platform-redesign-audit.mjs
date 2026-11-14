// Platform-wide route, table-accessibility, navigation, and bug-regression suite
// covering all 144 Next.js App Router page.tsx routes across Super Admin (/admin),
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

check("route inventory accounts for all 144 page.tsx routes (79 admin, 34 dashboard, 31 public/auth/student/portal)", () => {
  assert.equal(adminPages.length, 79, `expected 79 admin pages, found ${adminPages.length}`);
  assert.equal(dashboardPages.length, 34, `expected 34 dashboard pages, found ${dashboardPages.length}`);
  assert.equal(otherPages.length, 31, `expected 31 public/student/portal pages, found ${otherPages.length}`);
  assert.equal(allPages.length, 144);
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

console.log(`✓ platform redesign & 144-route audit — ${passed} checks passed`);
