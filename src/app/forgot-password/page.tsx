"use client";

import { AuthNotice, AuthShell } from "@/components/AuthShell";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    setSent(true); // always show the same message (no account enumeration)
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a secure reset link."
      footer={<Link href="/login" className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthNotice message={sent ? "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder." : null} />
        <Field label="Email address">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
        </Field>
        <Button type="submit" className="w-full py-3" disabled={busy}>
          {busy ? "Sending…" : "Email me a reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
