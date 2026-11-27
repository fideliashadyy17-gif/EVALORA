/**
 * Repeated Examination Score Adjustments — end-to-end verification.
 *
 * Regression suite for the defect where a student who had already been adjusted
 * on a criterion could never be adjusted on that criterion again. It exercises
 * the REAL production code on both sides of the wire:
 *
 *   • `src/lib/scoreAdjustments.ts`  — the authoritative preview/capping engine
 *     that the API route consults before it will confirm anything.
 *   • `supabase/migrations/20261125230000_score_adjustments.sql` plus
 *     `supabase/migrations/20261127150000_repeated_score_adjustments.sql`,
 *     executed verbatim in PGlite — so the RPC, its uniqueness constraints,
 *     immutability triggers and RLS policies are the shipped ones.
 *
 * Covered:
 *   1.  Individual adjustment on a criterion is persisted
 *   2.  The SAME student on the SAME criterion, adjusted again (and again, …)
 *   3.  Effective score is correct after every operation
 *   4.  Adjustment history is append-only and ordered by sequence_no
 *   5.  Every MYP criterion A, B, C and D is independently re-adjustable
 *   6.  Bulk adjustment across many students / the whole eligible cohort
 *   7.  Re-opening the interface shows a usable state, not a dead end
 *   8.  No double application of previously persisted adjustments
 *   9.  Score boundaries: criterion max, exam max, and their capping
 *  10.  Permissions: super admin, org owner/admin, teacher allowed;
 *       school founder read-only; student / cross-tenant / wrong plan denied
 *  11.  Genuine duplicate protection survives (same batch twice, replayed
 *       idempotency key, history mutation)
 *
 * Production data is never touched: every row lives in an in-memory PGlite
 * database built from synthetic plans, organizations, users, exams, attempts
 * and answers. No live MYP4/MYP5 Version C examination is used as a fixture.
 *
 * Run standalone: `node scripts/test-repeated-score-adjustments.mjs`
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
async function checkAsync(label, fn) {
  await fn();
  passed += 1;
}

// ─── Compile the real TypeScript engine ──────────────────────────────────────
const outDir = "/tmp/evalora-repeated-adj-test";
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
const require = createRequire(import.meta.url);
const scoreAdj = require(`${outDir}/lib/scoreAdjustments.js`);

// ─── Synthetic MYP paper: criteria A, B, C, D — exam max 40 ──────────────────
const PAPER = [
  { questionId: "qA", points: 10, criterion: "A", sectionId: "s1", sectionTitle: "Part 1" },
  { questionId: "qB", points: 10, criterion: "B", sectionId: "s1", sectionTitle: "Part 1" },
  { questionId: "qC", points: 10, criterion: "C", sectionId: "s2", sectionTitle: "Part 2" },
  { questionId: "qD", points: 10, criterion: "D", sectionId: "s2", sectionTitle: "Part 2" },
];
const EXAM_MAX = 40;
const CATEGORIES = scoreAdj.extractAdjustmentCategories(PAPER);
const categoryFor = (code) => {
  const c = CATEGORIES.find(
    (x) => x.categoryType === "myp_criterion" && x.categoryKey === code,
  );
  assert.ok(c, `criterion ${code} must exist on the synthetic paper`);
  return c;
};

// ─── Synthetic database ──────────────────────────────────────────────────────
const db = new PGlite();
await db.exec(readFileSync(resolve(ROOT, "scripts/fixtures/score-adjustment-bootstrap.sql"), "utf8"));
for (const rel of [
  "supabase/migrations/20261125230000_score_adjustments.sql",
  "supabase/migrations/20261127150000_repeated_score_adjustments.sql",
]) {
  await db.exec(readFileSync(resolve(ROOT, rel), "utf8"));
}

const ORG = "10000000-0000-4000-8000-0000000000a1";
const ORG_OTHER = "10000000-0000-4000-8000-0000000000a2";
const ORG_FREE = "10000000-0000-4000-8000-0000000000a3";
const PLAN_INST = "20000000-0000-4000-8000-0000000000a1";
const PLAN_FREE = "20000000-0000-4000-8000-0000000000a2";

const U_SUPER = "30000000-0000-4000-8000-0000000000a1";
const U_OWNER = "30000000-0000-4000-8000-0000000000a2";
const U_ADMIN = "30000000-0000-4000-8000-0000000000a3";
const U_TEACHER = "30000000-0000-4000-8000-0000000000a4";
const U_FOUNDER = "30000000-0000-4000-8000-0000000000a5";
const U_STUDENT = "30000000-0000-4000-8000-0000000000a6";
const U_TEACHER_OTHER = "30000000-0000-4000-8000-0000000000a7";
const U_TEACHER_FREE = "30000000-0000-4000-8000-0000000000a8";

const EXAM = "40000000-0000-4000-8000-0000000000a1";
const EXAM_OTHER = "40000000-0000-4000-8000-0000000000a2";
const EXAM_FREE = "40000000-0000-4000-8000-0000000000a3";

const ATT = [1, 2, 3, 4].map(
  (n) => `50000000-0000-4000-8000-0000000000a${n}`,
);
const ATT_OTHER = "50000000-0000-4000-8000-0000000000a9";
const ATT_PERM = "50000000-0000-4000-8000-0000000000ab";
const ATT_FREE = "50000000-0000-4000-8000-0000000000aa";

await db.exec(`
  INSERT INTO public.plans (id, slug, name, limits) VALUES
    ('${PLAN_INST}', 'institution', 'Institution', '{"institutional": true}'::jsonb),
    ('${PLAN_FREE}', 'free', 'Free', '{"institutional": false}'::jsonb);

  INSERT INTO public.organizations (id, name) VALUES
    ('${ORG}', 'Synthetic Test Academy'),
    ('${ORG_OTHER}', 'Synthetic Other Academy'),
    ('${ORG_FREE}', 'Synthetic Free Plan School');

  INSERT INTO public.subscriptions (organization_id, plan_id, status) VALUES
    ('${ORG}', '${PLAN_INST}', 'active'),
    ('${ORG_OTHER}', '${PLAN_INST}', 'active'),
    ('${ORG_FREE}', '${PLAN_FREE}', 'active');

  INSERT INTO public.profiles (id, email, platform_role, status) VALUES
    ('${U_SUPER}', 'super@synthetic.test', 'super_admin', 'active'),
    ('${U_OWNER}', 'owner@synthetic.test', 'user', 'active'),
    ('${U_ADMIN}', 'admin@synthetic.test', 'user', 'active'),
    ('${U_TEACHER}', 'teacher@synthetic.test', 'user', 'active'),
    ('${U_FOUNDER}', 'founder@synthetic.test', 'user', 'active'),
    ('${U_STUDENT}', 'student@synthetic.test', 'user', 'active'),
    ('${U_TEACHER_OTHER}', 'teacher@other.test', 'user', 'active'),
    ('${U_TEACHER_FREE}', 'teacher@free.test', 'user', 'active');

  INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
    ('${ORG}', '${U_OWNER}', 'owner', 'active'),
    ('${ORG}', '${U_ADMIN}', 'admin', 'active'),
    ('${ORG}', '${U_TEACHER}', 'teacher', 'active'),
    ('${ORG}', '${U_FOUNDER}', 'school_founder', 'active'),
    ('${ORG}', '${U_STUDENT}', 'student', 'active'),
    ('${ORG_OTHER}', '${U_TEACHER_OTHER}', 'teacher', 'active'),
    ('${ORG_FREE}', '${U_TEACHER_FREE}', 'teacher', 'active');

  INSERT INTO public.exams (id, organization_id, title, status, settings) VALUES
    ('${EXAM}', '${ORG}', 'SYNTHETIC MYP Practice Exam', 'closed',
      '{"results_validated": false, "results_published": false}'::jsonb),
    ('${EXAM_OTHER}', '${ORG_OTHER}', 'SYNTHETIC Other Academy Exam', 'closed',
      '{"results_validated": false, "results_published": false}'::jsonb),
    ('${EXAM_FREE}', '${ORG_FREE}', 'SYNTHETIC Free Plan Exam', 'closed',
      '{"results_validated": false, "results_published": false}'::jsonb);

  INSERT INTO public.exam_attempts (id, exam_id, status, score, max_score, grading_status, pending_manual_count) VALUES
    ('${ATT[0]}', '${EXAM}', 'marked', 20, ${EXAM_MAX}, 'graded', 0),
    ('${ATT[1]}', '${EXAM}', 'marked', 24, ${EXAM_MAX}, 'graded', 0),
    ('${ATT[2]}', '${EXAM}', 'marked', 30, ${EXAM_MAX}, 'graded', 0),
    ('${ATT[3]}', '${EXAM}', 'marked', 16, ${EXAM_MAX}, 'graded', 0),
    ('${ATT_PERM}', '${EXAM}', 'marked', 20, ${EXAM_MAX}, 'graded', 0),
    ('${ATT_OTHER}', '${EXAM_OTHER}', 'marked', 20, ${EXAM_MAX}, 'graded', 0),
    ('${ATT_FREE}', '${EXAM_FREE}', 'marked', 20, ${EXAM_MAX}, 'graded', 0);

  INSERT INTO public.exam_answers (attempt_id, points_awarded) VALUES
    ('${ATT[0]}', 20), ('${ATT[1]}', 24), ('${ATT[2]}', 30), ('${ATT[3]}', 16),
    ('${ATT_PERM}', 20);
`.replace("${EXAM_OTHER_PLACEHOLDER}", EXAM));

// ─── Helpers ─────────────────────────────────────────────────────────────────
let keySeq = 0;
const nextKey = () => `synthetic-repeat-key-${String(++keySeq).padStart(4, "0")}`;

const attemptScore = async (attemptId) => {
  const r = await db.query(
    `select score::float8 as score, max_score::float8 as max_score, status
       from public.exam_attempts where id = '${attemptId}'`,
  );
  return r.rows[0];
};

const ledgerFor = async (attemptId, categoryKey) => {
  const r = await db.query(
    `select sequence_no::int as seq, points_applied::float8 as points,
            original_category_score::float8 as orig_cat,
            adjusted_category_score::float8 as adj_cat,
            original_exam_score::float8 as orig_exam,
            adjusted_exam_score::float8 as adj_exam,
            capped, cap_reason, created_at
       from public.exam_score_adjustment_items
      where attempt_id = '${attemptId}'
        and category_type = 'myp_criterion'
        and category_key = '${categoryKey}'
      order by sequence_no`,
  );
  return r.rows;
};

/** Live ledger rows expressed in the shape the preview engine consumes. */
const priorAdjustmentsFor = async (examId = EXAM) => {
  const r = await db.query(
    `select i.id, i.adjustment_id, i.attempt_id, i.category_type, i.category_key,
            i.sequence_no::int as sequence_no,
            i.points_requested::float8 as points_requested,
            i.points_applied::float8 as points_applied,
            i.original_category_score::float8 as original_category_score,
            i.adjusted_category_score::float8 as adjusted_category_score,
            i.category_max_score::float8 as category_max_score,
            i.original_exam_score::float8 as original_exam_score,
            i.adjusted_exam_score::float8 as adjusted_exam_score,
            i.exam_max_score::float8 as exam_max_score,
            i.capped, i.cap_reason, i.created_at
       from public.exam_score_adjustment_items i
      where i.exam_id = '${examId}'
      order by i.attempt_id, i.category_key, i.sequence_no`,
  );
  return r.rows.map((x) => ({
    id: String(x.id),
    adjustmentId: String(x.adjustment_id),
    attemptId: String(x.attempt_id),
    categoryType: x.category_type,
    categoryKey: x.category_key,
    sequenceNo: Number(x.sequence_no),
    pointsRequested: Number(x.points_requested),
    pointsApplied: Number(x.points_applied),
    originalCategoryScore: Number(x.original_category_score),
    adjustedCategoryScore: Number(x.adjusted_category_score),
    categoryMaxScore: Number(x.category_max_score),
    originalExamScore: Number(x.original_exam_score),
    adjustedExamScore: Number(x.adjusted_exam_score),
    examMaxScore: Number(x.exam_max_score),
    capped: Boolean(x.capped),
    capReason: x.cap_reason ?? null,
    createdAt: String(x.created_at),
  }));
};

