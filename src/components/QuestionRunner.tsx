"use client";

import { MathText } from "./MathText";
import { RichContent } from "./RichContent";
import type { RichDoc } from "@/lib/content";
import { Button, Input } from "./ui";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { bankChips, moveItem, normaliseMatchMode, placeChip, removeChip, toPairs } from "@/lib/matchDnd";
import { responseWorkspaceFor, type ResponseWorkspace } from "@/lib/responseTools";
import type { PublicAssessPart } from "@/lib/assessParts";
import { StructuredResponseEditor } from "@/components/response/StructuredResponseEditor";

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
  /** "match": one choice per row. "sort": tiles dropped into categories. */
  match_mode?: "match" | "sort";
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
  /**
   * Candidate-safe composition description computed on the server. It never
   * carries an answer key; it only names the tools this question needs.
   */
  response_workspace?: ResponseWorkspace | null;
  /** Assess Prep typed parts (keys never included) + curriculum metadata. */
  assess_parts?: PublicAssessPart[] | null;
  topic?: string | null;
  criterion?: string | null;
  strand?: string | null;
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
  disabled: initiallyDisabled = false,
  initial,
  submitLabel = "Submit answer",
  markings,
  autosave = false,
  onHintUse,
}: {
  question: PublicQuestion;
  onAnswer: (payload: Record<string, unknown>) => void | boolean | Promise<void | boolean>;
  /** Optional exam-only signal: changes have not yet been handed to onAnswer. */
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
  initial?: Record<string, unknown> | null;
  submitLabel?: string;
  /** Post-submission marking: option id → "correct" | "wrong". */
  markings?: Record<string, "correct" | "wrong">;
  /** Enable the durable autosave loop (examinations only). */
  autosave?: boolean;
  /** Records that a per-part hint was opened at a level (examinations only). */
  onHintUse?: (partId: string, level: number) => void;
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
    (t === "open_ended" && present(initial?.doc) && (typeof initial?.doc !== "object" || (initial?.doc as { type?: unknown })?.type !== "doc")) ||
    (t === "open_ended" && present(initial?.graph) && (typeof initial?.graph !== "object" || Array.isArray(initial?.graph))) ||
    (t === "open_ended" && present(initial?.geometry) && (typeof initial?.geometry !== "object" || Array.isArray(initial?.geometry))) ||
    (t === "numeric" && present(initial?.value) && (typeof initial?.value !== "string" && typeof initial?.value !== "number" || String(initial.value).trim() === "" || !Number.isFinite(Number(initial.value))))
  );
  const disabled = initiallyDisabled || invalidSavedAnswer;
  const [selected, setSelected] = useState<string[]>(selectedFromSaved);
  const [text, setText] = useState(typeof initial?.text === "string" ? initial.text : "");
  const [num, setNum] = useState(typeof initial?.value === "string" || typeof initial?.value === "number" ? String(initial.value) : "");
  const [order, setOrder] = useState<string[]>(orderFromSaved);
  const [pairs, setPairs] = useState<Record<string, string>>(pairsFromSaved);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const savedParts = (initial && typeof initial === "object" && (initial as { parts?: unknown }).parts && typeof (initial as { parts?: unknown }).parts === "object")
    ? ((initial as { parts: Record<string, unknown> }).parts) : {};
  const [partValues, setPartValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(savedParts).map(([k, v]) => [k, typeof v === "string" || typeof v === "number" ? String(v) : ""])));
  const [openPartHints, setOpenPartHints] = useState<Record<string, number>>({});
  const savedWorking = (initial && typeof initial === "object" && (initial as { working?: unknown }).working
    && typeof (initial as { working?: unknown }).working === "object" && !Array.isArray((initial as { working?: unknown }).working))
    ? ((initial as { working: Record<string, unknown> }).working) : {};
  const [workingParts, setWorkingParts] = useState<Record<string, unknown>>(savedWorking);
  const [openWorking, setOpenWorking] = useState<Record<string, boolean>>({});
  // A part's *typed answer* is what is marked. Working is an optional, separately
  // stored composition surface for questions that ask the candidate to show a
  // method — it is preserved for the marker and never changes a mark.
  const workingWorkspace = useMemo(
    () => (t === "assess_parts" && question.response_workspace && question.response_workspace.tools.length
      ? question.response_workspace
      : null),
    [t, question.response_workspace],
  );
  const hasWorkingWorkspace = Boolean(workingWorkspace);

  useEffect(() => {
    setSelected(selectedFromSaved());
    setText(typeof initial?.text === "string" ? initial.text : "");
    setNum(typeof initial?.value === "string" || typeof initial?.value === "number" ? String(initial.value) : "");
    setOrder(orderFromSaved());
    setPairs(pairsFromSaved());
    setSelectedChip(null);
    setPartValues(Object.fromEntries(Object.entries(
      (initial && typeof initial === "object" && (initial as { parts?: Record<string, unknown> }).parts) || {},
    ).map(([k, v]) => [k, typeof v === "string" || typeof v === "number" ? String(v) : ""])));
    setOpenPartHints({});
    setWorkingParts(
      (initial && typeof initial === "object" && (initial as { working?: Record<string, unknown> }).working) || {},
    );
    setOpenWorking({});
  }, [question.quiz_question_id, question.question_id]); // reset per question

  const editRevision = useRef(0);
  useEffect(() => () => { editRevision.current += 1; }, []);

  function changed() { editRevision.current += 1; onDirtyChange?.(true); }
  // The structured response editor reports dirtiness itself *and* saves through
  // emit(), which also clears the draft flag. Notify the parent of "clean" only
  // once so a save does not produce duplicate state updates.
  const structuredDirty = useRef(false);
  function emit(payload: Record<string, unknown>): boolean | void {
    // Leave existing live-session callback behavior unchanged when draft
    // tracking is not requested.
    if (!onDirtyChange) { void onAnswer(payload); return; }
    const revision = editRevision.current;
    try {
      const result = onAnswer(payload);
      if (result instanceof Promise) {
        void result.then((accepted) => { if (accepted !== false && revision === editRevision.current) onDirtyChange?.(false); }).catch(() => {});
        return true;
      }
      if (result === false) return false;
      onDirtyChange?.(false);
      return true;
    } catch {
      // Keep the draft marked unsaved when the consumer rejects it.
      return false;
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
                onClick={() => { changed(); setSelected([o.id]); emit({ option_id: o.id }); }}
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
                    changed();
                    setSelected((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]));
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
            <Input value={text} disabled={disabled} onChange={(e) => { changed(); setText(e.target.value); }} placeholder="Type your answer…" onKeyDown={(e) => e.key === "Enter" && text.trim() && emit({ text })} />
            <Button disabled={disabled || !text.trim()} onClick={() => emit({ text })}>{submitLabel}</Button>
          </div>
        )}

        {t === "numeric" && (
          <div className="flex gap-2">
            <Input type="number" step="any" value={num} disabled={disabled} onChange={(e) => { changed(); setNum(e.target.value); }} placeholder="Enter a number…" onKeyDown={(e) => e.key === "Enter" && num.trim() && emit({ value: parseFloat(num) })} />
            <Button disabled={disabled || !num.trim()} onClick={() => emit({ value: parseFloat(num) })}>{submitLabel}</Button>
          </div>
        )}

        {t === "ordering" && (
          <div>
            <p className="mb-2 text-sm text-ink-soft">Drag each item onto the position where it belongs, or use the arrows.</p>
            <ol className="space-y-2">
              {order.map((label, i) => (
                <li
                  key={`${label}-${i}`}
                  draggable={!disabled}
                  onDragStart={(e) => { if (disabled) return; e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (disabled) return;
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (!Number.isInteger(from) || from === i) return;
                    changed();
                    setOrder((p) => moveItem(p, from, i));
                  }}
                  className={cn("flex items-center gap-2 rounded-xl border border-evergreen-900/25 bg-white px-4 py-3", !disabled && "cursor-grab active:cursor-grabbing")}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-evergreen-100 text-xs font-bold text-evergreen-800">{i + 1}</span>
                  <span className="flex-1 font-medium"><MathText text={label} /></span>
                  <button aria-label={`Move ${label} up`} disabled={disabled || i === 0} className="rounded px-2 py-1 text-ink-soft hover:bg-cream disabled:opacity-30" onClick={() => { changed(); setOrder((p) => moveItem(p, i, i - 1)); }}>↑</button>
                  <button aria-label={`Move ${label} down`} disabled={disabled || i === order.length - 1} className="rounded px-2 py-1 text-ink-soft hover:bg-cream disabled:opacity-30" onClick={() => { changed(); setOrder((p) => moveItem(p, i, i + 1)); }}>↓</button>
                </li>
              ))}
            </ol>
            <Button className="mt-4" disabled={disabled} onClick={() => emit({ order })}>{submitLabel}</Button>
          </div>
        )}

        {t === "matching" && (() => {
          const mode = normaliseMatchMode(question.match_mode);
          const chips = mode === "sort" ? (question.matching_lefts ?? []) : (question.matching_rights ?? []);
          const zones = mode === "sort" ? (question.matching_rights ?? []) : (question.matching_lefts ?? []);
          const bank = bankChips(pairs, mode, chips);
          const placedIn = (zone: string) => mode === "sort"
            ? Object.keys(pairs).filter((key) => pairs[key] === zone)
            : (pairs[zone] ? [pairs[zone]] : []);
          const chipClass = (active: boolean) => cn(
            "select-none rounded-lg border px-3 py-2 text-sm font-medium",
            !disabled && "cursor-grab active:cursor-grabbing",
            active ? "border-evergreen-700 bg-evergreen-100 ring-2 ring-evergreen-600" : "border-evergreen-900/25 bg-white",
          );
          const dropOn = (zone: string) => (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            if (disabled) return;
            const chip = e.dataTransfer.getData("text/plain");
            if (!chip) return;
            changed();
            setPairs((p) => placeChip(p, mode, chip, zone));
            setSelectedChip(null);
          };
          return (
            <div>
              <p className="mb-2 text-sm text-ink-soft">
                {mode === "sort"
                  ? "Drag each tile into its group. Touch: tap a tile, then tap a group."
                  : "Drag each choice onto its row, using each choice once. Touch: tap a choice, then tap a row."}
              </p>
              <div
                aria-label="Tiles and choices still to place"
                onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (disabled) return;
                  const chip = e.dataTransfer.getData("text/plain");
                  if (!chip) return;
                  changed();
                  setPairs((p) => removeChip(p, mode, chip));
                }}
                className="mb-4 flex min-h-14 flex-wrap gap-2 rounded-xl border border-dashed border-evergreen-900/30 bg-cream/50 p-3"
              >
                {bank.map((chip) => (
                  <button
                    type="button"
                    key={chip}
                    disabled={disabled}
                    draggable={!disabled}
                    aria-pressed={selectedChip === chip}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", chip); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => setSelectedChip((c) => (c === chip ? null : chip))}
                    className={chipClass(selectedChip === chip)}
                  >
                    <MathText text={chip} />
                  </button>
                ))}
                {bank.length === 0 && <span className="text-sm text-ink-soft">Everything is placed. Drag a tile here to take it back.</span>}
              </div>
              <div className="space-y-2">
                {zones.map((zone) => {
                  const items = placedIn(zone);
                  return (
                    <div
                      key={zone}
                      role="group"
                      aria-label={mode === "sort" ? `Group ${zone}` : `Row ${zone}`}
                      onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
                      onDrop={dropOn(zone)}
                      onClick={() => {
                        if (disabled || !selectedChip) return;
                        changed();
                        setPairs((p) => placeChip(p, mode, selectedChip, zone));
                        setSelectedChip(null);
                      }}
                      className={cn(
                        "flex min-h-12 flex-wrap items-center gap-2 rounded-xl border bg-white px-4 py-3",
                        selectedChip && !disabled ? "border-evergreen-700" : "border-evergreen-900/25",
                      )}
                    >
                      <span className="min-w-32 flex-1 font-medium"><MathText text={zone} /></span>
                      {mode === "sort" ? (
                        items.map((chip) => (
                          <span key={chip} draggable={!disabled} onDragStart={(e) => { e.dataTransfer.setData("text/plain", chip); }} className={cn("inline-flex items-center gap-1 rounded-lg border border-evergreen-900/25 bg-evergreen-50 px-2 py-1 text-sm", !disabled && "cursor-grab")}>
                            <MathText text={chip} />
                            {!disabled && <button type="button" aria-label={`Remove ${chip}`} className="rounded px-1 text-ink-soft hover:bg-white" onClick={(e) => { e.stopPropagation(); changed(); setPairs((p) => removeChip(p, mode, chip)); }}>×</button>}
                          </span>
                        ))
                      ) : items.length ? (
                        items.map((chip) => (
                          <span key={chip} draggable={!disabled} onDragStart={(e) => { e.dataTransfer.setData("text/plain", chip); }} className={cn("inline-flex items-center gap-1 rounded-lg border border-evergreen-900/25 bg-evergreen-50 px-2 py-1 text-sm", !disabled && "cursor-grab")}>
                            <MathText text={chip} />
                            {!disabled && <button type="button" aria-label={`Remove ${chip}`} className="rounded px-1 text-ink-soft hover:bg-white" onClick={(e) => { e.stopPropagation(); changed(); setPairs((p) => removeChip(p, mode, chip)); }}>×</button>}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-ink-soft">Drop a choice here</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <Button
                className="mt-4"
                disabled={disabled || Object.values(pairs).filter(Boolean).length === 0}
                onClick={() => emit({ pairs: toPairs(pairs) })}
              >
                {submitLabel}
              </Button>
            </div>
          );
        })()}

        {t === "assess_parts" && (
          <div className="space-y-4">
            {(question.assess_parts ?? []).map((part) => {
              const shownHints = openPartHints[part.id] ?? 0;
              return (
                <div key={part.id} className="rounded-xl border border-evergreen-900/20 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-evergreen-700 px-1.5 text-sm font-bold text-white">{part.label}</span>
                    {part.prompt ? <span className="min-w-0 flex-1 font-medium"><MathText text={part.prompt} /></span> : <span className="flex-1" />}
                    {part.strand ? <span className="rounded-md bg-evergreen-700/10 px-2 py-0.5 text-[11px] font-bold text-evergreen-900">Criterion {part.strand}</span> : null}
                    <span className="text-xs font-semibold text-ink-soft">{part.points} mark{part.points === 1 ? "" : "s"}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-expanded={shownHints > 0}
                      onClick={() => {
                        if (shownHints === 0) { setOpenPartHints((h) => ({ ...h, [part.id]: 1 })); onHintUse?.(part.id, 1); }
                        else setOpenPartHints((h) => ({ ...h, [part.id]: 0 }));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gold-500/60 bg-gold-100/70 px-3 py-1.5 text-sm font-semibold text-gold-700 hover:bg-gold-100 disabled:opacity-50"
                    >
                      💡 Hint
                    </button>
                  </div>
                  {hasWorkingWorkspace && !disabled ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        aria-expanded={Boolean(openWorking[part.id])}
                        onClick={() => setOpenWorking((w) => ({ ...w, [part.id]: !w[part.id] }))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-evergreen-900/20 bg-cream px-3 py-1.5 text-xs font-semibold text-evergreen-900 hover:bg-white"
                      >
                        ✎ {openWorking[part.id] ? "Hide working" : "Show your working"}
                        {workingParts[part.id] ? " · saved" : ""}
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      value={partValues[part.id] ?? ""}
                      disabled={disabled}
                      inputMode={part.kind === "numeric" ? "decimal" : "text"}
                      placeholder={part.placeholder ?? (part.kind === "expression" ? "Type your answer (use ^ for powers, e.g. n^2)" : "Type your answer…")}
                      aria-label={`Answer for part ${part.label}`}
                      onChange={(e) => { changed(); setPartValues((v) => ({ ...v, [part.id]: e.target.value })); }}
                      onKeyDown={(e) => { if (e.key === "Enter") emit({ parts: partValues }); }}
                    />
                    {part.unit ? <span className="shrink-0 text-sm font-medium text-ink-soft">{part.unit}</span> : null}
                  </div>
                  {workingWorkspace && openWorking[part.id] ? (
                    <div className="mt-3 rounded-xl border border-evergreen-900/15 bg-cream/60 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                        Working for part {part.label} — {workingWorkspace.guidance || "show each step so your reasoning can be credited"}
                      </p>
                      <StructuredResponseEditor
                        workspace={workingWorkspace}
                        initial={(workingParts[part.id] as Record<string, unknown>) ?? null}
                        disabled={disabled}
                        autosave={autosave}
                        submitLabel="Save working"
                        emit={(payload) => emit({ parts: partValues, working: { ...workingParts, [part.id]: payload } })}
                      />
                    </div>
                  ) : null}
                  {shownHints > 0 && (
                    <div className="mt-3 rounded-lg border border-gold-500/50 bg-gold-100/50 p-3 text-sm" role="region" aria-label={`Hint for part ${part.label}`}>
                      <p className="font-semibold text-evergreen-950">Hint {shownHints} of 2 — {shownHints === 1 ? "a nudge" : "the first step"}</p>
                      <p className="mt-1 leading-relaxed">{part.hints[shownHints - 1]}</p>
                      {shownHints < 2 ? (
                        <button type="button" className="mt-2 text-xs font-semibold text-evergreen-800 underline underline-offset-2"
                          onClick={() => { setOpenPartHints((h) => ({ ...h, [part.id]: 2 })); onHintUse?.(part.id, 2); }}>
                          Still stuck? See hint 2
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            <Button disabled={disabled || !(question.assess_parts ?? []).some((p) => (partValues[p.id] ?? "").trim())}
              onClick={() => emit(hasWorkingWorkspace ? { parts: partValues, working: workingParts } : { parts: partValues })}>
              {submitLabel}
            </Button>
          </div>
        )}

        {t === "open_ended" && (
          <StructuredResponseEditor
            workspace={question.response_workspace ?? responseWorkspaceFor(question)}
            initial={initial ?? null}
            disabled={disabled}
            autosave={autosave}
            submitLabel={submitLabel}
            emit={(payload) => {
              const accepted = emit(payload);
              if (accepted !== false) structuredDirty.current = false;
              return accepted;
            }}
            onDirtyChange={(dirty) => {
              if (dirty) { structuredDirty.current = true; changed(); return; }
              if (structuredDirty.current) { structuredDirty.current = false; onDirtyChange?.(false); }
            }}
          />
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
