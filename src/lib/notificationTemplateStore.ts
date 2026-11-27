import "server-only";

/**
 * Writing `notification_templates` — the one door both consoles use.
 *
 * The platform console (Super Admin) and the organization console (an
 * organization's own managers) authorize differently and are separate server
 * actions, but the write itself has to behave identically in both, so it lives
 * here:
 *
 *   • a draft is validated by the registry before anything touches the table —
 *     an unknown event, an unknown variable or an over-long title is refused
 *     with the reason, never stored;
 *   • one scope keeps ONE template per event and language. The table's unique
 *     index is per (tenant, event, channel, locale), so changing a template's
 *     channel could otherwise leave two active rows competing for the same
 *     event; the older one is paused and the console reports that it was;
 *   • "reset to inherit" deletes only that scope's row. An organization that
 *     resets falls back to the platform default, and a platform default that is
 *     reset falls back to the copy shipped in code — the same rule the
 *     configuration layer follows, so "inherited" always means the same thing;
 *   • the caller passes the client it authenticated with, so row-level security
 *     re-checks the write. Authorization is never this module's only defence.
 */
import {
  previewTemplate,
  renderNotificationLink,
  validateTemplateDraft,
  type NotificationTemplateDraft,
} from "@/lib/notificationTemplates";
import { createAdminClient } from "@/lib/supabase/server";

/** A client that can write `notification_templates` (session or service role). */
export type TemplateDbClient = ReturnType<typeof createAdminClient>;

export type TemplateWriteFailure = { ok: false; code: string; message: string };

export type TemplateSaveResult =
  | {
      ok: true;
      id: string;
      eventKey: string;
      locale: string;
      /** Whether this created the scope's template or changed an existing one. */
      action: "created" | "updated";
      /** Older rows for the same event and language paused to keep one in force. */
      superseded: number;
      /** True when the saved template delivers nothing in-app. */
      emailOnly: boolean;
      variables: string[];
    }
  | TemplateWriteFailure;

export type TemplateResetResult =
  | { ok: true; eventKey: string; locale: string; removed: number; inherits: "platform" | "built_in" }
  | TemplateWriteFailure;

export type TemplateTestResult =
  | { ok: true; eventKey: string; title: string; body: string; link: string | null }
  | TemplateWriteFailure;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Normalize the scope a write applies to. `null` means the platform default;
 * anything else must be a UUID, so a malformed id can never widen a query.
 */
function writeScope(organizationId: unknown): string | null {
  return typeof organizationId === "string" && isUuid(organizationId) ? organizationId : null;
}

function writeFailure(error: { message?: string; code?: string }): TemplateWriteFailure {
  const message = String(error.message ?? "unknown error");
  // The unique index reports a collision as 23505: two templates claimed the
  // same event, channel and language at the same moment.
  if (error.code === "23505") {
    return {
      ok: false,
      code: "duplicate",
      message:
        "Another template for this event, channel and language was saved at the same moment. Reload and try again.",
    };
  }
  return { ok: false, code: "write_failed", message };
}

/**
 * Create or update one scope's template for one event and language.
 *
 * `organizationId` must already be authorized by the caller: `null` for the
 * platform default (Super Admin only), or the caller's own organization id
 * derived from their session — never an id taken from a form field.
 */
export async function saveNotificationTemplate(
  db: TemplateDbClient,
  input: { actorId: string; organizationId: string | null; draft: NotificationTemplateDraft },
): Promise<TemplateSaveResult> {
  const organizationId = writeScope(input.organizationId);

  const validation = validateTemplateDraft(input.draft ?? {});
  if (!validation.ok) return { ok: false, code: validation.code, message: validation.message };

  const eventKey = validation.event.key;
  const locale = validation.locale;
  const payload = {
    organization_id: organizationId,
    event_key: eventKey,
    channel: validation.channel,
    title: validation.title,
    body: validation.body,
    locale,
    variables: validation.variables,
    is_active: validation.isActive,
    updated_at: new Date().toISOString(),
  };

  try {
    const existingQuery = db
      .from("notification_templates")
      .select("id, channel")
      .eq("event_key", eventKey)
      .eq("locale", locale);
    const { data: existing, error: readError } = await (organizationId
      ? existingQuery.eq("organization_id", organizationId)
      : existingQuery.is("organization_id", null));
    if (readError) {
      return {
        ok: false,
        code: "read_failed",
        message: `The saved templates could not be read: ${readError.message ?? "unknown error"}.`,
      };
    }

    const rows = Array.isArray(existing) ? (existing as { id: string; channel: string }[]) : [];
    // Keep the row that already carries the channel being saved when there is
    // more than one, so an ordinary edit does not churn ids.
    const keep = rows.find((row) => row.channel === validation.channel) ?? rows[0] ?? null;
    const redundant = rows.filter((row) => row.id !== keep?.id);

    let id = keep?.id ?? "";
    let action: "created" | "updated" = "updated";

    if (keep) {
      const { error } = await db
        .from("notification_templates")
        .update(payload)
        .eq("id", keep.id)
        // Re-checked on the write itself, so a scope that was somehow wrong
        // still cannot reach another tenant's row.
        .eq("event_key", eventKey)
        .eq("locale", locale);
      if (error) return writeFailure(error);
    } else {
      action = "created";
      const { data: inserted, error } = await db
        .from("notification_templates")
        .insert({ ...payload, created_by: input.actorId || null })
        .select("id")
        .maybeSingle();
      if (error) return writeFailure(error);
      id = String((inserted as { id?: unknown } | null)?.id ?? "");
      if (!id) {
        return {
          ok: false,
          code: "not_stored",
          message: "The template was not stored, and nothing was changed.",
        };
      }
    }

    // Pause any older row for the same event and language so exactly one
    // template is in force. Without this, changing a template's channel would
    // leave two active rows and the resolver would have to guess between them.
    let superseded = 0;
    for (const row of redundant) {
      const { error } = await db
        .from("notification_templates")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (!error) superseded += 1;
    }

    return {
      ok: true,
      id,
      eventKey,
      locale,
      action,
      superseded,
      emailOnly: validation.emailOnly,
      variables: validation.variables,
    };
  } catch (error) {
    return {
      ok: false,
      code: "write_failed",
      message: error instanceof Error ? error.message : "The template could not be stored.",
    };
  }
}

