/**
 * Pre-examination device checks.
 *
 * The Platform Control Center exposes three proctoring switches —
 * `proctoring.require_camera_check`, `proctoring.require_microphone_check` and
 * `proctoring.require_browser_check` — resolved per organization by
 * `src/lib/proctoringConfig.ts`. This module is the code that makes them do
 * something: it runs the checks in the candidate's own browser at admission and
 * describes the outcome in words the candidate can act on.
 *
 * PRIVACY, DELIBERATELY NARROW
 * ----------------------------
 *   • A media stream is opened only to learn whether permission was granted,
 *     and every track is stopped in the same tick. No frame, no sample and no
 *     recording ever leaves the device: `stopAllTracks()` runs in `finally`, so
 *     it also happens when the probe throws.
 *   • Nothing is uploaded except a handful of bounded words and two screen
 *     dimensions. Never a user-agent string longer than the limit below, never
 *     an IP-derived location, never installed-device enumeration.
 *   • The device-enumeration API is never called. It would expose hardware
 *     identifiers and connected peripherals for no assessment benefit.
 *   • A successful check is NOT recorded anywhere. Only a check the platform
 *     required and could not complete leaves a row, so the review queue holds
 *     problems rather than a surveillance log of every candidate.
 *
 * This file is imported by both client components and the API route, so it must
 * stay free of `server-only`, database and `next/*` imports.
 */

/** Outcome of one device probe, as reported by the candidate's browser. */
export const DEVICE_CHECK_STATUSES = [
  /** Permission granted and the device answered. */
  "granted",
  /** The candidate (or their browser policy) refused permission. */
  "denied",
  /** No such device, or the API does not exist in this browser/context. */
  "unavailable",
  /** The probe failed for another reason, e.g. it never settled. */
  "error",
  /** The platform did not ask for this check. */
  "not_required",
] as const;

export type DeviceCheckStatus = (typeof DEVICE_CHECK_STATUSES)[number];

/** Which checks the platform asks this candidate's browser to run. */
export interface DeviceCheckRequirements {
  camera: boolean;
  microphone: boolean;
  browser: boolean;
}

export const NO_DEVICE_CHECKS: DeviceCheckRequirements = {
  camera: false,
  microphone: false,
  browser: false,
};

/** Browser, screen and connectivity attributes captured at admission. */
export interface BrowserCheckResult {
  name: string;
  version: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  online: boolean;
  /** False when the environment cannot be relied on to sit an examination. */
  supported: boolean;
  /** Plain-language reason when `supported` is false. */
  reason?: string;
}

export interface DeviceCheckResult {
  camera: DeviceCheckStatus;
  microphone: DeviceCheckStatus;
  browser: BrowserCheckResult | null;
  /** ISO timestamp of when the probes finished, or null if none ran. */
  checkedAt: string | null;
}

/** Field limits mirrored by the API route's schema: the wire payload is bounded. */
export const DEVICE_CHECK_LIMITS = {
  name: 40,
  version: 20,
  platform: 40,
  reason: 140,
} as const;

/** How long one media probe may take before it is reported as an error. */
export const DEVICE_PROBE_TIMEOUT_MS = 12_000;

export function deviceChecksRequired(requirements: DeviceCheckRequirements | null | undefined): boolean {
  if (!requirements) return false;
  return Boolean(requirements.camera || requirements.microphone || requirements.browser);
}

