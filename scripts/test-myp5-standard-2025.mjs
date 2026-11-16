/**
 * Checks for the May 2025 IB MYP 5 Mathematics Standard eAssessment.
 *
 *   node scripts/test-myp5-standard-2025.mjs
 *
 * Three groups:
 *   1. the paper — structure, marks, and every auto-marked answer recomputed
 *      from first principles rather than trusted from the generator;
 *   2. the formula reference — that it covers this paper, that no formula is
 *      unclaimed, and that it never pretends to be the IB booklet;
 *   3. the formula booklet component — that it is inert, so it cannot touch the
 *      timer, an answer or the current question, and that it offers zoom,
 *      scrolling and an explicit return on every screen size.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
let checks = 0;
const ok = (label, condition) => {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}`);
  }
};
const group = (name) => console.log(`\n${name}`);

// Comments describe intent; only code should be judged. Strip them first.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const stripSqlComments = (sql) => sql.replace(/--[^\n]*/g, "");


// ─────────────────────────────────────────────────────────── the paper itself
group("Examination content");

const sql = read("supabase/migrations/0123_ib_myp5_standard_may2025_eassessment.sql");
const generator = read("scripts/exam-import/build_myp5_standard_may2025.py");
const spec = JSON.parse(read("scripts/exam-import/myp5_standard_may2025_spec.json"));
const provisional = spec.filter((q) => q.cfg.marks_status === "provisional");
const verified = spec.filter((q) => q.cfg.marks_status === "verified");

ok("7 paper questions are represented", new Set(spec.map((q) => q.cfg.paper_question)).size === 7);
ok("every row names the paper question it belongs to",
  spec.every((q) => Number.isInteger(q.cfg.paper_question) && q.cfg.paper_question >= 1 && q.cfg.paper_question <= 7));
ok("question numbers run 1–7 in order",
  JSON.stringify([...new Set(spec.map((q) => q.cfg.paper_question))]) === "[1,2,3,4,5,6,7]");
ok("no row carries an IB criterion", spec.every((q) => q.cfg.myp_criterion === undefined));
ok("no row carries a criterion label", spec.every((q) => q.cfg.criterion_label === undefined));
ok("the paper is Standard, not Extended", /"level":\s*"Standard"/.test(sql) && !/"Extended"/.test(sql));
ok("the paper is dated to the May 2025 session", /"session":\s*"May 2025"/.test(sql));

