import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTenantSlugFromHost } from "@/lib/tenant";

/**
 * Refreshes the Supabase session, guards private sections, and resolves
 * the tenant (school) from the hostname.
 *
 * For a school subdomain (e.g. greenwood.evalora.com or demo.localhost),
 * the slug is forwarded as `x-evalora-tenant-slug`; server code then
 * selects that organization ONLY among the signed-in user's verified
 * memberships (see getSessionContext). The tenant homepage rewrites to
 * the public school portal at /portal/<slug>, which 404s for unknown
 * subdomains — an unknown tenant can never render another school.
 */
export async function middleware(request: NextRequest) {
  const tenantSlug = getTenantSlugFromHost(request.headers.get("host"));
  const requestHeaders = new Headers(request.headers);
  if (tenantSlug) requestHeaders.set("x-evalora-tenant-slug", tenantSlug);
  else requestHeaders.delete("x-evalora-tenant-slug");

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Tenant homepage → that school's public portal.
  if (tenantSlug && path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/portal/${tenantSlug}`;
    const rewrite = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
    return rewrite;
  }

  const isPrivate = path.startsWith("/dashboard") || path.startsWith("/admin") || path.startsWith("/onboarding") || path.startsWith("/student") || path.startsWith("/workspaces");
  if (isPrivate && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (user && (path === "/login" || path === "/register") &&
      !(path === "/login" && ["suspended", "profile"].includes(request.nextUrl.searchParams.get("error") ?? ""))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/resolve";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|brand|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3|ogg|opus|flac|aac|m4a|aiff)$).*)",
  ],
};
