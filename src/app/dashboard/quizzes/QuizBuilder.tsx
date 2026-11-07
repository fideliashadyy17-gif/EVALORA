"use client";

import { RichContent } from "@/components/RichContent";
import type { RichDoc } from "@/lib/content";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveQuiz } from "./actions";

interface BankQ { id: string; type: string; prompt: string; prompt_doc?: RichDoc | null; points: number; status: string; topic: string | null }

export function QuizBuilder({
  initial,
  bank,
}: {
  initial?: {
    id?: string; title: string; description: string; status: string;
    randomize_questions: boolean; randomize_options: boolean; time_per_question_seconds: number;
    result_publication_mode?: "manual" | "automatic"; corrections_published?: boolean; question_ids: string[];
  };
  bank: BankQ[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [randQ, setRandQ] = useState(initial?.randomize_questions ?? false);
  const [randO, setRandO] = useState(initial?.randomize_options ?? false);
  const [tpq, setTpq] = useState(initial?.time_per_question_seconds ?? 30);
  const [resultPublicationMode, setResultPublicationMode] = useState<"manual" | "automatic">(initial?.result_publication_mode ?? "manual");
  const [correctionsPublished, setCorrectionsPublished] = useState(initial?.corrections_published ?? true);
  const [selected, setSelected] = useState<string[]>(initial?.question_ids ?? []);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const available = bank.filter(
    (q) => !selected.includes(q.id) && q.prompt.toLowerCase().includes(filter.toLowerCase()),
  );
  const totalPoints = selected.reduce((s, id) => s + Number(byId.get(id)?.points ?? 0), 0);

  function move(i: number, dir: -1 | 1) {
    setSelected((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await saveQuiz({
      id: initial?.id,
      title,
      description,
      status: status as "draft" | "published" | "archived",
      randomize_questions: randQ,
      randomize_options: randO,
      time_per_question_seconds: tpq,
      result_publication_mode: resultPublicationMode,
      corrections_published: correctionsPublished,
      question_ids: selected,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push("/dashboard/quizzes");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <Card className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quiz title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grade 7 Mathematics — Proportions Sprint" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this quiz about?" />
        </Field>
        <div className="flex flex-wrap items-center gap-6">
          <Field label="Seconds per question">
            <Input type="number" min={5} max={3600} value={tpq} onChange={(e) => setTpq(parseInt(e.target.value) || 30)} className="w-32" />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm font-medium text-evergreen-900">
            <input type="checkbox" checked={randQ} onChange={(e) => setRandQ(e.target.checked)} className="h-5 w-5 accent-evergreen-700" />
            Randomize question order
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm font-medium text-evergreen-900">
            <input type="checkbox" checked={randO} onChange={(e) => setRandO(e.target.checked)} className="h-5 w-5 accent-evergreen-700" />
            Randomize answer options
          </label>
        </div>
        <Field label="Result publication mode" hint="Used for live quiz sessions and competitions launched from this quiz. Existing sessions retain their saved mode.">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="manual" checked={resultPublicationMode === "manual"} onChange={() => setResultPublicationMode("manual")} className="mt-1 accent-evergreen-700" /><span><strong>Manual Result Publication</strong><span className="block text-xs text-ink-soft">An authorized organizer validates and publishes the final result.</span></span></label>
            <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="automatic" checked={resultPublicationMode === "automatic"} onChange={() => setResultPublicationMode("automatic")} className="mt-1 accent-evergreen-700" /><span><strong>Automatic Result Publication</strong><span className="block text-xs text-ink-soft">Objective results publish when the participant/session finishes; subjective answers wait for marking.</span></span></label>
          </div>
        </Field>
        <label className="flex items-start gap-2 text-sm text-evergreen-900"><input type="checkbox" checked={correctionsPublished} onChange={(e) => setCorrectionsPublished(e.target.checked)} className="mt-0.5 accent-evergreen-700" /><span><strong>Show correct answers and explanations after an authorized reveal</strong><span className="block text-xs text-ink-soft">Turn off to keep answer keys and explanations hidden from participants.</span></span></label>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">In this quiz ({selected.length})</h2>
            <Badge tone="gold">{totalPoints} points total</Badge>
          </div>
          {selected.length === 0 ? (
            <p className="text-sm text-ink-soft">Add published questions from the bank on the right.</p>
          ) : (
            <ol className="space-y-2">
              {selected.map((id, i) => {
                const q = byId.get(id);
                if (!q) return null;
                return (
                  <li key={id} className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 bg-cream p-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-evergreen-700 text-xs font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-medium text-ink"><RichContent doc={q.prompt_doc ?? null} text={q.prompt} /></div>
                      <p className="text-xs text-ink-soft">{q.type.replace(/_/g, " ")} · {q.points} pts</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => move(i, -1)} className="rounded p-1 text-ink-soft hover:bg-white" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                      <button onClick={() => move(i, 1)} className="rounded p-1 text-ink-soft hover:bg-white" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                      <button onClick={() => setSelected((p) => p.filter((x) => x !== id))} className="rounded p-1 text-red-700 hover:bg-white" aria-label="Remove"><X className="h-4 w-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Question bank</h2>
          <Input className="mt-3" placeholder="Filter questions…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto scroll-slim">
            {available.length === 0 && <p className="text-sm text-ink-soft">No published questions available. Publish questions in the Question Bank first.</p>}
            {available.map((q) => (
              <button
                key={q.id}
                onClick={() => setSelected((p) => [...p, q.id])}
                className="block w-full rounded-xl border border-evergreen-900/10 bg-white p-3 text-left transition hover:border-evergreen-600/50 hover:shadow-[var(--shadow-card)]"
              >
                <span className="line-clamp-2 text-sm font-medium text-ink"><RichContent doc={q.prompt_doc ?? null} text={q.prompt} /></span>
                <span className="mt-1 block text-xs text-ink-soft">{q.type.replace(/_/g, " ")} · {q.points} pts{q.topic ? ` · ${q.topic}` : ""} — click to add</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button onClick={submit} disabled={busy || !title.trim()} variant="gold" className="px-6">
          {busy ? "Saving…" : initial?.id ? "Save quiz" : "Create quiz"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>

      {selected.length > 0 && (
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Preview — first question as participants see it</h2>
          <div className="mt-3 rounded-xl border border-evergreen-900/10 bg-cream p-4 font-medium text-ink">
            <RichContent doc={byId.get(selected[0])?.prompt_doc ?? null} text={byId.get(selected[0])?.prompt ?? ""} />
          </div>
        </Card>
      )}
    </div>
  );
}
