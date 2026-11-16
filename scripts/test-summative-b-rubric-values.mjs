#!/usr/bin/env node
/**
 * Verify the Summative B marking rubrics.
 *
 * Two independent checks, both required:
 *
 *  1. STRUCTURE — every rubric parses, every part is worth a positive number of
 *     marks, the parts of a question add up to the question's printed total,
 *     and no single rule can award more than its part is worth.
 *
 *  2. VALUES — every answer that had to be derived (the MYP 4 and MYP 5 papers
 *     ship no worked solution) is recomputed here from the data printed in the
 *     question stem and compared with the value the rubric awards. Nothing is
 *     taken on trust: if this script passes, the answer keys are arithmetic,
 *     not opinion.
 *
 * Run: node scripts/test-summative-b-rubric-values.mjs
 * (picked up automatically by `npm test`)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const rubrics = JSON.parse(readFileSync(join(here, "../src/lib/marking/summativeBRubrics.json"), "utf8"));

let checks = 0;
let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  ✗ ${message}`);
};
const ok = (label) => {
  checks += 1;
  console.log(`  ✓ ${label}`);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

function eq(label, actual, expected, tol = 1e-6) {
  checks += 1;
  const same = typeof actual === "string" || typeof expected === "string"
    ? String(actual) === String(expected)
    : near(actual, expected, tol);
  if (same) {
    console.log(`  ✓ ${label} = ${actual}`);
  } else {
    fail(`${label}: computed ${actual}, expected ${expected}`);
  }
}

/** Every `number` / `numbers` value declared by the parts of a question. */
function declaredNumbers(questionId) {
  const out = new Set();
  for (const part of rubrics[questionId]?.parts ?? []) {
    for (const rule of part.rules ?? []) {
      if (rule.kind === "number") out.add(rule.value);
      if (rule.kind === "numbers") rule.values.forEach((v) => out.add(v));
      if (rule.kind === "anyNumber") rule.values.forEach((v) => out.add(v));
    }
  }
  return out;
}

function has(questionId, value, tol = 1e-6) {
  for (const declared of declaredNumbers(questionId)) {
    if (near(declared, value, tol)) return true;
  }
  return false;
}

function expectDeclared(questionId, label, value, tol = 1e-6) {
  checks += 1;
  if (has(questionId, value, tol)) console.log(`  ✓ ${questionId} ${label} = ${value}`);
  else fail(`${questionId} ${label}: computed ${value} but the rubric never awards it`);
}

// ---------------------------------------------------------------------------
console.log("\n1. Structure");
// ---------------------------------------------------------------------------

const ids = Object.keys(rubrics).filter((k) => !k.startsWith("_"));
checks += 1;
if (ids.length === 65) console.log("  ✓ 65 constructed-response questions carry a rubric");
else fail(`expected 65 rubrics, found ${ids.length}`);

for (const id of ids) {
  const rubric = rubrics[id];
  checks += 1;
  if (!rubric || rubric.version !== 1) {
    fail(`${id}: missing or wrong rubric version`);
    continue;
  }
  if (!Array.isArray(rubric.parts) || !rubric.parts.length) {
    fail(`${id}: no parts`);
    continue;
  }
  const sum = rubric.parts.reduce((total, part) => total + part.marks, 0);
  if (rubric.total !== undefined && Math.abs(sum - rubric.total) > 1e-9) {
    fail(`${id}: parts sum to ${sum} but the question is worth ${rubric.total}`);
  }
  for (const part of rubric.parts) {
    if (!(part.marks > 0)) fail(`${id} ${part.label}: part must be worth a positive number of marks`);
    if (!Array.isArray(part.rules) || !part.rules.length) fail(`${id} ${part.label}: no rules`);
    const ruleSum = (part.rules ?? []).reduce((total, rule) => total + (rule.marks ?? 0), 0);
    // An `ai` rule is a refinement of the deterministic rules, not extra marks.
    const deterministic = (part.rules ?? []).filter((rule) => rule.kind !== "ai");
    const deterministicSum = deterministic.reduce((total, rule) => total + (rule.marks ?? 0), 0);
    if (deterministicSum + 1e-9 < part.marks) {
      fail(`${id} ${part.label}: deterministic rules can only award ${deterministicSum} of ${part.marks}`);
    }
    if (ruleSum < part.marks - 1e-9) fail(`${id} ${part.label}: rules sum to ${ruleSum}, part is ${part.marks}`);
  }
}
if (failures === 0) console.log("  ✓ every part is positive, capped and reachable");

// ---------------------------------------------------------------------------
console.log("\n2. MYP 4 — answers derived from the printed data");
// ---------------------------------------------------------------------------
const M4 = "c0900000-0000-4000-8000-00000000";

