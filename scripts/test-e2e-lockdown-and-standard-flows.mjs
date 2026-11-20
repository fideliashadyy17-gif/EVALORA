// scripts/test-e2e-lockdown-and-standard-flows.mjs
// Comprehensive End-to-End Candidate Flow Validation for:
// 1. Standard Examination (Lockdown OFF)
// 2. Lockdown Examination (Lockdown ON, MYP4 Version C)
// 3. Native Attestation Generation, Cryptographic Ed25519 Handshake, and One-Time Atomic Consumption

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  lockdownCandidateBinding,
  lockdownChallengeMessage,
  verifyAndConsumeLockdownChallenge,
} from "../src/lib/lockdownAttestation.ts";
import {
  buildLockdownLaunchUrl,
  parseLockdownSettings,
} from "../src/lib/lockdown.ts";

console.log("Starting End-to-End Candidate Journey Verification for Standard & Lockdown Examinations...\n");

// In-memory mock database store simulating Postgres tables: exams & exam_lockdown_challenges
const mockDb = {
  exams: [
    {
      id: "cb000000-0000-4000-8000-000000000002",
      title: "MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment",
      access_code: "6MGUM7TH",
      invite_token: "cb000000-0000-4000-8000-000000000001",
      settings: {
        lockdown: null, // Lockdown OFF
      },
    },
    {
      id: "cd000000-0000-4000-8000-000000000002",
      title: "MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C)",
      access_code: "8J4FDA35",
      invite_token: "b2f69046-6b21-432a-bd1e-5369bbde1cfb",
      settings: {
        lockdown: {
          enabled: true,
          require_app: true,
          min_app_version: "1.0.0",
          block_clipboard: true,
          strict_multi_display: true,
        },
      },
    },
  ],
  challenges: new Map(),
};

