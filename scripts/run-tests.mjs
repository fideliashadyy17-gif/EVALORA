// Run every check suite in scripts/ and report a single summary.
//
//   npm test              all suites that can run here
//   npm test -- --all     also the browser suites (need Playwright + browsers)
//
// Each suite is a standalone ES module that exits non-zero on failure, so this
// runner only has to schedule them and count.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const all = process.argv.includes("--all");

// The eight browser suites need three production servers on fixed ports plus a
// Chromium build, so they stay opt-in — but a suite must never be "skipped"
// silently: this prints the exact command that runs them.
const BROWSER_HINT =
  "The browser suites need three production servers on :3101-:3103 and Chromium.\n" +
  "  node scripts/setup-browser.mjs          # Chromium + Amazon Linux libs\n" +
  "  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 npm run build\n" +
  "  #   ^ must be set for the BUILD, not just `next start`: NEXT_PUBLIC_* is\n" +
  "  #   inlined at build time, so a bundle built against another origin makes\n" +
  "  #   /exam/join/<token> render \"This examination link is invalid\".\n" +
  "  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 npx next start -p 3101\n" +
  "  npm test -- --all\n" +
  "(Docker-free CI equivalent: .github/workflows/exam-browser.yml)";
const files = readdirSync("scripts")
  .filter((name) => /^test-.*\.mjs$/.test(name))
  .sort();

// These drive a real browser through Playwright, which is not installed by
// default (`npx playwright install chromium`); they are reported, not hidden.
// Suites that need a running server (a dev server on port 3101, or a production build on port 3102).
const browserSuites = new Set([
  "test-exam-browser.mjs",
  "test-printable-paper-browser.mjs",
  "test-assessment-lockdown-browser.mjs",
  "test-exam-messaging-browser.mjs",
  "test-exam-messaging-routes.mjs",
  "test-exam-premature-submit-browser.mjs",
  "test-shared-browser-sequential-browser.mjs",
  "test-cron-sweep-routes.mjs",
]);

const results = [];
let checks = 0;
for (const file of files) {
  const path = `scripts/${file}`;
  if (browserSuites.has(file) && !all) {
    results.push({ file, state: "skipped" });
    continue;
  }
  const started = Date.now();
  const run = spawnSync(process.execPath, [path], { encoding: "utf8" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const counts = [...output.matchAll(/(\d+)\s+(?:checks?|interaction checks?|…?\s*checks?)\s+passed/g)];
  const found = counts.reduce((n, match) => n + Number(match[1]), 0);
  if (run.status === 0) checks += found;
  results.push({
    file,
    state: run.status === 0 ? "pass" : "FAIL",
    seconds: ((Date.now() - started) / 1000).toFixed(1),
    output,
  });
}

const failed = results.filter((r) => r.state === "FAIL");
for (const r of results) {
  const mark = r.state === "pass" ? "✓" : r.state === "FAIL" ? "✗" : "–";
  const label = r.seconds ? `${r.file} (${r.seconds}s)` : r.file;
  console.log(`${mark} ${label}`);
}
for (const r of failed) {
  console.log(`\n───── ${r.file} ─────`);
  console.log(r.output.trimEnd().split("\n").slice(-12).join("\n"));
}
const skipped = results.filter((r) => r.state === "skipped").length;
const passed = results.length - failed.length - skipped;
console.log(
  `\n${passed} suites passed, ${failed.length} failed, ${skipped} skipped` +
    (checks > 0 ? ` — ${checks} individual checks passed` : "") +
    (skipped ? `\n\n${skipped} browser suites were not run.\n${BROWSER_HINT}\nSkipped: ${[...browserSuites].join(", ")}` : ""),
);
process.exit(failed.length === 0 ? 0 : 1);
