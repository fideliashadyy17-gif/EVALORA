import { createServerClient } from "@supabase/ssr";
import { getTenantSlugFromHost } from "@/lib/tenant";
import { isMaintenanceOpenPath, parseMaintenanceState, type MaintenanceState } from "@/lib/maintenance";
import { NextResponse, type NextRequest } from "next/server";

const PRIVATE = ["/supervision", "/dashboard", "/admin", "/onboarding", "/student", "/workspaces"];
const AUTH_PAGES = ["/login", "/register"];

/**
 * Strict bounds for Edge Middleware auth checks so an upstream GoTrue stall or
 * token-refresh retry loop can never hit Vercel's 25s MIDDLEWARE_INVOCATION_TIMEOUT.
 */
const MIDDLEWARE_FETCH_TIMEOUT_MS = 2_500;
const MIDDLEWARE_AUTH_BUDGET_MS = 3_500;

function createBoundedFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const onUpstreamAbort = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) controller.abort();
      else upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (upstreamSignal) upstreamSignal.removeEventListener("abort", onUpstreamAbort);
    }
  };
}

/**
 * Maintenance mode (Platform Control Center → Platform behaviour).
 *
 * Read straight from the configuration store with the anon key: the migration
 * exposes exactly three global keys to anonymous readers —
 * maintenance_mode, maintenance_message and global_announcements — because
 * those are content every visitor sees by definition. Everything else in the
 * store stays authenticated-only.
 *
 * Cached in module scope for a short window so the hot path costs nothing, and
 * FAILS OPEN: if the configuration store cannot be reached, the platform keeps
 * serving. A configuration read must never be able to take EVALORA down.
 */
const MAINTENANCE_CACHE_TTL_MS = 15_000;
let maintenanceCache: { at: number; state: MaintenanceState } | null = null;