const attemptInput = async (attemptId, name) => {
  const row = await attemptScore(attemptId);
  return {
    attemptId,
    candidateId: null,
    studentId: null,
    candidateName: name,
    className: "SYNTHETIC CLASS",
    status: row.status,
    gradingStatus: "graded",
    pendingManualCount: 0,
    score: row.score,
    maxScore: row.max_score,
    submittedAt: "2026-11-27T10:00:00Z",
    // Even split across the four criteria questions.
    answersByQuestion: { qA: 5, qB: 5, qC: 5, qD: 5 },
  };
};

/**
 * Builds a single valid adjustment item from live database state, so tests that
 * call the RPC directly never pass a stale baseline.
 */
async function rawItem(attemptId, categoryKey, points, name = "Synthetic Student") {
  const category = categoryFor(categoryKey);
  const attempt = await attemptInput(attemptId, name);
  const prior = await priorAdjustmentsFor();
  const origCat = scoreAdj.computeCategoryScoreForAttempt(category, PAPER, attempt, prior);
  const adjCat = Math.min(category.maxScore, Math.round((origCat + points) * 100) / 100);
  const applied = Math.round((adjCat - origCat) * 100) / 100;
  const origExam = attempt.score;
  const adjExam = Math.min(EXAM_MAX, Math.round((origExam + applied) * 100) / 100);
  return {
    attempt_id: attemptId,
    candidate_id: null,
    student_id: null,
    candidate_name: name,
    category_max_score: category.maxScore,
    original_category_score: origCat,
    adjusted_category_score: adjCat,
    exam_max_score: EXAM_MAX,
    original_exam_score: origExam,
    adjusted_exam_score: adjExam,
    points_applied: applied,
    capped: adjCat + 1e-9 < origCat + points,
    cap_reason: null,
  };
}

