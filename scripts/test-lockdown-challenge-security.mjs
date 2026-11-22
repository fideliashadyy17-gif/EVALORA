import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { lockdownCandidateBinding, lockdownChallengeMessage, verifyAndConsumeLockdownChallenge } from "../src/lib/lockdownAttestation.ts";

const examId = "11111111-1111-4111-8111-111111111111";
const candidateA = { first_name: "Amina", last_name: "Test", class_id: "class-a", guest_key: "a".repeat(32) };
const candidateB = { first_name: "Other", last_name: "Student", class_id: "class-a", guest_key: "b".repeat(32) };
const session = candidateA.guest_key;
const pair = generateKeyPairSync("ed25519");
const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKey = pair.privateKey;
let dbRow;
function adminFor(row) {
  return { from(table) {
    assert.equal(table, "exam_lockdown_challenges");
    return {
      select() { return this; }, eq(key, value) { this[key] = value; return this; },
      maybeSingle: async function () {
        if (this.patch) {
          const eligible = row.id === this.id && row.consumed_at === null && Date.parse(row.expires_at) > Date.parse(this.expires_at_gt);
          if (eligible) Object.assign(row, this.patch);
          return { data: eligible ? { id: row.id } : null, error: null };
        }
        return { data: row.id === this.id && row.exam_id === this.exam_id ? { ...row } : null, error: null };
      },
      update(patch) { this.patch = patch; return this; }, is(key, value) { this[`${key}_is`] = value; return this; },
      gt(key, value) { this[`${key}_gt`] = value; return this; },
      then(resolve) {
        const eligible = row.id === this.id && row.consumed_at === null && Date.parse(row.expires_at) > Date.parse(this.expires_at_gt);
        if (eligible) Object.assign(row, this.patch);
        return Promise.resolve({ data: eligible ? { id: row.id } : null, error: null }).then(resolve);
      },
    };
  } };
}
function newProof({ context = candidateA, examCode = "MYP4-VERSION-C", expires = new Date(Date.now() + 90_000).toISOString() } = {}) {
  const binding = lockdownCandidateBinding(context);
  const unsigned = { challenge_id: randomBytes(16).toString("hex"), nonce: randomBytes(32).toString("base64url"),
    expires_at: expires, exam_code: examCode, candidate_binding: binding, session_id: context.guest_key,
    platform: "win32", app_version: "1.1.0" };
  const signed = { ...unsigned, signature: sign(null, Buffer.from(lockdownChallengeMessage(unsigned)), privateKey).toString("base64url") };
  dbRow = { ...unsigned, id: unsigned.challenge_id, exam_id: examId, session_id_hash: (awaitHash(context.guest_key)),
    public_key_pem: publicPem, consumed_at: null };
  return signed;
}
function awaitHash(value) { return createHash("sha256").update(value).digest("hex"); }
const expected = (context = candidateA, examCode = "MYP4-VERSION-C", id = examId) => ({ examId: id, examCode, candidateContext: context, minVersion: "1.0.0" });

// Same signed assertion must not authorize a different candidate or session.
const crossCandidate = newProof();
let result = await verifyAndConsumeLockdownChallenge(adminFor(dbRow), crossCandidate, expected(candidateB));
assert.equal(result.verified, false, "same attestation reused for another candidate is rejected");
assert.match(result.reason, /different examination, candidate or session/);

const crossExam = newProof();
result = await verifyAndConsumeLockdownChallenge(adminFor(dbRow), crossExam, expected(candidateA, "OTHER-EXAM", "22222222-2222-4222-8222-222222222222"));
assert.equal(result.verified, false, "same attestation reused for another examination is rejected");

const replayed = newProof();
result = await verifyAndConsumeLockdownChallenge(adminFor(dbRow), replayed, expected());
assert.equal(result.verified, true, "valid native proof is accepted once");
result = await verifyAndConsumeLockdownChallenge(adminFor(dbRow), replayed, expected());
assert.equal(result.verified, false, "same nonce/challenge submitted twice is rejected");

const expired = newProof({ expires: new Date(Date.now() - 1000).toISOString() });
result = await verifyAndConsumeLockdownChallenge(adminFor(dbRow), expired, expected());
assert.equal(result.verified, false, "expired challenge is rejected");

const badSignature = newProof();
badSignature.signature = randomBytes(64).toString("base64url");
result = await verifyAndConsumeLockdownChallenge(adminFor(dbRow), badSignature, expected());
assert.equal(result.verified, false, "invalid signature is rejected");

result = await verifyAndConsumeLockdownChallenge(adminFor({}), undefined, expected());
assert.equal(result.verified, false, "missing attestation is rejected");

const wrongSession = newProof();
result = await verifyAndConsumeLockdownChallenge(adminFor(dbRow), wrongSession, expected({ ...candidateA, guest_key: "c".repeat(32) }));
assert.equal(result.verified, false, "another candidate's session cannot reuse the proof");

// Headers are intentionally not part of the verifier input; spoofing them cannot replace proof.
const spoofedHeadersOnly = { "user-agent": "EVALORA-Secure-Browser/1.1.0", "x-evalora-secure-browser": "1" };
assert.equal((await verifyAndConsumeLockdownChallenge(adminFor({}), undefined, expected())).verified, false,
  `spoofed headers ${JSON.stringify(spoofedHeadersOnly)} cannot authorize standard web access`);

// A locally generated Ed25519 key can prove key possession, but is NOT publisher or OS remote attestation.
console.log("PASS: lockdown v2 security regressions (candidate/exam/session binding, expiration, signature, missing proof, one-time replay, spoofed-header refusal).");
console.log("LIMITATION: self-enrolled per-install keys prove key possession only; they do not attest a publisher-signed binary or Windows secure boot.");
