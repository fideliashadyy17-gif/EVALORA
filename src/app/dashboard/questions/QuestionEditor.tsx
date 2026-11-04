"use client";

import { MathText } from "@/components/MathText";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { QUESTION_TYPES } from "@/lib/brand";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveQuestion, type QuestionInput } from "./actions";

interface Opt { label: string; is_correct: boolean }

export function QuestionEditor({
  initial,
  categories,
}: {
  initial?: Partial<QuestionInput> & { id?: string };
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [type, setType] = useState<string>(initial?.type ?? "single_choice");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
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
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>(
    (cfg.pairs as { left: string; right: string }[]) ?? [{ left: "", right: "" }, { left: "", right: "" }],
  );
  const [options, setOptions] = useState<Opt[]>(
    initial?.options?.length
      ? initial.options.map((o) => ({ label: o.label, is_correct: o.is_correct }))
      : [
          { label: "", is_correct: true },
          { label: "", is_correct: false },
          { label: "", is_correct: false },
          { label: "", is_correct: false },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usesOptions = ["single_choice", "multiple_select", "true_false", "poll", "ordering", "short_answer"].includes(type);

  function setOpt(i: number, patch: Partial<Opt>) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const config: Record<string, unknown> = {};
    if (mediaUrl.trim()) { config.media_url = mediaUrl.trim(); config.media_type = mediaType; }
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

    let finalOptions = options.filter((o) => o.label.trim().length > 0);
    if (type === "true_false" && finalOptions.length === 0)
      finalOptions = [{ label: "True", is_correct: true }, { label: "False", is_correct: false }];
    if (type === "short_answer")
      finalOptions = finalOptions.map((o) => ({ ...o, is_correct: true }));
    if (type === "poll" || type === "ordering")
      finalOptions = finalOptions.map((o) => ({ ...o, is_correct: false }));

    const res = await saveQuestion({
      id: initial?.id,
      type: type as QuestionInput["type"],
      prompt,
      explanation,
      points,
      difficulty: difficulty as QuestionInput["difficulty"],
      topic,
      status: status as QuestionInput["status"],
      category_id: categoryId || null,
      config,
      options: usesOptions || type === "matching" ? finalOptions : [],
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push("/dashboard/questions");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
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

        <Field label="Question prompt" hint="Use $…$ for inline mathematics and $$…$$ for display equations.">
          <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Solve for $x$: $$2x + 6 = 14$$" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Media URL (optional)" hint="Image, audio or video link shown with the question.">
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

        {type === "matching" && (
          <div>
            <p className="mb-2 text-sm font-medium text-evergreen-900">Correct pairs (shown shuffled to participants)</p>
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={p.left} onChange={(e) => setPairs((prev) => prev.map((x, idx) => idx === i ? { ...x, left: e.target.value } : x))} placeholder="Left item" />
                  <span className="text-ink-soft">→</span>
                  <Input value={p.right} onChange={(e) => setPairs((prev) => prev.map((x, idx) => idx === i ? { ...x, right: e.target.value } : x))} placeholder="Right match" />
                  <button type="button" className="text-sm text-red-700" onClick={() => setPairs((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setPairs((p) => [...p, { left: "", right: "" }])}>+ Add pair</Button>
          </div>
        )}

        {usesOptions && (
          <div>
            <p className="mb-2 text-sm font-medium text-evergreen-900">
              {type === "short_answer"
                ? "Accepted answers (any of these counts as correct)"
                : type === "ordering"
                  ? "Items in the CORRECT order (participants see them shuffled)"
                  : "Answer options — tick the correct one(s)"}
            </p>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  {!["poll", "ordering", "short_answer"].includes(type) && (
                    <input
                      type={type === "multiple_select" ? "checkbox" : "radio"}
                      name="correct"
                      checked={o.is_correct}
                      onChange={(e) => {
                        if (type === "multiple_select") setOpt(i, { is_correct: e.target.checked });
                        else setOptions((prev) => prev.map((x, idx) => ({ ...x, is_correct: idx === i })));
                      }}
                      className="h-5 w-5 accent-evergreen-700"
                      aria-label={`Mark option ${i + 1} correct`}
                    />
                  )}
                  <Input value={o.label} onChange={(e) => setOpt(i, { label: e.target.value })} placeholder={`Option ${i + 1}`} />
                  <button type="button" className="text-sm text-red-700" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-2" onClick={() => setOptions((p) => [...p, { label: "", is_correct: false }])}>+ Add option</Button>
          </div>
        )}

        <Field label="Explanation (shown after answering, where enabled)">
          <Textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
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

      <Card className="h-fit p-6 lg:sticky lg:top-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Participant preview</h2>
        <div className="mt-4 rounded-xl border border-evergreen-900/10 bg-cream p-4">
          {mediaUrl && mediaType === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="mb-3 max-h-48 w-full rounded-lg object-cover" />
          )}
          <div className="font-medium text-ink">
            <MathText text={prompt || "Your question will appear here…"} />
          </div>
          {usesOptions && type !== "short_answer" && (
            <div className="mt-3 space-y-2">
              {options.filter((o) => o.label).map((o, i) => (
                <div key={i} className="rounded-lg border border-evergreen-900/10 bg-white px-3 py-2 text-sm">
                  <MathText text={o.label} />
                </div>
              ))}
            </div>
          )}
          {(type === "short_answer" || type === "open_ended") && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">Type your answer…</div>
          )}
          {type === "numeric" && (
            <div className="mt-3 rounded-lg border border-dashed border-evergreen-900/20 bg-white px-3 py-2 text-sm text-ink-soft">Enter a number…</div>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-soft">Correctness is never shown in previews or sent to participant devices during live events or exams.</p>
      </Card>
    </div>
  );
}