const callRpcRaw = async (examId, categoryKey, reason, key, actor, email, role, items) =>
  db.query(
    `select public.apply_exam_score_adjustment(
       $1::uuid, 'myp_criterion', $2, $3, $4::numeric, 'selected', $5, $6,
       $7::uuid, $8, $9, 'workspace', $10::jsonb
     ) as res`,
    [examId, categoryKey, `Criterion ${categoryKey}`, 1, reason, key, actor, email, role, JSON.stringify(items)],
  );

/**
 * Builds a preview from the CURRENT database state — exactly what the API route
 * does — then applies it through the real RPC. Returns the preview + outcome.
 */
async function adjust({
  attemptIds,
  categoryKey,
  points,
  scope = "selected",
  reason = "Synthetic verification adjustment",
  actor = U_TEACHER,
  email = "teacher@synthetic.test",
  role = "teacher",
  console = "workspace",
  examId = EXAM,
  key = nextKey(),
}) {
  const category = categoryFor(categoryKey);
  const attempts = [];
  for (const id of attemptIds) attempts.push(await attemptInput(id, `Student ${id.slice(-2)}`));
  const priorAdjustments = await priorAdjustmentsFor(examId);

  const preview = scoreAdj.buildScoreAdjustmentPreview({
    category,
    pointsRequested: points,
    scope,
    selectedAttemptIds: scope === "selected" ? attemptIds : undefined,
    paper: PAPER,
    attempts,
    priorAdjustments,
  });

  if (!preview.canConfirm) {
    return { preview, outcome: null, error: preview.warnings[0] ?? "preview cannot confirm" };
  }

  const items = preview.applicableRows.map((row) => ({
    attempt_id: row.attemptId,
    candidate_id: row.candidateId,
    student_id: row.studentId,
    candidate_name: row.candidateName,
    category_max_score: row.categoryMaxScore,
    original_category_score: row.originalCategoryScore,
    adjusted_category_score: row.adjustedCategoryScore,
    exam_max_score: row.examMaxScore,
    original_exam_score: row.originalExamScore,
    adjusted_exam_score: row.adjustedExamScore,
    points_applied: row.pointsApplied,
    capped: row.capped,
    cap_reason: row.capReason,
  }));

  const res = await db.query(
    `select public.apply_exam_score_adjustment(
       $1::uuid, $2, $3, $4, $5::numeric, $6, $7, $8, $9::uuid, $10, $11, $12, $13::jsonb
     ) as res`,
    [
      examId,
      category.categoryType,
      category.categoryKey,
      category.categoryLabel,
      points,
      scope,
      reason,
      key,
      actor,
      email,
      role,
      console,
      JSON.stringify(items),
    ],
  );
  return { preview, outcome: res.rows[0].res, error: null };
}

