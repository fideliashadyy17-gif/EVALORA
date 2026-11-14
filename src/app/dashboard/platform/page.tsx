import { OrganizationPlatformCard } from "@/components/platform/OrganizationPlatformCard";
import { PlatformUrlActions } from "@/components/platform/PlatformUrlActions";
import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { organizationPlatformAccess, platformInfrastructure } from "@/lib/tenant";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "My institution's platform" };
export const dynamic = "force-dynamic";

/**
 * "My Institution's Platform" — an organization's own view of its platform
 * identity: name, official URL, identifier, access status, open/copy/share.
 *
 * Tenant isolation: the organization is the one active for this session, and
 * the row is read through the member's own Supabase client (RLS: is_org_member),
 * so an administrator can never read another organization's identifier or URL.
 * The identifier is read-only here on purpose — changing it is a platform-owner
 * action (see docs/ORGANIZATION_PLATFORM_URLS.md).
 */
export default async function InstitutionPlatformPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) redirect(ctx.profile.platform_role === "super_admin" ? "/admin/organizations/access" : "/onboarding");

  const supabase = await createClient();
  const { data: full } = await supabase
    .from("organizations")
    .select("id, name, slug, status, portal_enabled, custom_domain, platform_domain_status, slug_updated_at, previous_slugs")
    .eq("id", org.id)
    .maybeSingle();

  const row = {
    name: full?.name ?? org.name,
    slug: full?.slug ?? org.slug,
    status: full?.status ?? org.status,
    portal_enabled: full?.portal_enabled ?? true,
    custom_domain: full?.custom_domain ?? null,
    platform_domain_status: full?.platform_domain_status ?? "pending",
    slug_updated_at: full?.slug_updated_at ?? null,
    previous_slugs: ((full?.previous_slugs as string[] | null) ?? []).filter(Boolean),
  };
  const access = organizationPlatformAccess(row);
  const infra = platformInfrastructure();
  const retired = row.previous_slugs;

  return (
    <>
      <PageTitle
        eyebrow="Workspace Administration · Official Tenant Address"
        title="My institution's platform"
        subtitle={`The official address of ${org.name} on EVALORA — share it with students, teachers and parents.`}
        action={<ButtonLink href="/dashboard/settings" variant="outline">Organization settings</ButtonLink>}
      />

      <OrganizationPlatformCard
        title="My Institution's Platform"
        subtitle="This is your institution's platform link. It stays the same over time: printed handouts, emails and QR codes keep working."
        organizationName={row.name}
        identifier={row.slug}
        access={access}
        footer={
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Link status</p>
              <p className="mt-0.5">
                {access.url ? "Verified and reachable over HTTPS on this deployment." : "Not available — see the status above."}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Identifier last changed</p>
              <p className="mt-0.5">
                {row.slug_updated_at ? fmtDateTime(row.slug_updated_at) : "Never changed since the institution was created."}
              </p>
            </div>
          </div>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">What people can do at your link</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            <li>• Staff and students sign in to your workspace.</li>
            <li>• Participants enter a live quiz or competition join code.</li>
            <li>• Examination candidates use their personal access code.</li>
            <li>• Visitors see your institution&apos;s public profile.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Sharing the link</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Use <strong>Open My Platform</strong> to preview exactly what a visitor sees, and{" "}
            <strong>Copy Platform Link</strong> to paste it into your website, WhatsApp group, newsletter or
            printed material.
          </p>
          <div className="mt-3">
            <PlatformUrlActions url={access.url} size="sm" openLabel="Open My Platform" copyLabel="Copy Platform Link" shareLabel="Share Platform Link" />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Changing your address</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Your identifier <span className="font-mono text-evergreen-900">{row.slug}</span> is permanent by
            default. If your institution is renamed, contact EVALORA support — the platform team changes the
            identifier and the old address keeps redirecting here, so no existing link breaks.
          </p>
          <p className="mt-3 text-xs text-ink-soft">{infra.note}</p>
        </Card>
      </div>

      {retired.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Previous addresses</h2>
          <p className="mt-1 text-sm text-ink-soft">These old links redirect to your current platform URL.</p>
          <ul className="mt-3 divide-y divide-evergreen-900/10 text-sm">
            {retired.map((slug) => (
              <li key={slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono">{slug}</span>
                <span className="text-xs text-ink-soft">redirects to {access.url || `/portal/${row.slug}`}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-6 text-xs text-ink-soft">
        Only your own institution&apos;s platform address is shown here.{" "}
        <Link href="/dashboard/settings" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
          Organization settings
        </Link>
      </p>
    </>
  );
}
