"use client";

import { Logo } from "@/components/Logo";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

/**
 * The screen a candidate lands on the moment their paper is submitted.
 *
 * It reports ONE examination: a score out of a total, a percentage, and whether
 * that result is final or still provisional. There is no IB criterion breakdown
 * anywhere on this page — not criterion A–D, not achievement levels, not a
 * per-criterion table. The brief for this paper is explicit that a student must
 * not be handed a criteria-style result, and the API behind this page does not
 * even send the data.
 */

interface ResultPayload {
  attempt_id: string;
  submitted_at: string | null;
  status: "final" | "provisional";
  score: number | null;
  max: number | null;
  percentage: number | null;
  pending_manual_count: number;
  pass_mark_percent: number | null;
  passed: boolean | null;
  exam: { title: string; instructions: string | null; duration_minutes: number };
  candidate_name: string | null;
  entry_href: string;
}

const numberFmt = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");

function formatStamp(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExamResultClient({
  attemptId,
  token,
  entryHref: fallbackHref,
}: {
  attemptId: string;
  token: string;
  entryHref: string;
}) {
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/exam/result?attempt_id=${encodeURIComponent(attemptId)}&token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => null)) as (ResultPayload & { error?: string }) | null;
        if (cancelled) return;
        if (!response.ok || !payload || payload.error) {
          setError(payload?.error ?? "Your result could not be loaded.");
        } else {
          setResult(payload);
        }
      } catch {
        if (!cancelled) setError("Your result could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, token]);

  const entryHref = result?.entry_href || fallbackHref || "/exam-access";

  const finish = useCallback(() => {
    // Hand the browser back to the examination entry screen, cleared for the
    // next candidate on this device.
    try {
      localStorage.removeItem("evalora:exam:attempt");
      sessionStorage.removeItem("evalora:exam:attempt");
    } catch {
      // Storage is best-effort here; the navigation still happens.
    }
    window.location.replace(entryHref);
  }, [entryHref]);

  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-ink-soft">Marking your paper…</p>
      </Shell>
    );
  }

  if (error || !result) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950">Result unavailable</h1>
        <p className="mt-2 text-sm text-ink-soft">{error}</p>
        <p className="mt-1 text-sm text-ink-soft">
          Your answers were submitted and are stored safely. Please speak to your invigilator.
        </p>
        <div className="mt-6">
          <Button onClick={finish}>Return to examination entry</Button>
        </div>
      </Shell>
    );
  }

  const isFinal = result.status === "final";
  const score = result.score ?? 0;
  const max = result.max ?? 0;
  const pct = result.percentage;
  const passed = result.passed;

  return (
    <Shell>
      <div className="text-center">
        <p className="exam-entry-kicker">Examination completed</p>
        <p className="mt-1 text-sm font-medium text-evergreen-800">{result.exam.title}</p>

        <div className="mt-4">
          {isFinal ? (
            <Badge tone="green" className="px-3 py-1" data-testid="result-status-final">
              Final result
            </Badge>
          ) : (
            <Badge tone="gold" className="px-3 py-1" data-testid="result-status-provisional">
              Provisional result
            </Badge>
          )}
        </div>

        {/* The score is the most prominent thing on the page. */}
        <p
          data-testid="result-score"
          className="mt-5 font-display text-5xl font-bold tabular-nums text-evergreen-950 sm:text-6xl"
        >
          {numberFmt(score)} <span className="text-evergreen-700/50">/ {numberFmt(max)}</span>
        </p>
        {pct !== null && (
          <p data-testid="result-percentage" className="mt-1 text-2xl font-semibold tabular-nums text-evergreen-800">
            {numberFmt(pct)}%
          </p>
        )}

        <p className={cn("mt-4 text-sm leading-relaxed", isFinal ? "text-ink-soft" : "text-amber-900")}>
          {isFinal
            ? passed === true
              ? "Well done! You have successfully completed your examination — you are ready, according to this examination's pass mark."
              : passed === false
                ? "You have completed your examination. Keep revising — more preparation is needed before you are ready, according to this examination's pass mark."
                : "You have completed your examination."
            : `${result.pending_manual_count} question${result.pending_manual_count === 1 ? "" : "s"} still need${result.pending_manual_count === 1 ? "s" : ""} your teacher's marking. The marks above are the ones awarded so far; your final result will appear here once that marking is finished.`}
        </p>
      </div>

      <dl className="mt-7 space-y-2.5 border-t border-evergreen-900/10 pt-5 text-sm">
        {result.candidate_name && (
          <Row label="Candidate" value={result.candidate_name} testId="result-candidate" />
        )}
        <Row label="Examination" value={result.exam.title} />
        <Row label="Submitted" value={formatStamp(result.submitted_at)} testId="result-submitted-at" />
        <Row label="Marks obtained" value={numberFmt(score)} />
        <Row label="Total marks available" value={numberFmt(max)} testId="result-max" />
        {pct !== null && <Row label="Percentage" value={`${numberFmt(pct)}%`} />}
        {result.pass_mark_percent !== null && (
          <Row label="Pass mark" value={`${numberFmt(result.pass_mark_percent)}%`} />
        )}
        <Row
          label="Result status"
          value={isFinal ? "Final" : "Provisional — teacher marking pending"}
        />
        {!isFinal && (
          <Row label="Questions awaiting marking" value={String(result.pending_manual_count)} />
        )}
      </dl>

      <div className="mt-7">
        <Button onClick={finish} className="w-full" data-testid="result-finish">
          Finish &amp; exit for next student
        </Button>
      </div>
    </Shell>
  );
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-evergreen-950" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo className="mb-6" />
      <Card className="w-full max-w-lg p-7 sm:p-8">{children}</Card>
    </div>
  );
}
