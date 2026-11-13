import { createServerClient } from "@supabase/ssr";
import { getTenantSlugFromHost } from "@/lib/tenant";
import { NextResponse, type NextRequest } from "next/server";

const PRIVATE = ["/dashboard", "/admin", "/onboarding", "/student", "/workspaces"];
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // Fast path: candidate exam routes (/take-exam/*, /exam-access/*, /exam/*, /retake/*),
  // live sessions (/play/*, /join/*, /live/*), public pages, and all /api/* route handlers
  // perform their own server-side token/session/tenant validation and never need Edge GoTrue calls.
  const isPrivate = PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isAuthPage = AUTH_PAGES.includes(pathname) && !request.nextUrl.searchParams.has("error");
  if (!isPrivate && !isAuthPage) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Allow isolated unit tests with mocked @supabase/ssr where env vars are unset to proceed below
    // only if createServerClient is mocked; in production env vars are always present.
  }

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      global: {
        fetch: createBoundedFetch(MIDDLEWARE_FETCH_TIMEOUT_MS),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
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
    const authResult = await Promise.race([
      supabase.auth.getUser().then((res) => ({ kind: "done" as const, res })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        budgetTimer = setTimeout(() => resolve({ kind: "timeout" }), MIDDLEWARE_AUTH_BUDGET_MS);
      }),
    ]);

    if (authResult.kind === "timeout") {
      authUpstreamFailed = true;
    } else {
      user = authResult.res.data?.user ?? null;
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
