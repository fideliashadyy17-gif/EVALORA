/**
 * The notification event registry and template resolution — pure, no imports.
 *
 * EVALORA generates in-app notifications from about a dozen places in the code
 * (a payment is verified, a member is added, a retake is approved…). Until now
 * every one of those places carried its own hard-coded sentence, so the copy a
 * user received could not be changed without a deployment, and the
 * `notification_templates` table created by the Platform Control Center
 * migration was read by nothing.
 *
 * This module is the missing middle layer:
 *
 *   • `NOTIFICATION_EVENTS` declares every event the application can generate,
 *     with the copy it ships as a **built-in default**. The defaults are the
 *     exact strings that were hard-coded at the call sites, so a deployment
 *     that has saved no template behaves identically to before this file
 *     existed.
 *   • `resolveTemplate()` picks the copy for one event: the organization's own
 *     active template, else the platform default template, else the built-in.
 *     Provenance is returned with the result, because "inherited" and "yours"
 *     must be visibly different in the console.
 *   • `validateTemplateDraft()` is the only way a template is accepted for
 *     saving. It rejects an unknown variable rather than storing a token that
 *     would render literally to a user.
 *
 * Rendering is pure string substitution over a closed list of variables. No
 * expression is parsed, no code is executed, and no variable can carry a
 * password, token, secret or credential — the registry is the allowlist.
 *
 * Kept import-free on purpose: the suites execute this file with a bare
 * TypeScript transpile, and every assertion about template resolution is an
 * assertion about shipped code rather than about a mock of it.
 */

// ─────────────────────────────── variables ─────────────────────────────────

/**
 * The closed set of values a template may interpolate.
 *
 * Each entry says where the value comes from, because a template author has to
 * be able to tell "the candidate's name" from "the name the requester typed"
 * without reading the code. Nothing here is a secret: no password, no
 * invitation token, no access-code hash, no API key, no proof-of-payment URL.
 */
export interface NotificationVariableDef {
  /** Bare name, as it appears inside `{{ }}`. Lowercase letters and `_` only. */
  name: string;
  /** The token as an author types it. */
  token: string;
  label: string;
  /** Where the value comes from — shown in the console next to the token. */
  source: string;
  example: string;
  /**
   * True when the value is a whole optional sentence composed in code (empty
   * when it does not apply). A clause exists so an edited template can never
   * produce dangling punctuation such as "Retake code: ." — the clause's own
   * wording stays in code, the sentence around it stays editable.
   */
  clause?: boolean;
}

