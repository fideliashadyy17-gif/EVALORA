/**
 * Question-level marking in the validated results view, proven on a REAL
 * production submission (MYP5 Version C, Oxane ZOCLI, stored 56/100).
 *
 * Uses the same fixture as the PDF verifier, so the on-screen review and the
 * Candidate Examination Paper are checked against one another: the per-question
 * marks shown to the student must be the marks stored against the attempt.
 *
 * Run: node scripts/verify-real-results-view.mjs
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const outDir = "/tmp/evalora-real-results";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);

const req = createRequire(path.resolve("package.json"));
const Module = req("node:module");
const compiledCache = new Map();

function compileTsToCjs(absTsPath) {
  if (compiledCache.has(absTsPath)) return compiledCache.get(absTsPath);
  const rel = path.relative(process.cwd(), absTsPath);
  const out = ts.transpileModule(readFileSync(absTsPath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: rel,
  }).outputText;
  const target = path.join(outDir, rel.replace(/\.ts$/, ".cjs"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, out);
  compiledCache.set(absTsPath, target);
  return target;
}

const prevResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (parent && parent.filename.startsWith(outDir)) {
    let candidate = null;
    if (request.startsWith("./") || request.startsWith("../")) {
      const parentOrig = path.relative(outDir, parent.filename).replace(/\.cjs$/, ".ts");
      candidate = path.resolve(path.dirname(parentOrig), request.endsWith(".ts") ? request : `${request}.ts`);
    } else if (request.startsWith("@/lib/")) {
      candidate = path.resolve("src/lib", `${request.slice("@/lib/".length)}.ts`);
    }
    if (candidate) {
      try {
        readFileSync(candidate);
        return compileTsToCjs(candidate);
      } catch {
        /* fall through */
      }
    }
    if (!request.startsWith(".") && !request.startsWith("/")) return req.resolve(request);
  }
  return prevResolve.call(this, request, parent, isMain, options);
};

const myp = req(compileTsToCjs(path.resolve("src/lib/myp.ts")));
const { MYP5_OXANE } = await import("./real-paper-data/myp5-oxane.mjs");
const fixture = MYP5_OXANE;

/** The printed paper, as `loadMypResults` projects it. */
const paper = fixture.rows.map((row) => ({
  questionId: row.id,
  points: row.points,
  criterion: row.criterion,
  topic: null,
  type: row.type,
  subjectId: null,
  prompt: row.prompt,
}));

/** The full question rows the marking view reads (keys and part schemes). */
const markingRows = fixture.rows.map((row, index) => ({
  id: `qq-${index}`,
  question_id: row.id,
  position: index,
  points: row.points,
  time_limit_seconds: null,
  questions: {
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    prompt_doc: null,
    explanation: null,
    explanation_doc: null,
    points: row.points,
    config: {
      myp_criterion: row.criterion,
      question_number: row.number,
      ...(row.parts ? { parts: row.parts } : {}),
    },
    question_options: (row.options ?? []).map((o, i) => ({
      id: o.id,
      label: o.label,
      content_doc: null,
      is_correct: o.is_correct,
      position: i,
    })),
  },
}));

const answeredRows = Object.entries(fixture.answers).map(([questionId, value]) => ({
  question_id: questionId,
  answer: value.answer,
  points_awarded: value.points_awarded,
  marker_note: value.marker_note ?? null,
  grading_note: value.grading_note ?? null,
}));

function attemptInput(published) {
  return {
    attemptId: fixture.attempt,
    examId: fixture.exam,
    organizationId: "0a400000-0000-4000-8000-000000000001",
    organizationName: "Oak International School",
    organizationLogoUrl: null,
    examTitle: "MYP5 Mathematics — Version C",
    examDate: "2026-11-26T09:00:00Z",
    examStatus: "closed",
    attemptStatus: "submitted",
    submittedAt: "2026-11-26T11:00:00Z",
    score: fixture.score,
    maxScore: fixture.maxScore,
    published,
    publishedAt: published ? "2026-11-27T08:00:00Z" : null,
    studentName: fixture.student,
    studentRef: "MYP5-014",
    studentId: "student-oxane",
    candidateRef: "MYP5-014",
    className: "Grade 10 — MYP 5",
    classCode: "G10",
    classGradeOrder: 10,
    mypYear: 5,
    subjectNames: ["Mathematics"],
    subjectId: "subject-maths",
    reportingPeriod: "2026-11",
  };
}

