"use client";

import { MathText } from "./MathText";
import { RichContent } from "./RichContent";
import type { RichDoc } from "@/lib/content";
import { Button, Input, Textarea } from "./ui";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export interface PublicQuestion {
  quiz_question_id: string;
  question_id: string;
  type: string;
  prompt: string;
  prompt_doc?: RichDoc | null;
  points: number;
  media_url: string | null;
  media_type: string | null;
  options: { id: string; label: string; content_doc?: RichDoc | null }[];
  matching_lefts?: string[];
  matching_rights?: string[];
  reveal?: {
    correct_option_ids: string[];
    accepted_answers: string[];
    numeric_answer: number | null;
    tolerance: number | null;
    correct_order: string[];
    matching_pairs: { left: string; right: string }[];
    summary: string[];
  } | null;
  explanation?: string | null;
  explanation_doc?: RichDoc | null;
}

/**
 * Interactive renderer for every question type. Emits the answer
 * payload consumed by the server scoring engine. `onAnswer` is called
 * immediately for tap-to-answer types, and via the submit button for
 * composite types. `initial` restores a previously saved answer (exams).
 */
export function QuestionRunner({
  question,
  onAnswer,
  onDirtyChange,
  onDraft,
  disabled: initiallyDisabled = false,
  initial,
  submitLabel = "Submit answer",
  markings,
}: {
  question: PublicQuestion;
  onAnswer: (payload: Record<string, unknown>) => void | boolean | Promise<void | boolean>;
  /** Optional exam-only signal: changes have not yet been handed to onAnswer. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Optional exam-only local/server autosave of a draft after each edit. */
  onDraft?: (payload: Record<string, unknown>) => void | boolean;
  disabled?: boolean;
  initial?: Record<string, unknown> | null;
  submitLabel?: string;
  /** Post-submission marking: option id → "correct" | "wrong". */
  markings?: Record<string, "correct" | "wrong">;
}) {
  /** Marked options win over the neutral/selected styling after submission. */
  const optionClass = (id: string, idle: string, picked: string) => {
    const mark = markings?.[id];
    if (mark === "correct") return "border-evergreen-600 bg-evergreen-50 text-evergreen-950";
    if (mark === "wrong") return "border-red-400 bg-red-50 text-red-900";
    return selected.includes(id) ? picked : idle;
  };
  const optionMark = (id: string) => markings?.[id];

  const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
  const isPairs = (value: unknown): value is { left: string; right: string }[] => Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof item.left === "string" && typeof item.right === "string") && new Set(value.map((item) => item.left)).size === value.length;
  const selectedFromSaved = () => isStringArray(initial?.option_ids) ? initial.option_ids : typeof initial?.option_id === "string" ? [initial.option_id] : [];
  const orderFromSaved = () => isStringArray(initial?.order) ? initial.order : question.options.map((o) => o.label);
  const pairsFromSaved = () => Object.fromEntries((isPairs(initial?.pairs) ? initial.pairs : []).map((pair) => [pair.left, pair.right]));
  // Do not silently replace malformed persisted data with a blank answer. The
  // candidate can continue to other questions, but must ask for help before
  // overwriting this one. Validate only the fields used by this question type.
  const present = (value: unknown) => value !== null && value !== undefined;
  const t = question.type;
  const invalidSavedAnswer = present(initial) && (
    typeof initial !== "object" || Array.isArray(initial) ||
    ((t === "single_choice" || t === "true_false" || t === "poll") && present(initial?.option_id) && typeof initial?.option_id !== "string") ||
    (t === "multiple_select" && present(initial?.option_ids) && !isStringArray(initial?.option_ids)) ||
    (t === "ordering" && present(initial?.order) && !isStringArray(initial?.order)) ||
    (t === "matching" && present(initial?.pairs) && !isPairs(initial?.pairs)) ||
    ((t === "short_answer" || t === "open_ended") && present(initial?.text) && typeof initial?.text !== "string") ||
    (t === "numeric" && present(initial?.value) && (typeof initial?.value !== "string" && typeof initial?.value !== "number" || String(initial.value).trim() !== "" && !Number.isFinite(Number(initial.value))))
  );
  const disabled = initiallyDisabled || invalidSavedAnswer;
  const [selected, setSelected] = useState<string[]>(selectedFromSaved);
  const [text, setText] = useState(typeof initial?.text === "string" ? initial.text : "");
  const [num, setNum] = useState(typeof initial?.value === "string" || typeof initial?.value === "number" ? String(initial.value) : "");
  const [order, setOrder] = useState<string[]>(orderFromSaved);
  const [pairs, setPairs] = useState<Record<string, string>>(pairsFromSaved);

  useEffect(() => {
    setSelected(selectedFromSaved());
    setText(typeof initial?.text === "string" ? initial.text : "");
    setNum(typeof initial?.value === "string" || typeof initial?.value === "number" ? String(initial.value) : "");
    setOrder(orderFromSaved());
    setPairs(pairsFromSaved());
  }, [question.quiz_question_id, question.question_id]); // reset per question

  const editRevision = useRef(0);
  useEffect(() => () => { editRevision.current += 1; }, []);

  function changed(payload?: Record<string, unknown>) {
    editRevision.current += 1;
    const revision = editRevision.current;
    onDirtyChange?.(true);
    if (payload && onDraft) {
      try {
        const accepted = onDraft(payload);
        if (accepted !== false && revision === editRevision.current) onDirtyChange?.(false);
      } catch {
        // Preserve the unsaved warning if local queueing fails.
      }
    }
  }
  function emit(payload: Record<string, unknown>) {
    // Leave existing live-session callback behavior unchanged when draft
    // tracking is not requested.
    if (!onDirtyChange) { void onAnswer(payload); return; }
    const revision = editRevision.current;
    try {
      const result = onAnswer(payload);
      if (result instanceof Promise) {
        void result.then((accepted) => { if (accepted !== false && revision === editRevision.current) onDirtyChange?.(false); }).catch(() => {});
      } else if (result !== false) onDirtyChange?.(false);
    } catch {
      // Keep the draft marked unsaved when the consumer rejects it.
    }
  }

  return (
    <div>
      {invalidSavedAnswer && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Your saved answer for this question could not be displayed safely. It has not been changed. Please contact the organizer before answering this question again.</p>}
      {question.media_url && question.media_type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={question.media_url} alt="" className="mb-4 max-h-72 w-full rounded-xl object-contain" />
      )}
      {question.media_url && question.media_type === "audio" && (
        <audio controls src={question.media_url} className="mb-4 w-full" />
      )}
      {question.media_url && question.media_type === "video" && (
        <video controls src={question.media_url} className="mb-4 max-h-80 w-full rounded-xl" />
      )}

      <div className="text-lg font-medium leading-relaxed text-ink sm:text-xl">
        <RichContent doc={question.prompt_doc ?? null} text={question.prompt} />
      </div>

      <div className="mt-5">
        {(t === "single_choice" || t === "true_false" || t === "poll") && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {question.options.map((o, i) => (
              <button
                key={o.id}
                disabled={disabled}
                onClick={() => { changed({ option_id: o.id }); setSelected([o.id]); emit({ option_id: o.id }); }}
                className={cn(
                  "flex min-h-14 items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left font-medium transition disabled:opacity-60",
                  optionClass(o.id, "border-evergreen-900/25 bg-white hover:border-evergreen-600/60 hover:bg-evergreen-50", "border-evergreen-700 bg-evergreen-700 text-white shadow"),
                )}
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold", selected.includes(o.id) ? "bg-white text-evergreen-800" : "bg-gold-400 text-evergreen-950")}>{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 flex-1"><RichContent doc={o.content_doc ?? null} text={o.label} /></span>
                {optionMark(o.id) === "correct" && (
                  <span aria-label="Correct answer" title="Correct answer" className="mt-0.5 shrink-0 font-bold text-evergreen-700">✓</span>
                )}
                {optionMark(o.id) === "wrong" && (
                  <span aria-label="Your answer, incorrect" title="Your answer, incorrect" className="mt-0.5 shrink-0 font-bold text-red-600">✗</span>
                )}
              </button>
            ))}
          </div>
        )}

        {t === "multiple_select" && (
          <div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {question.options.map((o, i) => (
                <button
                  key={o.id}
                  disabled={disabled}
                  onClick={() => {
                    const next = selected.includes(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id];
                    changed({ option_ids: next });
                    setSelected(next);
                  }}
                  className={cn(
                    "flex min-h-14 items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left font-medium transition disabled:opacity-60",
                    optionClass(o.id, "border-evergreen-900/25 bg-white hover:border-evergreen-600/60", "border-evergreen-700 bg-evergreen-100 text-evergreen-950"),
                  )}
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold", selected.includes(o.id) ? "bg-evergreen-700 text-white" : "bg-gold-400 text-evergreen-950")}>{String.fromCharCode(65 + i)}</span>
                  <span className="min-w-0 flex-1"><RichContent doc={o.content_doc ?? null} text={o.label} /></span>
                {optionMark(o.id) === "correct" && (
                  <span aria-label="Correct answer" title="Correct answer" className="mt-0.5 shrink-0 font-bold text-evergreen-700">✓</span>
                )}
                {optionMark(o.id) === "wrong" && (
                  <span aria-label="Your answer, incorrect" title="Your answer, incorrect" className="mt-0.5 shrink-0 font-bold text-red-600">✗</span>
                )}
                </button>
              ))}
            </div>
            <Button className="mt-4" disabled={disabled || selected.length === 0} onClick={() => emit({ option_ids: selected })}>
              {submitLabel}
            </Button>
          </div>
        )}

        {t === "short_answer" && (
          <div className="flex gap-2">
            <Input value={text} disabled={disabled} onChange={(e) => { const value = e.target.value; changed({ text: value }); setText(value); }} placeholder="Type your answer…" onKeyDown={(e) => e.key === "Enter" && text.trim() && emit({ text })} />
            <Button disabled={disabled || !text.trim()} onClick={() => emit({ text })}>{submitLabel}</Button>
          </div>
        )}

        {t === "numeric" && (
          <div className="flex gap-2">
            <Input type="number" step="any" value={num} disabled={disabled} onChange={(e) => { const value = e.target.value; changed({ value }); setNum(value); }} placeholder="Enter a number…" onKeyDown={(e) => e.key === "Enter" && num.trim() && emit({ value: parseFloat(num) })} />
            <Button disabled={disabled || !num.trim()} onClick={() => emit({ value: parseFloat(num) })}>{submitLabel}</Button>
          </div>
        )}

        {t === "ordering" && (
          <div>
            <p className="mb-2 text-sm text-ink-soft">Use the arrows to put the items in the correct order.</p>
            <ol className="space-y-2">
              {order.map((label, i) => (
                <li key={`${label}-${i}`} className="flex items-center gap-2 rounded-xl border border-evergreen-900/25 bg-white px-4 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-evergreen-100 text-xs font-bold text-evergreen-800">{i + 1}</span>
                  <span className="flex-1 font-medium"><MathText text={label} /></span>
                  <button disabled={disabled || i === 0} className="rounded px-2 py-1 text-ink-soft hover:bg-cream disabled:opacity-30" onClick={() => { const next = [...order]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; changed({ order: next }); setOrder(next); }}>↑</button>
                  <button disabled={disabled || i === order.length - 1} className="rounded px-2 py-1 text-ink-soft hover:bg-cream disabled:opacity-30" onClick={() => { const next = [...order]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; changed({ order: next }); setOrder(next); }}>↓</button>
                </li>
              ))}
            </ol>
            <Button className="mt-4" disabled={disabled} onClick={() => emit({ order })}>{submitLabel}</Button>
          </div>
        )}

        {t === "matching" && (
          <div>
            <div className="space-y-2">
              {(question.matching_lefts ?? []).map((left) => (
                <div key={left} className="flex flex-wrap items-center gap-2 rounded-xl border border-evergreen-900/25 bg-white px-4 py-3">
                  <span className="min-w-32 flex-1 font-medium"><MathText text={left} /></span>
                  <span className="text-ink-soft">→</span>
                  <select
                    disabled={disabled}
                    value={pairs[left] ?? ""}
                    onChange={(e) => { const next = { ...pairs, [left]: e.target.value }; changed({ pairs: Object.entries(next).filter(([, value]) => value).map(([key, value]) => ({ left: key, right: value })) }); setPairs(next); }}
                    className="rounded-lg border border-evergreen-900/25 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Choose a match…</option>
                    {(question.matching_rights ?? []).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <Button
              className="mt-4"
              disabled={disabled || Object.values(pairs).filter(Boolean).length === 0}
              onClick={() => emit({ pairs: Object.entries(pairs).filter(([, v]) => v).map(([left, right]) => ({ left, right })) })}
            >
              {submitLabel}
            </Button>
          </div>
        )}

        {t === "open_ended" && (
          <div>
            <Textarea rows={6} value={text} disabled={disabled} onChange={(e) => { const value = e.target.value; changed({ text: value }); setText(value); }} placeholder="Write your answer…" />
            <Button className="mt-3" disabled={disabled || !text.trim()} onClick={() => emit({ text })}>{submitLabel}</Button>
          </div>
        )}

        {t === "slide" && (
          <Button disabled={disabled} onClick={() => emit({ acknowledged: true })}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
