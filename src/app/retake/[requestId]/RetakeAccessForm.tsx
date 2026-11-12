"use client";

import { Button, Card, Field, Input } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The dedicated retake access form: first name, last name and the code issued
 * with the approval. All three are verified server-side against the approval
 * and the signed-in student — the browser only carries what was typed.
 */
export function RetakeAccessForm({
  requestId,
  examTitle,
  expiresAt,
  remaining,
}: {
  requestId: string;
  examTitle: string;
  expiresAt: string | null;
  remaining: number;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/retake/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          first_name: firstName,
          last_name: lastName,
          code,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setBusy(false);
        return setError(data?.error ?? "This retake could not be started.");
      }
      // Same hand-off the code-based access page uses: the attempt token stays
      // in this browser, never in the URL.
      window.localStorage.setItem(
        `evalora-attempt-${data.attempt_id}`,
        JSON.stringify({ token: data.access_token, exam_id: data.exam_id }),
      );
      router.push(`/take-exam/${data.attempt_id}`);
    } catch {
      setBusy(false);
      setError("Connection problem — the retake was not started. Try again.");
    }
  }

  return (
    <Card className="w-full max-w-xl p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-evergreen-700">Retake approved</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-evergreen-950">Start your authorized retake</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {examTitle} · {remaining} authorized attempt{remaining === 1 ? "" : "s"} remaining
        {expiresAt ? ` · start before ${new Date(expiresAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}
      </p>
      <p className="mt-3 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
        Enter your first name, your last name and the retake code your institution issued with the approval.
        Your original submitted paper is preserved exactly as it was; this retake is recorded as a new attempt.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="given-name" />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Competition / retake code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            autoComplete="off"
            placeholder="XXXXXXXXXX"
            className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]"
          />
        </Field>
        <Button type="submit" variant="gold" className="w-full py-3 text-base" disabled={busy}>
          {busy ? "Opening your paper…" : "Start the retake"}
        </Button>
      </form>
    </Card>
  );
}
