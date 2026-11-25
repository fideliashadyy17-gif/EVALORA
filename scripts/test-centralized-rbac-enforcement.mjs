// End-to-end verification of centralized RBAC enforcement across API routes,
// server actions, dashboard pages, Founder supervision UI, and module sync.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// 1. Authorization inventory must show ZERO legacy can() call sites in operational code.
await test("authorization inventory has zero legacy can() call sites across src/", async () => {
  const inv = JSON.parse(readFileSync("docs/security/authorization-inventory.json", "utf8"));
  const legacyCanSites = inv.sites.filter((s) => s.guard === "can");
  assert.deepEqual(legacyCanSites, [], `Unexpected legacy can() call sites: ${JSON.stringify(legacyCanSites)}`);
  assert.ok((inv.counts.canOperate ?? 0) >= 90, `Expected >= 90 canOperate sites, got ${inv.counts.canOperate}`);
  assert.ok((inv.counts.canOperateMany ?? 0) >= 7, `Expected >= 7 canOperateMany sites, got ${inv.counts.canOperateMany}`);
});

// 2. Zero host_id authorization bypasses in live control routes, host actions, or host page.
await test("live competition routes and host console have zero host_id authorization bypasses", async () => {
  const files = [
    "src/app/api/live/control/route.ts",
    "src/app/api/live/host/state/route.ts",
    "src/app/api/live/participants/extra-time/route.ts",
    "src/app/dashboard/sessions/[id]/host/actions.ts",
    "src/app/dashboard/sessions/[id]/host/page.tsx",
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.ok(!src.includes("session.host_id"), `${file} must not bypass RBAC via session.host_id`);
    assert.ok(src.includes('canOperate(ctx, '), `${file} must authorize via canOperate`);
    assert.ok(src.includes('"competitions.edit"'), `${file} must check competitions.edit`);
  }
});

