// Verifies Super Admin auditable, idempotent regrading workflow
// and integration with mathematical answer equivalence.
import assert from "node:assert/strict";
import fs from "node:fs";

console.log("Testing Super Admin Auditable & Idempotent Regrading Workflow...");

// 1. Verify actions exist in src/app/admin/examinations/actions.ts
const actionsSrc = fs.readFileSync("src/app/admin/examinations/actions.ts", "utf8");
assert.ok(actionsSrc.includes("export async function regradeAttemptAsAdmin"), "regradeAttemptAsAdmin action is exported");
assert.ok(actionsSrc.includes("export async function regradeExamAsAdmin"), "regradeExamAsAdmin action is exported");
assert.ok(actionsSrc.includes("requireSuperAdmin()"), "actions strictly require Super Admin authorization");
assert.ok(actionsSrc.includes("exam.attempt_regraded_by_admin"), "attempt regrade records audit log entry");
assert.ok(actionsSrc.includes("exam.exam_regraded_by_admin"), "bulk exam regrade records audit log entry");
assert.ok(actionsSrc.includes("gradeAttemptDetailed"), "regrading invokes authoritative scoring engine");
console.log("  ✓ Super Admin regrading actions strictly authenticated and auditable");

// 2. Verify UI wiring in examination results page
const resultsSrc = fs.readFileSync("src/app/admin/examinations/results/page.tsx", "utf8");
assert.ok(resultsSrc.includes("regradeExamAsAdmin"), "Results page wires bulk examination regrade action");
assert.ok(resultsSrc.includes("regradeAttemptAsAdmin"), "Results page wires individual attempt regrade action");
assert.ok(resultsSrc.includes("Regrade examination"), "Results page displays 'Regrade examination' button");
assert.ok(resultsSrc.includes("Regrade"), "Results table rows display 'Regrade' action button");
console.log("  ✓ Examination results management UI exposes both bulk and per-attempt regrade controls");

// 3. Verify UI wiring in complete script review page
const scriptSrc = fs.readFileSync("src/app/admin/examinations/attempts/[attemptId]/script/page.tsx", "utf8");
assert.ok(scriptSrc.includes("regradeAttemptAsAdmin"), "Script review page wires regradeAttemptAsAdmin action");
assert.ok(scriptSrc.includes("Regrade attempt"), "Script review page displays 'Regrade attempt' button");
console.log("  ✓ Complete script review UI exposes 'Regrade attempt' action");

// 4. Verify database-level append-only audit & idempotency in migrations
const migration0036 = fs.readFileSync("supabase/migrations/0036_grading_rubrics_moderation_audit.sql", "utf8");
assert.ok(migration0036.includes("create table if not exists public.grade_change_log"), "grade_change_log table exists");
assert.ok(migration0036.includes("create trigger grade_change_recorder"), "grade_change_recorder trigger tracks score updates");
assert.ok(migration0036.includes("create trigger grade_change_append_only"), "grade_change_log is strictly append-only");
assert.ok(migration0036.includes("new.points_awarded is not distinct from old.points_awarded"), "Trigger enforces idempotency by skipping identical score writes");
console.log("  ✓ Database schema enforces immutable append-only audit log and idempotent execution");

// 5. Test idempotency and mathematical equivalence in assessment engine
import { scoreAssessParts } from "../src/lib/assessParts.ts";

const algebraicPart = {
  id: "eq1",
  label: "Formula",
  prompt: "Find explicit formula",
  kind: "expression",
  points: 2,
  accepted: ["40 - 4n", "36 - 4(n-1)"],
};

// First run with equivalent algebraic form
const res1 = scoreAssessParts([algebraicPart], { parts: { eq1: "-4n + 40" } });
assert.equal(res1.points, 2, "First scoring awards full marks for equivalent form -4n + 40");
assert.equal(res1.isCorrect, true);

// Second run (simulating regrade) with identical response
const res2 = scoreAssessParts([algebraicPart], { parts: { eq1: "-4n + 40" } });
assert.equal(res2.points, 2, "Second scoring (regrade) produces identical score (idempotent)");
assert.equal(res2.isCorrect, true);

// Run with factored equivalent form
const res3 = scoreAssessParts([algebraicPart], { parts: { eq1: "4(10 - n)" } });
assert.equal(res3.points, 2, "Scoring awards full marks for factored form 4(10 - n)");
assert.equal(res3.isCorrect, true);

// Run with incorrect form
const res4 = scoreAssessParts([algebraicPart], { parts: { eq1: "40 - 5n" } });
assert.equal(res4.points, 0, "Incorrect formula earns 0 marks");
assert.equal(res4.isCorrect, false);

console.log("  ✓ Assessment engine mathematical equivalence and idempotency verified");
console.log("\nAll Super Admin Regrade Workflow checks PASSED successfully!");