export const NOTIFICATION_VARIABLES: readonly NotificationVariableDef[] = [
  {
    name: "organization_name",
    token: "{{organization_name}}",
    label: "Organization name",
    source: "The organization the event concerns",
    example: "Oak International School",
  },
  {
    name: "sender_name",
    token: "{{sender_name}}",
    label: "Configured sender display name",
    source: "Control Center → Notifications → Sender display name",
    example: "EVALORA",
  },
  {
    name: "candidate_name",
    token: "{{candidate_name}}",
    label: "Candidate name",
    source: "The student the examination attempt belongs to",
    example: "Amina Diallo",
  },
  {
    name: "exam_title",
    token: "{{exam_title}}",
    label: "Examination title",
    source: "The examination the event concerns",
    example: "MYP 4 Mathematics — Term 1 Summative",
  },
  {
    name: "exam_date",
    token: "{{exam_date}}",
    label: "Examination date",
    source: "Formatted with the organization's date profile",
    example: "12 March 2026",
  },
  {
    name: "exam_time",
    token: "{{exam_time}}",
    label: "Examination start time",
    source: "Formatted with the organization's time profile",
    example: "09:00",
  },
  {
    name: "access_code",
    token: "{{access_code}}",
    label: "Examination access code",
    source: "The code already shown to the candidate on their admission screen",
    example: "K7Q2M9",
  },
  {
    name: "result_link",
    token: "{{result_link}}",
    label: "Secure individual result link",
    source: "The unguessable per-candidate result URL",
    example: "https://evalora-edu.online/exam/result/8f2c…",
  },
  {
    name: "plan_name",
    token: "{{plan_name}}",
    label: "Subscription plan name",
    source: "The plan the payment or subscription change concerns",
    example: "Institution",
  },
  {
    name: "amount",
    token: "{{amount}}",
    label: "Formatted amount",
    source: "The payment amount, formatted in its own recorded currency",
    example: "US$1,290.00",
  },
  {
    name: "transaction_ref",
    token: "{{transaction_ref}}",
    label: "Payment reference",
    source: "The reference the payer submitted, echoed back to them",
    example: "TRX-88213",
  },
  {
    name: "billing_period",
    token: "{{billing_period}}",
    label: "Billing period",
    source: "monthly or yearly, as submitted",
    example: "yearly",
  },
  {
    name: "admin_note",
    token: "{{admin_note}}",
    label: "Administrator's note",
    source: "The note written on the decision, or the standard prompt when none was written",
    example: "The reference could not be matched to a bank entry.",
  },
  {
    name: "member_role",
    token: "{{member_role}}",
    label: "Membership role",
    source: "The role the account was given in the organization",
    example: "teacher",
  },
  {
    name: "requester_name",
    token: "{{requester_name}}",
    label: "Retake requester name",
    source: "The person who asked for the retake",
    example: "Mr. Okonkwo",
  },
  {
    name: "retake_code_clause",
    token: "{{retake_code_clause}}",
    label: "Retake code sentence (optional)",
    source: 'Composed in code: " Retake code: K7Q2M9." — empty when no code was issued',
    example: " Retake code: K7Q2M9.",
    clause: true,
  },
  {
    name: "access_deadline_clause",
    token: "{{access_deadline_clause}}",
    label: "Retake deadline sentence (optional)",
    source: 'Composed in code: " Start the authorized attempt before … (UTC)." — empty when the authorization does not expire',
    example: " Start the authorized attempt before 2026-03-20T17:00Z (UTC).",
    clause: true,
  },
  {
    name: "rejection_reason_clause",
    token: "{{rejection_reason_clause}}",
    label: "Rejection reason sentence (optional)",
    source: 'Composed in code: " Reason: …" — empty when the decision carried no note',
    example: " Reason: The original attempt completed without a technical fault.",
    clause: true,
  },
  {
    name: "retake_request_id",
    token: "{{retake_request_id}}",
    label: "Retake request identifier",
    source: "Used in the notification link so it opens the exact request, never a list to search",
    example: "9b1de0a2-4c7f-4a6b-9f2c-1e5d7a8b0c11",
  },
] as const;

export const NOTIFICATION_VARIABLE_NAMES: readonly string[] = NOTIFICATION_VARIABLES.map((v) => v.name);

/**
 * The variables a template may use, in the shape the Control Center already
 * published. Re-exported from `notificationService` so the existing surfaces
 * and suites keep one source of truth.
 */
export const NOTIFICATION_TEMPLATE_VARIABLES = NOTIFICATION_VARIABLES.map((v) => ({
  name: v.name,
  token: v.token,
  label: v.label,
  example: v.example,
  source: v.source,
  clause: v.clause === true,
}));

export type NotificationTemplateVariable = (typeof NOTIFICATION_TEMPLATE_VARIABLES)[number]["token"];

export function notificationVariable(name: string): NotificationVariableDef | undefined {
  return NOTIFICATION_VARIABLES.find((v) => v.name === name);
}

/**
 * Locales a template may be authored in. Mirrors `SUPPORTED_LOCALE_OPTIONS` in
 * the configuration schema; the suite asserts the two lists agree, so this
 * cannot drift into offering a language the interface does not have.
 */
export const NOTIFICATION_TEMPLATE_LOCALES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
] as const;

export const NOTIFICATION_LOCALE_VALUES: readonly string[] = NOTIFICATION_TEMPLATE_LOCALES.map((l) => l.value);

