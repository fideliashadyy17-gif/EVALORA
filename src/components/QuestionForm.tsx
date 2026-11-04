"use client";

import { RichContentEditor, type UploadResult } from "@/components/editor/RichContentEditor";
import { RichContent } from "@/components/RichContent";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { QUESTION_TYPES } from "@/lib/brand";
import { docIsEmpty, docToLabel, docToPlainText, emptyDoc, textToDoc, type RichDoc } from "@/lib/content";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface QuestionFormOption {
  label: string;
  is_correct: boolean;
  content_doc?: RichDoc | null;
}

export interface QuestionFormValues {
  id?: string;
  organization_id?: string;
  type: string;
  prompt: string;
  prompt_doc?: RichDoc | null;
  explanation?: string;
  explanation_doc?: RichDoc | null;
  points: number;
  difficulty: string;
  topic?: string;
  status: string;
  category_id?: string | null;
  config?: Record<string, unknown>;
  options: QuestionFormOption[];
}

export type QuestionSaveFn = (
  input: QuestionFormValues,
) => Promise<{ ok?: boolean; id?: string; error?: string }>;

interface OptState {
  doc: RichDoc;
  label: string;
  is_correct: boolean;
}

const CHOICE_TYPES = ["single_choice", "multiple_select", "true_false", "poll"];
const LABEL_TYPES = ["short_answer", "ordering"];

/**
 * One unified question authoring form used by the Question Bank (workspace),
 * the Super Admin console, and — through quizzes — live competitions and
 * examinations. Prompt, every choice option and the explanation use the full
 * three-mode mathematical editor; short-answer/ordering keep exact-text
 * fields because their scoring compares canonical strings.
 */
