"use server";

/**
 * Notification wording actions — platform console.
 *
 * Thin adapters over the shared store in `src/lib/notificationTemplateStore.ts`:
 * they authorize, they audit, and they convert a structured result into the
 * shape the editor renders. All validation — the event registry, the variable
 * allowlist, the length limits — happens in the store, so the organization
 * console and this one cannot drift apart.
 *
 * Authorization here is two-layered on purpose. `requireSuperAdmin()` proves who
 * is acting; `canOperate(ctx, null, "notification.templates.manage")` asks the
 * permission catalog, so a Super Admin who has been explicitly denied this
 * permission in RBAC & User Role Management is denied here too. The write then
 * goes through the caller's own session client, where row-level security on
 * `notification_templates` re-checks `is_super_admin()` before a row changes.
 *
 * These actions return a result instead of redirecting: the editor keeps the
 * draft on screen and shows the refusal next to the field that caused it, which
 * a redirect would throw away.
 */
import { audit, requireSuperAdmin } from "@/lib/admin";
import type { NotificationTemplateResult } from "@/components/notifications/NotificationTemplateEditor";
import { canOperate } from "@/lib/operationalAccess";
import {
  resetNotificationTemplate,
  saveNotificationTemplate,
  sendTemplateTest,
} from "@/lib/notificationTemplateStore";
import type { NotificationTemplateDraft } from "@/lib/notificationTemplates";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/admin/control-center/notifications";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = "You do not have permission to change notification wording.";

type Session = Awaited<ReturnType<typeof requireSuperAdmin>>;

async function authorize(formData: FormData): Promise<{ ctx: Session; organizationId: string | null } | null> {
  const ctx = await requireSuperAdmin();
  if (!(await canOperate(ctx, null, "notification.templates.manage"))) return null;
  // An empty or malformed id means the platform default — never "whatever was
  // posted". Only a UUID can select an organization's wording.
  const raw = String(formData.get("organization_id") ?? "").trim();
  return { ctx, organizationId: UUID.test(raw) ? raw : null };
}

function draftFrom(formData: FormData): NotificationTemplateDraft {
  return {
    event_key: String(formData.get("event_key") ?? ""),
    channel: String(formData.get("channel") ?? "in_app"),
    locale: String(formData.get("locale") ?? "en"),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    is_active: formData.get("is_active") === "on",
  };
}

function scopeName(organizationId: string | null): string {
  return organizationId ? "that organization" : "every organization that has no wording of its own";
}

export async function saveTemplate(formData: FormData): Promise<NotificationTemplateResult> {
  const auth = await authorize(formData);
  if (!auth) return { ok: false, error: DENIED };
  const draft = draftFrom(formData);
  const eventKey = String(draft.event_key ?? "");

  const db = await createClient();
  const result = await saveNotificationTemplate(db, {
    actorId: auth.ctx.user.id,
    organizationId: auth.organizationId,
    draft,
  });
  if (!result.ok) return { ok: false, error: result.message, eventKey };

  await audit(
    auth.ctx,
    "notification_template.save",
    "notification_templates",
    result.id,
    auth.organizationId,
    {
      event_key: result.eventKey,
      locale: result.locale,
      scope: auth.organizationId ? "organization" : "platform",
      change: result.action,
      superseded: result.superseded,
      variables: result.variables,
    },
  );
  revalidatePath(PATH);

  const notes = [
    result.superseded > 0
      ? `${result.superseded} older template(s) for this event and language were paused, so exactly one wording is in force.`
      : null,
    result.emailOnly
      ? "This wording is email only, and no email provider is connected on this deployment, so nothing will be delivered until one is."
      : null,
  ].filter(Boolean);

  return {
    ok: true,
    eventKey: result.eventKey,
    message: [
      `${result.action === "created" ? "Saved" : "Updated"} — this wording is now in force for ${scopeName(
        auth.organizationId,
      )}.`,
      ...notes,
    ].join(" "),
  };
}

export async function sendTest(formData: FormData): Promise<NotificationTemplateResult> {
  const auth = await authorize(formData);
  if (!auth) return { ok: false, error: DENIED };
  const draft = draftFrom(formData);
  const eventKey = String(draft.event_key ?? "");

  const db = await createClient();
  const result = await sendTemplateTest(db, { actorId: auth.ctx.user.id, draft });
  if (!result.ok) return { ok: false, error: result.message, eventKey };

  await audit(
    auth.ctx,
    "notification_template.test",
    "notification_templates",
    result.eventKey,
    auth.organizationId,
    { event_key: result.eventKey, recipient: auth.ctx.user.id, title: result.title },
  );

  return {
    ok: true,
    eventKey: result.eventKey,
    message: `Test delivered to your own notifications: “${result.title}”. Open the bell to read it exactly as a recipient would — it went through the same code path.`,
  };
}

export async function resetTemplate(formData: FormData): Promise<NotificationTemplateResult> {
  const auth = await authorize(formData);
  if (!auth) return { ok: false, error: DENIED };
  if (formData.get("confirm") !== "on") {
    return { ok: false, error: "Confirm the deletion first: this removes the wording rather than pausing it." };
  }
  const eventKey = String(formData.get("event_key") ?? "");
  const locale = String(formData.get("locale") ?? "en");

  const db = await createClient();
  const result = await resetNotificationTemplate(db, {
    organizationId: auth.organizationId,
    eventKey,
    locale,
  });
  if (!result.ok) return { ok: false, error: result.message, eventKey };

  await audit(
    auth.ctx,
    "notification_template.reset",
    "notification_templates",
    eventKey,
    auth.organizationId,
    { event_key: eventKey, locale, removed: result.removed, scope: auth.organizationId ? "organization" : "platform" },
  );
  revalidatePath(PATH);

  return {
    ok: true,
    eventKey,
    message:
      result.removed === 0
        ? `Nothing was stored for this event, so nothing was deleted. ${
            result.inherits === "platform" ? "The EVALORA default wording is in force." : "The copy shipped in code is in force."
          }`
        : `Deleted ${result.removed} stored wording(s). ${
            result.inherits === "platform"
              ? "The EVALORA default wording is in force again."
              : "The copy shipped in code is in force again."
          }`,
  };
}