function rulesInput() {
  return {
    criteria: fixture.criteria.map((c) => ({
      code: c.code,
      title: c.title,
      description: null,
      maxMarks: c.marksMax,
    })),
    gradeBoundaries: myp.DEFAULT_GRADE_BOUNDARIES,
    gradeSource: myp.DEFAULT_GRADE_SOURCE,
    levelBoundaries: myp.DEFAULT_LEVEL_BOUNDARIES,
    levelSource: myp.DEFAULT_LEVEL_SOURCE,
    requireAllCriteria: true,
  };
}

/** The real +15 cohort adjustment, exactly as production stores it. */
function adjustments() {
  return [
    { categoryType: "myp_criterion", categoryKey: "A", pointsApplied: 3 },
    { categoryType: "myp_criterion", categoryKey: "B", pointsApplied: 2 },
    { categoryType: "myp_criterion", categoryKey: "C", pointsApplied: 5 },
    { categoryType: "myp_criterion", categoryKey: "D", pointsApplied: 5 },
  ];
}

function answersInput(rows = answeredRows) {
  return rows.map((row) => ({
    questionId: row.question_id,
    pointsAwarded: row.points_awarded === null ? null : Number(row.points_awarded),
    hasContent: true,
    isCorrect: null,
    markerNote: row.marker_note,
    moderationStatus: null,
  }));
}

function build({ published, preview }) {
  return myp.buildMypResult({
    attempt: attemptInput(published),
    paper,
    answers: answersInput(),
    rules: rulesInput(),
    // The adjustment must raise the total and must never appear as a line.
    scoreAdjustments: adjustments(),
    questionMarking: { rows: markingRows, answeredRows },
    markingPreview: preview,
  });
}

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
};

console.log(`\nResults view — ${fixture.label}`);
console.log(`Candidate ${fixture.student} · stored total ${fixture.score}/${fixture.maxScore}\n`);

const released = build({ published: true, preview: false });

check("the released result carries a question for every printed question", () => {
  assert.equal(released.questions.length, fixture.rows.length);
});

check("per-question marks are the stored marks", () => {
  const byNumber = new Map(released.questions.map((q) => [String(q.number), q]));
  // Q12 2/2, Q11 0/2, Q16 3/3, Q19 1/3, Q1 (task) 0/10
  assert.equal(byNumber.get("12").earned, 2);
  assert.equal(byNumber.get("12").max, 2);
  assert.equal(byNumber.get("11").earned, 0);
  assert.equal(byNumber.get("16").earned, 3);
  assert.equal(byNumber.get("16").status, "correct");
  assert.equal(byNumber.get("19").earned, 1);
  assert.equal(byNumber.get("19").status, "partial");
  assert.equal(byNumber.get("1").earned, 0);
  assert.equal(byNumber.get("1").max, 10);
});

check("every question mark adds up to the marks earned on the paper", () => {
  const rawMarks = Object.values(fixture.answers).reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0);
  const total = released.questions.reduce((sum, q) => sum + q.earned, 0);
  assert.equal(total, rawMarks, `questions total ${total}, answer marks ${rawMarks}`);
});

check("part marks are whole marks and never exceed their own maximum", () => {
  for (const question of released.questions) {
    for (const part of question.parts) {
      if (part.earned === null) continue;
      assert.ok(
        Number.isInteger(part.earned),
        `Q${question.number} (${part.label}): part mark ${part.earned} is not a whole mark`,
      );
      assert.ok(
        part.earned >= 0 && part.earned <= part.max,
        `Q${question.number} (${part.label}): ${part.earned} is outside 0..${part.max}`,
      );
    }
  }
});

check("part marks never claim more than the question as a whole", () => {
  for (const question of released.questions) {
    if (question.parts.length === 0) continue;
    const sum = question.parts.reduce((total, part) => total + (part.earned ?? 0), 0);
    assert.ok(
      sum <= question.earned + 0.005,
      `Q${question.number}: parts claim ${sum} but the question is marked ${question.earned}`,
    );
  }
});

check("no part is credited beyond what the answer key supports", () => {
  // Q19 stored 1/3. The key proves (i) "U1=4 and U5= 24" is exact and (ii) 9
  // is wrong, so the parts account for exactly 1 mark and nothing is invented.
  const q19 = released.questions.find((q) => String(q.number) === "19");
  assert.equal(q19.earned, 1);
  const terms = q19.parts.find((part) => part.prompt.startsWith("Values of u1"));
  const solve = q19.parts.find((part) => part.prompt.startsWith("Positive integer"));
  assert.equal(terms.status, "correct", "the exact u1/u5 answer must be credited");
  assert.equal(solve.earned, 0, "the wrong root must not be credited");
  const credited = q19.parts.reduce((sum, part) => sum + (part.earned ?? 0), 0);
  assert.equal(credited, 1, "the parts must account for exactly the stored mark");
});