/** Channels a template can declare. Mirrors the table's check constraint. */
export const NOTIFICATION_CHANNELS = [
  { value: "in_app", label: "In-app only" },
  { value: "both", label: "In-app and email" },
  { value: "email", label: "Email only" },
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]["value"];

/** Hard limits, matching the length the existing notification forms accept. */
export const NOTIFICATION_TITLE_MAX = 160;
export const NOTIFICATION_BODY_MAX = 1000;

// ─────────────────────────────── the events ────────────────────────────────

/** Who receives the notification. Documentation for the console; the call site
 * supplies the actual user ids. */
export type NotificationAudience = "subject_user" | "organization_admins" | "platform_admins";

export interface NotificationEventDef {
  /** Stable key stored in `notification_templates.event_key`. */
  key: string;
  group: "Billing & payments" | "Membership & accounts" | "Examinations" | "Platform security";
  label: string;
  /** What actually makes this fire — written for an administrator, not a developer. */
  description: string;
  audience: NotificationAudience;
  audienceLabel: string;
  /**
   * `organization` → the organization's own template is consulted before the
   * platform default. `platform` → only the platform default applies, because
   * the event is not about any one tenant's wording.
   */
  templateScope: "organization" | "platform";
  /**
   * Which switch can suppress delivery. A tenant's own notifications switch
   * governs notifications sent to that tenant's people; it never governs a
   * notification sent to a platform administrator, or one tenant could silence
   * the platform's payment queue.
   */
  deliveryGate: "organization" | "platform";
  /** Value written to `notifications.type`. Never editable: the bell's filters
   * and the activity log key off it. */
  type: string;
  /**
   * Where the notification leads. Owned by code and may contain tokens, but is
   * validated to an internal path — a template editor must not be able to point
   * a notification at an arbitrary external URL.
   */
  link: string;
  /** Built-in copy: exactly what the call site used to hard-code. */
  title: string;
  body: string;
  /** The variables this event supplies. A template may use any of them. */
  variables: readonly string[];
  /** Values used for the console preview and for "send a test". */
  sample: Readonly<Record<string, string>>;
}

