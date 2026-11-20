/**
 * Optional Secure Lockdown Examination Environment
 *
 * EVALORA Secure Exam Application integration and verification layer.
 *
 * Architecture & Scope:
 * - Lockdown Mode is strictly optional and configurable per-examination.
 * - Standard web browsers cannot reliably block OS-level shortcuts (Alt+Tab, Win),
 *   third-party applications (Discord, OBS, TeamViewer), or secondary monitors.
 * - For examinations requiring a verified secure environment, EVALORA integrates
 *   with the dedicated EVALORA Secure Exam Application (desktop app built for
 *   Windows and cross-platform desktop environments).
 * - Cryptographic attestation verifies that the candidate is executing inside
 *   the genuine Secure Exam Application before granting admission.
 * - When Lockdown is disabled, standard web access remains completely unobstructed.
 */

import { createHmac, randomBytes } from "node:crypto";

export const LOCKDOWN_APP_NAME = "EVALORA Secure Exam Browser";
export const LOCKDOWN_CURRENT_VERSION = "1.0.0";
export const LOCKDOWN_PROTOCOL = "evalora-lockdown";
export const LOCKDOWN_DOWNLOAD_PATH = "/download/secure-browser";

export interface ExamLockdownSettings {
  /** Master switch: whether this specific examination requires the Secure Exam Application. Default: false. */
  enabled: boolean;
  /** Whether student access from standard browsers is strictly denied when enabled. Default: true. */
  require_app: boolean;
  /** Whether multi-display setups are disallowed (enforces single monitor). Default: true. */
  strict_multi_display: boolean;
  /** Whether in-app clipboard isolation is strictly enforced. Default: true. */
  block_clipboard: boolean;
  /** Minimum acceptable version of the desktop application. Default: "1.0.0". */
  min_app_version: string;
}

export const DEFAULT_LOCKDOWN_SETTINGS: ExamLockdownSettings = {
  enabled: false,
  require_app: true,
  strict_multi_display: true,
  block_clipboard: true,
  min_app_version: LOCKDOWN_CURRENT_VERSION,
};

/**
 * Tolerant reader for `exams.settings.lockdown`.
 * Always defaults to disabled (`enabled: false`) unless explicitly configured.
 */
export function parseLockdownSettings(raw: unknown): ExamLockdownSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_LOCKDOWN_SETTINGS };
  }
  const source = raw as Record<string, unknown>;
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : false,
    require_app: typeof source.require_app === "boolean" ? source.require_app : true,
    strict_multi_display: typeof source.strict_multi_display === "boolean" ? source.strict_multi_display : true,
    block_clipboard: typeof source.block_clipboard === "boolean" ? source.block_clipboard : true,
    min_app_version: typeof source.min_app_version === "string" ? source.min_app_version : LOCKDOWN_CURRENT_VERSION,
  };
}

/** Check if an exam or settings object requires lockdown. */
export function isExamLockdownActive(settingsOrExam: unknown): boolean {
  if (!settingsOrExam) return false;
  if (typeof settingsOrExam === "object" && "settings" in (settingsOrExam as Record<string, unknown>)) {
    const exam = settingsOrExam as { settings?: unknown };
    return parseLockdownSettings((exam.settings as Record<string, unknown> | null)?.lockdown).enabled;
  }
  return parseLockdownSettings(settingsOrExam).enabled;
}

export interface LockdownAttestationPayload {
  timestamp: number;
  exam_code: string;
  candidate_code?: string;
  platform: string;
  app_version: string;
  signature: string;
  nonce?: string;
}

export interface LockdownVerificationResult {
  verified: boolean;
  reason?: string;
  platform?: string;
  app_version?: string;
}

// Runtime shared attestation secret (can be overridden via environment variable)
const LOCKDOWN_SHARED_SECRET =
  process.env.EVALORA_LOCKDOWN_SECRET || "evalora_sec_k982_lockdown_auth_token_2026_IB";

/**
 * Compute HMAC-SHA256 signature for lockdown attestation.
 */
export function computeLockdownSignature(
  timestamp: number,
  examCode: string,
  platform: string,
  appVersion: string,
  nonce: string = "",
): string {
  const message = `${timestamp}:${examCode.trim().toUpperCase()}:${platform.toLowerCase()}:${appVersion}:${nonce}`;
  return createHmac("sha256", LOCKDOWN_SHARED_SECRET).update(message).digest("hex");
}

