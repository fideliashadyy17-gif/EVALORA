import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const LOCKDOWN_ATTESTATION_VERSION = 2;
export const LOCKDOWN_CHALLENGE_TTL_MS = 2 * 60 * 1000;

export type LockdownCandidateContext = {
  first_name?: string;
  last_name?: string;
  class_id?: string;
  class_name?: string;
  guest_key?: string;
  candidate_code?: string;
  identity?: Record<string, unknown>;
};

function normalized(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() : "";
}

export function canonicalLockdownCandidateContext(context: LockdownCandidateContext): string {
  const identity = Object.fromEntries(
    Object.entries(context.identity ?? {})
      .filter(([key]) => key !== "lockdown_attestation")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, normalized(value)]),
  );
  return JSON.stringify([
    "EVALORA-CANDIDATE-V2",
    normalized(context.first_name),
    normalized(context.last_name),
    normalized(context.class_id),
    normalized(context.class_name),
    normalized(context.guest_key),
    normalized(context.candidate_code),
    identity,
  ]);
}

export function lockdownCandidateBinding(context: LockdownCandidateContext): string {
  return createHash("sha256").update(canonicalLockdownCandidateContext(context)).digest("hex");
}

export function createLockdownChallengeNonce(): string {
  return randomBytes(32).toString("base64url");
}

export type LockdownChallengeProof = {
  challenge_id: string;
  nonce: string;
  expires_at: string;
  exam_code: string;
  candidate_binding: string;
  session_id: string;
  platform: string;
  app_version: string;
  signature: string;
};

type ChallengeRow = {
  id: string;
  exam_id: string;
  exam_code: string;
  candidate_binding: string;
  session_id_hash: string;
  nonce: string;
  public_key_pem: string;
  platform: string;
  app_version: string;
  expires_at: string;
  consumed_at: string | null;
};

export function lockdownChallengeMessage(proof: Omit<LockdownChallengeProof, "signature">): string {
  return JSON.stringify([
    "EVALORA-LOCKDOWN-ATTESTATION-V2",
    proof.challenge_id,
    proof.nonce,
    proof.expires_at,
    proof.exam_code.trim().toUpperCase(),
    proof.candidate_binding,
    proof.session_id,
    proof.platform,
    proof.app_version,
  ]);
}

export async function verifyAndConsumeLockdownChallenge(
  admin: SupabaseClient,
  input: unknown,
  expected: {
    examId: string;
    examCode: string;
    candidateContext: LockdownCandidateContext;
    minVersion: string;
  },
): Promise<{ verified: boolean; reason?: string; platform?: string; app_version?: string }> {
  if (!input || typeof input !== "object") return { verified: false, reason: "Missing native application challenge proof." };
  const proof = input as Partial<LockdownChallengeProof>;
  if (typeof proof.challenge_id !== "string" || typeof proof.nonce !== "string" ||
      typeof proof.expires_at !== "string" || typeof proof.exam_code !== "string" ||
      typeof proof.candidate_binding !== "string" || typeof proof.session_id !== "string" ||
      typeof proof.platform !== "string" || typeof proof.app_version !== "string" ||
      typeof proof.signature !== "string")
    return { verified: false, reason: "Incomplete native application challenge proof." };

  const binding = lockdownCandidateBinding(expected.candidateContext);
  const sessionId = expected.candidateContext.guest_key || expected.candidateContext.candidate_code || "";
  const normalizedExam = proof.exam_code.trim().toUpperCase();
  if (normalizedExam !== expected.examCode.trim().toUpperCase() || proof.candidate_binding !== binding || proof.session_id !== sessionId)
    return { verified: false, reason: "Native proof is bound to a different examination, candidate or session." };
  if (!proof.app_version || proof.app_version.localeCompare(expected.minVersion, undefined, { numeric: true, sensitivity: "base" }) < 0)
    return { verified: false, reason: "EVALORA Secure Exam Browser is outdated." };
  if (!(["win32", "darwin", "linux"] as string[]).includes(proof.platform))
    return { verified: false, reason: "Unsupported Secure Browser platform." };
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(proof.signature))
    return { verified: false, reason: "Invalid native proof signature encoding." };

  const { data: row, error: readError } = await admin.from("exam_lockdown_challenges")
    .select("id,exam_id,exam_code,candidate_binding,session_id_hash,nonce,public_key_pem,platform,app_version,expires_at,consumed_at")
    .eq("id", proof.challenge_id)
    .eq("exam_id", expected.examId)
    .maybeSingle();
  if (readError || !row) return { verified: false, reason: "Unknown or already-used native challenge." };
  const challenge = row as ChallengeRow;
  if (challenge.consumed_at) return { verified: false, reason: "Native challenge has already been used." };
  const expires = Date.parse(challenge.expires_at);
  if (!Number.isFinite(expires) || expires < Date.now() || Date.parse(proof.expires_at) !== expires)
    return { verified: false, reason: "Native challenge expired." };
  if (challenge.nonce !== proof.nonce || challenge.exam_code !== normalizedExam ||
      challenge.candidate_binding !== binding || challenge.session_id_hash !== createHash("sha256").update(sessionId).digest("hex") ||
      challenge.platform !== proof.platform || challenge.app_version !== proof.app_version)
    return { verified: false, reason: "Native challenge does not match the authorized context." };

  let validSignature = false;
  try {
    validSignature = cryptoVerify(null, Buffer.from(lockdownChallengeMessage(proof as LockdownChallengeProof), "utf8"),
      createPublicKey(challenge.public_key_pem), Buffer.from(proof.signature, "base64url"));
  } catch {
    validSignature = false;
  }
  if (!validSignature) return { verified: false, reason: "Native application signature is invalid." };

  // Conditional update makes challenge consumption one-time even under concurrent admissions.
  const { data: consumed, error: consumeError } = await admin.from("exam_lockdown_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (consumeError || !consumed) return { verified: false, reason: "Native challenge was already consumed or expired." };
  return { verified: true, platform: challenge.platform, app_version: challenge.app_version };
}

export function validateLockdownPublicKey(pem: unknown): string | null {
  if (typeof pem !== "string" || pem.length > 4096) return null;
  try {
    const key = createPublicKey(pem);
    return key.asymmetricKeyType === "ed25519" ? pem : null;
  } catch {
    return null;
  }
}
