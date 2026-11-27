"use server";

/**
 * Notification wording actions — organization console.
 *
 * Same shared store as the platform console, one difference that matters: the
 * scope is derived from the caller's own membership, never from a form field.
 * `activeOrg(ctx)` decides which organization's wording is written, so a posted
 * `organization_id` is ignored even if it is tampered with — the same rule
 * `saveOrganizationConfig` follows, and the reason an organization structurally
 * cannot reach the platform default or another tenant's wording from here.
 *
 * The write then goes through the caller's session client, where row-level
 * security on `notification_templates` requires `can_manage_org(organization_id)`
 * a second time.
 */
import { audit } from "@/lib/admin";
import { activeOrg, requireUser } from "@/lib/auth";
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

const PATH = "/dashboard/settings/notifications";
const DENIED = "You do not have permission to change your organization's notification wording.";

type Session = Awaited<ReturnType<typeof requireUser>>;

async function authorize(): Promise<{ ctx: Session; organizationId: string } | null> {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) return null;
  // The same operative permission the Configuration console uses, with the
  // module that owns this surface, so a plan without it cannot reach these
  // actions even by posting to them. It is the same key page.tsx gates on, and
  // the same key the module catalog lists this href under.
  if (!(await canOperate(ctx, org.id, "organizations.edit", "org_settings"))) return null;
  return { ctx, organizationId: org.id };
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

export async function saveTemplate(formData: FormData): Promise<NotificationTemplateResult> {
  const auth = await authorize();
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

  await audit(auth.ctx, "notification_template.save", "notification_templates", result.id, auth.organizationId, {
    event_key: result.eventKey,
    locale: result.locale,
    scope: "organization",
    change: result.action,
    superseded: result.superseded,
    variables: result.variables,
  });
  revalidatePath(PATH);

  return {
    ok: true,
    eventKey: result.eventKey,
    message: [
      `${result.action === "created" ? "Saved" : "Updated"} — your organization's wording is now in force for this notification.`,
      result.superseded > 0
        ? `${result.superseded} older template(s) for this event and language were paused, so exactly one wording is in force.`
        : null,
      result.emailOnly
        ? "This wording is email only, and no email provider is connected on this deployment, so nothing will be delivered until one is."
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export async function sendTest(formData: FormData): Promise<NotificationTemplateResult> {
  const auth = await authorize();
  if (!auth) return { ok: false, error: DENIED };
  const draft = draftFrom(formData);
  const eventKey = String(draft.event_key ?? "");

  const db = await createClient();
  const result = await sendTemplateTest(db, { actorId: auth.ctx.user.id, draft });
  if (!result.ok) return { ok: false, error: result.message, eventKey };

  await audit(auth.ctx, "notification_template.test", "notification_templates", result.eventKey, auth.organizationId, {
    event_key: result.eventKey,
    recipient: auth.ctx.user.id,
    title: result.title,
  });

  return {
    ok: true,
    eventKey: result.eventKey,
    message: `Test delivered to your own notifications: “${result.title}”. Open the bell to read it exactly as a recipient would — it went through the same code path.`,
  };
}

export async function resetTemplate(formData: FormData): Promise<NotificationTemplateResult> {
  const auth = await authorize();
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

  await audit(auth.ctx, "notification_template.reset", "notification_templates", eventKey, auth.organizationId, {
    event_key: eventKey,
    locale,
    removed: result.removed,
    scope: "organization",
  });
  revalidatePath(PATH);

  return {
    ok: true,
    eventKey,
    message:
      result.removed === 0
        ? "Your organization had no stored wording for this event, so nothing was deleted. The EVALORA default is in force."
        : `Deleted ${result.removed} stored wording(s). Your organization inherits the EVALORA default again — or the copy shipped in code where no default is set.`,
  };
}
