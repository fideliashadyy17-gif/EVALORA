/**
 * Tests for the automatic marking of the four MYP Summative B papers.
 *
 * Compiles the real production modules (no mocks, no re-implementation) and
 * exercises the paths the candidate actually takes:
 *
 *   · numeric equivalence — decimals, 1 800 / 1,800 / 1800, 25 %, 1.18×10⁹
 *   · equivalent fractions and algebra — 7/8, \frac{7}{8}, 4n − 1 ≡ −1 + 4n
 *   · alternative valid methods — SSS/SAS instead of RHS, midpoint vs exact
 *   · method marks and partial credit — right method, wrong final value
 *   · follow-through — a wrong earlier value carried consistently to the end
 *   · the exception state — an empty or uninterpretable response is reported
 *     as needing review and is never silently recorded as zero
 *   · criterion attribution — marks stay on the criterion the paper prints
 *   · the four real papers — every constructed response carries a rubric whose
 *     parts add up to the printed total
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const outDir = "/tmp/evalora-auto-mark-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`);

const built = new Set();

/** Relative specifier for the flat output tree, following `@/` aliases too. */
function resolveSpec(fromRel, spec) {
  if (spec.startsWith("@/")) return spec.slice(2);
  return path.join(path.dirname(fromRel), spec).replace(/^src\//, "");
}

function build(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const source = readFileSync(rel, "utf8");
  const emitted = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      resolveJsonModule: true,
      esModuleInterop: true,
    },
  }).outputText;

  const deps = [...emitted.matchAll(/require\("(@?\.?[^"]+)"\)/g)].map((m) => m[1]);

  const dest = path.join(outDir, rel.replace(/^src\//, "").replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(dest), { recursive: true });

  // Rewrite each specifier as a path relative to THIS module, so the tree keeps
  // its shape (lib/marking/x.js can reach ../autoMark.js).
  const normalised = emitted.replace(/require\("(@?\.?[^"]+)"\)/g, (match, spec) => {
    const isJson = spec.endsWith(".json");
    const target = resolveSpec(rel, spec);
    const targetFile = isJson
      ? path.join(outDir, target)
      : path.join(outDir, `${target.replace(/\.ts$/, "")}.js`);
    let specifier = path.relative(path.dirname(dest), targetFile).split(path.sep).join("/");
    if (!specifier.startsWith(".")) specifier = `./${specifier}`;
    return `require("${specifier}")`;
  });

  writeFileSync(dest, normalised);

  for (const dep of deps) {
    if (dep.endsWith(".json")) {
      const jsonSource = path.join(path.dirname(rel), dep);
      const jsonDest = path.join(outDir, resolveSpec(rel, dep));
      mkdirSync(path.dirname(jsonDest), { recursive: true });
      copyFileSync(jsonSource, jsonDest);
      continue;
    }
    const target = resolveSpec(rel, dep);
    const candidate = `src/${target}`;
    const file = existsSync(candidate) ? candidate : `${candidate}.ts`;
    build(file);
  }
}

for (const entry of [
  "src/lib/autoMark.ts",
  "src/lib/marking/summativeBRubrics.ts",
  "src/lib/scoring.ts",
  "src/lib/examFeedback.ts",
]) {
  build(entry);
}

const require = createRequire(import.meta.url);
const autoMark = require(`${outDir}/lib/autoMark.js`);
const rubrics = require(`${outDir}/lib/marking/summativeBRubrics.js`);
const scoring = require(`${outDir}/lib/scoring.js`);
const feedback = require(`${outDir}/lib/examFeedback.js`);

const { markConstructedResponse, normaliseRubric, extractNumbers, answerSurface, latexToPlain, expressionEquivalent } = autoMark;
const { SUMMATIVE_B_RUBRICS, rubricForQuestion } = rubrics;

