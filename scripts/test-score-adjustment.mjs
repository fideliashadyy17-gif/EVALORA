/**
 * Comprehensive verification suite for Controlled Examination Score Adjustment.
 *
 * Exercises:
 *  1. Plan exclusivity (Institution active/trialing ONLY — Free/Premium/expired denied)
 *  2. Pre-validation & publication lifecycle locks
 *  3. Category extraction (MYP criteria incl. split shares, paper sections, overall)
 *  4. Eligibility, strict score capping, duplicate guards, and selected vs all-eligible preview
 *  5. Silent MYP recalculation (marks, levels, overall MYP 1–7 grade) with ZERO student bonus leakage
 *  6. Recompute preservation across subsequent marking/regrading
 *  7. Real PostgreSQL (PGlite) execution of `supabase/migrations/20261125230000_score_adjustments.sql`:
 *     - Atomic RPC commits & rollbacks
 *     - Institution plan enforcement inside SQL
 *     - Role / RBAC & cross-tenant isolation inside SQL
 *     - Pre-validation & publication locks inside SQL
 *     - Idempotency & duplicate criterion-adjustment prevention
 *     - Score-cap & optimistic-concurrency checks
 *     - Append-only immutability triggers
 *     - Strict staff-only RLS (zero student / cross-tenant visibility)
 *  8. Static security & surface integration verification
 *
 * Run standalone: `node scripts/test-score-adjustment.mjs`
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path, { resolve } from "node:path";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const ROOT = process.cwd();
let passed = 0;

function check(label, fn) {
  fn();
  passed += 1;
}

async function checkAsync(label, fn) {
  await fn();
  passed += 1;
}

const outDir = "/tmp/evalora-score-adj-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "${ROOT}/node_modules" ${outDir}/node_modules`);

const built = new Set();
function buildTs(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const emitted = ts.transpileModule(readFileSync(resolve(ROOT, rel), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const deps = [...emitted.matchAll(/require\("(\.[^"]+)"\)/g)].map((m) => m[1]);
  const normalised = emitted.replace(
    /require\("(\.[^"]+?)(\.ts)?"\)/g,
    (_m, spec) => `require("${spec}.js")`,
  );
  const dest = path.join(outDir, rel.replace(/^src\//, "").replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, normalised);
  for (const dep of deps) {
    buildTs(path.join(path.dirname(rel), `${dep.replace(/\.ts$/, "")}.ts`));
  }
}

buildTs("src/lib/scoreAdjustments.ts");
buildTs("src/lib/myp.ts");

const require = createRequire(import.meta.url);
const scoreAdj = require(`${outDir}/lib/scoreAdjustments.js`);
const myp = require(`${outDir}/lib/myp.js`);

// ─── 1. Plan Eligibility Matrix ──────────────────────────────────────────────
check("Plan exclusivity: only active/trialing Institution plan is eligible", () => {
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "institution", status: "active" }), true);
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "institution", status: "trialing" }), true);
  assert.equal(
    scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "custom_ent", status: "active", limits: { institutional: true } }),
    true,
  );
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "premium", status: "active" }), false);
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "free", status: "active" }), false);
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "institution", status: "canceled" }), false);
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "institution", status: "past_due" }), false);
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible({ planSlug: "institution", status: "expired" }), false);
  assert.equal(scoreAdj.isScoreAdjustmentPlanEligible(null), false);
});

// ─── 2. Pre-Validation Lifecycle Lock ────────────────────────────────────────
check("Pre-validation lifecycle: blocks validated, published, archived, deleted exams", () => {
  assert.equal(scoreAdj.isExamOpenForScoreAdjustment({ status: "closed", settings: {} }).allowed, true);
  assert.equal(
    scoreAdj.isExamOpenForScoreAdjustment({ status: "closed", settings: { results_validated: false, results_published: false } }).allowed,
    true,
  );

  const validated = scoreAdj.isExamOpenForScoreAdjustment({ settings: { results_validated: true } });
  assert.equal(validated.allowed, false);
  assert.equal(validated.code, "exam_already_validated");

  const publishedFlag = scoreAdj.isExamOpenForScoreAdjustment({ settings: { results_published: true } });
  assert.equal(publishedFlag.allowed, false);
  assert.equal(publishedFlag.code, "exam_already_published");

  const publishedAt = scoreAdj.isExamOpenForScoreAdjustment({ grades_published_at: "2026-11-25T10:00:00Z", settings: {} });
  assert.equal(publishedAt.allowed, false);
  assert.equal(publishedAt.code, "exam_already_published");

  const archived = scoreAdj.isExamOpenForScoreAdjustment({ settings: { archived: true } });
  assert.equal(archived.allowed, false);
  assert.equal(archived.code, "exam_archived");

  const deleted = scoreAdj.isExamOpenForScoreAdjustment({ deleted_at: "2026-11-25T10:00:00Z", settings: {} });
  assert.equal(deleted.allowed, false);
  assert.equal(deleted.code, "exam_deleted");
});

// ─── 3. Category Extraction (MYP criteria incl. split shares + sections + overall)
const samplePaper = [
  { questionId: "q1", points: 10, criterion: "A", sectionId: "sec-1", sectionTitle: "Part 1: Concepts" },
  {
    questionId: "q2",
    points: 4,
    sectionId: "sec-1",
    sectionTitle: "Part 1: Concepts",
    metadata: {
      criterion_shares: [
        { criterion: "A", points: 2 },
        { criterion: "C", points: 2 },
      ],
    },
  },
  { questionId: "q3", points: 14, criterion: "C", sectionId: "sec-2", sectionTitle: "Part 2: Communication" },
];

check("Category extraction handles MYP criteria, split shares, paper sections, and overall", () => {
  const categories = scoreAdj.extractAdjustmentCategories(samplePaper, {
    mypCriteriaTitles: new Map([
      ["A", "Knowing and understanding"],
      ["C", "Communicating"],
    ]),
  });

  const critA = categories.find((c) => c.categoryType === "myp_criterion" && c.categoryKey === "A");
  const critC = categories.find((c) => c.categoryType === "myp_criterion" && c.categoryKey === "C");
  const sec1 = categories.find((c) => c.categoryType === "paper_section" && c.categoryKey === "sec-1");
  const overall = categories.find((c) => c.categoryType === "overall");

  assert.equal(critA?.maxScore, 12);
  assert.equal(critA?.categoryLabel, "Criterion A — Knowing and understanding");
  assert.equal(critC?.maxScore, 16);
  assert.equal(sec1?.maxScore, 14);
  assert.equal(overall?.maxScore, 28);
});

// ─── 4. Preview Calculation, Capping, Eligibility, Duplicate Prevention ──────
check("Preview enforces capping, eligibility, duplicate prevention, and scope selection", () => {
  const categories = scoreAdj.extractAdjustmentCategories(samplePaper);
  const critC = categories.find((c) => c.categoryType === "myp_criterion" && c.categoryKey === "C");
  assert.ok(critC);

  const attempts = [
    // Alice: C = 1 + 10 = 11 / 16, exam = 21 / 28 -> full +2 -> C = 13, exam = 23
    {
      attemptId: "att-alice",
      candidateId: null,
      studentId: null,
      candidateName: "Alice",
      className: "MYP 4",
      status: "marked",
      gradingStatus: "graded",
      pendingManualCount: 0,
      score: 21,
      maxScore: 28,
      submittedAt: "2026-11-24T10:00:00Z",
      answersByQuestion: { q1: 9, q2: 2, q3: 10 },
    },
    // Bob: C = 2 + 13 = 15 / 16, exam = 26 / 28 -> capped +1 (criterion max 16) -> C = 16, exam = 27
    {
      attemptId: "att-bob",
      candidateId: null,
      studentId: null,
      candidateName: "Bob",
      className: "MYP 4",
      status: "submitted",
      gradingStatus: "not_started", // Legacy graded attempt pattern
      pendingManualCount: 0,
      score: 26,
      maxScore: 28,
      submittedAt: "2026-11-24T10:00:00Z",
      answersByQuestion: { q1: 9, q2: 4, q3: 13 },
    },
    // Cara: already at C max (16 / 16) -> skipped (already_at_maximum)
    {
      attemptId: "att-cara",
      candidateId: null,
      studentId: null,
      candidateName: "Cara",
      className: "MYP 4",
      status: "marked",
      gradingStatus: "graded",
      pendingManualCount: 0,
      score: 26,
      maxScore: 28,
      submittedAt: "2026-11-24T10:00:00Z",
      answersByQuestion: { q1: 8, q2: 4, q3: 14 },
    },
    // Dan: already adjusted on Criterion C -> skipped (already_adjusted)
    {
      attemptId: "att-dan",
      candidateId: null,
      studentId: null,
      candidateName: "Dan",
      className: "MYP 4",
      status: "marked",
      gradingStatus: "graded",
      pendingManualCount: 0,
      score: 18,
      maxScore: 28,
      submittedAt: "2026-11-24T10:00:00Z",
      answersByQuestion: { q1: 8, q2: 2, q3: 8 },
    },
    // Eve: pending manual grading -> ineligible
    {
      attemptId: "att-eve",
      candidateId: null,
      studentId: null,
      candidateName: "Eve",
      className: "MYP 4",
      status: "submitted",
      gradingStatus: "pending_manual",
      pendingManualCount: 1,
      score: 10,
      maxScore: 28,
      submittedAt: "2026-11-24T10:00:00Z",
      answersByQuestion: { q1: 8, q2: 2, q3: null },
    },
    // Frank: in progress -> ineligible
    {
      attemptId: "att-frank",
      candidateId: null,
      studentId: null,
      candidateName: "Frank",
      className: "MYP 4",
      status: "in_progress",
      gradingStatus: "not_started",
      pendingManualCount: 0,
      score: null,
      maxScore: 28,
      submittedAt: null,
      answersByQuestion: {},
    },
  ];

  const priorAdjustments = [
    {
      id: "prior-1",
      adjustmentId: "adj-old",
      attemptId: "att-dan",
      categoryType: "myp_criterion",
      categoryKey: "C",
      pointsRequested: 1,
      pointsApplied: 1,
      originalCategoryScore: 9,
      adjustedCategoryScore: 10,
      categoryMaxScore: 16,
      originalExamScore: 17,
      adjustedExamScore: 18,
      examMaxScore: 28,
      capped: false,
      capReason: null,
      createdAt: "2026-11-24T11:00:00Z",
    },
  ];

  const previewAll = scoreAdj.buildScoreAdjustmentPreview({
    category: critC,
    pointsRequested: 2,
    scope: "all_eligible",
    paper: samplePaper,
    attempts,
    priorAdjustments,
  });

  assert.equal(previewAll.canConfirm, true);
  assert.equal(previewAll.applicableCount, 2); // Alice & Bob
  assert.equal(previewAll.cappedCount, 1); // Bob
  assert.equal(previewAll.atMaxSkippedCount, 1); // Cara
  assert.equal(previewAll.alreadyAdjustedCount, 1); // Dan
  assert.equal(previewAll.ineligibleCount, 2); // Eve & Frank
  assert.equal(previewAll.totalPointsToAdd, 3); // 2 + 1
  assert.ok(previewAll.warnings.some((w) => w.includes("automatically capped")));

  const alice = previewAll.rows.find((r) => r.attemptId === "att-alice");
  assert.equal(alice.status, "apply");
  assert.equal(alice.originalCategoryScore, 11);
  assert.equal(alice.adjustedCategoryScore, 13);
  assert.equal(alice.originalExamScore, 21);
  assert.equal(alice.adjustedExamScore, 23);
  assert.equal(alice.pointsApplied, 2);

  const bob = previewAll.rows.find((r) => r.attemptId === "att-bob");
  assert.equal(bob.status, "capped");
  assert.equal(bob.capped, true);
  assert.equal(bob.capReason, "criterion_max");
  assert.equal(bob.originalCategoryScore, 15);
  assert.equal(bob.adjustedCategoryScore, 16);
  assert.equal(bob.adjustedExamScore, 27);
  assert.equal(bob.pointsApplied, 1);

  // Selected scope: ONLY Alice
  const previewSelected = scoreAdj.buildScoreAdjustmentPreview({
    category: critC,
    pointsRequested: 2,
    scope: "selected",
    selectedAttemptIds: ["att-alice"],
    paper: samplePaper,
    attempts,
    priorAdjustments,
  });
  assert.equal(previewSelected.applicableCount, 1);
  assert.equal(previewSelected.applicableRows[0].attemptId, "att-alice");
  assert.equal(previewSelected.rows.find((r) => r.attemptId === "att-bob").status, "not_selected");

  // No-op preview (only Cara who is already at max) -> cannot confirm
  const previewNoOp = scoreAdj.buildScoreAdjustmentPreview({
    category: critC,
    pointsRequested: 2,
    scope: "selected",
    selectedAttemptIds: ["att-cara"],
    paper: samplePaper,
    attempts,
    priorAdjustments,
  });
  assert.equal(previewNoOp.canConfirm, false);
  assert.equal(previewNoOp.applicableCount, 0);
});

// ─── 5. Silent MYP Recalculation & Student Privacy ───────────────────────────
check("MYP result engine silently folds criterion adjustments into marks, levels, and 1-7 grade", () => {
  const rules = {
    criteria: [
      { code: "A", title: "Knowing and understanding", description: null, position: 1 },
      { code: "C", title: "Communicating", description: null, position: 2 },
    ],
    levelBoundaries: myp.DEFAULT_LEVEL_BOUNDARIES,
    gradeBoundaries: myp.DEFAULT_GRADE_BOUNDARIES,
    levelSource: myp.DEFAULT_LEVEL_SOURCE,
    gradeSource: myp.DEFAULT_GRADE_SOURCE,
    requireAllCriteria: true,
    criteriaMaxLevel: 8,
    source: "default",
  };
  const paper = [
    { questionId: "q1", points: 10, criterion: "A" },
    { questionId: "q2", points: 10, criterion: "C" },
  ];
  const answers = [
    { questionId: "q1", pointsAwarded: 8, hasContent: true, isCorrect: true },
    { questionId: "q2", pointsAwarded: 6, hasContent: true, isCorrect: true },
  ];
  const baseAttempt = {
    attemptId: "att-1",
    examId: "exam-1",
    organizationId: "org-1",
    organizationName: "Oak International School",
    examTitle: "MYP4 Mathematics",
    examDate: "2026-11-24T09:00:00Z",
    attemptStatus: "marked",
    submittedAt: "2026-11-24T10:00:00Z",
    score: 14,
    maxScore: 20,
    published: true,
    studentName: "Amina",
    mypYear: 4,
    subjectNames: ["Mathematics"],
  };

  const before = myp.buildMypResult({ attempt: baseAttempt, paper, answers, rules });
  const after = myp.buildMypResult({
    attempt: { ...baseAttempt, score: 17 },
    paper,
    answers,
    rules,
    scoreAdjustments: [{ categoryType: "myp_criterion", categoryKey: "C", pointsApplied: 3 }],
  });

  const beforeC = before.criteria.find((c) => c.code === "C");
  const afterC = after.criteria.find((c) => c.code === "C");

  assert.equal(beforeC.marksAwarded, 6);
  assert.equal(afterC.marksAwarded, 9);
  assert.ok(afterC.level > beforeC.level, "Criterion C level should rise after +3 marks");
  assert.equal(before.marksAwarded, 14);
  assert.equal(after.marksAwarded, 17);
  assert.ok(after.totalLevels > before.totalLevels);

  // Verify strict capping in MYP engine even if oversized adjustment passed
  const capped = myp.buildMypResult({
    attempt: { ...baseAttempt, score: 18 },
    paper,
    answers,
    rules,
    scoreAdjustments: [{ categoryType: "myp_criterion", categoryKey: "C", pointsApplied: 99 }],
  });
  assert.equal(capped.criteria.find((c) => c.code === "C").marksAwarded, 10);
  assert.equal(capped.marksAwarded, 18);

  // Verify zero leakage of bonus/adjustment terminology in serialized MYP result
  const serialized = JSON.stringify(after).toLowerCase();
  assert.ok(!serialized.includes("bonus"));
  assert.ok(!serialized.includes("adjustment"));
  assert.ok(!serialized.includes("extra points"));
});

// ─── 6. Recompute Preservation ───────────────────────────────────────────────
check("Recompute helper preserves adjustments and clamps strictly to maxScore", () => {
  assert.equal(scoreAdj.computeAdjustedAttemptScore(14, 20, [{ pointsApplied: 2 }]), 16);
  assert.equal(scoreAdj.computeAdjustedAttemptScore(19, 20, [{ pointsApplied: 3 }]), 20);
  assert.equal(scoreAdj.computeAdjustedAttemptScore(14, 20, []), 14);
});

// ─── 7. Real PostgreSQL (PGlite) Migration, RPC, Immutability & RLS Tests ───
await checkAsync("PGlite: full SQL migration, atomic RPC, constraints, triggers, and RLS", async () => {
  const db = new PGlite();
  const migrationSql = readFileSync(
    resolve(ROOT, "supabase/migrations/20261125230000_score_adjustments.sql"),
    "utf8",
  );

  // Bootstrap minimal synthetic schema matching production tables & roles
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE TABLE public.organizations (
      id uuid PRIMARY KEY,
      name text NOT NULL
    );
    CREATE TABLE public.plans (
      id uuid PRIMARY KEY,
      slug text NOT NULL,
      name text NOT NULL,
      limits jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE public.subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      plan_id uuid NOT NULL REFERENCES public.plans(id),
      status text NOT NULL,
      current_period_end timestamptz,
      trial_ends_at timestamptz,
      limits_override jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      email text NOT NULL,
      platform_role text NOT NULL DEFAULT 'user',
      status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE public.organization_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      user_id uuid NOT NULL REFERENCES public.profiles(id),
      role text NOT NULL,
      status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE public.students (
      id uuid PRIMARY KEY
    );
    CREATE TABLE public.exams (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES public.organizations(id),
      title text NOT NULL,
      status text NOT NULL DEFAULT 'closed',
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      grades_published_at timestamptz,
      deleted_at timestamptz
    );
    CREATE TABLE public.exam_candidates (
      id uuid PRIMARY KEY,
      exam_id uuid NOT NULL REFERENCES public.exams(id)
    );
    CREATE TABLE public.exam_attempts (
      id uuid PRIMARY KEY,
      exam_id uuid NOT NULL REFERENCES public.exams(id),
      candidate_id uuid REFERENCES public.exam_candidates(id),
      student_id uuid REFERENCES public.students(id),
      status text NOT NULL,
      score numeric,
      max_score numeric,
      grading_status text DEFAULT 'graded',
      pending_manual_count integer DEFAULT 0
    );
    CREATE TABLE public.exam_answers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id),
      points_awarded numeric
    );
    CREATE TABLE public.audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid,
      organization_id uuid,
      action text NOT NULL,
      entity text NOT NULL,
      entity_id text,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Simulated RBAC helper mirroring production access_has_permission
    CREATE OR REPLACE FUNCTION public.access_has_permission(
      p_user_id uuid, p_organization_id uuid, p_permission_key text
    ) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
    DECLARE
      v_role text;
      v_super boolean;
    BEGIN
      SELECT (platform_role = 'super_admin' AND status = 'active') INTO v_super
      FROM public.profiles WHERE id = p_user_id;
      IF COALESCE(v_super, false) THEN RETURN true; END IF;

      SELECT m.role INTO v_role
      FROM public.organization_members m
      JOIN public.profiles p ON p.id = m.user_id
      WHERE m.user_id = p_user_id AND m.organization_id = p_organization_id
        AND m.status = 'active' AND p.status = 'active'
      LIMIT 1;
      IF v_role IS NULL THEN RETURN false; END IF;

      IF p_permission_key = 'grading.edit' THEN
        RETURN v_role IN ('owner', 'admin', 'teacher', 'corrector');
      END IF;
      IF p_permission_key IN ('grading.view', 'results.view') THEN
        RETURN v_role IN ('owner', 'admin', 'teacher', 'corrector', 'school_founder');
      END IF;
      RETURN false;
    END $$;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);

  // Apply the REAL production migration verbatim!
  await db.exec(migrationSql);

  // Seed synthetic plans, orgs, users, exams, attempts, answers
  const ORG_INST = "10000000-0000-4000-8000-000000000001";
  const ORG_PREM = "10000000-0000-4000-8000-000000000002";
  const ORG_FREE = "10000000-0000-4000-8000-000000000003";
  const PLAN_INST = "20000000-0000-4000-8000-000000000001";
  const PLAN_PREM = "20000000-0000-4000-8000-000000000002";
  const PLAN_FREE = "20000000-0000-4000-8000-000000000003";

  const USER_SUPER = "30000000-0000-4000-8000-000000000001";
  const USER_TEACHER_INST = "30000000-0000-4000-8000-000000000002";
  const USER_FOUNDER_INST = "30000000-0000-4000-8000-000000000003";
  const USER_STUDENT_INST = "30000000-0000-4000-8000-000000000004";
  const USER_TEACHER_PREM = "30000000-0000-4000-8000-000000000005";

  const EXAM_INST_OPEN = "40000000-0000-4000-8000-000000000001";
  const EXAM_INST_VALIDATED = "40000000-0000-4000-8000-000000000002";
  const EXAM_INST_PUBLISHED = "40000000-0000-4000-8000-000000000003";
  const EXAM_PREM_OPEN = "40000000-0000-4000-8000-000000000004";
  const EXAM_FREE_OPEN = "40000000-0000-4000-8000-000000000005";

  const ATT_1 = "50000000-0000-4000-8000-000000000001";
  const ATT_2 = "50000000-0000-4000-8000-000000000002";
  const ATT_PREM = "50000000-0000-4000-8000-000000000003";
  const ATT_VAL = "50000000-0000-4000-8000-000000000004";
  const ATT_PUB = "50000000-0000-4000-8000-000000000005";
  const ATT_FREE = "50000000-0000-4000-8000-000000000006";

  await db.exec(`
    INSERT INTO public.plans (id, slug, name, limits) VALUES
      ('${PLAN_INST}', 'institution', 'Institution', '{"institutional": true}'::jsonb),
      ('${PLAN_PREM}', 'premium', 'Premium', '{"institutional": false}'::jsonb),
      ('${PLAN_FREE}', 'free', 'Free', '{"institutional": false}'::jsonb);

    INSERT INTO public.organizations (id, name) VALUES
      ('${ORG_INST}', 'Synthetic Institution Academy'),
      ('${ORG_PREM}', 'Synthetic Premium School'),
      ('${ORG_FREE}', 'Synthetic Free School');

    INSERT INTO public.subscriptions (organization_id, plan_id, status) VALUES
      ('${ORG_INST}', '${PLAN_INST}', 'active'),
      ('${ORG_PREM}', '${PLAN_PREM}', 'active'),
      ('${ORG_FREE}', '${PLAN_FREE}', 'active');

    INSERT INTO public.profiles (id, email, platform_role, status) VALUES
      ('${USER_SUPER}', 'super@evalora.test', 'super_admin', 'active'),
      ('${USER_TEACHER_INST}', 'teacher@inst.test', 'user', 'active'),
      ('${USER_FOUNDER_INST}', 'founder@inst.test', 'user', 'active'),
      ('${USER_STUDENT_INST}', 'student@inst.test', 'user', 'active'),
      ('${USER_TEACHER_PREM}', 'teacher@prem.test', 'user', 'active');

    INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
      ('${ORG_INST}', '${USER_TEACHER_INST}', 'teacher', 'active'),
      ('${ORG_INST}', '${USER_FOUNDER_INST}', 'school_founder', 'active'),
      ('${ORG_INST}', '${USER_STUDENT_INST}', 'student', 'active'),
      ('${ORG_PREM}', '${USER_TEACHER_PREM}', 'teacher', 'active');

    INSERT INTO public.exams (id, organization_id, title, status, settings, grades_published_at) VALUES
      ('${EXAM_INST_OPEN}', '${ORG_INST}', 'MYP4 Math Open', 'closed', '{"results_validated": false, "results_published": false}'::jsonb, null),
      ('${EXAM_INST_VALIDATED}', '${ORG_INST}', 'MYP4 Math Validated', 'closed', '{"results_validated": true, "results_published": false}'::jsonb, null),
      ('${EXAM_INST_PUBLISHED}', '${ORG_INST}', 'MYP4 Math Published', 'closed', '{"results_validated": true, "results_published": true}'::jsonb, now()),
      ('${EXAM_PREM_OPEN}', '${ORG_PREM}', 'Premium Math Open', 'closed', '{}'::jsonb, null),
      ('${EXAM_FREE_OPEN}', '${ORG_FREE}', 'Free Math Open', 'closed', '{}'::jsonb, null);

    INSERT INTO public.exam_attempts (id, exam_id, status, score, max_score, grading_status, pending_manual_count) VALUES
      ('${ATT_1}', '${EXAM_INST_OPEN}', 'marked', 20, 30, 'graded', 0),
      ('${ATT_2}', '${EXAM_INST_OPEN}', 'submitted', 29, 30, 'not_started', 0),
      ('${ATT_VAL}', '${EXAM_INST_VALIDATED}', 'marked', 20, 30, 'graded', 0),
      ('${ATT_PUB}', '${EXAM_INST_PUBLISHED}', 'marked', 20, 30, 'graded', 0),
      ('${ATT_PREM}', '${EXAM_PREM_OPEN}', 'marked', 20, 30, 'graded', 0),
      ('${ATT_FREE}', '${EXAM_FREE_OPEN}', 'marked', 20, 30, 'graded', 0);

    INSERT INTO public.exam_answers (attempt_id, points_awarded) VALUES
      ('${ATT_1}', 20),
      ('${ATT_2}', 29);
  `);

  const callRpc = (args) =>
    db.query(
      `SELECT public.apply_exam_score_adjustment(
        $1::uuid, $2, $3, $4, $5::numeric, $6, $7, $8, $9::uuid, $10, $11, $12, $13::jsonb
      ) AS res`,
      args,
    );

  // A. Happy path: Teacher applies +2 on Criterion C (ATT_1 gets +2 -> 22, ATT_2 capped at +1 -> 30)
  const itemsHappy = [
    {
      attempt_id: ATT_1,
      candidate_id: null,
      student_id: null,
      candidate_name: "Student One",
      category_max_score: 16,
      original_category_score: 10,
      adjusted_category_score: 12,
      exam_max_score: 30,
      original_exam_score: 20,
      adjusted_exam_score: 22,
      points_applied: 2,
      capped: false,
      cap_reason: null,
    },
    {
      attempt_id: ATT_2,
      candidate_id: null,
      student_id: null,
      candidate_name: "Student Two",
      category_max_score: 16,
      original_category_score: 15,
      adjusted_category_score: 16,
      exam_max_score: 30,
      original_exam_score: 29,
      adjusted_exam_score: 30,
      points_applied: 1,
      capped: true,
      cap_reason: "both_max",
    },
  ];

  const happyRes = await callRpc([
    EXAM_INST_OPEN,
    "myp_criterion",
    "C",
    "Criterion C — Communicating",
    2,
    "all_eligible",
    "Clarification credit for Question 4",
    "idem-key-happy-001",
    USER_TEACHER_INST,
    "teacher@inst.test",
    "teacher",
    "workspace",
    JSON.stringify(itemsHappy),
  ]);
  const outcome = happyRes.rows[0].res;
  assert.equal(outcome.students_affected, 2);
  assert.equal(outcome.capped_students, 1);
  assert.equal(Number(outcome.total_points_added), 3);

  // Verify attempt scores updated, answers untouched, validation/publication untouched, audit_logs written
  const attAfter = await db.query(
    `SELECT id, score FROM public.exam_attempts WHERE id IN ('${ATT_1}', '${ATT_2}') ORDER BY id`,
  );
  assert.equal(Number(attAfter.rows[0].score), 22);
  assert.equal(Number(attAfter.rows[1].score), 30);

  const ansAfter = await db.query(
    `SELECT attempt_id, points_awarded FROM public.exam_answers WHERE attempt_id IN ('${ATT_1}', '${ATT_2}') ORDER BY attempt_id`,
  );
  assert.equal(Number(ansAfter.rows[0].points_awarded), 20, "Original exam_answers must NEVER change");
  assert.equal(Number(ansAfter.rows[1].points_awarded), 29, "Original exam_answers must NEVER change");

  const examAfter = await db.query(
    `SELECT settings, grades_published_at FROM public.exams WHERE id = '${EXAM_INST_OPEN}'`,
  );
  assert.equal(examAfter.rows[0].settings.results_validated, false);
  assert.equal(examAfter.rows[0].settings.results_published, false);
  assert.equal(examAfter.rows[0].grades_published_at, null);

  const auditRows = await db.query(
    `SELECT action, actor_id, organization_id, entity_id FROM public.audit_logs WHERE action = 'exam.score_adjustment_applied'`,
  );
  assert.equal(auditRows.rows.length, 1);
  assert.equal(auditRows.rows[0].actor_id, USER_TEACHER_INST);
  assert.equal(auditRows.rows[0].organization_id, ORG_INST);

  // B. Idempotency / duplicate submission blocked
  await assert.rejects(
    () =>
      callRpc([
        EXAM_INST_OPEN,
        "myp_criterion",
        "C",
        "Criterion C",
        2,
        "all_eligible",
        "Retry same click",
        "idem-key-happy-001",
        USER_TEACHER_INST,
        "teacher@inst.test",
        "teacher",
        "workspace",
        JSON.stringify(itemsHappy),
      ]),
    /duplicate_submission/,
  );

  // C. Duplicate adjustment on same (attempt, category_type, category_key) blocked + full rollback
  await assert.rejects(
    () =>
      callRpc([
        EXAM_INST_OPEN,
        "myp_criterion",
        "C",
        "Criterion C",
        1,
        "selected",
        "Second adjustment on Criterion C",
        "idem-key-dup-cat-002",
        USER_TEACHER_INST,
        "teacher@inst.test",
        "teacher",
        "workspace",
        JSON.stringify([
          {
            ...itemsHappy[0],
            original_category_score: 12,
            adjusted_category_score: 13,
            original_exam_score: 22,
            adjusted_exam_score: 23,
            points_applied: 1,
          },
        ]),
      ]),
    /duplicate_adjustment/,
  );

  // D. Super Admin applies a SECOND distinct category (Criterion A) on Institution org -> succeeds!
  const superRes = await callRpc([
    EXAM_INST_OPEN,
    "myp_criterion",
    "A",
    "Criterion A — Knowing",
    1,
    "selected",
    "Super Admin Criterion A calibration",
    "idem-key-super-a-003",
    USER_SUPER,
    "super@evalora.test",
    "super_admin",
    "super_admin",
    JSON.stringify([
      {
        attempt_id: ATT_1,
        candidate_id: null,
        student_id: null,
        candidate_name: "Student One",
        category_max_score: 14,
        original_category_score: 10,
        adjusted_category_score: 11,
        exam_max_score: 30,
        original_exam_score: 22,
        adjusted_exam_score: 23,
        points_applied: 1,
        capped: false,
        cap_reason: null,
      },
    ]),
  ]);
  assert.equal(superRes.rows[0].res.students_affected, 1);

  // Verify helper `exam_attempt_adjustment_total` returns cumulative 2 + 1 = 3
  const sumHelper = await db.query(`SELECT public.exam_attempt_adjustment_total('${ATT_1}') AS total`);
  assert.equal(Number(sumHelper.rows[0].total), 3);

  // E. Super Admin blocked on Premium org (Institution plan exclusivity!)
  const premItem = [
    {
      attempt_id: ATT_PREM,
      candidate_id: null,
      student_id: null,
      candidate_name: "Prem Student",
      category_max_score: 30,
      original_category_score: 20,
      adjusted_category_score: 21,
      exam_max_score: 30,
      original_exam_score: 20,
      adjusted_exam_score: 21,
      points_applied: 1,
      capped: false,
      cap_reason: null,
    },
  ];
  await assert.rejects(
    () =>
      callRpc([
        EXAM_PREM_OPEN,
        "overall",
        "OVERALL",
        "Overall Examination Score",
        1,
        "all_eligible",
        "Trying on Premium org",
        "idem-key-prem-004",
        USER_SUPER,
        "super@evalora.test",
        "super_admin",
        "super_admin",
        JSON.stringify(premItem),
      ]),
    /plan_ineligible/,
  );

  // F. Free org blocked
  await assert.rejects(
    () =>
      callRpc([
        EXAM_FREE_OPEN,
        "overall",
        "OVERALL",
        "Overall Examination Score",
        1,
        "all_eligible",
        "Trying on Free org",
        "idem-key-free-005",
        USER_SUPER,
        "super@evalora.test",
        "super_admin",
        "super_admin",
        JSON.stringify([{ ...premItem[0], attempt_id: ATT_FREE }]),
      ]),
    /plan_ineligible/,
  );

  // G. Validated & Published exams blocked
  await assert.rejects(
    () =>
      callRpc([
        EXAM_INST_VALIDATED,
        "overall",
        "OVERALL",
        "Overall Examination Score",
        1,
        "all_eligible",
        "Trying after validation",
        "idem-key-val-006",
        USER_SUPER,
        "super@evalora.test",
        "super_admin",
        "super_admin",
        JSON.stringify([{ ...premItem[0], attempt_id: ATT_VAL }]),
      ]),
    /exam_already_validated/,
  );
  await assert.rejects(
    () =>
      callRpc([
        EXAM_INST_PUBLISHED,
        "overall",
        "OVERALL",
        "Overall Examination Score",
        1,
        "all_eligible",
        "Trying after publication",
        "idem-key-pub-007",
        USER_SUPER,
        "super@evalora.test",
        "super_admin",
        "super_admin",
        JSON.stringify([{ ...premItem[0], attempt_id: ATT_PUB }]),
      ]),
    /exam_already_published/,
  );

  // H. Unauthorized roles blocked (Student, School Founder, Cross-tenant Teacher)
  const overallItem = [
    {
      attempt_id: ATT_1,
      candidate_id: null,
      student_id: null,
      candidate_name: "Student One",
      category_max_score: 30,
      original_category_score: 23,
      adjusted_category_score: 24,
      exam_max_score: 30,
      original_exam_score: 23,
      adjusted_exam_score: 24,
      points_applied: 1,
      capped: false,
      cap_reason: null,
    },
  ];
  for (const [actorId, email, role] of [
    [USER_STUDENT_INST, "student@inst.test", "student"],
    [USER_FOUNDER_INST, "founder@inst.test", "school_founder"],
    [USER_TEACHER_PREM, "teacher@prem.test", "teacher"],
  ]) {
    await assert.rejects(
      () =>
        callRpc([
          EXAM_INST_OPEN,
          "overall",
          "OVERALL",
          "Overall",
          1,
          "selected",
          "Unauthorized attempt",
          `idem-unauth-${role}`,
          actorId,
          email,
          role,
          "workspace",
          JSON.stringify(overallItem),
        ]),
      /unauthorized/,
    );
  }

  // I. Score cap violation & optimistic concurrency guard
  await assert.rejects(
    () =>
      callRpc([
        EXAM_INST_OPEN,
        "overall",
        "OVERALL",
        "Overall",
        10,
        "selected",
        "Attempt exceeding max score",
        "idem-cap-008",
        USER_TEACHER_INST,
        "teacher@inst.test",
        "teacher",
        "workspace",
        JSON.stringify([
          {
            ...overallItem[0],
            adjusted_category_score: 33,
            adjusted_exam_score: 33,
            points_applied: 10,
          },
        ]),
      ]),
    /score_cap_violation/,
  );
  await assert.rejects(
    () =>
      callRpc([
        EXAM_INST_OPEN,
        "overall",
        "OVERALL",
        "Overall",
        1,
        "selected",
        "Stale preview score",
        "idem-stale-009",
        USER_TEACHER_INST,
        "teacher@inst.test",
        "teacher",
        "workspace",
        JSON.stringify([
          {
            ...overallItem[0],
            original_exam_score: 20, // live score is 23!
            adjusted_exam_score: 21,
          },
        ]),
      ]),
    /score_changed_since_preview/,
  );

  // J. Append-only immutability triggers block UPDATE & DELETE
  await assert.rejects(
    () => db.query(`UPDATE public.exam_score_adjustments SET reason = 'tampered'`),
    /immutable/,
  );
  await assert.rejects(
    () => db.query(`DELETE FROM public.exam_score_adjustments`),
    /immutable/,
  );
  await assert.rejects(
    () => db.query(`UPDATE public.exam_score_adjustment_items SET points_applied = 99`),
    /immutable/,
  );
  await assert.rejects(
    () => db.query(`DELETE FROM public.exam_score_adjustment_items`),
    /immutable/,
  );

  // K. Strict RLS policies: verify student & cross-tenant get ZERO rows, staff & super admin see rows
  const countAsUser = async (userId, table) => {
    await db.exec("BEGIN");
    await db.exec(`SET LOCAL ROLE authenticated`);
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', true)`);
    const res = await db.query(`SELECT count(*)::int AS c FROM public.${table}`);
    await db.exec("ROLLBACK");
    return res.rows[0].c;
  };

  assert.equal(await countAsUser(USER_STUDENT_INST, "exam_score_adjustments"), 0, "Student must NEVER read adjustment headers");
  assert.equal(await countAsUser(USER_STUDENT_INST, "exam_score_adjustment_items"), 0, "Student must NEVER read adjustment items");
  assert.equal(await countAsUser(USER_TEACHER_PREM, "exam_score_adjustments"), 0, "Cross-tenant teacher must NEVER read another org's adjustments");
  assert.equal(await countAsUser(USER_TEACHER_PREM, "exam_score_adjustment_items"), 0, "Cross-tenant teacher must NEVER read another org's adjustment items");
  assert.equal(await countAsUser(USER_TEACHER_INST, "exam_score_adjustments"), 2, "Org teacher sees org's adjustment headers");
  assert.equal(await countAsUser(USER_TEACHER_INST, "exam_score_adjustment_items"), 3, "Org teacher sees org's adjustment items");
  assert.equal(await countAsUser(USER_FOUNDER_INST, "exam_score_adjustments"), 2, "School Founder (read-only) can audit org's adjustments");
  assert.equal(await countAsUser(USER_SUPER, "exam_score_adjustments"), 2, "Super Admin can read adjustments across orgs");

  // Direct client write as authenticated must fail (permission denied)
  await db.exec("BEGIN");
  await db.exec("SET LOCAL ROLE authenticated");
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${USER_TEACHER_INST}', true)`);
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO public.exam_score_adjustments (organization_id, exam_id, category_type, category_key, category_label, points_requested, scope, reason, idempotency_key, actor_role, students_affected_count, total_points_added)
         VALUES ('${ORG_INST}', '${EXAM_INST_OPEN}', 'overall', 'OVERALL', 'Overall', 1, 'all_eligible', 'bypass', 'bypass-key-01', 'teacher', 1, 1)`,
      ),
    /permission denied/i,
  );
  await db.exec("ROLLBACK");

  await db.close();
});

// ─── 8. Static Security, Privacy & Surface Integration Verification ──────────
check("Student-facing surfaces expose zero bonus/adjustment labels or UI", () => {
  const studentFiles = [
    "src/app/exam/result/[token]/page.tsx",
    "src/app/student/page.tsx",
    "src/app/student/results/[attemptId]/page.tsx",
    "src/components/myp/MypResultDetail.tsx",
    "src/lib/mypPdf.ts",
    "src/lib/mypExcel.ts",
    "src/lib/candidatePaper.ts",
    "src/lib/candidatePaperPdf.ts",
  ];
  for (const rel of studentFiles) {
    const src = readFileSync(resolve(ROOT, rel), "utf8");
    assert.ok(!/bonus\s+points/i.test(src), `${rel} must not mention 'bonus points'`);
    assert.ok(!/score\s+adjustment/i.test(src), `${rel} must not display 'score adjustment' to students`);
  }
});

check("Centralized RBAC & tenant/plan enforcement wired across all Score Adjustment entry points", () => {
  const serverSvc = readFileSync(resolve(ROOT, "src/lib/scoreAdjustmentsServer.ts"), "utf8");
  assert.ok(serverSvc.includes("getEntitlement(admin, orgId)"), "Must resolve target org real entitlement without ownerBypass");
  assert.ok(!serverSvc.includes("getEntitlementFor("), "Must never use ownerBypass for Institution plan check");
  assert.ok(serverSvc.includes('canOperate(ctx, examOrganizationId, "grading.edit", "exam_results")'));
  assert.ok(!/\bcan\s*\(/.test(serverSvc), "Must not call legacy can()");

  const dashApi = readFileSync(resolve(ROOT, "src/app/api/dashboard/exams/[id]/score-adjustments/route.ts"), "utf8");
  assert.ok(dashApi.includes("requiredOrganizationId: org.id"), "Workspace API must enforce tenant isolation");
  assert.ok(dashApi.includes('canOperate(ctx, org.id, "grading.edit", "exam_results")'));

  const adminShell = readFileSync(resolve(ROOT, "src/app/admin/AdminShell.tsx"), "utf8");
  assert.ok(adminShell.includes("/admin/examinations/score-adjustments"));

  const examPage = readFileSync(resolve(ROOT, "src/app/dashboard/exams/[id]/page.tsx"), "utf8");
  assert.ok(examPage.includes("/adjustments"));
  assert.ok(examPage.includes("isScoreAdjustmentPlanEligible"));

  const resultsPage = readFileSync(resolve(ROOT, "src/app/dashboard/results/page.tsx"), "utf8");
  assert.ok(resultsPage.includes("/adjustments"));
  assert.ok(resultsPage.includes("isScoreAdjustmentPlanEligible"));

  const adminResults = readFileSync(resolve(ROOT, "src/app/admin/examinations/results/page.tsx"), "utf8");
  assert.ok(adminResults.includes("/admin/examinations/score-adjustments"));
});

console.log(`PASS test-score-adjustment (${passed} checks)`);
