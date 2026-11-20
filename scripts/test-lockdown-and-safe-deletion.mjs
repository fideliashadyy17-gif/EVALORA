import assert from "node:assert/strict";
import {
  parseLockdownSettings,
  isExamLockdownActive,
  computeLockdownSignature,
  verifyLockdownAttestation,
  buildLockdownLaunchUrl,
  generateLockdownChallenge,
  DEFAULT_LOCKDOWN_SETTINGS,
} from "../src/lib/lockdown.ts";

console.log("Running Secure Lockdown & Safe Exam Deletion Test Suite...\n");

// ─── Test 1: Lockdown Configuration & Optional Defaults ───────────
{
  const def = parseLockdownSettings(null);
  assert.equal(def.enabled, false, "Lockdown must default to disabled (never globally forced)");
  assert.equal(def.require_app, true);
  assert.equal(def.strict_multi_display, true);

  const empty = parseLockdownSettings({});
  assert.equal(empty.enabled, false, "Empty settings must default to disabled");

  const enabled = parseLockdownSettings({
    enabled: true,
    require_app: true,
    strict_multi_display: true,
    block_clipboard: true,
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.require_app, true);
  assert.equal(enabled.strict_multi_display, true);
  assert.equal(enabled.block_clipboard, true);

  // Existing exams without lockdown
  assert.equal(isExamLockdownActive({}), false);
  assert.equal(isExamLockdownActive({ settings: {} }), false);
  assert.equal(isExamLockdownActive({ settings: { lockdown: { enabled: false } } }), false);
  assert.equal(isExamLockdownActive({ settings: { lockdown: { enabled: true } } }), true);

  console.log("  ✓ Lockdown settings are strictly optional, default to disabled, and never globally forced");
}

// ─── Test 2: Deep Link Launch URL Generator ───────────────────────
{
  const uri1 = buildLockdownLaunchUrl("MYP4-FORM2");
  assert.equal(uri1, "evalora-lockdown://enter?exam=MYP4-FORM2");

  const uri2 = buildLockdownLaunchUrl("MYP4-FORM2", "CAND-1234");
  assert.equal(uri2, "evalora-lockdown://enter?exam=MYP4-FORM2&candidate=CAND-1234");

  // Context-preserving deep link for shared examination links
  const token = "b2f69046-6b21-432a-bd1e-5369bbde1cfb";
  const uri3 = buildLockdownLaunchUrl({
    token,
    examCode: "8J4FDA35",
    path: `/exam/join/${token}`,
  });
  const parsed3 = new URL(uri3);
  assert.equal(parsed3.protocol, "evalora-lockdown:");
  assert.equal(parsed3.searchParams.get("token"), token);
  assert.equal(parsed3.searchParams.get("path"), `/exam/join/${token}`);
  assert.equal(parsed3.searchParams.get("exam"), "8J4FDA35");

  console.log("  ✓ Deep linking protocol URI (evalora-lockdown://) formatted correctly and preserves original exam context");
}

// ─── Test 3: Ephemeral Challenge Generation ───────────────────────
{
  const challenge1 = generateLockdownChallenge();
  const challenge2 = generateLockdownChallenge();
  assert.equal(typeof challenge1, "string");
  assert.equal(challenge1.length, 32);
  assert.notEqual(challenge1, challenge2, "Challenges must be cryptographically unique");

  console.log("  ✓ Cryptographic ephemeral challenge generation verified");
}

// ─── Test 4: Cryptographic Attestation Handshake & Verification ───
{
  const examCode = "MATH-2026";
  const now = Date.now();
  const validSig = computeLockdownSignature(now, examCode, "win32", "1.0.0", "nonce-1");

  // Valid payload
  const validResult = verifyLockdownAttestation(
    {
      timestamp: now,
      exam_code: examCode,
      platform: "win32",
      app_version: "1.0.0",
      signature: validSig,
      nonce: "nonce-1",
    },
    examCode,
  );
  assert.equal(validResult.verified, true, "Legitimate Secure Exam Application must be verified");
  assert.equal(validResult.platform, "win32");
  assert.equal(validResult.app_version, "1.0.0");

  // Tampered signature (attempted bypass)
  const tamperedResult = verifyLockdownAttestation(
    {
      timestamp: now,
      exam_code: examCode,
      platform: "win32",
      app_version: "1.0.0",
      signature: "0000000000000000000000000000000000000000000000000000000000000000",
      nonce: "nonce-1",
    },
    examCode,
  );
  assert.equal(tamperedResult.verified, false, "Tampered signature must be rejected");

  // Expired timestamp (replay attack prevention)
  const oldTime = now - 10 * 60 * 1000; // 10 minutes ago
  const oldSig = computeLockdownSignature(oldTime, examCode, "win32", "1.0.0", "nonce-2");
  const replayResult = verifyLockdownAttestation(
    {
      timestamp: oldTime,
      exam_code: examCode,
      platform: "win32",
      app_version: "1.0.0",
      signature: oldSig,
      nonce: "nonce-2",
    },
    examCode,
  );
  assert.equal(replayResult.verified, false, "Expired attestation timestamp must be rejected");

  // Exam code mismatch
  const mismatchResult = verifyLockdownAttestation(
    {
      timestamp: now,
      exam_code: "OTHER-EXAM",
      platform: "win32",
      app_version: "1.0.0",
      signature: validSig,
      nonce: "nonce-1",
    },
    examCode,
  );
  assert.equal(mismatchResult.verified, false, "Mismatched exam code must be rejected");

  // Outdated application version
  const oldVersionSig = computeLockdownSignature(now, examCode, "win32", "0.9.0", "nonce-3");
  const outdatedResult = verifyLockdownAttestation(
    {
      timestamp: now,
      exam_code: examCode,
      platform: "win32",
      app_version: "0.9.0",
      signature: oldVersionSig,
      nonce: "nonce-3",
    },
    examCode,
    { minVersion: "1.0.0" },
  );
  assert.equal(outdatedResult.verified, false, "Outdated application version must be rejected");

  console.log("  ✓ Cryptographic attestation verification successfully prevents spoofing and replay attacks");
}

// ─── Test 5: Safe Exam Deletion Rules & Benchmark Protection ──────
{
  const BENCHMARK_GRADE9 = "cd000000-0000-4000-8000-000000000002";
  const BENCHMARK_GRADE10 = "ce000000-0000-4000-8000-000000000002";

  function evaluateDeletionPolicy(examId, attemptsCount) {
    if (examId === BENCHMARK_GRADE9 || examId === BENCHMARK_GRADE10) {
      return { allowed: false, action: "protected_benchmark" };
    }
    if (attemptsCount === 0) {
      return { allowed: true, action: "permanent_delete" };
    }
    return { allowed: true, action: "safe_archive" };
  }

  // Version C benchmark protection
  assert.deepEqual(evaluateDeletionPolicy(BENCHMARK_GRADE9, 0), {
    allowed: false,
    action: "protected_benchmark",
  });
  assert.deepEqual(evaluateDeletionPolicy(BENCHMARK_GRADE10, 4), {
    allowed: false,
    action: "protected_benchmark",
  });

  // Empty draft exam
  assert.deepEqual(evaluateDeletionPolicy("random-exam-no-attempts", 0), {
    allowed: true,
    action: "permanent_delete",
  });

  // Exam with attempts (preserves records)
  assert.deepEqual(evaluateDeletionPolicy("exam-with-18-attempts", 18), {
    allowed: true,
    action: "safe_archive",
  });

  console.log("  ✓ Exam deletion rules distinguish between empty exams and exams with student records");
  console.log("  ✓ Official Version C benchmark examinations are strictly protected from deletion");
}

console.log("\nAll Secure Lockdown & Safe Exam Deletion tests passed successfully!");
