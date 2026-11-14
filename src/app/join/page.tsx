"use client";

import { Logo } from "@/components/Logo";
import { Button, Card, Field, Input } from "@/components/ui";
import Link from "next/link";
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
    <main className="exam-entry min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Logo />
          <span className="exam-entry-secure">Live participant entry</span>
        </div>
        <Card className="exam-entry-card overflow-hidden">
          <div className="exam-entry-heading px-6 py-7 sm:px-9 sm:py-8">
            <p className="exam-entry-kicker">Live activity check-in</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">Join a live quiz</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-emerald-50/80">
              No account needed — enter your organizer&apos;s session code, pick an avatar and display name, and answer on your device.
            </p>
          </div>
          <div className="p-6 sm:p-9">
            <div className="exam-entry-assurance mb-5 grid gap-3 sm:grid-cols-3">
              <div><span>01</span><p>No account required</p></div>
              <div><span>02</span><p>Server-timed rounds</p></div>
              <div><span>03</span><p>Reconnect anytime</p></div>
            </div>
            <Suspense>
              <JoinForm />
            </Suspense>
            <p className="mt-5 border-t border-evergreen-900/10 pt-4 text-xs text-ink-soft">
              Sitting a formal examination instead?{" "}
              <Link href="/exam-access" className="font-semibold text-evergreen-800 underline underline-offset-2">
                Enter candidate codes
              </Link>{" "}
              or{" "}
              <Link href="/exam" className="font-semibold text-evergreen-800 underline underline-offset-2">
                open an invitation link
              </Link>
              .
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
