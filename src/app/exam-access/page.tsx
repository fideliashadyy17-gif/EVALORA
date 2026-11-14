"use client";

import { Logo } from "@/components/Logo";
import { Button, Card, Field, Input } from "@/components/ui";
import {
  readActiveCandidatePointer,
  saveCandidateAttemptSession,
  type ActiveCandidatePointer,
} from "@/lib/examCandidateSession";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ExamAccessPage() {
  const router = useRouter();
  const [examCode, setExamCode] = useState("");
  const [candidateCode, setCandidateCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [activePointer, setActivePointer] = useState<ActiveCandidatePointer | null>(null);
  const [dismissedActivePointer, setDismissedActivePointer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const local = typeof window !== "undefined" ? window.localStorage : null;
    setActivePointer(readActiveCandidatePointer(local, { entryHref: "/exam-access" }));
  }, []);

  async function submit(e: React.FormEvent | null) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/exam/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_code: examCode.trim(), candidate_code: candidateCode.trim() }),
      });
    } catch {
      setBusy(false);
      return setError("Connection interrupted while verifying access. Check your connection and try again.");
    }
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Access denied.");
    const saved = saveCandidateAttemptSession(
      typeof window !== "undefined" ? window.localStorage : null,
      typeof window !== "undefined" ? window.sessionStorage : null,
      {
        attempt_id: data.attempt_id,
        token: data.access_token,
        exam_id: data.exam_id,
        entry_href: "/exam-access",
        candidate_name: typeof data.candidate_name === "string" ? data.candidate_name : null,
        status: typeof data.status === "string" ? data.status : "in_progress",
      },
    );
    if (!saved) {
      return setError("Your browser blocked session storage. Enable it and try again.");
    }
    router.push(`/take-exam/${data.attempt_id}`);
  }

  return (
    <main className="exam-entry min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Logo />
          <span className="exam-entry-secure">Secure examination access</span>
        </div>
        <Card className="exam-entry-card overflow-hidden">
          <div className="exam-entry-heading px-6 py-7 sm:px-9 sm:py-8">
            <p className="exam-entry-kicker">Candidate check-in</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">Enter your examination</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-emerald-50/80">
              Use the examination code and personal candidate code issued by your institution. Shared classroom browsers are supported.
            </p>
          </div>
          <div className="p-6 sm:p-9">
            <div className="exam-entry-assurance mb-5 grid gap-3 sm:grid-cols-3">
              <div><span>01</span><p>Server-timed session</p></div>
              <div><span>02</span><p>Answers autosaved</p></div>
              <div><span>03</span><p>Resume after reconnect</p></div>
            </div>
            {activePointer && !dismissedActivePointer && (
              <div
                role="region"
                aria-label="Unfinished examination recovery"
                data-testid="active-attempt-recovery-banner"
                className="mb-5 rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3.5 text-sm text-amber-950"
              >
                <p className="font-semibold">
                  An unfinished examination{activePointer.candidate_name ? ` for ${activePointer.candidate_name}` : ""} is still in progress on this browser.
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900/90">
                  If that paper is yours, resume where you left off. If you are a different student, enter your own personal candidate code below.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    className="text-xs"
                    onClick={() => router.push(`/take-exam/${activePointer.attempt_id}`)}
                  >
                    Resume{activePointer.candidate_name ? ` ${activePointer.candidate_name}'s` : " saved"} attempt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setDismissedActivePointer(true)}
                  >
                    I am a different student
                  </Button>
                </div>
              </div>
            )}
            <p className="mb-5 text-sm leading-6 text-ink-soft">
              Received a shareable examination link or single invitation code?{" "}
              <Link href="/exam" className="font-semibold text-evergreen-800 underline underline-offset-2">
                Open invitation entry
              </Link>{" "}
              instead.
            </p>
            <form onSubmit={submit} className="space-y-4">
              {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <Field label="Examination code">
                <Input value={examCode} onChange={(e) => setExamCode(e.target.value.toUpperCase())} placeholder="e.g. X8K2P4Q7" className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" required autoComplete="off" />
              </Field>
              <Field label="Your personal candidate code">
                <Input value={candidateCode} onChange={(e) => setCandidateCode(e.target.value.toUpperCase())} placeholder="Issued to you personally" className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" required autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} />
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-evergreen-900/10 bg-cream/70 p-4 text-sm leading-6 text-ink">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-evergreen-700" required />
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
          </div>
        </Card>
        <p className="mt-5 text-center text-xs text-ink-soft">Your attempt is verified and timed by EVALORA&apos;s secure examination service.</p>
      </div>
    </main>
  );
}