export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = [
  // ── Billing & payments ────────────────────────────────────────────────────
  {
    key: "payment_submitted",
    group: "Billing & payments",
    label: "Payment submitted for verification",
    description:
      "An organization submitted a payment with a reference and optional proof, and it is waiting for manual verification.",
    audience: "platform_admins",
    audienceLabel: "Every Super Admin",
    templateScope: "organization",
    deliveryGate: "platform",
    type: "payment",
    link: "/admin/payments",
    title: "New payment to review",
    body: "{{organization_name}} submitted a {{plan_name}} ({{billing_period}}) payment: {{transaction_ref}}",
    variables: ["organization_name", "plan_name", "billing_period", "transaction_ref"],
    sample: {
      organization_name: "Oak International School",
      plan_name: "Institution",
      billing_period: "yearly",
      transaction_ref: "TRX-88213",
    },
  },
  {
    key: "payment_request_approved",
    group: "Billing & payments",
    label: "Payment request approved",
    description: "A Super Admin verified a submitted payment and activated the subscription. Sent to whoever submitted it.",
    audience: "subject_user",
    audienceLabel: "The person who submitted the payment",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "payment",
    link: "/dashboard/billing",
    title: "Payment approved — subscription active",
    body: "Your {{plan_name}} subscription ({{amount}}, ref {{transaction_ref}}) is now active.",
    variables: ["plan_name", "amount", "transaction_ref"],
    sample: { plan_name: "Institution", amount: "US$1,290.00", transaction_ref: "TRX-88213" },
  },
  {
    key: "payment_request_rejected",
    group: "Billing & payments",
    label: "Payment request not approved",
    description: "A Super Admin could not verify a submitted payment. Sent to whoever submitted it.",
    audience: "subject_user",
    audienceLabel: "The person who submitted the payment",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "payment",
    link: "/dashboard/billing",
    title: "Payment not approved",
    body: "Your payment (ref {{transaction_ref}}) was not approved. {{admin_note}}",
    variables: ["transaction_ref", "admin_note"],
    sample: {
      transaction_ref: "TRX-88213",
      admin_note: "The reference could not be matched to a bank entry.",
    },
  },
  {
    key: "payment_recorded",
    group: "Billing & payments",
    label: "Payment recorded by the EVALORA team",
    description: "A Super Admin recorded a payment directly and activated the subscription. Sent to the organization's owners and administrators.",
    audience: "organization_admins",
    audienceLabel: "Owners and administrators of the organization",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "payment",
    link: "/dashboard/billing",
    title: "Subscription activated",
    body: "A payment of {{amount}} (ref {{transaction_ref}}) was recorded and your subscription is now active.",
    variables: ["amount", "transaction_ref"],
    sample: { amount: "US$1,290.00", transaction_ref: "TRX-88213" },
  },
  {
    key: "payment_verified",
    group: "Billing & payments",
    label: "Submitted payment verified",
    description:
      "A Super Admin verified a payment the organization had submitted. Sent to the organization's owners and administrators.",
    audience: "organization_admins",
    audienceLabel: "Owners and administrators of the organization",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "payment",
    link: "/dashboard/billing",
    title: "Payment approved — subscription active",
    body: "Your payment (ref {{transaction_ref}}) was verified and your subscription is active.",
    variables: ["transaction_ref"],
    sample: { transaction_ref: "TRX-88213" },
  },
  {
    key: "payment_refunded",
    group: "Billing & payments",
    label: "Payment refunded",
    description: "A Super Admin refunded a payment. Sent to the organization's owners and administrators.",
    audience: "organization_admins",
    audienceLabel: "Owners and administrators of the organization",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "payment",
    link: "/dashboard/billing",
    title: "Payment refunded",
    body: "A payment of {{amount}} was refunded by the EVALORA team.",
    variables: ["amount"],
    sample: { amount: "US$1,290.00" },
  },
  {
    key: "subscription_updated",
    group: "Billing & payments",
    label: "Subscription plan changed",
    description: "A Super Admin changed the organization's plan. Sent to the organization's owners and administrators.",
    audience: "organization_admins",
    audienceLabel: "Owners and administrators of the organization",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "payment",
    link: "/dashboard/billing",
    title: "Subscription updated",
    body: "Your organization's plan was updated by the EVALORA team.",
    variables: [],
    sample: {},
  },

  // ── Membership & accounts ─────────────────────────────────────────────────
  {
    key: "organization_member_added",
    group: "Membership & accounts",
    label: "Added to an organization",
    description: "An administrator added an existing account to an organization with a role.",
    audience: "subject_user",
    audienceLabel: "The person added",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "info",
    link: "/dashboard",
    title: "You were added to an organization",
    body: "An EVALORA administrator added you as {{member_role}}. Open your dashboard to get started.",
    variables: ["member_role", "organization_name"],
    sample: { member_role: "teacher", organization_name: "Oak International School" },
  },
  {
    key: "account_created",
    group: "Membership & accounts",
    label: "Account created by an administrator",
    description: "An administrator created the account and gave it a role in an organization.",
    audience: "subject_user",
    audienceLabel: "The new account holder",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "info",
    link: "/dashboard",
    title: "Welcome to EVALORA",
    body: "Your account was created by an administrator with the role {{member_role}}.",
    variables: ["member_role", "organization_name"],
    sample: { member_role: "teacher", organization_name: "Oak International School" },
  },
  {
    key: "invitation_accepted",
    group: "Membership & accounts",
    label: "Invitation accepted",
    description: "The invited person accepted an invitation and joined the organization workspace.",
    audience: "subject_user",
    audienceLabel: "The person who accepted",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "invitation",
    link: "/dashboard",
    title: "Invitation accepted",
    body: "You joined a new organization workspace.",
    variables: ["organization_name"],
    sample: { organization_name: "Oak International School" },
  },

  // ── Examinations ──────────────────────────────────────────────────────────
  {
    key: "exam_retake_requested",
    group: "Examinations",
    label: "Retake requested",
    description: "A candidate or invigilator asked for a retake, and it is waiting for a Super Admin decision.",
    audience: "platform_admins",
    audienceLabel: "Every Super Admin",
    templateScope: "organization",
    deliveryGate: "platform",
    type: "exam_retake_requested",
    link: "/admin/examinations/retakes",
    title: "New retake request",
    body: "{{requester_name}} requested a retake of “{{exam_title}}”.",
    variables: ["requester_name", "exam_title", "candidate_name", "organization_name"],
    sample: {
      requester_name: "Mr. Okonkwo",
      exam_title: "MYP 4 Mathematics — Term 1 Summative",
      candidate_name: "Amina Diallo",
      organization_name: "Oak International School",
    },
  },
  {
    key: "exam_retake_approved",
    group: "Examinations",
    label: "Retake approved",
    description: "A Super Admin approved a retake request. Sent to the candidate, with the retake code when one was issued.",
    audience: "subject_user",
    audienceLabel: "The candidate",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "exam_retake_approved",
    link: "/retake/{{retake_request_id}}",
    title: "Retake approved",
    body:
      "Your retake request for “{{exam_title}}” was approved.{{retake_code_clause}}{{access_deadline_clause}}"
      + " Your original submitted attempt is preserved.",
    variables: ["exam_title", "retake_code_clause", "access_deadline_clause", "retake_request_id"],
    sample: {
      exam_title: "MYP 4 Mathematics — Term 1 Summative",
      retake_code_clause: " Retake code: K7Q2M9.",
      access_deadline_clause: " Start the authorized attempt before 2026-03-20T17:00Z (UTC).",
      retake_request_id: "9b1de0a2-4c7f-4a6b-9f2c-1e5d7a8b0c11",
    },
  },
  {
    key: "exam_retake_rejected",
    group: "Examinations",
    label: "Retake rejected",
    description: "A Super Admin rejected a retake request. Sent to the candidate, with the reason when one was written.",
    audience: "subject_user",
    audienceLabel: "The candidate",
    templateScope: "organization",
    deliveryGate: "organization",
    type: "exam_retake_rejected",
    link: "/retake/{{retake_request_id}}",
    title: "Retake request rejected",
    body:
      "Your retake request for “{{exam_title}}” was rejected.{{rejection_reason_clause}}"
      + " Your original submitted attempt is unchanged.",
    variables: ["exam_title", "rejection_reason_clause", "retake_request_id"],
    sample: {
      exam_title: "MYP 4 Mathematics — Term 1 Summative",
      rejection_reason_clause: " Reason: The original attempt completed without a technical fault.",
      retake_request_id: "9b1de0a2-4c7f-4a6b-9f2c-1e5d7a8b0c11",
    },
  },

  // ── Platform security ─────────────────────────────────────────────────────
  {
    key: "super_admin_granted",
    group: "Platform security",
    label: "Super Admin access granted",
    description: "The platform owner granted Super Admin access to an account.",
    audience: "subject_user",
    audienceLabel: "The account that was granted access",
    templateScope: "platform",
    deliveryGate: "platform",
    type: "security",
    link: "/admin",
    title: "You are now a platform administrator",
    body: "The platform owner granted you Super Admin access. Handle it with care — actions are audit-logged.",
    variables: [],
    sample: {},
  },
  {
    key: "super_admin_revoked",
    group: "Platform security",
    label: "Super Admin access removed",
    description: "The platform owner removed Super Admin access from an account.",
    audience: "subject_user",
    audienceLabel: "The account that lost access",
    templateScope: "platform",
    deliveryGate: "platform",
    type: "security",
    link: "/dashboard",
    title: "Administrator access removed",
    body: "Your Super Admin access was removed by the platform owner.",
    variables: [],
    sample: {},
  },
] as const;