// ═══ 1. Individual adjustment, then the SAME student + SAME criterion again ══
await checkAsync("1–8. One student adjusted repeatedly on the same criterion", async () => {
  const target = ATT[0];
  const before = await attemptScore(target);
  assert.equal(before.score, 20, "synthetic fixture starts at 20/40");

  let running = before.score;
  for (let i = 1; i <= 4; i += 1) {
    const { preview, outcome, error } = await adjust({
      attemptIds: [target],
      categoryKey: "C",
      points: 1,
      reason: `Synthetic repeat adjustment #${i} on Criterion C`,
    });
    assert.equal(error, null, `adjustment #${i} must be accepted, got: ${error}`);
    assert.equal(outcome.students_affected, 1, `adjustment #${i} must affect the student`);
    assert.equal(preview.applicableCount, 1, `adjustment #${i} must have an applicable row`);
    running += 1;

    const after = await attemptScore(target);
    assert.equal(
      after.score,
      running,
      `after adjustment #${i} the persisted score must be ${running}`,
    );
    assert.equal(after.max_score, EXAM_MAX, "the exam maximum is never altered");
    assert.equal(after.status, "marked", "attempt status is never altered");
  }

  // 4. Adjustment history is append-only, ordered, and contiguous.
  const history = await ledgerFor(target, "C");
  assert.deepEqual(
    history.map((h) => h.seq),
    [1, 2, 3, 4],
    "every repeat adjustment appends the next sequence number",
  );
  assert.deepEqual(
    history.map((h) => h.points),
    [1, 1, 1, 1],
    "each adjustment keeps its own applied points",
  );
  for (let i = 1; i < history.length; i += 1) {
    assert.equal(
      history[i].orig_cat,
      history[i - 1].adj_cat,
      `entry ${history[i].seq} starts exactly where entry ${history[i - 1].seq} ended (no double application)`,
    );
    assert.equal(
      history[i].orig_exam,
      history[i - 1].adj_exam,
      `entry ${history[i].seq} exam baseline chains from entry ${history[i - 1].seq}`,
    );
  }
  assert.equal(history[history.length - 1].adj_exam, 24, "final effective score is 24/40");

  // Cumulative helper agrees with the ledger.
  const total = await db.query(
    `select public.exam_attempt_adjustment_total('${target}'::uuid)::float8 as t`,
  );
  assert.equal(total.rows[0].t, 4, "cumulative adjustment total is 1+1+1+1");

  // Answers were never touched.
  const answers = await db.query(
    `select points_awarded::float8 as p from public.exam_answers where attempt_id = '${target}'`,
  );
  assert.deepEqual(
    answers.rows.map((a) => a.p),
    [20],
    "exam_answers is never modified by an adjustment",
  );
});

