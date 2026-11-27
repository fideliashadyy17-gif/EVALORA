import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { NotificationTemplateStudio } from "@/components/notifications/NotificationTemplateStudio";
import { requireSuperAdmin } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { notificationLocaleFor, notificationTemplateState } from "@/lib/notificationDelivery";
import { notificationCapabilityReport } from "@/lib/notificationService";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_LOCALE_VALUES,
  NOTIFICATION_TEMPLATE_LOCALES,
} from "@/lib/notificationTemplates";
import type { Metadata } from "next";
import Link from "next/link";
import { resetTemplate, saveTemplate, sendTest } from "./actions";
import { Section } from "../../ui";

export const metadata: Metadata = { title: "Notification wording" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notification wording — the platform console for `notification_templates`.
 *
 * Every notification EVALORA generates is listed here with the copy actually in
 * force for the chosen scope, where that copy came from, and an editor that
 * writes to the table the delivery code reads. Nothing on this page is a
 * mock-up: saving changes what recipients receive, and "send myself a test"
 * delivers a real notification through the production path.
 *
 * Scope is a Super Admin decision. The platform default applies to every
 * organization that has no wording of its own; choosing an organization edits
 * that organization's wording only, and an organization can never see or change
 * another's — the write carries the selected id and row-level security checks
 * it again.
 */
export default async function NotificationTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; locale?: string; q?: string; edit?: string }>;
}) {
  const ctx = await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const canManage = await canOperate(ctx, null, "notification.templates.manage");

  const requestedOrg = String(sp.org ?? "").trim();
  const organizationId = UUID.test(requestedOrg) ? requestedOrg : null;
  const requestedLocale = String(sp.locale ?? "").trim();
  const locale = NOTIFICATION_LOCALE_VALUES.includes(requestedLocale)
    ? requestedLocale
    : await notificationLocaleFor(organizationId);
  const editing = NOTIFICATION_EVENTS.some((event) => event.key === sp.edit) ? String(sp.edit) : null;
  const query = String(sp.q ?? "").slice(0, 80);

  const [{ data: rawOrgs }, { states }, capability, scopeName] = await Promise.all([
    admin.from("organizations").select("id, name").is("deleted_at", null).order("name").limit(500),
    notificationTemplateState({ organizationId, locale }),
    notificationCapabilityReport(organizationId),
    organizationId
      ? admin
          .from("organizations")
          .select("name")
          .eq("id", organizationId)
          .maybeSingle()
          .then((result) => String((result.data as { name?: unknown } | null)?.name ?? "That organization"))
      : Promise.resolve("Platform default"),
  ]);

  const orgs = ((rawOrgs ?? []) as { id: string; name: string }[]).map((org) => ({ id: org.id, name: org.name }));

  return (
    <>
      <PageTitle
        eyebrow="Platform Control Center"
        title="Notification wording"
        subtitle="The copy behind every notification EVALORA generates. Edit the platform default that every organization inherits, or one organization's own wording, preview it with real sample values, and send yourself a test through the production delivery path."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/notifications" variant="outline">
              Broadcast center →
            </ButtonLink>
            <ButtonLink href="/admin/control-center" variant="ghost">
              Control Center
            </ButtonLink>
          </div>
        }
      />

      {!canManage && (
        <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/25">
          <span className="font-mono">notification.templates.manage</span> is disabled or missing in RBAC &amp; User
          Role Management, so the wording below is read-only for every Super Admin — the resolver allows any active
          Super Admin once that key exists and is enabled, and no per-account grant is consulted. Enable the key to edit.
        </p>
      )}

      <NotificationTemplateStudio
        scopeLabel={organizationId ? scopeName : "Platform default"}
        scopeHint={
          organizationId
            ? `You are editing ${scopeName}'s own wording. Where it has none, it inherits the platform default; where there is no platform default, the copy shipped in code is used. Your change affects this organization only.`
            : "You are editing the platform default. Every organization that has not written its own wording for an event receives this copy. Choose an organization above to edit its wording instead."
        }
        organizationId={organizationId}
        locale={locale}
        locales={NOTIFICATION_TEMPLATE_LOCALES}
        states={states}
        canEdit={canManage}
        readOnlyNote="Read-only: notification.templates.manage is disabled in RBAC & User Role Management."
        saveAction={saveTemplate}
        testAction={sendTest}
        resetAction={resetTemplate}
        capability={capability}
        editing={editing}
        query={query}
        scopeOptions={orgs}
      />

      <Section
        title="What is not a template"
        hint="Two kinds of message are deliberately absent from this list, so the console does not imply coverage it does not have."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-display text-base font-semibold text-evergreen-950">Broadcasts and targeted messages</h3>
            <p className="mt-1.5 text-sm text-ink-soft">
              A platform broadcast and a targeted message are composed by the administrator at send time — that is the
              point of them — so there is no stored wording to edit. They are dispatched from the{" "}
              <Link href="/admin/notifications" className="font-medium text-evergreen-800 underline">
                broadcast center
              </Link>{" "}
              and every send is audit-logged.
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="font-display text-base font-semibold text-evergreen-950">Supabase Auth mail</h3>
            <p className="mt-1.5 text-sm text-ink-soft">
              Account invitations and password resets are composed and sent by Supabase Auth, not by EVALORA. Their
              templates live in Supabase → Auth → Email Templates, so they are outside this console by design rather
              than by omission.
            </p>
          </Card>
        </div>
      </Section>

      <Section
        title="How wording reaches a recipient"
        hint="The resolution order the delivery code applies to every event, in the order it is tried."
      >
        <Card className="p-5 text-sm text-ink-soft">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              The organization&apos;s own active template for this event in the organization&apos;s configured
              language (<span className="font-mono">localization.default_locale</span>).
            </li>
            <li>The same organization&apos;s active template in English.</li>
            <li>The platform default template in the configured language, then in English.</li>
            <li>The copy shipped in code, which is what an uncustomized deployment has always sent.</li>
          </ol>
          <p className="mt-3">
            A template whose channel is <span className="font-mono">email</span> only is skipped for in-app delivery and
            the fallback is used instead, because this deployment has no email provider — the badge on the event says so
            rather than letting a saved template silently deliver nothing.
          </p>
        </Card>
      </Section>
    </>
  );
}