/**
 * Verify cryptographic attestation from the EVALORA Secure Exam Application.
 * Guards against:
 * 1. Replay attacks (timestamp must be within 5-minute sliding window)
 * 2. Exam code tampering
 * 3. Outdated application versions
 * 4. Fake client headers
 */
export function verifyLockdownAttestation(
  payload: Partial<LockdownAttestationPayload> | null | undefined,
  expectedExamCode: string,
  options?: { minVersion?: string; maxAgeMs?: number },
): LockdownVerificationResult {
  if (!payload || typeof payload !== "object") {
    return { verified: false, reason: "Missing lockdown attestation payload." };
  }

  const { timestamp, exam_code, platform, app_version, signature, nonce } = payload;

  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return { verified: false, reason: "Invalid timestamp in lockdown attestation." };
  }

  const maxAge = options?.maxAgeMs ?? 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  if (Math.abs(now - timestamp) > maxAge) {
    return { verified: false, reason: "Lockdown attestation timestamp expired. Please check your system clock." };
  }

  if (!exam_code || exam_code.trim().toUpperCase() !== expectedExamCode.trim().toUpperCase()) {
    return { verified: false, reason: "Lockdown attestation exam code mismatch." };
  }

  const validPlatform = typeof platform === "string" && ["win32", "darwin", "linux"].includes(platform.toLowerCase());
  if (!validPlatform) {
    return { verified: false, reason: "Unsupported or unrecognized client operating system platform." };
  }

  if (!app_version || typeof app_version !== "string") {
    return { verified: false, reason: "Missing application version in attestation." };
  }

  const minVersion = options?.minVersion || LOCKDOWN_CURRENT_VERSION;
  if (app_version.localeCompare(minVersion, undefined, { numeric: true, sensitivity: "base" }) < 0) {
    return { verified: false, reason: `EVALORA Secure Exam Browser is outdated (v${app_version}). Please update to v${minVersion} or higher.` };
  }

  if (!signature || typeof signature !== "string") {
    return { verified: false, reason: "Missing cryptographic signature in lockdown attestation." };
  }

  const expectedSig = computeLockdownSignature(timestamp, expectedExamCode, platform, app_version, nonce ?? "");
  if (signature.toLowerCase() !== expectedSig.toLowerCase()) {
    return { verified: false, reason: "Cryptographic signature validation failed. Untrusted environment." };
  }

  return {
    verified: true,
    platform: platform.toLowerCase(),
    app_version,
  };
}

export interface LockdownLaunchOptions {
  examCode?: string;
  candidateCode?: string;
  token?: string;
  path?: string;
}

/**
 * Generate a custom deep-link URI to launch the exam directly inside the desktop application.
 * Preserves the original examination context (e.g. invite token or exact link path)
 * so students land on their specific examination join page instead of a generic check-in screen.
 *
 * Uses the clean format `evalora-lockdown://join/<token>?code=<code>` when an invite token is present,
 * ensuring no shell character issues (such as unescaped & in Windows batch files) occur.
 */
export function buildLockdownLaunchUrl(
  examCodeOrOptions: string | LockdownLaunchOptions,
  candidateCode?: string,
): string {
  if (typeof examCodeOrOptions === "string") {
    const examCode = examCodeOrOptions.trim().toUpperCase();
    const params = new URLSearchParams();
    if (examCode) params.set("exam", examCode);
    if (candidateCode?.trim()) {
      params.set("candidate", candidateCode.trim().toUpperCase());
    }
    return `${LOCKDOWN_PROTOCOL}://enter?${params.toString()}`;
  }

  const opts = examCodeOrOptions;
  const token = opts.token?.trim().replace(/\/+$|%2F+$/i, "");
  const code = (opts.examCode || "").trim().toUpperCase();
  const candidate = opts.candidateCode?.trim().toUpperCase();

  // If an invitation token is present, use clean path-based scheme evalora-lockdown://join/<token>?code=<code>
  if (token) {
    const url = `${LOCKDOWN_PROTOCOL}://join/${encodeURIComponent(token)}`;
    const params = new URLSearchParams();
    if (code) params.set("code", code);
    if (candidate) params.set("candidate", candidate);
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  const params = new URLSearchParams();
  if (opts.path?.trim()) {
    params.set("path", opts.path.trim());
  }
  if (code) {
    params.set("exam", code);
  }
  if (candidate) {
    params.set("candidate", candidate);
  }
  return `${LOCKDOWN_PROTOCOL}://enter?${params.toString()}`;
}

/**
 * Generates an ephemeral challenge nonce for client handshake.
 */
export function generateLockdownChallenge(): string {
  return randomBytes(16).toString("hex");
}