// ═══ 9. A different criterion on the same student is independently re-adjustable
await checkAsync("9. Criteria A, B, C and D are each independently re-adjustable", async () => {
  const target = ATT[1];
  for (const code of ["A", "B", "C", "D"]) {
    for (let i = 1; i <= 2; i += 1) {
      const { outcome, error } = await adjust({
        attemptIds: [target],
        categoryKey: code,
        points: 1,
        reason: `Synthetic repeat adjustment on Criterion ${code} #${i}`,
      });
      assert.equal(error, null, `criterion ${code} adjustment #${i} must be accepted: ${error}`);
      assert.equal(outcome.students_affected, 1);
    }
    const history = await ledgerFor(target, code);
    assert.deepEqual(
      history.map((h) => h.seq),
      [1, 2],
      `criterion ${code} holds two independent ledger entries`,
    );
  }
  const score = await attemptScore(target);
  assert.equal(score.score, 32, "24 + eight 1-point adjustments across A/B/C/D = 32");

  // No criteria invented outside the MYP framework.
  const types = new Set(CATEGORIES.map((c) => c.categoryType));
  assert.ok(types.has("myp_criterion"), "MYP criteria are offered");
  assert.deepEqual(
    CATEGORIES.filter((c) => c.categoryType === "myp_criterion").map((c) => c.categoryKey).sort(),
    ["A", "B", "C", "D"],
    "only the paper's own MYP criteria are adjustable",
  );
});

// ═══ 10–12. Bulk adjustment across many students, repeatedly ═════════════════
await checkAsync("10–12. Bulk adjustment reaches every student, including already-adjusted ones", async () => {
  const cohort = ATT;

  // Criterion B history each student already carries (test 9 adjusted one of
  // them), so the assertions below check what the bulk passes APPEND.
  const priorB = new Map();
  for (const id of cohort) priorB.set(id, (await ledgerFor(id, "B")).length);

  // First bulk pass over the whole eligible cohort.
  const first = await adjust({
    attemptIds: cohort,
    categoryKey: "B",
    points: 2,
    scope: "all_eligible",
    reason: "Synthetic bulk adjustment across the cohort",
  });
  assert.equal(first.error, null, `bulk pass 1 must succeed: ${first.error}`);
  assert.equal(first.outcome.students_affected, cohort.length, "every student is adjusted");

  // Second bulk pass — the same cohort, already adjusted once.
  const second = await adjust({
    attemptIds: cohort,
    categoryKey: "B",
    points: 1,
    scope: "all_eligible",
    reason: "Synthetic second bulk adjustment across the cohort",
  });
  assert.equal(
    second.error,
    null,
    `bulk pass 2 must succeed on an already-adjusted cohort: ${second.error}`,
  );
  assert.equal(
    second.outcome.students_affected,
    cohort.length,
    "no student is silently dropped from the second bulk pass",
  );
  assert.equal(second.preview.alreadyAdjustedCount, cohort.length, "history is reported, not blocking");

  for (const id of cohort) {
    const history = await ledgerFor(id, "B");
    const base = priorB.get(id);
    assert.equal(
      history.length,
      base + 2,
      `both bulk passes append to ${id}'s criterion B history`,
    );
    assert.deepEqual(
      history.map((h) => h.seq),
      Array.from({ length: base + 2 }, (_, i) => i + 1),
      `sequence numbers stay contiguous for ${id}`,
    );
    assert.equal(history[base].points, 2, "first bulk pass applied 2 points");
    assert.equal(history[base + 1].points, 1, "second bulk pass applied 1 point");
  }

  // Multi-student selection (not the whole cohort) also repeats.
  const pair = [ATT[2], ATT[3]];
  for (let i = 0; i < 3; i += 1) {
    const { outcome, error } = await adjust({
      attemptIds: pair,
      categoryKey: "D",
      points: 1,
      reason: `Synthetic selected-cohort adjustment #${i + 1}`,
    });
    assert.equal(error, null, `selected bulk pass #${i + 1} must succeed: ${error}`);
    assert.equal(outcome.students_affected, 2, "both selected students are adjusted each time");
  }
  for (const id of pair) {
    assert.deepEqual(
      (await ledgerFor(id, "D")).map((h) => h.seq),
      [1, 2, 3],
      "three repeats land on each selected student",
    );
  }
});

// ═══ 13. Re-opening the interface stays usable ═══════════════════════════════
await checkAsync("13. Re-opening the interface shows a usable state, never a dead end", async () => {
  const target = ATT[0];
  const category = categoryFor("C");
  const priorAdjustments = await priorAdjustmentsFor();
  const preview = scoreAdj.buildScoreAdjustmentPreview({
    category,
    pointsRequested: 1,
    scope: "all_eligible",
    paper: PAPER,
    attempts: [await attemptInput(target, "Student One")],
    priorAdjustments,
  });

  assert.equal(preview.canConfirm, true, "the panel must still be confirmable on reopen");
  assert.equal(preview.applicableCount, 1, "the previously adjusted student is still applicable");
  const row = preview.rows[0];
  assert.equal(row.priorAdjustmentCount, 4, "the interface reports the full adjustment history");
  assert.equal(row.priorPointsApplied, 4, "and the combined prior effect");
  assert.ok(row.priorAdjustment, "the latest adjustment is surfaced for the history column");
  assert.equal(row.priorAdjustment.pointsApplied, 1);
  assert.ok(
    !preview.warnings.some((w) => /skipped to prevent duplicate/i.test(w)),
    "no warning may tell staff the student will be skipped",
  );
  assert.ok(
    preview.warnings.some((w) => /will not be applied twice/i.test(w)),
    "staff are told prior points are already folded in",
  );
});

