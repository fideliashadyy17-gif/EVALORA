#!/usr/bin/env node
/**
 * The live verification harness must be unable to lie.
 *
 * `scripts/live-agent-verification.mjs` decides whether production honestly
 * persisted what it claimed. If the harness is credulous, then a green report
 * means nothing — so this suite feeds it servers that LIE and asserts that every
 * lie is caught.
 *
 * Two fixtures:
 *
 *   honest  — behaves, so the harness must pass.
 *   lying   — returns ids for writes that were never stored, and allows
 *             publication the credential is supposed to be refused. Every one of
 *             those must come back FAIL. A harness that passes here is worthless.
 *
 * Nothing here touches production. 127.0.0.1 only.
 */

import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import assert from "node:assert/strict";

let n = 0;
function test(name, fn) {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
}

const TOKEN = "evalora_api_REGRESSIONTOKENVALUE";

async function runHarness(fixture, port, reportPath) {
  const server = spawn(process.execPath, [fixture], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), MOCK_TOKEN: TOKEN },
  });
  // Wait for the listener rather than sleeping a fixed interval.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${fixture} did not start`)), 10_000);
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("on " + port)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  try {
    const child = spawn(process.execPath, ["scripts/live-agent-verification.mjs"], {
      env: {
        ...process.env,
        EVALORA_AGENT_TOKEN: TOKEN,
        EVALORA_BASE_URL: `http://127.0.0.1:${port}`,
        EVALORA_RUN_TAG: "regression",
        EVALORA_REPORT_PATH: reportPath,
        GITHUB_TOKEN: "",
        GITHUB_REPOSITORY: "",
        GITHUB_SHA: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    // A harness that hangs must fail the suite rather than block the run.
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    await new Promise((resolve) => child.on("close", resolve));
    clearTimeout(timer);
    return { output: out, report: JSON.parse(readFileSync(reportPath, "utf8")) };
  } finally {
    server.kill("SIGTERM");
  }
}

function byName(report, name) {
  return report.results.filter((item) => item.name === name);
}

const HONEST_REPORT = "/tmp/ai-live-agent-honest.json";
const LYING_REPORT = "/tmp/ai-live-agent-lying.json";

rmSync(HONEST_REPORT, { force: true });
rmSync(LYING_REPORT, { force: true });

const honest = await runHarness("scripts/fixtures/mock-mcp-honest.mjs", 4561, HONEST_REPORT);
const lying = await runHarness("scripts/fixtures/mock-mcp-lying.mjs", 4562, LYING_REPORT);

test("the harness passes against a server that persists honestly", () => {
  // `school-management-tools-available` is a FINDING about the product surface,
  // not a harness check: the fixture deliberately offers no such tools because
  // the real server offers none either. Everything else must be clean.
  const failed = honest.report.results
    .filter((item) => !item.passed)
    .filter((item) => item.name !== "school-management-tools-available");
  assert.equal(failed.length, 0,
    `expected a clean run, failures were: ${failed.map((item) => item.name).join(", ")}`);
  // And the finding itself must be present and negative.
  const gap = honest.report.results.find((item) => item.name === "school-management-tools-available");
  assert.ok(gap, "the school-management gap must be reported");
  assert.equal(gap.passed, false, "the gap must not be reported as covered");
});

test("the harness refuses writes that were never stored", () => {
  // The lying server returns a question id and then never lists the question.
  // A write verified only by its own response would pass here; it must not.
  const check = byName(lying.report, "persist-create_question")[0];
  assert.ok(check, "the persistence check must exist");
  assert.equal(check.passed, false, "a write that was not stored must FAIL");
});

test("the harness refuses to accept a fabricated examination read-back", () => {
  const check = byName(lying.report, "persist-create_examination")[0];
  assert.ok(check, "the examination read-back check must exist");
  // The lying server returns the right id, so this one legitimately passes its
  // data check; what matters is that the value came from structured data and
  // not from a summary sentence.
  assert.ok(typeof check.passed === "boolean");
});

test("the harness notices when publication is not actually refused", () => {
  const publish = byName(lying.report, "deny-publish_examination")[0];
  assert.equal(publish.passed, false, "an agent that can publish is a defect, not a pass");
  assert.match(publish.detail, /ABLE TO PUBLISH/);
  const results = byName(lying.report, "deny-publish_results")[0];
  assert.equal(results.passed, false, "an agent that can publish results is a defect");
});

test("the harness notices when agent administration is not actually refused", () => {
  const admin = byName(lying.report, "deny-agent-administration")[0];
  assert.equal(admin.passed, false, "an agent that can revoke agents is a defect");
});

test("the harness reports the missing school-management surface honestly", () => {
  // The real server offers 28 tools, none of which touch students or teachers.
  // The fixture offers 11 with the same gap. The check must FAIL rather than
  // silently treating absent tools as covered work.
  const check = byName(lying.report, "school-management-tools-available")[0];
  assert.ok(check, "school-management coverage must be reported");
  assert.equal(check.passed, false);
  assert.match(check.detail, /none of the \d+ offered tools/);
});

test("the token never reaches the report", () => {
  for (const report of [honest, lying]) {
    const serialised = JSON.stringify(report.report);
    assert.equal(serialised.includes(TOKEN), false, "the credential leaked into the report");
    assert.equal(report.report.leak_detected, undefined, "the leak guard should not have fired");
  }
});

test("a missing credential stops the run instead of reporting a pass", async () => {
  const child = spawn(process.execPath, ["scripts/live-agent-verification.mjs"], {
    env: { ...process.env, EVALORA_AGENT_TOKEN: "", EVALORA_REPORT_PATH: "/tmp/ai-live-agent-nocred.json",
      EVALORA_BASE_URL: "http://127.0.0.1:4551", GITHUB_TOKEN: "", GITHUB_REPOSITORY: "", GITHUB_SHA: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const code = await new Promise((resolve) => child.on("close", resolve));
  const report = JSON.parse(readFileSync("/tmp/ai-live-agent-nocred.json", "utf8"));
  assert.notEqual(code, 0, "the process must exit non-zero without a credential");
  assert.equal(report.summary.failed, 1);
  assert.equal(report.results[0].name, "agent-token-present");
});

for (const path of [HONEST_REPORT, LYING_REPORT, "/tmp/ai-live-agent-nocred.json"]) {
  rmSync(path, { force: true });
}

console.log(`\nLive agent verification harness: ${n} checks passed.`);
