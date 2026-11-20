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
 * - A short-lived, one-use challenge verifies possession of a per-install OS-protected
 *   signing key bound to the submitted exam, candidate details and session. This is
 *   not publisher identity, secure-boot or remote device attestation.
 * - When Lockdown is disabled, standard web access remains completely unobstructed.
 */

import { randomBytes } from "node:crypto";

export const LOCKDOWN_APP_NAME = "EVALORA Secure Exam Browser";
export const LOCKDOWN_CURRENT_VERSION = "1.1.0";
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
  /** Minimum acceptable version of the desktop application. Default: "1.1.0". */
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
 * Uses the clean format `evalora-lockdown://join/<token>?code=<code>&lockdown=1&secure_browser=1` when an invite token is present,
 * ensuring no shell character issues occur and all target handlers receive explicit secure context markers.
 */
export function buildLockdownLaunchUrl(
  examCodeOrOptions: string | LockdownLaunchOptions,
  candidateCodeOrOptions?: string | LockdownLaunchOptions,
): string {
  let opts: LockdownLaunchOptions;
  if (typeof examCodeOrOptions === "object" && examCodeOrOptions !== null) {
    opts = { ...examCodeOrOptions };
  } else if (typeof candidateCodeOrOptions === "object" && candidateCodeOrOptions !== null) {
    opts = {
      ...candidateCodeOrOptions,
      examCode: candidateCodeOrOptions.examCode || (typeof examCodeOrOptions === "string" ? examCodeOrOptions : undefined),
    };
  } else {
    opts = {
      examCode: typeof examCodeOrOptions === "string" ? examCodeOrOptions : undefined,
      candidateCode: typeof candidateCodeOrOptions === "string" ? candidateCodeOrOptions : undefined,
    };
  }

  let token = opts.token?.trim().replace(/\/+$|%2F+$/i, "");
  if (!token && opts.path) {
    const match = opts.path.match(/\/exam\/join\/([a-zA-Z0-9_-]+)/);
    if (match) {
      token = match[1];
    }
  }
  const code = (opts.examCode || "").trim().toUpperCase();
  const candidate = (opts.candidateCode || "").trim().toUpperCase();

  // If an invitation token is present, use clean path-based scheme evalora-lockdown://join/<token>?code=<code>&lockdown=1&secure_browser=1
  if (token) {
    const url = `${LOCKDOWN_PROTOCOL}://join/${encodeURIComponent(token)}`;
    const params = new URLSearchParams();
    if (code) params.set("code", code);
    if (candidate) params.set("candidate", candidate);
    params.set("lockdown", "1");
    params.set("secure_browser", "1");
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
  params.set("lockdown", "1");
  params.set("secure_browser", "1");
  return `${LOCKDOWN_PROTOCOL}://enter?${params.toString()}`;
}

/**
 * Generates an ephemeral challenge nonce for client handshake.
 */
export function generateLockdownChallenge(): string {
  return randomBytes(16).toString("hex");
}