// 3. All mutating /api/monitor/* routes require proctoring.manage via requireMonitorStaff({ write: true }).
await test("mutating /api/monitor routes require proctoring.manage (write: true)", async () => {
  const monitorHelper = readFileSync("src/lib/monitorAccess.ts", "utf8");
  assert.ok(monitorHelper.includes('"proctoring.manage"') && monitorHelper.includes('"proctoring.view"'));
  assert.ok(!monitorHelper.includes("PROCTOR_ROLES"));
  for (const file of [
    "src/app/api/monitor/attempts/[attemptId]/messages/route.ts",
    "src/app/api/monitor/attempts/[attemptId]/read/route.ts",
    "src/app/api/monitor/exams/[id]/pause/route.ts",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.ok(src.includes("{ write: true }"), `${file} must pass { write: true } to requireMonitorStaff`);
  }
});

// 4. MYP access helper uses centralized RBAC and excludes school_founder & learners.
await test("mypAccess delegates to canOperateMany and blocks school_founder and learners", async () => {
  const src = readFileSync("src/lib/mypAccess.ts", "utf8");
  assert.ok(src.includes("canOperateMany"));
  assert.ok(src.includes('role === "school_founder"'));
  assert.ok(src.includes('"results.view"') && src.includes('"reports.export"') && src.includes('"results.validate"'));
  assert.ok(!src.includes("can(ctx,"));
});

// 5. Team role update prevents escalation to owner or school_founder and protects school_founder rows.
await test("team updateMemberRole blocks escalation to owner or school_founder", async () => {
  const src = readFileSync("src/app/dashboard/team/actions.ts", "utf8");
  assert.ok(src.includes('member.role === "owner" || member.role === "school_founder"'));
  assert.ok(src.includes('!["admin", "teacher", "organizer", "supervisor", "corrector", "student", "candidate"].includes(role)'));
});

// 6. Competitions rankings page checks both modules AND centralized RBAC competitions.view.
await test("competitions rankings page enforces competitions + competition_results modules and competitions.view RBAC", async () => {
  const src = readFileSync("src/app/dashboard/competitions/rankings/page.tsx", "utf8");
  assert.ok(src.includes('requireModule(entitlement, "competitions"'));
  assert.ok(src.includes('requireModule(entitlement, "competition_results"'));
  assert.ok(src.includes('canOperate(ctx, org.id, "competitions.view", "competition_results")'));
});

// 7. canOperateMany batches RBAC checks into one checkPermissions RPC and intersects with module entitlements.
await test("canOperateMany batches permission checks and intersects module entitlements", async () => {
  const file = path.resolve("scripts/__centralized_op_access.cjs");
  let batchCalls = 0;
  let granted = new Set(["exams.edit", "results.publish"]);
  let enabledModules = { examinations: true, exam_publication: false };

  const load = Module._load;
  Module._load = function (req, parent) {
    if (parent?.filename === file) {
      if (req === "./rbac") {
        return {
          hasPermission: async (_ctx, _org, perm) => granted.has(perm),
          checkPermissions: async (_ctx, _org, perms) => {
            batchCalls += 1;
            const out = {};
            for (const p of perms) out[p] = granted.has(p);
            return out;
          },
        };
      }
      if (req === "./entitlements") {
        return { getEntitlementFor: async () => ({ modules: enabledModules }) };
      }
      if (req === "./modules") {
        return { moduleEnabled: (mods, key) => mods?.[key] !== false };
      }
      if (req === "./supabase/server") {
        return { createClient: async () => ({}) };
      }
    }
    return load.apply(this, arguments);
  };
  const m = new Module(file);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  try {
    m._compile(
      ts.transpileModule(readFileSync("src/lib/operationalAccess.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      file,
    );
  } finally {
    Module._load = load;
  }

  const ctx = { user: { id: "u1" }, profile: { status: "active", platform_role: "user" }, memberships: [] };
  const result = await m.exports.canOperateMany(ctx, "org-1", {
    canEditExam: { permission: "exams.edit", module: "examinations" },
    canPublish: { permission: "results.publish", module: "exam_publication" },
    canPublishNoMod: { permission: "results.publish" },
    canDeleteExam: { permission: "exams.delete", module: "examinations" },
  });

  assert.equal(batchCalls, 1, "canOperateMany must batch RBAC checks into a single checkPermissions call");
  assert.equal(result.canEditExam, true, "RBAC ON + module ON => true");
  assert.equal(result.canPublish, false, "RBAC ON + module OFF => false");
  assert.equal(result.canPublishNoMod, true, "RBAC ON + no module => true");
  assert.equal(result.canDeleteExam, false, "RBAC OFF + module ON => false");

  // Inactive user fails closed across all keys without calling DB
  batchCalls = 0;
  const suspended = await m.exports.canOperateMany(
    { user: { id: "u2" }, profile: { status: "suspended", platform_role: "user" }, memberships: [] },
    "org-1",
    { canEditExam: { permission: "exams.edit", module: "examinations" } },
  );
  assert.equal(suspended.canEditExam, false);
  assert.equal(batchCalls, 0);
});

// 8. Founder supervision page renders all 17 domains read-only with zero forms/mutations.
await test("/supervision/page.tsx renders all 17 domains via React SSR strictly read-only", async () => {
  const src = readFileSync("src/app/supervision/page.tsx", "utf8");
  assert.ok(!src.includes("<form"), "Supervision page must not contain any mutation <form>");
  assert.ok(!src.includes("publishResults") && !src.includes("validateResults") && !src.includes("deleteExam"));
  assert.ok(src.includes('client.rpc("access_supervision_overview"'));

  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = (await import("react")).default;
  const supFile = path.resolve("scripts/__supervision_page_ssr.cjs");
  let rpcResponse = {
    data: {
      organization_id: "0a400000-0000-4000-8000-000000000001",
      organization: { id: "0a400000-0000-4000-8000-000000000001", name: "Synthetic Academy", slug: "syn", status: "active" },
      enabled_modules: {
        plan_slug: "institution",
        plan_name: "Institution",
        subscription_status: "active",
        current_period_end: "2031-11-06T00:00:00Z",
        effective_modules: { competitions: true, competition_code: true, competition_results: true, proctoring: false },
      },
      summary: { classes: 18, questions: 2479, examinations: 50, competitions: 28, quizzes: 78 },
      participation_summary: { total_registered_candidates: 420, total_attempts: 380, in_progress: 12, submitted: 368, graded: 300, awaiting_manual_grading: 68, average_score_pct: 74.5, completion_rate_pct: 96.8 },
      academic_structures: { total_classes: 18, active_classes: 18, subjects_count: 10, departments_count: 4, academic_years_count: 2, grading_systems_count: 3, classes: [{ id: "c1", name: "Grade 9 MYP4", status: "active", curriculum_track: "IB MYP" }] },
      question_bank_overview: { total: 2479, published: 2400, draft: 79, by_type: { single_choice: 1200, structured_response: 1279 } },
      paper_builder_overview: { total_papers: 78, published_papers: 70, draft_papers: 8, archived_papers: 0, templates_count: 2, recent_papers: [{ id: "p1", title: "MYP4 Math Paper 1", status: "published" }] },
      examinations: [
        { id: "e1", title: "Synthetic Published Term Exam", status: "closed", publication_state: "published", total_attempts: 40, submitted_attempts: 40, graded_attempts: 40, average_score_pct: 81.2 },
        { id: "e2", title: "Synthetic Unpublished Mock Exam", status: "open", publication_state: "ongoing_correction", total_attempts: 35, submitted_attempts: 30, graded_attempts: 18, awaiting_manual_attempts: 12, pending_manual_items: 24, average_score_pct: 68.4 },
      ],
      assessment_configuration: [{ exam_id: "e1", title: "Synthetic Published Term Exam", status: "closed", duration_minutes: 90, grading_system: "myp", result_publication_mode: "manual", lockdown_enabled: true, proctoring_enabled: true, calculator_enabled: true, shared_link_enabled: true }],
      candidate_admission_overview: { shared_link_enabled_exams: 12, total_exams_with_admission: 50, total_candidates: 420, by_status: { registered: 40, submitted: 380 }, by_source: { bulk_import: 300, shared_link: 120 } },
      marking_progress: { graded_attempts: 300, awaiting_manual_grading: 68, pending_manual_items: 95, grading_failed_attempts: 2, moderated_answers: 14, correction_completion_pct: 81.5 },
      results: {
        submitted_attempts: 368,
        graded_attempts: 300,
        average_score_pct: 74.5,
        published_exam_count: 1,
        unpublished_exam_count: 1,
        awaiting_validation_exam_count: 1,
        ongoing_correction_exam_count: 1,
        published: [{ exam_id: "e1", title: "Synthetic Published Term Exam", exam_status: "closed", grades_published_at: "2026-11-20T10:00:00Z", submitted_attempts: 40, graded_attempts: 40, average_score_pct: 81.2, min_score_pct: 45, max_score_pct: 98 }],
        unpublished: [{ exam_id: "e2", title: "Synthetic Unpublished Mock Exam", exam_status: "open", results_validated: false, total_attempts: 35, submitted_attempts: 30, in_progress_attempts: 5, graded_attempts: 18, awaiting_manual_attempts: 12, failed_grading_attempts: 0, pending_manual_items: 24, correction_progress_pct: 60.0, average_score_pct: 68.4 }],
        awaiting_validation: [{ exam_id: "e2", title: "Synthetic Unpublished Mock Exam", exam_status: "open", submitted_attempts: 30, graded_attempts: 18, awaiting_manual_attempts: 12, correction_progress_pct: 60.0, average_score_pct: 68.4 }],
        ongoing_correction: [{ exam_id: "e2", title: "Synthetic Unpublished Mock Exam", exam_status: "open", total_attempts: 35, submitted_attempts: 30, in_progress_attempts: 5, graded_attempts: 18, awaiting_manual_attempts: 12, failed_grading_attempts: 0, pending_manual_items: 24, correction_progress_pct: 60.0 }],
      },
      quizzes_overview: { total: 78, published: 70, draft: 8, archived: 0, total_sessions: 15, live_sessions: 1, ended_sessions: 14 },
      competitions: [{ id: "comp1", title: "Annual Math Olympiad", status: "completed", results_published: true }],
      rankings_and_reports: { exam_performance_rankings: [{ exam_id: "e1", title: "Synthetic Published Term Exam", results_published: true, graded_attempts: 40, average_score_pct: 81.2, pass_rate_pct: 92.5 }], competitions_with_published_results: 1 },
      proctoring_overview: { proctored_exams: 10, lockdown_exams: 8, total_rooms: 12, active_rooms: 2, total_incidents: 5, open_incidents: 1, investigating_incidents: 1, resolved_incidents: 3 },
    },
    error: null,
  };

  const load = Module._load;
  Module._load = function (req, parent) {
    if (parent?.filename === supFile) {
      if (req === "@/lib/auth") return { requireUser: async () => ({ user: { id: "f1" }, profile: { status: "active", platform_role: "user" }, memberships: [] }), activeOrg: () => ({ id: "0a400000-0000-4000-8000-000000000001", name: "Synthetic Academy", role: "school_founder", status: "active" }) };
      if (req === "@/lib/rbac") return { requirePermission: async () => true };
      if (req === "@/lib/supabase/server") return { createClient: async () => ({ rpc: async () => rpcResponse }) };
      if (req === "@/lib/modules") return {
        MODULE_CATALOG: [
          { key: "competitions", label: "Live Competitions" },
          { key: "competition_code", label: "Assessment Code" },
          { key: "competition_results", label: "Rankings & Results" },
          { key: "proctoring", label: "Proctoring" },
        ],
        moduleEnabled: (mods, k) => mods?.[k] !== false,
      };
      if (req === "@/components/ui") return {
        Badge: ({ children }) => React.createElement("span", null, children),
        Card: ({ children, id }) => React.createElement("div", { id }, children),
        DataTable: ({ head, children }) => React.createElement("table", null, React.createElement("thead", null, React.createElement("tr", null, head.map((h, i) => React.createElement("th", { key: i }, h)))), React.createElement("tbody", null, children)),
        PageTitle: ({ title, eyebrow, subtitle }) => React.createElement("header", null, React.createElement("p", null, eyebrow), React.createElement("h1", null, title), React.createElement("p", null, subtitle)),
        StatCard: ({ label, value, hint }) => React.createElement("div", null, React.createElement("span", null, label), React.createElement("strong", null, String(value)), hint ? React.createElement("small", null, hint) : null),
      };
      if (req === "@/components/SignOutButton") return { SignOutButton: () => React.createElement("button", { type: "button" }, "Sign out") };
      if (req === "@/lib/utils") return { fmtDate: (v) => String(v), fmtDateTime: (v) => String(v) };
      if (req === "next/navigation") return { redirect: (u) => { throw new Error(`REDIRECT:${u}`); } };
    }
    return load.apply(this, arguments);
  };
  const m = new Module(supFile);
  m.filename = supFile;
  m.paths = Module._nodeModulePaths(path.dirname(supFile));
  try {
    m._compile(
      ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      }).outputText,
      supFile,
    );
  } finally {
    Module._load = load;
  }

  const html = renderToStaticMarkup(await m.exports.default());
  assert.ok(!html.includes("<form"), "Rendered Supervision HTML must contain zero forms");
  for (const expected of [
    "Synthetic Academy",
    "Synthetic Published Term Exam",
    "Synthetic Unpublished Mock Exam",
    "Ongoing correction progress",
    "Results awaiting validation",
    "Published results",
    "Unpublished results",
    "Assessment configuration",
    "Candidate admission overview",
    "Grade 9 MYP4",
    "Question bank overview",
    "Paper Builder overview",
    "Annual Math Olympiad",
    "92.5%",
    "Proctoring overview",
    "Institution",
    "Live Competitions",
    "Assessment Code",
    "Rankings &amp; Results",
  ]) {
    assert.ok(html.includes(expected), `Rendered supervision HTML missing: ${expected}`);
  }
  assert.ok(html.includes("Disabled"), "Disabled module (proctoring) must render Disabled badge");

  // Revoked / denied RPC must fail closed with sanitized error
  rpcResponse = { data: null, error: { message: "permission denied for function access_supervision_overview" } };
  await assert.rejects(() => m.exports.default(), /Institutional overview unavailable/);
});

// 9. Admin RBAC console banner reflects centralized enforcement.
await test("/admin/rbac/page.tsx reflects active centralized enforcement", async () => {
  const src = readFileSync("src/app/admin/rbac/page.tsx", "utf8");
  assert.ok(!src.includes("Staged rollout boundary"), "Stale staged rollout warning should be removed");
  assert.ok(src.includes("Centralized enforcement active"));
});

console.log(`\n${passed} centralized RBAC enforcement checks passed.`);