function clip(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Identify the browser from `navigator.userAgentData` where available and from
 * the user-agent string otherwise. Deliberately coarse: enough for an
 * invigilator to see "Safari 17 on iPad", never enough to fingerprint.
 */
export function collectBrowserInfo(nav?: Navigator | null): BrowserCheckResult {
  const navigatorRef = nav ?? (typeof navigator === "undefined" ? null : navigator);
  // Match on the whole user-agent string, but store only the bounded fields
  // below: a long or padded agent string must not defeat detection, and the raw
  // string itself is never persisted or uploaded.
  const ua = String(navigatorRef?.userAgent ?? "");

  let name = "Unknown browser";
  let version = "";
  const brands = (
    navigatorRef as unknown as {
      userAgentData?: { brands?: Array<{ brand?: string; version?: string }> };
    } | null
  )?.userAgentData?.brands;
  const known = Array.isArray(brands)
    ? brands.find((b) => /Chrome|Edge|Opera|Firefox|Safari/i.test(String(b?.brand ?? "")))
    : null;
  if (known) {
    name = clip(known.brand, DEVICE_CHECK_LIMITS.name) || name;
    version = clip(known.version, DEVICE_CHECK_LIMITS.version);
  } else if (/Edg\//.test(ua)) {
    name = "Edge";
    version = clip(ua.match(/Edg\/([\d.]+)/)?.[1], DEVICE_CHECK_LIMITS.version);
  } else if (/OPR\//.test(ua)) {
    name = "Opera";
    version = clip(ua.match(/OPR\/([\d.]+)/)?.[1], DEVICE_CHECK_LIMITS.version);
  } else if (/Firefox\//.test(ua)) {
    name = "Firefox";
    version = clip(ua.match(/Firefox\/([\d.]+)/)?.[1], DEVICE_CHECK_LIMITS.version);
  } else if (/Chrome\//.test(ua)) {
    name = "Chrome";
    version = clip(ua.match(/Chrome\/([\d.]+)/)?.[1], DEVICE_CHECK_LIMITS.version);
  } else if (/Safari\//.test(ua)) {
    name = "Safari";
    version = clip(ua.match(/Version\/([\d.]+)/)?.[1], DEVICE_CHECK_LIMITS.version);
  }

  const platform = clip(
    (navigatorRef as unknown as { userAgentData?: { platform?: string } } | null)?.userAgentData?.platform ??
      navigatorRef?.platform ??
      "",
    DEVICE_CHECK_LIMITS.platform,
  );

  // The global `screen` object only exists in a browser; outside one the
  // dimensions stay 0 and are reported as unknown rather than guessed.
  const globalScreen = typeof screen === "undefined" ? null : screen;
  const screenWidth = Number(globalScreen?.width ?? 0);
  const screenHeight = Number(globalScreen?.height ?? 0);
  const online = navigatorRef ? navigatorRef.onLine !== false : true;

  // Unsupported means "this environment cannot be relied on to sit the paper":
  // no way to render it, or no connection to save answers through.
  const secureContext = typeof window === "undefined" ? false : Boolean(window.isSecureContext);
  let supported = true;
  let reason: string | undefined;
  if (!secureContext) {
    supported = false;
    reason = "This page is not served over a secure connection, so answers may not save.";
  } else if (!online) {
    supported = false;
    reason = "No internet connection was detected.";
  } else if (name === "Unknown browser") {
    supported = false;
    reason = "This browser could not be identified.";
  } else if (Number.isFinite(screenWidth) && screenWidth > 0 && screenWidth < 320) {
    supported = false;
    reason = "The screen is too small to display the examination reliably.";
  }

  return {
    name,
    version,
    platform,
    screenWidth: Number.isFinite(screenWidth) ? Math.round(screenWidth) : 0,
    screenHeight: Number.isFinite(screenHeight) ? Math.round(screenHeight) : 0,
    online,
    supported,
    ...(reason ? { reason: clip(reason, DEVICE_CHECK_LIMITS.reason) } : {}),
  };
}

function stopAllTracks(stream: MediaStream | null) {
  try {
    stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* a track that will not stop is not worth failing an admission over */
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * Ask for one media device purely to learn whether it is available.
 *
 * The stream is stopped immediately: EVALORA does not record candidates from
 * the admission screen, and this function must not imply otherwise.
 */
export async function probeMediaDevice(kind: "video" | "audio"): Promise<DeviceCheckStatus> {
  if (typeof navigator === "undefined") return "unavailable";
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") return "unavailable";

  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DOMException("probe timed out", "TimeoutError")), DEVICE_PROBE_TIMEOUT_MS);
    });
    stream = await Promise.race([
      mediaDevices.getUserMedia(kind === "video" ? { video: true } : { audio: true }),
      timeout,
    ]);
    return "granted";
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      return "unavailable";
    }
    return "error";
  } finally {
    if (timer) clearTimeout(timer);
    stopAllTracks(stream);
  }
}

