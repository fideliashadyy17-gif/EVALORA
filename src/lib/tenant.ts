import { slugify } from "./utils";

/**
 * Tenant (school portal) helpers.
 *
 * Every organization `slug` IS its subdomain label: <slug>.<root-domain>.
 * The root domain is configured with NEXT_PUBLIC_ROOT_DOMAIN (e.g.
 * "evalora.com") once the custom production domain + wildcard DNS exist.
 * Until then, tenant resolution still works for `<slug>.localhost` in
 * development and for any custom domain pointed at the app, while the
 * public portal remains reachable at /portal/<slug>.
 *
 * IMPORTANT: the subdomain only ever *selects* a tenant. Authorization is
 * always verified server-side against organization membership (see
 * getSessionContext) and database RLS — never from the hostname alone.
 */

export const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "admin", "api", "mail", "smtp", "imap", "pop", "ftp",
  "support", "help", "blog", "docs", "status", "cdn", "assets", "static",
  "evalora", "portal", "login", "register", "dashboard", "billing",
  "payments", "auth", "oauth", "sso", "dev", "staging", "test", "preview",
  "public", "private", "system", "root", "superadmin", "owner", "platform",
  "school", "schools", "student", "students", "teacher", "teachers",
]);

/** Host suffixes that are never tenant root domains (preview platforms). */
const EXCLUDED_HOST_SUFFIXES = [".vercel.app", ".e2b.app", ".netlify.app", ".github.io", ".onrender.com"];

export function normalizeSubdomain(input: string): string {
  return slugify(String(input ?? "")).slice(0, 63).replace(/^-+|-+$/g, "");
}

export function validateSubdomain(input: string): { ok: boolean; slug: string; error?: string } {
  const slug = normalizeSubdomain(input);
  if (slug.length < 3) return { ok: false, slug, error: "Subdomain must be at least 3 characters." };
  if (slug.length > 63) return { ok: false, slug, error: "Subdomain must be at most 63 characters." };
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return { ok: false, slug, error: "Use only lowercase letters, numbers and hyphens, starting and ending with a letter or number." };
  }
  if (RESERVED_SUBDOMAINS.has(slug)) return { ok: false, slug, error: "That subdomain is reserved by EVALORA." };
  return { ok: true, slug };
}

export function subdomainSuggestions(baseInput: string): string[] {
  const base = normalizeSubdomain(baseInput) || "school";
  const out = [`${base}-school`, `${base}-academy`, `${base}-2`, `${base}-edu`]
    .map((s) => s.slice(0, 63).replace(/-+$/g, ""))
    .filter((s, i, a) => validateSubdomain(s).ok && a.indexOf(s) === i);
  return out.slice(0, 4);
}

export function rootDomain(): string | null {
  const raw = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^\*\./, "") || null;
}

/** Extract the tenant slug from a Host header, or null for the main site. */
export function getTenantSlugFromHost(hostHeader: string | null | undefined, root = rootDomain()): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.trim().toLowerCase().replace(/:\d+$/, "");
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null;

  // Local development: demo.localhost
  if (host.endsWith(".localhost")) {
    const label = host.slice(0, -".localhost".length).split(".").pop() ?? "";
    return label && !RESERVED_SUBDOMAINS.has(label) ? label : null;
  }

  // Configured production root domain: greenwood.evalora.com
  if (root) {
    if (host === root || host === `www.${root}`) return null;
    if (host.endsWith(`.${root}`)) {
      const prefix = host.slice(0, -(root.length + 1));
      if (!prefix || prefix.includes(".")) return null;
      return RESERVED_SUBDOMAINS.has(prefix) ? null : prefix;
    }
    return null;
  }

  // Unconfigured custom domains: first label of a 3+ label host, except on
  // known preview/platform suffixes where labels are not tenants.
  if (EXCLUDED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return null;
  const labels = host.split(".");
  if (labels.length >= 3) {
    const label = labels[0];
    return label && !RESERVED_SUBDOMAINS.has(label) ? label : null;
  }
  return null;
}

