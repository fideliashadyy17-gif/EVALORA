import { Logo } from "@/components/Logo";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { organizationPlatformUrl, tenantPortalLabel } from "@/lib/tenant";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("slug", slug)
    .eq("portal_enabled", true)
    .maybeSingle();
  return { title: org ? `${org.name} — EVALORA portal` : "School portal" };
}

/**
 * Public school portal. Resolved from the tenant subdomain (middleware
 * rewrites <slug>.<root>/ to /portal/<slug>) or directly by path.
 * Only public identity fields are read, via the service role, so an
 * unknown/inactive tenant simply 404s and never leaks another school.
 */
export default async function SchoolPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requested = String(slug ?? "").trim().toLowerCase();
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug, type, status, description, country, city, logo_url, is_demo, portal_enabled")
    .eq("slug", requested)
    .maybeSingle();

  // A retired identifier (the organization was renamed by the platform owner)
  // redirects permanently to the current platform URL instead of breaking.
  if (!org) {
    const { data: alias } = await admin
      .from("organizations")
      .select("slug")
      .contains("previous_slugs", [requested])
      .eq("portal_enabled", true)
      .maybeSingle();
    if (alias?.slug) permanentRedirect(organizationPlatformUrl(alias.slug));
  }
  if (!org || !org.portal_enabled) notFound();

  const ctx = await getSessionContext().catch(() => null);
  const isMember = Boolean(ctx?.memberships.some((m) => m.organization_id === org.id));
  const isSuperAdmin = ctx?.profile.platform_role === "super_admin";

  return (
    <div className="min-h-screen bg-cream">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Logo href={null} />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-medium text-ink-soft sm:inline">{tenantPortalLabel(org.slug)}</span>
          <Link
            href={`/login?next=/dashboard&switch=1&org=${org.slug}`}
            className="rounded-lg border border-evergreen-900/20 px-3 py-1.5 text-xs font-semibold text-evergreen-800 hover:bg-evergreen-50"
          >
            Staff &amp; student sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16">
        <Card className="overflow-hidden">
          <div className="bg-evergreen-900 px-6 py-8 text-white sm:px-10">
            <div className="flex flex-wrap items-center gap-4">
              {org.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo_url} alt="" className="h-16 w-16 rounded-xl bg-white object-contain p-1" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gold-500 font-display text-2xl font-bold text-evergreen-950">
                  {org.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold sm:text-3xl">{org.name}</h1>
                  {org.is_demo && <Badge tone="gold">DEMONSTRATION SCHOOL</Badge>}
                </div>
                <p className="mt-1 text-sm text-evergreen-100">
                  {[org.city, org.country].filter(Boolean).join(", ") || "Welcome to our school portal"}
                </p>
              </div>
            </div>
            {org.description && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-evergreen-50">{org.description}</p>}
            {org.is_demo && (
              <p className="mt-4 max-w-2xl rounded-lg bg-gold-500/15 px-3 py-2 text-sm text-gold-100">
                This is EVALORA&apos;s permanent demonstration school. Every student, result and
                record here is fictional sample data for evaluation and training.
              </p>
            )}
          </div>

          <div className="px-6 py-8 sm:px-10">
            {org.status !== "active" ? (
              <div className="rounded-xl bg-red-50 px-4 py-5 text-sm text-red-900">
                <p className="font-semibold">This school portal is currently {org.status}.</p>
                <p className="mt-1">Students and staff cannot sign in right now. Please contact the school or EVALORA support.</p>
              </div>
            ) : (
              <>
                <h2 className="font-display text-lg font-semibold text-evergreen-950">How would you like to continue?</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-evergreen-900/15 p-4">
                    <p className="font-semibold text-evergreen-950">Staff &amp; students</p>
                    <p className="mt-1 text-sm text-ink-soft">Sign in to the {org.name} workspace: classes, quizzes, examinations and reports.</p>
                    {isMember || isSuperAdmin ? (
                      <ButtonLink href="/dashboard" variant="gold" className="mt-3">Open my workspace</ButtonLink>
                    ) : (
                      <ButtonLink
                        href={`/login?next=/dashboard&switch=1&org=${org.slug}`}
                        variant="gold"
                        className="mt-3"
                      >
                        Sign in
                      </ButtonLink>
                    )}
                    <p className="mt-2 text-xs text-ink-soft">
                      Staff and students sign in with their {org.name} account.
                    </p>
                  </div>
                  <div className="rounded-xl border border-evergreen-900/15 p-4">
                    <p className="font-semibold text-evergreen-950">Live competition</p>
                    <p className="mt-1 text-sm text-ink-soft">Joining a live competition or class quiz? Enter your join code.</p>
                    <ButtonLink href="/join" variant="outline" className="mt-3">Enter join code</ButtonLink>
                  </div>
                  <div className="rounded-xl border border-evergreen-900/15 p-4">
                    <p className="font-semibold text-evergreen-950">Examination candidates</p>
                    <p className="mt-1 text-sm text-ink-soft">Formal examination today? Use the personal access code given by your school.</p>
                    <ButtonLink href="/exam-access" variant="outline" className="mt-3">Enter access code</ButtonLink>
                  </div>
                </div>
                <p className="mt-6 text-xs text-ink-soft">
                  This portal is private to {org.name}. Accounts are created by the school;
                  if you cannot sign in, contact your school administrator.
                </p>
              </>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
