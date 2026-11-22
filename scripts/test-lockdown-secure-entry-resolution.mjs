// scripts/test-lockdown-secure-entry-resolution.mjs
// Verification suite for EVALORA Secure Browser Lockdown Entry & Handshake Resolution

import assert from "node:assert";
import fs from "node:fs";
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

assert.ok(!ps1Content.includes('msedge.exe') && !ps1Content.includes('chrome.exe'), "PowerShell installer must never launch an installed browser");
assert.ok(!batContent.includes('msedge.exe') && !batContent.includes('chrome.exe'), "Batch installer must never launch an installed browser");
assert.ok(ps1Content.includes('EVALORA-Secure-Browser-$Version-Setup.exe'), "PowerShell installer downloads the packaged Electron setup");
assert.ok(batContent.includes('EVALORA-Secure-Browser-%VERSION%-Setup.exe'), "Batch installer downloads the packaged Electron setup");
assert.ok(ps1Content.includes('Get-FileHash') && ps1Content.includes('.sha256'), "PowerShell bootstrap verifies the installer SHA-256 before execution");
assert.ok(batContent.includes('Get-FileHash') && batContent.includes('.sha256'), "Batch bootstrap verifies the installer SHA-256 before execution");
const downloadPage = fs.readFileSync("src/app/download/secure-browser/page.tsx", "utf-8");
assert.ok(downloadPage.includes('Download EVALORA Secure Exam Browser') && downloadPage.includes('EVALORA-Lockdown-Setup.bat'), "Download page provides accessible download options for students");

console.log("  ✓ Published Windows setup scripts install the packaged Electron application and do not invoke Edge/Chrome.");

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

// Query flags and browser storage are never accepted as native-client evidence.
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("lockdown=1")), false);
window.__EVALORA_SECURE_LOCKDOWN__ = { getAttestation: () => Promise.resolve({}) };
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), true);
delete window.__EVALORA_SECURE_LOCKDOWN__;

// URL, User-Agent, local/session storage and cookies are presentation markers only.
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("lockdown=1^")), false);
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("secure_browser=1")), false);
Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 EVALORA-Secure-Browser/1.0.0", configurable: true });
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), false);
global.window.__EVALORA_SECURE_LOCKDOWN__ = { isSecureEnvironment: true };
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), false);
global.window.__EVALORA_SECURE_LOCKDOWN__ = { getAttestation: () => Promise.resolve({}) };
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), true);
delete global.window.__EVALORA_SECURE_LOCKDOWN__;
global.window.sessionStorage = { getItem: () => "1" };
global.window.localStorage = { getItem: () => "1" };
global.document.cookie = "evalora_lockdown_active=1";
assert.strictEqual(isSecureBrowserEnvironment(new URLSearchParams("")), false);

console.log("  ✓ UI markers are non-authoritative; server admission requires a consumed native challenge proof.");

// ---------------------------------------------------------------------------
// 3. V2 attestation properties are exercised end-to-end in
// test-lockdown-challenge-security.mjs. Keep this suite focused on integration.
// ---------------------------------------------------------------------------
console.log("\n3. Checking the V2 one-time native challenge integration...");
const attestationSource = fs.readFileSync("src/lib/lockdownAttestation.ts", "utf-8");
assert.ok(attestationSource.includes("cryptoVerify(null"), "server verifies Ed25519 signatures");
assert.ok(attestationSource.includes("candidate_binding") && attestationSource.includes("session_id_hash"), "proof is candidate/session-bound");
assert.ok(attestationSource.includes("consumed_at"), "proof is one-use");
console.log("  ✓ V2 attestation verification uses per-install asymmetric keys, candidate/session binding and one-time challenge consumption.");

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
assert.ok(linkAccessRoute.includes("lockdown_attestation") && linkAccessRoute.includes("verifyAndConsumeLockdownChallenge"), "shared-link admission verifies the signed payload from the request body");
assert.ok(directAccessRoute.includes("parsed.data.lockdown_attestation"), "direct admission must read the signed payload from the request body");
assert.ok(challengeRoute.includes("createLockdownChallengeNonce") && challengeRoute.includes("exam_lockdown_challenges"), "server issues short-lived one-time challenges; challenge alone is not proof");
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