async function readMaintenanceState(boundedFetch: typeof fetch): Promise<MaintenanceState> {
  if (maintenanceCache && Date.now() - maintenanceCache.at < MAINTENANCE_CACHE_TTL_MS) {
    return maintenanceCache.state;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { enabled: false, message: "" };
  try {
    const endpoint =
      `${url.replace(/\/$/, "")}/rest/v1/platform_config_values` +
      `?select=key,value&scope_level=eq.global&namespace=eq.platform_behavior` +
      `&key=in.(maintenance_mode,maintenance_message)`;
    const res = await boundedFetch(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" },
    });
    if (!res.ok) return { enabled: false, message: "" };
    const state = parseMaintenanceState(await res.json());
    maintenanceCache = { at: Date.now(), state };
    return state;
  } catch {
    return { enabled: false, message: "" };
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").trim().toLowerCase().replace(/:\d+$/, "");

  // Permanent retirement and canonical redirect of legacy domains (evalora-six.vercel.app -> evalora-edu.online)
  if (host === "evalora-six.vercel.app" || host === "evalora.vercel.app" || host.endsWith(".evalora-six.vercel.app")) {
    const canonicalHost = host.endsWith(".evalora-six.vercel.app")
      ? `${host.slice(0, -".evalora-six.vercel.app".length)}.evalora-edu.online`
      : "evalora-edu.online";
    const redirectUrl = new URL(request.url);
    redirectUrl.protocol = "https:";
    redirectUrl.host = canonicalHost;
    redirectUrl.port = "";
    return NextResponse.redirect(redirectUrl, { status: 301 });
  }

  // Canonical www to apex redirect for evalora-edu.online
  if (host === "www.evalora-edu.online") {
    const redirectUrl = new URL(request.url);
    redirectUrl.protocol = "https:";
    redirectUrl.host = "evalora-edu.online";
    redirectUrl.port = "";
    return NextResponse.redirect(redirectUrl, { status: 301 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-evalora-tenant-slug");
  const tenantSlug = getTenantSlugFromHost(request.headers.get("host"));
  if (tenantSlug) requestHeaders.set("x-evalora-tenant-slug", tenantSlug);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Tenant root portal rewrite needs only the verified Host header — zero remote calls.
  if (tenantSlug && pathname === "/") {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/portal/${tenantSlug}`;
    return NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
  }

  // Maintenance mode is checked before the public fast path, because it has to
  // cover public pages too. One cached boolean on the hot path.
  const maintenance = await readMaintenanceState(createBoundedFetch(MIDDLEWARE_FETCH_TIMEOUT_MS));
  const maintenanceActive = maintenance.enabled && !isMaintenanceOpenPath(pathname);

  // Fast path: candidate exam routes (/take-exam/*, /exam-access/*, /exam/*, /retake/*),
  // live sessions (/play/*, /join/*, /live/*), public pages, and all /api/* route handlers
  // perform their own server-side token/session/tenant validation and never need Edge GoTrue calls.
  const isPrivate = PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isAuthPage = AUTH_PAGES.includes(pathname) && !request.nextUrl.searchParams.has("error");
  if (!isPrivate && !isAuthPage && !maintenanceActive) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Allow isolated unit tests with mocked @supabase/ssr where env vars are unset to proceed below
    // only if createServerClient is mocked; in production env vars are always present.
  }

  const isCanonical = host === "evalora-edu.online" || host.endsWith(".evalora-edu.online");

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      // This file already bounds every upstream call it makes — a 2.5 s fetch and
      // a 3.5 s auth budget — so letting postgrest-js stack its own 1s+2s+4s
      // retry backoff on top would contradict that design: one unreachable
      // database would cost ~7 s per read, on the edge, before a page even starts
      // rendering. The maintenance gate's `profiles` read is the one here. See
      // SERVER_DB_OPTIONS in src/lib/supabase/server.ts for the measurement.
      db: { retry: false },
      global: {
        fetch: createBoundedFetch(MIDDLEWARE_FETCH_TIMEOUT_MS),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => {
            const mergedOptions = isCanonical
              ? { ...options, domain: ".evalora-edu.online", sameSite: "lax" as const, secure: true }
              : options;
            response.cookies.set(name, value, mergedOptions);
          });
        },
      },
    },
  );

  const withCookies = (target: NextResponse) => {
    response.cookies.getAll().forEach((c) => target.cookies.set(c));
    return target;
  };

  let user: { id: string } | null = null;
  let authUpstreamFailed = false;

  let budgetTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    // Verify the session JWT locally against the project's JWKS instead of
    // calling GoTrue's /user endpoint on every navigation. With asymmetric
    // signing keys this is a cached WebCrypto check (no auth round-trip); on a
    // legacy symmetric secret supabase-js falls back to the same server-side
    // verification getUser() performs, so security is unchanged. The layout and
    // every server action still call getUser() for authoritative checks.
    const authResult = await Promise.race([
      supabase.auth.getClaims().then((res) => ({ kind: "done" as const, res })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        budgetTimer = setTimeout(() => resolve({ kind: "timeout" }), MIDDLEWARE_AUTH_BUDGET_MS);
      }),
    ]);

    if (authResult.kind === "timeout") {
      authUpstreamFailed = true;
    } else {
      const claims = authResult.res.data?.claims as { sub?: string } | null;
      user = claims?.sub ? { id: claims.sub } : null;
      const errStatus = (authResult.res.error as { status?: number; name?: string } | null)?.status;
      const errName = (authResult.res.error as { status?: number; name?: string } | null)?.name;
      if (!user && (errName === "AuthRetryableFetchError" || (typeof errStatus === "number" && (errStatus === 0 || errStatus >= 500)))) {
        authUpstreamFailed = true;
      }
    }
  } catch {
    authUpstreamFailed = true;
  } finally {
    if (budgetTimer) clearTimeout(budgetTimer);
  }

  // Maintenance gate. A verified active Super Admin is always let through, so
  // the platform can never lock out the administrator who has to switch
  // maintenance off. Candidate, live-session and authentication routes are
  // already excluded by isMaintenanceOpenPath(), so an attempt in progress is
  // never cut off and an administrator can always sign in.
  if (maintenanceActive) {
    let isSuperAdmin = false;
    if (user) {
      try {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("platform_role, status")
          .eq("id", user.id)
          .maybeSingle();
        isSuperAdmin = profileRow?.platform_role === "super_admin" && profileRow?.status === "active";
      } catch {
        isSuperAdmin = false;
      }
    }
    if (!isSuperAdmin) {
      const maintenanceUrl = request.nextUrl.clone();
      maintenanceUrl.pathname = "/maintenance";
      maintenanceUrl.search = "";
      return withCookies(
        NextResponse.rewrite(maintenanceUrl, { request: { headers: requestHeaders } }),
      );
    }
  }

  // If GoTrue timed out or returned 5xx, never stall into a 504 or force-logout a user
  // who already holds a session cookie; defer to the server layout/route handler.
  if (authUpstreamFailed) {
    const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    if (isPrivate && !hasSessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return withCookies(NextResponse.redirect(url));
    }
    return response;
  }

  if (!user && isPrivate) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return withCookies(NextResponse.redirect(url));
  }
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    url.pathname = "/auth/resolve";
    url.search = "";
    if (next) url.searchParams.set("next", next);
    return withCookies(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|eot|wav|mp3|ogg|m4a|css|js|map|txt|xml|webmanifest|pdf)$).*)",
  ],
};