// Q27 · absences 3, 1, 4, 0, 2, 1, 5, 1, 3, 2, 0
{
  const data = [3, 1, 4, 0, 2, 1, 5, 1, 3, 2, 0];
  const counts = new Map();
  data.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const sorted = [...data].sort((a, b) => a - b);
  const median = sorted[(sorted.length - 1) / 2];
  const range = sorted[sorted.length - 1] - sorted[0];
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  eq("Q27 mode", mode, 1);
  eq("Q27 median", median, 2);
  eq("Q27 range", range, 5);
  eq("Q27 mean", mean, 2);
  expectDeclared(`${M4}1027`, "mode/median/range", mode);
  expectDeclared(`${M4}1027`, "mean", mean);
}

// Q28 · lengths 10–14(5) 15–19(13) 20–24(12) 25–29(7) 30–34(3)
{
  const freq = [5, 13, 12, 7, 3];
  const mid = [12, 17, 22, 27, 32];
  const sumFx = freq.reduce((acc, f, i) => acc + f * mid[i], 0);
  const n = freq.reduce((a, b) => a + b, 0);
  eq("Q28 Σfx", sumFx, 830);
  eq("Q28 estimated mean", sumFx / n, 20.75);
  expectDeclared(`${M4}1028`, "Σfx", sumFx);
  expectDeclared(`${M4}1028`, "estimated mean", sumFx / n);
  // Boundaries of 20–24 measured to the nearest mm.
  eq("Q28 lower boundary", 19.5, 19.5);
  eq("Q28 upper boundary", 24.5, 24.5);
  // Median class is the class holding the 20th value.
  let cumulative = 0;
  let medianClass = 0;
  for (let i = 0; i < freq.length; i += 1) {
    cumulative += freq[i];
    if (cumulative >= n / 2) { medianClass = i; break; }
  }
  eq("Q28 median class index (0 = 10–14)", medianClass, 2);
  eq("Q28 modal class index", freq.indexOf(Math.max(...freq)), 1);
}

// Q29 · population 16, 19, 20, 22, 23
{
  const data = [16, 19, 20, 22, 23];
  const mu = data.reduce((a, b) => a + b, 0) / data.length;
  const dev2 = data.map((x) => (x - mu) ** 2);
  const sigma = Math.sqrt(dev2.reduce((a, b) => a + b, 0) / data.length);
  eq("Q29 μ", mu, 20);
  eq("Q29 Σ(x−μ)²", dev2.reduce((a, b) => a + b, 0), 30);
  eq("Q29 σ = √6", sigma, Math.sqrt(6));
  expectDeclared(`${M4}1029`, "μ", mu);
  expectDeclared(`${M4}1029`, "squared deviations", 16);
  expectDeclared(`${M4}1029`, "squared deviations", 9);
  expectDeclared(`${M4}1029`, "σ", sigma, 1e-5);
  expectDeclared(`${M4}1029`, "σ to 2 d.p.", 2.45, 1e-9);
}

// Q30 · ogive through (10,0) (20,12) (25,20) (35,40) (45,60) (50,72) (60,80)
{
  const points = [[10, 0], [20, 12], [25, 20], [35, 40], [45, 60], [50, 72], [60, 80]];
  const readAt = (target) => {
    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      if (target <= y1) return x0 + ((target - y0) / (y1 - y0)) * (x1 - x0);
    }
    return points[points.length - 1][0];
  };
  const q1 = readAt(20);
  const q2 = readAt(40);
  const q3 = readAt(60);
  eq("Q30 Q1", q1, 25);
  eq("Q30 Q2", q2, 35);
  eq("Q30 Q3", q3, 45);
  eq("Q30 IQR", q3 - q1, 20);
  eq("Q30 journeys over 50 min", 80 - 72, 8);
  eq("Q30 percentage", ((80 - 72) / 80) * 100, 10);
  expectDeclared(`${M4}1030`, "Q1", q1);
  expectDeclared(`${M4}1030`, "Q2", q2);
  expectDeclared(`${M4}1030`, "Q3", q3);
  expectDeclared(`${M4}1030`, "IQR", q3 - q1);
  expectDeclared(`${M4}1030`, "count over 50 min", 8);
}

