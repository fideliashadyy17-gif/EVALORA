import { safeLocalPath } from "@/lib/roleRouting";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Handles email-confirmation and password-reset links. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeLocalPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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