export const NOTIFICATION_EVENT_KEYS: readonly string[] = NOTIFICATION_EVENTS.map((e) => e.key);

export const NOTIFICATION_EVENT_GROUPS: readonly NotificationEventDef["group"][] = [
  "Billing & payments",
  "Membership & accounts",
  "Examinations",
  "Platform security",
];

export function notificationEvent(key: string): NotificationEventDef | undefined {
  return NOTIFICATION_EVENTS.find((e) => e.key === key);
}

export function isNotificationEventKey(key: unknown): key is string {
  return typeof key === "string" && NOTIFICATION_EVENTS.some((e) => e.key === key);
}

/** The variables an event supplies, as definitions (unknown names are dropped). */
export function eventVariableDefs(eventKey: string): NotificationVariableDef[] {
  const event = notificationEvent(eventKey);
  if (!event) return [];
  return event.variables
    .map((name) => notificationVariable(name))
    .filter((v): v is NotificationVariableDef => Boolean(v));
}

// ─────────────────────────────── rendering ─────────────────────────────────

/**
 * Substitute template variables from a closed, non-sensitive value map.
 *
 * Unknown tokens are left untouched rather than replaced with an empty string,
 * so a preview shows an author exactly which variable they got wrong. Values
 * are coerced to text and control characters stripped; nothing here parses or
 * executes the template.
 */
