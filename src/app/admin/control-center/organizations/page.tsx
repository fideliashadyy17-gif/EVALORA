import { Badge, ButtonLink, Card, DataTable, EmptyState, PageTitle, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getConfigCoverage, getFullResolution } from "@/lib/config/service";
import { organizationWritableConfigs } from "@/lib/config/schema";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Organization configuration" };
export const dynamic = "force-dynamic";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  created_at: string | null;
}

/**
 * Every organization with its configuration posture: how many of the settings
 * it is allowed to override it has actually overridden, and how many still
 * inherit from the platform layer.
 *
 * Override counts come from real rows in platform_config_values, never from a
 * guess, so an organization that has never touched configuration shows zero
 * rather than an invented number.
 */
export default async function OrganizationConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const query = String(sp.q ?? "").trim().toLowerCase();
  const admin = createAdminClient();

  const [{ data: rawOrgs }, platformCoverage, writable] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, slug, type, created_at")
      .is("deleted_at", null)
      .order("name")
      .limit(500),
    getConfigCoverage(null),
    Promise.resolve(organizationWritableConfigs()),
  ]);

  const orgs = ((rawOrgs ?? []) as unknown as OrgRow[]).filter(
    (o) => !query || `${o.name} ${o.slug}`.toLowerCase().includes(query),
  );

  // Per-organization coverage, resolved through the same service the modules
  // use — so the number shown here is exactly the number the tenant's screens
  // will act on.
  const coverage = await Promise.all(
    orgs.map(async (org) => {
      const [own, resolution] = await Promise.all([
        getConfigCoverage(org.id).catch(() => null),
        getFullResolution(org.id).catch(() => null),
      ]);
      const overridden = resolution
        ? Object.entries(resolution.provenance).filter(([, e]) => e.source === "organization").length
        : (own?.fromOrganization ?? 0);
      return { org, overridden, coverage: own };
    }),
  );

  const totalOverrides = coverage.reduce((n, c) => n + c.overridden, 0);

  return (
    <>
      <PageTitle
        eyebrow="Platform Control Center"
        title="Organization configuration"
        subtitle="Per-tenant overrides of the platform layer. An organization inherits every setting by default; only what it has explicitly changed differs. Global configuration is never editable from here."
        action={
          <>
            <ButtonLink href="/admin/control-center" variant="outline">
              Platform configuration
            </ButtonLink>
            <ButtonLink href="/admin/control-center/presets" variant="gold">
              Presets
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organizations" value={orgs.length} hint="Active tenants" />
        <StatCard label="Settings each may override" value={writable.length} hint={`Of ${platformCoverage.total} in the schema`} />
        <StatCard label="Overrides in use" value={totalOverrides} hint="Across every organization" />
        <StatCard
          label="Platform-wide only"
          value={platformCoverage.total - writable.length}
          hint="Never writable by a tenant"
        />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">How inheritance works</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          Resolution order is <strong>organization override → platform value → built-in default</strong>. Each
          organization&rsquo;s screen shows a badge on every setting stating which layer supplied the current value, and a
          <em> Reset to inherit</em> button on overrides only — which deletes that one organization&rsquo;s row and nothing
          else. No organization can read or write another organization&rsquo;s configuration, and none can reach global scope.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="green">Platform layer applies</Badge>
          <Badge tone="gold">Organization override active</Badge>
          <Badge tone="gray">Built-in default</Badge>
        </div>
      </Card>

      <div className="mt-8">
        <form action="/admin/control-center/organizations" method="get" className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search organizations…"
            aria-label="Search organizations"
            className="w-full max-w-sm rounded-lg border border-evergreen-900/55 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25"
          />
          <button
            type="submit"
            className="rounded-lg border border-evergreen-700/50 bg-white px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-6">
        {!orgs.length ? (
          <EmptyState
            title="No organizations match that search"
            body="Clear the search to see every tenant on the platform."
            action={<ButtonLink href="/admin/control-center/organizations" variant="outline">Clear search</ButtonLink>}
          />
        ) : (
          <DataTable head={["Organization", "Slug", "Type", "Overrides", "Inheriting", "Provisioned", ""]}>
            {coverage.map(({ org, overridden }) => (
              <tr key={org.id}>
                <td className="font-medium text-evergreen-950">
                  <Link href={`/admin/control-center/organizations/${org.id}`} className="hover:underline">
                    {org.name}
                  </Link>
                </td>
                <td className="font-mono text-xs text-ink-soft">/{org.slug}</td>
                <td>
                  <Badge tone="gray">{org.type ?? "—"}</Badge>
                </td>
                <td>
                  {overridden > 0 ? <Badge tone="gold">{overridden}</Badge> : <Badge tone="gray">0</Badge>}
                </td>
                <td className="text-ink-soft">{writable.length - overridden}</td>
                <td className="text-ink-soft">{org.created_at ? fmtDateTime(org.created_at) : "—"}</td>
                <td className="text-right">
                  <Link
                    href={`/admin/control-center/organizations/${org.id}`}
                    className="text-sm font-medium text-evergreen-800 hover:underline"
                  >
                    Configure →
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
