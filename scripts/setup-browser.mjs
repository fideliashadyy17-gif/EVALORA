// Prepares the headless Chromium the browser suites need.
//
// The suites run @sparticuz/chromium's Amazon Linux 2023 build against
// playwright-core, so the Playwright downloader is never involved. Two things
// have to happen before a suite can launch it:
//
//   1. `@sparticuz/chromium` and `playwright-core` must be installed. They are
//      deliberately *not* dependencies: they are ~120 MB of test-only payload
//      that no deployed route imports.
//   2. The Chromium binary is linked against Amazon Linux 2023's NSS/expat
//      sonames, which Ubuntu runners do not ship. The package bundles them as
//      bin/al2023.tar.br; they are extracted here and exported through
//      LD_LIBRARY_PATH by the suites themselves.
//
// Both are done with --no-save so the working tree stays clean, and with
// --ignore-scripts so nothing is compiled at install time.
//
//   node scripts/setup-browser.mjs
//
// Prints the two values a caller needs to pass through the environment.

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CHROMIUM_LIBS = "/tmp/al2023/lib";
const PACKAGES = ["@sparticuz/chromium@153.0.0", "playwright-core@1.64.1"];

const require = createRequire(import.meta.url);
const cwd = process.cwd();

function have(specifier) {
  try {
    require.resolve(specifier, { paths: [cwd] });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** npm occasionally fails with EBUSY while its own cache is being swept. Retry. */
function install() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execFileSync(
        "npm",
        ["install", "--no-save", "--no-audit", "--no-fund", "--package-lock=false", "--ignore-scripts", ...PACKAGES],
        { cwd, stdio: "inherit" },
      );
      return;
    } catch (error) {
      lastError = error;
      console.error(`npm install attempt ${attempt} failed; retrying in ${attempt * 5}s`);
      sleep(attempt * 5_000);
    }
  }
  throw lastError;
}

if (!have("@sparticuz/chromium") || !have("playwright-core")) {
  console.log("installing test-only browser packages …");
  install();
}

/**
 * Extract the Amazon Linux 2023 shared libraries.
 *
 * @sparticuz/chromium ships them brotli-compressed; the tarball is small
 * (a few hundred kB) so this is cheap and does not touch the network.
 */
const archive = path.join(cwd, "node_modules/@sparticuz/chromium/bin/al2023.tar.br");
if (!fs.existsSync(archive)) {
  console.error(`✗ ${archive} is missing — @sparticuz/chromium did not install correctly`);
  process.exit(1);
}

fs.mkdirSync(CHROMIUM_LIBS, { recursive: true });
const tarball = path.join("/tmp", "evalora-al2023.tar");
fs.writeFileSync(tarball, zlib.brotliDecompressSync(fs.readFileSync(archive)));
// The archive stores its members as lib/<name>, so extracting into /tmp/al2023
// is what produces /tmp/al2023/lib/<name>.
execFileSync("tar", ["-xf", tarball, "-C", "/tmp/al2023", "lib"], { cwd: "/tmp" });

const libs = fs.readdirSync(CHROMIUM_LIBS).filter((name) => name.includes(".so") || name.endsWith(".chk"));
if (libs.length < 10) {
  console.error(`✗ expected the full Amazon Linux library set, found ${libs.length} file(s) in ${CHROMIUM_LIBS}`);
  process.exit(1);
}

// Resolve the binary once so a broken download fails here rather than in the
// middle of a suite.
// The package is ESM-first: require() yields { default: Chromium, ... }, so the
// class with executablePath() lives on .default.
const chromiumModule = require("@sparticuz/chromium");
const chromium = chromiumModule.default ?? chromiumModule;
const executablePath = await chromium.executablePath();
if (!fs.existsSync(executablePath)) {
  console.error(`✗ Chromium executable not found at ${executablePath}`);
  process.exit(1);
}

console.log(`✓ Chromium ${executablePath}`);
console.log(`✓ ${libs.length} Amazon Linux libraries in ${CHROMIUM_LIBS}`);
console.log(`   export LD_LIBRARY_PATH=${CHROMIUM_LIBS}:$LD_LIBRARY_PATH`);
