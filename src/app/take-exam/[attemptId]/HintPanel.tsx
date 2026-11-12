"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { HINT_LEVEL_LABELS, NO_HINT_MESSAGE } from "@/lib/examHints";
import { HINT_ATTENTION_SECONDS, answerStateFor, hintAttention, type HintAnswerState } from "@/lib/hintAttention";

export type CandidateHint = { level: number; text: string };

/**
 * "Need a hint?" for the question that is currently on screen.
 *
 * Safety rules baked into this component:
 *  · it never saves an answer, never submits, never re-reads the examination
 *    state, never touches the countdown and never reports an integrity event,
 *    so opening a hint cannot affect the attempt. The only write it makes is a
 *    best-effort, fire-and-forget record that a hint level was opened (once per
 *    level), which teachers see in the results view; it never changes a mark;
 *  · it is rendered inline under the question header (not as an overlay), so it
 *    can never cover the question, the answer fields, the maths editor, an
 *    image or the on-screen keyboard;
 *  · the button is available from the first second. After 30 seconds without a
 *    resolved answer it starts a calm attention pulse ("HINT — NEED HELP?"),
 *    and an incorrect answer asks immediately. Opening the hint — or answering
 *    correctly — ends the pulse; changing question unmounts it, so the timer can
 *    never follow a student to the next question;
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
  answerState,
  savedAnswer,
  attentionSeconds = HINT_ATTENTION_SECONDS,
}: {
  attemptId: string;
  token: string | null;
  questionId: string;
  initialHints?: CandidateHint[] | null;
  disabled?: boolean;
  /** Optional: derived from saved answer + released correctness, if the parent has it. */
  answerState?: HintAnswerState;
  /** Optional convenience: the candidate's saved answer payload, if any. */
  savedAnswer?: unknown;
  attentionSeconds?: number;
}) {
  const resolvedAnswerState: HintAnswerState =
    answerState ?? answerStateFor({ hasSavedAnswer: savedAnswer !== null && savedAnswer !== undefined });
  const [open, setOpen] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const mountedAt = useRef<number>(typeof Date !== "undefined" ? Date.now() : 0);
  const [hints, setHints] = useState<CandidateHint[]>(() => sanitize(initialHints));
  const [levelIndex, setLevelIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);
  const recordedLevels = useRef<Set<number>>(new Set());

  // A single timeout for the invitation. It is restarted only when the question
  // changes (the parent remounts this component with a question-keyed `key`) or
  // when the answer state changes, and it is never persisted anywhere.
  useEffect(() => {
    if (openedOnce) return;
    const tick = () => setElapsedMs(Date.now() - mountedAt.current);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [openedOnce]);

  const attention = hintAttention({
    answerState: resolvedAnswerState,
    elapsedMs,
    opened: openedOnce,
    disabled,
    attentionSeconds,
  });

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

  const recordUse = useCallback((level: number) => {
    if (!token || recordedLevels.current.has(level)) return;
    recordedLevels.current.add(level);
    void fetch("/api/exam/hint/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ attempt_id: attemptId, question_id: questionId, level }),
    }).catch(() => { /* recording is best-effort; it must never disturb the paper */ });
  }, [attemptId, questionId, token]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setOpenedOnce(true);
    recordUse(1);
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
        data-attention={attention.attention ? "true" : "false"}
        title={
          attention.attention
            ? "Still stuck? Open your hint — it only guides your thinking, never the answer."
            : "Hints are available at any time. They never change your timer or your answers."
        }
        className={[
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600",
          attention.attention
            ? "hint-attention border-gold-600 bg-gold-100 text-gold-800"
            : "border-gold-500/60 bg-gold-100/70 text-gold-700 hover:bg-gold-100",
        ].join(" ")}
      >
        <Lightbulb className={`h-4 w-4 ${attention.attention ? "text-gold-700" : ""}`} aria-hidden />
        {open ? "Hide hint" : attention.label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {attention.attention ? "Hint available: you have not answered this question yet. Press the hint button for guidance." : ""}
      </span>

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
              <Button variant="outline" className="text-xs" onClick={() => { recordUse(levelIndex + 2); setLevelIndex((index) => index + 1); }}>
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
