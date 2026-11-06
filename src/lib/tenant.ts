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

/** Canonical public URL for a school portal. */
export function tenantPortalUrl(slug: string): string {
  const root = rootDomain();
  if (root) return `https://${slug}.${root}`;
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return app ? `${app}/portal/${slug}` : `/portal/${slug}`;
}

/** Human label shown in dashboards: either the subdomain or the portal path. */
export function tenantPortalLabel(slug: string): string {
  const root = rootDomain();
  return root ? `${slug}.${root}` : `/portal/${slug}`;
}
