"use client";

import { AuthError, AuthNotice, AuthShell } from "@/components/AuthShell";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const sp = useSearchParams();
  const next = sp.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    sp.get("error") === "suspended" ? "This account has been suspended. Contact support." :
    sp.get("error") === "profile" ? "Your account or membership details could not be loaded. Try again or contact support." : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("confirm")
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
    <form onSubmit={submit} className="space-y-4">
      <AuthNotice message={sp.get("registered") ? "Account created. If email confirmation is enabled, verify your inbox, then sign in." : null} />
      <AuthNotice message={sp.get("reset") ? "Password updated. Sign in with your new password." : null} />
      <AuthError message={error} />
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
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your EVALORA workspace."
      footer={
        <>
          No account yet?{" "}
          <Link href="/register" className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">
            Create one free
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