/**
 * How organization platform URLs are addressed right now.
 *
 *  - "subdomain" — `https://<slug>.<NEXT_PUBLIC_ROOT_DOMAIN>` is the canonical
 *    address. Only possible on a host that can actually serve wildcard
 *    subdomains (a real custom domain with a wildcard DNS record + TLS).
 *  - "path" — the canonical address is `<app origin>/portal/<slug>`. Used
 *    whenever the configured root domain is a preview/platform host such as
 *    `*.vercel.app`, where wildcard subdomains do not exist. The app still
 *    *resolves* subdomain hosts correctly (see getTenantSlugFromHost), so
 *    flipping the root domain to a real domain switches every organization
 *    to subdomain URLs without any data change.
 */
export type PlatformUrlMode = "subdomain" | "path";

/** True only for a hostname that can serve `<slug>.<host>` with valid TLS. */
export function isSubdomainCapableHost(host: string | null | undefined): boolean {
  const value = String(host ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value === "localhost" || value.endsWith(".localhost")) return true; // dev: <slug>.localhost
  if (EXCLUDED_HOST_SUFFIXES.some((s) => value.endsWith(s))) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) return false;
  return value.includes(".");
}

export function platformUrlMode(root = rootDomain()): PlatformUrlMode {
  return isSubdomainCapableHost(root) ? "subdomain" : "path";
}

/** Absolute origin of the deployed application (no trailing slash). */
export function platformOrigin(): string {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (app) return /^https?:\/\//i.test(app) ? app : `https://${app}`;
  const root = rootDomain();
  return root ? `https://${root}` : "";
}

/** Subdomain address for an organization, or null when no root domain is set. */
export function organizationSubdomainUrl(slug: string, root = rootDomain()): string | null {
  if (!slug || !root) return null;
  return `https://${slug}.${root}`;
}

/**
 * The one canonical, currently-working URL for an organization's platform.
 * Used by the Super Admin console and the organization dashboard, so both
 * always show the same address.
 */
