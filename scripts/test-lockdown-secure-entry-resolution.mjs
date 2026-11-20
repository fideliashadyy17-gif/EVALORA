// scripts/test-lockdown-secure-entry-resolution.mjs
// Verification suite for EVALORA Secure Browser Lockdown Entry & Handshake Resolution

import assert from "node:assert";
import fs from "node:fs";
import { computeLockdownSignature, verifyLockdownAttestation } from "../src/lib/lockdown.ts";
import { extractCleanExamCode, isSecureBrowserEnvironment } from "../src/lib/lockdownClient.ts";

console.log("Running EVALORA Secure Browser Lockdown Entry & Handshake Resolution Suite...\n");

// ---------------------------------------------------------------------------
// 1. Windows Batch & PowerShell Launcher Script Verification
// ---------------------------------------------------------------------------
console.log("1. Checking Windows Launcher Scripts for Shell Caret Bugs & Profile Isolation...");

const ps1Content = fs.readFileSync("public/downloads/EVALORA-Lockdown-Launcher.ps1", "utf-8");
const batContent = fs.readFileSync("public/downloads/EVALORA-Lockdown-Setup.bat", "utf-8");

// Verify no literal caret inside double quotes for TARGET_URL
assert.ok(
  !ps1Content.includes('TARGET_URL=!TARGET_URL!^&code='),
  "EVALORA-Lockdown-Launcher.ps1 must not contain literal caret in 'set \"TARGET_URL=!TARGET_URL!^&code=\"'",
);
assert.ok(
  !ps1Content.includes('TARGET_URL=!TARGET_URL!^&lockdown='),
  "EVALORA-Lockdown-Launcher.ps1 must not contain literal caret in 'set \"TARGET_URL=!TARGET_URL!^&lockdown=\"'",
);

assert.ok(
  !batContent.includes('TARGET_URL=!TARGET_URL!^&code='),
  "EVALORA-Lockdown-Setup.bat must not contain literal caret in 'set \"TARGET_URL=!TARGET_URL!^&code=\"'",
);
assert.ok(
  !batContent.includes('TARGET_URL=!TARGET_URL!^&lockdown='),
  "EVALORA-Lockdown-Setup.bat must not contain literal caret in 'set \"TARGET_URL=!TARGET_URL!^&lockdown=\"'",
);

// Verify isolated profile directory flag (--user-data-dir)
assert.ok(
  ps1Content.includes("--user-data-dir="),
  "EVALORA-Lockdown-Launcher.ps1 must supply --user-data-dir to isolate process from running Edge/Chrome instances",
);
assert.ok(
  batContent.includes("--user-data-dir="),
  "EVALORA-Lockdown-Setup.bat must supply --user-data-dir to isolate process from running Edge/Chrome instances",
);

console.log("  ✓ Windows launcher scripts are free of literal caret bugs and enforce isolated user profile.");

// ---------------------------------------------------------------------------
// 2. Client-Side Secure Browser Environment Detection
// ---------------------------------------------------------------------------
console.log("\n2. Checking UI-only Secure Browser hints & parameter resilience...");

// Clean code extraction
assert.strictEqual(extractCleanExamCode(new URLSearchParams("lockdown=1&code=4E6E2138A7")), "4E6E2138A7");
assert.strictEqual(extractCleanExamCode(new URLSearchParams("lockdown=1^&code=4E6E2138A7")), "4E6E2138A7");
assert.strictEqual(extractCleanExamCode(new URLSearchParams("lockdown=1&^code=4E6E2138A7")), "4E6E2138A7");
assert.strictEqual(extractCleanExamCode(new URLSearchParams("lockdown=1&code=4E6E2138A7^")), "4E6E2138A7");
assert.strictEqual(extractCleanExamCode(new URLSearchParams("exam=4E6E2138A7")), "4E6E2138A7");
assert.strictEqual(extractCleanExamCode(new URLSearchParams("^exam=4E6E2138A7")), "4E6E2138A7");

// Mock browser globals
global.window = {};
global.document = { cookie: "" };

// Standard browser (no secure UA, no params, no storage) -> must return false
Object.defineProperty(navigator, "userAgent", {
  value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  configurable: true,
});
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), false);

// Clean param ?lockdown=1 -> true
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("lockdown=1")), true);

// Caret-contaminated param ?lockdown=1^ -> true
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("lockdown=1^")), true);

// Alternative param ?secure_browser=1 -> true
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("secure_browser=1")), true);

// Secure User-Agent -> true
Object.defineProperty(navigator, "userAgent", {
  value: "Mozilla/5.0 EVALORA-Secure-Browser/1.0.0 Safari/537.36",
  configurable: true,
});
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), true);

// Electron API window.__EVALORA_SECURE_LOCKDOWN__ -> true
Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Chrome/120.0.0.0", configurable: true });
global.window.__EVALORA_SECURE_LOCKDOWN__ = { isSecureEnvironment: true };
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), true);
delete global.window.__EVALORA_SECURE_LOCKDOWN__;

// SessionStorage -> true
global.window.sessionStorage = {
  getItem: (key) => (key === "evalora_lockdown_active" ? "1" : null),
};
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), true);
delete global.window.sessionStorage;

// LocalStorage -> true
global.window.localStorage = {
  getItem: (key) => (key === "evalora_lockdown_active" ? "1" : null),
};
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), true);
delete global.window.localStorage;

// Cookie -> true
global.document.cookie = "evalora_lockdown_active=1; path=/";
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), true);
global.document.cookie = "";

console.log("  ✓ Browser markers are parsed for UI context; server admission must still verify a native signature.");

