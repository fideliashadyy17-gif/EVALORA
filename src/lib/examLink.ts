/**
 * Examination-link lifecycle: one pure, shared rule set.
 *
 * The same functions decide what the administrator interface shows (Active /
 * Scheduled / Expired / Disabled) and what the backend enforces when a
 * candidate tries to start a NEW attempt. They are pure — no database, no
 * React, and `now` is always injected — so every boundary can be unit-tested
 * and the server clock is the only clock that can ever matter.
 *
 * An expired or disabled link stops new starts. It never touches an attempt
 * that is already in progress (see `docs/EXAM_RETAKES_AND_LINK_LIFECYCLE.md`).
 */

export type ExamLinkStatus = "active" | "scheduled" | "expired" | "disabled";

export type ExamLinkDurationPreset = "24h" | "7d" | "30d" | "custom" | "none";

/** Stored policy keys: the presets plus the explicit-exemption and backfill markers. */
export type ExamLinkPolicyKey = ExamLinkDurationPreset | "no_expiry_exempt" | "backfilled_30_days";

export interface ExamLinkDuration {
  key: Exclude<ExamLinkDurationPreset, "custom" | "none">;
  label: string;
  hours: number;
}

/** The duration presets the administrator panel offers, in order. */
export const EXAM_LINK_DURATION_PRESETS: readonly ExamLinkDuration[] = [
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 7 * 24 },
  { key: "30d", label: "30 days", hours: 30 * 24 },
] as const;

export interface ExamLinkLifecycleExam {
  shared_link_enabled: boolean | null;
  invite_expires_at: string | null;
  invite_activates_at?: string | null;
  invite_no_expiry?: boolean | null;
  /** Examination status; shown for context but never used to fake "active". */
  status?: string | null;
}

export interface ExamLinkLifecycle {
  status: ExamLinkStatus;
  label: string;
  detail: string;
  /** ISO instant the link stops starting new attempts (null = explicit exemption). */
  expiresAt: string | null;
  /** ISO instant the link starts working (null = immediate). */
  activatesAt: string | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Minimum sensible custom expiry, so a form typo cannot create a dead link. */
export const MIN_LINK_LIFETIME_MS = 5 * MINUTE_MS;
/** Upper bound (2 years) keeps timestamps — and the interface — honest. */
export const MAX_LINK_LIFETIME_MS = 730 * 24 * HOUR_MS;

/**
 * Authoritative lifecycle status. Precedence is deliberate:
 *  1. a manual disable always wins (an operator closed the link);
 *  2. a future activation means Scheduled;
 *  3. a passed (or unreadable) expiration means Expired — an expired link is
 *     never reported as active merely because nobody disabled it;
 *  4. otherwise Active.
 */
export function examLinkLifecycle(
  exam: ExamLinkLifecycleExam,
  now: Date = new Date(),
): ExamLinkLifecycle {
  const expiresAt = exam.invite_expires_at ?? null;
  const activatesAt = exam.invite_activates_at ?? null;
  const nowMs = now.getTime();

  if (exam.shared_link_enabled === false)
    return {
      status: "disabled",
      label: "Disabled",
      detail: "Manually disabled by an administrator. New attempts cannot start; attempts already in progress continue.",
      expiresAt,
      activatesAt,
    };

  const activatesMs = activatesAt ? Date.parse(activatesAt) : null;
  if (activatesMs !== null && Number.isFinite(activatesMs) && activatesMs > nowMs)
    return {
      status: "scheduled",
      label: "Scheduled",
      detail: "The link becomes usable at its activation time. It cannot start an attempt before then.",
      expiresAt,
      activatesAt,
    };

  if (!exam.invite_no_expiry) {
    const expiresMs = expiresAt ? Date.parse(expiresAt) : null;
    if (expiresMs === null)
      return {
        status: "expired",
        label: "Expired",
        detail: "No expiration is stored for this link, so it is treated as expired. Set an expiration to reopen it.",
        expiresAt,
        activatesAt,
      };
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs)
      return {
        status: "expired",
        label: "Expired",
        detail: "The expiration time has passed. New attempts cannot start; submitted attempts and records are unchanged.",
        expiresAt,
        activatesAt,
      };
  }

  return {
    status: "active",
    label: "Active",
    detail: exam.invite_no_expiry
      ? "Active with an explicit no-expiration exemption permitted by platform policy."
      : "Active until the displayed expiration time.",
    expiresAt,
    activatesAt,
  };
}

export interface ExamLinkPolicy {
  /** Whether an administrator may create a permanent link at all. */
  allowNoExpiry: boolean;
  /** Days offered by the interface as the platform default. */
  defaultDays: number;
  /** Kept for forward compatibility with the stored policy object. */
  linkRequiresExpiry: boolean;
}

export const DEFAULT_EXAM_LINK_POLICY: ExamLinkPolicy = {
  allowNoExpiry: false,
  defaultDays: 30,
  linkRequiresExpiry: true,
};

/** Parse the stored `exam_link_policy` platform setting defensively. */
export function parseExamLinkPolicy(value: unknown): ExamLinkPolicy {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const days = Number(raw.default_days);
  return {
    allowNoExpiry: raw.allow_no_expiry === true,
    defaultDays: Number.isFinite(days) && days >= 1 && days <= 365 ? Math.floor(days) : DEFAULT_EXAM_LINK_POLICY.defaultDays,
    linkRequiresExpiry: raw.link_requires_expiry !== false,
  };
}

