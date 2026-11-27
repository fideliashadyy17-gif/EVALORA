import { Badge, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { ConfigNamespacePanel, ConfigNamespaceTabs } from "@/components/config/ConfigNamespacePanel";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getConfigCoverage, getFullResolution } from "@/lib/config/service";
import { CONFIG_NAMESPACES } from "@/lib/config/schema";
import type { ConfigNamespace } from "@/lib/config/types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requestFormatter } from "@/lib/formattingRequest";

export const metadata: Metadata = { title: "Organization configuration" };
export const dynamic = "force-dynamic";

/** Namespaces that carry at least one organization-writable setting. */
const ORG_NAMESPACES = CONFIG_NAMESPACES.filter((ns) => ns.audience !== "super_admin")
  .sort((a, b) => a.order - b.order)
  .map((ns) => ns.key);

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  created_at: string | null;
}

/**
 * One organization's configuration, as a verified Super Admin sees it.
 *
 * Every field shows which layer supplied the current value and what it would
 * inherit if the override were removed, so the difference between "platform
 * policy" and "this tenant chose differently" is never ambiguous. Writes go
 * through the platform action with scope=organization: the same validated,
 * versioned, audited path a tenant's own administrators use.
 */
export default async function OrganizationConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; q?: string }>;
}) {
  await requireSuperAdmin();
  // Configured date, time and number profile (Platform Control Center →
  // Presentation), resolved once per request from the platform-wide scope.
  const { dateTime: fmtDateTime } = await requestFormatter(null);
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdminClient();
  const { data: rawOrg } = await admin
    .from("organizations")
    .select("id, name, slug, type, created_at, deleted_at")
    .eq("id", id)
    .maybeSingle();
  const org = rawOrg as (OrgRow & { deleted_at: string | null }) | null;
  if (!org || org.deleted_at) notFound();

  const section = ORG_NAMESPACES.includes((sp.section ?? "") as ConfigNamespace)
    ? (sp.section as ConfigNamespace)
    : "org_identity";
  const query = String(sp.q ?? "");

  const [{ provenance: orgProvenance }, { provenance: globalProvenance }, coverage, { count: memberCount }] =
    await Promise.all([
      getFullResolution(org.id),
      getFullResolution(null),
      getConfigCoverage(org.id),
      admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    ]);

  const overridden = Object.values(orgProvenance).filter((e) => e.source === "organization").length;
  const configuredGlobally = Object.values(globalProvenance).filter((e) => e.source === "global").length;
  const meta = CONFIG_NAMESPACES.find((ns) => ns.key === section);

  return (
    <>
      <PageTitle
        eyebrow={
          <>
            Platform Control Center ·{" "}
            <Link href="/admin/control-center/organizations" className="hover:underline">
              Organizations
            </Link>{" "}
            · {org.slug}
          </>
        }
        title={org.name}
        subtitle={`Organization-level configuration. ${org.name} inherits every platform setting unless it has an explicit override below. Changes here affect this organization only.`}
        meta={
          <>
            <Badge tone="gray">{org.type ?? "organization"}</Badge>
            <span>Provisioned {org.created_at ? fmtDateTime(org.created_at) : "—"}</span>
            <span>{memberCount ?? 0} members</span>
          </>
        }
        action={
          <>
            <ButtonLink href="/admin/control-center/organizations" variant="outline">
              All organizations
            </ButtonLink>
            <ButtonLink href={`/admin/control-center/history?org=${org.id}`} variant="outline">
              Change history
            </ButtonLink>
            <ButtonLink href="/admin/control-center" variant="gold">
              Platform configuration
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Overrides" value={overridden} hint="Settings this organization chose itself" />
        <StatCard label="Inherited from platform" value={coverage.fromGlobal} hint={`Platform has configured ${configuredGlobally}`} />
        <StatCard label="On built-in defaults" value={coverage.fromDefault} hint="Neither layer set a value" />
        <StatCard label="Organization data isolation" value="Enforced" hint="Row-level security by organization_id" />
      </div>

      <Card className="mt-6 border-amber-600/30 bg-amber-50/60 p-5">
        <h2 className="font-display text-base font-semibold text-amber-900">Before you change a tenant&rsquo;s configuration</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-900">
          <li>
            Every save is versioned and audit-logged against your Super Admin account, and can be rolled back from
            Change history.
          </li>
          <li>
            Assessment defaults only fill gaps: an examination&rsquo;s own stored pass mark, negative marking and tolerance
            always win, so nothing already scheduled or marked is silently restated.
          </li>
          <li>
            Question Studio design defaults apply to newly authored questions. Published questions and examinations
            keep the design snapshot stored with them, so a change here cannot restyle a live paper.
          </li>
          <li>
            Results are never published by a configuration change. Validation and publication remain explicit,
            separate controls on the results screens.
          </li>
        </ul>
      </Card>

      <div className="mt-8">
        <ConfigNamespaceTabs
          namespaces={ORG_NAMESPACES}
          active={section}
          basePath={`/admin/control-center/organizations/${org.id}`}
        />
      </div>

      <div className="mt-6">
        <h1 className="font-display text-xl font-semibold text-evergreen-950">{meta?.label ?? section}</h1>
        {meta?.description && <p className="mt-1 max-w-4xl text-sm leading-relaxed text-ink-soft">{meta.description}</p>}
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
          actor="super_admin"
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
