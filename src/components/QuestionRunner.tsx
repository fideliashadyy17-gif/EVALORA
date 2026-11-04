"use client";

import { MathText } from "./MathText";
import { RichContent } from "./RichContent";
import type { RichDoc } from "@/lib/content";
import { Button, Input, Textarea } from "./ui";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

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
  disabled = false,
  initial,
  submitLabel = "Submit answer",
}: {
  question: PublicQuestion;
  onAnswer: (payload: Record<string, unknown>) => void | Promise<void>;
  disabled?: boolean;
  initial?: Record<string, unknown> | null;
  submitLabel?: string;
}) {
  const [selected, setSelected] = useState<string[]>(
    ((initial?.option_ids as string[]) ?? (initial?.option_id ? [initial.option_id as string] : [])),
  );
  const [text, setText] = useState(String(initial?.text ?? ""));
  const [num, setNum] = useState(String(initial?.value ?? ""));
  const [order, setOrder] = useState<string[]>(
    ((initial?.order as string[]) ?? question.options.map((o) => o.label)),
  );
  const [pairs, setPairs] = useState<Record<string, string>>(() => {
    const init = (initial?.pairs as { left: string; right: string }[]) ?? [];
    return Object.fromEntries(init.map((p) => [p.left, p.right]));
  });

  useEffect(() => {
    setSelected((initial?.option_ids as string[]) ?? (initial?.option_id ? [initial.option_id as string] : []));
    setText(String(initial?.text ?? ""));
    setNum(String(initial?.value ?? ""));
    setOrder((initial?.order as string[]) ?? question.options.map((o) => o.label));
    const init = (initial?.pairs as { left: string; right: string }[]) ?? [];
    setPairs(Object.fromEntries(init.map((p) => [p.left, p.right])));
  }, [question.quiz_question_id, question.question_id]); // reset per question

  const t = question.type;

  return (
    <div>
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
                onClick={() => { setSelected([o.id]); onAnswer({ option_id: o.id }); }}
                className={cn(
                  "flex min-h-14 items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left font-medium transition disabled:opacity-60",
                  selected.includes(o.id)
                    ? "border-evergreen-700 bg-evergreen-700 text-white shadow"
                    : "border-evergreen-900/25 bg-white hover:border-evergreen-600/60 hover:bg-evergreen-50",
                )}
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold", selected.includes(o.id) ? "bg-white text-evergreen-800" : "bg-gold-400 text-evergreen-950")}>{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 flex-1"><RichContent doc={o.content_doc ?? null} text={o.label} /></span>
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
                  onClick={() =>
                    setSelected((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]))
                  }
                  className={cn(
                    "flex min-h-14 items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left font-medium transition disabled:opacity-60",
                    selected.includes(o.id)
                      ? "border-evergreen-700 bg-evergreen-100 text-evergreen-950"
                      : "border-evergreen-900/25 bg-white hover:border-evergreen-600/60",
                  )}
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold", selected.includes(o.id) ? "bg-evergreen-700 text-white" : "bg-gold-400 text-evergreen-950")}>{String.fromCharCode(65 + i)}</span>
                  <span className="min-w-0 flex-1"><RichContent doc={o.content_doc ?? null} text={o.label} /></span>
                </button>
              ))}
            </div>
            <Button className="mt-4" disabled={disabled || selected.length === 0} onClick={() => onAnswer({ option_ids: selected })}>
              {submitLabel}
            </Button>
          </div>
        )}

        {t === "short_answer" && (
          <div className="flex gap-2">
            <Input value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" onKeyDown={(e) => e.key === "Enter" && text.trim() && onAnswer({ text })} />
            <Button disabled={disabled || !text.trim()} onClick={() => onAnswer({ text })}>{submitLabel}</Button>
          </div>
        )}

        {t === "numeric" && (
          <div className="flex gap-2">
            <Input type="number" step="any" value={num} disabled={disabled} onChange={(e) => setNum(e.target.value)} placeholder="Enter a number…" onKeyDown={(e) => e.key === "Enter" && num.trim() && onAnswer({ value: parseFloat(num) })} />
            <Button disabled={disabled || !num.trim()} onClick={() => onAnswer({ value: parseFloat(num) })}>{submitLabel}</Button>
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
                  <button disabled={disabled || i === 0} className="rounded px-2 py-1 text-ink-soft hover:bg-cream disabled:opacity-30" onClick={() => setOrder((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>↑</button>
                  <button disabled={disabled || i === order.length - 1} className="rounded px-2 py-1 text-ink-soft hover:bg-cream disabled:opacity-30" onClick={() => setOrder((p) => { const n = [...p]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>↓</button>
                </li>
              ))}
            </ol>
            <Button className="mt-4" disabled={disabled} onClick={() => onAnswer({ order })}>{submitLabel}</Button>
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
                    onChange={(e) => setPairs((p) => ({ ...p, [left]: e.target.value }))}
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
              onClick={() => onAnswer({ pairs: Object.entries(pairs).filter(([, v]) => v).map(([left, right]) => ({ left, right })) })}
            >
              {submitLabel}
            </Button>
          </div>
        )}

        {t === "open_ended" && (
          <div>
            <Textarea rows={6} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} placeholder="Write your answer…" />
            <Button className="mt-3" disabled={disabled || !text.trim()} onClick={() => onAnswer({ text })}>{submitLabel}</Button>
          </div>
        )}

        {t === "slide" && (
          <Button disabled={disabled} onClick={() => onAnswer({ acknowledged: true })}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