// ═══ 14. No double application ═══════════════════════════════════════════════
await checkAsync("14. Previously persisted adjustments are never applied twice", async () => {
  const target = ATT[3];
  const category = categoryFor("A");
  const scoreAtStart = (await attemptScore(target)).score;

  // Raw criterion A score from the answers is 5 (qA awarded 5 of 10).
  const baseline = scoreAdj.computeCategoryScoreForAttempt(
    category,
    PAPER,
    await attemptInput(target, "Student Four"),
    [],
  );
  assert.equal(baseline, 5, "raw criterion A score is 5 before any adjustment");

  let effective = baseline;
  for (let i = 0; i < 3; i += 1) {
    await adjust({
      attemptIds: [target],
      categoryKey: "A",
      points: 1,
      reason: `Synthetic no-double-apply check #${i + 1}`,
    });
    effective += 1;
    const recomputed = scoreAdj.computeCategoryScoreForAttempt(
      category,
      PAPER,
      await attemptInput(target, "Student Four"),
      await priorAdjustmentsFor(),
    );
    assert.equal(
      recomputed,
      effective,
      `after ${i + 1} adjustment(s) the effective criterion A score is exactly ${effective}`,
    );
  }
  // Earlier suites also adjusted this student on other criteria, so compare
  // against the score captured at the start of this check.
  const score = await attemptScore(target);
  assert.equal(
    score.score,
    scoreAtStart + 3,
    `three 1-point criterion A adjustments add exactly 3 (${scoreAtStart} -> ${scoreAtStart + 3})`,
  );
});

// ═══ 15. Score boundaries ════════════════════════════════════════════════════
await checkAsync("15. Criterion and examination maximums are enforced on every repeat", async () => {
  const target = ATT[2]; // 30/40, criterion C raw = 5 of 10
  const category = categoryFor("C");

  // Walk criterion C up to its own maximum with repeated adjustments.
  let guard = 0;
  while (guard++ < 20) {
    const priorAdjustments = await priorAdjustmentsFor();
    const preview = scoreAdj.buildScoreAdjustmentPreview({
      category,
      pointsRequested: 2,
      scope: "selected",
      selectedAttemptIds: [target],
      paper: PAPER,
      attempts: [await attemptInput(target, "Student Three")],
      priorAdjustments,
    });
    if (!preview.canConfirm) break;
    const row = preview.rows[0];
    assert.ok(
      row.adjustedCategoryScore <= category.maxScore + 1e-9,
      `criterion score never exceeds ${category.maxScore}`,
    );
    assert.ok(
      row.adjustedExamScore <= row.examMaxScore + 1e-9,
      `exam score never exceeds ${row.examMaxScore}`,
    );
    const { error } = await adjust({
      attemptIds: [target],
      categoryKey: "C",
      points: 2,
      reason: "Synthetic boundary walk",
    });
    assert.equal(error, null, `boundary walk must be accepted: ${error}`);
  }

  const history = await ledgerFor(target, "C");
  const last = history[history.length - 1];
  assert.ok(history.length >= 2, "several repeats were accepted before the cap bound");
  assert.ok(
    last.adj_cat <= category.maxScore + 1e-9,
    `criterion C never exceeds its maximum of ${category.maxScore}`,
  );
  assert.ok(last.adj_exam <= EXAM_MAX + 1e-9, "the examination total never exceeds its maximum");
  assert.ok(
    Math.abs(last.adj_cat - category.maxScore) < 1e-9 ||
      Math.abs(last.adj_exam - EXAM_MAX) < 1e-9,
    `the walk stops only when a real maximum binds (criterion ${last.adj_cat}/${category.maxScore}, exam ${last.adj_exam}/${EXAM_MAX})`,
  );

  // One more attempt must be refused as "already at maximum", not as a duplicate.
  const atMax = await adjust({
    attemptIds: [target],
    categoryKey: "C",
    points: 1,
    reason: "Synthetic attempt beyond the maximum",
  });
  assert.equal(atMax.outcome, null, "nothing is applied once the maximum is reached");
  assert.equal(atMax.preview.rows[0].status, "already_at_maximum");
  assert.equal(atMax.preview.canConfirm, false);
  const afterMax = await attemptScore(target);
  assert.ok(afterMax.score <= EXAM_MAX, "the stored score never exceeds the exam maximum");
  assert.equal(
    afterMax.score,
    last.adj_exam,
    "the persisted attempt score equals the last ledger entry's adjusted score",
  );
});

