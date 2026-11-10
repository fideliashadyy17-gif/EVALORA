"use client";

import { useCallback, useRef, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { HINT_LEVEL_LABELS, NO_HINT_MESSAGE } from "@/lib/examHints";

export type CandidateHint = { level: number; text: string };

/**
 * "Need a hint?" for the question that is currently on screen.
 *
 * Safety rules baked into this component:
 *  · it is pure presentation — it never saves an answer, never submits, never
 *    re-reads the examination state, never touches the countdown and never reports an
 *    integrity event, so opening a hint cannot affect the attempt;
 *  · it is rendered inline under the question header (not as an overlay), so it
 *    can never cover the question, the answer fields, the maths editor, an
 *    image or the on-screen keyboard;
 *  · the parent mounts it with `key={question_id}`, so switching questions
 *    unmounts it and a hint can never belong to the previous question;
 *  · it uses the hints already delivered with the paper when they are there
 *    (instant), and otherwise asks the authorised endpoint exactly once per
 *    question — duplicates are suppressed by a ref.
 */
export function HintPanel({
  attemptId,
  token,
  questionId,
  initialHints,
  disabled = false,
}: {
  attemptId: string;
  token: string | null;
  questionId: string;
  initialHints?: CandidateHint[] | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hints, setHints] = useState<CandidateHint[]>(() => sanitize(initialHints));
  const [levelIndex, setLevelIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/exam/hint?attempt_id=${encodeURIComponent(attemptId)}&question_id=${encodeURIComponent(questionId)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as { hints?: CandidateHint[] } | null;
      if (!response.ok || !data) {
        setError("Hints could not be loaded. Check your connection and try again.");
        return;
      }
      const next = sanitize(data.hints);
      setHints(next);
    } catch {
      setError("Hints could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [attemptId, questionId, token]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!hints.length && !requested.current) {
      requested.current = true;
      void load();
    }
  };

  if (disabled) return null;

  const current = hints[levelIndex] ?? hints[0] ?? null;
  const hasMore = hints.length > levelIndex + 1;

  return (
    <div className="print:hidden" data-testid="hint-panel" data-question-id={questionId}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`hint-${questionId}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gold-500/60 bg-gold-100/70 px-3 py-1.5 text-sm font-semibold text-gold-700 transition hover:bg-gold-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600"
      >
        <Lightbulb className="h-4 w-4" aria-hidden />
        {open ? "Hide hint" : "Need a hint?"}
      </button>

      {open && (
        <div
          id={`hint-${questionId}`}
          role="region"
          aria-label="Hint for this question"
          className="mt-3 rounded-xl border border-gold-500/50 bg-gold-100/50 p-4 text-sm text-ink"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Lightbulb className="h-4 w-4 text-gold-700" aria-hidden />
            <span className="font-semibold text-evergreen-950">A hint to help you think</span>
            {current && (
              <Badge tone="gold">
                {HINT_LEVEL_LABELS[current.level as 1 | 2 | 3] ?? "Hint"} · {levelIndex + 1} of {hints.length}
              </Badge>
            )}
          </div>

          {loading && (
            <p className="flex items-center gap-2 text-ink-soft" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking for a hint…
            </p>
          )}

          {!loading && error && (
            <div className="space-y-2">
              <p role="alert" className="text-red-700">{error}</p>
              <Button
                variant="outline"
                className="text-xs"
                onClick={() => {
                  requested.current = true;
                  void load();
                }}
              >
                Try again
              </Button>
            </div>
          )}

          {!loading && !error && current && (
            <p className="whitespace-pre-wrap leading-relaxed">{current.text}</p>
          )}

          {!loading && !error && !current && (
            <p className="leading-relaxed text-ink-soft">{NO_HINT_MESSAGE}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasMore && (
              <Button variant="outline" className="text-xs" onClick={() => setLevelIndex((index) => index + 1)}>
                Another hint
              </Button>
            )}
            <span className="text-xs text-ink-soft">Hints give guidance — they never give the answer.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Only well-formed, non-empty hints survive. This is defence in depth: the API
 * already projects to `{ level, text }`, and anything else is dropped here so a
 * malformed payload can never render as blank or duplicated guidance.
 */
function sanitize(value: unknown): CandidateHint[] {
  if (!Array.isArray(value)) return [];
  const out: CandidateHint[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as { level?: unknown; text?: unknown };
    const level = Math.trunc(Number(item.level));
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!Number.isFinite(level) || level < 1 || level > 3 || text.length < 8) continue;
    if (out.some((hint) => hint.level === level)) continue;
    out.push({ level, text });
  }
  return out.sort((a, b) => a.level - b.level);
}
