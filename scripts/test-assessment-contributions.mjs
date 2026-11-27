/**
 * Assessment Contributions & Grade Consolidation — verification suite.
 *
 * Covers:
 *  1. Assessment category catalogue (built-ins + organization-defined customs)
 *  2. Assessment record validation (title, date, maximum, criterion/framework,
 *     contribution settings, and that NO examination is required)
 *  3. Score entry: maximum enforcement, normalization across different scales
 *  4. Consolidation Methods A–E: direct points, weighted, points-based,
 *     criterion-specific, record-only
 *  5. Invalid weight configurations, missing scores, duplicate contributions
 *  6. Individual vs class-wide scope — one student's overrides never move
 *     another student's numbers
 *  7. Candidate-facing projection (published data only)
 *  8. Real PostgreSQL (PGlite) execution of the production migration
 *     `supabase/migrations/20261127120000_assessment_contributions_and_grade_consolidation.sql`:
 *       - score-ceiling and tenant guards
 *       - reserved / duplicate custom categories
 *       - unlimited repeated individual adjustments (no per-student ceiling)
 *       - append-only immutability triggers
 *       - strict staff-only RLS (zero learner and zero cross-tenant visibility)
 *       - consolidation uniqueness and integrity constraints
 *  9. Static security & surface integration verification
 *
 * Run standalone: `node scripts/test-assessment-contributions.mjs`
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

const outDir = "/tmp/evalora-assessment-contributions-test";
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

buildTs("src/lib/assessmentContributions.ts");
buildTs("src/lib/gradeAdjustmentLedger.ts");

const require = createRequire(import.meta.url);
const ac = require(`${outDir}/lib/assessmentContributions.js`);
const ledger = require(`${outDir}/lib/gradeAdjustmentLedger.js`);

// ─── 1. Assessment categories ───────────────────────────────────────────────

check("the built-in catalogue covers every required assessment category", () => {
  const keys = ac.BUILT_IN_ASSESSMENT_CATEGORIES.map((c) => c.key);
  for (const required of [
    "homework",
    "class_test",
    "quiz",
    "formative",
    "summative",
    "classwork",
    "project",
    "participation",
    "oral",
    "practical",
    "other",
  ]) {
    assert.ok(keys.includes(required), `missing built-in category ${required}`);
  }
  assert.equal(ac.BUILT_IN_ASSESSMENT_CATEGORIES.length, 11);
  // Every contribution method A–E must be offered.
  const methods = ac.CONTRIBUTION_METHODS.map((m) => m.value);
  for (const method of ["direct_points", "weighted", "points_based", "criterion", "record_only"]) {
    assert.ok(methods.includes(method), `missing consolidation method ${method}`);
  }
});

check("custom categories resolve beside the built-ins; unknown keys never resolve", () => {
  const custom = [{ key: "field_trip", label: "Field trip report", builtin: false }];
  assert.equal(ac.resolveCategory("HOMEWORK", custom).key, "homework");
  assert.equal(ac.resolveCategory("field_trip", custom).label, "Field trip report");
  assert.equal(ac.resolveCategory("field_trip", []), null, "an undefined custom category must not resolve");
  assert.equal(ac.resolveCategory("", custom), null);
  assert.equal(ac.normalizeCategoryKey("  Field Trip! "), "field_trip_");
});

// ─── 2. Assessment record validation ────────────────────────────────────────

check("a complete assessment record validates, and no examination is required", () => {
  const result = ac.validateAssessmentDraft({
    title: "Algebra homework — week 6",
    categoryKey: "homework",
    assessedOn: "2026-01-12",
    maxScore: 20,
    classId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    subjectId: "3f2504e0-4f89-11d3-9a0c-0305e82c3302",
    termLabel: "First Term",
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.value.examId, null, "an assessment must be recordable without an examination");
  assert.equal(result.value.categoryLabel, "Homework");
  assert.equal(result.value.contributionMethod, "record_only");
});

check("invalid assessment records are rejected field by field", () => {
  const missing = ac.validateAssessmentDraft({});
  assert.equal(missing.ok, false);
  const fields = missing.errors.map((e) => e.field);
  for (const field of ["title", "categoryKey", "assessedOn", "maxScore"]) {
    assert.ok(fields.includes(field), `expected a ${field} error`);
  }

  const zeroMax = ac.validateAssessmentDraft({
    title: "Quiz",
    categoryKey: "quiz",
    assessedOn: "2026-01-12",
    maxScore: 0,
  });
  assert.equal(zeroMax.ok, false);

  const badDate = ac.validateAssessmentDraft({
    title: "Quiz",
    categoryKey: "quiz",
    assessedOn: "12/01/2026",
    maxScore: 10,
  });
  assert.equal(badDate.ok, false);
  assert.ok(badDate.errors.some((e) => e.field === "assessedOn"));
});

check("criteria are never invented for non-criterion frameworks", () => {
  const general = ac.validateAssessmentDraft({
    title: "Project",
    categoryKey: "project",
    assessedOn: "2026-01-12",
    maxScore: 50,
    framework: "general",
    criterionCode: "A",
  });
  assert.equal(general.ok, false);
  assert.ok(general.errors.some((e) => e.field === "criterionCode"));

  const myp = ac.validateAssessmentDraft({
    title: "Project",
    categoryKey: "project",
    assessedOn: "2026-01-12",
    maxScore: 50,
    framework: "myp",
    criterionCode: "b",
  });
  assert.equal(myp.ok, true);
  assert.equal(myp.value.criterionCode, "B");

  const criterionMethodWithoutCriterion = ac.validateAssessmentDraft({
    title: "Project",
    categoryKey: "project",
    assessedOn: "2026-01-12",
    maxScore: 50,
    framework: "myp",
    contributesToResult: true,
    contributionMethod: "criterion",
  });
  assert.equal(criterionMethodWithoutCriterion.ok, false);
});

check("contribution settings must be internally consistent", () => {
  const contributesWithoutMethod = ac.validateAssessmentDraft({
    title: "Class test",
    categoryKey: "class_test",
    assessedOn: "2026-01-12",
    maxScore: 30,
    contributesToResult: true,
    contributionMethod: "record_only",
  });
  assert.equal(contributesWithoutMethod.ok, false);

  const methodWithoutContribution = ac.validateAssessmentDraft({
    title: "Class test",
    categoryKey: "class_test",
    assessedOn: "2026-01-12",
    maxScore: 30,
    contributesToResult: false,
    contributionMethod: "weighted",
  });
  assert.equal(methodWithoutContribution.ok, false);

  const badWeight = ac.validateAssessmentDraft({
    title: "Class test",
    categoryKey: "class_test",
    assessedOn: "2026-01-12",
    maxScore: 30,
    contributesToResult: true,
    contributionMethod: "weighted",
    contributionWeight: 140,
  });
  assert.equal(badWeight.ok, false);
  assert.ok(badWeight.errors.some((e) => e.field === "contributionWeight"));
});

// ─── 3. Score entry & normalization ─────────────────────────────────────────

check("scores can never exceed the assessment maximum and are never negative", () => {
  assert.deepEqual(ac.normalizeScore(17, 20), { ok: true, score: 17 });
  assert.deepEqual(ac.normalizeScore(20, 20), { ok: true, score: 20 });
  assert.equal(ac.normalizeScore(21, 20).ok, false);
  assert.equal(ac.normalizeScore(-1, 20).ok, false);
  assert.equal(ac.normalizeScore("abc", 20).ok, false);
  assert.deepEqual(ac.normalizeScore("18.5", 20), { ok: true, score: 18.5 });
});

check("differing assessment scales are normalized explicitly, never mixed raw", () => {
  // 17/20 homework contributing 5 examination points → 4.25
  assert.equal(ac.normalizeScoreToScale(17, 20, 5), 4.25);
  // 8/10 class test contributing 10 points → 8
  assert.equal(ac.normalizeScoreToScale(8, 10, 10), 8);
  // A score above its own maximum is clamped, never scaled up beyond the target.
  assert.equal(ac.normalizeScoreToScale(30, 20, 10), 10);
  assert.equal(ac.normalizeScoreToScale(5, 0, 10), 0, "a zero maximum can never produce points");
  assert.equal(ac.scorePercent(15, 20), 75);
  assert.equal(ac.scorePercent(15, 0), 0);
});

// ─── 4/5/6. Consolidation engine, Methods A–E ───────────────────────────────

const ATTEMPT_A = {
  attemptId: "a1",
  studentId: "s1",
  candidateName: "Amina",
  originalExamScore: 40,
  examMaxScore: 50,
  adjustmentTotal: 0,
  included: true,
};
const ATTEMPT_B = {
  attemptId: "a2",
  studentId: "s2",
  candidateName: "Kofi",
  originalExamScore: 25,
  examMaxScore: 50,
  adjustmentTotal: 0,
  included: true,
};

const HOMEWORK = {
  id: "c1",
  title: "Homework week 6",
  categoryKey: "homework",
  categoryLabel: "Homework",
  maxScore: 20,
  weight: 10,
  pointValue: 5,
  criterionCode: null,
  included: true,
  scoresByAttempt: { a1: 17, a2: 10 },
};
const CLASS_TEST = {
  id: "c2",
  title: "Class test 3",
  categoryKey: "class_test",
  categoryLabel: "Class Test",
  maxScore: 10,
  weight: 10,
  pointValue: 5,
  criterionCode: null,
  included: true,
  scoresByAttempt: { a1: 8, a2: 4 },
};

check("Method B — weighted contribution (80 / 10 / 10) is calculated transparently", () => {
  const result = ac.computeConsolidation({
    profile: { method: "weighted", examWeight: 80 },
    assessments: [HOMEWORK, CLASS_TEST],
    attempts: [ATTEMPT_A, ATTEMPT_B],
  });
  assert.equal(result.errors.length, 0, result.errors.join("; "));
  const row = result.rows.find((r) => r.attemptId === "a1");
  // exam 40/50 = 80%; homework 17/20 = 85%; class test 8/10 = 80%
  // 80*0.8 + 85*0.1 + 80*0.1 = 80.5% of 50 = 40.25
  assert.equal(row.percent, 80.5);
  assert.equal(row.consolidatedScore, 40.25);
  assert.equal(row.consolidatedMax, 50);
  assert.equal(row.originalExamScore, 40, "the original examination score must be preserved beside it");
  assert.equal(result.canPublish, true);
});

check("Method A — direct point adjustment adds scaled points and respects the exam maximum", () => {
  const result = ac.computeConsolidation({
    profile: { method: "direct_points", examWeight: 100 },
    assessments: [HOMEWORK, CLASS_TEST],
    attempts: [ATTEMPT_A],
  });
  const row = result.rows[0];
  // 17/20 * 5 = 4.25 and 8/10 * 5 = 4 → +8.25
  assert.equal(row.contributionTotal, 8.25);
  assert.equal(row.consolidatedScore, 48.25);
  assert.equal(row.consolidatedMax, 50);

  const nearMax = ac.computeConsolidation({
    profile: { method: "direct_points", examWeight: 100 },
    assessments: [{ ...HOMEWORK, pointValue: 40 }, { ...CLASS_TEST, pointValue: 40 }],
    attempts: [{ ...ATTEMPT_A, originalExamScore: 49 }],
  });
  assert.equal(nearMax.rows[0].consolidatedScore, 50, "the consolidated score can never exceed the maximum");
});

check("Method C — points-based aggregation extends the maximum and normalizes scales", () => {
  const result = ac.computeConsolidation({
    profile: { method: "points_based", examWeight: 100 },
    assessments: [HOMEWORK, CLASS_TEST],
    attempts: [ATTEMPT_A],
  });
  const row = result.rows[0];
  assert.equal(row.consolidatedMax, 60, "50 exam + 5 + 5 supplementary points");
  assert.equal(row.consolidatedScore, 48.25);
  assert.equal(row.percent, 80.42);
});

check("Method D — criterion-specific contribution keeps per-criterion breakdowns", () => {
  const criterionHomework = { ...HOMEWORK, criterionCode: "A", pointValue: 4 };
  const result = ac.computeConsolidation({
    profile: { method: "criterion", examWeight: 100 },
    assessments: [criterionHomework],
    attempts: [
      {
        ...ATTEMPT_A,
        criterionMarks: { A: { awarded: 10, max: 15 }, B: { awarded: 6, max: 10 } },
      },
    ],
  });
  const row = result.rows[0];
  const criterionA = row.criterionBreakdown.find((c) => c.code === "A");
  assert.equal(criterionA.supplementary, 3.4, "17/20 of 4 points");
  assert.equal(criterionA.total, 13.4);
  assert.equal(criterionA.totalMax, 15);
  const criterionB = row.criterionBreakdown.find((c) => c.code === "B");
  assert.equal(criterionB.supplementary, 0, "criterion B received no supplementary work");
  assert.equal(criterionB.total, 6);
});

check("Method E — record-only never changes the examination result", () => {
  const result = ac.computeConsolidation({
    profile: { method: "record_only", examWeight: 100 },
    assessments: [HOMEWORK, CLASS_TEST],
    attempts: [{ ...ATTEMPT_A, adjustmentTotal: 2 }],
  });
  const row = result.rows[0];
  assert.equal(row.contributionTotal, 0);
  assert.equal(row.consolidatedScore, 42, "only the recorded individual adjustment applies");
  assert.equal(row.consolidatedMax, 50);
  assert.equal(row.contributions.length, 2, "the work is still listed for transparency");
});

check("invalid weight configurations are reported instead of calculated", () => {
  const invalid = ac.computeConsolidation({
    profile: { method: "weighted", examWeight: 80 },
    assessments: [{ ...HOMEWORK, weight: 10 }], // 80 + 10 = 90 ≠ 100
    attempts: [ATTEMPT_A],
  });
  assert.equal(invalid.canPublish, false);
  assert.ok(invalid.errors.some((e) => e.includes("must total 100%")), invalid.errors.join("; "));

  const noPointValue = ac.computeConsolidation({
    profile: { method: "direct_points", examWeight: 100 },
    assessments: [{ ...HOMEWORK, pointValue: 0 }],
    attempts: [ATTEMPT_A],
  });
  assert.equal(noPointValue.canPublish, false);
  assert.ok(noPointValue.errors.some((e) => e.includes("point value")));

  const duplicates = ac.validateConsolidationProfile(
    { method: "weighted", examWeight: 80 },
    [HOMEWORK, { ...HOMEWORK }, { ...CLASS_TEST, weight: 20 }],
  );
  assert.ok(duplicates.some((e) => e.message.includes("only be counted once")));

  const noCriterion = ac.validateConsolidationProfile(
    { method: "criterion", examWeight: 100 },
    [HOMEWORK],
  );
  assert.ok(noCriterion.some((e) => e.message.includes("mapped to a criterion")));
});

check("missing scores are errors by default and warnings only when explicitly allowed", () => {
  const withMissing = { ...HOMEWORK, scoresByAttempt: { a1: null, a2: 10 } };
  const strict = ac.computeConsolidation({
    profile: { method: "weighted", examWeight: 80 },
    assessments: [withMissing, { ...CLASS_TEST, weight: 20 }],
    attempts: [ATTEMPT_A],
  });
  assert.equal(strict.canPublish, false);
  assert.equal(strict.rows[0].valid, false);
  assert.ok(strict.rows[0].errors.some((e) => e.includes("Missing score")));

  const lenient = ac.computeConsolidation({
    profile: { method: "weighted", examWeight: 80, allowMissingScores: true },
    assessments: [withMissing, { ...CLASS_TEST, weight: 20 }],
    attempts: [ATTEMPT_A],
  });
  assert.equal(lenient.rows[0].valid, true);
  assert.ok(lenient.warnings.some((w) => w.includes("skipped")));
});

check("individual scope never changes another student's result", () => {
  const result = ac.computeConsolidation({
    profile: { method: "points_based", examWeight: 100 },
    assessments: [HOMEWORK, CLASS_TEST],
    attempts: [ATTEMPT_A, { ...ATTEMPT_B, included: false }],
  });
  const b = result.rows.find((r) => r.attemptId === "a2");
  assert.equal(b.included, false);
  assert.equal(b.consolidatedScore, 25, "an excluded student keeps the original score untouched");
  assert.equal(b.contributionTotal, 0);
  assert.equal(result.includedCount, 1);
});

check("the candidate projection exposes only what a candidate may see", () => {
  const view = ac.buildCandidateContributionView({
    assessment: {
      title: "Homework week 6",
      categoryLabel: "Homework",
      contributionMethod: "weighted",
      teacherComment: "Well done — check question 3.",
    },
    score: { score: 17, maxScore: 20, criterionCode: "a" },
    contributionPoints: 4.25,
  });
  assert.equal(view.percent, 85);
  assert.equal(view.criterionCode, "A");
  assert.equal(view.contributionPoints, 4.25);
  assert.ok(!("actorId" in view) && !("actorEmail" in view), "no actor identity may reach a candidate");
  assert.ok(!("studentId" in view) && !("attemptId" in view), "no internal identifiers may reach a candidate");
});

// ─── 7. Real PostgreSQL (PGlite) migration, constraints, triggers, RLS ──────

const MIGRATION = "supabase/migrations/20261127120000_assessment_contributions_and_grade_consolidation.sql";

await checkAsync("PGlite: migration, guards, immutability, RLS and unlimited adjustments", async () => {
  const db = new PGlite();
  await db.exec(readFileSync(resolve(ROOT, "scripts/fixtures/assessment-bootstrap.sql"), "utf8"));
  await db.exec(readFileSync(resolve(ROOT, MIGRATION), "utf8"));

  const ORG_A = "10000000-0000-4000-8000-000000000001";
  const ORG_B = "10000000-0000-4000-8000-000000000002";
  const USER_ADMIN = "30000000-0000-4000-8000-000000000001";
  const USER_TEACHER = "30000000-0000-4000-8000-000000000002";
  const USER_TEACHER_B = "30000000-0000-4000-8000-000000000003";
  const USER_FOUNDER = "30000000-0000-4000-8000-000000000004";
  const USER_STUDENT = "30000000-0000-4000-8000-000000000005";
  const SUBJECT = "60000000-0000-4000-8000-000000000001";
  const CLASS = "61000000-0000-4000-8000-000000000001";
  const EXAM = "40000000-0000-4000-8000-000000000001";
  const CANDIDATE = "41000000-0000-4000-8000-000000000001";
  const STUDENT_1 = "62000000-0000-4000-8000-000000000001";
  const STUDENT_2 = "62000000-0000-4000-8000-000000000002";
  const ATTEMPT_1 = "50000000-0000-4000-8000-000000000001";

  await db.exec(`
    INSERT INTO public.organizations (id, name) VALUES ('${ORG_A}', 'Synthetic Academy'), ('${ORG_B}', 'Other Academy');
    INSERT INTO public.profiles (id, email, platform_role, status) VALUES
      ('${USER_ADMIN}', 'admin@synthetic.test', 'user', 'active'),
      ('${USER_TEACHER}', 'teacher@synthetic.test', 'user', 'active'),
      ('${USER_TEACHER_B}', 'teacher@other.test', 'user', 'active'),
      ('${USER_FOUNDER}', 'founder@synthetic.test', 'user', 'active'),
      ('${USER_STUDENT}', 'student@synthetic.test', 'user', 'active');
    INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
      ('${ORG_A}', '${USER_ADMIN}', 'admin'),
      ('${ORG_A}', '${USER_TEACHER}', 'teacher'),
      ('${ORG_B}', '${USER_TEACHER_B}', 'teacher'),
      ('${ORG_A}', '${USER_FOUNDER}', 'school_founder'),
      ('${ORG_A}', '${USER_STUDENT}', 'student');
    INSERT INTO public.subjects (id, organization_id, name) VALUES ('${SUBJECT}', '${ORG_A}', 'Mathematics');
    INSERT INTO public.classes (id, organization_id, name) VALUES ('${CLASS}', '${ORG_A}', 'MYP4-A');
    INSERT INTO public.students (id, organization_id, full_name) VALUES
      ('${STUDENT_1}', '${ORG_A}', 'Amina'), ('${STUDENT_2}', '${ORG_A}', 'Kofi');
    INSERT INTO public.exams (id, organization_id, title, status) VALUES ('${EXAM}', '${ORG_A}', 'First Term Summative', 'closed');
    INSERT INTO public.exam_candidates (id, exam_id, full_name) VALUES ('${CANDIDATE}', '${EXAM}', 'Amina');
    INSERT INTO public.exam_attempts (id, exam_id, candidate_id, student_id, status, score, max_score)
      VALUES ('${ATTEMPT_1}', '${EXAM}', '${CANDIDATE}', '${STUDENT_1}', 'submitted', 40, 50);
  `);

  // ── Assessment creation, score ceiling, tenant guard ──────────────────────
  const { rows: created } = await db.query(
    `INSERT INTO public.assessment_contributions
       (organization_id, title, category_key, category_label, assessed_on, max_score,
        class_id, subject_id, exam_id, scope)
     VALUES ($1, 'Homework week 6', 'homework', 'Homework', '2026-01-12', 20, $2, $3, $4, 'class')
     RETURNING id`,
    [ORG_A, CLASS, SUBJECT, EXAM],
  );
  const contributionId = created[0].id;
  assert.ok(contributionId, "the assessment record must be created");

  await db.query(
    `INSERT INTO public.assessment_contribution_scores
       (contribution_id, organization_id, student_id, student_name, score, max_score)
     VALUES ($1, $2, $3, 'Amina', 17, 20)`,
    [contributionId, ORG_A, STUDENT_1],
  );

  await assert.rejects(
    db.query(
      `INSERT INTO public.assessment_contribution_scores
         (contribution_id, organization_id, student_id, student_name, score, max_score)
       VALUES ($1, $2, $3, 'Kofi', 21, 20)`,
      [contributionId, ORG_A, STUDENT_2],
    ),
    /ck_assessment_score_within_max|check constraint/i,
    "a score above the assessment maximum must be rejected by the database",
  );

  await assert.rejects(
    db.query(
      `INSERT INTO public.assessment_contributions
         (organization_id, title, category_key, category_label, assessed_on, max_score, class_id)
       VALUES ($1, 'Cross tenant', 'homework', 'Homework', '2026-01-12', 20, $2)`,
      [ORG_B, CLASS],
    ),
    /tenant_violation/i,
    "an assessment can never reference another organization's class",
  );

  await assert.rejects(
    db.query(
      `INSERT INTO public.assessment_contributions
         (organization_id, title, category_key, category_label, assessed_on, max_score,
          framework, contribution_method, contributes_to_result)
       VALUES ($1, 'Bad criterion', 'project', 'Project', '2026-01-12', 20,
               'general', 'criterion', true)`,
      [ORG_A],
    ),
    /criterion_requires_framework/i,
    "criterion contributions require a criterion-based framework",
  );

  // ── Custom categories: reserved keys and duplicates rejected ──────────────
  await db.query(
    `INSERT INTO public.assessment_categories (organization_id, key, label)
     VALUES ($1, 'Field Trip', 'Field trip report')`,
    [ORG_A],
  );
  const { rows: catRows } = await db.query(
    `SELECT key, label FROM public.assessment_categories WHERE organization_id = $1`,
    [ORG_A],
  );
  assert.equal(catRows[0].key, "field_trip", "category keys are stored canonically");

  await assert.rejects(
    db.query(`INSERT INTO public.assessment_categories (organization_id, key, label) VALUES ($1, 'homework', 'Homework')`, [ORG_A]),
    /reserved_category_key/i,
    "a built-in category key can never be redefined by a tenant",
  );
  await assert.rejects(
    db.query(`INSERT INTO public.assessment_categories (organization_id, key, label) VALUES ($1, 'field_trip', 'Duplicate')`, [ORG_A]),
    /uq_assessment_categories_org_key|duplicate key/i,
    "a duplicate custom category must be rejected",
  );

  // The assessment record must canonicalize its key the SAME way the category
  // table does, or "Field Trip" would be stored on the assessment as
  // "field trip" while the category is "field_trip" and the two would never
  // join. Found by smoke-testing the migration against the live database.
  const { rows: canonical } = await db.query(
    `INSERT INTO public.assessment_contributions
       (organization_id, title, category_key, category_label, assessed_on, max_score)
     VALUES ($1, 'Field trip report', 'Field Trip', 'Field Trip', '2026-01-14', 10)
     RETURNING category_key`,
    [ORG_A],
  );
  assert.equal(canonical[0].category_key, catRows[0].key, "assessment and category keys canonicalize identically");
  assert.equal(canonical[0].category_key, "field_trip");
  // Removed again so the row counts the RLS assertions below rely on are
  // about the assessments that section is actually reasoning about.
  await db.query(`DELETE FROM public.assessment_contributions WHERE title = 'Field trip report'`);

  // ── UNLIMITED individual adjustments on one student + criterion ───────────
  for (let index = 0; index < 5; index += 1) {
    const previous = 10 + index;
    await db.query(
      `INSERT INTO public.exam_grade_adjustment_entries
         (organization_id, exam_id, attempt_id, candidate_id, student_id, candidate_name,
          category_type, category_key, category_label, category_max_score, direction,
          points_delta, previous_value, new_value, baseline_exam_score, effective_exam_score,
          exam_max_score, reason_code, reason, actor_id, actor_role)
       VALUES ($1,$2,$3,$4,$5,'Amina','myp_criterion','A','Criterion A',15,'increase',1,$6,$7,40,40,50,
               'homework','Homework series completed — entry ${index + 1}',$8,'teacher')`,
      [ORG_A, EXAM, ATTEMPT_1, CANDIDATE, STUDENT_1, previous, previous + 1, USER_TEACHER],
    );
  }
  const { rows: entries } = await db.query(
    `SELECT sequence_no, previous_value::float8 AS previous_value, new_value::float8 AS new_value, direction
       FROM public.exam_grade_adjustment_entries
      WHERE attempt_id = $1 AND category_key = 'A' ORDER BY sequence_no`,
    [ATTEMPT_1],
  );
  assert.equal(entries.length, 5, "five repeated adjustments on the same criterion must all be accepted");
  assert.deepEqual(entries.map((e) => e.sequence_no), [1, 2, 3, 4, 5], "sequence numbers stay ordered");
  assert.equal(entries[4].new_value, 15);

  // A sixth, NEGATIVE adjustment on the same student + criterion.
  await db.query(
    `INSERT INTO public.exam_grade_adjustment_entries
       (organization_id, exam_id, attempt_id, candidate_name, category_type, category_key,
        category_label, category_max_score, direction, points_delta, previous_value, new_value,
        baseline_exam_score, effective_exam_score, exam_max_score, reason_code, reason,
        actor_id, actor_role)
     VALUES ($1,$2,$3,'Amina','myp_criterion','A','Criterion A',15,'decrease',2,15,13,40,40,50,
             'grading_correction','Marking correction after moderation',$4,'admin')`,
    [ORG_A, EXAM, ATTEMPT_1, USER_ADMIN],
  );
  const { rows: afterSix } = await db.query(
    `SELECT count(*)::int AS total, max(sequence_no)::int AS last FROM public.exam_grade_adjustment_entries
      WHERE attempt_id = $1 AND category_key = 'A'`,
    [ATTEMPT_1],
  );
  assert.equal(afterSix[0].total, 6, "there is no ceiling on the number of adjustments");
  assert.equal(afterSix[0].last, 6);

  // ── Ledger integrity guards ───────────────────────────────────────────────
  await assert.rejects(
    db.query(
      `INSERT INTO public.exam_grade_adjustment_entries
         (organization_id, exam_id, attempt_id, candidate_name, category_type, category_key,
          category_label, category_max_score, direction, points_delta, previous_value, new_value,
          baseline_exam_score, effective_exam_score, exam_max_score, reason_code, reason, actor_role)
       VALUES ($1,$2,$3,'Amina','myp_criterion','A','Criterion A',15,'increase',5,13,25,40,40,50,
               'teacher_review','Mismatched pair','teacher')`,
      [ORG_A, EXAM, ATTEMPT_1],
    ),
    /delta_mismatch|score_cap_violation/i,
    "a before/after pair that contradicts the delta must be rejected",
  );

  await assert.rejects(
    db.query(
      `UPDATE public.exam_grade_adjustment_entries SET points_delta = 99 WHERE attempt_id = $1`,
      [ATTEMPT_1],
    ),
    /immutable/i,
    "adjustment ledger rows are append-only",
  );
  await assert.rejects(
    db.query(`DELETE FROM public.exam_grade_adjustment_entries WHERE attempt_id = $1`, [ATTEMPT_1]),
    /immutable/i,
    "adjustment ledger rows cannot be deleted",
  );

  // ── Audit trail immutability ──────────────────────────────────────────────
  await db.query(
    `INSERT INTO public.assessment_contribution_events
       (organization_id, contribution_id, event_type, actor_id, actor_role, new_state, reason)
     VALUES ($1, $2, 'score_recorded', $3, 'teacher', '{"score":17}'::jsonb, 'Score recorded')`,
    [ORG_A, contributionId, USER_TEACHER],
  );
  await assert.rejects(
    db.query(`UPDATE public.assessment_contribution_events SET reason = 'edited'`),
    /immutable/i,
    "audit events are append-only",
  );

  // ── Consolidation tables: tenant, duplicates, ceiling ─────────────────────
  const { rows: profileRows } = await db.query(
    `INSERT INTO public.grade_consolidation_profiles
       (organization_id, exam_id, name, method, exam_weight, scope)
     VALUES ($1, $2, 'First term consolidation', 'weighted', 80, 'class') RETURNING id`,
    [ORG_A, EXAM],
  );
  const profileId = profileRows[0].id;

  await assert.rejects(
    db.query(
      `INSERT INTO public.grade_consolidation_profiles
         (organization_id, exam_id, name, method, exam_weight)
       VALUES ($1, $2, 'Cross tenant', 'weighted', 80)`,
      [ORG_B, EXAM],
    ),
    /tenant_violation/i,
    "a consolidation profile can never point at another organization's examination",
  );

  await db.query(
    `INSERT INTO public.grade_consolidation_inclusions
       (profile_id, organization_id, contribution_id, included, weight, point_value)
     VALUES ($1, $2, $3, true, 20, 5)`,
    [profileId, ORG_A, contributionId],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO public.grade_consolidation_inclusions
         (profile_id, organization_id, contribution_id, included, weight, point_value)
       VALUES ($1, $2, $3, true, 20, 5)`,
      [profileId, ORG_A, contributionId],
    ),
    /uq_consolidation_inclusion|duplicate key/i,
    "one assessment can never be counted twice inside a profile",
  );

  await db.query(
    `INSERT INTO public.grade_consolidation_results
       (profile_id, organization_id, exam_id, attempt_id, student_id, candidate_name,
        original_exam_score, exam_max_score, adjustment_total, contribution_total,
        consolidated_score, consolidated_max, breakdown, status)
     VALUES ($1,$2,$3,$4,$5,'Amina',40,50,0,0.25,40.25,50,'{}'::jsonb,'draft')`,
    [profileId, ORG_A, EXAM, ATTEMPT_1, STUDENT_1],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO public.grade_consolidation_results
         (profile_id, organization_id, exam_id, attempt_id, candidate_name,
          original_exam_score, exam_max_score, consolidated_score, consolidated_max)
       VALUES ($1,$2,$3,$4,'Amina',40,50,55,50)`,
      [profileId, ORG_A, EXAM, ATTEMPT_1],
    ),
    /ck_consolidated_within_max|uq_consolidation_result_attempt|check constraint|duplicate key/i,
    "a consolidated score above its maximum can never be stored",
  );

  // ── Individual overrides are unique per (profile, attempt, contribution) ──
  await db.query(
    `INSERT INTO public.grade_consolidation_overrides
       (profile_id, organization_id, attempt_id, contribution_id, included, weight_override, reason)
     VALUES ($1,$2,$3,$4,true,15,'Extended support plan')`,
    [profileId, ORG_A, ATTEMPT_1, contributionId],
  );
  await assert.rejects(
    db.query(
      `INSERT INTO public.grade_consolidation_overrides
         (profile_id, organization_id, attempt_id, contribution_id, included, weight_override, reason)
       VALUES ($1,$2,$3,$4,false,5,'Duplicate override')`,
      [profileId, ORG_A, ATTEMPT_1, contributionId],
    ),
    /uq_consolidation_override_target|duplicate key/i,
    "a student's override for one assessment must stay unique",
  );

  // ── Read helper ───────────────────────────────────────────────────────────
  const { rows: totals } = await db.query(`SELECT public.grade_adjustment_total($1) AS total`, [ATTEMPT_1]);
  assert.equal(Number(totals[0].total), 0, "only `overall` entries move the examination total");

  // ── RLS: staff-only, tenant-isolated, zero client writes ──────────────────
  async function asUser(userId, fn) {
    await db.exec("BEGIN");
    await db.exec("SET LOCAL ROLE authenticated");
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', true)`);
    try {
      return await fn();
    } finally {
      await db.exec("ROLLBACK");
    }
  }

  const teacherView = await asUser(USER_TEACHER, () =>
    db.query("SELECT count(*)::int AS n FROM public.assessment_contributions"),
  );
  assert.equal(teacherView.rows[0].n, 1, "a teacher of the organization sees its assessments");

  const otherTeacher = await asUser(USER_TEACHER_B, () =>
    db.query("SELECT count(*)::int AS n FROM public.assessment_contributions"),
  );
  assert.equal(otherTeacher.rows[0].n, 0, "a teacher of another organization sees nothing");

  const studentView = await asUser(USER_STUDENT, async () => {
    const contributions = await db.query("SELECT count(*)::int AS n FROM public.assessment_contributions");
    const scores = await db.query("SELECT count(*)::int AS n FROM public.assessment_contribution_scores");
    const ledgerRows = await db.query("SELECT count(*)::int AS n FROM public.exam_grade_adjustment_entries");
    const results = await db.query("SELECT count(*)::int AS n FROM public.grade_consolidation_results");
    return {
      contributions: contributions.rows[0].n,
      scores: scores.rows[0].n,
      ledger: ledgerRows.rows[0].n,
      results: results.rows[0].n,
    };
  });
  assert.deepEqual(
    studentView,
    { contributions: 0, scores: 0, ledger: 0, results: 0 },
    "a learner must have zero visibility of any supplementary assessment data",
  );

  const founderView = await asUser(USER_FOUNDER, () =>
    db.query("SELECT count(*)::int AS n FROM public.assessment_contributions"),
  );
  assert.equal(founderView.rows[0].n, 1, "the read-only supervision role can review assessments");

  await assert.rejects(
    asUser(USER_TEACHER, () =>
      db.query(
        `INSERT INTO public.assessment_contributions
           (organization_id, title, category_key, category_label, assessed_on, max_score)
         VALUES ($1, 'Client write', 'homework', 'Homework', '2026-01-12', 10)`,
        [ORG_A],
      ),
    ),
    /permission denied/i,
    "clients can never write directly: every mutation must pass the application boundary",
  );

  await assert.rejects(
    asUser(USER_FOUNDER, () =>
      db.query(
        `INSERT INTO public.assessment_contribution_scores
           (contribution_id, organization_id, student_id, student_name, score, max_score)
         VALUES ($1, $2, $3, 'Amina', 5, 20)`,
        [contributionId, ORG_A, STUDENT_1],
      ),
    ),
    /permission denied/i,
    "the read-only supervision role cannot write scores even if it could read them",
  );

  // ── Examination data is untouched by this layer ───────────────────────────
  const { rows: attemptRow } = await db.query(
    `SELECT score::float8 AS score, max_score::float8 AS max_score, status FROM public.exam_attempts WHERE id = $1`,
    [ATTEMPT_1],
  );
  assert.equal(Number(attemptRow[0].score), 40, "the original examination score is never overwritten");
  assert.equal(Number(attemptRow[0].max_score), 50);

  await db.close();
});

// ─── 8. Unlimited adjustment ledger engine ──────────────────────────────────

check("the ledger plans repeated adjustments and clamps to the permitted scale", () => {
  const first = ledger.planAdjustment({
    categoryType: "myp_criterion",
    categoryMaxScore: 15,
    currentCategoryValue: 10,
    baselineExamScore: 40,
    currentEffectiveExamScore: 40,
    examMaxScore: 50,
    direction: "increase",
    pointsDelta: 3,
  });
  assert.equal(first.previousValue, 10);
  assert.equal(first.newValue, 13);
  assert.equal(first.appliedDelta, 3);
  assert.equal(first.capped, false);

  const capped = ledger.planAdjustment({
    categoryType: "myp_criterion",
    categoryMaxScore: 15,
    currentCategoryValue: 14,
    baselineExamScore: 40,
    currentEffectiveExamScore: 44,
    examMaxScore: 50,
    direction: "increase",
    pointsDelta: 5,
  });
  assert.equal(capped.newValue, 15, "the criterion maximum is a hard ceiling");
  assert.equal(capped.appliedDelta, 1);
  assert.equal(capped.capReason, "category_max");

  const negative = ledger.planAdjustment({
    categoryType: "overall",
    categoryMaxScore: 50,
    currentCategoryValue: 40,
    baselineExamScore: 40,
    currentEffectiveExamScore: 40,
    examMaxScore: 50,
    direction: "decrease",
    pointsDelta: 100,
  });
  assert.equal(negative.newValue, 0, "a reduction can never go below zero");
  assert.equal(negative.appliedDelta, 40);
  assert.equal(negative.capReason, "exam_min", "an overall reduction reports the examination floor");

  const blocked = ledger.planAdjustment({
    categoryType: "overall",
    categoryMaxScore: 50,
    currentCategoryValue: 50,
    baselineExamScore: 50,
    currentEffectiveExamScore: 50,
    examMaxScore: 50,
    direction: "increase",
    pointsDelta: 1,
  });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.blockedReason.includes("maximum"));
});

check("the ledger folds signed deltas and never overwrites the original score", () => {
  const entries = [
    { categoryType: "overall", direction: "increase", pointsDelta: 2 },
    { categoryType: "overall", direction: "decrease", pointsDelta: 0.5 },
    { categoryType: "myp_criterion", categoryKey: "A", direction: "increase", pointsDelta: 100 },
  ];
  assert.equal(ledger.foldLedgerEntries(40, 50, entries), 41.5);
  assert.equal(ledger.foldLedgerEntries(40, 41, entries), 41, "the examination maximum still clamps");
  assert.equal(ledger.foldLedgerEntries(40, 50, []), 40, "no entries means the original score");
  assert.equal(ledger.criterionLedgerDelta(entries, "a"), 100);
  assert.equal(ledger.criterionLedgerDelta(entries, "B"), 0);
});

check("ledger history groups unlimited entries per category with their net delta", () => {
  const groups = ledger.groupLedgerHistory([
    {
      id: "1",
      attemptId: "a1",
      studentId: "s1",
      candidateId: "c1",
      candidateName: "Amina",
      categoryType: "myp_criterion",
      categoryKey: "A",
      categoryLabel: "Criterion A",
      categoryMaxScore: 15,
      direction: "increase",
      pointsDelta: 1,
      previousValue: 10,
      newValue: 11,
      baselineExamScore: 40,
      effectiveExamScore: 40,
      examMaxScore: 50,
      reasonCode: "homework",
      reason: "Homework series",
      teacherComment: null,
      capped: false,
      capReason: null,
      sequenceNo: 1,
      actorId: "u1",
      actorEmail: "t@x.test",
      actorRole: "teacher",
      actorConsole: "workspace",
      createdAt: "2026-01-12T10:00:00.000Z",
    },
    {
      id: "2",
      attemptId: "a1",
      studentId: "s1",
      candidateId: "c1",
      candidateName: "Amina",
      categoryType: "myp_criterion",
      categoryKey: "A",
      categoryLabel: "Criterion A",
      categoryMaxScore: 15,
      direction: "decrease",
      pointsDelta: 0.5,
      previousValue: 11,
      newValue: 10.5,
      baselineExamScore: 40,
      effectiveExamScore: 40,
      examMaxScore: 50,
      reasonCode: "grading_correction",
      reason: "Moderation",
      teacherComment: "Reviewed with the department",
      capped: false,
      capReason: null,
      sequenceNo: 2,
      actorId: "u2",
      actorEmail: "a@x.test",
      actorRole: "admin",
      actorConsole: "workspace",
      createdAt: "2026-01-13T10:00:00.000Z",
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entryCount, 2);
  assert.equal(groups[0].netDelta, 0.5);
  assert.equal(groups[0].currentValue, 10.5);
  assert.equal(ledger.ledgerEntryCount(groups[0].entries), 2);
});

check("every required adjustment reason category is offered", () => {
  const values = ledger.ADJUSTMENT_REASON_CODES.map((r) => r.value);
  for (const required of [
    "formative_assessment",
    "homework",
    "class_test",
    "classwork",
    "project",
    "practical_assessment",
    "oral_assessment",
    "teacher_review",
    "grading_correction",
    "other",
  ]) {
    assert.ok(values.includes(required), `missing adjustment reason ${required}`);
  }
  assert.equal(ledger.normalizeReasonCode("HOMEWORK"), "homework");
  assert.equal(ledger.normalizeReasonCode("nonsense"), null);
  assert.equal(ledger.normalizeAdjustmentMagnitude(-4), 4, "the sign lives in the direction, never the magnitude");
  assert.equal(ledger.normalizeAdjustmentMagnitude(0), null);
  assert.equal(ledger.normalizeAdjustmentMagnitude(1001), null);
});

// ─── 9. Static security & surface integration ───────────────────────────────

check("every new table is RLS-enabled with zero client writes in the migration", () => {
  const sql = readFileSync(resolve(ROOT, MIGRATION), "utf8");
  const tables = [
    "assessment_categories",
    "assessment_contributions",
    "assessment_contribution_scores",
    "assessment_contribution_events",
    "exam_grade_adjustment_entries",
    "grade_consolidation_profiles",
    "grade_consolidation_inclusions",
    "grade_consolidation_overrides",
    "grade_consolidation_results",
  ];
  for (const table of tables) {
    assert.ok(
      new RegExp(`alter table public\\.${table}\\s+enable row level security`).test(sql),
      `${table} must enable RLS`,
    );
    assert.ok(
      new RegExp(`revoke insert, update, delete on public\\.${table}\\s+from public, anon, authenticated`).test(sql),
      `${table} must revoke client writes`,
    );
    assert.ok(
      new RegExp(`create policy \\w+ on public\\.${table}\\s+for select to authenticated`).test(sql),
      `${table} must have an explicit staff-only SELECT policy`,
    );
  }
  // No destructive statement anywhere in the executable SQL (comments stripped).
  const executableSql = sql
    .split("\n")
    .map((line) => line.replace(/^\s*--.*$/, ""))
    .join("\n")
    .toLowerCase();
  for (const forbidden of ["drop table", "truncate", "delete from public.exam", "drop column", "alter table public.exams", "alter table public.exam_attempts", "alter table public.exam_answers"]) {
    assert.ok(!executableSql.includes(forbidden), `the migration must never contain "${forbidden}"`);
  }
  assert.ok(
    !sql.includes("create unique index") || sql.includes("uq_consolidation_override_target"),
    "the only new unique index is the override target",
  );
  // The unlimited ledger must NOT carry a per-(attempt, category) uniqueness ceiling.
  const ledgerSection = sql.slice(sql.indexOf("create table if not exists public.exam_grade_adjustment_entries"));
  const ledgerTable = ledgerSection.slice(0, ledgerSection.indexOf("comment on table public.exam_grade_adjustment_entries"));
  assert.ok(!/unique \(/i.test(ledgerTable), "the adjustment ledger must not limit repeated adjustments");
});

check("the server layer refuses learners and read-only roles before any write", () => {
  const source = readFileSync(resolve(ROOT, "src/lib/assessmentContributionsServer.ts"), "utf8");
  assert.ok(source.includes('LEARNER_ROLES = new Set(["student", "candidate", "parent", "participant"])'));
  assert.ok(source.includes('READ_ONLY_ROLES = new Set(["school_founder"])'));
  assert.ok(source.includes('action !== "view"'), "the founder ceiling must block every write action");
  assert.ok(source.includes('canOperate(ctx, organizationId, required, "exam_results")'));
  assert.ok(source.includes("resolveTeacherScope"), "teachers must be scoped to their real assignments");
  assert.ok(source.includes("teacher_subjects") && source.includes("class_subjects"));
  assert.ok(source.includes('requiredOrganizationId') || source.includes('.eq("organization_id", organizationId)'));
  // Publishing needs results.publish; editing needs grading.edit.
  assert.ok(source.includes('"results.publish"') && source.includes('"grading.edit"'));
});

check("the API routes derive the organization from the session, never the body", () => {
  const routes = [
    "src/app/api/dashboard/assessments/route.ts",
    "src/app/api/dashboard/assessments/[id]/route.ts",
    "src/app/api/dashboard/assessments/[id]/scores/route.ts",
    "src/app/api/dashboard/exams/[id]/grade-adjustments/route.ts",
    "src/app/api/dashboard/exams/[id]/consolidation/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(resolve(ROOT, route), "utf8");
    assert.ok(source.includes("getSessionContext"), `${route} must authenticate`);
    assert.ok(source.includes("activeOrg(ctx)"), `${route} must use the session organization`);
    assert.ok(
      !/body\.organizationId|body\["organizationId"\]/.test(source),
      `${route} must never read an organization id from the request body`,
    );
    assert.ok(source.includes("authorizeAssessmentActor"), `${route} must authorize through the single boundary`);
  }
});

check("the candidate paper only renders published consolidation data", () => {
  const server = readFileSync(resolve(ROOT, "src/lib/assessmentContributionsServer.ts"), "utf8");
  const loader = server.slice(server.indexOf("export async function loadCandidateSupplementaryResult"));
  assert.ok(loader.includes('.eq("status", "published")'), "only published results may reach a candidate");
  assert.ok(loader.includes('profile.status !== "published"'), "the profile must be published too");
  assert.ok(!loader.includes("actor_email") || loader.includes("never the actor"), "no actor identity is projected");

  const page = readFileSync(resolve(ROOT, "src/app/exam/result/[token]/page.tsx"), "utf8");
  assert.ok(page.includes("loadCandidateSupplementaryResult"));
  assert.ok(page.includes("supplementary.available"), "the paper degrades to its previous behaviour when nothing is published");
  assert.ok(page.includes("resultsPublished\n    ? await loadCandidateSupplementaryResult") || /resultsPublished\s*\?\s*await loadCandidateSupplementaryResult/.test(page));
});

check("the workspace surfaces exist and are wired into navigation and the module map", () => {
  const nav = readFileSync(resolve(ROOT, "src/components/dashboard/DashboardChrome.tsx"), "utf8");
  assert.ok(nav.includes('href: "/dashboard/assessments"'));
  const modules = readFileSync(resolve(ROOT, "src/lib/modules.ts"), "utf8");
  assert.ok(modules.includes('"/dashboard/assessments"'), "the module console must list the new surface");

  for (const page of [
    "src/app/dashboard/assessments/page.tsx",
    "src/app/dashboard/assessments/[id]/page.tsx",
    "src/app/dashboard/exams/[id]/grade-adjustments/page.tsx",
    "src/app/dashboard/exams/[id]/consolidation/page.tsx",
  ]) {
    const source = readFileSync(resolve(ROOT, page), "utf8");
    assert.ok(source.includes("requireModule"), `${page} must enforce the module entitlement`);
    assert.ok(source.includes("authorizeAssessmentActor"), `${page} must authorize server-side`);
  }

  const studio = readFileSync(resolve(ROOT, "src/app/dashboard/score-adjustments/page.tsx"), "utf8");
  assert.ok(studio.includes("/grade-adjustments"), "the batch studio must link the unlimited individual ledger");
  assert.ok(studio.includes("/dashboard/assessments"), "the batch studio must link Assessment Contributions");
});

console.log(`PASS test-assessment-contributions (${passed} checks)`);
