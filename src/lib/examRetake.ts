/**
 * Controlled examination retakes — the pure decision rules.
 *
 * A submitted attempt is locked forever. The only way to sit the examination
 * again is an explicit Super Admin approval that authorizes a bounded number
 * of NEW attempts, each with its own identifier. These functions decide what a
 * student may do and what the backend must allow; they never mutate anything,
 * so the route, the server action and the tests all agree.
 */

export type RetakeRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export const RETAKE_REQUEST_STATUSES: readonly RetakeRequestStatus[] = [
  "pending", "approved", "rejected", "cancelled",
] as const;

export function isRetakeRequestStatus(value: unknown): value is RetakeRequestStatus {
  return typeof value === "string" && (RETAKE_REQUEST_STATUSES as readonly string[]).includes(value);
}

export interface RetakeRequestView {
  id: string;
  status: RetakeRequestStatus;
  created_at: string;
  decided_at?: string | null;
  decision_note?: string | null;
  reason?: string | null;
  granted_attempts?: number | null;
  access_expires_at?: string | null;
}

export interface RetakeGrant {
  request: RetakeRequestView;
  attemptsGranted: number;
  attemptsUsed: number;
  remaining: number;
  windowOpen: boolean;
  accessExpiresAt: string | null;
}

export interface RetakeStateInput {
  attemptStatus: string;
  attemptNumber: number;
  /** Requests for this candidate + examination, newest first (or any order). */
  requests: RetakeRequestView[];
  /** How many attempts each approved request has already authorized. */
  attemptsUsedByRequest?: Record<string, number>;
  now?: Date;
}

export interface RetakeState {
  submitted: boolean;
  attemptNumber: number;
  attemptLabel: string;
  pending: RetakeRequestView | null;
  latestDecision: RetakeRequestView | null;
  canRequest: boolean;
  canStartAuthorizedRetake: boolean;
  grant: RetakeGrant | null;
  message: string;
}

/** "First attempt", "Second attempt", "Third attempt", then numerals. */
export function attemptLabel(attemptNumber: number): string {
  const n = Number.isFinite(attemptNumber) && attemptNumber > 0 ? Math.floor(attemptNumber) : 1;
  switch (n) {
    case 1: return "First attempt";
    case 2: return "Second attempt";
    case 3: return "Third attempt";
    case 4: return "Fourth attempt";
    case 5: return "Fifth attempt";
    default: return `Attempt ${n}`;
  }
}

/** Trim a student's reason to a safe, storable value. */
export function sanitizeRetakeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2000);
}

function byNewest(a: RetakeRequestView, b: RetakeRequestView): number {
  return Date.parse(b.created_at) - Date.parse(a.created_at);
}

/**
 * Whether an approval still authorizes a new attempt.
 *
 * Three conditions, all required: the request is approved, attempts remain
 * under its policy (one by default), and the access window the Super Admin
 * chose has not closed. An expired or disabled public link is deliberately NOT
 * part of this decision — the approval is the authorization.
 */
export function usableGrant(
  request: RetakeRequestView,
  options: { attemptsUsed?: number; now?: Date } = {},
): RetakeGrant | null {
  if (request.status !== "approved") return null;
  const now = options.now ?? new Date();
  const granted = Math.max(1, Math.min(3, Math.floor(Number(request.granted_attempts ?? 1))));
  const used = Math.max(0, Math.floor(Number(options.attemptsUsed ?? 0)));
  const remaining = Math.max(0, granted - used);
  const windowMs = request.access_expires_at ? Date.parse(request.access_expires_at) : NaN;
  const windowOpen = Number.isFinite(windowMs) && windowMs > now.getTime();
  return {
    request,
    attemptsGranted: granted,
    attemptsUsed: used,
    remaining,
    windowOpen,
    accessExpiresAt: request.access_expires_at ?? null,
  };
}

/**
 * The single state machine the student interface and the API share.
 *
 * - a paper still in progress cannot request anything;
 * - a pending request blocks duplicates;
 * - an approved, unused, in-window approval enables the authorized attempt;
 * - once a grant is used up or its window closes, the student is locked again
 *   and must request a NEW approval.
 */