/** Instant for a preset duration, measured from the server's "now". */
export function expirationFromPreset(
  preset: Exclude<ExamLinkDurationPreset, "custom" | "none">,
  from: Date = new Date(),
): string {
  const duration = EXAM_LINK_DURATION_PRESETS.find((item) => item.key === preset);
  const hours = duration?.hours ?? DEFAULT_EXAM_LINK_POLICY.defaultDays * 24;
  return new Date(from.getTime() + hours * HOUR_MS).toISOString();
}

export interface LinkExpiryResolution {
  ok: boolean;
  expiresAt: string | null;
  policyKey: ExamLinkPolicyKey;
  error?: string;
}

/**
 * Validates what an administrator submitted for an expiry and returns the UTC
 * instant to store. There is no silent "permanent" outcome: `none` is only
 * accepted when the platform policy explicitly permits it.
 *
 * Form contract:
 *  - `mode` = "preset"  → `preset` is one of 24h / 7d / 30d
 *  - `mode` = "custom"  → `custom` is a datetime-local / ISO string
 *  - `mode` = "none"    → no expiration (policy-gated)
 */
export function resolveLinkExpiry(
  input: { mode: string; preset?: string | null; custom?: string | null },
  options: { now?: Date; policy?: ExamLinkPolicy } = {},
): LinkExpiryResolution {
  const now = options.now ?? new Date();
  const policy = options.policy ?? DEFAULT_EXAM_LINK_POLICY;
  const mode = String(input.mode ?? "").trim();

  if (mode === "none") {
    if (!policy.allowNoExpiry)
      return {
        ok: false,
        expiresAt: null,
        policyKey: "none",
        error: "Platform policy does not allow permanent examination links. Choose 24 hours, 7 days, 30 days or a custom date.",
      };
    return { ok: true, expiresAt: null, policyKey: "none" };
  }

  if (mode === "custom") {
    const raw = String(input.custom ?? "").trim();
    if (!raw) return { ok: false, expiresAt: null, policyKey: "custom", error: "Enter the custom expiration date and time." };
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return { ok: false, expiresAt: null, policyKey: "custom", error: "That expiration date and time is not readable." };
    if (ms < now.getTime() + MIN_LINK_LIFETIME_MS)
      return { ok: false, expiresAt: null, policyKey: "custom", error: "The expiration must be at least 5 minutes in the future (server time)." };
    if (ms > now.getTime() + MAX_LINK_LIFETIME_MS)
      return { ok: false, expiresAt: null, policyKey: "custom", error: "The expiration must be within two years." };
    return { ok: true, expiresAt: new Date(ms).toISOString(), policyKey: "custom" };
  }

  const preset = String(input.preset ?? "").trim();
  const duration = EXAM_LINK_DURATION_PRESETS.find((item) => item.key === preset);
  if (!duration)
    return {
      ok: false,
      expiresAt: null,
      policyKey: "30d",
      error: "Choose an expiration duration: 24 hours, 7 days, 30 days or a custom date.",
    };
  return { ok: true, expiresAt: expirationFromPreset(duration.key, now), policyKey: duration.key };
}

/** Human label for a stored policy key. */
export function linkPolicyLabel(policyKey: string | null | undefined): string {
  switch (policyKey) {
    case "24h": return "24 hours";
    case "7d": return "7 days";
    case "30d": return "30 days";
    case "custom": return "Custom date & time";
    case "no_expiry_exempt": return "No expiration (policy exemption)";
    case "backfilled_30_days": return "30 days (backfilled by policy)";
    default: return "Not recorded";
  }
}

/**
 * A reactivated link needs a genuinely valid future expiration. Returns the
 * value to store, or an error the administrator can act on.
 */
export function reactivationExpiry(
  exam: { invite_expires_at: string | null; invite_no_expiry?: boolean | null; invite_expiry_policy?: string | null },
  input: { mode?: string; preset?: string | null; custom?: string | null },
  options: { now?: Date; policy?: ExamLinkPolicy } = {},
): LinkExpiryResolution {
  const now = options.now ?? new Date();
  const existingMs = exam.invite_expires_at ? Date.parse(exam.invite_expires_at) : NaN;
  const mode = String(input.mode ?? "").trim();
  // No new choice supplied: reuse the stored expiration only if it is still valid.
  if (!mode) {
    if (exam.invite_no_expiry)
      return { ok: true, expiresAt: null, policyKey: "no_expiry_exempt" };
    if (Number.isFinite(existingMs) && existingMs > now.getTime() + MIN_LINK_LIFETIME_MS)
      return { ok: true, expiresAt: new Date(existingMs).toISOString(), policyKey: (exam.invite_expiry_policy ?? "custom") as ExamLinkPolicyKey };
    return {
      ok: false,
      expiresAt: null,
      policyKey: "custom",
      error: "This link's expiration has passed. Set a new expiration before reactivating it.",
    };
  }
  return resolveLinkExpiry({ mode, preset: input.preset, custom: input.custom }, options);
}

/** Seconds remaining, for the administrator/interface countdown copy. */
export function linkTimeRemaining(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms - now.getTime()) / 1000);
}
