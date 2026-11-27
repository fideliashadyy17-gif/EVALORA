import "server-only";

/**
 * Proctoring configuration — the `proctoring` namespace, resolved for one
 * examination or organization, plus an honest capability report.
 *
 * Three rules shape this module:
 *
 *   1. **A control is never presented as working when it is not.** Continuous
 *      audio/video recording depends on a LiveKit media pipeline provisioned
 *      per organization and on explicit candidate consent. Where that is not in
 *      place the capability report says so in plain words, and the setting is
 *      read-only in the Control Center rather than a switch that appears to do
 *      something.
 *
 *   2. **An examination's own policy always wins.** `exams.settings.integrity`
 *      is the authored policy for that paper. Configuration supplies the
 *      *defaults* used when an examination did not set a value, so changing a
 *      threshold here cannot silently alter the conditions a candidate already
 *      agreed to on a live paper.
 *
 *   3. **Privacy.** Nothing here exposes recordings or incident evidence. It
 *      resolves policy numbers and check requirements only; evidence access is
 *      decided by the existing RBAC + module entitlement chain, unchanged.
 */
import { getProctoringConfig } from "@/lib/config/service";
import {
  DEFAULT_INTEGRITY_POLICY,
  parseIntegrityPolicy,
  type IntegrityPolicy,
} from "@/lib/integrity";
import { moduleEnabled } from "@/lib/modules";
import { getEntitlement } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/server";

export interface ResolvedProctoringConfig {
  /** Ask the candidate for camera permission during the pre-exam check. */
  requireCameraCheck: boolean;
  /** Ask the candidate for microphone permission during the pre-exam check. */
  requireMicrophoneCheck: boolean;
  /** Record browser, screen and device attributes at admission. */
  requireBrowserCheck: boolean;
  /** Tab departures allowed before an incident is raised for review. */
  maxTabSwitchWarnings: number;
  /** Open incidents on one attempt at which a supervisor is alerted. */
  incidentAlertThreshold: number;
  /** An incident needs a documented decision + reason before it can close. */
  evidenceReviewRequired: boolean;
  /** Platform-wide continuous recording flag (reported, see capability report). */
  continuousRecordingEnabled: boolean;
}

/** The shipped behaviour, used when configuration cannot be read. */
export const PROCTORING_FALLBACKS: ResolvedProctoringConfig = {
  requireCameraCheck: true,
  requireMicrophoneCheck: false,
  requireBrowserCheck: true,
  maxTabSwitchWarnings: DEFAULT_INTEGRITY_POLICY.warnAfter,
  incidentAlertThreshold: DEFAULT_INTEGRITY_POLICY.reviewAfter,
  evidenceReviewRequired: true,
  continuousRecordingEnabled: false,
};

/**
 * Resolve proctoring configuration for one organization (or the platform when
 * `organizationId` is null). Never throws: an unreachable configuration store
 * yields the shipped defaults, because failing to read a threshold must not
 * stop a candidate from being admitted.
 */
export async function resolveProctoringConfig(
  organizationId?: string | null,
): Promise<ResolvedProctoringConfig> {
  try {
    const cfg = await getProctoringConfig(organizationId ?? null);
    return {
      requireCameraCheck: cfg.require_camera_check !== false,
      requireMicrophoneCheck: cfg.require_microphone_check === true,
      requireBrowserCheck: cfg.require_browser_check !== false,
      maxTabSwitchWarnings: bounded(cfg.max_tab_switch_warnings, 1, 20, PROCTORING_FALLBACKS.maxTabSwitchWarnings),
      incidentAlertThreshold: bounded(cfg.incident_alert_threshold, 1, 50, PROCTORING_FALLBACKS.incidentAlertThreshold),
      evidenceReviewRequired: cfg.evidence_review_required !== false,
      continuousRecordingEnabled: cfg.continuous_recording_enabled === true,
    };
  } catch {
    return { ...PROCTORING_FALLBACKS };
  }
}

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Apply configured defaults to an examination's stored integrity policy.
 *
 * Precedence is unchanged from before this existed: anything the examination
 * itself set in `settings.integrity` is used verbatim. Only fields the
 * examination left unset fall back to the configured thresholds instead of the
 * compiled-in constants. A candidate sitting an examination that was already
 * published therefore sees the same conditions they agreed to.
 */
export function integrityPolicyWithConfiguredDefaults(
  examIntegritySettings: unknown,
  cfg: ResolvedProctoringConfig,
): IntegrityPolicy {
  const source =
    examIntegritySettings && typeof examIntegritySettings === "object" && !Array.isArray(examIntegritySettings)
      ? (examIntegritySettings as Record<string, unknown>)
      : {};

  // parseIntegrityPolicy already falls back to DEFAULT_INTEGRITY_POLICY for
  // anything missing; here we substitute the CONFIGURED default for the two
  // thresholds an administrator can change, but only where the examination did
  // not state its own.
  const policy = parseIntegrityPolicy(source);
  const configured: IntegrityPolicy = {
    ...policy,
    warnAfter: hasOwnNumber(source.warnAfter) ? policy.warnAfter : cfg.maxTabSwitchWarnings,
    reviewAfter: hasOwnNumber(source.reviewAfter) ? policy.reviewAfter : Math.max(cfg.incidentAlertThreshold, cfg.maxTabSwitchWarnings + 1),
  };
  return configured;
}

function hasOwnNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

// ─────────────────────────── capability report ─────────────────────────────

export interface ProctoringCapability {
  key: string;
  label: string;
  /** Whether EVALORA can actually enforce this today. */
  operational: boolean;
  /** What the setting currently resolves to. */
  status: string;
  /** Plain-language explanation when not operational. */
  explanation?: string;
}

/**
 * An honest report of what proctoring can and cannot do on this deployment.
 *
 * Every entry states whether the capability is operational. The Control Center
 * renders non-operational capabilities as a report, never as a control, so an
 * administrator is never left believing a switch works when the integration
 * behind it does not exist.
 */
export async function proctoringCapabilityReport(
  organizationId?: string | null,
): Promise<ProctoringCapability[]> {
  const cfg = await resolveProctoringConfig(organizationId);

  let proctoringModuleOn = false;
  let livekitConfigured = false;
  try {
    const admin = createAdminClient();
    const entitlement = organizationId ? await getEntitlement(admin, organizationId) : null;
    proctoringModuleOn = entitlement ? moduleEnabled(entitlement.modules, "proctoring") : true;
  } catch {
    proctoringModuleOn = false;
  }
  livekitConfigured = Boolean(
    process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.NEXT_PUBLIC_LIVEKIT_URL,
  );

  return [
    {
      key: "device_checks",
      label: "Camera, microphone and browser checks at admission",
      operational: true,
      status: [
        cfg.requireCameraCheck ? "camera requested" : "camera not requested",
        cfg.requireMicrophoneCheck ? "microphone requested" : "microphone not requested",
        cfg.requireBrowserCheck ? "browser/device attributes recorded" : "browser check off",
      ].join(" · "),
    },
    {
      key: "integrity_monitoring",
      label: "Tab-switch, focus and full-screen monitoring",
      operational: true,
      status: `Warning after ${cfg.maxTabSwitchWarnings} departure(s); incident raised for review at ${cfg.incidentAlertThreshold}.`,
    },
    {
      key: "incident_review",
      label: "Documented review before an incident is closed",
      operational: true,
      status: cfg.evidenceReviewRequired
        ? "Required — a reviewer must record a decision and a reason."
        : "Not required — incidents can be closed without a documented decision.",
    },
    {
      key: "live_proctoring_room",
      label: "Live proctoring room (LiveKit)",
      operational: proctoringModuleOn && livekitConfigured,
      status: proctoringModuleOn
        ? livekitConfigured
          ? "Available — credentials configured for this deployment."
          : "Unavailable — LiveKit credentials are not configured."
        : "Unavailable — the proctoring module is not enabled on this plan.",
      explanation:
        !proctoringModuleOn || !livekitConfigured
          ? "A live room needs both the proctoring module on the organization's plan and LiveKit credentials in the environment. Until both exist, room controls are reported as unavailable rather than shown as working."
          : undefined,
    },
    {
      key: "continuous_recording",
      label: "Continuous audio/video recording",
      operational: false,
      status: cfg.continuousRecordingEnabled
        ? "Flag is on, but no recording pipeline exists on this deployment."
        : "Off. No recording pipeline exists on this deployment.",
      explanation:
        "Continuous recording is NOT OPERATIONAL here. It requires a provisioned media pipeline, a storage and retention implementation, and explicit candidate consent capture — none of which exist yet. The flag is retained so the intention is recorded, and it is read-only in the Control Center so nobody can believe they have switched recording on. Per-organization live rooms continue to work where LiveKit credentials are configured.",
    },
  ];
}

/** Device-check requirements to hand to the candidate admission screen. */
export interface DeviceCheckRequirements {
  camera: boolean;
  microphone: boolean;
  browser: boolean;
  /** Human-readable list of what the candidate will be asked for. */
  summary: string[];
}

export function deviceCheckRequirements(cfg: ResolvedProctoringConfig): DeviceCheckRequirements {
  const summary: string[] = [];
  if (cfg.requireBrowserCheck) summary.push("Browser, screen and device details");
  if (cfg.requireCameraCheck) summary.push("Camera permission");
  if (cfg.requireMicrophoneCheck) summary.push("Microphone permission");
  return {
    camera: cfg.requireCameraCheck,
    microphone: cfg.requireMicrophoneCheck,
    browser: cfg.requireBrowserCheck,
    summary,
  };
}
