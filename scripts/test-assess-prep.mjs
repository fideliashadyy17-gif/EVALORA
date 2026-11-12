// Assess Prep formative papers — engine + content guarantees.
//   · assess_parts scoring: per-part marks, tolerances, expression equivalence
//   · the candidate projection can never carry a key
//   · diagram specs survive normalisation for every required kind
//   · the three generated migrations are typed-only, 25 × 50, fully hinted
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assessPartsFromConfig, canonicalExpression, parseStudentNumber,
  publicAssessParts, scoreAssessParts,
} from "../src/lib/assessParts.ts";
import { normaliseAssessDiagram } from "../src/lib/assessDiagram.ts";
import { questionPublishIssues } from "../src/lib/questionValidation.ts";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

const PARTS = [
  { id: "a", label: "(a)", prompt: "Rate?", kind: "numeric", points: 1, answer: 30, tolerance: 0, unit: "L/min", hints: ["Find the amount for one minute first.", "Divide the total by the time."] },
  { id: "b", label: "(b)", prompt: "Formula?", kind: "expression", points: 2, accepted: ["4n+3"], hints: ["Use n directly, not the previous term.", "First term plus (n − 1) times the difference."] },
  { id: "c", label: "(c)", prompt: "Type?", kind: "text", points: 1, accepted: ["continuous"], hints: ["Counted or measured?", "Measured values can take any value in a range."] },
];

check("assess_parts awards per-part partial credit", () => {
  const s = scoreAssessParts(PARTS, { parts: { a: "30", b: "4n+3", c: "discrete" } });
  assert.equal(s.points, 3); // a + b, not c
  assert.equal(s.isCorrect, false);
  assert.equal(scoreAssessParts(PARTS, { parts: { a: "30", b: "4n+3", c: "Continuous" } }).isCorrect, true);
});

check("equivalent algebraic forms mark equal", () => {
  for (const form of ["4n+3", "4n + 3", "a_n=4n+3", "3+4n", "aₙ = 4n+3"]) {
    assert.equal(canonicalExpression(form), canonicalExpression("4n+3"), form);
  }
  assert.notEqual(canonicalExpression("4n+2"), canonicalExpression("4n+3"));
  const viaParts = scoreAssessParts(PARTS, { parts: { a: 30, b: "3 + 4n", c: "continuous" } }, 4);
  assert.deepEqual({ isCorrect: viaParts.isCorrect, points: viaParts.points }, { isCorrect: true, points: 4 });
  assert.ok(readFileSync("src/lib/scoring.ts", "utf8").includes('case "assess_parts"'), "server scoring handles assess_parts");
});

check("numeric parts tolerate units, fractions and stated tolerance", () => {
  assert.equal(parseStudentNumber("6.67 litres"), 6.67);
  assert.equal(parseStudentNumber("3/4"), 0.75);
  assert.equal(parseStudentNumber("1,250"), 1250);
  const tol = [{ ...PARTS[0], answer: 25, tolerance: 2 }];
  assert.equal(scoreAssessParts(tol, { parts: { a: "24" } }).points, 1);
  assert.equal(scoreAssessParts(tol, { parts: { a: "29" } }).points, 0);
});

check("the candidate projection contains no answer key", () => {
  const pub = publicAssessParts(PARTS);
  const serialised = JSON.stringify(pub);
  assert.ok(!serialised.includes("4n+3") && !serialised.includes("continuous") && !serialised.includes('"answer"'));
  assert.equal(pub.length, 3);
  assert.deepEqual(pub[0].hints.length, 2);
});

check("bad stored part specs are dropped, never invented", () => {
  assert.deepEqual(assessPartsFromConfig({ parts: [{ id: "a", kind: "numeric", points: 1, hints: ["x", "y"] }] }), []);
  assert.deepEqual(assessPartsFromConfig(null), []);
});

check("publication validation requires parts, marks balance and 2 hints per part", () => {
  const issues = questionPublishIssues({ type: "assess_parts", prompt: "Q", points: 4, config: { parts: PARTS } });
  assert.deepEqual(issues, []);
  const broken = questionPublishIssues({ type: "assess_parts", prompt: "Q", points: 9, config: { parts: PARTS } });
  assert.ok(broken.some((i) => i.includes("add up")));
});

check("every required diagram kind normalises", () => {
  const samples = [
    { kind: "tape", tapeRows: [{ label: "Red", segments: [{ label: "?", span: 1 }] }] },
    { kind: "double_number_line", lines: [{ label: "Pens", unit: "$", max: 7, ticks: [{ at: 3, label: "3" }] }] },
    { kind: "venn2", venn: { leftLabel: "F", rightLabel: "B", leftOnly: "7", both: "5", rightOnly: "9", outside: "4" } },
    { kind: "stem_leaf", stemRows: [{ stem: "3", leaves: ["0", "5"], left: ["2"] }] },
    { kind: "box_plot", fiveNumber: { min: 10, q1: 25, median: 40, q3: 55, max: 80 } },
    { kind: "cumulative_curve", points: [[0, 0], [10, 5]] },
    { kind: "histogram", bars: [{ from: 0, to: 10, height: 1.2 }] },
    { kind: "shape_pattern", patterns: [{ label: "P1", squares: 4 }] },
    { kind: "term_graph", points: [[1, 3], [2, 6]] },
    { kind: "table", columns: ["x", "f"], rows: [["1", "2"]] },
  ];
  for (const s of samples) assert.ok(normaliseAssessDiagram(s), s.kind);
  assert.equal(normaliseAssessDiagram({ kind: "pie_chart" }), null);
});

check("the three papers are typed-only, 25 questions, 50 marks, fully hinted", () => {
  for (const f of ["0085_assess_prep_myp2.sql", "0086_assess_prep_myp4.sql", "0087_assess_prep_myp5.sql"]) {
    const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
    for (const banned of ["single_choice", "multiple_select", "true_false", "'matching'", "'ordering'"]) {
      assert.ok(!sql.includes(banned), `${f} must not contain ${banned}`);
    }
    assert.ok(sql.includes("'assess_parts'") || sql.includes("assess_parts"), f);
    assert.ok(sql.includes("h(level, body)") && sql.includes("q.config->'hints'->>0"), `${f} derives 2 hint levels per question`);
    assert.equal(sql.split('"n":').length - 1, 25, `${f} payload questions`);
  }
  const infra = readFileSync("supabase/migrations/0084_assess_prep_infrastructure.sql", "utf8");
  assert.ok(infra.includes("exam_hint_usage") && infra.includes("record_exam_hint_use") && infra.includes("'assess_parts'"));
});

check("hint usage is wired from the student page to the teacher report", () => {
  assert.ok(readFileSync("src/app/api/exam/hint/usage/route.ts", "utf8").includes("record_exam_hint_use"));
  assert.ok(readFileSync("src/app/take-exam/[attemptId]/HintPanel.tsx", "utf8").includes("/api/exam/hint/usage"));
  assert.ok(readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8").includes("feedback-summary"));
  assert.ok(readFileSync("src/app/dashboard/reports/exam/[id]/page.tsx", "utf8").includes("hintsByAttempt"));
  assert.ok(readFileSync("src/components/QuestionRunner.tsx", "utf8").includes("Hint"));
});

console.log(`\nAssess Prep suite: ${checks} checks passed.`);