// ---------------------------------------------------------------------------
// 3. Cryptographic Attestation Verification
// ---------------------------------------------------------------------------
console.log("\n3. Checking Cryptographic Attestation Verification...");

const now = Date.now();
const examCode = "4E6E2138A7";
const platform = "win32";
const version = "1.0.0";
const nonce = "test-handshake-nonce";

// Valid attestation with matching exam code
const validSig1 = computeLockdownSignature(now, examCode, platform, version, nonce);
const res1 = verifyLockdownAttestation(
  {
    timestamp: now,
    exam_code: examCode,
    platform,
    app_version: version,
    signature: validSig1,
    nonce,
  },
  examCode,
);
assert.strictEqual(res1.verified, true);
assert.strictEqual(res1.platform, "win32");
assert.strictEqual(res1.app_version, "1.0.0");

// Generic signatures must not be transferable between examinations.
const genericSig = computeLockdownSignature(now, "EVALORA", platform, version, nonce);
const res2 = verifyLockdownAttestation(
  {
    timestamp: now,
    exam_code: examCode,
    platform,
    app_version: version,
    signature: genericSig,
    nonce,
  },
  examCode,
);
assert.strictEqual(res2.verified, false);

// Attestation with tampered signature -> must fail
const resTampered = verifyLockdownAttestation(
  {
    timestamp: now,
    exam_code: examCode,
    platform,
    app_version: version,
    signature: "tampered_signature_hex",
    nonce,
  },
  examCode,
);
assert.strictEqual(resTampered.verified, false);

// Attestation expired (> 15 minute window) -> must fail
const expiredTimestamp = now - 16 * 60 * 1000;
const resExpired = verifyLockdownAttestation(
  {
    timestamp: expiredTimestamp,
    exam_code: examCode,
    platform,
    app_version: version,
    signature: computeLockdownSignature(expiredTimestamp, examCode, platform, version, nonce),
    nonce,
  },
  examCode,
);
assert.strictEqual(resExpired.verified, false);

// Outdated application version -> must fail
const resOutdated = verifyLockdownAttestation(
  {
    timestamp: now,
    exam_code: examCode,
    platform,
    app_version: "0.8.0",
    signature: computeLockdownSignature(now, examCode, platform, "0.8.0", nonce),
    nonce,
  },
  examCode,
  { minVersion: "1.0.0" },
);
assert.strictEqual(resOutdated.verified, false);

console.log("  ✓ Cryptographic attestation verification rejects tampering, replay, and outdated clients.");

// ---------------------------------------------------------------------------
// 4. Verification of Route Handlers & Clients
// ---------------------------------------------------------------------------
console.log("\n4. Checking Route Handlers and Client Implementations...");

const linkAccessRoute = fs.readFileSync("src/app/api/exam/link-access/route.ts", "utf-8");
const directAccessRoute = fs.readFileSync("src/app/api/exam/access/route.ts", "utf-8");
const challengeRoute = fs.readFileSync("src/app/api/exam/lockdown/challenge/route.ts", "utf-8");
const joinPage = fs.readFileSync("src/app/exam/join/[token]/page.tsx", "utf-8");
const accessPage = fs.readFileSync("src/app/exam-access/page.tsx", "utf-8");

assert.ok(linkAccessRoute.includes("lockdownVerified && !attempt.lockdown_verified"), "link-access must update verified status on a resumed attempt");
assert.ok(!linkAccessRoute.includes("isDirectSecureClient"), "User-Agent/custom headers must never grant lockdown admission");
assert.ok(!directAccessRoute.includes("isDirectSecureClient"), "direct access must not treat a User-Agent/custom header as attestation");
assert.ok(linkAccessRoute.includes("identity as { lockdown_attestation"), "shared-link admission must read the signed payload from the request body");
assert.ok(directAccessRoute.includes("parsed.data.lockdown_attestation"), "direct admission must read the signed payload from the request body");
assert.ok(challengeRoute.includes("status: 410") && !challengeRoute.includes("computeLockdownSignature"), "web endpoints must not mint HMAC attestations");
assert.ok(!joinPage.includes("computeLockdownSignature") && !joinPage.includes("lockdownChallenge"), "shared-link pages must not expose a signed challenge");
assert.ok(!accessPage.includes("computeLockdownSignature") && !accessPage.includes("lockdownChallenge"), "direct-entry pages must not expose a signed challenge");

const joinClient = fs.readFileSync("src/app/exam/join/[token]/JoinClient.tsx", "utf-8");
assert.ok(joinClient.includes("getAttestation"), "JoinClient must obtain the signed assertion through the native bridge");
assert.ok(!joinClient.includes("/api/exam/lockdown/challenge"), "JoinClient must not ask the web server to mint proof");

const examAccessClient = fs.readFileSync("src/app/exam-access/ExamAccessClient.tsx", "utf-8");
assert.ok(examAccessClient.includes("getAttestation"), "ExamAccessClient must obtain the signed assertion through the native bridge");
assert.ok(!examAccessClient.includes("/api/exam/lockdown/challenge"), "ExamAccessClient must not ask the web server to mint proof");

const takeExamClient = fs.readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf-8");
assert.ok(takeExamClient.includes("isSecureBrowserEnvironment"), "TakeExamClient may use browser detection for presentation");
assert.ok(takeExamClient.includes("const isLockdownVerified = Boolean(attempt.lockdown_verified)"), "TakeExamClient must gate locked papers on server-recorded attestation, not a client marker");

console.log("  ✓ Both admission routes require signed native attestation; headers, URLs and server-minted challenges cannot grant access.");

console.log("\nAll EVALORA Secure Browser Lockdown Entry & Handshake Resolution tests PASSED successfully!");