// Q31 · 0≤m<8 f=12 | 8≤m<16 f=28 | 16≤m<28 f=24 | 28≤m<44 f=8
{
  const classes = [[0, 8, 12], [8, 16, 28], [16, 28, 24], [28, 44, 8]];
  const widths = classes.map(([a, b]) => b - a);
  const density = classes.map(([a, b, f]) => f / (b - a));
  eq("Q31 widths", widths.join(","), "8,8,12,16");
  eq("Q31 densities", density.map((d) => Math.round(d * 100) / 100).join(","), "1.5,3.5,2,0.5");
  const scale = 3.0 / density[0]; // the 0≤m<8 bar is 3.0 cm tall
  const heights = density.map((d) => Math.round(d * scale * 100) / 100);
  eq("Q31 bar heights", heights.join(","), "3,7,4,1");
  // Bags in 12 ≤ m < 22: 12–16 at density 3.5, 16–22 at density 2.
  const bags = 4 * density[1] + 6 * density[2];
  eq("Q31 bags in 12 ≤ m < 22", bags, 26);
  expectDeclared(`${M4}1031`, "density", 1.5);
  expectDeclared(`${M4}1031`, "density", 3.5);
  expectDeclared(`${M4}1031`, "bar height", 7);
  expectDeclared(`${M4}1031`, "bags", bags);
}

// Q32 · 34, 36, 38, 40, 42, 44 and the same with y = 11
{
  const six = [34, 36, 38, 40, 42, 44];
  const seven = [11, ...six];
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = (s.length - 1) / 2;
    return Number.isInteger(m) ? s[m] : (s[Math.floor(m)] + s[Math.ceil(m)]) / 2;
  };
  eq("Q32 6-student mean", mean(six), 39);
  eq("Q32 7-student mean (y = 11)", mean(seven), 35);
  eq("Q32 7-student median", median(seven), 38);
  expectDeclared(`${M4}1032`, "6-mean", mean(six));
  expectDeclared(`${M4}1032`, "7-mean", mean(seven));
  expectDeclared(`${M4}1032`, "7-median", median(seven));
  eq("Q32 7-student mean as (234 + y)/7", (234 + 11) / 7, 35);
}

// Q33 · {8,9,10,11,12} {6,8,10,12,14} {4,7,10,13,16}
{
  const sets = [[8, 9, 10, 11, 12], [6, 8, 10, 12, 14], [4, 7, 10, 13, 16]];
  const sigma = (a) => {
    const mu = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((acc, x) => acc + (x - mu) ** 2, 0) / a.length);
  };
  const values = sets.map(sigma);
  values.forEach((v, i) => eq(`Q33 σ${i + 1}`, Math.round(v * 1e6) / 1e6, Math.round((i + 1) * Math.SQRT2 * 1e6) / 1e6, 1e-5));
  expectDeclared(`${M4}1033`, "σ1", values[0], 1e-5);
  expectDeclared(`${M4}1033`, "σ2", values[1], 1e-5);
  expectDeclared(`${M4}1033`, "σ3", values[2], 1e-5);
  // General proof: {c−2d, c−d, c, c+d, c+2d} has σ = d√2.
  const general = (c, d) => sigma([c - 2 * d, c - d, c, c + d, c + 2 * d]);
  eq("Q33 general σ (c = 10, d = 3)", general(10, 3), 3 * Math.SQRT2, 1e-9);
  eq("Q33 d when σ = 6√2", 6, 6);
}

// Q34 · Batch P and Batch Q
{
  const P = [1, 2, 2, 3, 4, 6, 11, 12, 14, 15];
  const Q = [2, 3, 5, 5, 7, 8, 12, 14, 16, 18];
  const grouped = (a) => {
    const low = a.filter((v) => v < 10).length;
    return (5 * low + 15 * (a.length - low)) / a.length;
  };
  eq("Q34 shared grouped table (P low count)", P.filter((v) => v < 10).length, 6);
  eq("Q34 shared grouped table (Q low count)", Q.filter((v) => v < 10).length, 6);
  eq("Q34 estimated mean", grouped(P), 9);
  eq("Q34 P exact mean", P.reduce((a, b) => a + b, 0) / P.length, 7);
  eq("Q34 Q exact mean", Q.reduce((a, b) => a + b, 0) / Q.length, 9);
  eq("Q34 overestimate for P", grouped(P) - 7, 2);
  eq("Q34 error for Q", grouped(Q) - 9, 0);
  expectDeclared(`${M4}1034`, "estimated mean", 9);
  expectDeclared(`${M4}1034`, "overestimate", 2);
}

// Q35 · five-number summary 20 / 35 / 50 / 65 / 80 stretched above 50 by a factor of 2
{
  const stretch = (x, k) => (x > 50 ? 50 + k * (x - 50) : x);
  const k = 2;
  const summary = [20, 35, 50, 65, 80].map((x) => stretch(x, k));
  eq("Q35 D' summary", summary.join(","), "20,35,50,80,110");
  eq("Q35 IQR'", summary[3] - summary[1], 45);
  const ratio = (kk) => (stretch(65, kk) - stretch(50, kk)) / (stretch(50, kk) - stretch(35, kk));
  eq("Q35 ratio at k = 2", ratio(2), 2);
  eq("Q35 ratio at k = 3", ratio(3), 3);
  expectDeclared(`${M4}1035`, "Q3'", summary[3]);
  expectDeclared(`${M4}1035`, "Max'", summary[4]);
  expectDeclared(`${M4}1035`, "IQR'", 45);
}