/**
 * Delete one scope's template for one event and language, so the scope inherits
 * again. Only that scope's rows are matched: an organization resetting a
 * template can never delete the platform default it is about to inherit.
 */
export async function resetNotificationTemplate(
  db: TemplateDbClient,
  input: { organizationId: string | null; eventKey: string; locale: string },
): Promise<TemplateResetResult> {
  const organizationId = writeScope(input.organizationId);
  const eventKey = typeof input.eventKey === "string" ? input.eventKey.trim() : "";
  const locale = typeof input.locale === "string" && input.locale ? input.locale : "en";
  if (!eventKey) return { ok: false, code: "unknown_event", message: "No notification event was given." };
  const inherits = organizationId ? "platform" : "built_in";

  try {
    const readQuery = db.from("notification_templates").select("id").eq("event_key", eventKey).eq("locale", locale);
    const { data: existing, error: readError } = await (organizationId
      ? readQuery.eq("organization_id", organizationId)
      : readQuery.is("organization_id", null));
    if (readError) {
      return {
        ok: false,
        code: "read_failed",
        message: `The saved templates could not be read: ${readError.message ?? "unknown error"}.`,
      };
    }
    const ids = (Array.isArray(existing) ? (existing as { id: string }[]) : []).map((row) => row.id).filter(Boolean);
    if (ids.length === 0) return { ok: true, eventKey, locale, removed: 0, inherits };

    const deleteQuery = db.from("notification_templates").delete().eq("event_key", eventKey).eq("locale", locale);
    const { error } = await (organizationId
      ? deleteQuery.eq("organization_id", organizationId)
      : deleteQuery.is("organization_id", null));
    if (error) return writeFailure(error);
    return { ok: true, eventKey, locale, removed: ids.length, inherits };
  } catch (error) {
    return {
      ok: false,
      code: "write_failed",
      message: error instanceof Error ? error.message : "The template could not be removed.",
    };
  }
}

/**
 * Compose a test notification from an UNSAVED draft and deliver it to the person
 * editing, so "what will a user read?" is answered with a real notification in
 * their own bell rather than with a picture of one.
 *
 * Delivered through the caller's own session: `notifications` row-level security
 * only lets an account write a notification addressed to itself, so this cannot
 * be used to message anybody else.
 */
export async function sendTemplateTest(
  db: TemplateDbClient,
  input: { actorId: string; draft: NotificationTemplateDraft },
): Promise<TemplateTestResult> {
  const validation = validateTemplateDraft(input.draft ?? {});
  if (!validation.ok) return { ok: false, code: validation.code, message: validation.message };
  if (!input.actorId) return { ok: false, code: "no_actor", message: "Sign in again to send yourself a test." };

  const preview = previewTemplate(validation.event.key, validation.title, validation.body);
  const link = renderNotificationLink(validation.event.key);
  const payload = {
    user_id: input.actorId,
    type: validation.event.type,
    title: preview.title,
    body: preview.body,
    link,
  };

  try {
    const { error } = await db.from("notifications").insert(payload);
    if (error) return writeFailure(error);
    return {
      ok: true,
      eventKey: validation.event.key,
      title: preview.title,
      body: preview.body,
      link,
    };
  } catch (error) {
    return {
      ok: false,
      code: "write_failed",
      message: error instanceof Error ? error.message : "The test notification could not be delivered.",
    };
  }
}
