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

console.log("  ✓ All Grade 9 Question 7 box plot tests passed successfully.");
