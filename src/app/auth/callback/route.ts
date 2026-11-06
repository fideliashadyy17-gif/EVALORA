import { safeLocalPath } from "@/lib/roleRouting";
import { enforceSsoProvisioning, recordSsoSignIn } from "@/lib/ssoSession";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Handles email-confirmation and password-reset links, and the return leg of a
 * third-party sign-in (`?sso=<provider>`, set by the sign-in action).
 *
 * The SSO leg carries one extra rule: a provider identity only becomes a
 * session if it maps to an active profile. Without that, an uninvited Google
 * account would leave here holding a live session that merely bounces between
 * "profile could not be loaded" pages. The session is destroyed instead.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeLocalPath(searchParams.get("next"));
  const sso = searchParams.get("sso");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && sso) {
      const outcome = await enforceSsoProvisioning(supabase);
      if (!outcome.ok) {
        // Drop the freshly established session before sending the user back.
        await supabase.auth.signOut();
        await recordSsoSignIn({
          provider: sso,
          userId: outcome.userId,
          email: outcome.email,
          actorId: outcome.reason === "inactive" ? outcome.userId : null,
          outcome: outcome.reason === "inactive" ? "denied_inactive" : "denied_no_profile",
        });
        const destination = outcome.reason === "inactive" ? "/login?error=suspended" : "/login?error=sso_unprovisioned";
        return NextResponse.redirect(new URL(destination, origin), {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      await recordSsoSignIn({
        provider: sso,
        userId: outcome.userId,
        email: outcome.email,
        actorId: outcome.userId,
        outcome: "provisioned",
      });
    }

    if (!error) {
      // Password recovery must still reach the reset form. Other destinations
      // are checked against the authenticated role by the resolver.
      if (next === "/reset-password") return NextResponse.redirect(new URL(next, origin));
      const destination = new URL("/auth/resolve", origin);
      if (next) destination.searchParams.set("next", next);
      return NextResponse.redirect(destination);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
