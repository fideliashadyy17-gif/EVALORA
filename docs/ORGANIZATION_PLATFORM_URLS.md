# Organization platform URLs

Every organization on EVALORA has exactly one permanent platform URL. It is
computed from the organization's identifier (`organizations.slug`) and the
deployment's addressing mode — never stored twice, never re-derived in the
browser, and never different between the Super Admin console and the
organization's own dashboard.

## Where the URL appears

| Surface | Route | What it shows |
| --- | --- | --- |
| Super Admin console | `/admin/organizations/access` | Directory of every organization: name, identifier, platform URL, status, Open / Copy / Share, link to manage |
| Super Admin → organization record | `/admin/organizations/<id>` (header) and `?tab=platform` | The URL in the record header; the Platform URL tab adds the identifier editor, domain verification, retired identifiers and infrastructure requirements |
| Super Admin → organization list | `/admin/organizations` | "Platform URL" column with status pill and Open / Copy |
| Organization dashboard | `/dashboard/platform` — **My Institution's Platform** | Name, official URL, identifier, access status, Open My Platform / Copy Platform Link / Share Platform Link, previous addresses |
| Organization dashboard home | `/dashboard` | "My Institution's Platform" card with the same URL and quick actions |
| Organization settings | `/dashboard/settings` | Platform identifier (read-only for staff) with a link to the platform page |

An organization administrator only ever sees their own organization. The row is
read with the member's own Supabase client, so RLS (`org_select` →
`is_org_member(id) OR is_super_admin()`) decides what is visible; there is no
endpoint that accepts an organization id from the browser.

## Addressing modes

`src/lib/tenant.ts` decides the canonical URL at request time:

- **subdomain mode** — `NEXT_PUBLIC_ROOT_DOMAIN` is a host that can actually
  serve wildcard subdomains (e.g. `evalora.com`). Canonical URL:
  `https://<identifier>.<root>`.
- **path mode** — the root domain is a platform/preview host such as
  `*.vercel.app`, or no root domain is configured. Canonical URL:
  `<NEXT_PUBLIC_APP_URL>/portal/<identifier>`.

Both modes resolve the same tenant. Middleware rewrites `<identifier>.<root>/`
to `/portal/<identifier>` for subdomain hosts, and `/portal/<identifier>` works
directly in both modes. Because the identifier never changes when the mode
changes, attaching a real domain and setting `NEXT_PUBLIC_ROOT_DOMAIN` flips
every organization to subdomain URLs with no data migration.

### What is still required for subdomain URLs

The current production deployment reports **path mode**, because
`NEXT_PUBLIC_ROOT_DOMAIN=evalora-six.vercel.app` is a Vercel preview host and
`*.vercel.app` cannot serve wildcard subdomains. To move to
`https://<identifier>.evalora.com`:

1. Attach the custom domain (e.g. `evalora.com`) to the Vercel project.
2. Add a wildcard DNS record `*.evalora.com` → Vercel (`cname.vercel-dns.com`).
3. Let Vercel issue the wildcard TLS certificate for `*.evalora.com`.
4. Set `NEXT_PUBLIC_ROOT_DOMAIN=evalora.com` and redeploy.
5. In `/admin/organizations/<id>?tab=platform`, set **Domain verification** to
   *Active* once DNS + TLS answer.

Until step 5, subdomain-addressed organizations report **Pending** — the
console never claims an address works because a database row exists.

## Status model

`organizationPlatformAccess()` in `src/lib/tenant.ts` is the single source:

| State | When | Meaning |
| --- | --- | --- |
| **Active** | organization active, portal enabled and an address the deployment can serve | URL is live over HTTPS |
| **Pending** | subdomain/custom-domain mode, `platform_domain_status = 'pending'` | URL exists but DNS/TLS not verified yet |
| **Disabled** | organization suspended/archived, or public portal switched off | URL shows a closed notice or 404s; nobody can sign in |
| **Unavailable** | no identifier | needs an identifier before it can have a URL |

## Data model (migration `0080_organization_platform_urls.sql`)

Additive only — no organization was renamed, recreated or reset.

| Column | Purpose |
| --- | --- |
| `slug` (existing, unique, `^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$`) | permanent platform identifier; now also 3–63 chars |
| `previous_slugs text[]` | retired identifiers kept for permanent redirects (GIN indexed) |
| `slug_updated_at` | when the identifier last changed |
| `custom_domain text` | optional organization-owned domain (unique, case-insensitive) |
| `platform_domain_status text` | `active` \| `pending` \| `unavailable` \| `disabled` |

Trigger `organizations_platform_slug_guard` (BEFORE INSERT OR UPDATE OF slug)
enforces, in the database:

- lowercase, trimmed, ≥ 3 characters and not in `evalora_reserved_slugs()`;
- the DEMO organization identifier can never change;
- **only a verified platform owner (or trusted service-role code) can change an
  organization identifier** — an authenticated organization administrator is
  refused with `only the EVALORA platform owner can change an organization
  platform identifier`, even though `org_update` RLS would otherwise let them
  update the row;
- the old identifier is appended to `previous_slugs` and `slug_updated_at` is
  stamped automatically.

## Changing an identifier (Super Admin only)

`changeOrganizationSlug()` (`src/app/admin/actions/orgs.ts`):

1. `requireSuperAdmin()`;
2. validates **strictly** — the typed value must already be a clean label
   (`oak_school` is rejected, not silently rewritten);
3. rejects collisions against current slugs **and** retired identifiers of other
   tenants, so an old address cannot be re-pointed to a different school;
4. audits `organization.subdomain_changed` with `from` / `to`;
5. revalidates the console and dashboard.

The old URL keeps working: `/portal/<old-identifier>` is permanently redirected
to the organization's current canonical URL (`src/app/portal/[slug]/page.tsx`
looks the value up in `previous_slugs`). Content, members, examinations,
results and live sessions are untouched — only the label changes.

Organization administrators see the identifier read-only and are told to
contact support; the existing authorization model has no per-tenant permission
to re-point a platform URL, and the database now refuses it outright.

## Security / tenant isolation

- Tenant selection comes from the hostname (`x-evalora-tenant-slug`) and is
  verified against the signed-in user's active memberships
  (`getSessionContext`) — a URL is never treated as authorization.
- A super admin entering another organization's URL is put in audited
  administrative mode; a customer with no membership gets `tenantDenied` and
  never another school's dashboard.
- Unknown identifiers 404; suspended organizations render a closed notice.
- `organizations` is readable by members or super admins only, so one tenant's
  identifier/custom-domain metadata is not exposed to another tenant.
- Reads in the console and the public portal use the service role deliberately
  (portal is public by design; console is super-admin gated).

## Verification

- `scripts/test-organization-platform-urls.mjs` — 18 checks: identifier
  normalization/validation, reserved names, mode selection, URL building in both
  modes, status matrix, custom-domain precedence, infrastructure reporting, and
  host-resolution agreement.
- Database checks executed against the live project: reserved identifier
  rejected, DEMO identifier protected, rename records `previous_slugs` +
  timestamp, authenticated non-super-admin rejected, all three tenants
  unchanged afterwards.