let checks = 0;
let failures = 0;
function ok(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

/** A candidate's constructed response, in the shape the runner persists. */
const response = (text) => ({ version: 1, text, doc: null, graph: null, geometry: null, statistics: null, data_table: null });

const R = (id) => SUMMATIVE_B_RUBRICS[id];

// ---------------------------------------------------------------------------
console.log("\n1. The four papers carry a rubric for every constructed response");
// ---------------------------------------------------------------------------
{
  const ids = Object.keys(SUMMATIVE_B_RUBRICS);
  ok("65 constructed-response questions have a rubric", ids.length === 65, `found ${ids.length}`);
  const byPaper = (prefix) => ids.filter((id) => id.startsWith(prefix));
  ok("MYP 2 · 5 rubrics", byPaper("c0700000").length === 5, `${byPaper("c0700000").length}`);
  ok("MYP 3 · 20 rubrics", byPaper("c0800000").length === 20, `${byPaper("c0800000").length}`);
  ok("MYP 4 · 20 rubrics", byPaper("c0900000").length === 20, `${byPaper("c0900000").length}`);
  ok("MYP 5 · 20 rubrics", byPaper("c0a00000").length === 20, `${byPaper("c0a00000").length}`);

  let totalMarks = 0;
  let criterionOk = true;
  let sumOk = true;
  for (const id of ids) {
    const rubric = R(id);
    const sum = rubric.parts.reduce((acc, part) => acc + part.marks, 0);
    totalMarks += rubric.total ?? sum;
    if (Math.abs(sum - (rubric.total ?? sum)) > 1e-9) sumOk = false;
    if (!["A", "B", "C", "D"].includes(rubric.criterion ?? "")) criterionOk = false;
  }
  ok("every rubric is tagged with exactly one MYP criterion", criterionOk);
  ok("each question's parts add up to its printed total", sumOk);
  ok("the rubrics cover 260 marks of constructed response", totalMarks === 260, `${totalMarks}`);

  // Criterion attribution must stay where the source paper printed it.
  const criterionFor = (id) => R(id).criterion;
  ok("MYP 2 Q41 is criterion A", criterionFor("c0700000-0000-4000-8000-000000001041") === "A");
  ok("MYP 2 Q43 is criterion C", criterionFor("c0700000-0000-4000-8000-000000001043") === "C");
  ok("MYP 2 Q45 is criterion D", criterionFor("c0700000-0000-4000-8000-000000001045") === "D");
  const tagged = { A: 0, B: 0, C: 0, D: 0 };
  ids.forEach((id) => { tagged[criterionFor(id)] += (R(id).total ?? 0); });
  ok("no criterion carries the whole paper", Object.values(tagged).every((v) => v < 260),
    JSON.stringify(tagged));
}

// ---------------------------------------------------------------------------
console.log("\n2. Numeric equivalence — however the candidate writes it");
// ---------------------------------------------------------------------------
{
  const cases = [
    ["1800", 1800], ["1 800", 1800], ["1,800", 1800], ["1 800 FCFA", 1800],
    ["13.5 L", 13.5], ["13 500 mL", 13500],
    ["25 %", 25], ["25%", 0.25],
    ["7/8", 0.875],
    ["2\\sqrt{2}", 2.828427], ["2\\sqrt{5}", 4.472136],
    ["1.18 \\times 10^{9}", 1180000000],
    ["3.5 \\times 10^{-3}", 0.0035],
    ["\\frac{7}{8}", 0.875], ["\\dfrac{133}{150}", 0.886667],
    ["120500", 120500], ["1 205 000", 1205000],
    ["−45", -45], ["-45", -45],
  ];
  for (const [written, expected] of cases) {
    const found = extractNumbers(written);
    ok(`reads ${JSON.stringify(written)} as ${expected}`,
      found.some((v) => near(v, expected, Math.max(0.005, Math.abs(expected) * 0.005))),
      `got ${JSON.stringify(found.slice(0, 6))}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n3. Algebraic equivalence — different forms, same rule");
// ---------------------------------------------------------------------------
{
  const surface = (text) => answerSurface(response(text));
  const pairs = [
    ["53 - 7n", "u_n = 53 - 7n"],
    ["53 - 7n", "46 - 7(n - 1)"],
    ["4n - 9", "u_n = 4n - 9"],
    ["4n - 9", "-9 + 4n"],
    ["2n^2 - n + 3", "u_n = 2n^2 - n + 3"],
    ["6n + 1", "u_n = 6n + 1"],
    ["2n + 2", "B_n = 2n + 2"],
    ["150n", "C = 150n"],
    ["150n", "C = 150 * n"],
  ];
  for (const [expected, written] of pairs) {
    ok(`accepts ${written} for ${expected}`, expressionEquivalent(expected, surface(written), ["n", "c", "u", "b"]));
  }
  ok("rejects a genuinely different rule", !expressionEquivalent("53 - 7n", surface("u_n = 46 + 7n"), ["n"]));
  ok("rejects a rule with the wrong gradient", !expressionEquivalent("4n - 9", surface("u_n = 5n - 9"), ["n"]));
}

// ---------------------------------------------------------------------------
console.log("\n4. Full marks on a complete, correct response");
// ---------------------------------------------------------------------------
{
  // MYP 2 Q41 · primes and multiples (criterion A, 8 marks)
  const answer = response(
    "P = {2, 3, 5, 7, 11, 13} and T = {3, 6, 9, 12, 15}. " +
    "P ∩ T = {3}, so n(P ∩ T) = 1. n(P ∪ T) = 6 + 5 − 1 = 10. " +
    "Neither: 15 − 10 = 5 numbers, so the probability is 5/15 = 1/3 in its simplest form.",
  );
  const result = markConstructedResponse(R("c0700000-0000-4000-8000-000000001041"), answer, { max: 8 });
  ok("MYP 2 Q41 scores 8 / 8", result.marks === 8, `got ${result.marks}`);
  ok("MYP 2 Q41 is fully automatic", result.status === "marked" && result.pending === 0);
  ok("MYP 2 Q41 is reported correct", result.isCorrect === true);

  // MYP 2 Q43 · photo prints (criterion C, 10 marks)
  const photos = response(
    "(a) Shop A: 1 800 FCFA, shop B: 1 200 FCFA. " +
    "(b) Shop A costs 150 FCFA per photo, C = 150n. Shop B costs 100 FCFA per photo, C = 100n. " +
    "(c) Both graphs are straight lines and both pass through the origin, so the cost is directly proportional. " +
    "(d) At shop A, 2 400 ÷ 150 = 16 photos; at shop B, 2 400 ÷ 100 = 24 photos, so 8 more at shop B.",
  );
  const photoResult = markConstructedResponse(R("c0700000-0000-4000-8000-000000001043"), photos, { max: 10 });
  ok("MYP 2 Q43 scores 10 / 10", photoResult.marks === 10, `got ${photoResult.marks}`);

  // MYP 5 Q28 · simultaneous equations (criterion A, 4 marks)
  const sim = response("u1 + 4d = 23 and u1 + 11d = 58, so 7d = 35, d = 5 and u1 = 3. " +
    "S20 = 20/2 (2(3) + 19(5)) = 10 (6 + 95) = 1010.");
  const simResult = markConstructedResponse(R("c0a00000-0000-4000-8000-000000001028"), sim, { max: 4 });
  ok("MYP 5 Q28 scores 4 / 4", simResult.marks === 4, `got ${simResult.marks}`);

  // MYP 4 Q27 · central tendency (criterion A, 3 marks)
  const stats = response("0,0,1,1,1,2,2,3,3,4,5. The mode is 1, the median is 2 and the range is 5. " +
    "The mean is 22 ÷ 11 = 2.");
  const statsResult = markConstructedResponse(R("c0900000-0000-4000-8000-000000001027"), stats, { max: 3 });
  ok("MYP 4 Q27 scores 3 / 3", statsResult.marks === 3, `got ${statsResult.marks}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. Partial credit and method marks");
// ---------------------------------------------------------------------------
{
  // Only one of the two sets in MYP 2 Q41(a): half the part.
  const partial = response("P = {2, 3, 5, 7, 11, 13}. I could not finish the rest.");
  const result = markConstructedResponse(R("c0700000-0000-4000-8000-000000001041"), partial, { max: 8 });
  ok("a partly-correct response earns partial credit", result.marks > 0 && result.marks < 8, `got ${result.marks}`);
  ok("(a) is credited 1 of 2", result.parts[0].marks === 1, `got ${result.parts[0].marks}`);
  ok("(b) is credited 0", result.parts[1].marks === 0, `got ${result.parts[1].marks}`);
  ok("the question is marked, not pending", result.status === "marked");

  // Right method, arithmetic slip: MYP 5 Q28 uses d = 5 correctly but sums wrong.
  const slip = response("u1 + 4d = 23, u1 + 11d = 58, so 7d = 35, d = 5 and u1 = 3. " +
    "S20 = 10 (6 + 95) = 1000 (arithmetic slip).");
  const slipResult = markConstructedResponse(R("c0a00000-0000-4000-8000-000000001028"), slip, { max: 4 });
  ok("correct method with a wrong final value still scores the method marks",
    slipResult.marks >= 2, `got ${slipResult.marks}`);
  ok("...but not full marks", slipResult.marks < 4, `got ${slipResult.marks}`);

  // A wrong answer scores zero and is reported as wrong, not pending.
  const wrong = response("P = {1, 4, 6, 8, 9} and T = {2, 5, 7}. n(P ∪ T) = 99. The probability is 3/4.");
  const wrongResult = markConstructedResponse(R("c0700000-0000-4000-8000-000000001041"), wrong, { max: 8 });
  ok("a nonsense answer scores at most 1 of 8 and is not flagged for review",
    wrongResult.marks <= 1 && wrongResult.status === "marked" && wrongResult.pending === 0,
    JSON.stringify({ marks: wrongResult.marks, status: wrongResult.status }));
  ok("a wrong response is reported as not correct", wrongResult.isCorrect === false);
}

// ---------------------------------------------------------------------------
console.log("\n6. Follow-through — a wrong earlier value used consistently");
// ---------------------------------------------------------------------------
{
  // MYP 3 Q30: PR should be 25, giving a perimeter of 66. A candidate who
  // gets PR = 30 but then works correctly from it earns the follow-through.
  const followed = response("(a) PR^2 = 7^2 + 24^2 = 625 so PR = 30 (wrong). " +
    "(b) SR = sqrt(30^2 - 15^2) = sqrt(900 - 225) = sqrt(675) = 25.98, " +
    "so the perimeter is 7 + 24 + 25.98 + 15 = 71.98.");
  // The candidate's derived perimeter, from their own PR = 30.
  const expected = 7 + 24 + 15 + Math.sqrt(30 * 30 - 15 * 15);
  const result = markConstructedResponse(R("c0800000-0000-4000-8000-000000001030"), followed, { max: 4 });
  ok("a consistent follow-through earns the dependent mark",
    near(result.parts[1].marks, 1, 0.001), `got ${result.parts[1].marks} (expected credit for ${expected.toFixed(2)})`);
  ok("the wrong earlier value is not credited",
    result.parts[0].marks === 0, `got ${result.parts[0].marks}`);

  // A candidate who does NOT follow through gets nothing for the second part.
  const inconsistent = response("(a) PR = 30. (b) The perimeter is 50.");
  const inconsistentResult = markConstructedResponse(R("c0800000-0000-4000-8000-000000001030"), inconsistent, { max: 4 });
  ok("an inconsistent second value earns no follow-through",
    inconsistentResult.parts[1].marks === 0, `got ${inconsistentResult.parts[1].marks}`);
}

// ---------------------------------------------------------------------------
console.log("\n7. Alternative valid methods are credited");
// ---------------------------------------------------------------------------
{
  // MYP 3 Q38 asks for an RHS congruence proof but the mark scheme accepts a
  // Pythagoras + SSS or SAS route as well.
  const rhs = response(
    "In triangles EFG and EHG: angle EFG = angle EHG = 90° (given), EG = EG (common hypotenuse), " +
    "EF = EH = 7.5 cm (given). Congruent by RHS. Corresponding angles are equal so EG bisects angle FEH.",
  );
  const rhsResult = markConstructedResponse(R("c0800000-0000-4000-8000-000000001038"), rhs, { max: 4 });
  ok("the RHS route scores full marks", rhsResult.marks === 4, `got ${rhsResult.marks}`);

  const sss = response(
    "Using Pythagoras, FG^2 = EG^2 - 7.5^2 = GH^2 so FG = GH. With EF = EH = 7.5, EG common and " +
    "FG = GH the triangles are congruent by SSS, so corresponding angles are equal and EG bisects angle FEH.",
  );
  const sssResult = markConstructedResponse(R("c0800000-0000-4000-8000-000000001038"), sss, { max: 4 });
  ok("the Pythagoras + SSS route is credited too", sssResult.marks >= 3, `got ${sssResult.marks}`);
}

// ---------------------------------------------------------------------------
console.log("\n8. The exception state — never a silent zero");
// ---------------------------------------------------------------------------
{
  const blank = markConstructedResponse(R("c0700000-0000-4000-8000-000000001043"), response(""), { max: 10 });
  ok("an empty response scores 0 marks", blank.marks === 0);
  ok("an empty response is reported as needing review", blank.status === "needs_review");
  ok("an empty response is NOT reported as incorrect", blank.isCorrect === null, `got ${blank.isCorrect}`);
  ok("an empty response reports the full mark as pending", blank.pending === 10, `got ${blank.pending}`);
  ok("an empty response explains itself", typeof blank.reason === "string" && blank.reason.length > 0);

  const nothing = markConstructedResponse(R("c0700000-0000-4000-8000-000000001043"), null, { max: 10 });
  ok("a missing answer payload is also reported, not zeroed", nothing.isCorrect === null && nothing.status === "needs_review");

  const noRubric = markConstructedResponse(null, response("anything"), { max: 5 });
  ok("a question with no rubric stays unmarked", noRubric.isCorrect === null && noRubric.status === "needs_review");

  // Whitespace only is still empty.
  const whitespace = markConstructedResponse(R("c0700000-0000-4000-8000-000000001043"), response("   \n  "), { max: 10 });
  ok("a whitespace-only response is reported, not zeroed", whitespace.status === "needs_review");
}

// ---------------------------------------------------------------------------
console.log("\n9. Marks are capped and never exceed the question");
// ---------------------------------------------------------------------------
{
  // Every value in sight: the engine must still cap at the printed total.
  const kitchenSink = response(
    "P = {2, 3, 5, 7, 11, 13} T = {3, 6, 9, 12, 15} n(P ∩ T) = 1 n(P ∪ T) = 10 " +
    "15 − 10 = 5 numbers in neither, so the probability is 5/15 = 1/3 in its simplest form " +
    "intersection union 1800 1200 150 100 16 24 8 " +
    "13500 13.5 9 1.5 3 10.5 2400 2200 6600 7 2100 8700 assumption enough",
  );
  const capped = markConstructedResponse(R("c0700000-0000-4000-8000-000000001041"), kitchenSink, { max: 8 });
  ok("the total never exceeds the printed marks", capped.marks <= 8, `got ${capped.marks}`);
  ok("the cap is reached, not merely approached", capped.marks === 8, `got ${capped.marks}`);
  ok("no individual part exceeds its own marks",
    capped.parts.every((part) => part.marks <= part.max),
    JSON.stringify(capped.parts.map((p) => [p.marks, p.max])));

  // A lower ceiling from quiz_questions.points is respected.
  const lowered = markConstructedResponse(R("c0700000-0000-4000-8000-000000001041"), kitchenSink, { max: 5 });
  ok("the question's own points value is the ceiling", lowered.marks === 5, `got ${lowered.marks}`);
}

// ---------------------------------------------------------------------------
console.log("\n10. Integration with the shared scorer");
// ---------------------------------------------------------------------------
{
  // Objective types are untouched.
  const options = [
    { id: "a", label: "48", is_correct: false },
    { id: "b", label: "60", is_correct: false },
    { id: "c", label: "96", is_correct: false },
    { id: "d", label: "108", is_correct: true },
  ];
  const choice = scoring.scoreAnswer({ type: "single_choice", points: 2, config: {} }, options, { option_id: "d" });
  ok("single choice still scores normally", choice.isCorrect === true && choice.points === 2);
  const wrongChoice = scoring.scoreAnswer({ type: "single_choice", points: 2, config: {} }, options, { option_id: "a" });
  ok("a wrong single choice still scores 0", wrongChoice.isCorrect === false && wrongChoice.points === 0);

  // An open_ended question WITHOUT a rubric behaves exactly as before.
  const legacy = scoring.scoreAnswer({ type: "open_ended", points: 5, config: {} }, [], response("anything"));
  ok("an open_ended question with no rubric is still unmarked", legacy.isCorrect === null && legacy.points === 0);

  // With a rubric it is marked.
  const marked = scoring.scoreAnswer(
    { id: "c0a00000-0000-4000-8000-000000001028", type: "open_ended", points: 4, config: {} },
    [],
    response("7d = 35 so d = 5 and u1 = 3. S20 = 10(6 + 95) = 1010."),
  );
  ok("an open_ended question with a rubric is marked automatically",
    marked.isCorrect === true && marked.points === 4, JSON.stringify({ c: marked.isCorrect, p: marked.points }));
  ok("the scorer exposes the per-part breakdown", Array.isArray(marked.autoMark?.parts) && marked.autoMark.parts.length === 2);

  // The rubric travels on the question config when a teacher authors one.
  const custom = { auto_marking: { version: 1, parts: [{ label: "(a)", marks: 2, rules: [{ kind: "number", value: 42, marks: 2 }] }] } };
  const teacherAuthored = scoring.scoreAnswer({ type: "open_ended", points: 2, config: custom }, [], response("The answer is 42."));
  ok("a teacher-authored config rubric is used", teacherAuthored.points === 2, `got ${teacherAuthored.points}`);
}

// ---------------------------------------------------------------------------
console.log("\n11. The result summary no longer holds back marked responses");
// ---------------------------------------------------------------------------
{
  const questions = [
    { type: "single_choice", points: 2, criterion: "A", result: { points_awarded: 2, is_correct: true } },
    {
      id: "c0700000-0000-4000-8000-000000001043", type: "open_ended", points: 10, criterion: "C",
      result: { points_awarded: 10, is_correct: true },
    },
    {
      id: "c0700000-0000-4000-8000-000000001044", type: "open_ended", points: 8, criterion: "C",
      result: { points_awarded: null, is_correct: null },
    },
    { type: "open_ended", points: 4, criterion: "D", result: { points_awarded: null, is_correct: null } },
  ];
  const summary = feedback.resultSummary(questions);
  // Q43 is marked (10), Q44 has a rubric but no mark yet (8, still counted in
  // the maximum), and the rubric-less 4-mark question is excluded as pending.
  ok("a marked constructed response counts towards the total", summary.awarded === 12, `got ${summary.awarded}`);
  ok("its marks are included in the maximum", summary.max === 20, `got ${summary.max}`);
  ok("the rubric-less constructed response is still pending", summary.pendingCount === 1, `got ${summary.pendingCount}`);
  ok("pending marks are flagged on the summary", summary.pendingManual === true);

  // Criterion aggregation keeps marks on the criterion the paper printed.
  const rows = summary.criteria ?? [];
  const c = rows.find((row) => row.criterion === "C");
  ok("criterion C aggregates its own questions only", c && c.max === 18 && c.awarded === 10, JSON.stringify(rows));
  const a = rows.find((row) => row.criterion === "A");
  ok("criterion A keeps the objective question", a && a.max === 2 && a.awarded === 2, JSON.stringify(rows));
  ok("criterion D is not credited without marks", !rows.some((row) => row.criterion === "D" && row.points > 0));
}

// ---------------------------------------------------------------------------
console.log("\n12. LaTeX and structured payloads are read, not ignored");
// ---------------------------------------------------------------------------
{
  ok("LaTeX fractions become ordinary fractions", latexToPlain("\\frac{7}{8}") === "7/8",
    latexToPlain("\\frac{7}{8}"));
  ok("\\times becomes a multiplication sign", latexToPlain("1.18 \\times 10^{9}").includes("*"));
  ok("a table payload contributes its cell values",
    answerSurface({
      version: 1, text: "", doc: null, graph: null, geometry: null, statistics: null,
      data_table: { columns: ["f", "fx"], rows: [{ cells: ["6", "72"] }, { cells: ["12", "192"] }] },
    }).numbers.includes(192));
  ok("a graph payload contributes its labels", (() => {
    const surface = answerSurface({
      version: 1, text: "", doc: null, geometry: null, statistics: null, data_table: null,
      graph: { functions: [{ id: "a", expression: "150x", label: "Shop A" }] },
    });
    return surface.text.includes("shop a") || surface.numbers.includes(150);
  })());
  ok("a rich-text doc contributes its prose", (() => {
    const surface = answerSurface({
      version: 1, text: "", graph: null, geometry: null, statistics: null, data_table: null,
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The mode is 1" }] }] },
    });
    return surface.text.includes("the mode is 1") && surface.numbers.includes(1);
  })());
}

// ---------------------------------------------------------------------------
console.log("\n13. Rubric normalisation is defensive");
// ---------------------------------------------------------------------------
{
  ok("a null rubric is rejected", normaliseRubric(null) === null);
  ok("a rubric with no parts is rejected", normaliseRubric({ version: 1, parts: [] }) === null);
  ok("a part with no marks is dropped", normaliseRubric({ version: 1, parts: [{ label: "a", rules: [] }] }) === null);
  ok("a valid rubric survives", normaliseRubric(R("c0700000-0000-4000-8000-000000001041")) !== null);
  ok("a question id resolves its built-in rubric",
    rubricForQuestion({ id: "c0700000-0000-4000-8000-000000001041" }) !== null);
  ok("an unknown id resolves to nothing", rubricForQuestion({ id: "00000000-0000-0000-0000-000000000000" }) === null);
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures} checks passed` +
  (failures ? `, ${failures} failed` : ""));
process.exit(failures === 0 ? 0 : 1);
