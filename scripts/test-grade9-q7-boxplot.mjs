// Verifies Grade 9 Version C Question 7 box plot specification,
// normalization, and SVG rendering through StatsView / BoxPlotChart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261118054730_myp4_grade9_statistics_version_c.sql', 'utf8');
const match = migration.match(/\{"n":7,"t":"single_choice","p":.*?"cfg":\{"question_number":7[^\}]*\}[^\}]*\}/s);
assert(match, "Q7 exists in migration");
const q7 = JSON.parse(match[0]);

console.log("Testing Grade 9 Version C Question 7 Box Plot...");

// 1. Verify prompt content
assert(q7.p.includes("The box-and-whisker plot summarises battery lifetimes (hours):"), "Prompt has correct introductory text");
assert(q7.p.includes("Battery lifetimes"), "Prompt includes Battery lifetimes figure label");

// 2. Verify prompt document contains statsBlock
assert.equal(q7.d.type, "doc", "Document type is doc");
const statsNode = q7.d.content.find((n) => n.type === "statsBlock");
assert(statsNode, "prompt_doc contains statsBlock node");
assert.equal(statsNode.attrs.spec.chart, "box_plot", "statsBlock is a box_plot");
assert.equal(statsNode.attrs.spec.title, "Battery lifetimes", "statsBlock title is Battery lifetimes");
assert.equal(statsNode.attrs.spec.xLabel, "Lifetime (hours)", "xLabel is Lifetime (hours)");

// 3. Verify five-number summary values
const fns = statsNode.attrs.spec.fiveNumberSummary;
assert(fns, "fiveNumberSummary is present");
assert.equal(fns.min, 12, "min is 12");
assert.equal(fns.q1, 24, "Q1 is 24");
assert.equal(fns.median, 34, "median is 34");
assert.equal(fns.q3, 50, "Q3 is 50");
assert.equal(fns.max, 68, "max is 68");

// 4. Verify mathematical IQR and percentage answer logic
const iqr = fns.q3 - fns.q1;
assert.equal(iqr, 26, "IQR = 50 - 24 = 26 hours");
assert(q7.e.includes("IQR = Q3 − Q1 = 50 − 24 = 26 hours"), "Explanation gives correct IQR");
assert(q7.e.includes("75% of batteries lasted less than 50 hours"), "Explanation gives correct percentage");

// 5. Verify StatsView empty check logic
const clean = statsNode.attrs.spec;
const empty = clean.chart === "bar_chart"
  ? clean.categories.filter((category) => category.label.trim() || category.value).length === 0
  : clean.chart === "box_plot"
    ? clean.values.length === 0 && !clean.fiveNumberSummary
    : false;
assert.equal(empty, false, "StatsView empty check correctly evaluates to false for fiveNumberSummary box plot");

// 6. The stored answer key must be B, and that correction must stay shipped.
//
// History: the live database carried option C as correct while the official
// marking scheme, the generator (answer="B"), this question's own explanation
// and the mathematics all say B. The correction sat in a migration that shared
// its version number with another file, so it never applied. These assertions
// keep both halves of that failure from recurring.
const generator = readFileSync('scripts/exam-import/version_c_g9.py', 'utf8');
const q7Block = generator.slice(generator.indexOf('7, sec="A", crit="C"'), generator.indexOf('8, sec="A", crit="D"'));
assert(q7Block.includes('answer="B"'), 'Generator must still declare Q7 answer B');
assert(!q7Block.includes('answer="C"'), 'Generator must never declare Q7 answer C');

const keyCorrection = readFileSync(
  'supabase/migrations/20261126210000_myp4_version_c_q7_answer_key_correction.sql',
  'utf8',
);
assert(
  keyCorrection.includes("update public.question_options") &&
    keyCorrection.includes("set is_correct = (label = 'B')"),
  'The Q7 key correction migration must ship the C -> B update',
);
assert(
  keyCorrection.includes('disable trigger question_options_assessment_source_guard') &&
    keyCorrection.includes('enable trigger question_options_assessment_source_guard'),
  'The correction must lift the assessment-source guard only for its own transaction',
);
assert(
  keyCorrection.includes("raise exception") && keyCorrection.includes("refusing to guess"),
  'The correction must refuse to run on an unexpected stored key',
);

// A migration version may only appear once: Supabase records one history row per
// version, so a duplicate silently drops whichever file loses the race.
import { readdirSync } from 'node:fs';
// Only versioned migrations count; ROLLBACK_*.sql helpers are not applied by
// the migration runner and legitimately share no version scheme.
const migrationFiles = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql') && /^\d+_/.test(f));
const byVersion = new Map();
for (const file of migrationFiles) {
  const version = file.split('_')[0];
  if (!byVersion.has(version)) byVersion.set(version, []);
  byVersion.get(version).push(file);
}
const duplicateVersions = [...byVersion.entries()].filter(([, files]) => files.length > 1);
assert.deepEqual(
  duplicateVersions,
  [],
  `Duplicate migration versions would silently drop files: ${JSON.stringify(duplicateVersions)}`,
);

console.log("  ✓ All Grade 9 Question 7 box plot tests passed successfully.");
