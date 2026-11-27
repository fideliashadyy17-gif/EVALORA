import { Badge, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { ConfigNamespacePanel, ConfigNamespaceTabs } from "@/components/config/ConfigNamespacePanel";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { getCapabilities, requireModule } from "@/lib/capabilities";
import { createAdminClient } from "@/lib/supabase/server";
import { getConfigCoverage, getFullResolution } from "@/lib/config/service";
import { CONFIG_NAMESPACES } from "@/lib/config/schema";
import type { ConfigNamespace } from "@/lib/config/types";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Organization configuration" };
export const dynamic = "force-dynamic";

/** Namespaces that expose at least one setting an organization may override. */
const ORG_NAMESPACES = CONFIG_NAMESPACES.filter((ns) => ns.audience !== "super_admin")
  .sort((a, b) => a.order - b.order)
  .map((ns) => ns.key);

const SECTION_INTRO: Record<string, string> = {
  org_identity:
    "How your organization presents itself: display name, description, support address and the identity details shown on your workspace and printed documents.",
  branding:
    "Your organization's own branding. Where you set a value it replaces the platform brand for your workspace; where you leave a setting alone you inherit EVALORA's.",
  localization:
    "Interface language preferences for your organization. Examination content always keeps the language its author wrote it in.",
  formatting:
    "How dates, times, numbers and currency appear across your reports, results and dashboards.",
  assessment:
    "Default pass mark, negative marking, numeric tolerance and rounding applied to examinations that do not specify their own. Existing examinations keep the values stored with them, and results are never published automatically by a change here.",
  examination:
    "Starting values pre-filled into your New Examination form. Authors can still change any of them per examination.",
  question_studio:
    "Question design defaults for newly authored questions, plus the categories, difficulty labels and tags available in your Question Bank. Questions already published keep the design stored with them.",
  proctoring:
    "Proctoring requirements for your examinations. Controls whose integration is not yet available are shown as read-only with an explanation rather than as buttons that appear to work.",
  notifications:
    "Notification behaviour for your organization. Transactional email delivery is reported honestly: EVALORA currently sends only Supabase Auth mail.",
};

/**
 * The organization-side Control Center.
 *
 * Same schema, same resolver, same server actions as the platform console —
 * but every write goes through `saveOrganizationConfig`, which derives the
 * scope from the caller's own membership and structurally cannot reach global
 * configuration or another tenant. Settings the schema marks as
 * platform-only render as a read-only report so the difference between
 * "inherited" and "not yours to change" is visible rather than implied.
 */
export default async function OrgConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; q?: string; e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect("/dashboard");

  const sp = await searchParams;
  const section = ORG_NAMESPACES.includes((sp.section ?? "") as ConfigNamespace)
    ? (sp.section as ConfigNamespace)
    : "org_identity";
  const query = String(sp.q ?? "");

  const admin = createAdminClient();
  const { entitlement } = await getCapabilities(admin, ctx, org.id);
  requireModule(entitlement, "org_settings", "/dashboard?e=module");
  const canEdit = await canOperate(ctx, org.id, "organizations.edit", "org_settings");

  const [{ provenance: orgProvenance }, { provenance: globalProvenance }, coverage] = await Promise.all([
    getFullResolution(org.id),
    getFullResolution(null),
    getConfigCoverage(org.id),
  ]);

  const overridden = Object.values(orgProvenance).filter((e) => e.source === "organization").length;
  const meta = CONFIG_NAMESPACES.find((ns) => ns.key === section);

  return (
    <>
      <PageTitle
        eyebrow={`${org.name} · Workspace settings`}
        title="Configuration"
        subtitle="Settings your organization controls. Everything you leave alone inherits the platform default, and the badge on each setting tells you exactly which layer is in effect."
        action={
          <>
            <ButtonLink href="/dashboard/settings" variant="outline">
              Workspace settings
            </ButtonLink>
            <ButtonLink href="/dashboard/settings/templates" variant="outline">
              Paper templates
            </ButtonLink>
          </>
        }
      />

      {sp.e === "module" && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-900 ring-1 ring-red-600/30">
          Organization settings are not included in your current plan.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Your overrides" value={overridden} hint="Settings you have changed" />
        <StatCard label="Inherited from platform" value={coverage.fromGlobal} hint="Platform values in effect" />
        <StatCard label="On built-in defaults" value={coverage.fromDefault} hint="Neither layer set a value" />
      </div>

      {!canEdit && (
        <Card className="mt-6 border-amber-600/30 bg-amber-50/60 p-5">
          <h2 className="font-display text-base font-semibold text-amber-900">Read-only for your role</h2>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            You can see every setting and its current effective value, but changing organization configuration requires
            the <em>organizations.edit</em> permission with the org-settings module enabled. Ask a Founder or
            administrator of {org.name} if a value needs to change.
          </p>
        </Card>
      )}

      <Card className="mt-6 p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Inheritance</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          A value resolves as <strong>your override</strong> → <strong>platform value</strong> →{" "}
          <strong>built-in default</strong>. <em>Reset to inherit</em> removes only your organization&rsquo;s override: the
          platform value is unchanged and no other organization is affected. Your configuration is isolated from every
          other tenant by database row-level security.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="gold">Your override</Badge>
          <Badge tone="green">Platform value</Badge>
          <Badge tone="gray">Built-in default</Badge>
          <Badge tone="amber">Operational — needs confirmation</Badge>
        </div>
      </Card>

      <div className="mt-8">
        <ConfigNamespaceTabs
          namespaces={ORG_NAMESPACES}
          active={section}
          basePath="/dashboard/settings/configuration"
        />
      </div>

      <div className="mt-6">
        <h1 className="font-display text-xl font-semibold text-evergreen-950">{meta?.label ?? section}</h1>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-ink-soft">
          {SECTION_INTRO[section] ?? meta?.description ?? ""}
        </p>
      </div>

      <form className="mt-4 flex flex-wrap items-center gap-2" method="get">
        <input type="hidden" name="section" value={section} />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="w-full max-w-sm rounded-lg border border-evergreen-900/55 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25"
        />
        <button
          type="submit"
          className="rounded-lg border border-evergreen-700/50 bg-white px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50"
        >
          Search
        </button>
      </form>

      <div className="mt-6">
        <ConfigNamespacePanel
          namespace={section}
          scope="organization"
          actor="tenant"
          organizationId={org.id}
          organizationName={org.name}
          provenance={orgProvenance}
          inherited={globalProvenance}
          query={query}
        />
      </div>
    </>
  );
}