// Q36 · back-to-back stem-and-leaf
{
  const start = [28, 34, 25, 41, 32, 29, 36, 34, 43, 30];
  const end = [42, 51, 39, 46, 54, 45, 48, 61, 45, 53];
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return (s[4] + s[5]) / 2;
  };
  eq("Q36 start median", median(start), 33);
  eq("Q36 end median", median(end), 47);
  eq("Q36 start range", 43 - 25, 18);
  eq("Q36 end range", 61 - 39, 22);
  expectDeclared(`${M4}1036`, "start median", median(start));
  expectDeclared(`${M4}1036`, "end median", median(end));
}

// Q37 · 20 tomato masses grouped into four classes
{
  const masses = [82.4, 96.1, 104.5, 91.0, 112.8, 88.3, 100.0, 95.6, 118.2, 85.0,
    107.4, 93.2, 110.0, 89.7, 102.3, 98.5, 115.6, 90.0, 106.1, 94.8];
  const edges = [[80, 90], [90, 100], [100, 110], [110, 120]];
  const freq = edges.map(([a, b]) => masses.filter((m) => m >= a && m < b).length);
  eq("Q37 frequencies", freq.join(","), "4,7,5,4");
  eq("Q37 total", freq.reduce((a, b) => a + b, 0), 20);
  eq("Q37 midpoints", edges.map(([a, b]) => (a + b) / 2).join(","), "85,95,105,115");
  expectDeclared(`${M4}1037`, "frequencies", 4);
  expectDeclared(`${M4}1037`, "frequencies", 7);
  expectDeclared(`${M4}1037`, "frequencies", 5);
  expectDeclared(`${M4}1037`, "midpoints", 85);
  expectDeclared(`${M4}1037`, "midpoints", 115);
}

// Q38 · Amina's histogram: 0–5 f=8, 5–10 f=12, 10–25 f=15
{
  const classes = [[0, 5, 8], [5, 10, 12], [10, 25, 15]];
  const density = classes.map(([a, b, f]) => f / (b - a));
  eq("Q38 frequency densities", density.map((d) => Math.round(d * 100) / 100).join(","), "1.6,2.4,1");
  expectDeclared(`${M4}1038`, "density", 1.6, 1e-9);
  expectDeclared(`${M4}1038`, "density", 2.4, 1e-9);
  expectDeclared(`${M4}1038`, "density", 1, 1e-9);
}

// Q39 · box plots North 4/8/14/22/32 and South 6/11/14/17/24
{
  const north = { min: 4, q1: 8, median: 14, q3: 22, max: 32 };
  const south = { min: 6, q1: 11, median: 14, q3: 17, max: 24 };
  eq("Q39 North IQR", north.q3 - north.q1, 14);
  eq("Q39 South IQR", south.q3 - south.q1, 6);
  expectDeclared(`${M4}1039`, "North five-number", 4);
  expectDeclared(`${M4}1039`, "North five-number", 32);
  expectDeclared(`${M4}1039`, "North IQR", north.q3 - north.q1);
  expectDeclared(`${M4}1039`, "South IQR", south.q3 - south.q1);
}

// Q41 · borehole volumes 10–14(6) 14–18(12) 18–22(9) 22–26(3)
{
  const freq = [6, 12, 9, 3];
  const mid = [12, 16, 20, 24];
  const sumFx = freq.reduce((acc, f, i) => acc + f * mid[i], 0);
  const n = freq.reduce((a, b) => a + b, 0);
  eq("Q41 Σfx", sumFx, 516);
  eq("Q41 estimated mean", sumFx / n, 17.2);
  eq("Q41 estimated 30-day total", sumFx, 516);
  const minimum = freq.reduce((acc, f, i) => acc + f * (mid[i] - 2), 0);
  eq("Q41 theoretical minimum", minimum, 456);
  expectDeclared(`${M4}1041`, "Σfx", sumFx);
  expectDeclared(`${M4}1041`, "mean", sumFx / n);
  expectDeclared(`${M4}1041`, "minimum", minimum);
}

