/**
 * Examination-specific formula sheet: parser, storage and candidate wiring.
 *
 * The sheet must come from the examination being sat, validate against that
 * examination's id, and never be a grade lookup in the shared page. These
 * checks read the migration that stores the four sheets and the components
 * that render them.
 *
 * Run: node scripts/test-exam-formulas.mjs
 */
import { readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import katex from "katex";

const outDir = "/tmp/evalora-exam-formulas-test";
const built = path.join(outDir, "src/lib/examFormulas.js");
mkdirSync(path.dirname(built), { recursive: true });
const emitted = ts.transpileModule(readFileSync("src/lib/examFormulas.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
writeFileSync(built, emitted);
const require = createRequire(import.meta.url);
const { parseFormulaSheet } = require(built);

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

const EXAM_IDS = {
  MYP2: "c0700000-0000-4000-8000-000000000002",
  MYP3: "c0800000-0000-4000-8000-000000000002",
  MYP4: "c0900000-0000-4000-8000-000000000002",
  MYP5: "c0a00000-0000-4000-8000-000000000002",
};

/* ── Parser ─────────────────────────────────────────────────────────── */
const valid = {
  version: 1,
  exam_id: EXAM_IDS.MYP4,
  title: "Formulas for this paper",
  groups: [{ title: "Averages", items: [{ latex: "$\\bar{x} = \\dfrac{\\Sigma x}{n}$", note: "Mean." }] }],
};
const parsed = parseFormulaSheet(valid, EXAM_IDS.MYP4);
ok("a valid sheet is accepted", parsed && parsed.groups.length === 1);
ok("the stored exam id is the only one accepted", parseFormulaSheet(valid, EXAM_IDS.MYP3) === null);
ok("a sheet without an exam id is rejected", parseFormulaSheet({ ...valid, exam_id: undefined }, EXAM_IDS.MYP4) === null);
ok("an empty group list is rejected", parseFormulaSheet({ ...valid, groups: [] }, EXAM_IDS.MYP4) === null);
ok("an item without a formula is rejected",
  parseFormulaSheet({ ...valid, groups: [{ title: "A", items: [{ note: "no formula" }] }] }, EXAM_IDS.MYP4) === null);
ok("a note that is too long is rejected",
  parseFormulaSheet({ ...valid, groups: [{ title: "A", items: [{ latex: "x", note: "y".repeat(400) }] }] }, EXAM_IDS.MYP4) === null);
ok("control characters are removed from a note", (() => {
  const sheet = parseFormulaSheet({ ...valid, groups: [{ title: "A", items: [{ latex: "x", note: "a\nb\tc" }] }] }, EXAM_IDS.MYP4);
  return sheet.groups[0].items[0].note === "a b c";
})());
ok("one pair of dollar delimiters is stripped", parsed.groups[0].items[0].latex === "\\bar{x} = \\dfrac{\\Sigma x}{n}");
ok("a formula containing $ inside is left alone",
  parseFormulaSheet({ ...valid, groups: [{ title: "A", items: [{ latex: "$a$ and $b$" }] }] }, EXAM_IDS.MYP4)
    .groups[0].items[0].latex === "$a$ and $b$");

/* ── Stored sheets ──────────────────────────────────────────────────── */
const migration = [
  "supabase/migrations/20261116150000_summative_b_maths_corrections_myp2.sql",
  "supabase/migrations/20261116150001_summative_b_maths_corrections_myp3.sql",
  "supabase/migrations/20261116150002_summative_b_maths_corrections_myp4.sql",
  "supabase/migrations/20261116150003_summative_b_maths_corrections_myp5.sql",
].map((file) => readFileSync(file, "utf8")).join("\n");
const sheets = {};
for (const [label, id] of Object.entries(EXAM_IDS)) {
  const at = migration.indexOf(`"exam_id":"${id}"`);
  ok(`${label}: a formula sheet is stored for this examination`, at > 0);
  const start = migration.lastIndexOf("'{", at);
  const end = migration.indexOf("}'::jsonb", at);
  const json = migration.slice(start + 1, end + 1);
  const stored = JSON.parse(json);
  const sheet = parseFormulaSheet(stored, id);
  ok(`${label}: the stored sheet validates for its own examination`, !!sheet);
  ok(`${label}: the stored sheet does not validate for another examination`,
    parseFormulaSheet(stored, id === EXAM_IDS.MYP2 ? EXAM_IDS.MYP3 : EXAM_IDS.MYP2) === null);
  sheets[label] = { stored, sheet, text: JSON.stringify(stored) };
}

const titles = (label) => sheets[label].sheet.groups.map((g) => g.title).join(" | ");
ok("MYP2 sheet covers ratio, sets and probability",
  /Ratio/.test(titles("MYP2")) && /Sets/.test(titles("MYP2")) && /Probability/.test(titles("MYP2")));
ok("MYP3 sheet covers indices, surds, Pythagoras and trigonometry",
  /Indices/.test(titles("MYP3")) && /Surds/.test(titles("MYP3")) && /Pythagoras/.test(titles("MYP3")));
ok("MYP4 sheet covers averages, grouped data and spread",
  /Averages/.test(titles("MYP4")) && /Grouped/.test(titles("MYP4")) && /spread/.test(titles("MYP4")));
ok("MYP5 sheet covers arithmetic and geometric sequences",
  /Arithmetic/.test(titles("MYP5")) && /Geometric/.test(titles("MYP5")));

ok("MYP2 uses probability notation", /P\(E\)/.test(sheets.MYP2.text));
ok("MYP3 uses the trigonometric ratios", /\\tan/.test(sheets.MYP3.text) && /sin/.test(sheets.MYP3.text) && /cos/.test(sheets.MYP3.text));
ok("MYP4 uses the population standard deviation", /\\sigma/.test(sheets.MYP4.text));
ok("MYP5 uses the sequence term formula", /u_n = u_1/.test(sheets.MYP5.text));

ok("MYP2 does not show sequence formulas", !/u_n/.test(sheets.MYP2.text));
ok("MYP2 does not show statistics quartile formulas", !/IQR/.test(sheets.MYP2.text));
ok("MYP3 does not show statistics quartile formulas", !/IQR/.test(sheets.MYP3.text));
ok("MYP4 does not show sequence formulas", !/u_n/.test(sheets.MYP4.text));
ok("MYP5 does not show statistics quartile formulas", !/IQR/.test(sheets.MYP5.text));

const ANSWERS = ["34.5", "665", "207", "101", "194", "56", "43", "1.2 \\times 10^{12}"];
for (const [label, entry] of Object.entries(sheets)) {
  ok(`${label}: the sheet contains no keyed answer value`,
    ANSWERS.every((answer) => !entry.text.includes(answer)));
  ok(`${label}: every item has a short explanation of its symbols`,
    entry.sheet.groups.every((group) => group.items.every((item) => typeof item.note === "string" && item.note.length > 0)));
  ok(`${label}: every formula renders as valid mathematical notation`, entry.sheet.groups.every((group) =>
    group.items.every((item) => {
      try {
        katex.renderToString(item.latex, { throwOnError: true, displayMode: false });
        return true;
      } catch {
        return false;
      }
    })));
}

/* ── Candidate wiring ───────────────────────────────────────────────── */
const route = readFileSync("src/app/api/exam/state/route.ts", "utf8");
const client = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
const panel = readFileSync("src/app/take-exam/[attemptId]/FormulaPanel.tsx", "utf8");
ok("the state route validates the sheet against this examination id",
  /parseFormulaSheet\(settings\.formula_sheet, exam\.id\)/.test(route));
ok("the button is rendered only when the examination has a sheet",
  /exam\.formula_sheet && \(/.test(client) && /data-testid="formulas-button"/.test(client));
ok("the button toggles the same page state", /setFormulasOpen\(\(open\) => !open\)/.test(client));
ok("the panel is rendered beside the paper, not as a route", /<FormulaPanel sheet=\{exam\.formula_sheet\}/.test(client));
ok("the panel has an explicit close control", /data-testid="formula-close"/.test(panel) && /onClick=\{onClose\}/.test(panel));
ok("Escape closes the panel", /event\.key === "Escape"/.test(panel));
ok("the panel is a modal dialog with a label", /role="dialog"/.test(panel) && /aria-modal="true"/.test(panel));
ok("the shared page does not hardcode a grade's formulas",
  !/Sequences and Series|Statistics|Pythagoras/.test(client));
ok("opening the panel cannot submit, save or navigate",
  !/<form|onSubmit=|fetch\(|router\.|window\.location/.test(panel));

console.log(`\n${passed} formula-sheet checks passed`);
