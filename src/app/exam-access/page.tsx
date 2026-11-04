"use client";

import { Logo } from "@/components/Logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ExamAccessPage() {
  const router = useRouter();
  const [examCode, setExamCode] = useState("");
  const [candidateCode, setCandidateCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/exam/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exam_code: examCode.trim(), candidate_code: candidateCode.trim() }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Access denied.");
    localStorage.setItem(
      `evalora-attempt-${data.attempt_id}`,
      JSON.stringify({ token: data.access_token, exam_id: data.exam_id }),
    );
    router.push(`/take-exam/${data.attempt_id}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo className="mb-6" />
      <Card className="w-full max-w-md p-7 sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Enter your examination</h1>
        <p className="mt-1 text-sm text-ink-soft">
          You need two codes from your institution: the examination code and your personal candidate code.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          <Field label="Examination code">
            <Input value={examCode} onChange={(e) => setExamCode(e.target.value.toUpperCase())} placeholder="e.g. X8K2P4Q7" className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" required autoComplete="off" />
          </Field>
          <Field label="Your personal candidate code">
            <Input value={candidateCode} onChange={(e) => setCandidateCode(e.target.value.toUpperCase())} placeholder="Issued to you personally" className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" required autoComplete="off" />
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-evergreen-700" required />
            <span>
              I understand this is a formal examination: my time is kept by the server, my answers are
              autosaved, and — if my institution enabled it — my camera will be supervised live for the
              duration of the paper.
            </span>
          </label>
          <Button type="submit" variant="gold" className="w-full py-3 text-base" disabled={busy || !consent}>
            {busy ? "Verifying…" : "Verify & begin"}
          </Button>
          <p className="text-center text-xs text-ink-soft">
            Returning after a disconnection? Enter the same codes — you will resume with your saved
            answers and your original deadline.
          </p>
        </form>
      </Card>
    </div>
  );
}