// ═══ 16. Permissions ═════════════════════════════════════════════════════════
await checkAsync("16. Authorized roles can adjust; read-only and learner roles cannot", async () => {
  // A dedicated untouched attempt, so no earlier suite's capping interferes.
  const target = ATT_PERM;

  for (const [label, actor, email, role] of [
    ["Super Admin", U_SUPER, "super@synthetic.test", "super_admin"],
    ["Organization Owner", U_OWNER, "owner@synthetic.test", "owner"],
    ["Organization Admin", U_ADMIN, "admin@synthetic.test", "admin"],
    ["Teacher", U_TEACHER, "teacher@synthetic.test", "teacher"],
  ]) {
    const { outcome, error } = await adjust({
      attemptIds: [target],
      categoryKey: "C",
      points: 1,
      reason: `Synthetic permission check — ${label}`,
      actor,
      email,
      role,
    });
    assert.equal(error, null, `${label} must be able to adjust: ${error}`);
    assert.equal(outcome.students_affected, 1, `${label} adjustment must persist`);
  }
  assert.deepEqual(
    (await ledgerFor(target, "C")).map((h) => h.seq),
    [1, 2, 3, 4],
    "each authorized role appends its own entry to the same history",
  );

  // School Founder is read-only.
  const founderItem = await rawItem(target, "C", 1);
  await assert.rejects(
    () =>
      callRpcRaw(EXAM, "C", "Synthetic founder attempt", nextKey(), U_FOUNDER, "founder@synthetic.test", "school_founder", [
        founderItem,
      ]),
    /unauthorized/i,
    "School Founder must never write an adjustment",
  );

  // A student is never a grading actor.
  const studentItem = await rawItem(target, "C", 1);
  await assert.rejects(
    () =>
      callRpcRaw(EXAM, "C", "Synthetic student attempt", nextKey(), U_STUDENT, "student@synthetic.test", "student", [
        studentItem,
      ]),
    /unauthorized/i,
    "a student must never write an adjustment",
  );

  // A teacher from another organization has no access to this exam.
  const otherItem = await rawItem(target, "C", 1);
  await assert.rejects(
    () =>
      callRpcRaw(EXAM, "C", "Synthetic cross-tenant attempt", nextKey(), U_TEACHER_OTHER, "teacher@other.test", "teacher", [
        otherItem,
      ]),
    /unauthorized/i,
    "a teacher from another organization must never write an adjustment",
  );

  // Adjustments stay exclusive to an active Institution plan.
  const freeItem = await rawItem(ATT_FREE, "C", 1);
  await assert.rejects(
    () =>
      callRpcRaw(EXAM_FREE, "C", "Synthetic free-plan attempt", nextKey(), U_TEACHER_FREE, "teacher@free.test", "teacher", [
        freeItem,
      ]),
    /plan_ineligible/i,
    "a Free-plan organization must not be able to adjust scores",
  );

  // Super Admin privileges cannot be claimed from the workspace console.
  const fakeSuperItem = await rawItem(target, "C", 1);
  await assert.rejects(
    () =>
      db.query(
        `select public.apply_exam_score_adjustment(
           $1::uuid, 'myp_criterion', 'C', 'Criterion C', 1::numeric, 'selected',
           'Synthetic fake super admin', $2, $3::uuid, 'teacher@synthetic.test',
           'teacher', 'super_admin', $4::jsonb
         )`,
        [EXAM, nextKey(), U_TEACHER, JSON.stringify([fakeSuperItem])],
      ),
    /unauthorized/i,
    "the super-admin console requires an actual Super Admin",
  );
});

// ═══ 17. Genuine duplicate protection survives the fix ═══════════════════════
await checkAsync("17. Real duplicate protection is intact", async () => {
  const target = ATT[0];

  // (a) The same attempt twice inside one batch is still refused.
  const dupItem = await rawItem(target, "C", 1);
  await assert.rejects(
    () =>
      callRpcRaw(EXAM, "C", "Synthetic same-batch duplicate", nextKey(), U_TEACHER, "teacher@synthetic.test", "teacher", [
        dupItem,
        dupItem,
      ]),
    /duplicate_attempt_in_batch/,
    "one batch must not touch the same student and criterion twice",
  );

  // (b) A replayed idempotency key is still refused.
  const replayKey = nextKey();
  const firstCall = await adjust({
    attemptIds: [ATT[3]],
    categoryKey: "D",
    points: 1,
    reason: "Synthetic idempotency source",
    key: replayKey,
  });
  assert.equal(firstCall.error, null, `the source adjustment must succeed: ${firstCall.error}`);
  await assert.rejects(
    () =>
      adjust({
        attemptIds: [ATT[3]],
        categoryKey: "D",
        points: 1,
        reason: "Synthetic idempotency replay",
        key: replayKey,
      }),
    /duplicate_submission/,
    "replaying the same confirmation token must not create a second adjustment",
  );

  // (c) History cannot be rewritten or deleted.
  await assert.rejects(
    () =>
      db.query(
        `update public.exam_score_adjustment_items set points_applied = 99 where attempt_id = '${target}'`,
      ),
    /immutable/i,
    "ledger entries must never be updated",
  );
  await assert.rejects(
    () => db.query(`delete from public.exam_score_adjustment_items where attempt_id = '${target}'`),
    /immutable/i,
    "ledger entries must never be deleted",
  );

  // (d) Two entries can never claim the same sequence number.
  await assert.rejects(
    () =>
      db.query(
        `insert into public.exam_score_adjustment_items
           (adjustment_id, organization_id, exam_id, attempt_id, candidate_name,
            category_type, category_key, sequence_no, category_max_score,
            original_category_score, adjusted_category_score, exam_max_score,
            original_exam_score, adjusted_exam_score, points_requested, points_applied)
         select adjustment_id, organization_id, exam_id, attempt_id, candidate_name,
                category_type, category_key, sequence_no, category_max_score,
                original_category_score, adjusted_category_score, exam_max_score,
                original_exam_score, adjusted_exam_score, points_requested, points_applied
           from public.exam_score_adjustment_items
          where attempt_id = '${target}' and category_key = 'C' and sequence_no = 1`,
      ),
    /uq_exam_score_adj_items_attempt_category_seq|duplicate key/i,
    "a sequence number can never be reused within one history",
  );

  // (e) A stale preview is still rejected, so a repeat can never be computed
  //     from a score that has since moved.
  const staleItem = { ...(await rawItem(target, "C", 1)), original_exam_score: 1, adjusted_exam_score: 2 };
  await assert.rejects(
    () =>
      callRpcRaw(EXAM, "C", "Synthetic stale preview", nextKey(), U_TEACHER, "teacher@synthetic.test", "teacher", [
        staleItem,
      ]),
    /score_changed_since_preview/,
    "a repeat adjustment must be computed from the current score",
  );
});

