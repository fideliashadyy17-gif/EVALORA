import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { NotificationTemplateStudio } from "@/components/notifications/NotificationTemplateStudio";
import { activeOrg, requireUser } from "@/lib/auth";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { canOperate } from "@/lib/operationalAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { notificationLocaleFor, notificationTemplateState } from "@/lib/notificationDelivery";
import { notificationCapabilityReport, resolveNotificationConfig } from "@/lib/notificationService";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_LOCALE_VALUES,
  NOTIFICATION_TEMPLATE_LOCALES,
} from "@/lib/notificationTemplates";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resetTemplate, saveTemplate, sendTest } from "./actions";

export const metadata: Metadata = { title: "Notification wording" };
export const dynamic = "force-dynamic";

/**
 * Notification wording — the organization console for `notification_templates`.
 *
 * The same table, the same resolver and the same store as the platform console,
 * with the scope taken from the caller's own membership instead of from a form
 * field. An organization edits its own wording; where it has none it inherits
 * EVALORA's default, and where there is no default it gets the copy shipped in
 * code. It can never read or write another tenant's wording or the platform
 * default — the action derives the scope from the session and row-level security
 * checks it again.
 */
export default async function OrganizationNotificationTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; q?: string; edit?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");
  const sp = await searchParams;

  const admin = createAdminClient();
  const { entitlement } = await getCapabilities(admin, ctx, org.id);
  // `org_settings` is the module that owns Organization Settings and the
  // Configuration console this page sits beside, and it is the module the
  // sidebar entry is registered under — the catalog and this gate must name the
  // same key or the sidebar offers a destination that redirects (see
  // src/lib/navModules.ts). Gating wording on `platform` ("My Platform",
  // Institution only) would have made a tenant's own copy editable only on the
  // top plan, for no reason an administrator could see anywhere.
  requireModule(entitlement, "org_settings", "/dashboard?e=module");
  const canEdit = await canOperate(ctx, org.id, "organizations.edit", "org_settings");

  const requestedLocale = String(sp.locale ?? "").trim();
  const locale = NOTIFICATION_LOCALE_VALUES.includes(requestedLocale)
    ? requestedLocale
    : await notificationLocaleFor(org.id);
  const editing = NOTIFICATION_EVENTS.some((event) => event.key === sp.edit) ? String(sp.edit) : null;
  const query = String(sp.q ?? "").slice(0, 80);

  const [{ states }, capability, config] = await Promise.all([
    notificationTemplateState({ organizationId: org.id, locale }),
    notificationCapabilityReport(org.id),
    resolveNotificationConfig(org.id),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Organization Settings · Alerts & Communications"
        title="Notification wording"
        subtitle="The copy your members read when something happens in your workspace — a subscription change, a membership, a retake decision. Edit your own wording, keep EVALORA's default where you have nothing to change, and send yourself a test before it goes to your people."
        action={<ButtonLink href="/dashboard/settings" variant="outline">Organization settings</ButtonLink>}
      />

      {!config.inAppEnabled && (
        <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/25">
          In-app notifications are switched off for your organization, so nothing is delivered and the bell is hidden —
          wording saved here is stored but not sent. Turn delivery on in{" "}
          <Link
            href="/dashboard/settings/configuration?section=notifications"
            className="font-medium underline"
          >
            Configuration → Notifications
          </Link>
          .
        </p>
      )}

      <NotificationTemplateStudio
        scopeLabel={org.name}
        scopeHint={`Your organization's own wording. Where you have saved none, you inherit EVALORA's default; where there is no default, the copy shipped with the product is used. Notifications sent to EVALORA's own administrators — a payment you submitted, a retake you requested — follow the platform's switch, so your settings cannot silence the team that verifies them.`}
        organizationId={org.id}
        locale={locale}
        locales={NOTIFICATION_TEMPLATE_LOCALES}
        states={states}
        canEdit={canEdit}
        readOnlyNote="You can read the wording your members receive, but only an owner or administrator of your organization can change it."
        saveAction={saveTemplate}
        testAction={sendTest}
        resetAction={resetTemplate}
        capability={capability}
        editing={editing}
        query={query}
      />

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Delivery on this deployment</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-display text-base font-semibold text-evergreen-950">In-app notifications</h3>
            <p className="mt-1.5 text-sm text-ink-soft">
              {config.inAppEnabled
                ? `On. Delivered to the bell and to your notifications page, shown as “${config.senderName}”.`
                : "Off. Nothing is delivered and the bell is hidden."}{" "}
              Change the switch in{" "}
              <Link href="/dashboard/settings/configuration?section=notifications" className="font-medium text-evergreen-800 underline">
                Configuration → Notifications
              </Link>
              .
            </p>
          </Card>
          <Card className="p-5">
            <h3 className="font-display text-base font-semibold text-evergreen-950">Email</h3>
            <p className="mt-1.5 text-sm text-ink-soft">
              {capability.find((entry) => entry.key === "email")?.explanation ??
                "EVALORA has no general-purpose email provider connected, so an email composed by the application cannot be sent. Wording can be authored and previewed for the day one is connected; account invitations and password resets are sent by Supabase Auth and configured in Supabase."}
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
