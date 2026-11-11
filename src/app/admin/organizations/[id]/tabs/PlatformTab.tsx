import { Button, Card, Field, Input, Select } from "@/components/ui";
import { OrganizationPlatformCard } from "@/components/platform/OrganizationPlatformCard";
import {
  changeOrganizationSlug,
  issueOrganizationAdminSetup,
  updateOrganizationPlatformDomain,
} from "@/app/admin/actions/orgs";
import { fmtDateTime } from "@/lib/utils";
import { organizationPlatformAccess, organizationPlatformUrl, platformInfrastructure } from "@/lib/tenant";
import { Notice, Section } from "../../../ui";
import { cookies } from "next/headers";

export interface PlatformTabOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_demo?: boolean;
  portal_enabled?: boolean;
  custom_domain?: string | null;
  platform_domain_status?: string | null;
  previous_slugs?: string[] | null;
  slug_updated_at?: string | null;
  created_at?: string | null;
}

/**
 * Super Admin view of one organization's platform identity: the URL, its
 * status, the identifier editor, domain verification and retired identifiers.
 */
export async function PlatformTab({
  org,
  sp,
}: {
  org: PlatformTabOrg;
  sp: { ok?: string; e?: string };
}) {
  // A freshly issued code is handed back exactly once, through a short-lived
  // HttpOnly cookie, so it never appears in a redirect URL or a server log.
  const setupCode = (await cookies()).get("evalora_admin_setup")?.value ?? null;
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const setupLink = setupCode ? `${appBase}/portal/${org.slug}/admin-setup?code=${setupCode}` : null;
  const access = organizationPlatformAccess(org);
  const infra = platformInfrastructure();
  const retired = (org.previous_slugs ?? []).filter(Boolean);
  const returnTo = `/admin/organizations/${org.id}`;

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          platform_saved:
            "Platform URL updated. The previous identifier now permanently redirects to the new address — existing links keep working.",
          platform_unchanged: "That is already this organization's platform identifier — nothing changed.",
          domain_saved: "Platform domain settings saved.",
          subdomain: "That identifier is invalid or reserved. Use 3–63 lowercase letters, numbers or hyphens.",
          subdomain_format:
            "Use exactly 3–63 lowercase letters, numbers and hyphens — no spaces, dots, underscores or capitals.",
          subdomain_taken: "That identifier is already in use, or another organization used it before.",
          demo_protected: "The EVALORA DEMO organization identifier is protected and cannot change.",
          domain_invalid: "Enter a valid domain such as school.example.org (no scheme, no path).",
          save_failed: "The platform URL could not be saved.",
          setup_issued: "Set-up link created. Copy it now — it is shown once, works for 72 hours and can be redeemed once.",
          setup_failed: "The set-up link could not be created.",
          setup_unavailable: "Set-up links can only be issued for an active organization.",
        }}
      />

      <OrganizationPlatformCard
        title="Organization platform access"
        subtitle="This is the address students, staff and the public use to reach this organization's platform. It is the same URL the organization sees in its own dashboard."
        organizationName={org.name}
        identifier={org.slug}
        access={access}
        footer={
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Identifier since</dt>
              <dd>{org.slug_updated_at ? fmtDateTime(org.slug_updated_at) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Addressed as</dt>
              <dd>
                {infra.mode === "subdomain"
                  ? "Dedicated HTTPS subdomain per organization"
                  : "Portal path on the application host (/portal/<identifier>)"}
              </dd>
            </div>
            {access.customDomainUrl && (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Custom domain</dt>
                <dd className="font-mono">{access.customDomainUrl}</dd>
              </div>
            )}
          </dl>
        }
      />

      <Section
        title="Platform identifier"
        hint="The identifier is the permanent label of this tenant. Changing it keeps all data, members, examinations and results, and the old address permanently redirects here."
      >
        <Card className="p-5 sm:p-6">
          {org.is_demo ? (
            <p className="text-sm text-ink">
              <strong className="text-gold-800">Protected.</strong> The EVALORA DEMO organization keeps the
              identifier <span className="font-mono">{org.slug}</span> permanently — the database rejects any change.
            </p>
          ) : (
            <form action={changeOrganizationSlug} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={org.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <Field
                label="Identifier (subdomain label)"
                hint={
                  infra.mode === "subdomain" && infra.root
                    ? `Current address: https://${org.slug}.${infra.root}. 3–63 lowercase letters, numbers or hyphens.`
                    : "3–63 lowercase letters, numbers or hyphens. Reserved words (admin, portal, login…) are rejected."
                }
                className="min-w-[16rem] flex-1"
              >
                <Input name="slug" defaultValue={org.slug} required maxLength={63} spellCheck={false} />
              </Field>
              <Button type="submit">Update platform identifier</Button>
            </form>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            Only the platform owner can change an identifier. Organization administrators see it read-only and
            request changes through support.
          </p>
        </Card>
      </Section>

      <Section
        title="Domain verification"
        hint="An address is only reported Active when the deployment can actually serve it. Record the truth here after checking DNS and TLS in Vercel."
      >
        <Card className="space-y-4 p-5 sm:p-6">
          <form action={updateOrganizationPlatformDomain} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={org.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Field
              label="Custom domain (optional)"
              hint="Leave empty to use the platform's own addressing. Example: school.example.org"
              className="min-w-[16rem] flex-1"
            >
              <Input name="custom_domain" defaultValue={org.custom_domain ?? ""} placeholder="school.example.org" spellCheck={false} />
            </Field>
            <Field label="Verification state">
              <Select name="domain_status" defaultValue={String(org.platform_domain_status ?? "pending")}>
                <option value="pending">Pending — not verified yet</option>
                <option value="active">Active — DNS + TLS confirmed</option>
                <option value="unavailable">Unavailable — cannot be served</option>
              </Select>
            </Field>
            <Button type="submit" variant="outline">Save domain settings</Button>
          </form>
          <div className="rounded-xl bg-cream p-4 text-sm text-ink-soft">
            <p className="font-semibold text-evergreen-950">Infrastructure</p>
            <p className="mt-1">{infra.note}</p>
            {infra.requirement && <p className="mt-2 text-amber-900">{infra.requirement}</p>}
          </div>
        </Card>
      </Section>

      <Section
        title="Institution administrator access"
        hint="Give an institution a single-use link so it can create its own Organization Owner — without granting anyone the global Super Admin role or handling a password on their behalf."
      >
        <Card className="p-5 sm:p-6">
          <p className="text-sm text-ink-soft">
            The link opens <span className="font-mono text-evergreen-950">/portal/{org.slug}/admin-setup</span>, where the
            institution enters its administrator&apos;s name, email and a password of its own choosing. EVALORA stores
            only a hash of the code and never sees the password. Issuing a new link cancels any unused earlier link for
            this organization.
          </p>
          {setupLink ? (
            <div className="mt-4 rounded-xl border border-evergreen-900/15 bg-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Copy this link now</p>
              <p className="mt-1 break-all font-mono text-sm text-evergreen-950">{setupLink}</p>
              <p className="mt-2 text-xs text-ink-soft">
                Shown once. Expires in 72 hours, and stops working after the administrator account is created.
              </p>
            </div>
          ) : (
            <form action={issueOrganizationAdminSetup} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={org.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <Button type="submit" variant="outline">Create a one-time set-up link</Button>
            </form>
          )}
        </Card>
      </Section>

      <Section
        title="Retired identifiers"
        hint="Old platform addresses are kept as permanent redirects so printed links, emails and QR codes never break silently."
      >
        <Card className="p-5 sm:p-6">
          {retired.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No retired identifiers. This organization has used <span className="font-mono">{org.slug}</span> since it was created.
            </p>
          ) : (
            <ul className="divide-y divide-evergreen-900/10 text-sm">
              {retired.map((slug) => (
                <li key={slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-evergreen-950">{slug}</span>
                  <span className="text-xs text-ink-soft">
                    {organizationPlatformUrl(slug)} → {organizationPlatformUrl(org.slug)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}
