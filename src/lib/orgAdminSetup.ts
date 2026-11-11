import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Organization owner setup codes.
 *
 * A code is generated once, shown once, stored only as a SHA-256 hash, expires
 * after a short window and can be redeemed a single time. Redeeming it creates
 * the institution's first Organization Owner account — no global console
 * access, and no password ever persisted by EVALORA.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SETUP_CODE_LENGTH = 24;
export const SETUP_CODE_TTL_HOURS = 72;

/** Cryptographically random, human-transcribable code (no 0/O/1/I). */
export function generateSetupCode(): string {
  const bytes = randomBytes(SETUP_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < SETUP_CODE_LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

/** Normalizes user input before hashing (spaces and dashes are ignored). */
export function normalizeSetupCode(input: string | null | undefined): string {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function hashSetupCode(code: string | null | undefined): string {
  return createHash("sha256").update(normalizeSetupCode(code)).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function setupCodeMatches(code: string | null | undefined, storedHash: string | null | undefined): boolean {
  const candidate = Buffer.from(hashSetupCode(code), "hex");
  const expected = Buffer.from(String(storedHash ?? ""), "hex");
  if (candidate.length === 0 || candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export interface SetupRecord {
  used_at?: string | Date | null;
  expires_at?: string | Date | null;
}

export type SetupState = "usable" | "used" | "expired" | "missing";

export function setupRecordState(record: SetupRecord | null | undefined, now: Date = new Date()): SetupState {
  if (!record) return "missing";
  if (record.used_at) return "used";
  const expires = record.expires_at ? new Date(record.expires_at).getTime() : 0;
  if (!expires || Number.isNaN(expires) || expires <= now.getTime()) return "expired";
  return "usable";
}

export function setupExpiryFrom(now: Date = new Date(), hours = SETUP_CODE_TTL_HOURS): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** Human-readable explanation for the setup page. */
export function setupStateMessage(state: SetupState): string {
  switch (state) {
    case "used":
      return "This setup link has already been used. Sign in with the administrator account it created, or ask the EVALORA platform team for a new link.";
    case "expired":
      return "This setup link has expired. Ask the EVALORA platform team to issue a new one for your institution.";
    case "missing":
      return "This setup link is not valid. Check the full link, or ask the EVALORA platform team to issue a new one.";
    default:
      return "";
  }
}
