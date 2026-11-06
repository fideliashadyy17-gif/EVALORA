"use client";

import { AuthError, AuthNotice } from "@/components/AuthShell";
import { Button, Field, Input } from "@/components/ui";
import { ssoErrorMessage, type SsoProvider } from "@/lib/sso";
import { createClient } from "@/lib/supabase/client";
import { startSsoSignIn } from "@/app/login/actions";
import Link from "next/link";
import { useState } from "react";

/**
 * Password sign-in, plus third-party sign-in when — and only when — the
 * deployment offers a provider. `providers` is resolved on the server, so an
 * unconfigured deployment renders the same page it always has: no divider, no
 * button, no dead end.
 *
 * The SSO form posts to a server action, so the OAuth hand-off starts on the
 * server with the request's own origin; the browser never builds the callback
 * URL itself.
 */
export function LoginForm({
  providers,
  next,
  error,
  registered,
  reset,
}: {
  providers: SsoProvider[];
  next: string | null;
  error: string | null;
  registered: boolean;
  reset: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(
    error === "suspended"
      ? "This account has been suspended. Contact support."
      : error === "profile"
        ? "Your account or membership details could not be loaded. Try again or contact support."
        : ssoErrorMessage(error),
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setMessage(
        signInError.message.toLowerCase().includes("confirm")
          ? "Please confirm your email address first — check your inbox for the verification link."
          : "Invalid email or password. Please try again.",
      );
      return;
    }
    // Full navigation ensures the server reads the newly established session
    // and chooses the destination from verified role and membership data.
    const destination = new URL("/auth/resolve", window.location.origin);
    if (next) destination.searchParams.set("next", next);
    window.location.assign(destination.pathname + destination.search);
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <AuthNotice message={registered ? "Account created. If email confirmation is enabled, verify your inbox, then sign in." : null} />
        <AuthNotice message={reset ? "Password updated. Sign in with your new password." : null} />
        <AuthError message={message} />
        <Field label="Email address">
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
        </Field>
        <Field label="Password">
          <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" className="w-full py-3" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {providers.length > 0 && (
        <div className="mt-6 border-t border-evergreen-900/10 pt-5">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-ink-soft">or continue with</p>
          <div className="mt-3 space-y-2">
            {providers.map((provider) => (
              <form key={provider.id} action={startSsoSignIn}>
                <input type="hidden" name="provider" value={provider.id} />
                {next && <input type="hidden" name="next" value={next} />}
                <Button type="submit" variant="outline" className="w-full py-3">
                  Continue with {provider.label}
                </Button>
              </form>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