export function renderNotificationTemplate(
  template: string,
  values: Record<string, unknown>,
): string {
  if (typeof template !== "string" || !template) return "";
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, name: string) => {
    const key = name.trim().toLowerCase();
    if (!(key in values)) return match;
    const raw = values[key];
    if (raw === null || raw === undefined) return "";
    return String(raw).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2000);
  });
}

/** Every `{{token}}` name used in a piece of copy, lower-cased, de-duplicated. */
export function extractTemplateVariables(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (typeof text !== "string") continue;
    for (const match of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
      found.add(match[1].trim().toLowerCase());
    }
  }
  return [...found].sort();
}

/**
 * An internal path only. A template may parameterize a link (so a retake
 * notification opens the exact request), but it may never point a notification
 * at another origin: `//host`, a scheme or a backslash are all rejected.
 */
export function safeNotificationLink(link: string): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed || trimmed.length > 300) return null;
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (/[\s<>\\]/.test(trimmed)) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Render an event's destination with the event's values and prove it is still an
 * internal path. Returns null when it is not — the caller then writes no link
 * rather than a notification that leads somewhere nobody vetted.
 */
export function renderNotificationLink(
  eventKey: string,
  values: Record<string, unknown> = {},
): string | null {
  const event = notificationEvent(eventKey);
  if (!event) return null;
  return safeNotificationLink(renderNotificationTemplate(event.link, values));
}

// ─────────────────────────────── resolution ────────────────────────────────

/** A row of `notification_templates`, in the shape the resolver needs. */
export interface NotificationTemplateRow {
  id?: string | null;
  organization_id: string | null;
  event_key: string;
  channel: string;
  title: string;
  body: string;
  locale: string;
  variables?: string[] | null;
  is_active: boolean;
  updated_at?: string | null;
}

export type TemplateProvenance = "organization" | "platform" | "built_in";

export interface ResolvedNotificationTemplate {
  eventKey: string;
  title: string;
  body: string;
  /**
   * The event's destination as declared in code. It may still contain tokens
   * (`/retake/{{retake_request_id}}`); pass it through `renderNotificationLink`
   * with the event's values before writing a row. Copy is editable, the
   * destination is not: a template can never point a notification off-site.
   */
  link: string;
  type: string;
  locale: string;
  channel: NotificationChannel;
  provenance: TemplateProvenance;
  /** The `notification_templates.id` in force, or null for built-in copy. */
  templateId: string | null;
  /** True when a saved template — not the shipped default — produced this copy. */
  isCustomized: boolean;
  variables: string[];
}

function normalizeChannel(channel: string): NotificationChannel {
  return channel === "email" || channel === "both" ? channel : "in_app";
}