/**
 * Run whichever checks the platform asked for. Never throws: an examination
 * must not become unreachable because a probe misbehaved.
 */
export async function runDeviceChecks(
  requirements: DeviceCheckRequirements | null | undefined,
): Promise<DeviceCheckResult> {
  const needs = requirements ?? NO_DEVICE_CHECKS;
  const camera = needs.camera ? await probeMediaDevice("video").catch(() => "error" as const) : "not_required";
  const microphone = needs.microphone ? await probeMediaDevice("audio").catch(() => "error" as const) : "not_required";
  const browser = needs.browser ? collectBrowserInfo() : null;
  return {
    camera,
    microphone,
    browser,
    checkedAt: deviceChecksRequired(needs) ? new Date().toISOString() : null,
  };
}

/**
 * The checks the platform required that this device could not satisfy.
 *
 * A check that was never required is not a failure, and a browser that reports
 * `supported` is not a failure either — so an organization that switches a
 * check off cannot generate incidents.
 */
export function failedDeviceChecks(
  result: DeviceCheckResult | null | undefined,
  requirements: DeviceCheckRequirements | null | undefined,
): string[] {
  const needs = requirements ?? NO_DEVICE_CHECKS;
  if (!result) return [];
  const failures: string[] = [];
  if (needs.camera && result.camera !== "granted") failures.push("camera");
  if (needs.microphone && result.microphone !== "granted") failures.push("microphone");
  if (needs.browser && (!result.browser || result.browser.supported !== true)) failures.push("browser");
  return failures;
}

/** What the candidate sees, in plain language, for one media probe. */
export function deviceCheckSentence(device: "camera" | "microphone", status: DeviceCheckStatus): string {
  const label = device === "camera" ? "Camera" : "Microphone";
  switch (status) {
    case "granted":
      return `${label} is available. Nothing was recorded.`;
    case "denied":
      return `${label} permission was refused. You can still sit the examination; your invigilator will see that it could not be verified.`;
    case "unavailable":
      return `No ${device} was found on this device. You can still sit the examination.`;
    case "not_required":
      return `${label} is not required for this examination.`;
    default:
      return `${label} could not be checked. You can still sit the examination.`;
  }
}

/**
 * Bounded wire payload for `POST /api/exam/device-check`. Fields that were not
 * required are omitted, so the server can tell "not asked for" from "failed".
 */
export function deviceCheckWirePayload(
  result: DeviceCheckResult | null | undefined,
  requirements: DeviceCheckRequirements | null | undefined,
): {
  camera?: DeviceCheckStatus;
  microphone?: DeviceCheckStatus;
  browser?: {
    name: string;
    version: string;
    platform: string;
    screen_width: number;
    screen_height: number;
    online: boolean;
    supported: boolean;
    reason?: string;
  };
  checked_at?: string;
} | null {
  const needs = requirements ?? NO_DEVICE_CHECKS;
  if (!result || !deviceChecksRequired(needs)) return null;
  const payload: ReturnType<typeof deviceCheckWirePayload> = {};
  if (needs.camera) payload.camera = result.camera;
  if (needs.microphone) payload.microphone = result.microphone;
  if (needs.browser && result.browser) {
    payload.browser = {
      name: clip(result.browser.name, DEVICE_CHECK_LIMITS.name),
      version: clip(result.browser.version, DEVICE_CHECK_LIMITS.version),
      platform: clip(result.browser.platform, DEVICE_CHECK_LIMITS.platform),
      screen_width: Math.max(0, Math.min(100000, Math.round(Number(result.browser.screenWidth) || 0))),
      screen_height: Math.max(0, Math.min(100000, Math.round(Number(result.browser.screenHeight) || 0))),
      online: result.browser.online === true,
      supported: result.browser.supported === true,
      ...(result.browser.supported
        ? {}
        : { reason: clip(result.browser.reason ?? "unsupported environment", DEVICE_CHECK_LIMITS.reason) }),
    };
  }
  if (result.checkedAt) payload.checked_at = clip(result.checkedAt, 40);
  return payload;
}
