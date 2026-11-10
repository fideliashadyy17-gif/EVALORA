/**
 * Pure, shared Examination access rules. Server routes, server-rendered pages
 * and tests use the same parser/validator; no client value is trusted as an
 * authorization decision and no privileged exam data is returned publicly.
 */

export type AccessMode = "shared_link" | "registered_students_only";
export type AttemptPolicy = "single_resume" | "read_only_reentry";
export type IdentityFieldType = "text" | "email" | "number";

export interface IdentityField {
  key: string;
  label: string;
  required: boolean;
  type: IdentityFieldType;
}

export interface ExamAccessSettings {
  accessMode: AccessMode;
  identityFields: IdentityField[];
  eligibleClassIds: string[];
  /** Classes explicitly linked to this examination (settings.linked_class_ids). */
  linkedClassIds: string[];
  attemptPolicy: AttemptPolicy;
  proctoring: boolean;
}

export interface ExamAccessExam {
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  shared_link_enabled: boolean | null;
  invite_expires_at: string | null;
  /** Optional scheduled activation instant (migration 0076). */
  invite_activates_at?: string | null;
  /** Explicit administrator exemption from link expiry. */
  invite_no_expiry?: boolean | null;
}

export interface ExamAccessAvailability {
  ok: boolean;
  error?: string;
  label: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9_]{1,40}$/;
const RESERVED_KEYS = new Set([
  "first_name", "last_name", "class_id", "access_code", "guest_key",
  "consent", "invite_token", "exam_id", "attempt_id",
]);

export function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalizeUuidList(value: unknown): string[] {
  const list: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  return [...new Set(list.filter(validUuid))].slice(0, 100);
}

export function normalizeIdentityFields(value: unknown): IdentityField[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const fields: IdentityField[] = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const key = String(item.key ?? "").trim().toLowerCase();
    if (!KEY_RE.test(key) || RESERVED_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    const type: IdentityFieldType =
      item.type === "email" || item.type === "number" ? item.type : "text";
    fields.push({
      key,
      label: String(item.label ?? key).trim().slice(0, 80) || key,
      required: item.required !== false,
      type,
    });
  }
  return fields;
}

export function parseExamAccessSettings(
  settings: Record<string, unknown> | null | undefined,
): ExamAccessSettings {
  const raw = settings && typeof settings === "object" ? settings : {};
  return {
    accessMode: raw.access_mode === "registered_students_only"
      ? "registered_students_only"
      : "shared_link",
    identityFields: normalizeIdentityFields(raw.identity_fields),
    eligibleClassIds: normalizeUuidList(raw.eligible_class_ids),
    linkedClassIds: normalizeUuidList(raw.linked_class_ids),
    attemptPolicy: raw.attempt_policy === "read_only_reentry"
      ? "read_only_reentry"
      : "single_resume",
    proctoring: raw.proctoring === true,
  };
}

/** Restrict class options to an explicit configured allowlist when present. */
export function mergeEligibleClassIds(base: string[], configured: string[]): string[] {
  if (configured.length === 0) return base;
  const allowed = new Set(configured);
  return base.filter((id) => allowed.has(id));
}

export interface IdentityDataResult {
  ok: boolean;
  data: Record<string, string>;
  error?: string;
}

/** JSONB key order is not significant; compare normalized identity values. */
export function identityDataEqual(a: unknown, b: unknown): boolean {
  const left = a && typeof a === "object" && !Array.isArray(a) ? a as Record<string, unknown> : {};
  const right = b && typeof b === "object" && !Array.isArray(b) ? b as Record<string, unknown> : {};
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.every((key) => String(left[key] ?? "") === String(right[key] ?? ""));
}

/** Validate and whitelist configured identity fields before persistence. */
export function sanitizeIdentityData(
  fields: IdentityField[],
  raw: unknown,
): IdentityDataResult {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const data: Record<string, string> = {};
  for (const field of fields) {
    const value = typeof source[field.key] === "string"
      ? String(source[field.key]).trim().slice(0, 200)
      : "";
    if (field.required && !value) return { ok: false, data: {}, error: `${field.label} is required.` };
    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return { ok: false, data: {}, error: `${field.label} must be a valid email address.` };
    if (field.type === "number" && value && !/^-?\d+(?:\.\d+)?$/.test(value))
      return { ok: false, data: {}, error: `${field.label} must be a number.` };
    if (value) data[field.key] = value;
  }
  return { ok: true, data };
}

/**
 * One source of truth for link-page / API availability checks.
 *
 * `now` is always injected by the caller and must be the SERVER clock. The
 * candidate's device clock is never consulted, so changing it cannot reopen an
 * expired link.
 *
 * Link expiry only ever decides whether a NEW attempt may start. Nothing here
 * looks at, closes or alters an attempt that is already in progress — that
 * separation is what lets a paper continue after its invitation link expires.
 */
export function examAccessAvailability(
  exam: ExamAccessExam,
  now: Date = new Date(),
): ExamAccessAvailability {
  if (!exam.shared_link_enabled) return { ok: false, error: "This examination link is currently closed.", label: "Link closed" };

  const activates = exam.invite_activates_at ? Date.parse(exam.invite_activates_at) : null;
  if (activates !== null && Number.isFinite(activates) && activates > now.getTime())
    return {
      ok: false,
      error: `This examination link is scheduled to open on ${formatUtc(activates)}.`,
      label: `Scheduled ${formatUtc(activates)}`,
    };

  if (!exam.invite_no_expiry && exam.invite_expires_at) {
    const expires = Date.parse(exam.invite_expires_at);
    if (!Number.isFinite(expires) || expires <= now.getTime())
      return {
        ok: false,
        error: exam.invite_expires_at && Number.isFinite(expires)
          ? `This examination link expired on ${formatUtc(expires)} and can no longer start a new attempt.`
          : "This examination link has expired and can no longer start a new attempt.",
        label: "Link expired",
      };
  }

  if (exam.status !== "open")
    return { ok: false, error: "This examination is not open.", label: `Status: ${exam.status}` };
  if (exam.starts_at && Date.parse(exam.starts_at) > now.getTime())
    return { ok: false, error: `This examination opens at ${formatUtc(Date.parse(exam.starts_at))}.`, label: `Opens ${formatUtc(Date.parse(exam.starts_at))}` };
  if (exam.ends_at && Date.parse(exam.ends_at) < now.getTime())
    return { ok: false, error: "This examination window has closed.", label: "Window closed" };
  return { ok: true, label: "Open now" };
}

/** Unambiguous, server-side rendering of an instant for access messages. */
function formatUtc(ms: number): string {
  if (!Number.isFinite(ms)) return "an unknown time";
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function buildInvitationText(input: {
  title: string;
  shareUrl: string;
  accessCode: string;
  availability: string;
  restrictions: string[];
}): string {
  const lines = [
    `EVALORA examination invitation: ${input.title}`,
    `Unique access link: ${input.shareUrl}`,
    `Access code: ${input.accessCode}`,
    `Availability: ${input.availability}`,
  ];
  if (input.restrictions.length) lines.push(`Restrictions: ${input.restrictions.join("; ")}`);
  lines.push("Open the link, enter the code, complete your first and last name and any required identity fields, then follow the instructions to begin.");
  return lines.join("\n");
}
