// test-exam-rendering-fixes.mjs
// Verifies student-facing mathematical and visual rendering fixes for MYP4 and MYP5 Version C examinations.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const outDir = "/tmp/evalora-rendering-test";
execSync(
  `npx tsc src/lib/mathRender.ts src/lib/content.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --strict --esModuleInterop --skipLibCheck --moduleResolution node`,
  { stdio: "pipe" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "pipe" });

const require = createRequire(import.meta.url);
const { renderMathAndFormatting, isCorruptedProseMath, docHasCorruptedMath } = require(`${outDir}/lib/mathRender.js`);
const { renderLatex } = require(`${outDir}/lib/content.js`);

function extractJsonArray(sql, marker, endMarker) {
  const start = sql.indexOf(marker);
  if (start === -1) return [];
  const jsonStart = start + marker.length;
  const jsonEnd = sql.indexOf(endMarker, jsonStart);
  if (jsonEnd === -1) return [];
  return JSON.parse(sql.slice(jsonStart, jsonEnd));
}

const myp4Sql = readFileSync("supabase/migrations/20261118054730_myp4_grade9_statistics_version_c.sql", "utf8");
const myp5Sql = readFileSync("supabase/migrations/20261118054739_myp5_grade10_sequences_version_c.sql", "utf8");

const myp4 = extractJsonArray(myp4Sql, "from jsonb_array_elements('", "'::jsonb) as x");
const myp5 = extractJsonArray(myp5Sql, "from jsonb_array_elements('", "'::jsonb) as x");

let checks = 0;
function pass(msg) {
  console.log(`  ✓ ${msg}`);
  checks++;
}

function assert(condition, msg) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
}

// 1. Check KaTeX LaTeX delimiter handling
const inlineDelim = renderMathAndFormatting("The value of \\(x + 1\\) and $y - 2$ are equal.");
assert(inlineDelim.includes("katex") && !inlineDelim.includes("\\(") && !inlineDelim.includes("$"), "renders \\(...\\) and $...$ via KaTeX");
pass("LaTeX inline math delimiters \\(...\\) and $...$ render properly via KaTeX");

const displayDelim = renderMathAndFormatting("Given the equation: \\[ S_n = \\frac{n}{2}(2a + (n-1)d) \\] and $$u_n = 2n$$");
assert(displayDelim.includes("katex-display") && !displayDelim.includes("\\[") && !displayDelim.includes("$$"), "renders \\[...\\] and $$...$$ via KaTeX display mode");
pass("LaTeX display math delimiters \\[...\\] and $$...$$ render properly via KaTeX displayMode");

// 2. Check raw LaTeX commands outside delimiters
const rawLatex = renderMathAndFormatting("Find \\mu and \\sigma, and compute \\frac{1}{2} + \\sqrt{15}. Also \\Delta_n and \\le.");
assert(rawLatex.includes("class=\"katex\""), "renders raw LaTeX commands via KaTeX");
pass("Raw LaTeX commands (fractions, square roots, Greek letters, inequalities) render via KaTeX");

// 3. Check markdown asterisks cleanup vs multiplication symbol preservation
const multText = "Using the 1.5 * IQR criterion, or 2 * 3 = 6, and formula 64*(3/4)^(x-1).";
const renderedMult = renderMathAndFormatting(multText);
assert(renderedMult.includes("1.5 * IQR") && renderedMult.includes("2 * 3 = 6") && renderedMult.includes("64*(3/4)^(x-1)"), "preserves legitimate mathematical multiplication asterisks");
pass("Legitimate mathematical multiplication symbols (*) are strictly preserved");

const artifactText = "Text with *** divider and **[2 marks]** and **Question 1** and ***.";
const renderedArtifacts = renderMathAndFormatting(artifactText);
assert(!renderedArtifacts.includes("***") && !renderedArtifacts.includes("**") && renderedArtifacts.includes("<strong>Question 1</strong>"), "removes unwanted formatting artifacts and renders bold");
pass("Unwanted literal asterisks and formatting artifacts (***, **) are cleanly removed/converted to bold");

// 4. Check discreet question marks presentation
const markText = "Find the sum [10 marks] and the difference **[2 marks]** and subpart [3] and single [1].";
const renderedMarks = renderMathAndFormatting(markText);
assert(!renderedMarks.includes("[10 marks]") && !renderedMarks.includes("**[2 marks]**") && !renderedMarks.includes("[3]"), "replaces bracketed marks");
assert(renderedMarks.includes("(10 marks)") && renderedMarks.includes("(2 marks)") && renderedMarks.includes("(3 marks)") && renderedMarks.includes("(1 mark)"), "presents marks as (X marks)");
assert(renderedMarks.includes("exam-mark-discreet"), "marks carry discreet styling class");
pass("Question marks are cleanly and discreetly presented as (X marks)");

// 5. Check MYP5 Q14 currency and math separation
const q14 = myp5.find((q) => q.n === 14);
assert(q14, "MYP5 Q14 exists");
assert(docHasCorruptedMath(q14.d), "detects corrupted math in MYP5 Q14 prompt_doc");
const renderedQ14 = renderMathAndFormatting(q14.p);
assert(renderedQ14.includes("$25 000"), "preserves $25 000 currency amount");
assert(renderedQ14.includes("class=\"katex\""), "renders V_n and V_4 formulas in KaTeX");
assert(renderedQ14.includes("<strong>Find</strong>"), "renders bold command word");
assert(renderedQ14.includes("(2 marks)"), "renders discreet marks for Q14");
pass("MYP5 Q14 currency and formula separation renders accurately without KaTeX corruption");

// 6. Check all 34 questions of MYP4 Grade 9 Version C
for (const q of myp4) {
  const rendered = renderMathAndFormatting(q.p);
  assert(!rendered.includes("**"), `MYP4 Q${q.n} contains no raw ** asterisks`);
  assert(!rendered.includes("***"), `MYP4 Q${q.n} contains no raw *** artifacts`);
}
pass("All 34 questions in MYP4 Grade 9 Version C render free of raw asterisks and markdown artifacts");

// 7. Check all 34 questions of MYP5 Grade 10 Version C
for (const q of myp5) {
  const rendered = renderMathAndFormatting(q.p);
  assert(!rendered.includes("**"), `MYP5 Q${q.n} contains no raw ** asterisks`);
  assert(!rendered.includes("***"), `MYP5 Q${q.n} contains no raw *** artifacts`);
}
pass("All 34 questions in MYP5 Grade 10 Version C render free of raw asterisks and markdown artifacts");

// 8. Verify renderLatex safely handles pre-delimited LaTeX strings
assert(renderLatex("$t$", false).includes("katex"), "renderLatex safely strips leading/trailing $");
assert(renderLatex("\\(x\\)", false).includes("katex"), "renderLatex safely strips leading/trailing \\(");
pass("renderLatex safely strips accidental enclosing delimiters without throwing KaTeX errors");

console.log(`\nAll ${checks} exam rendering fix checks passed.`);
process.exit(0);