export function retakeState(input: RetakeStateInput): RetakeState {
  const now = input.now ?? new Date();
  const requests = [...(input.requests ?? [])].sort(byNewest);
  const submitted = input.attemptStatus !== "in_progress";
  const label = attemptLabel(input.attemptNumber);
  const pending = requests.find((r) => r.status === "pending") ?? null;
  const latestDecision = requests.find((r) => r.status !== "pending") ?? null;

  const grants = requests
    .filter((r) => r.status === "approved")
    .map((r) => usableGrant(r, { attemptsUsed: input.attemptsUsedByRequest?.[r.id] ?? 0, now }))
    .filter((g): g is RetakeGrant => g !== null);

  const activeGrant = grants.find((g) => g.remaining > 0 && g.windowOpen) ?? null;
  const closedGrant = grants.find((g) => g.remaining > 0 && !g.windowOpen) ?? null;

  let message: string;
  let canRequest: boolean;
  if (!submitted) {
    canRequest = false;
    message = "Your paper is still open. Requesting a retake is only possible after you have submitted.";
  } else if (pending) {
    canRequest = false;
    message = "Your retake request has been sent and is awaiting Super Admin approval.";
  } else if (activeGrant) {
    canRequest = false;
    message = `A retake has been approved. You may start ${attemptLabel(input.attemptNumber + 1).toLowerCase()} before the access window closes.`;
  } else if (closedGrant) {
    canRequest = true;
    message = "The access window for your approved retake has closed. You may request another retake.";
  } else if (grants.length && grants.every((g) => g.remaining === 0)) {
    canRequest = true;
    message = "Your approved retake has already been used. If you need another attempt, request a new retake.";
  } else if (latestDecision?.status === "rejected") {
    canRequest = true;
    message = "Your last retake request was rejected. You may submit a new request if your situation changes.";
  } else if (latestDecision?.status === "cancelled") {
    canRequest = true;
    message = "Your retake request was cancelled. You may submit a new request.";
  } else {
    canRequest = true;
    message = "This attempt is submitted and locked. You can request a retake, which requires Super Admin approval.";
  }

  return {
    submitted,
    attemptNumber: input.attemptNumber,
    attemptLabel: label,
    pending,
    latestDecision,
    canRequest,
    canStartAuthorizedRetake: Boolean(activeGrant),
    grant: activeGrant ?? closedGrant ?? grants[0] ?? null,
    message,
  };
}

/** Presets offered when a Super Admin approves access to a retake. */
export const RETAKE_ACCESS_PRESETS = [
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 7 * 24 },
  { key: "30d", label: "30 days", hours: 30 * 24 },
] as const;

export const MIN_RETAKE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_RETAKE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Resolve the access window a Super Admin grants on approval. The window is
 * what keeps a retake available when the public link has expired or been
 * disabled; it never bypasses the examination's own open status.
 */
export function resolveRetakeAccessWindow(
  input: { mode?: string | null; preset?: string | null; custom?: string | null },
  now: Date = new Date(),
): { ok: boolean; expiresAt: string | null; error?: string } {
  const mode = String(input.mode ?? "preset").trim();
  if (mode === "custom") {
    const raw = String(input.custom ?? "").trim();
    if (!raw) return { ok: false, expiresAt: null, error: "Enter the custom access-window end date and time." };
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return { ok: false, expiresAt: null, error: "That access-window date and time is not readable." };
    if (ms < now.getTime() + MIN_RETAKE_WINDOW_MS) return { ok: false, expiresAt: null, error: "The access window must end at least one hour from now (server time)." };
    if (ms > now.getTime() + MAX_RETAKE_WINDOW_MS) return { ok: false, expiresAt: null, error: "The access window must end within 90 days." };
    return { ok: true, expiresAt: new Date(ms).toISOString() };
  }
  const presetKey = String(input.preset ?? "7d").trim();
  const preset = RETAKE_ACCESS_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return { ok: false, expiresAt: null, error: "Choose an access window: 24 hours, 7 days, 30 days or a custom date." };
  return { ok: true, expiresAt: new Date(now.getTime() + preset.hours * 60 * 60 * 1000).toISOString() };
}

/** The access window applies to the retake only; the original attempt is untouched. */
export function grantWindowLabel(accessExpiresAt: string | null): string {
  if (!accessExpiresAt) return "No access window recorded";
  const ms = Date.parse(accessExpiresAt);
  if (!Number.isFinite(ms)) return "Unreadable access window";
  return `Start by ${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Student-facing decision copy, including the optional note. */
export function decisionMessage(request: RetakeRequestView): string {
  if (request.status === "approved")
    return `Approved${request.decided_at ? ` on ${new Date(request.decided_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}. ${grantWindowLabel(request.access_expires_at ?? null)}.`;
  if (request.status === "rejected")
    return `Rejected${request.decided_at ? ` on ${new Date(request.decided_at).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}.${request.decision_note ? ` Reason: ${request.decision_note}` : ""}`;
  if (request.status === "cancelled") return "Cancelled by the student.";
  return "Awaiting Super Admin approval.";
}

/** Attempts an approval may authorize. Explicit, bounded, never unlimited. */
export function normalizeGrantedAttempts(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(3, n);
}