export function QuestionForm({
  initial,
  categories,
  save,
  uploadImage,
  successHref,
  organizationId,
}: {
  initial?: Partial<QuestionFormValues> & { id?: string };
  categories: { id: string; name: string }[];
  save: QuestionSaveFn;
  uploadImage?: (formData: FormData) => Promise<UploadResult>;
  successHref: string;
  organizationId?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<string>(initial?.type ?? "single_choice");
  const [promptDoc, setPromptDoc] = useState<RichDoc>(
    () => initial?.prompt_doc ?? textToDoc(initial?.prompt ?? ""),
  );
  const [explanationDoc, setExplanationDoc] = useState<RichDoc>(
    () => initial?.explanation_doc ?? textToDoc(initial?.explanation ?? ""),
  );
  const [points, setPoints] = useState<number>(initial?.points ?? 1);
  const [difficulty, setDifficulty] = useState<string>(initial?.difficulty ?? "medium");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "draft");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const cfg = (initial?.config ?? {}) as Record<string, unknown>;
  const [numericAnswer, setNumericAnswer] = useState(String(cfg.numeric_answer ?? ""));
  const [tolerance, setTolerance] = useState(String(cfg.tolerance ?? "0"));
  const [mediaUrl, setMediaUrl] = useState(String(cfg.media_url ?? ""));
  const [mediaType, setMediaType] = useState(String(cfg.media_type ?? "image"));
  const [markingCriteria, setMarkingCriteria] = useState(String(cfg.marking_criteria ?? ""));
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>(
    (cfg.pairs as { left: string; right: string }[]) ?? [{ left: "", right: "" }, { left: "", right: "" }],
  );
  const [options, setOptions] = useState<OptState[]>(() =>
    initial?.options?.length
      ? initial.options.map((o) => ({
          doc: o.content_doc ?? textToDoc(o.label),
          label: o.label,
          is_correct: o.is_correct,
        }))
      : [
          { doc: emptyDoc(), label: "", is_correct: true },
          { doc: emptyDoc(), label: "", is_correct: false },
          { doc: emptyDoc(), label: "", is_correct: false },
          { doc: emptyDoc(), label: "", is_correct: false },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = uploadImage
    ? async (file: File): Promise<UploadResult> => {
        const fd = new FormData();
        fd.set("file", file);
        if (organizationId) fd.set("organization_id", organizationId);
        return uploadImage(fd);
      }
    : undefined;

  function setOpt(i: number, patch: Partial<OptState>) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const prompt = docToPlainText(promptDoc);
    if (!prompt && docIsEmpty(promptDoc)) {
      setError("Write the question first.");
      setBusy(false);
      return;
    }
    const config: Record<string, unknown> = {};
    if (mediaUrl.trim()) {
      config.media_url = mediaUrl.trim();
      config.media_type = mediaType;
    }
    if (type === "numeric") {
      config.numeric_answer = parseFloat(numericAnswer);
      config.tolerance = parseFloat(tolerance) || 0;
      if (Number.isNaN(config.numeric_answer as number)) {
        setError("Enter the correct numeric answer.");
        setBusy(false);
        return;
      }
    }
    if (type === "matching") {
      config.pairs = pairs.filter((p) => p.left.trim() && p.right.trim());
      if ((config.pairs as unknown[]).length < 2) {
        setError("Matching questions need at least two complete pairs.");
        setBusy(false);
        return;
      }
    }
    if (type === "open_ended" && markingCriteria.trim()) {
      config.marking_criteria = markingCriteria.trim();
    }

    let finalOptions: QuestionFormOption[] = [];
    if (CHOICE_TYPES.includes(type)) {
      finalOptions = options
        .filter((o) => !docIsEmpty(o.doc))
        .map((o) => ({ label: docToLabel(o.doc), content_doc: o.doc, is_correct: o.is_correct }));
      if (type === "true_false" && finalOptions.length === 0) {
        finalOptions = [
          { label: "True", content_doc: textToDoc("True"), is_correct: true },
          { label: "False", content_doc: textToDoc("False"), is_correct: false },
        ];
      }
      if (type !== "poll" && finalOptions.length > 0 && !finalOptions.some((o) => o.is_correct)) {
        setError("Mark at least one option as correct.");
        setBusy(false);
        return;
      }
      if (type === "poll") finalOptions = finalOptions.map((o) => ({ ...o, is_correct: false }));
    } else if (LABEL_TYPES.includes(type)) {
      finalOptions = options
        .map((o) => ({ label: o.label.trim(), is_correct: type === "short_answer" ? true : false }))
        .filter((o) => o.label.length > 0);
    }

    const res = await save({
      id: initial?.id,
      organization_id: organizationId,
      type,
      prompt: prompt || docToLabel(promptDoc),
      prompt_doc: promptDoc,
      explanation: docToPlainText(explanationDoc),
      explanation_doc: docIsEmpty(explanationDoc) ? null : explanationDoc,
      points,
      difficulty,
      topic,
      status,
      category_id: categoryId || null,
      config,
      options: finalOptions,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push(successHref);
    router.refresh();
  }

  const isChoice = CHOICE_TYPES.includes(type);
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card className="space-y-5 p-6">
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Question type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>

        <Field label="Question" hint="Text / Word mode for prose, Math mode for visual equations, LaTeX mode for source. Content can mix all three.">
          <RichContentEditor
            value={promptDoc}
            onChange={setPromptDoc}
            uploadImage={upload}
            ariaLabel="Question prompt"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Media URL (optional)" hint="External image/audio/video shown with the question — or insert images directly in the editor above.">
            <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Media type">
            <Select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
            </Select>
          </Field>
        </div>

        {type === "numeric" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correct answer">
              <Input type="number" step="any" value={numericAnswer} onChange={(e) => setNumericAnswer(e.target.value)} placeholder="42" />
            </Field>
            <Field label="Tolerance (±)">
              <Input type="number" step="any" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
            </Field>
          </div>
        )}

        {type === "open_ended" && (
          <Field label="Marking criteria (for markers — never shown to candidates before marking)" hint="Working steps and mark allocation for structured mathematical answers.">
            <Textarea rows={3} value={markingCriteria} onChange={(e) => setMarkingCriteria(e.target.value)} placeholder="1 mark: correct substitution… 2 marks: valid method… 1 mark: final answer with units." />
          </Field>
        )}

        {type === "matching" && (
          <div>
            <p className="mb-2 text-sm font-medium text-evergreen-900">Correct pairs (shown shuffled to participants)</p>
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={p.left} onChange={(e) => setPairs((prev) => prev.map((x, idx) => (idx === i ? { ...x, left: e.target.value } : x)))} placeholder="Left item (e.g. $\sin 30^\circ$)" />
                  <span className="text-ink-soft">→</span>
                  <Input value={p.right} onChange={(e) => setPairs((prev) => prev.map((x, idx) => (idx === i ? { ...x, right: e.target.value } : x)))} placeholder="Right match" />
                  <button type="button" className="text-sm text-red-700" onClick={() => setPairs((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setPairs((p) => [...p, { left: "", right: "" }])}>+ Add pair</Button>
          </div>
        )}

        {isChoice && (
          <div>
            <p className="mb-1 text-sm font-medium text-evergreen-900">Answer options — tick the correct one{type === "multiple_select" ? "(s)" : ""}</p>
            <p className="mb-3 text-xs text-ink-soft">Each option has its own editor: text, equations and images are independent per option (image-based options included).</p>
            <div className="space-y-4">
              {options.map((o, i) => (
                <div key={i} className="rounded-xl border border-evergreen-900/10 bg-cream/40 p-3">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-evergreen-700 text-xs font-bold text-white">{letters[i] ?? i + 1}</span>
                    {type !== "poll" && (
                      <label className="flex items-center gap-2 text-sm text-evergreen-900">
                        <input
                          type={type === "multiple_select" ? "checkbox" : "radio"}
                          name="correct"
                          checked={o.is_correct}
                          onChange={(e) => {
                            if (type === "multiple_select") setOpt(i, { is_correct: e.target.checked });
                            else setOptions((prev) => prev.map((x, idx) => ({ ...x, is_correct: idx === i })));
                          }}
                          className="h-5 w-5 accent-evergreen-700"
                        />
                        Correct answer
                      </label>
                    )}
                    <button type="button" className="ml-auto text-sm text-red-700" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>Remove</button>
                  </div>
                  <RichContentEditor
                    value={o.doc}
                    onChange={(doc) => setOpt(i, { doc })}
                    compact
                    uploadImage={upload}
                    ariaLabel={`Option ${letters[i] ?? i + 1}`}
                  />
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setOptions((p) => [...p, { doc: emptyDoc(), label: "", is_correct: false }])}>+ Add option</Button>
          </div>
        )}

        {LABEL_TYPES.includes(type) && (
          <div>
            <p className="mb-2 text-sm font-medium text-evergreen-900">
              {type === "short_answer"
                ? "Accepted answers (exact text; any of these counts as correct)"
                : "Items in the CORRECT order (participants see them shuffled)"}
            </p>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={o.label} onChange={(e) => setOpt(i, { label: e.target.value })} placeholder={`Item ${i + 1}`} />
                  <button type="button" className="text-sm text-red-700" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setOptions((p) => [...p, { doc: emptyDoc(), label: "", is_correct: false }])}>+ Add item</Button>
          </div>
        )}

        <Field label="Worked solution / explanation" hint="Shown after answering (live feedback) and in examination review where enabled. Full mathematical editor available.">
          <RichContentEditor
            value={explanationDoc}
            onChange={setExplanationDoc}
            uploadImage={upload}
            ariaLabel="Explanation"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Points">
            <Input type="number" step="any" min={0} value={points} onChange={(e) => setPoints(parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Difficulty">
            <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
          <Field label="Topic">
            <Input value={topic ?? ""} onChange={(e) => setTopic(e.target.value)} placeholder="Fractions" />
          </Field>
          <Field label="Category">
            <Select value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex gap-3">
          <Button onClick={submit} disabled={busy} variant="gold" className="px-6">
            {busy ? "Saving…" : initial?.id ? "Save changes" : "Save question"}
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </Card>

      <Card className="h-fit p-6 xl:sticky xl:top-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Participant preview</h2>
        <div className="mt-4 rounded-xl border border-evergreen-900/10 bg-cream p-4">
          {mediaUrl && mediaType === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="mb-3 max-h-48 w-full rounded-lg object-cover" />
          )}
          <div className="font-medium text-ink">
            <RichContent doc={docIsEmpty(promptDoc) ? null : promptDoc} text="Your question will appear here…" />
          </div>
          {isChoice && (
            <div className="mt-3 space-y-2">
              {options.filter((o) => !docIsEmpty(o.doc)).map((o, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-evergreen-900/10 bg-white px-3 py-2 text-sm">
                  <span className="font-bold text-evergreen-700">{letters[i]}.</span>
                  <RichContent doc={o.doc} />
                </div>
              ))}
            </div>
          )}
          {LABEL_TYPES.includes(type) && type === "short_answer" && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">Type your answer…</div>
          )}
          {(type === "open_ended") && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">Write your full solution…</div>
          )}
          {type === "numeric" && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">Enter a number…</div>
          )}
          {!docIsEmpty(explanationDoc) && (
            <div className="mt-4 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm">
              <p className="mb-1 font-semibold text-gold-900">Worked solution (after answering)</p>
              <RichContent doc={explanationDoc} />
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-soft">Correctness is never shown in previews or sent to participant devices during live events or examinations.</p>
      </Card>
    </div>
  );
}
