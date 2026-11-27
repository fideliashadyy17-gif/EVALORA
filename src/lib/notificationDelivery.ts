import "server-only";

/**
 * Notification delivery — the wire between an event in the code and a row in
 * `notifications`, with the copy resolved from `notification_templates`.
 *
 * Every place in EVALORA that tells a user something now comes through here, so
 * a template saved in the Control Center changes what people actually receive
 * instead of only changing what a preview shows. Three rules shape the module:
 *
 *   1. **A notification never breaks the operation that caused it.** A payment
 *      approval, a membership change or a retake decision has already happened
 *      by the time we tell someone about it; a failed or suppressed
 *      notification is reported in the return value, not thrown.
 *   2. **The tenant's switch governs the tenant's people, never the platform's
 *      queue.** An organization that turns in-app notifications off stops
 *      receiving its own; it cannot stop a Super Admin from hearing that a
 *      payment is waiting. The switch is the configured
 *      `notifications.in_app_enabled` — NOT the module entitlement, which stays
 *      a gate on the surfaces (the bell, the notifications page, the wording
 *      console) exactly as it was. Silencing delivery for a tenant whose plan
 *      happens to exclude the `platform` module would change what a live
 *      customer receives as a side effect of a wording feature, and that is a
 *      decision for whoever defines what the module means.
 *   3. **Nothing is invented.** Unknown event keys are refused, an unrenderable
 *      link is dropped rather than guessed, and the copy that ships in code is
 *      used verbatim when no template is in force.
 *
 * Reads go through the platform client — the same choice the organization-side
 * Control Center makes — and authorization is enforced by the callers: a server
 * action that can prove who is acting, and row-level security on the write.
 */
import { cache } from "react";

import { getLocalizationConfig } from "@/lib/config/service";
import { resolveNotificationConfig } from "@/lib/notificationService";
import {
  NOTIFICATION_EVENTS,
  builtInTemplate,
  notificationEvent,
  renderNotificationLink,
  renderNotificationTemplate,
  resolveTemplate,
  safeNotificationLink,
  type NotificationEventDef,
  type NotificationTemplateRow,
  type ResolvedNotificationTemplate,
  type TemplateProvenance,
} from "@/lib/notificationTemplates";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * A client that can write `notifications`. Typed structurally rather than by
 * importing supabase-js: only three modules in this repository construct a
 * client, and a suite asserts that stays true.
 */
export type NotificationDbClient = ReturnType<typeof createAdminClient>;

// ─────────────────────────────── reading templates ─────────────────────────

/**
 * The active templates that could apply to one scope, in a single read.
 *
 * Includes the platform defaults (`organization_id is null`) because they are
 * the fallback for every organization, and because the console shows what an
 * organization inherits. Cached per request: a page that renders fifteen events
 * performs one query, not fifteen.
 */
export const loadActiveTemplateRows = cache(
  async (organizationId?: string | null): Promise<NotificationTemplateRow[]> => {
    try {
      const db = createAdminClient();
      let query = db
        .from("notification_templates")
        .select("id, organization_id, event_key, channel, title, body, locale, variables, is_active, updated_at")
        .eq("is_active", true);
      query = organizationId
        ? query.or(`organization_id.eq.${organizationId},organization_id.is.null`)
        : query.is("organization_id", null);
      const { data, error } = await query;
      if (error || !data) return [];
      return (data as unknown as NotificationTemplateRow[]).filter(
        (row) => row && typeof row.event_key === "string",
      );
    } catch {
      // An unreachable template store must not stop a notification: the
      // built-in copy is delivered instead, which is exactly what an
      // uncustomized deployment does.
      return [];
    }
  },
);

/** All rows for one scope and locale, including paused ones. */
export async function loadScopeRows(
  organizationId: string | null,
  locale: string,
): Promise<NotificationTemplateRow[]> {
  try {
    const db = createAdminClient();
    let query = db
      .from("notification_templates")
      .select("id, organization_id, event_key, channel, title, body, locale, variables, is_active, updated_at")
      .eq("locale", locale);
    query = organizationId
      ? query.or(`organization_id.eq.${organizationId},organization_id.is.null`)
      : query.is("organization_id", null);
    const { data, error } = await query;
    if (error || !data) return [];
    return data as unknown as NotificationTemplateRow[];
  } catch {
    return [];
  }
}

/**
 * The organization's name, for `{{organization_name}}`.
 *
 * Supplied here rather than at each call site because almost every event
 * concerns an organization and half the call sites did not have the name to
 * hand. Cached per request, and never allowed to fail a notification: when the
 * row cannot be read the variable renders empty rather than literal.
 */