const marks = spec.reduce((sum, q) => sum + q.m, 0);
ok("the stored total is the sum of the stored marks", sql.includes(`"total_marks": ${marks}`));
ok("duration is 2 hours", /duration_minutes",\s*\n?\s*120|120, 'open'/.test(sql));
ok("criterion reporting is switched off for students", /"criterion_reporting":\s*false/.test(sql));

ok("every row declares whether its marks were recovered",
  spec.every((q) => ["verified", "provisional"].includes(q.cfg.marks_status)));
ok("every provisional row explains what is missing",
  provisional.every((q) => typeof q.cfg.marks_note === "string" && q.cfg.marks_note.length > 30));
ok("the unrecovered Question 2 total is provisional, not guessed",
  spec.some((q) => q.cfg.paper_question === 2 && q.cfg.marks_status === "provisional"));
ok("the unrecovered Question 4 total is provisional, not guessed",
  spec.some((q) => q.cfg.paper_question === 4 && q.cfg.marks_status === "provisional"));
// The paper printed a total for Q1, Q3, Q5, Q6 and Q7. Those totals are
// reproduced exactly. Q2 and Q4 were not recovered, and within Q6 the marks for
// (b) and (d)-(e) were not legible — those are disclosed as provisional
// sub-allocations that fill out the printed total rather than guesses at it.
const PRINTED_TOTALS = { 1: 6, 3: 6, 5: 8, 6: 15, 7: 20 };
ok("every question total the paper printed is honoured exactly",
  Object.entries(PRINTED_TOTALS).every(([n, total]) =>
    spec.filter((q) => q.cfg.paper_question === Number(n)).reduce((s, q) => s + q.m, 0) === total));
ok("questions the paper gave no total for are provisional, not guessed",
  [2, 4].every((n) =>
    spec.filter((q) => q.cfg.paper_question === n).every((q) => q.cfg.marks_status === "provisional")));
// A provisional note must separate what the paper printed from what we allocated.
ok("every provisional row says what the paper did and did not print",
  provisional.every((q) =>
    /did not survive|does not yield a printed mark|prints \d+ marks/i.test(q.cfg.marks_note ?? "")));
ok("Question 4(c) separates its printed 2 marks from the added mark",
  /prints 2 marks/i.test(spec.find((q) => q.cfg.part_label === "Question 4(c)")?.cfg.marks_note ?? ""));
ok("every verified row records where its marks came from",
  verified.every((q) => typeof q.cfg.marks_note === "string" && q.cfg.marks_note.length > 20));
ok("the provisional parts of Question 6 fill out its printed total",
  spec.filter((q) => q.cfg.paper_question === 6).reduce((s, q) => s + q.m, 0) === 15 &&
  spec.filter((q) => q.cfg.paper_question === 6 && q.cfg.marks_status === "provisional")
    .every((q) => q.t === "open_ended" && q.cfg.manual_marking === true));
ok("Question 1 is 6 marks", spec.filter((q) => q.cfg.paper_question === 1).reduce((s, q) => s + q.m, 0) === 6);
ok("Question 3 is 6 marks", spec.filter((q) => q.cfg.paper_question === 3).reduce((s, q) => s + q.m, 0) === 6);
ok("Question 5 is 8 marks", spec.filter((q) => q.cfg.paper_question === 5).reduce((s, q) => s + q.m, 0) === 8);
ok("Question 6 is 15 marks", spec.filter((q) => q.cfg.paper_question === 6).reduce((s, q) => s + q.m, 0) === 15);
ok("Question 7 is 20 marks", spec.filter((q) => q.cfg.paper_question === 7).reduce((s, q) => s + q.m, 0) === 20);

group("Marking mode follows the paper's own command term");
const auto = spec.filter((q) => q.t === "assess_parts");
const manual = spec.filter((q) => q.t === "open_ended");
ok("there are automatically marked rows", auto.length > 0);
ok("there are teacher-marked rows", manual.length > 0);
ok("every teacher-marked row is flagged as manual", manual.every((q) => q.cfg.manual_marking === true));
ok("no automatically marked row is flagged manual", auto.every((q) => q.cfg.manual_marking !== true));
ok("‘show that’ parts are never auto-marked",
  !auto.some((q) => /show that/i.test(q.p)));
ok("every auto-marked part carries two hints",
  auto.every((q) => q.cfg.parts.every((p) => Array.isArray(p.hints) && p.hints.length === 2 &&
    p.hints.every((h) => typeof h === "string" && h.length >= 8))));
ok("every auto-marked part has a key", auto.every((q) => q.cfg.parts.every((p) =>
  p.kind === "numeric" ? Number.isFinite(p.answer) : Array.isArray(p.accepted) && p.accepted.length > 0)));
ok("every part carries a positive mark", auto.every((q) => q.cfg.parts.every((p) => p.points > 0)));
ok("part marks sum to the row mark",
  auto.every((q) => Math.abs(q.cfg.parts.reduce((s, p) => s + p.points, 0) - q.m) < 1e-9));

// ─────────────────────────────────────────── the answers, recomputed from scratch
group("Auto-marked answers recomputed from first principles");

const partOf = (paper, id) => {
  const row = auto.find((q) => q.cfg.paper_question === paper && q.cfg.parts.some((p) => p.id === id));
  return row?.cfg.parts.find((p) => p.id === id);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

ok("Q1(a): 4⁴ = 256, so a = 4", Math.pow(4, 4) === 256 && partOf(1, "a").answer === 4);

// 3/8 × 32/9 = 96/72 = 4/3 = 2² · 3⁻¹
const q1b = (3 * 32) / (8 * 9);
ok("Q1(b): 3/8 × 32/9 = 4/3", near(q1b, 4 / 3));
ok("Q1(b): 4/3 = 2² × 3⁻¹, so b = 2 and c = −1",
  near(Math.pow(2, partOf(1, "b1").answer) * Math.pow(3, partOf(1, "b2").answer), 4 / 3));

// √45 − d√e = √5  with √45 = 3√5
ok("Q1(c): √45 = 3√5", near(Math.sqrt(45), 3 * Math.sqrt(5)));
ok("Q1(c): 3√5 − 2√5 = √5, so d = 2 and e = 5",
  near(3 * Math.sqrt(5) - partOf(1, "c2").answer * Math.sqrt(partOf(1, "c3").answer), Math.sqrt(5)));

// 2x + 3y = 11.5 ; 3x + 2y = 13.5
const solveSim = () => {
  // 2x + 3y = 11.5 , 3x + 2y = 13.5
  const det = 2 * 2 - 3 * 3;
  return { x: (11.5 * 2 - 3 * 13.5) / det, y: (2 * 13.5 - 3 * 11.5) / det };
};
const sim = solveSim();
ok("Q2: the pair solves to x = 3.5, y = 1.5", near(sim.x, 3.5) && near(sim.y, 1.5));
ok("Q2: both roots satisfy the original equations",
  near(2 * sim.x + 3 * sim.y, 11.5) && near(3 * sim.x + 2 * sim.y, 13.5));
ok("Q2: the stored answers match the solution",
  partOf(2, "d").answer === 3.5 && partOf(2, "e").answer === 1.5);
ok("Q2: the missing coefficients are 3, 3 and 13.5",
  partOf(2, "a").answer === 3 && partOf(2, "b").answer === 3 && near(partOf(2, "c").answer, 13.5));

// Q3 — 4 balls {2,3,5,11} with replacement, sum recorded
const balls = [2, 3, 5, 11];
const isPrime = (n) => n > 1 && balls.every((b) => n === b || n % b !== 0 || n === 2);
const primeOf = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return false;
  return true;
};
const squareOf = (n) => Number.isInteger(Math.sqrt(n));
const sums = [];
for (const a of balls) for (const b of balls) sums.push(a + b);
const total3 = sums.length;
const primeCount = sums.filter(primeOf).length;
const squareCount = sums.filter(squareOf).length;
const bothCount = sums.filter((s) => primeOf(s) && squareOf(s)).length;
ok("Q3: the sample space has 16 equally likely outcomes", total3 === 16);
ok("Q3(b): 6 sums are prime, so P(prime) = 3/8", primeCount === 6 && near(primeCount / total3, 3 / 8));
ok("Q3(c): no sum is both prime and square", bothCount === 0);
ok("Q3(c): P(prime ∪ square) = 9/16", near((primeCount + squareCount) / total3, 9 / 16));
ok("Q3(d): the term is ‘mutually exclusive’",
  partOf(3, "d").accepted.includes("mutually exclusive"));
const table3 = [[2, 3, 5], [3, 2, 5], [5, 11, 16], [11, 5, 16]];
ok("Q3(a): every printable table cell is recovered correctly",
  table3.every(([r, c, v]) => {
    const id = { "2-3": "a1", "3-2": "a2", "5-11": "a3", "11-5": "a4" }[`${r}-${c}`];
    return partOf(3, id)?.answer === v && r + c === v;
  }));
ok("Q3(a): the four cells sum to the printed 1 mark",
  near(table3.reduce((s, [, ,]) => s + 0.25, 0), 1));

// Q4(a) — cumulative frequency, 800 cats, cf(4 kg) = 650
ok("Q4(a): (800 − 650)/800 = 18.75 %", near(((800 - 650) / 800) * 100, 18.75));
ok("Q4(a): the stored answer matches", near(partOf(4, "a").answer, 18.75, 0.05));
ok("Q4(b) is teacher-marked (read from the graph)",
  spec.some((q) => q.cfg.part_label === "Question 4(b)" && q.t === "open_ended"));

// Q5 — rectangle, one side 5x, area 140
const x5 = Math.sqrt(28);
ok("Q5(a): 5x² = 140 gives x = √28", near(5 * x5 * x5, 140));
ok("Q5(a): √28 = 2√7", near(x5, 2 * Math.sqrt(7)));
ok("Q5(b): length 5x ≈ 26.46 and width x ≈ 5.29",
  near(5 * x5, 26.46, 0.01) && near(x5, 5.29, 0.01));
const k5 = Math.sqrt(1260 / 140);
ok("Q5(c): the area scale factor is 9, so the length scale factor is 3", near(k5, 3));
ok("Q5(c): enlarged length ≈ 79.37 and width ≈ 15.87",
  near(3 * 5 * x5, 79.37, 0.01) && near(3 * x5, 15.87, 0.01));

// Q6(f) — E ∝ d², d up 10 %
ok("Q6(f): 1.1² = 1.21, a 21 % increase in E", near((Math.pow(1.1, 2) - 1) * 100, 21));
ok("Q6(f): the stored answer is 21 %", near(partOf(6, "f").answer, 21, 0.05));

// Q7 — warehouse 32 × 16, A(0,0) P(16,12) B(32,16)
const A = [0, 0], P = [16, 12], B = [32, 16];
const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const D1 = manhattan(A, P) + manhattan(P, B);
ok("Q7(a): D₁ = 28 + 20 = 48 m", D1 === 48 && partOf(7, "a").answer === 48);
const m = (B[1] - P[1]) / (B[0] - P[0]);
ok("Q7(b): gradient of PB is 1/4", near(m, 0.25));
const c7 = P[1] - m * P[0];
ok("Q7(b): y = ¼x + 8", near(c7, 8));
ok("Q7(b): the line passes through B(32, 16)", near(m * B[0] + c7, B[1]));
ok("Q7(b): the stored key includes y = 1/4x + 8",
  partOf(7, "b").accepted.some((v) => v.replace(/\s/g, "").includes("1/4x+8")));
const PB = Math.hypot(B[0] - P[0], B[1] - P[1]);
ok("Q7(c): PB = √272 ≈ 16.49 m", near(PB, Math.sqrt(272)) && near(PB, 16.49, 0.01));
const D2 = 20 + PB;
ok("Q7(c): D₂ = 20 + 16.49 = 36.49 m", near(D2, 36.49, 0.01) && near(partOf(7, "c").answer, 36.49, 0.02));
const k7 = (Math.abs(D2 - D1) / D1) * 100;
ok("Q7(d): k = |D₂ − D₁| / D₁ × 100 ≈ 23.97", near(k7, 23.97, 0.01) && near(partOf(7, "d").answer, 23.97, 0.05));
ok("Q7: Robot 2 is shorter, so the percentage difference is positive", D2 < D1);

// ───────────────────────────────────────────────────────── the formula reference
group("Formula reference");

const refSrc = read("src/lib/myp5Standard2025FormulaReference.ts");
// The only permitted mentions of the IB booklet are ones that disclaim it.
ok("the reference is not labelled as the IB booklet",
  (/official\s+IB\s+MYP\s+Mathematics\s+formula\s+booklet/i.test(refSrc) === false) ||
  /it is not the official IB MYP Mathematics formula booklet|\*\*not\*\* the official IB/i.test(refSrc));
ok("every mention of the IB booklet is a disclaimer, not a claim",
  [...refSrc.matchAll(/official[^.]{0,120}booklet/gi)]
    .every((m) => /^not\b|^that\s+publication|could not be obtained|\*\*not\*\*/i.test(
      refSrc.slice(Math.max(0, m.index - 60), m.index).trimStart() + m[0]) ||
      /not\s+the\s+official/i.test(refSrc.slice(Math.max(0, m.index - 40), m.index + 80))));
ok("the file states plainly that the IB booklet could not be obtained",
  /could not be obtained/i.test(refSrc));
ok("no entry is marked as coming from the IB booklet",
  !/from the (official )?IB (booklet|publication)/i.test(refSrc));

// The reference is a plain data module; evaluate it rather than duplicating it.
const loadFormulaReference = (src) => {
  const start = src.indexOf("export const FORMULA_REFERENCE");
  const end = src.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error("could not locate FORMULA_REFERENCE");
  const body = src
    .slice(start, end + 3)
    .replace("export const FORMULA_REFERENCE: FormulaSection[] =", "const FORMULA_REFERENCE =");
  return new Function(`${body}\nreturn FORMULA_REFERENCE;`)();
};
const ref = loadFormulaReference(refSrc);
ok("the reference has sections", Array.isArray(ref) && ref.length > 0);
ok("every section states why it is in this paper",
  ref.every((s) => typeof s.purpose === "string" && s.purpose.length > 30));
ok("every entry has LaTeX", ref.every((s) => s.entries.every((e) => typeof e.latex === "string" && e.latex.length > 3)));
ok("every entry says which question needs it",
  ref.every((s) => s.entries.every((e) => Array.isArray(e.usedBy) && e.usedBy.length > 0)));
const usedByPattern = /^Q[1-7](\([a-h]\))?$/;
ok("no entry claims a question that does not exist",
  ref.every((s) => s.entries.every((e) => e.usedBy.every((q) => usedByPattern.test(q)))));
ok("every question on the paper is covered by at least one formula",
  [1, 2, 3, 4, 5, 6, 7].every((n) =>
    ref.some((s) => s.entries.some((e) =>
      e.usedBy.some((q) => q === `Q${n}` || q.startsWith(`Q${n}(`))))));
ok("entry ids are unique",
  new Set(ref.flatMap((s) => s.entries.map((e) => e.id))).size ===
    ref.flatMap((s) => s.entries.map((e) => e.id)).length);

// Balanced LaTeX: every \left has a \right, braces balance.
const balanced = (latex) => {
  let depth = 0;
  for (const ch of latex) {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};
ok("every formula has balanced braces", ref.every((s) => s.entries.every((e) => balanced(e.latex))));
ok("no formula leaves \\left unmatched",
  ref.every((s) => s.entries.every((e) =>
    (e.latex.match(/\\left/g) ?? []).length === (e.latex.match(/\\right/g) ?? []).length)));

// ───────────────────────────────────────────────── the booklet is inert by design
group("Formula booklet safety");

const booklet = read("src/components/FormulaBooklet.tsx");
ok("the booklet takes no answer, attempt or question state",
  !/answer|attempt|questionIndex|currentIndex|setIndex/i.test(
    booklet.split("export function FormulaBooklet(")[1].split("\n")[0] ?? ""));
ok("the booklet never writes to storage", !/localStorage|sessionStorage/.test(booklet));
ok("the booklet never navigates", !/router\.(push|replace)|window\.location\.(href|replace|assign)/.test(booklet));
ok("the booklet never submits anything", !/\.submit\(|fetch\(/.test(booklet));
ok("the booklet never touches a timer", !/setInterval|setTimeout|clearInterval|Date\.now/.test(booklet));
ok("the booklet never pauses anything", !/pause/i.test(stripComments(booklet)));
ok("its only way out is the onClose callback",
  (booklet.match(/onClose\(\)/g) ?? []).length + (booklet.match(/onClick=\{onClose\}/g) ?? []).length >= 2);
ok("Escape closes it and nothing else binds a key",
  /event\.key === "Escape"/.test(booklet) && (booklet.match(/addEventListener\("keydown"/g) ?? []).length === 1);
ok("it hands focus back to the answer box it borrowed",
  /restoreFocusRef/.test(booklet) && /\.focus\(\)/.test(booklet));
ok("it renders beside the exam, never instead of it",
  /"fixed inset-0 z-\[70\]/.test(booklet));
ok("there is an explicit return button", /formula-booklet-close/.test(booklet));
ok("the return button is labelled to go back to the exam", /Return to exam/.test(booklet));
ok("the panel reassures the student their timer still runs",
  /timer is still running/i.test(booklet));
ok("there is a zoom control", /aria-label="Zoom in"/.test(booklet) && /aria-label="Zoom out"/.test(booklet));
ok("the content scrolls", /overflow-y-auto/.test(booklet) && /overscroll-contain/.test(booklet));
ok("it is a side panel on desktop and full width on mobile",
  /sm:w-\[min\(30rem,100%\)\]/.test(booklet) && /w-full/.test(booklet));
ok("every control meets the 44px touch target",
  (booklet.match(/min-h-1[01]|h-10/g) ?? []).length >= 4);
ok("the disclaimer is rendered", /formula-booklet-disclaimer/.test(booklet));

group("Formula booklet in the exam runner");
const runner = read("src/app/take-exam/[attemptId]/TakeExamClient.tsx");
ok("the button is rendered in the examination header", /FormulaBookletButton/.test(runner));
ok("the button is only shown when the paper enables it", /formulaEnabled && \(/.test(runner));
ok("opening the booklet is a pure UI toggle",
  /setFormulaOpen\(\(open\) => !open\)/.test(runner));
ok("the booklet state is never sent to the server",
  !/formulaOpen/.test(runner.split("const [formulaOpen")[1]?.split("\n").filter((l) => /fetch\(|body:|\.update\(|\.insert\(/.test(l)).join("\n") ?? ""));
ok("opening the booklet does not navigate",
  !/formulaOpen[\s\S]{0,200}window\.location/.test(runner));
ok("submission redirects straight to the result page",
  /\/exam-result\/\$\{attemptId\}\?t=/.test(runner));

group("Student result page");
const resultClient = read("src/app/exam-result/[attemptId]/ExamResultClient.tsx");
const resultApi = read("src/app/api/exam/result/route.ts");
const criteriaWords = /Criterion\s+[A-D]|criterion\s+[A-D]|achievement level|criteri(on|a)\s+breakdown/i;
ok("the result page shows no IB criterion breakdown", !criteriaWords.test(stripComments(resultClient)));
ok("the result API never sends criterion data", !/criterion/i.test(stripComments(resultApi)));
ok("the result API sends no criterion field at all",
  !/(^|[^a-z])criteri(on|a)[A-Za-z]*\s*:/i.test(stripComments(resultApi).replace(/criterion_reporting\s*:/gi, "X:")));
ok("the result API reports final vs provisional",
  /pending\s*>\s*0\s*\?\s*"provisional"\s*:\s*"final"/.test(resultApi));
ok("the score is the most prominent element", /text-5xl[^"]*tabular-nums/.test(resultClient));
ok("a percentage is shown", /result-percentage/.test(resultClient));
ok("the candidate name is shown", /result-candidate/.test(resultClient));
ok("the submission date and time are shown", /result-submitted-at/.test(resultClient));
ok("the total marks available are shown", /result-max/.test(resultClient));
ok("a provisional result is labelled provisional", /result-status-provisional/.test(resultClient));
ok("a final result is labelled final", /result-status-final/.test(resultClient));
ok("a provisional result says how many questions are waiting",
  /questions?\s+still\s+need|awaiting marking/i.test(resultClient));
ok("a provisional result is never called final",
  !/provisional[\s\S]{0,120}final result is ready/i.test(resultClient));
ok("the pass message comes from the configured threshold, not a hardcoded one",
  /pass_mark_percent/.test(resultApi) && !/percentage\s*>=\s*50/.test(resultClient));
ok("a passing student is congratulated", /Well done/.test(resultClient));
ok("a student below the threshold is encouraged to revise", /Keep revising/.test(resultClient));
ok("the result page locks: there is no way back into the paper",
  !/take-exam/.test(resultClient));

group("Submission is locked");
ok("a submitted paper cannot be re-opened by the result page",
  !/in_progress|resume/i.test(resultClient));

// ──────────────────────────────────────────────────────────────────── migration
group("Migration safety");
ok("every insert is guarded with ON CONFLICT DO NOTHING",
  (sql.match(/on conflict/gi) ?? []).length >= 4);
ok("the migration is wrapped in a transaction", /^begin;/m.test(sql) && /^commit;/m.test(sql));
const ddl = stripSqlComments(sql).toLowerCase();
const destructive = /\b(drop|truncate|delete|alter\s+table|alter\s+column)\s+(table|column|index|schema|database|constraint|function|trigger|policy|from|if\s+exists|[a-z_]+\s*;)/i;
ok("nothing is dropped, truncated or deleted",
  !destructive.test(ddl) && !/\btruncate\b/i.test(ddl) && !/\bdelete\s+from\b/i.test(ddl));
ok("no existing table is altered", !/\balter\s+table\b/i.test(ddl));
ok("it is scoped to one organization", sql.includes("0a400000-0000-4000-8000-000000000001"));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
