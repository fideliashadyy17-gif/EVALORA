"use client";

import { AuthError, AuthNotice } from "@/components/AuthShell";
import { Button, Field, Input } from "@/components/ui";
import { ssoErrorMessage, type SsoProvider } from "@/lib/sso";
import { createClient } from "@/lib/supabase/client";
import { startSsoSignIn } from "@/app/login/actions";
import Link from "next/link";
import { useState } from "react";

/**
 * Password sign-in for staff and students, plus third-party sign-in when — and
 * only when — the deployment offers a provider. `providers` is resolved on the
 * server, so an unconfigured deployment renders the same page it always has.
 *
 * Sign-in is never a redirect into an examination/join flow: on success the
 * browser lands on /auth/resolve, which reads the verified profile and
 * membership and chooses the destination for that role.
 */
export function LoginForm({
  providers,
  next,
  error,
  registered,
  reset,
  signedInAs,
  institution,
}: {
  providers: SsoProvider[];
  next: string | null;
  error: string | null;
  registered: boolean;
  reset: boolean;
  /** Email of an existing session, when the visitor asked to switch accounts. */
  signedInAs?: string | null;
  /** Name of the institution whose portal sent the visitor here. */
  institution?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(
    error === "suspended"
      ? "This account has been suspended. Contact your institution."
      : error === "profile"
        ? "Your account or membership details could not be loaded. Try again or contact your institution."
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
          : signInError.message.toLowerCase().includes("rate")
            ? "Too many attempts. Wait a moment and try again."
            : "Invalid email or password. Please try again.",
      );
      return;
    }
    // A full navigation guarantees the server reads the new session and picks
    // the destination from verified role and membership records.
    const destination = new URL("/auth/resolve", window.location.origin);
    if (next) destination.searchParams.set("next", next);
    window.location.assign(destination.pathname + destination.search);
  }

  return (
    <>
      {signedInAs && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            You are already signed in as <strong className="break-all">{signedInAs}</strong>. Signing in below
            switches to the account you enter.
          </p>
          <SignOutHere />
        </div>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthNotice message={registered ? "Account created. If email confirmation is enabled, verify your inbox, then sign in." : null} />
        <AuthNotice message={reset ? "Password updated. Sign in with your new password." : null} />
        <AuthError message={message} />
        <Field label="Email address">
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoFocus={!signedInAs}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={institution ? "you@institution.edu" : "you@school.edu"}
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pr-20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs font-semibold text-evergreen-700 hover:bg-evergreen-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-evergreen-600"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Link href="/forgot-password" className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
            Forgot password?
          </Link>
          <span className="text-xs text-ink-soft">Email and password</span>
        </div>
        <Button type="submit" className="w-full py-3" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p aria-live="polite" className="text-center text-xs text-ink-soft">
          {busy ? "Checking your account…" : ""}
        </p>
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

/** Sign out in place (returns to this same sign-in page). */
function SignOutHere() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    window.location.reload();
  }
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className="mt-2 font-semibold text-evergreen-800 underline underline-offset-2 disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out of that account"}
    </button>
  );
}