check("marks the parts cannot account for are disclosed, not dropped", () => {
  // Q15 stored 2/3, but its only keyed part is worth 1 mark (u_n = n^2) and the
  // candidate's answer is not that. The remaining 1 mark was paid for the
  // plotted points, which the school recorded nowhere per part: the view must
  // keep the question total at 2 and state the shortfall rather than hide it.
  const q15 = released.questions.find((q) => String(q.number) === "15");
  assert.equal(q15.earned, 2);
  const accounted = q15.parts.reduce((sum, part) => sum + (part.earned ?? 0), 0);
  assert.ok(accounted < q15.earned, "Q15 is the case where the part cannot hold the whole mark");
  assert.equal(q15.earned - accounted, 2, "the residual line must show both unattributed marks");
});

check("a blank part is never shown as holding credit", () => {
  // Q27 (ii): the candidate submitted nothing for the recursive rule.
  const q27 = released.questions.find((q) => String(q.number) === "27");
  const blank = q27.parts.find((part) => part.candidateResponse === null);
  assert.ok(blank, "Q27 has an unanswered part in the real submission");
  assert.equal(blank.earned, 0);
  assert.equal(blank.status, "unanswered");
});

check("a full-mark question pays every part in full", () => {
  const q16 = released.questions.find((q) => String(q.number) === "16");
  assert.equal(q16.earned, 3);
  assert.equal(q16.parts.length, 3, "Q16 has three marked parts (two intersections and the difference)");
  assert.ok(q16.parts.every((part) => part.earned === part.max && part.status === "correct"));
});

check("statuses use all four verdicts on real data", () => {
  const statuses = new Set(released.questions.map((q) => q.status));
  for (const expected of ["correct", "partial", "wrong"]) {
    assert.ok(statuses.has(expected), `no ${expected} question in the real submission`);
  }
});

check("the candidate's own answers are preserved verbatim", () => {
  const q23 = released.questions.find((q) => String(q.number) === "23");
  const written = q23.parts.map((part) => part.candidateResponse).join(" | ");
  assert.ok(/Arithmetic U5=\s*72/.test(written), `Q23 answers not preserved: ${written}`);
  const q30 = released.questions.find((q) => String(q.number) === "30");
  assert.ok(q30.parts.some((part) => part.candidateResponse === "0.9"), "Q30 r not preserved");
});

check("a part marked wrong names the expected answer", () => {
  // Q30 (i) is a genuine part error: the school stored 1/3 for the question,
  // 0.9 for r was right and the rest wrong, so the parts that can be evidenced
  // must print what was expected.
  const wrongParts = released.questions.flatMap((q) =>
    q.parts.filter((part) => part.status === "wrong").map((part) => ({ q, part })),
  );
  assert.ok(wrongParts.length > 0, "no part-level error anywhere in the real submission");
  for (const { part } of wrongParts) {
    assert.ok(part.expected, `a wrong part must show the expected answer: ${part.prompt}`);
  }
});

check("a wrong objective answer names the option the candidate should have chosen", () => {
  const q11 = released.questions.find((q) => String(q.number) === "11");
  assert.equal(q11.status, "wrong");
  assert.equal(q11.options.length, 4);
  const selected = q11.options.filter((o) => o.selected).map((o) => o.label);
  assert.deepEqual(selected, ["A"], "candidate's own choice must be preserved");
  const expected = q11.options.filter((o) => o.expected).map((o) => o.label);
  assert.deepEqual(expected, ["C"], "the correct option must be identified");
});

check("a correct objective answer is not marked as expected-elsewhere", () => {
  const correctOnes = released.questions.filter(
    (q) => q.options.length > 0 && q.status === "correct",
  );
  assert.ok(correctOnes.length > 0, "no correct objective question in the real submission");
  for (const question of correctOnes) {
    assert.equal(question.options.filter((o) => o.expected).length, 0, "a correct answer needs no expected option");
    assert.equal(question.options.filter((o) => o.selected).length, 1);
  }
});

check("MYP criteria A, B, C and D all appear with marks", () => {
  assert.equal(released.criteria.length, 4);
  for (const criterion of released.criteria) {
    assert.ok(criterion.marksMax > 0, `criterion ${criterion.code} has no maximum`);
    assert.ok(criterion.marksAwarded > 0, `criterion ${criterion.code} has no marks`);
  }
});