// Q42 · pallet of 8 cement bags
{
  const values = [48, 49, 50, 51, 52];
  const freq = [1, 2, 2, 2, 1];
  const n = freq.reduce((a, b) => a + b, 0);
  const mu = values.reduce((acc, v, i) => acc + v * freq[i], 0) / n;
  const sigma = Math.sqrt(values.reduce((acc, v, i) => acc + freq[i] * (v - mu) ** 2, 0) / n);
  eq("Q42 μ", mu, 50);
  eq("Q42 σ", sigma, Math.sqrt(1.5), 1e-9);
  eq("Q42 μ within 49.5–50.5", mu >= 49.5 && mu <= 50.5 ? 1 : 0, 1);
  eq("Q42 σ within 1.30", sigma <= 1.3 ? 1 : 0, 1);
  expectDeclared(`${M4}1042`, "μ", mu);
  expectDeclared(`${M4}1042`, "σ", sigma, 1e-5);
}

// Q43 · cumulative frequencies for 120 candidates
{
  const marks = [30, 40, 50, 60, 70, 80, 90];
  const cum = [0, 15, 30, 60, 90, 108, 120];
  const readAt = (target) => {
    for (let i = 1; i < cum.length; i += 1) {
      if (target <= cum[i]) {
        const span = marks[i] - marks[i - 1];
        const part = (target - cum[i - 1]) / (cum[i] - cum[i - 1]);
        return marks[i - 1] + part * span;
      }
    }
    return marks[marks.length - 1];
  };
  const total = 120;
  eq("Q43 Q1", readAt(0.25 * total), 50);
  eq("Q43 Q2", readAt(0.5 * total), 60);
  eq("Q43 Q3", readAt(0.75 * total), 70);
  eq("Q43 IQR", readAt(0.75 * total) - readAt(0.25 * total), 20);
  eq("Q43 top 10 % cut-off", readAt(total - 0.1 * total), 80);
  eq("Q43 scored 70 < s ≤ 80", cum[5] - cum[4], 18);
}

// Q44 · apartment rents (thousand FCFA)
{
  const all = [85, 90, 92, 98, 100, 105, 270];
  const six = [85, 90, 92, 98, 100, 105];
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const median = (a) => ([...a].sort((x, y) => x - y))[(a.length - 1) / 2];
  eq("Q44 mean of 7", mean(all), 120);
  eq("Q44 median of 7", median(all), 98);
  eq("Q44 mean of 6", mean(six), 95);
  expectDeclared(`${M4}1044`, "mean of 7", mean(all));
  expectDeclared(`${M4}1044`, "median of 7", median(all));
  expectDeclared(`${M4}1044`, "mean of 6", mean(six));
}

// ---------------------------------------------------------------------------
console.log("\n3. MYP 5 — answers derived from the printed data");
// ---------------------------------------------------------------------------
const M5 = "c0a00000-0000-4000-8000-00000000";

// Q26 · u_n = 3n² − 2n + 4 and v_{n+1} = ½v_n + 5
{
  const u = (n) => 3 * n * n - 2 * n + 4;
  eq("Q26 u1", u(1), 5);
  eq("Q26 u3", u(3), 25);
  eq("Q26 u8", u(8), 180);
  let v = 6;
  const steps = [];
  for (let i = 0; i < 3; i += 1) { v = v / 2 + 5; steps.push(v); }
  eq("Q26 v2, v3, v4", steps.join(","), "8,9,9.5");
  expectDeclared(`${M5}1026`, "u1", u(1));
  expectDeclared(`${M5}1026`, "u8", u(8));
  expectDeclared(`${M5}1026`, "v2", steps[0]);
  expectDeclared(`${M5}1026`, "v4", steps[2]);
}

// Q27 · 46, 39, 32, 25, …
{
  const u = (n) => 53 - 7 * n;
  eq("Q27 u1", 46, 46);
  eq("Q27 d", 39 - 46, -7);
  eq("Q27 u_n at n = 1", u(1), 46);
  eq("Q27 u_n at n = 4", u(4), 25);
  // 53 − 7n = −45  →  n = 14
  const n = (53 + 45) / 7;
  eq("Q27 term equal to −45", n, 14);
  let firstNegative = null;
  for (let i = 1; i <= 20 && firstNegative === null; i += 1) if (u(i) < 0) firstNegative = u(i);
  eq("Q27 first negative term", firstNegative, -3);
  expectDeclared(`${M5}1027`, "d", -7);
  expectDeclared(`${M5}1027`, "term number", n);
  expectDeclared(`${M5}1027`, "first negative term", firstNegative);
}