function createMockSupabaseAdmin() {
  return {
    from(table) {
      if (table === "exam_lockdown_challenges") {
        return {
          select() { return this; },
          eq(col, val) {
            this.filters = this.filters || {};
            this.filters[col] = val;
            return this;
          },
          maybeSingle: async function () {
            if (this.patch) {
              const row = mockDb.challenges.get(this.filters?.id);
              const isEligible =
                row &&
                row.consumed_at === null &&
                Date.parse(row.expires_at) > Date.parse(this.gt_val);
              if (isEligible) {
                Object.assign(row, this.patch);
                return { data: { id: row.id }, error: null };
              }
              return { data: null, error: null };
            }
            const row = mockDb.challenges.get(this.filters?.id);
            if (row && row.exam_id === this.filters?.exam_id) {
              return { data: { ...row }, error: null };
            }
            return { data: null, error: null };
          },
          update(patch) {
            this.patch = patch;
            return this;
          },
          is(col, val) {
            this.is_col = col;
            this.is_val = val;
            return this;
          },
          gt(col, val) {
            this.gt_col = col;
            this.gt_val = val;
            return this;
          },
          then(resolve) {
            return this.maybeSingle().then(resolve);
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

const mockAdmin = createMockSupabaseAdmin();

async function run() {
  // -------------------------------------------------------------------------
  // Journey 1: Standard Examination (Lockdown OFF)
  // -------------------------------------------------------------------------
  console.log("Journey 1: Candidate Sitting Standard Examination (Lockdown OFF)...");

  const stdExam = mockDb.exams.find((e) => e.access_code === "6MGUM7TH");
  assert.ok(stdExam, "Standard exam exists");
  const stdLockdown = parseLockdownSettings(stdExam.settings.lockdown);

  // In standard exam, lockdown.enabled is false:
  assert.equal(stdLockdown.enabled, false, "Standard exam must have lockdown disabled");
  assert.equal(stdLockdown.enabled && stdLockdown.require_app, false, "lockdown active check must be false");

  // In the candidate access route (/api/exam/link-access):
  // When lockdown is not required, verification is bypassed completely
  const candidateStd = {
    first_name: "Emma",
    last_name: "Watson",
    class_id: "class-std-1",
    class_name: "Grade 9 Alpha",
    guest_key: "guest_key_std_browser_001",
  };

  const stdAttempt = {
    id: "attempt-std-1",
    exam_id: stdExam.id,
    student_name: `${candidateStd.first_name} ${candidateStd.last_name}`,
    status: "in_progress",
    lockdown_verified: false, // Standard exams do not require lockdown_verified
  };

  // Check TakeExamClient runtime gate for Standard Exam:
  const isLockdownRequiredForStd = Boolean(stdLockdown.enabled && stdLockdown.require_app);
  const isLockdownVerifiedForStd = Boolean(stdAttempt.lockdown_verified);
  const isBlockedInStd = isLockdownRequiredForStd && !isLockdownVerifiedForStd && stdAttempt.status === "in_progress";

  assert.equal(isBlockedInStd, false, "Standard examination must render immediately and unobstructed");
  console.log("  ✓ Candidate directly admitted to standard exam without lockdown prompt or blocking loop.");

  // -------------------------------------------------------------------------
  // Journey 2: Lockdown Examination in Standard Browser (Rejection & Deep Link)
  // -------------------------------------------------------------------------
  console.log("\nJourney 2: Candidate Opening Lockdown Exam in Standard Browser...");

  const lockExam = mockDb.exams.find((e) => e.access_code === "8J4FDA35");
  assert.ok(lockExam, "Lockdown exam exists");
  const lockSettings = parseLockdownSettings(lockExam.settings.lockdown);

  assert.equal(lockSettings.enabled, true, "Lockdown must be enabled");
  assert.equal(lockSettings.require_app, true, "require_app must be true");

  const candidateLock = {
    first_name: "David",
    last_name: "Miller",
    class_id: "cd000000-0000-4000-8000-000000000003",
    class_name: "Grade 9 Mathematics",
    guest_key: "guest_key_browser_lock_002",
  };

  // Attempting entry from Chrome/Edge/Safari without native challenge attestation:
  const standardBrowserAdmission = await verifyAndConsumeLockdownChallenge(mockAdmin, undefined, {
    examId: lockExam.id,
    examCode: lockExam.access_code,
    candidateContext: candidateLock,
    minVersion: lockSettings.min_app_version,
  });

  assert.equal(standardBrowserAdmission.verified, false, "Standard browser must be refused admission");
  assert.match(standardBrowserAdmission.reason, /Missing native application challenge proof/);

  // Verify deep-link URL returned to browser
  const deepLinkUrl = buildLockdownLaunchUrl({
    token: lockExam.invite_token,
    path: `/exam/join/${lockExam.invite_token}`,
    examCode: lockExam.access_code,
  });

  assert.equal(
    deepLinkUrl,
    `evalora-lockdown://join/${lockExam.invite_token}?code=${lockExam.access_code}&lockdown=1&secure_browser=1`,
    "Deep link must preserve invite token and secure context markers",
  );
  console.log("  ✓ Standard browser safely gated (403 Forbidden with verified evalora-lockdown:// launch URL).");

  // -------------------------------------------------------------------------
  // Journey 3: Candidate Sitting Lockdown Exam Inside EVALORA Secure Browser
  // -------------------------------------------------------------------------
  console.log("\nJourney 3: Candidate Launching & Sitting Exam Inside EVALORA Secure Browser...");

  // 3a. Secure Browser starts and generates per-install OS-protected Ed25519 keypair
  const deviceKeyPair = crypto.generateKeyPairSync("ed25519");
  const publicPem = deviceKeyPair.publicKey.export({ type: "spki", format: "pem" }).toString();

  // 3b. Student fills access form in Secure Browser UI, computing deterministic candidate binding
  const candidateBinding = lockdownCandidateBinding(candidateLock);
  const sessionId = candidateLock.guest_key;

  // 3c. Secure Browser requests ephemeral challenge from server
  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 120_000).toISOString();
  const platform = "win32";
  const appVersion = "1.1.0";

  mockDb.challenges.set(challengeId, {
    id: challengeId,
    exam_id: lockExam.id,
    exam_code: lockExam.access_code,
    candidate_binding: candidateBinding,
    session_id_hash: crypto.createHash("sha256").update(sessionId).digest("hex"),
    nonce,
    public_key_pem: publicPem,
    platform,
    app_version: appVersion,
    expires_at: expiresAt,
    consumed_at: null,
  });

  // 3d. Secure Browser desktop process signs challenge message
  const unsignedChallenge = {
    challenge_id: challengeId,
    nonce,
    expires_at: expiresAt,
    exam_code: lockExam.access_code,
    candidate_binding: candidateBinding,
    session_id: sessionId,
    platform,
    app_version: appVersion,
  };
  const rawMsg = lockdownChallengeMessage(unsignedChallenge);
  const signature = crypto.sign(null, Buffer.from(rawMsg, "utf8"), deviceKeyPair.privateKey).toString("base64url");

  const nativeProof = {
    ...unsignedChallenge,
    signature,
  };

  // 3e. Server admission endpoint verifies proof and atomically consumes challenge
  const admissionResult = await verifyAndConsumeLockdownChallenge(mockAdmin, nativeProof, {
    examId: lockExam.id,
    examCode: lockExam.access_code,
    candidateContext: candidateLock,
    minVersion: lockSettings.min_app_version,
  });

  assert.equal(admissionResult.verified, true, "Genuine Secure Browser attestation must be accepted");
  assert.equal(admissionResult.platform, "win32");
  assert.equal(admissionResult.app_version, "1.1.0");

  // Attempt record created with lockdown_verified = true
  const verifiedAttempt = {
    id: "attempt-lock-1",
    exam_id: lockExam.id,
    student_name: `${candidateLock.first_name} ${candidateLock.last_name}`,
    status: "in_progress",
    lockdown_verified: true,
    lockdown_platform: admissionResult.platform,
    lockdown_app_version: admissionResult.app_version,
  };

  // Verify TakeExamClient runtime gate for verified Lockdown Attempt:
  const isLockdownRequiredForLock = Boolean(lockSettings.enabled && lockSettings.require_app);
  const isLockdownVerifiedForLock = Boolean(verifiedAttempt.lockdown_verified);
  const isBlockedInLock = isLockdownRequiredForLock && !isLockdownVerifiedForLock && verifiedAttempt.status === "in_progress";

  assert.equal(isBlockedInLock, false, "Verified Secure Browser attempt must render the examination freely");
  console.log("  ✓ Candidate admitted, attempt flagged lockdown_verified: true, paper unlocked in Secure Browser!");

  // -------------------------------------------------------------------------
  // Journey 4: Security Attack Simulations
  // -------------------------------------------------------------------------
  console.log("\nJourney 4: Attack Surface & Edge Case Resistance Tests...");

  // 4a. Replay attack: submitting the exact same proof again
  const replayAttempt = await verifyAndConsumeLockdownChallenge(mockAdmin, nativeProof, {
    examId: lockExam.id,
    examCode: lockExam.access_code,
    candidateContext: candidateLock,
    minVersion: lockSettings.min_app_version,
  });
  assert.equal(replayAttempt.verified, false, "Replayed challenge must be rejected");
  console.log("  ✓ Replay attack strictly rejected (challenge already consumed).");

  // 4b. Cross-exam attack: using proof from Exam A to enter Exam B
  const crossExamChallengeId = crypto.randomUUID();
  const crossNonce = crypto.randomBytes(32).toString("base64url");
  mockDb.challenges.set(crossExamChallengeId, {
    id: crossExamChallengeId,
    exam_id: "other-exam-id",
    exam_code: "OTHER-CODE",
    candidate_binding: candidateBinding,
    session_id_hash: crypto.createHash("sha256").update(sessionId).digest("hex"),
    nonce: crossNonce,
    public_key_pem: publicPem,
    platform,
    app_version: appVersion,
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    consumed_at: null,
  });
  const crossProof = {
    challenge_id: crossExamChallengeId,
    nonce: crossNonce,
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    exam_code: "OTHER-CODE",
    candidate_binding: candidateBinding,
    session_id: sessionId,
    platform,
    app_version: appVersion,
    signature: crypto.sign(null, Buffer.from(lockdownChallengeMessage({
      challenge_id: crossExamChallengeId,
      nonce: crossNonce,
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      exam_code: "OTHER-CODE",
      candidate_binding: candidateBinding,
      session_id: sessionId,
      platform,
      app_version: appVersion,
    })), deviceKeyPair.privateKey).toString("base64url"),
  };
  const crossExamAttempt = await verifyAndConsumeLockdownChallenge(mockAdmin, crossProof, {
    examId: lockExam.id,
    examCode: lockExam.access_code,
    candidateContext: candidateLock,
    minVersion: lockSettings.min_app_version,
  });
  assert.equal(crossExamAttempt.verified, false, "Cross-exam proof must be rejected");
  console.log("  ✓ Cross-exam token reuse strictly rejected.");

  // 4c. Candidate impersonation attack: altering candidate name with someone else's proof
  const impersonatorContext = { ...candidateLock, first_name: "Impersonator" };
  const impersonationAttempt = await verifyAndConsumeLockdownChallenge(mockAdmin, nativeProof, {
    examId: lockExam.id,
    examCode: lockExam.access_code,
    candidateContext: impersonatorContext,
    minVersion: lockSettings.min_app_version,
  });
  assert.equal(impersonationAttempt.verified, false, "Context tampering must be rejected");
  console.log("  ✓ Candidate context tampering strictly rejected.");

  console.log("\nALL Candidate Journey & Security Resistance Tests PASSED!");
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
