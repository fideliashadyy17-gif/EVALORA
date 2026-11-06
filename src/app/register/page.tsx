"use client";

import { AuthError, AuthShell } from "@/components/AuthShell";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push("/auth/resolve");
      router.refresh();
    } else {
      router.push("/login?registered=1");
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever plan included. Set up your organization in the next step."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthError message={error} />
        <Field label="Full name">
          <Input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Adaeze Okafor" />
        </Field>
        <Field label="Email address">
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <Button type="submit" variant="gold" className="w-full py-3" disabled={busy}>
          {busy ? "Creating account…" : "Create free account"}
        </Button>
        <p className="text-center text-xs text-ink-soft">
          By registering you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </form>
    </AuthShell>
  );
}