/**
 * Pick the copy for one event.
 *
 * Order: the organization's own active template in the requested locale, then
 * the same in English, then the platform default in the requested locale, then
 * the platform default in English, then the built-in copy that ships in code.
 *
 * The channel is part of the answer, not a filter on it. A template saved as
 * `email` only is still the wording in force for its scope — it is what the
 * console shows, and it is why `sendNotification` reports
 * `email_only_template` instead of delivering in-app copy the author explicitly
 * did not ask for. Silently substituting the fallback would make "email only"
 * mean "whatever EVALORA felt like", which is the opposite of a setting.
 */
export function resolveTemplate(
  rows: readonly NotificationTemplateRow[],
  eventKey: string,
  options: { organizationId?: string | null; locale?: string | null } = {},
): ResolvedNotificationTemplate | null {
  const event = notificationEvent(eventKey);
  if (!event) return null;

  const locale = typeof options.locale === "string" && options.locale ? options.locale : "en";
  const organizationId =
    event.templateScope === "organization" && typeof options.organizationId === "string" && options.organizationId
      ? options.organizationId
      : null;

  const candidates = (Array.isArray(rows) ? rows : []).filter(
    (row) =>
      row
      && row.event_key === eventKey
      && row.is_active !== false
      && typeof row.title === "string"
      && row.title.trim() !== ""
      && typeof row.body === "string"
      && row.body.trim() !== "",
  );

  const pick = (orgId: string | null, wantedLocale: string) =>
    candidates.find(
      (row) => (row.organization_id ?? null) === orgId && String(row.locale ?? "en") === wantedLocale,
    );

  const ordered: (NotificationTemplateRow | undefined)[] = organizationId
    ? [pick(organizationId, locale), pick(organizationId, "en"), pick(null, locale), pick(null, "en")]
    : [pick(null, locale), pick(null, "en")];

  const row = ordered.find(Boolean);
  if (!row) return builtInTemplate(event, locale);

  const provenance: TemplateProvenance = row.organization_id ? "organization" : "platform";
  return {
    eventKey: event.key,
    title: row.title,
    body: row.body,
    link: event.link,
    type: event.type,
    locale: String(row.locale ?? "en"),
    channel: normalizeChannel(String(row.channel)),
    provenance,
    templateId: typeof row.id === "string" ? row.id : null,
    isCustomized: true,
    variables: extractTemplateVariables(row.title, row.body),
  };
}

/** The shipped copy for an event, with no template row in force. */
export function builtInTemplate(
  event: NotificationEventDef,
  locale = "en",
): ResolvedNotificationTemplate {
  return {
    eventKey: event.key,
    title: event.title,
    body: event.body,
    link: event.link,
    type: event.type,
    locale,
    channel: "in_app",
    provenance: "built_in",
    templateId: null,
    isCustomized: false,
    variables: extractTemplateVariables(event.title, event.body),
  };
}

/**
 * Resolve every event at once for one scope — what the console lists. One
 * database read serves the whole page, and each row is reported with its
 * provenance so an administrator can see at a glance which copy is theirs.
 */
export function resolveAllTemplates(
  rows: readonly NotificationTemplateRow[],
  options: { organizationId?: string | null; locale?: string | null } = {},
): ResolvedNotificationTemplate[] {
  return NOTIFICATION_EVENTS.map((event) => resolveTemplate(rows, event.key, options))
    .filter((r): r is ResolvedNotificationTemplate => Boolean(r));
}

// ─────────────────────────────── validation ────────────────────────────────

export interface NotificationTemplateDraft {
  event_key?: unknown;
  organization_id?: unknown;
  channel?: unknown;
  locale?: unknown;
  title?: unknown;
  body?: unknown;
  is_active?: unknown;
}

export type TemplateValidationResult =
  | {
      ok: true;
      event: NotificationEventDef;
      title: string;
      body: string;
      channel: NotificationChannel;
      locale: string;
      isActive: boolean;
      variables: string[];
      /** Variables used that this event does not supply — rejected, not ignored. */
      unknownVariables: never[];
      preview: { title: string; body: string };
      /** True when the draft would deliver no in-app notification. */
      emailOnly: boolean;
    }
  | { ok: false; code: string; message: string };

