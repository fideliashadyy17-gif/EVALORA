import "server-only";

/**
 * Notification & communication configuration — the `notifications` namespace,
 * resolved, plus an honest delivery capability report.
 *
 * The single most important thing this module does is refuse to pretend. This
 * deployment has **no general-purpose email provider**: the only mail EVALORA
 * sends is Supabase Auth's own (account invitations and password resets,
 * configured inside Supabase). There is therefore no code path that could
 * deliver an application-composed notification email, and the Control Center
 * reports that as a status rather than offering a switch that appears to work.
 *
 * What *is* operational:
 *   • in-app notifications — rows in the `notifications` table, surfaced by the
 *     bell and `/dashboard/notifications`, gated by `in_app_enabled`;
 *   • the sender display name used when a notification is generated.
 *
 * Nothing here exposes credentials, tokens or passwords, and no template
 * variable is ever resolved to a secret.
 */
import { getNotificationsConfig } from "@/lib/config/service";
import { moduleEnabled } from "@/lib/modules";
import { getEntitlement } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/server";

export interface ResolvedNotificationConfig {
  /** Master switch for the bell and the notifications page. */
  inAppEnabled: boolean;
  /** Sender display name used when a notification is generated. */
  senderName: string;
  /**
   * Reported status only. `false` on this deployment: no email provider is
   * connected, so application-composed mail cannot be delivered.
   */
  emailDeliveryAvailable: boolean;
}

export const NOTIFICATION_FALLBACKS: ResolvedNotificationConfig = {
  inAppEnabled: true,
  senderName: "EVALORA",
  emailDeliveryAvailable: false,
};

/**
 * Resolve notification configuration for one scope. Never throws: an
 * unreachable configuration store yields the shipped defaults, because a
 * notification preference must not be able to break a page render.
 */
export async function resolveNotificationConfig(
  organizationId?: string | null,
): Promise<ResolvedNotificationConfig> {
  try {
    const cfg = await getNotificationsConfig(organizationId ?? null);
    return {
      inAppEnabled: cfg.in_app_enabled !== false,
      senderName: cleanSenderName(cfg.sender_name),
      // The schema key is read-only and defaults to false; it is echoed here so
      // a surface can report the truth instead of assuming delivery works.
      emailDeliveryAvailable: cfg.email_delivery_available === true,
    };
  } catch {
    return { ...NOTIFICATION_FALLBACKS };
  }
}

function cleanSenderName(value: unknown): string {
  if (typeof value !== "string") return NOTIFICATION_FALLBACKS.senderName;
  // Control characters are stripped: a sender name is rendered into HTML and
  // into any future mail header, where a newline would be an injection vector.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return text || NOTIFICATION_FALLBACKS.senderName;
}

// ─────────────────────────── capability report ─────────────────────────────

export interface NotificationChannelCapability {
  key: "in_app" | "email";
  label: string;
  operational: boolean;
  status: string;
  explanation?: string;
}

/**
 * Which notification channels actually work on this deployment.
 *
 * The Control Center renders a non-operational channel as a report with its
 * reason, never as a toggle. An administrator reading this can see exactly what
 * is missing (an email provider integration) instead of discovering it later by
 * wondering why nothing arrived.
 */
export async function notificationCapabilityReport(
  organizationId?: string | null,
): Promise<NotificationChannelCapability[]> {
  const cfg = await resolveNotificationConfig(organizationId);

  // Supabase Auth mail is configured inside Supabase, not here. It is reported
  // separately from application-composed mail because the two are different
  // capabilities with different owners.
  const authMailConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  return [
    {
      key: "in_app",
      label: "In-app notifications",
      operational: cfg.inAppEnabled,
      status: cfg.inAppEnabled
        ? `On. Written to the notifications table and delivered through the bell as “${cfg.senderName}”.`
        : "Off. The bell and the notifications page are hidden and no in-app notification is delivered.",
    },
    {
      key: "email",
      label: "Application-composed notification email",
      operational: false,
      status: "Not available on this deployment.",
      explanation:
        "EVALORA has no general-purpose email provider connected, so an email composed by the application cannot be sent. Templates can be authored and previewed, and the variables they use are real, but delivery requires a provider integration — that is code-level work, not a dashboard setting. This is reported rather than hidden so nobody waits for mail that was never going to arrive.",
    },
    {
      key: "in_app",
      label: "Supabase Auth transactional mail",
      operational: authMailConfigured,
      status: authMailConfigured
        ? "Available — account invitations and password resets are sent by Supabase Auth, configured in the Supabase dashboard."
        : "Unavailable — Supabase credentials are not present in this environment.",
      explanation: authMailConfigured
        ? "These messages are composed and sent by Supabase, not by EVALORA. Their templates and sender address are configured in Supabase → Auth → Email Templates, so they are outside the Control Center by design."
        : undefined,
    },
  ];
}

/**
 * Whether the notification surfaces should be shown for an organization.
 *
 * Combines the configured switch with the module entitlement, so a plan that
 * does not include the module cannot show notifications even if the switch is
 * on — entitlement is never bypassed by configuration.
 */
export async function notificationsEnabledFor(
  organizationId?: string | null,
): Promise<boolean> {
  const cfg = await resolveNotificationConfig(organizationId);
  if (!cfg.inAppEnabled) return false;
  if (!organizationId) return true;
  try {
    const admin = createAdminClient();
    const entitlement = await getEntitlement(admin, organizationId);
    // The schema connects this setting to the `platform` module, which is the
    // module that owns the notification surfaces in MODULE_CATALOG.
    return moduleEnabled(entitlement.modules, "platform");
  } catch {
    // Fail closed on an unreadable entitlement: better to hide the bell than to
    // show notifications an organization is not entitled to.
    return false;
  }
}

/**
 * Variables a notification template may use.
 *
 * Deliberately a closed list of non-sensitive values. No password, token,
 * secret, access code hash or credential is ever offered as a template
 * variable, so a template cannot leak one even by accident.
 */
export const NOTIFICATION_TEMPLATE_VARIABLES = [
  { token: "{{candidate_name}}", label: "Candidate name", example: "Amina Diallo" },
  { token: "{{exam_title}}", label: "Examination title", example: "MYP 4 Mathematics — Term 1 Summative" },
  { token: "{{exam_date}}", label: "Examination date", example: "12 March 2026" },
  { token: "{{exam_time}}", label: "Examination start time", example: "09:00" },
  { token: "{{access_code}}", label: "Examination access code", example: "K7Q2M9" },
  { token: "{{result_link}}", label: "Secure individual result link", example: "https://…/exam/result/<token>" },
  { token: "{{organization_name}}", label: "Organization name", example: "Oak International School" },
  { token: "{{sender_name}}", label: "Configured sender display name", example: "EVALORA" },
] as const;

export type NotificationTemplateVariable = (typeof NOTIFICATION_TEMPLATE_VARIABLES)[number]["token"];

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