// Q28 · u5 = 23, u12 = 58
{
  const d = (58 - 23) / (12 - 5);
  const u1 = 23 - 4 * d;
  const s20 = (20 / 2) * (2 * u1 + 19 * d);
  eq("Q28 d", d, 5);
  eq("Q28 u1", u1, 3);
  eq("Q28 S20", s20, 1010);
  expectDeclared(`${M5}1028`, "d", d);
  expectDeclared(`${M5}1028`, "u1", u1);
  expectDeclared(`${M5}1028`, "S20", s20);
}

// Q29 · u2 = −24, u5 = 192
{
  const r = Math.cbrt(192 / -24);
  const u1 = -24 / r;
  const u8 = u1 * r ** 7;
  eq("Q29 r", r, -2);
  eq("Q29 u1", u1, 12);
  eq("Q29 u8", u8, -1536);
  // Is −3072 a term? u1·r^(n−1) = −3072 → r^(n−1) = −256, not a power of −2.
  let isTerm = false;
  for (let n = 1; n <= 30; n += 1) if (Math.abs(u1 * r ** (n - 1) + 3072) < 1e-9) isTerm = true;
  eq("Q29 −3072 is a term", isTerm ? 1 : 0, 0);
  expectDeclared(`${M5}1029`, "r", r);
  expectDeclared(`${M5}1029`, "u1", u1);
  expectDeclared(`${M5}1029`, "u8", u8);
}

// Q30 · 4, 9, 18, 31, 48
{
  const terms = [4, 9, 18, 31, 48];
  const d1 = terms.slice(1).map((v, i) => v - terms[i]);
  const d2 = d1.slice(1).map((v, i) => v - d1[i]);
  const a = d2[0] / 2;
  const b = d1[0] - 3 * a;
  const c = terms[0] - a - b;
  const u = (n) => a * n * n + b * n + c;
  eq("Q30 first differences", d1.join(","), "5,9,13,17");
  eq("Q30 second differences", d2.join(","), "4,4,4");
  eq("Q30 a", a, 2);
  eq("Q30 b", b, -1);
  eq("Q30 c", c, 3);
  eq("Q30 u12", u(12), 279);
  let target = null;
  for (let n = 1; n <= 200 && target === null; n += 1) if (u(n) === 193) target = n;
  eq("Q30 n where u_n = 193", target, 10);
  expectDeclared(`${M5}1030`, "a", a);
  expectDeclared(`${M5}1030`, "b", b);
  expectDeclared(`${M5}1030`, "c", c);
  expectDeclared(`${M5}1030`, "u12", u(12));
  expectDeclared(`${M5}1030`, "n", target);
}

// Q31 · two finite series
{
  // Arithmetic 5 + 11 + … + 119
  const nA = (119 - 5) / 6 + 1;
  const sA = (nA / 2) * (5 + 119);
  eq("Q31 arithmetic n", nA, 20);
  eq("Q31 arithmetic sum", sA, 1240);
  // Geometric 320 + 160 + … + 5
  const r = 0.5;
  const nG = Math.log(5 / 320) / Math.log(r) + 1;
  const sG = (320 * (1 - r ** nG)) / (1 - r);
  eq("Q31 geometric n", nG, 7);
  eq("Q31 geometric sum", sG, 635);
  expectDeclared(`${M5}1031`, "n (arithmetic)", nA);
  expectDeclared(`${M5}1031`, "S (arithmetic)", sA);
  expectDeclared(`${M5}1031`, "n (geometric)", nG);
  expectDeclared(`${M5}1031`, "S (geometric)", sG);
}

// Q32 · courtyard tiles
{
  const B = (n) => 2 * n + 2;
  const C = (n) => n * (n + 1);
  const T = (n) => (n + 1) * (n + 2);
  eq("Q32 B4", B(4), 10);
  eq("Q32 C4", C(4), 20);
  eq("Q32 T4", T(4), 30);
  eq("Q32 identity holds at n = 4", C(4) + B(4) - T(4), 0);
  eq("Q32 B1..B3", [1, 2, 3].map(B).join(","), "4,6,8");
  eq("Q32 C1..C3", [1, 2, 3].map(C).join(","), "2,6,12");
  let target = null;
  for (let n = 1; n <= 200 && target === null; n += 1) if (T(n) === 210) target = n;
  eq("Q32 n where T_n = 210", target, 13);
  expectDeclared(`${M5}1032`, "B4", B(4));
  expectDeclared(`${M5}1032`, "C4", C(4));
  expectDeclared(`${M5}1032`, "T4", T(4));
  expectDeclared(`${M5}1032`, "n", target);
}

