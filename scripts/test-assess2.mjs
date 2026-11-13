// Criteria A–D formative papers (Formative Assessment 2) — guarantees:
//   · keyword-rubric parts score justifications in the student's own words
//   · strands reach the candidate projection; keywords/answers never do
//   · side-by-side box plots survive diagram normalisation
//   · migrations 0088-0090: new titles/codes, typed-only, criterion splits
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicAssessParts, scoreAssessParts } from "../src/lib/assessParts.ts";
import { normaliseAssessDiagram } from "../src/lib/assessDiagram.ts";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

const JUSTIFY = [{
  id: "d", label: "(d)", prompt: "Justify.", kind: "text", points: 1, strand: "D(iv)",
  accepted: ["b, smaller IQR"],
  keywords: [["b"], ["iqr", "consistent", "spread"]], minKeywordGroups: 2,
  hints: ["Reliable means consistent — compare the spreads.", "Choose the smaller IQR and say so."],
}];

check("keyword rubric credits a justification in the student's own words", () => {
  assert.equal(scoreAssessParts(JUSTIFY, { parts: { d: "Company B is better because its IQR is smaller" } }).points, 1);
  assert.equal(scoreAssessParts(JUSTIFY, { parts: { d: "B, smaller IQR" } }).points, 1); // exact variant
  assert.equal(scoreAssessParts(JUSTIFY, { parts: { d: "Company B" } }).points, 0); // no reason given
  assert.equal(scoreAssessParts(JUSTIFY, { parts: { d: "" } }).points, 0);
});

check("strand is candidate-visible; keywords and answers never leak", () => {
  const pub = publicAssessParts(JUSTIFY);
  assert.equal(pub[0].strand, "D(iv)");
  const s = JSON.stringify(pub);
  assert.ok(!s.includes('"keywords"') && !s.includes('"accepted"') && !s.includes("minKeywordGroups"));
});

check("side-by-side box plots survive normalisation", () => {
  const spec = normaliseAssessDiagram({
    kind: "box_plot", title: "A vs B", boxPlots: [
      { label: "A", min: 12, q1: 18, median: 24, q3: 31, max: 44 },
      { label: "B", min: 15, q1: 21, median: 25, q3: 29, max: 38 },
    ],
  });
  assert.equal(spec.boxPlots.length, 2);
  assert.equal(spec.boxPlots[1].median, 25);
});

const PAPERS = [
  ["supabase/migrations/0088_assess2_myp2.sql", "MYP2 (Grade 7) Formative Assessment 2 - Criteria A-D", "MYP2-FORM2-2026", { A: 9, B: 6, C: 5, D: 5 }],
  ["supabase/migrations/0089_assess2_myp4.sql", "MYP4 (Grade 9) Formative Assessment 2 - Criteria A-D", "MYP4-FORM2-2026", { A: 9, B: 5, C: 5, D: 6 }],
  ["supabase/migrations/0090_assess2_myp5.sql", "MYP5 (Grade 10) Formative Assessment 2 - Criteria A-D", "MYP5-FORM2-2026", { A: 7, B: 9, C: 4, D: 5 }],
];
for (const [file, title, code, split] of PAPERS) {
  check(`${code}: migration carries the new paper, typed-only, split exact`, () => {
    const sql = readFileSync(file, "utf8");
    assert.ok(sql.includes(title) && sql.includes(code));
    for (const banned of ['"single_choice"', '"multiple_select"', '"true_false"', '"matching"', '"ordering"']) {
      assert.ok(!sql.includes(banned), banned);
    }
    const payload = JSON.parse(sql.match(/jsonb_array_elements\('(.*)'::jsonb\)/s)[1].replace(/''/g, "'"));
    assert.equal(payload.length, 25);
    const counts = {};
    let visuals = 0;
    for (const q of payload) {
      counts[q.cfg.myp_criterion] = (counts[q.cfg.myp_criterion] ?? 0) + 1;
      assert.ok(q.cfg.strand?.startsWith(q.cfg.myp_criterion + "("), "question strand");
      if (JSON.stringify(q.d).includes("assessDiagramBlock")) visuals += 1;
      for (const p of q.cfg.parts ?? []) {
        assert.ok(p.strand?.startsWith(q.cfg.myp_criterion + "("), "part strand");
        assert.equal(p.hints.length, 2);
      }
    }
    assert.deepEqual(counts, split);
    assert.ok(visuals >= 20, `visuals ${visuals}`);
  });
}

check("the original Assess Prep papers are untouched by the new migrations", () => {
  for (const f of ["0088_assess2_myp2.sql", "0089_assess2_myp4.sql", "0090_assess2_myp5.sql"]) {
    const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
    assert.ok(!sql.includes("MYP2-FORM-2026") && !sql.includes("MYP4-STATS-2026") && !sql.includes("MYP5-SEQUENCES-2026"));
    assert.ok(!/update\s+questions|delete\s+from/i.test(sql), "no edits to existing rows");
  }
});

check("criterion + strand reach the candidate payload and feedback", () => {
  assert.ok(readFileSync("src/lib/live.ts", "utf8").includes("out.strand"));
  const client = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
  // The banding moved into the shared, reusable result summary so the same
  // computation serves the candidate screen, a teacher report and print.
  assert.ok(client.includes("Criterion {current.criterion}"));
  assert.ok(client.includes("resultSummary(") && client.includes("questionFeedback("));
  assert.ok(readFileSync("src/lib/examFeedback.ts", "utf8").includes("levelBand("));
  const runner = readFileSync("src/components/QuestionRunner.tsx", "utf8");
  assert.ok(runner.includes("Criterion {part.strand}"));
});

console.log(`\nAssess2 suite: ${checks} checks passed.`);