function controlClean(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, " ");
}

/**
 * The only door into `notification_templates`.
 *
 * Rejects: an event key outside the registry, a channel or locale outside the
 * declared sets, empty or over-long copy, and — the important one — a variable
 * this event does not supply. A token that renders literally is a defect a user
 * would read, so it is refused at save time and shown in the preview before it.
 */
export function validateTemplateDraft(draft: NotificationTemplateDraft): TemplateValidationResult {
  const eventKey = typeof draft.event_key === "string" ? draft.event_key.trim() : "";
  const event = notificationEvent(eventKey);
  if (!event) {
    return {
      ok: false,
      code: "unknown_event",
      message: "That notification event is not one EVALORA generates. The event set is defined in code.",
    };
  }

  const channelRaw = typeof draft.channel === "string" ? draft.channel.trim() : "in_app";
  if (!NOTIFICATION_CHANNELS.some((c) => c.value === channelRaw)) {
    return { ok: false, code: "channel", message: "Choose in-app, email, or both." };
  }
  const channel = channelRaw as NotificationChannel;

  const localeRaw = typeof draft.locale === "string" ? draft.locale.trim() : "en";
  if (!NOTIFICATION_LOCALE_VALUES.includes(localeRaw)) {
    return {
      ok: false,
      code: "locale",
      message: `Choose one of the interface languages: ${NOTIFICATION_LOCALE_VALUES.join(", ")}.`,
    };
  }

  const title = typeof draft.title === "string" ? controlClean(draft.title).replace(/\s+/g, " ").trim() : "";
  if (!title) return { ok: false, code: "title", message: "A notification needs a title." };
  if (title.length > NOTIFICATION_TITLE_MAX) {
    return {
      ok: false,
      code: "title_long",
      message: `The title is ${title.length} characters; the limit is ${NOTIFICATION_TITLE_MAX}.`,
    };
  }

  const body = typeof draft.body === "string" ? controlClean(draft.body).replace(/[ \t]+/g, " ").trim() : "";
  if (!body) return { ok: false, code: "body", message: "A notification needs a message." };
  if (body.length > NOTIFICATION_BODY_MAX) {
    return {
      ok: false,
      code: "body_long",
      message: `The message is ${body.length} characters; the limit is ${NOTIFICATION_BODY_MAX}.`,
    };
  }

  const supplied = new Set<string>(event.variables);
  const used = extractTemplateVariables(title, body);
  const unknown = used.filter((name) => !supplied.has(name));
  if (unknown.length) {
    const list = unknown.map((name) => `{{${name}}}`).join(", ");
    const available = supplied.size
      ? `The variables this notification supplies are: ${[...supplied].map((n) => `{{${n}}}`).join(", ")}.`
      : "This notification supplies no variables.";
    return {
      ok: false,
      code: "unknown_variable",
      message: `${list} is not available for “${event.label}”. ${available}`,
    };
  }

  const previewValues: Record<string, string> = { ...event.sample };
  return {
    ok: true,
    event,
    title,
    body,
    channel,
    locale: localeRaw,
    isActive: draft.is_active !== false && draft.is_active !== "false",
    variables: used,
    unknownVariables: [],
    preview: {
      title: renderNotificationTemplate(title, previewValues),
      body: renderNotificationTemplate(body, previewValues),
    },
    emailOnly: channel === "email",
  };
}

/**
 * Render copy with an event's sample values — the console preview and the
 * "send a test notification" action both use this, so what an administrator
 * previews is what a test delivers.
 */
export function previewTemplate(
  eventKey: string,
  title: string,
  body: string,
  values?: Record<string, unknown>,
): { title: string; body: string } {
  const event = notificationEvent(eventKey);
  const merged = { ...(event?.sample ?? {}), ...(values ?? {}) };
  return {
    title: renderNotificationTemplate(title, merged),
    body: renderNotificationTemplate(body, merged),
  };
}
