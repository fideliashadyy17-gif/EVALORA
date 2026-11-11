import { Badge, Button, ButtonLink, Input, PageTitle, StatCard } from "@/components/ui";
import { PlatformUrlActions } from "@/components/platform/PlatformUrlActions";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { organizationPlatformAccess, platformInfrastructure } from "@/lib/tenant";
import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice, Table } from "../../ui";

export const metadata: Metadata = { title: "Organization platform access" };
export const dynamic = "force-dynamic";

interface OrgPlatformRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  is_demo: boolean;
  portal_enabled: boolean;
  custom_domain: string | null;
  platform_domain_status: string;
  previous_slugs: string[] | null;
  slug_updated_at: string | null;
  created_at: string;
}

/**
 * Global platform-address directory.
 *
 * The Super Admin console answers one question for every tenant at a glance:
 * what is this organization's platform URL, does it work, and where do I open
 * it. Reads are service-role (super admin only); organization administrators
 * never reach this page and never see another tenant's identifier.
 */
export default async function OrganizationPlatformAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("organizations")
    .select(
      "id, name, slug, status, type, is_demo, portal_enabled, custom_domain, platform_domain_status, previous_slugs, slug_updated_at, created_at",
    )
    .order("name", { ascending: true })
    .limit(300);
  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  const { data } = await query;
  const orgs = (data ?? []) as unknown as OrgPlatformRow[];

  const rows = orgs.map((org) => ({ org, access: organizationPlatformAccess(org) }));
  const filtered = sp.state ? rows.filter((r) => r.access.state === sp.state) : rows;
  const counts = {
    total: rows.length,
    active: rows.filter((r) => r.access.state === "active").length,
    pending: rows.filter((r) => r.access.state === "pending").length,
    blocked: rows.filter((r) => r.access.state === "disabled" || r.access.state === "unavailable").length,
  };
  const infra = platformInfrastructure();

  return (
    <>
      <PageTitle
        title="Organization platform access"
        subtitle="The permanent platform URL of every organization on EVALORA — open it, copy it, or change its identifier."
        action={<ButtonLink href="/admin/organizations" variant="outline">All organizations</ButtonLink>}
      />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          platform_saved: "Platform URL updated. The previous identifier now permanently redirects to the new address.",
          platform_unchanged: "That is already this organization's platform identifier — nothing changed.",
          domain_saved: "Platform domain settings saved.",
          subdomain: "That identifier is invalid or reserved. Use 3–63 lowercase letters, numbers or hyphens.",
          subdomain_format:
            "Use exactly 3–63 lowercase letters, numbers and hyphens — no spaces, dots, underscores or capitals.",
          subdomain_taken: "That identifier is already in use (or was used before by another organization).",
          demo_protected: "The EVALORA DEMO organization identifier is protected and cannot change.",
          domain_invalid: "Enter a valid domain such as school.example.org (no path, no scheme). ",
          save_failed: "The platform URL could not be saved.",
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Organizations" value={counts.total} icon={<Link2 className="h-5 w-5" />} />
        <StatCard label="URLs active" value={counts.active} />
        <StatCard label="URLs pending" value={counts.pending} hint="Waiting for domain verification" />
        <StatCard label="URLs unavailable or disabled" value={counts.blocked} />
      </div>

      <div className="mt-6 rounded-2xl border border-evergreen-900/15 bg-cream p-4 text-sm text-ink">
        <p className="font-semibold text-evergreen-950">
          Addressing mode: {infra.mode === "subdomain" ? "dedicated subdomain per organization" : "portal path on the application host"}
          {infra.root ? <span className="font-normal text-ink-soft"> · root domain {infra.root}</span> : null}
        </p>
        <p className="mt-1 text-ink-soft">{infra.note}</p>
        {infra.requirement && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{infra.requirement}</p>
        )}
      </div>

      <form className="mt-5 flex flex-wrap items-end gap-2" method="get">
        <div className="min-w-[220px] flex-1">
          <Input name="q" placeholder="Search organizations by name…" defaultValue={sp.q ?? ""} aria-label="Search organizations" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No organizations match.
        </p>
      ) : (
        <div className="mt-4">
          <Table head={["Organization", "Identifier", "Platform URL", "Status", "Actions"]}>
            {filtered.map(({ org, access }) => (
              <tr key={org.id}>
                <td>
                  <Link href={`/admin/organizations/${org.id}?tab=platform`} className="font-semibold text-evergreen-900 hover:underline">
                    {org.name}
                  </Link>
                  <span className="block text-xs text-ink-soft">
                    {org.is_demo ? "DEMO · " : ""}since {fmtDate(org.created_at)}
                    {org.previous_slugs && org.previous_slugs.length > 0
                      ? ` · ${org.previous_slugs.length} retired identifier${org.previous_slugs.length === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </td>
                <td className="font-mono text-xs text-evergreen-900">{org.slug}</td>
                <td>
                  {access.url ? (
                    <a
                      href={access.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-[22rem] break-all font-mono text-xs text-evergreen-800 underline underline-offset-2"
                    >
                      {access.url}
                    </a>
                  ) : (
                    <span className="text-xs text-ink-soft">No working URL</span>
                  )}
                  {access.subdomainUrl && access.mode === "path" && (
                    <span className="mt-0.5 block text-[11px] text-ink-soft">Subdomain target: {access.subdomainUrl}</span>
                  )}
                </td>
                <td>
                  <Badge tone={access.tone}>{access.label}</Badge>
                  <span className="mt-1 block max-w-[18rem] text-[11px] leading-snug text-ink-soft">{access.detail}</span>
                </td>
                <td>
                  <PlatformUrlActions
                    url={access.url}
                    size="sm"
                    openLabel="Open"
                    copyLabel="Copy"
                    shareLabel="Share"
                  />
                  <Link
                    href={`/admin/organizations/${org.id}?tab=platform`}
                    className="mt-2 inline-block text-xs font-semibold text-evergreen-700 underline-offset-2 hover:underline"
                  >
                    Manage URL →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <p className="mt-6 text-xs text-ink-soft">
        The same address appears inside each organization&apos;s own dashboard under{" "}
        <strong>My Institution&apos;s Platform</strong>. Administrators there can only ever read their
        own organization&apos;s URL — never another tenant&apos;s.
      </p>
    </>
  );
}
