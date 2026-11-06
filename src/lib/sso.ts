/**
 * Single sign-on: provider configuration plus the pure helpers around it.
 *
 * SSO is INERT by default. With no provider flag set, `enabledSsoProviders()`
 * returns an empty list and the sign-in page renders no SSO control at all —
 * the same fail-closed rule AI marking follows when no model credential
 * exists. A button that cannot complete a sign-in is worse than no button.
 *
 * Turning Google on is a two-part job, and both parts are required:
 *
 *   1. A Google Cloud OAuth client (type: Web application) whose authorized
 *      redirect URI is https://<project-ref>.supabase.co/auth/v1/callback,
 *      pasted into Supabase → Authentication → Providers → Google.
 *   2. NEXT_PUBLIC_GOOGLE_SSO_ENABLED=true in the deployment environment.
 *
 * Part 1 alone shows nothing (the UI never offers what the app cannot route);
 * part 2 alone shows a button whose round trip fails at Google. To make a
 * half-configured environment fail closed rather than advertise a dead
 * sign-in method, an optional NEXT_PUBLIC_GOOGLE_SSO_CLIENT_ID mirror is
 * honoured: when that variable exists it must be non-blank.
 *
 * Nothing in this module touches the database, the network or request
 * context, so it stays unit-testable. The provisioning guard that does the
 * database work lives in `ssoSession.ts`.
 */

export type SsoProviderId = "google";

export interface SsoProvider {
  id: SsoProviderId;
  label: string;
}

interface ProviderConfig extends SsoProvider {
  /** Deployment flag that must be truthy for the provider to be offered. */
  flag: string;
  /** Optional public mirror of the OAuth client id (blank ⇒ disabled). */
  clientIdFlag: string;
}

/** Providers the app can speak to, in the order they are offered. */
const PROVIDERS: readonly ProviderConfig[] = [
  {
    id: "google",
    label: "Google",
    flag: "NEXT_PUBLIC_GOOGLE_SSO_ENABLED",
    clientIdFlag: "NEXT_PUBLIC_GOOGLE_SSO_CLIENT_ID",
  },
];

/** Values that count as "on". Anything else — including "maybe" — is off. */
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export type SsoEnv = Record<string, string | undefined>;

export function isSsoProviderId(value: unknown): value is SsoProviderId {
  return typeof value === "string" && PROVIDERS.some((provider) => provider.id === value);
}

/** True only when the deployment (and, if supplied, the client id) is set up. */
export function ssoProviderConfigured(id: unknown, env: SsoEnv = process.env): boolean {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) return false;
  const flag = String(env[provider.flag] ?? "").trim().toLowerCase();
  if (!TRUE_VALUES.has(flag)) return false;
  const mirroredClientId = env[provider.clientIdFlag];
  if (mirroredClientId !== undefined && !String(mirroredClientId).trim()) return false;
  return true;
}

/** Providers the sign-in page may offer. Empty means "show no SSO control". */
export function enabledSsoProviders(env: SsoEnv = process.env): SsoProvider[] {
  return PROVIDERS.filter((provider) => ssoProviderConfigured(provider.id, env)).map(({ id, label }) => ({
    id,
    label,
  }));
}

/** Every known provider with its current state, for admin-facing status text. */
export function ssoProviderStatus(env: SsoEnv = process.env): (SsoProvider & { enabled: boolean })[] {
  return PROVIDERS.map(({ id, label }) => ({ id, label, enabled: ssoProviderConfigured(id, env) }));
}

/** Hostnames that are never a tenant root domain (preview platforms). */
const PLATFORM_SUFFIXES = [".vercel.app", ".e2b.app", ".netlify.app", ".github.io", ".onrender.com"];
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

/**
 * The origin to send an OAuth round trip back to.
 *
 * The Supabase `redirectTo` has to be absolute, so it is derived from the
 * request's own host — that keeps a sign-in started on a school subdomain on
 * that subdomain. Because a Host header is attacker-controlled, the value is
 * only used when the hostname is one this deployment can legitimately serve:
 * a local host, the configured root domain (or a subdomain of it), or a known
 * platform suffix. Anything else falls back to NEXT_PUBLIC_APP_URL, and when
 * that is unusable the caller treats SSO as unavailable instead of redirecting
 * a browser to an untrusted origin.
 *
 * `x-forwarded-proto` is deliberately ignored: everything but a local host is
 * forced to https, so a spoofed proto header cannot downgrade the callback.
 */
export function requestOrigin(input: {
  host?: string | null;
  rootDomain?: string | null;
  appUrl?: string | null;
}): string | null {
  // `x-forwarded-host` may arrive as a comma-separated chain; the first entry
  // is the one the client asked for.
  const host = String(input.host ?? "").split(",")[0].trim().toLowerCase().replace(/\.$/, "");

  if (host) {
    // Loopback keeps its own scheme and port so `next dev` round trips work.
    if (/^(\[::1\]|localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) return `http://${host}`;
    if (HOST_PATTERN.test(host)) {
      const hostname = host.split(":")[0];
      const root = String(input.rootDomain ?? "").trim().toLowerCase().replace(/^\.+|\.$/g, "");
      const onRoot = Boolean(root) && (hostname === root || hostname.endsWith(`.${root}`));
      const onPlatform = PLATFORM_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
      if (onRoot || onPlatform) return `https://${host}`;
    }
  }

  const appUrl = String(input.appUrl ?? "").trim();
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // An unparseable NEXT_PUBLIC_APP_URL is not a usable fallback.
    }
  }
  return null;
}

/**
 * Where the provider should return to. The `sso` marker is what tells the
 * callback to run the provisioning guard — email confirmation and password
 * recovery come through the same route without it and keep today's behaviour.
 */
export function ssoCallbackUrl(origin: string, next: string | null, provider: SsoProviderId): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("sso", provider);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

/** "ada.lovelace@gmail.com" → "a***@gmail.com". Never logs a full address. */
export function maskEmail(email: string | null | undefined): string | null {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain) return null;
  return `${local.slice(0, 1)}***@${domain}`;
}

/** User-facing copy for the SSO failure codes the callback and action emit. */
const SSO_ERROR_MESSAGES: Record<string, string> = {
  sso: "We couldn't complete that sign-in. Try again, or use your email and password.",
  sso_unavailable: "Single sign-on isn't available in this deployment. Sign in with your email and password.",
  sso_unprovisioned:
    "That sign-in worked, but this account isn't part of an EVALORA workspace yet. Ask your school administrator to invite you, then try again.",
};

export function ssoErrorMessage(code: string | null | undefined): string | null {
  const key = String(code ?? "").trim();
  return Object.prototype.hasOwnProperty.call(SSO_ERROR_MESSAGES, key) ? SSO_ERROR_MESSAGES[key] : null;
}