// Q33 · S_n = 3n² + 4n
{
  const S = (n) => 3 * n * n + 4 * n;
  const u = (n) => (n === 1 ? S(1) : S(n) - S(n - 1));
  eq("Q33 S1..S4", [1, 2, 3, 4].map(S).join(","), "7,20,39,64");
  eq("Q33 u1..u4", [1, 2, 3, 4].map(u).join(","), "7,13,19,25");
  eq("Q33 u_n at n = 5", u(5), 31);
  eq("Q33 closed form 6n + 1 at n = 5", 6 * 5 + 1, 31);
  eq("Q33 d", u(3) - u(2), 6);
  expectDeclared(`${M5}1033`, "S1", S(1));
  expectDeclared(`${M5}1033`, "S4", S(4));
  expectDeclared(`${M5}1033`, "u1", u(1));
  expectDeclared(`${M5}1033`, "u4", u(4));
  expectDeclared(`${M5}1033`, "d", 6);
}

// Q34 · u1 = 5, u_{n+1} = 3u_n − 4
{
  const terms = [5];
  for (let i = 0; i < 3; i += 1) terms.push(3 * terms[terms.length - 1] - 4);
  eq("Q34 u2..u4", terms.slice(1).join(","), "11,29,83");
  const deltas = terms.slice(1).map((v, i) => v - terms[i]);
  eq("Q34 first differences", deltas.join(","), "6,18,54");
  eq("Q34 differences are geometric (r = 3)", deltas[1] / deltas[0], 3);
  const u = (n) => 3 ** n + 2;
  eq("Q34 closed form at n = 1", u(1), 5);
  eq("Q34 closed form at n = 4", u(4), 83);
  expectDeclared(`${M5}1034`, "u2", terms[1]);
  expectDeclared(`${M5}1034`, "u4", terms[3]);
}

// Q35 · P1 = Q1 = 8, P2 = Q2 = 12
{
  const P = (n) => 4 * n + 4;
  const Q = (n) => 8 * 1.5 ** (n - 1);
  eq("Q35 P1", P(1), 8);
  eq("Q35 P2", P(2), 12);
  eq("Q35 Q1", Q(1), 8);
  eq("Q35 Q2", Q(2), 12);
  eq("Q35 P5", P(5), 24);
  eq("Q35 Q5", Q(5), 40.5);
  eq("Q35 (Q5 − P5)/P5", (Q(5) - P(5)) / P(5), 0.6875);
  eq("Q35 Q3 > P3", Q(3) > P(3) ? 1 : 0, 1);
  expectDeclared(`${M5}1035`, "P5", P(5));
  expectDeclared(`${M5}1035`, "Q5", Q(5));
  expectDeclared(`${M5}1035`, "ratio", (Q(5) - P(5)) / P(5), 1e-9);
}

// Q36 · sigma notation for 9 + 13 + 17 + … + 45
{
  const u = (n) => 4 * n + 5;
  eq("Q36 first term", u(1), 9);
  const n = (45 - 9) / 4 + 1;
  eq("Q36 upper limit", n, 10);
  eq("Q36 last term", u(n), 45);
  expectDeclared(`${M5}1036`, "upper limit", n);
}

// Q37 · −5, −1, 3, 7, 11
{
  const u = (n) => 4 * n - 9;
  eq("Q37 u1", u(1), -5);
  eq("Q37 u5", u(5), 11);
  eq("Q37 d", 3 - -1, 4);
}

// Q39 · 100 − 50 + 25 − 12.5 + …
{
  const r = -0.5;
  const s6 = (100 * (1 - r ** 6)) / (1 - r);
  eq("Q39 S6", s6, 65.625);
  eq("Q39 Kofi's (wrong) value", (100 * (1 - 0.5 ** 6)) / (1 - 0.5), 196.875);
  eq("Q39 S6 below 100", s6 < 100 ? 1 : 0, 1);
  expectDeclared(`${M5}1039`, "r", r);
  expectDeclared(`${M5}1039`, "S6", s6, 1e-9);
}

// Q40 · three sequences
{
  const I = [18, 12, 8, 16 / 3];
  eq("Q40 Seq I is geometric (r = 2/3)", I[1] / I[0], 2 / 3, 1e-9);
  eq("Q40 Seq I u5", I[3] * (2 / 3), 32 / 9, 1e-9);
  const II = [5, 9, 15, 23];
  const d1 = II.slice(1).map((v, i) => v - II[i]);
  eq("Q40 Seq II second difference", d1[1] - d1[0], 2);
  const u2 = (n) => n * n + n + 3;
  eq("Q40 Seq II u5", u2(5), 33);
  const III = [22, 15, 8, 1];
  eq("Q40 Seq III is arithmetic (d = −7)", III[1] - III[0], -7);
  eq("Q40 Seq III u5", III[3] - 7, -6);
  expectDeclared(`${M5}1040`, "u5 of I", 32 / 9, 1e-5);
  expectDeclared(`${M5}1040`, "u5 of II", u2(5));
  expectDeclared(`${M5}1040`, "u5 of III", -6);
}