export const organizationNameFor = cache(async (organizationId: string | null): Promise<string> => {
  if (!organizationId) return "";
  try {
    const db = createAdminClient();
    const { data } = await db.from("organizations").select("name").eq("id", organizationId).maybeSingle();
    const name = (data as { name?: unknown } | null)?.name;
    return typeof name === "string" ? name : "";
  } catch {
    return "";
  }
});

/** The locale a scope's notifications are authored in. */
export async function notificationLocaleFor(organizationId?: string | null): Promise<string> {
  try {
    const cfg = await getLocalizationConfig(organizationId ?? null);
    return typeof cfg.default_locale === "string" && cfg.default_locale ? cfg.default_locale : "en";
  } catch {
    return "en";
  }
}

// ─────────────────────────────── composing ─────────────────────────────────

export interface ComposeNotificationInput {
  /** Event key from `NOTIFICATION_EVENTS`. */
  event: string;
  /** Organization the event concerns; its template wins over the platform one. */
  organizationId?: string | null;
  /** Values for the event's variables. A missing one renders as itself. */
  values?: Record<string, unknown>;
  /** Overrides the scope's configured locale. */
  locale?: string | null;
}

export interface ComposedNotification {
  eventKey: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  locale: string;
  provenance: TemplateProvenance;
  templateId: string | null;
  isCustomized: boolean;
  /** True when the template in force declares email only — nothing is written. */
  emailOnly: boolean;
}

/**
 * Work out exactly what one event would deliver right now, without delivering
 * it. The console preview, the "send a test" action and `sendNotification` all
 * share this, so what an administrator previews is what a user receives.
 */
export async function composeNotification(
  input: ComposeNotificationInput,
): Promise<ComposedNotification | null> {
  const event = notificationEvent(input.event);
  if (!event) return null;

  const organizationId =
    typeof input.organizationId === "string" && input.organizationId ? input.organizationId : null;
  const locale = input.locale ?? (await notificationLocaleFor(organizationId));
  const rows = await loadActiveTemplateRows(organizationId);
  const resolved: ResolvedNotificationTemplate =
    resolveTemplate(rows, event.key, { organizationId, locale }) ?? builtInTemplate(event, locale);

  const cfg = await resolveNotificationConfig(organizationId);
  const organizationName = await organizationNameFor(organizationId);
  // Two variables are platform-supplied rather than call-site-supplied: the
  // configured sender name and the organization's own name. A call site can
  // still override either by passing a value.
  const values: Record<string, unknown> = {
    sender_name: cfg.senderName,
    organization_name: organizationName,
    ...(input.values ?? {}),
  };

  return {
    eventKey: event.key,
    type: event.type,
    title: renderNotificationTemplate(resolved.title, values),
    body: renderNotificationTemplate(resolved.body, values),
    link: renderNotificationLink(event.key, values) ?? safeNotificationLink(event.link),
    locale: resolved.locale,
    provenance: resolved.provenance,
    templateId: resolved.templateId,
    isCustomized: resolved.isCustomized,
    emailOnly: resolved.channel === "email",
  };
}

// ─────────────────────────────── delivering ────────────────────────────────

export interface SendNotificationInput extends ComposeNotificationInput {
  /** Recipients. Duplicated or empty ids are dropped. */
  userIds: readonly string[];
}

export type NotificationSkipReason =
  | "unknown_event"
  | "no_recipients"
  | "notifications_disabled"
  | "email_only_template"
  | "insert_failed";

export interface SendNotificationResult {
  delivered: number;
  recipients: number;
  skipped: NotificationSkipReason | null;
  provenance: TemplateProvenance | null;
  templateId: string | null;
  composed: ComposedNotification | null;
  /** Present when the write failed, so a caller can audit the truth. */
  error?: string;
}

/**
 * Is delivery switched on for these recipients?
 *
 * Platform-recipient events answer from the platform scope only, so one tenant's
 * configuration cannot silence the platform's own queue. Everything else answers
 * from the organization's configured `notifications.in_app_enabled`, which is
 * the switch the setting's own description promises: "Off. The bell and the
 * notifications page are hidden and no in-app notification is delivered."
 *
 * The module entitlement is deliberately not consulted here. It gates the
 * surfaces (`notificationsEnabledFor`, and therefore the bell and the wording
 * console), and a plan that excludes the `platform` module already hides them;
 * extending it to delivery would stop writing notifications a tenant's people
 * currently receive, which is a change to what a customer gets, not to how a
 * message is worded.
 */
