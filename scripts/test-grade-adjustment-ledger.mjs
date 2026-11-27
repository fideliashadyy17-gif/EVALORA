/**
 * Unlimited Individual Grade Adjustments, publication, candidate privacy and
 * regression of the existing grading workflow — verification suite.
 *
 * Covers:
 *  1. Unlimited repeated adjustments: many entries per student, per criterion,
 *     positive and negative, with a complete ordered history
 *  2. Multiple criterion adjustments (A, B, C, D) on the same student
 *  3. Class-wide score entry where each student's score stays independent
 *  4. Individual assessments never touching another student's row
 *  5. Publication states and candidate privacy at the SQL level (a candidate or
 *     another tenant's teacher can never read the data)
 *  6. Director / Founder read-only restriction (SELECT yes, INSERT no)
 *  7. REGRESSION: the pre-existing `exam_score_adjustments` ledger and its
 *     one-adjustment-per-(attempt, category) ceiling still behave exactly as
 *     before — the new unlimited layer is additive, not a replacement
 *  8. Examination protection: papers, attempts, answers and original marks are
 *     untouched by anything in this feature
 *
 * Run standalone: `node scripts/test-grade-adjustment-ledger.mjs`
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

const outDir = "/tmp/evalora-grade-adjustment-ledger-test";
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

buildTs("src/lib/gradeAdjustmentLedger.ts");
buildTs("src/lib/assessmentContributions.ts");

const require = createRequire(import.meta.url);
const ledger = require(`${outDir}/lib/gradeAdjustmentLedger.js`);

const NEW_MIGRATION =
  "supabase/migrations/20261127120000_assessment_contributions_and_grade_consolidation.sql";
const EXISTING_MIGRATION = "supabase/migrations/20261125230000_score_adjustments.sql";

const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "10000000-0000-4000-8000-000000000002";
const USER_ADMIN = "30000000-0000-4000-8000-000000000001";
const USER_TEACHER = "30000000-0000-4000-8000-000000000002";
const USER_TEACHER_B = "30000000-0000-4000-8000-000000000003";
const USER_DIRECTOR = "30000000-0000-4000-8000-000000000004";
const USER_STUDENT = "30000000-0000-4000-8000-000000000005";
const SUBJECT = "60000000-0000-4000-8000-000000000001";
const CLASS = "61000000-0000-4000-8000-000000000001";
const EXAM = "40000000-0000-4000-8000-000000000001";
const CANDIDATE_1 = "41000000-0000-4000-8000-000000000001";
const CANDIDATE_2 = "41000000-0000-4000-8000-000000000002";
const STUDENT_1 = "62000000-0000-4000-8000-000000000001";
const STUDENT_2 = "62000000-0000-4000-8000-000000000002";
const STUDENT_3 = "62000000-0000-4000-8000-000000000003";
const ATTEMPT_1 = "50000000-0000-4000-8000-000000000001";
const ATTEMPT_2 = "50000000-0000-4000-8000-000000000002";

let db;

async function bootstrap() {
  db = new PGlite();
  await db.exec(readFileSync(resolve(ROOT, "scripts/fixtures/assessment-bootstrap.sql"), "utf8"));
  // The EXISTING score-adjustment migration first, then the new additive one,
  // exactly the order they run in production.
  await db.exec(readFileSync(resolve(ROOT, EXISTING_MIGRATION), "utf8"));
  await db.exec(readFileSync(resolve(ROOT, NEW_MIGRATION), "utf8"));

  await db.exec(`
    INSERT INTO public.organizations (id, name) VALUES ('${ORG_A}', 'Synthetic Academy'), ('${ORG_B}', 'Other Academy');
    INSERT INTO public.profiles (id, email, platform_role, status) VALUES
      ('${USER_ADMIN}', 'admin@synthetic.test', 'user', 'active'),
      ('${USER_TEACHER}', 'teacher@synthetic.test', 'user', 'active'),
      ('${USER_TEACHER_B}', 'teacher@other.test', 'user', 'active'),
      ('${USER_DIRECTOR}', 'director@synthetic.test', 'user', 'active'),
      ('${USER_STUDENT}', 'student@synthetic.test', 'user', 'active');
    INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
      ('${ORG_A}', '${USER_ADMIN}', 'admin'),
      ('${ORG_A}', '${USER_TEACHER}', 'teacher'),
      ('${ORG_B}', '${USER_TEACHER_B}', 'teacher'),
      ('${ORG_A}', '${USER_DIRECTOR}', 'school_founder'),
      ('${ORG_A}', '${USER_STUDENT}', 'student');
    INSERT INTO public.subjects (id, organization_id, name) VALUES ('${SUBJECT}', '${ORG_A}', 'Mathematics');
    INSERT INTO public.classes (id, organization_id, name) VALUES ('${CLASS}', '${ORG_A}', 'MYP4-A');
    INSERT INTO public.students (id, organization_id, full_name) VALUES
      ('${STUDENT_1}', '${ORG_A}', 'Amina'),
      ('${STUDENT_2}', '${ORG_A}', 'Kofi'),
      ('${STUDENT_3}', '${ORG_A}', 'Zainab');
    INSERT INTO public.exams (id, organization_id, title, status) VALUES ('${EXAM}', '${ORG_A}', 'First Term Summative', 'closed');
    INSERT INTO public.exam_candidates (id, exam_id, full_name) VALUES
      ('${CANDIDATE_1}', '${EXAM}', 'Amina'), ('${CANDIDATE_2}', '${EXAM}', 'Kofi');
    INSERT INTO public.exam_attempts (id, exam_id, candidate_id, student_id, status, score, max_score) VALUES
      ('${ATTEMPT_1}', '${EXAM}', '${CANDIDATE_1}', '${STUDENT_1}', 'submitted', 40, 50),
      ('${ATTEMPT_2}', '${EXAM}', '${CANDIDATE_2}', '${STUDENT_2}', 'submitted', 25, 50);
    INSERT INTO public.exam_answers (attempt_id, question_id, points_awarded)
      VALUES ('${ATTEMPT_1}', gen_random_uuid(), 40);
  `);
}

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

await checkAsync("unlimited repeated adjustments across every criterion, with history", async () => {
  await bootstrap();

  // 12 entries on one student: three per criterion A–D, mixing directions.
  let expectedValue = { A: 10, B: 6, C: 8, D: 5 };
  for (const code of ["A", "B", "C", "D"]) {
    for (let index = 0; index < 3; index += 1) {
      const decrease = index === 2;
      const delta = decrease ? 0.5 : 1;
      const previous = expectedValue[code];
      const next = decrease ? previous - delta : previous + delta;
      await db.query(
        `INSERT INTO public.exam_grade_adjustment_entries
           (organization_id, exam_id, attempt_id, candidate_id, student_id, candidate_name,
            category_type, category_key, category_label, category_max_score, direction,
            points_delta, previous_value, new_value, baseline_exam_score, effective_exam_score,
            exam_max_score, reason_code, reason, teacher_comment, actor_id, actor_email, actor_role)
         VALUES ($1,$2,$3,$4,$5,'Amina','myp_criterion',$6,$7,15,$8,$9,$10,$11,40,40,50,$12,$13,$14,$15,'teacher@synthetic.test','teacher')`,
        [
          ORG_A, EXAM, ATTEMPT_1, CANDIDATE_1, STUDENT_1,
          code, `Criterion ${code}`,
          decrease ? "decrease" : "increase",
          delta, previous, next,
          ["homework", "class_test", "grading_correction"][index],
          `${code}: entry ${index + 1}`,
          index === 1 ? "Reviewed with the department" : null,
          USER_TEACHER,
        ],
      );
      expectedValue[code] = next;
    }
  }

  const { rows } = await db.query(
    `SELECT category_key, count(*)::int AS entries, max(sequence_no)::int AS last,
            sum(case when direction = 'decrease' then -points_delta else points_delta end)::float8 AS net
       FROM public.exam_grade_adjustment_entries
      WHERE attempt_id = $1
      GROUP BY category_key ORDER BY category_key`,
    [ATTEMPT_1],
  );
  assert.equal(rows.length, 4, "all four criteria received adjustments");
  for (const row of rows) {
    assert.equal(row.entries, 3, `criterion ${row.category_key} holds three entries`);
    assert.equal(row.last, 3, "sequence numbers count each entry");
    assert.equal(row.net, 1.5, `criterion ${row.category_key} nets +1.5`);
  }

  // A thirteenth entry on a criterion that already has three: still accepted.
  await db.query(
    `INSERT INTO public.exam_grade_adjustment_entries
       (organization_id, exam_id, attempt_id, candidate_name, category_type, category_key,
        category_label, category_max_score, direction, points_delta, previous_value, new_value,
        baseline_exam_score, effective_exam_score, exam_max_score, reason_code, reason, actor_role)
     VALUES ($1,$2,$3,'Amina','myp_criterion','A','Criterion A',15,'increase',0.25,$4,$5,40,40,50,
             'oral_assessment','Oral follow-up question answered',$6)`,
    [ORG_A, EXAM, ATTEMPT_1, expectedValue.A, expectedValue.A + 0.25, USER_ADMIN],
  );
  const { rows: after } = await db.query(
    `SELECT count(*)::int AS total FROM public.exam_grade_adjustment_entries WHERE attempt_id = $1`,
    [ATTEMPT_1],
  );
  assert.equal(after[0].total, 13, "thirteen adjustments on one student, none rejected");

  // History reconstruction from the ledger itself.
  const { rows: historyRows } = await db.query(
    `SELECT id, attempt_id, student_id, candidate_id, candidate_name, category_type, category_key,
            category_label, category_max_score::float8 AS category_max_score, direction,
            points_delta::float8 AS points_delta, previous_value::float8 AS previous_value,
            new_value::float8 AS new_value, baseline_exam_score::float8 AS baseline_exam_score,
            effective_exam_score::float8 AS effective_exam_score, exam_max_score::float8 AS exam_max_score,
            reason_code, reason, teacher_comment, capped, cap_reason, sequence_no,
            actor_id, actor_email, actor_role, actor_console, created_at
       FROM public.exam_grade_adjustment_entries
      WHERE attempt_id = $1 AND category_key = 'A' ORDER BY sequence_no`,
    [ATTEMPT_1],
  );
  const mapEntry = (row) => ({
    id: row.id,
    attemptId: row.attempt_id,
    studentId: row.student_id,
    candidateId: row.candidate_id,
    candidateName: row.candidate_name,
    categoryType: row.category_type,
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    categoryMaxScore: row.category_max_score,
    direction: row.direction,
    pointsDelta: row.points_delta,
    previousValue: row.previous_value,
    newValue: row.new_value,
    baselineExamScore: row.baseline_exam_score,
    effectiveExamScore: row.effective_exam_score,
    examMaxScore: row.exam_max_score,
    reasonCode: row.reason_code,
    reason: row.reason,
    teacherComment: row.teacher_comment,
    capped: row.capped,
    capReason: row.cap_reason,
    sequenceNo: row.sequence_no,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    actorConsole: row.actor_console,
    createdAt: row.created_at,
  });
  const groups = ledger.groupLedgerHistory(historyRows.map(mapEntry));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entryCount, 4, "the history keeps every entry, not just the latest");
  assert.equal(groups[0].netDelta, 1.75, "10 -> 11 -> 12 -> 11.5 -> 11.75 nets +1.75");
  assert.equal(groups[0].currentValue, 11.75);
  assert.equal(groups[0].entries[0].sequenceNo, 1);
  assert.equal(groups[0].entries[3].reasonCode, "oral_assessment");
  assert.equal(groups[0].entries[1].teacherComment, "Reviewed with the department");
  // Every entry preserves the value it started from: nothing was overwritten.
  for (let index = 1; index < groups[0].entries.length; index += 1) {
    assert.equal(
      groups[0].entries[index].previousValue,
      groups[0].entries[index - 1].newValue,
      "each entry starts exactly where the previous one ended",
    );
  }
});

await checkAsync("class-wide score entry keeps every student's score independent", async () => {
  const { rows: created } = await db.query(
    `INSERT INTO public.assessment_contributions
       (organization_id, title, category_key, category_label, assessed_on, max_score, class_id, subject_id, scope)
     VALUES ($1, 'Class test 3', 'class_test', 'Class Test', '2026-01-20', 30, $2, $3, 'class')
     RETURNING id`,
    [ORG_A, CLASS, SUBJECT],
  );
  const contributionId = created[0].id;

  // Bulk (class-wide) entry.
  for (const [studentId, name, score] of [
    [STUDENT_1, "Amina", 27],
    [STUDENT_2, "Kofi", 18],
    [STUDENT_3, "Zainab", 30],
  ]) {
    await db.query(
      `INSERT INTO public.assessment_contribution_scores
         (contribution_id, organization_id, student_id, student_name, score, max_score)
       VALUES ($1, $2, $3, $4, $5, 30)`,
      [contributionId, ORG_A, studentId, name, score],
    );
  }

  // Individual re-entry for ONE student.
  await db.query(
    `UPDATE public.assessment_contribution_scores SET score = 20, comment = 'Re-marked question 4'
      WHERE contribution_id = $1 AND student_id = $2`,
    [contributionId, STUDENT_2],
  );

  const { rows: scores } = await db.query(
    `SELECT student_name, score::float8 AS score, comment FROM public.assessment_contribution_scores
      WHERE contribution_id = $1 ORDER BY student_name`,
    [contributionId],
  );
  assert.deepEqual(
    scores.map((row) => [row.student_name, row.score]),
    [["Amina", 27], ["Kofi", 20], ["Zainab", 30]],
    "re-entering one student's score never changes another student's",
  );
  assert.equal(scores.find((row) => row.student_name === "Kofi").comment, "Re-marked question 4");

  // One score per student per assessment.
  await assert.rejects(
    db.query(
      `INSERT INTO public.assessment_contribution_scores
         (contribution_id, organization_id, student_id, student_name, score, max_score)
       VALUES ($1, $2, $3, 'Amina', 25, 30)`,
      [contributionId, ORG_A, STUDENT_1],
    ),
    /uq_assessment_score_student|duplicate key/i,
    "a bulk save can never duplicate a student",
  );

  // An individual assessment for a single student leaves the class rows alone.
  const { rows: individual } = await db.query(
    `INSERT INTO public.assessment_contributions
       (organization_id, title, category_key, category_label, assessed_on, max_score, class_id, scope, source)
     VALUES ($1, 'Oral re-assessment — Amina', 'oral', 'Oral Assessment', '2026-01-22', 10, $2, 'individual', 'individual')
     RETURNING id`,
    [ORG_A, CLASS],
  );
  await db.query(
    `INSERT INTO public.assessment_contribution_scores
       (contribution_id, organization_id, student_id, student_name, score, max_score, comment)
     VALUES ($1, $2, $3, 'Amina', 9, 10, 'Strong oral defence')`,
    [individual[0].id, ORG_A, STUDENT_1],
  );
  const { rows: counts } = await db.query(
    `SELECT count(*)::int AS n FROM public.assessment_contribution_scores WHERE contribution_id = $1`,
    [individual[0].id],
  );
  assert.equal(counts[0].n, 1, "an individual assessment records exactly one student");
});

await checkAsync("publication states gate candidate visibility; other tenants see nothing", async () => {
  const { rows: created } = await db.query(
    `INSERT INTO public.assessment_contributions
       (organization_id, title, category_key, category_label, assessed_on, max_score, class_id, exam_id,
        scope, contributes_to_result, contribution_method, contribution_weight)
     VALUES ($1, 'Homework series', 'homework', 'Homework', '2026-01-08', 20, $2, $3, 'class',
             true, 'weighted', 10)
     RETURNING id`,
    [ORG_A, CLASS, EXAM],
  );
  const contributionId = created[0].id;
  await db.query(
    `INSERT INTO public.assessment_contribution_scores
       (contribution_id, organization_id, student_id, student_name, score, max_score)
     VALUES ($1, $2, $3, 'Amina', 17, 20)`,
    [contributionId, ORG_A, STUDENT_1],
  );

  const { rows: profileRows } = await db.query(
    `INSERT INTO public.grade_consolidation_profiles
       (organization_id, exam_id, name, method, exam_weight, scope)
     VALUES ($1, $2, 'First term', 'weighted', 80, 'class') RETURNING id`,
    [ORG_A, EXAM],
  );
  const profileId = profileRows[0].id;
  await db.query(
    `INSERT INTO public.grade_consolidation_inclusions
       (profile_id, organization_id, contribution_id, included, weight, point_value)
     VALUES ($1, $2, $3, true, 20, 5)`,
    [profileId, ORG_A, contributionId],
  );

  // Draft snapshot, then publication — the two states a candidate gate depends on.
  await db.query(
    `INSERT INTO public.grade_consolidation_results
       (profile_id, organization_id, exam_id, attempt_id, student_id, candidate_name,
        original_exam_score, exam_max_score, adjustment_total, contribution_total,
        consolidated_score, consolidated_max, breakdown, status)
     VALUES ($1,$2,$3,$4,$5,'Amina',40,50,0,1.7,41.7,50,
             '{"method":"weighted","contributions":[{"id":"x","title":"Homework series","categoryLabel":"Homework","score":17,"maxScore":20,"points":1.7,"included":true}],"criteria":[]}'::jsonb,
             'draft')`,
    [profileId, ORG_A, EXAM, ATTEMPT_1, STUDENT_1],
  );

  const loaderQuery = `
    SELECT count(*)::int AS n FROM public.grade_consolidation_results r
     WHERE r.attempt_id = $1 AND r.status = 'published'`;
  const draftState = await asUser(USER_STUDENT, () => db.query(loaderQuery, [ATTEMPT_1]));
  assert.equal(draftState.rows[0].n, 0, "a draft consolidation is invisible to everybody through the policy");

  // Even as staff, the loader's own filter keeps drafts out of the candidate path.
  const staffDraft = await db.query(loaderQuery, [ATTEMPT_1]);
  assert.equal(staffDraft.rows[0].n, 0, "the candidate loader only ever selects published rows");

  await db.query(`UPDATE public.grade_consolidation_results SET status = 'published' WHERE profile_id = $1`, [
    profileId,
  ]);
  await db.query(`UPDATE public.grade_consolidation_profiles SET status = 'published' WHERE id = $1`, [profileId]);

  const publishedStaff = await db.query(loaderQuery, [ATTEMPT_1]);
  assert.equal(publishedStaff.rows[0].n, 1, "once published, the consolidated result is readable");

  const publishedCandidate = await asUser(USER_STUDENT, () => db.query(loaderQuery, [ATTEMPT_1]));
  assert.equal(
    publishedCandidate.rows[0].n,
    0,
    "RLS still blocks the learner even after publication — the candidate path is server-side only",
  );

  const otherTenant = await asUser(USER_TEACHER_B, () =>
    db.query("SELECT count(*)::int AS n FROM public.grade_consolidation_results"),
  );
  assert.equal(otherTenant.rows[0].n, 0, "another organization's staff see no consolidation data");

  // The other student's attempt has no result row at all: no cross-student leakage.
  const otherAttempt = await db.query(loaderQuery, [ATTEMPT_2]);
  assert.equal(otherAttempt.rows[0].n, 0, "a student with no consolidated result sees nothing fabricated");
});

await checkAsync("the director / founder role stays read-only at the database level", async () => {
  const readAsDirector = await asUser(USER_DIRECTOR, async () => {
    const contributions = await db.query("SELECT count(*)::int AS n FROM public.assessment_contributions");
    const ledgerRows = await db.query("SELECT count(*)::int AS n FROM public.exam_grade_adjustment_entries");
    const results = await db.query("SELECT count(*)::int AS n FROM public.grade_consolidation_results");
    return {
      contributions: contributions.rows[0].n,
      ledger: ledgerRows.rows[0].n,
      results: results.rows[0].n,
    };
  });
  assert.ok(readAsDirector.contributions >= 1, "the director can review assessments");
  assert.ok(readAsDirector.results >= 1, "the director can review consolidated results");

  await assert.rejects(
    asUser(USER_DIRECTOR, () =>
      db.query(
        `INSERT INTO public.exam_grade_adjustment_entries
           (organization_id, exam_id, attempt_id, candidate_name, category_type, category_key,
            category_label, category_max_score, direction, points_delta, previous_value, new_value,
            baseline_exam_score, effective_exam_score, exam_max_score, reason_code, reason, actor_role)
         VALUES ($1,$2,$3,'Amina','overall','overall','Overall',50,'increase',1,40,41,40,41,50,
                 'teacher_review','Director attempt','school_founder')`,
        [ORG_A, EXAM, ATTEMPT_1],
      ),
    ),
    /permission denied/i,
    "the director cannot record an adjustment",
  );

  await assert.rejects(
    asUser(USER_DIRECTOR, () =>
      db.query(`UPDATE public.grade_consolidation_profiles SET status = 'published'`),
    ),
    /permission denied/i,
    "the director cannot publish a consolidation",
  );

  const source = readFileSync(resolve(ROOT, "src/lib/assessmentContributionsServer.ts"), "utf8");
  assert.ok(
    source.includes("Institutional supervision accounts are read-only"),
    "the application layer states the read-only rule explicitly",
  );
  assert.ok(
    /READ_ONLY_ROLES\.has\(role\)[\s\S]{0,400}action !== "view"/.test(source),
    "every write action is refused for the read-only role",
  );
});

await checkAsync("REGRESSION: the existing batch score-adjustment ledger is unchanged", async () => {
  // The original ceiling is still there: one adjustment per (attempt, category).
  await db.query(
    `INSERT INTO public.exam_score_adjustments
       (organization_id, exam_id, category_type, category_key, category_label, points_requested,
        scope, reason, idempotency_key, actor_id, actor_role, students_affected_count, total_points_added)
     VALUES ($1, $2, 'myp_criterion', 'A', 'Criterion A', 2, 'selected', 'Homework bonus',
             'idem-0001-aaaa', $3, 'teacher', 1, 2)
     RETURNING id`,
    [ORG_A, EXAM, USER_TEACHER],
  );
  const { rows: batch } = await db.query(
    `SELECT id FROM public.exam_score_adjustments WHERE exam_id = $1`,
    [EXAM],
  );
  await db.query(
    `INSERT INTO public.exam_score_adjustment_items
       (adjustment_id, organization_id, exam_id, attempt_id, candidate_id, student_id, candidate_name,
        category_type, category_key, category_max_score, original_category_score, adjusted_category_score,
        exam_max_score, original_exam_score, adjusted_exam_score, points_requested, points_applied)
     VALUES ($1,$2,$3,$4,$5,$6,'Amina','myp_criterion','A',15,10,12,50,40,42,2,2)`,
    [batch[0].id, ORG_A, EXAM, ATTEMPT_1, CANDIDATE_1, STUDENT_1],
  );

  await assert.rejects(
    db.query(
      `INSERT INTO public.exam_score_adjustment_items
         (adjustment_id, organization_id, exam_id, attempt_id, candidate_id, student_id, candidate_name,
          category_type, category_key, category_max_score, original_category_score, adjusted_category_score,
          exam_max_score, original_exam_score, adjusted_exam_score, points_requested, points_applied)
       VALUES ($1,$2,$3,$4,$5,$6,'Amina','myp_criterion','A',15,12,14,50,42,44,2,2)`,
      [batch[0].id, ORG_A, EXAM, ATTEMPT_1, CANDIDATE_1, STUDENT_1],
    ),
    /uq_exam_score_adj_items_attempt_category|duplicate key/i,
    "the Institution batch ledger still refuses a second adjustment for the same criterion",
  );

  await assert.rejects(
    db.query(`UPDATE public.exam_score_adjustment_items SET points_applied = 5`),
    /immutable/i,
    "the Institution batch ledger is still append-only",
  );

  // ... while the NEW unlimited ledger accepted thirteen entries for the same
  // student and criterion on the same examination.
  const { rows: unlimited } = await db.query(
    `SELECT count(*)::int AS n FROM public.exam_grade_adjustment_entries
      WHERE attempt_id = $1 AND category_key = 'A'`,
    [ATTEMPT_1],
  );
  assert.equal(unlimited[0].n, 4, "the unlimited ledger coexists with the batch ledger");

  // The original examination score is still exactly as marked.
  const { rows: attemptRow } = await db.query(
    `SELECT score::float8 AS score, max_score::float8 AS max_score, status FROM public.exam_attempts WHERE id = $1`,
    [ATTEMPT_1],
  );
  assert.equal(attemptRow[0].score, 40);
  assert.equal(attemptRow[0].max_score, 50);
  assert.equal(attemptRow[0].status, "submitted");

  const { rows: answers } = await db.query(
    `SELECT count(*)::int AS n FROM public.exam_answers WHERE attempt_id = $1`,
    [ATTEMPT_1],
  );
  assert.equal(answers[0].n, 1, "candidate answers are untouched by the new layer");

  await db.close();
});

check("the effective score is derived, never written back over the original", () => {
  // The ledger engine recomputes from the preserved baseline every time.
  const baseline = 40;
  const entries = [
    { categoryType: "overall", direction: "increase", pointsDelta: 3 },
    { categoryType: "overall", direction: "decrease", pointsDelta: 1 },
    { categoryType: "overall", direction: "increase", pointsDelta: 0.5 },
  ];
  assert.equal(ledger.foldLedgerEntries(baseline, 50, entries), 42.5);
  assert.equal(
    ledger.foldLedgerEntries(baseline, 50, [...entries, { categoryType: "overall", direction: "decrease", pointsDelta: 100 }]),
    0,
    "even an extreme reduction cannot go below zero",
  );
  assert.equal(
    ledger.foldLedgerEntries(baseline, 50, [{ categoryType: "myp_criterion", direction: "increase", pointsDelta: 8 }]),
    40,
    "a criterion adjustment never moves the overall score by itself",
  );

  const server = readFileSync(resolve(ROOT, "src/lib/assessmentContributionsServer.ts"), "utf8");
  assert.ok(
    !/\.from\("exam_attempts"\)\s*\.\s*update/.test(server),
    "the consolidation layer never writes to exam_attempts",
  );
  assert.ok(
    !/\.from\("exam_answers"\)/.test(server) || !/update\(/.test(server.split('.from("exam_answers")')[1] ?? ""),
    "the consolidation layer never writes to exam_answers",
  );
});

console.log(`PASS test-grade-adjustment-ledger (${passed} checks)`);