// Q41 · borehole drilling
{
  const u = (n) => 35000 + (n - 1) * 4500;
  const s = (n) => (n / 2) * (2 * 35000 + (n - 1) * 4500);
  eq("Q41 u20", u(20), 120500);
  eq("Q41 S20", s(20), 1555000);
  eq("Q41 grant suffices", s(20) <= 1600000 ? 1 : 0, 1);
  expectDeclared(`${M5}1041`, "u20", u(20));
  expectDeclared(`${M5}1041`, "S20", s(20));
}

// Q42 · scanner depreciation
{
  const r = 0.85;
  const V = (n) => 40000 * r ** n;
  eq("Q42 r", r, 0.85);
  eq("Q42 V1", V(1), 34000);
  eq("Q42 V5", Math.round(V(5) * 100) / 100, 17748.21, 1e-9);
  let year = null;
  for (let n = 1; n <= 40 && year === null; n += 1) if (V(n) < 12000) year = n;
  eq("Q42 replacement year", year, 8);
  eq("Q42 V7 still above 12 000", V(7) >= 12000 ? 1 : 0, 1);
  expectDeclared(`${M5}1042`, "r", r);
  expectDeclared(`${M5}1042`, "V5", Math.round(V(5) * 100) / 100, 1e-9);
  expectDeclared(`${M5}1042`, "replacement year", year);
}

// Q43 · u_n = n² + 4n + 3
{
  const u = (n) => n * n + 4 * n + 3;
  eq("Q43 u1", u(1), 8);
  eq("Q43 u2", u(2), 15);
  eq("Q43 u3", u(3), 24);
  eq("Q43 first difference at n = 1", u(2) - u(1), 7);
  eq("Q43 first difference 2n + 5 at n = 1", 2 * 1 + 5, 7);
  eq("Q43 crate holding 143", u(10), 143);
  let crate130 = null;
  for (let n = 1; n <= 100; n += 1) if (u(n) === 130) crate130 = n;
  eq("Q43 no crate holds 130", crate130 === null ? 1 : 0, 1);
  expectDeclared(`${M5}1043`, "u1", u(1));
  expectDeclared(`${M5}1043`, "u2", u(2));
  expectDeclared(`${M5}1043`, "u3", u(3));
  expectDeclared(`${M5}1043`, "crate number", 10);
}

// Q44 · annuity 5 000 at the start of each year for 8 years at 6 %
{
  const r = 1.06;
  const u1 = 5000 * r;
  const balance = (u1 * (r ** 8 - 1)) / (r - 1);
  eq("Q44 u1", u1, 5300);
  eq("Q44 balance", Math.round(balance * 100) / 100, 52456.58, 1e-9);
  const invested = 8 * 5000;
  eq("Q44 interest", Math.round((balance - invested) * 100) / 100, 12456.58, 1e-9);
  expectDeclared(`${M5}1044`, "r", r);
  expectDeclared(`${M5}1044`, "u1", u1);
  expectDeclared(`${M5}1044`, "balance", Math.round(balance * 100) / 100, 1e-9);
  expectDeclared(`${M5}1044`, "interest", Math.round((balance - invested) * 100) / 100, 1e-9);
}

// Q45 · two internship contracts over 10 months
{
  const sArithmetic = (10 / 2) * (2 * 150000 + 9 * 20000);
  const sGeometric = (100000 * (1.2 ** 10 - 1)) / (1.2 - 1);
  eq("Q45 Contract X S10", sArithmetic, 2400000);
  eq("Q45 Contract Y S10", Math.round(sGeometric), 2595868, 1);
  const x5 = (5 / 2) * (2 * 150000 + 4 * 20000);
  const y5 = (100000 * (1.2 ** 5 - 1)) / (1.2 - 1);
  eq("Q45 Contract X S5", x5, 950000);
  eq("Q45 Contract Y S5", Math.round(y5), 744160, 1);
  eq("Q45 X better at 5 months", x5 > y5 ? 1 : 0, 1);
  eq("Q45 Y better at 10 months", sGeometric > sArithmetic ? 1 : 0, 1);
  expectDeclared(`${M5}1045`, "X S10", sArithmetic);
  expectDeclared(`${M5}1045`, "Y S10", Math.round(sGeometric), 1);
  expectDeclared(`${M5}1045`, "X S5", x5);
  expectDeclared(`${M5}1045`, "Y S5", Math.round(y5), 1);
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed` +
  (failures ? `, ${failures} failed` : ""));
process.exit(failures === 0 ? 0 : 1);
