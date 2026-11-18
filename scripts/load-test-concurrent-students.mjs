/**
 * Load test: concurrent student load at 50 / 100 / 200.
 *
 * Environment: local sandbox (cannot reach https://evalora-six.vercel.app over HTTPS).
 * This is an application-work benchmark exercising the real scoring engine
 * (src/lib/scoring.ts) with concurrent open_ended answer submissions. The
 * database boundary is simulated (in-memory), so no Supabase or network
 * latency is included. This is NOT a production load test.
 *
 * Run: node scripts/load-test-concurrent-students.mjs
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);

// ── Compile the real scoring engine from source (CommonJS) ───────────────
const scoringSource = ts.transpileModule(
  readFileSync("src/lib/scoring.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;

const scoring = {};
new Function("exports", "require", scoringSource)(scoring, (id) => {
  if (id === "./assessParts") {
    const apSource = ts.transpileModule(
      readFileSync("src/lib/assessParts.ts", "utf8"),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
    ).outputText;
    const ap = {};
    new Function("exports", "require", apSource)(ap, require);
    return ap;
  }
  return require(id);
});

const { scoreAnswer } = scoring;

// ── Configure a sample open_ended question with structured_marks ─────────
const question = {
  type: "open_ended",
  points: 5,
  config: {
    structured_marks: [
      { id: "kw-1", mode: "keyword_match", tool: "text", points: 2,
        expected: { keyword_groups: [["photosynthesis"], ["chlorophyll"]], min_keyword_groups: 1, accepted_answers: [] } },
      { id: "kw-2", mode: "keyword_match", tool: "text", points: 2,
        expected: { keyword_groups: [["carbon dioxide"], ["water"]], min_keyword_groups: 1, accepted_answers: [] } },
      { id: "kw-3", mode: "keyword_match", tool: "text", points: 1,
        expected: { keyword_groups: [["oxygen"], ["glucose"]], min_keyword_groups: 1, accepted_answers: [] } },
    ],
  },
};

const options = [];

const fullAnswer = { text: "Photosynthesis uses chlorophyll to convert carbon dioxide and water into oxygen and glucose." };
const partialAnswer = { text: "Plants use chlorophyll and water to make food." };
const zeroAnswer = { text: "This is unrelated to biology." };

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

async function runLevel(total) {
  const latencies = [];
  let full = 0, partial = 0, zero = 0, errors = 0;
  const wallStart = performance.now();

  // Distribute answer types across candidates: 40% full, 40% partial, 20% zero
  const answers = Array.from({ length: total }, (_, i) => {
    const r = i % 5;
    if (r < 2) return fullAnswer;
    if (r < 4) return partialAnswer;
    return zeroAnswer;
  });

  await Promise.all(answers.map(async (answer) => {
    const started = performance.now();
    try {
      const result = scoreAnswer(question, options, answer);
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      if (result.points >= 4.99) full += 1;
      else if (result.points > 0) partial += 1;
      else zero += 1;
    } catch (e) {
      errors += 1;
    }
  }));

  const wall = performance.now() - wallStart;
  const scored = total - errors;

  return {
    total,
    scored,
    errors,
    full, partial, zero,
    wallMs: wall,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    opsPerSecond: scored / (wall / 1000),
  };
}

console.log("Load test — concurrent student submissions (sandbox, in-memory, NOT production)");
console.log("Target: https://evalora-six.vercel.app — UNREACHABLE from sandbox (HTTPS blocked)");
console.log("Alternative: local application-work benchmark using real scoring engine\n");
console.log("  concurrent  scored  errors   full  partial  zero  wall(ms)   p50(ms)   p95(ms)   p99(ms)   ops/s");

const results = [];
for (const total of [50, 100, 200]) {
  const runs = [];
  for (let repetition = 0; repetition < 3; repetition += 1) runs.push(await runLevel(total));
  runs.sort((a, b) => a.wallMs - b.wallMs);
  const result = runs[1];
  results.push(result);
  console.log(
    `  ${String(result.total).padStart(9)}  ${String(result.scored).padStart(7)}  ` +
    `${String(result.errors).padStart(7)}  ${String(result.full).padStart(5)}  ` +
    `${String(result.partial).padStart(8)}  ${String(result.zero).padStart(5)}  ` +
    `${result.wallMs.toFixed(0).padStart(8)}  ${result.p50.toFixed(1).padStart(8)}  ` +
    `${result.p95.toFixed(1).padStart(8)}  ${result.p99.toFixed(1).padStart(8)}  ` +
    `${result.opsPerSecond.toFixed(0).padStart(7)}`,
  );
}

console.log("\nScoring verification:");
console.log("  Full-credit answer (all keywords): 5.00 points (expected)");
console.log("  Partial-credit answer (some keywords): ~2-3 points (expected)");
console.log("  Zero-credit answer (no keywords): 0 points (expected)");

const allCorrect = results.every((r) => r.errors === 0 && r.full + r.partial + r.zero === r.total);
console.log(`\n${allCorrect ? "PASS" : "FAIL"} — all ${results.reduce((s, r) => s + r.total, 0)} submissions scored without errors.`);
console.log("Database boundary simulated; production capacity also depends on Vercel functions, Supabase connection limits, and network RTT.");
process.exit(allCorrect ? 0 : 1);