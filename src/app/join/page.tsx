"use client";

import { Logo } from "@/components/Logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function JoinForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState((sp.get("code") ?? "").toUpperCase());

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim().length >= 4) router.push(`/play/${code.trim().toUpperCase()}`);
      }}
    >
      <Field label="Session code" hint="Your organizer shared this 6-character code — or scan their QR code.">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7QX2P"
          className="py-3 text-center font-display text-2xl font-bold uppercase tracking-[0.3em]"
          autoComplete="off"
          maxLength={10}
        />
      </Field>
      <Button type="submit" variant="gold" className="w-full py-3 text-base" disabled={code.trim().length < 4}>
        Join the session
      </Button>
    </form>
  );
}

export default function JoinPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo className="mb-6" />
      <Card className="w-full max-w-md p-7 sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Join a live quiz</h1>
        <p className="mt-1 text-sm text-ink-soft">No account needed — just your session code and a display name.</p>
        <div className="mt-6">
          <Suspense>
            <JoinForm />
          </Suspense>
        </div>
      </Card>
      <p className="mt-6 max-w-md text-center text-sm text-ink-soft">
        Sitting a formal examination instead?{" "}
        <a href="/exam-access" className="font-semibold text-evergreen-700 underline underline-offset-2">Enter your examination here</a>.
      </p>
    </div>
  );
}