export function organizationPlatformUrl(
  slug: string,
  options: { root?: string | null; appUrl?: string | null; mode?: PlatformUrlMode } = {},
): string {
  const clean = normalizeSubdomain(slug);
  if (!clean) return "";
  const root = options.root === undefined ? rootDomain() : options.root;
  const mode = options.mode ?? platformUrlMode(root);
  if (mode === "subdomain" && root) return `https://${clean}.${root}`;
  const app = (options.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const origin = app ? (/^https?:\/\//i.test(app) ? app : `https://${app}`) : root ? `https://${root}` : "";
  return `${origin}/portal/${clean}`;
}

/** Canonical public URL for a school portal (tenant subdomain or portal path). */
export function tenantPortalUrl(slug: string): string {
  return organizationPlatformUrl(slug);
}

/** Human label shown in dashboards: either the subdomain or the portal path. */
export function tenantPortalLabel(slug: string): string {
  const root = rootDomain();
  return platformUrlMode(root) === "subdomain" && root ? `${slug}.${root}` : `/portal/${slug}`;
}

export type PlatformAccessState = "active" | "pending" | "unavailable" | "disabled";

export interface OrganizationPlatformAccess {
  state: PlatformAccessState;
  /** Short label for a status pill. */
  label: string;
  tone: "green" | "gold" | "gray" | "red" | "amber";
  /** Canonical URL that works today (empty when unavailable/disabled). */
  url: string;
  /** Plain-language explanation of the status. */
  detail: string;
  mode: PlatformUrlMode;
  /** Future/primary host address (`https://slug.root`), when a root exists. */
  subdomainUrl: string | null;
  /** Verified custom domain URL, when the organization has one. */
  customDomainUrl: string | null;
}

const ACCESS_LABELS: Record<PlatformAccessState, { label: string; tone: OrganizationPlatformAccess["tone"] }> = {
  active: { label: "Active", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  unavailable: { label: "Unavailable", tone: "gray" },
  disabled: { label: "Disabled", tone: "red" },
};

/**
 * Single source of truth for "is this organization's platform URL usable?".
 *
 * It never claims a URL works because a row exists in the database: the
 * address is only reported Active when the deployment can actually serve it
 * (path mode always can; subdomain/custom-domain mode needs the platform's
 * wildcard DNS + TLS recorded as verified).
 */
export function organizationPlatformAccess(org: {
  slug?: string | null;
  status?: string | null;
  portal_enabled?: boolean | null;
  platform_domain_status?: string | null;
  custom_domain?: string | null;
}): OrganizationPlatformAccess {
  const root = rootDomain();
  const mode = platformUrlMode(root);
  const slug = normalizeSubdomain(org.slug ?? "");
  const subdomainUrl = organizationSubdomainUrl(slug, root);
  const verified = String(org.platform_domain_status ?? "pending") === "active";
  const customDomainUrl =
    org.custom_domain && verified ? `https://${String(org.custom_domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : null;
  const base = { mode, subdomainUrl, customDomainUrl };

  if (!slug) {
    return {
      ...base,
      ...ACCESS_LABELS.unavailable,
      state: "unavailable",
      url: "",
      detail: "This organization has no identifier yet, so it has no platform URL. Assign one to activate its platform.",
    };
  }
  if (String(org.status ?? "active") !== "active") {
    return {
      ...base,
      ...ACCESS_LABELS.disabled,
      state: "disabled",
      url: customDomainUrl ?? organizationPlatformUrl(slug, { root, mode }),
      detail: `The organization is ${String(org.status)}. Its URL still resolves, but the platform shows a closed notice and nobody can sign in.`,
    };
  }
  if (org.portal_enabled === false) {
    return {
      ...base,
      ...ACCESS_LABELS.disabled,
      state: "disabled",
      url: "",
      detail: "The public portal is switched off for this organization, so its URL returns “not found”.",
    };
  }
  if (customDomainUrl) {
    return {
      ...base,
      ...ACCESS_LABELS.active,
      state: "active",
      url: customDomainUrl,
      detail: "Served from the organization's verified custom domain over HTTPS.",
    };
  }
  if (mode === "subdomain") {
    const url = organizationPlatformUrl(slug, { root, mode });
    if (!verified) {
      return {
        ...base,
        ...ACCESS_LABELS.pending,
        state: "pending",
        url,
        detail: "Subdomain routing is configured, but the platform wildcard domain has not been verified yet. Mark it verified once DNS and TLS confirm it.",
      };
    }
    return {
      ...base,
      ...ACCESS_LABELS.active,
      state: "active",
      url,
      detail: "Served from this organization's own HTTPS subdomain.",
    };
  }
  return {
    ...base,
    ...ACCESS_LABELS.active,
    state: "active",
    url: organizationPlatformUrl(slug, { root, mode }),
    detail: "Served over HTTPS on the EVALORA application host at /portal/<identifier>. This address works today and is stable for this organization.",
  };
}

/** Deployment-level explanation of the URL infrastructure, shown to owners/admins. */
export function platformInfrastructure(): {
  mode: PlatformUrlMode;
  root: string | null;
  origin: string;
  note: string;
  /** Exact configuration still needed before subdomain URLs can serve traffic. */
  requirement: string | null;
} {
  const root = rootDomain();
  const mode = platformUrlMode(root);
  const origin = platformOrigin();
  if (mode === "subdomain") {
    return {
      mode,
      root,
      origin,
      note: `Organization platforms are addressed as https://<identifier>.${root}. Wildcard DNS and TLS for *.${root} must stay in place.`,
      requirement: null,
    };
  }
  return {
    mode,
    root,
    origin,
    note: origin
      ? `Organization platforms are addressed as ${origin}/portal/<identifier>. Every organization keeps the same identifier, so nothing changes for users when subdomains go live.`
      : "Organization platforms are addressed as /portal/<identifier> on this deployment.",
    requirement:
      "Subdomain URLs (https://<identifier>.<domain>) are not live yet. They require: (1) a custom domain attached to the production project in Vercel, (2) a wildcard DNS record *.domain → Vercel, (3) a wildcard TLS certificate issued by Vercel, then (4) NEXT_PUBLIC_ROOT_DOMAIN set to that domain. Until all four exist, /portal/<identifier> is the working canonical address.",
  };
}