export async function deliveryEnabledFor(
  event: NotificationEventDef,
  organizationId?: string | null,
): Promise<boolean> {
  try {
    // A platform-recipient event reads the platform switch: one tenant turning
    // notifications off cannot silence the queue its own Super Admins work from.
    const scope = event.deliveryGate === "platform" ? null : organizationId ?? null;
    const cfg = await resolveNotificationConfig(scope);
    return cfg.inAppEnabled;
  } catch {
    // Fail closed: a configuration store we cannot read is not an invitation to
    // write notifications nobody asked for.
    return false;
  }
}

/**
 * Deliver one event to a list of users.
 *
 * Never throws. The return value says how many rows were written and, when none
 * were, exactly why — which is what an audit entry and a console message need.
 */
export async function sendNotification(
  db: NotificationDbClient,
  input: SendNotificationInput,
): Promise<SendNotificationResult> {
  const nothing = (skipped: NotificationSkipReason | null, recipients = 0): SendNotificationResult => ({
    delivered: 0,
    recipients,
    skipped,
    provenance: null,
    templateId: null,
    composed: null,
  });

  const event = notificationEvent(input.event);
  if (!event) return nothing("unknown_event");

  const recipients = [...new Set((input.userIds ?? []).filter((id) => typeof id === "string" && id.trim()))];
  if (recipients.length === 0) return nothing("no_recipients");

  const organizationId =
    typeof input.organizationId === "string" && input.organizationId ? input.organizationId : null;

  if (!(await deliveryEnabledFor(event, organizationId))) {
    return nothing("notifications_disabled", recipients.length);
  }

  const composed = await composeNotification({ ...input, organizationId });
  if (!composed) return nothing("unknown_event", recipients.length);
  if (composed.emailOnly) {
    // An email-only template delivers nothing in-app, and this deployment has
    // no email provider. Reported rather than quietly replaced by the built-in
    // copy: the author chose "email only" and must be able to see the effect.
    return {
      ...nothing("email_only_template", recipients.length),
      provenance: composed.provenance,
      templateId: composed.templateId,
      composed,
    };
  }

  try {
    const { error } = await db.from("notifications").insert(
      recipients.map((user_id) => ({
        user_id,
        type: composed.type,
        title: composed.title,
        body: composed.body,
        link: composed.link,
      })),
    );
    if (error) {
      return {
        ...nothing("insert_failed", recipients.length),
        provenance: composed.provenance,
        templateId: composed.templateId,
        composed,
        error: String(error.message ?? error),
      };
    }
    return {
      delivered: recipients.length,
      recipients: recipients.length,
      skipped: null,
      provenance: composed.provenance,
      templateId: composed.templateId,
      composed,
    };
  } catch (error) {
    return {
      ...nothing("insert_failed", recipients.length),
      provenance: composed.provenance,
      templateId: composed.templateId,
      composed,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─────────────────────────────── console state ─────────────────────────────

export interface NotificationEventState {
  event: NotificationEventDef;
  /** The copy in force for this scope right now. */
  resolved: ResolvedNotificationTemplate;
  /** The saved row for this scope and locale, active or paused, if there is one. */
  saved: NotificationTemplateRow | null;
  /** The platform default row, when the scope is an organization. */
  inherited: NotificationTemplateRow | null;
  /** Preview of the copy in force, with the event's sample values. */
  preview: { title: string; body: string; link: string | null };
}

/**
 * Everything the template console renders for one scope, from two reads of the
 * table. Provenance is carried per event so the page can say "your wording",
 * "EVALORA default" or "shipped copy" instead of leaving an administrator to
 * guess which of the three they are looking at.
 */
export async function notificationTemplateState(
  options: { organizationId?: string | null; locale?: string | null } = {},
): Promise<{ states: NotificationEventState[]; locale: string }> {
  const organizationId =
    typeof options.organizationId === "string" && options.organizationId ? options.organizationId : null;
  const locale = options.locale ?? (await notificationLocaleFor(organizationId));
  const [rows, savedRows] = await Promise.all([
    loadActiveTemplateRows(organizationId),
    loadScopeRows(organizationId, locale),
  ]);

  const states = NOTIFICATION_EVENTS.map((event) => {
    const resolved = resolveTemplate(rows, event.key, { organizationId, locale }) ?? builtInTemplate(event, locale);
    const values: Record<string, unknown> = { ...event.sample };
    return {
      event,
      resolved,
      saved:
        savedRows.find(
          (row) => row.event_key === event.key && (row.organization_id ?? null) === organizationId,
        ) ?? null,
      inherited: organizationId
        ? savedRows.find((row) => row.event_key === event.key && row.organization_id === null) ?? null
        : null,
      preview: {
        title: renderNotificationTemplate(resolved.title, values),
        body: renderNotificationTemplate(resolved.body, values),
        link: renderNotificationLink(event.key, values),
      },
    } satisfies NotificationEventState;
  });

  return { states, locale };
}