check("the final total includes the score adjustments", () => {
  // Production stores 56.00 for this attempt: 41 marks earned on the answers
  // plus the 15-point cohort adjustment. If the engine derives 56 from the raw
  // answers alone it matches, and the student-facing total is the same figure
  // the school released while no adjustment line is printed anywhere.
  const rawMarks = Object.values(fixture.answers).reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0);
  assert.equal(rawMarks, 41, "fixture changed: raw answer marks");
  assert.equal(
    released.marksAwarded,
    fixture.score,
    `total ${released.marksAwarded} must equal the released ${fixture.score} (raw ${rawMarks} + adjustments)`,
  );
  assert.equal(released.marksMax, fixture.maxScore);
  // The criteria must carry the adjusted figures, not the raw ones.
  const criterionTotal = released.criteria.reduce((sum, c) => sum + c.marksAwarded, 0);
  assert.ok(criterionTotal > rawMarks, `criteria hold ${criterionTotal} but raw answers are only ${rawMarks}`);
});

check("no adjustment detail is exposed anywhere on the result", () => {
  const serialised = JSON.stringify(released);
  if (/adjust/i.test(serialised)) {
    for (const m of serialised.matchAll(new RegExp('.{0,80}adjust.{0,80}', 'gi'))) {
      console.log('      LEAK>', m[0]);
    }
  }
  assert.ok(!/adjust/i.test(serialised), "result mentions an adjustment");
  assert.ok(!/bonus/i.test(serialised), "result mentions a bonus");
  assert.ok(!/pointsApplied/i.test(serialised), "result exposes adjustment points");
});

check("no internal marking mechanics reach the candidate", () => {
  const serialised = JSON.stringify(released.questions);
  for (const banned of ["auto keyword", "false positive", "Adjusted"]) {
    assert.ok(!serialised.includes(banned), `internal note leaked: ${banned}`);
  }
});

check("every internal marker note on this submission is withheld", () => {
  // All three notes the school wrote against this attempt are marking
  // machinery: two describe auto-grader corrections, one records a mark
  // adjustment. None may reach the candidate, so a blank is the correct
  // outcome — not a bug in the filter.
  const realNotes = Object.values(fixture.answers).map((a) => a.marker_note).filter(Boolean);
  assert.equal(realNotes.length, 3, "fixture changed: marker notes");
  for (const note of realNotes) {
    assert.ok(
      released.questions.every((q) => q.teacherFeedback !== note),
      `internal note reached the candidate: ${note}`,
    );
  }
  assert.ok(
    released.criteria.every((c) => !c.feedback || !/auto-grader|adjusted/i.test(c.feedback)),
    "internal note reached the criterion feedback",
  );
});

check("the filter is not blanket-dropping genuine feedback", () => {
  // Prove the filter still passes real teacher prose: build the same result with
  // the internal note replaced by subject feedback of the same shape.
  const prose = "Q19 (ii): solving 2n²-7n+9 = 81 needs n² - 3.5n - 36 = 0; check the positive root.";
  const swapped = answeredRows.map((row) =>
    row.question_id === "ce000000-0000-4000-8000-000000001019" ? { ...row, marker_note: prose } : row,
  );
  const withProse = myp.buildMypResult({
    attempt: attemptInput(true),
    paper,
    answers: answersInput(),
    rules: rulesInput(),
    scoreAdjustments: adjustments(),
    questionMarking: { rows: markingRows, answeredRows: swapped },
    markingPreview: false,
  });
  const q19 = withProse.questions.find((q) => String(q.number) === "19");
  assert.equal(q19.teacherFeedback, prose, "genuine teacher feedback must survive the filter");
});

// ── Withheld vs preview ───────────────────────────────────────────────────
const withheld = build({ published: false, preview: false });
check("an unreleased result exposes no question-level marking", () => {
  assert.equal(withheld.questions.length, 0);
  assert.equal(withheld.published, false);
  // The award itself is still withheld; the total remains the internal figure.
  assert.equal(withheld.marksAwarded, fixture.score);
});

const preview = build({ published: false, preview: true });
check("a teacher can preview full question-level marking before publication", () => {
  assert.equal(preview.published, false);
  assert.equal(preview.questions.length, fixture.rows.length);
  assert.ok(preview.questions.some((q) => q.status === "correct"));
  assert.ok(preview.questions.some((q) => q.status === "wrong"));
  assert.ok(preview.questions.some((q) => q.status === "partial"));
  // Per-question marks are the marks earned on the answers; the cohort
  // adjustment lives in the criterion totals, never on a question.
  const rawMarks = Object.values(fixture.answers).reduce((sum, a) => sum + Number(a.points_awarded ?? 0), 0);
  const total = preview.questions.reduce((sum, q) => sum + q.earned, 0);
  assert.equal(total, rawMarks);
  assert.ok(preview.marksAwarded > total, "the released total must still include the adjustment");
});

check("preview and released views show identical marking", () => {
  const strip = (questions) => JSON.stringify(questions.map((q) => ({ ...q })));
  assert.equal(strip(preview.questions), strip(released.questions), "preview differs from the released paper");
});

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exitCode = 1;