// ═══ 18. Learners and other tenants cannot read the ledger ═══════════════════
await checkAsync("18. Ledger stays invisible to learners and other organizations", async () => {
  const countAs = async (userId, table) => {
    await db.exec("BEGIN");
    await db.exec("SET LOCAL ROLE authenticated");
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', true)`);
    const res = await db.query(`SELECT count(*)::int AS c FROM public.${table}`);
    await db.exec("ROLLBACK");
    return res.rows[0].c;
  };

  assert.equal(await countAs(U_STUDENT, "exam_score_adjustment_items"), 0, "student sees no ledger rows");
  assert.equal(await countAs(U_STUDENT, "exam_score_adjustments"), 0, "student sees no adjustment batches");
  assert.equal(await countAs(U_TEACHER_OTHER, "exam_score_adjustment_items"), 0, "another org's teacher sees nothing");
  assert.ok(
    (await countAs(U_TEACHER, "exam_score_adjustment_items")) > 0,
    "the org's own teacher can audit the full history",
  );
  assert.ok(
    (await countAs(U_FOUNDER, "exam_score_adjustment_items")) > 0,
    "the School Founder retains read-only audit access",
  );

  await db.exec("BEGIN");
  await db.exec("SET LOCAL ROLE authenticated");
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${U_TEACHER}', true)`);
  await assert.rejects(
    () =>
      db.query(
        `insert into public.exam_score_adjustments
           (organization_id, exam_id, category_type, category_key, category_label,
            points_requested, scope, reason, idempotency_key, actor_role,
            students_affected_count, total_points_added)
         values ('${ORG}', '${EXAM}', 'overall', 'OVERALL', 'Overall', 1,
                 'all_eligible', 'bypass', 'bypass-key-01', 'teacher', 1, 1)`,
      ),
    /permission denied/i,
    "the browser can never write to the ledger directly",
  );
  await db.exec("ROLLBACK");
});

// ═══ 19. The shipped constraint shape is the corrected one ═══════════════════
await checkAsync("19. Schema no longer carries the one-adjustment-ever constraint", async () => {
  const constraints = await db.query(
    `select conname from pg_constraint
      where conrelid = 'public.exam_score_adjustment_items'::regclass
        and contype = 'u'
      order by conname`,
  );
  const names = constraints.rows.map((r) => r.conname);
  assert.ok(
    !names.includes("uq_exam_score_adj_items_attempt_category"),
    "the one-adjustment-per-(student, criterion) constraint must be gone",
  );
  assert.ok(
    names.includes("uq_exam_score_adj_items_attempt_category_seq"),
    "history uniqueness is per sequence number",
  );
  assert.ok(
    names.includes("uq_exam_score_adj_items_batch_attempt"),
    "a single batch still cannot touch one student twice",
  );

  const rpcSource = await db.query(
    `select pg_get_functiondef('public.apply_exam_score_adjustment(uuid,text,text,text,numeric,text,text,text,uuid,text,text,text,jsonb)'::regprocedure) as def`,
  );
  assert.ok(
    !/duplicate_adjustment/.test(rpcSource.rows[0].def),
    "the RPC must no longer raise duplicate_adjustment",
  );
  assert.ok(
    /coalesce\(max\(i\.sequence_no\), 0\) \+ 1/.test(rpcSource.rows[0].def),
    "the RPC derives the next sequence number",
  );

  const migrationSource = readFileSync(
    resolve(ROOT, "supabase/migrations/20261127150000_repeated_score_adjustments.sql"),
    "utf8",
  )
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();
  for (const forbidden of ["drop table", "truncate", "delete from public.exams", "delete from public.exam_attempts", "delete from public.exam_answers"]) {
    assert.ok(
      !migrationSource.includes(forbidden),
      `the migration must never contain "${forbidden}"`,
    );
  }
});

console.log(`PASS test-repeated-score-adjustments (${passed} checks)`);
