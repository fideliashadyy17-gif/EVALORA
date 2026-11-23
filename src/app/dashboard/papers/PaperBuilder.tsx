"use client";

import { RichContent } from "@/components/RichContent";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { RichDoc } from "@/lib/content";
import { ArrowDown, ArrowUp, FilePlus2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { savePaper } from "./actions";

type BankQuestion = { id: string; prompt: string; prompt_doc: RichDoc | null; type: string; points: number; status: string; topic: string | null; question_options?: { label: string; content_doc: RichDoc | null; position: number }[] };
type Section = { id: string; title: string; question_ids: string[] };
type PaperInitial = {
  id?: string; title: string; description: string; status: string; instructions: string; class_id: string;
  subject_id: string; programme: string; curriculum: string; max_marks: number;
  randomize_questions: boolean; randomize_options: boolean; sections: Section[];
  question_points: Record<string, number>;
};
const newSection = (n: number): Section => ({ id: `section-${Date.now()}-${n}`, title: `Section ${String.fromCharCode(64 + Math.min(n, 26))}`, question_ids: [] });

export function PaperBuilder({ initial, bank, classes, subjects, programmes, returnToExam = false, addQuestionId = "" }: {
  initial?: PaperInitial;
  bank: BankQuestion[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  programmes: { key: string; name: string }[];
  returnToExam?: boolean;
  addQuestionId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [classId, setClassId] = useState(initial?.class_id ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? "");
  const [programme, setProgramme] = useState(initial?.programme ?? "");
  const [curriculum, setCurriculum] = useState(initial?.curriculum ?? "");
  const [maxMarks, setMaxMarks] = useState(initial?.max_marks ?? 0);
  const [randomizeQuestions, setRandomizeQuestions] = useState(initial?.randomize_questions ?? false);
  const [randomizeOptions, setRandomizeOptions] = useState(initial?.randomize_options ?? false);
  const [sections, setSections] = useState<Section[]>(initial?.sections?.length ? initial.sections : [newSection(1)]);
  const [points, setPoints] = useState<Record<string, number>>(initial?.question_points ?? {});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedIds = useMemo(() => new Set(sections.flatMap((s) => s.question_ids)), [sections]);
  const bankById = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const total = sections.flatMap((s) => s.question_ids).reduce((sum, id) => sum + Number(points[id] ?? bankById.get(id)?.points ?? 0), 0);
  const available = bank.filter((q) => !selectedIds.has(q.id) && `${q.prompt} ${q.topic ?? ""} ${q.type}`.toLowerCase().includes(filter.toLowerCase()));

  useEffect(() => {
    if (!addQuestionId || selectedIds.has(addQuestionId) || !bankById.has(addQuestionId)) return;
    setSections((prev) => {
      const next = [...prev];
      next[0] = { ...next[0], question_ids: [...next[0].question_ids, addQuestionId] };
      return next;
    });
    setPoints((prev) => ({ ...prev, [addQuestionId]: prev[addQuestionId] ?? bankById.get(addQuestionId)!.points }));
  }, [addQuestionId, bankById, selectedIds]);

  function addTo(sectionIndex: number, q: BankQuestion) {
    setSections((prev) => prev.map((s, i) => i === sectionIndex ? { ...s, question_ids: [...s.question_ids, q.id] } : s));
    setPoints((prev) => ({ ...prev, [q.id]: prev[q.id] ?? q.points }));
  }
  function moveQuestion(sectionIndex: number, questionIndex: number, delta: -1 | 1) {
    setSections((prev) => prev.map((s, i) => {
      if (i !== sectionIndex) return s;
      const ids = [...s.question_ids]; const target = questionIndex + delta;
      if (target < 0 || target >= ids.length) return s;
      [ids[questionIndex], ids[target]] = [ids[target], ids[questionIndex]];
      return { ...s, question_ids: ids };
    }));
  }
  function moveSection(index: number, delta: -1 | 1) {
    setSections((prev) => { const next = [...prev]; const target = index + delta; if (target < 0 || target >= next.length) return prev; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  const payload = (nextStatus: "draft" | "published" | "archived" = status as "draft" | "published" | "archived") => ({
    id: initial?.id,
    title,
    description,
    instructions,
    status: nextStatus,
    class_id: classId || null,
    subject_id: subjectId || null,
    programme,
    curriculum,
    max_marks: Number(maxMarks || total),
    randomize_questions: randomizeQuestions,
    randomize_options: randomizeOptions,
    sections,
    items: sections.flatMap((section) => section.question_ids.map((question_id) => ({
      question_id,
      points: Number(points[question_id] ?? bankById.get(question_id)?.points ?? 0),
      section_id: section.id,
    }))),
  });

  async function save(nextStatus: "draft" | "published" | "archived" = status as "draft" | "published" | "archived") {
    setBusy(true); setError("");
    const result = await savePaper(payload(nextStatus));
    setBusy(false);
    if (result.error || !result.id) { setError(result.error ?? "Could not save paper."); return null; }
    if (nextStatus === "published" && returnToExam) {
      router.push(`/dashboard/exams/new?paper=${result.id}`);
    } else if (!initial?.id) {
      router.push(`/dashboard/papers/${result.id}`);
    } else {
      router.refresh();
    }
    return result.id;
  }

  async function createQuestion() {
    setBusy(true); setError("");
    const result = await savePaper(payload("draft"));
    setBusy(false);
    if (result.error || !result.id) { setError(result.error ?? "Save a draft before adding a question."); return; }
    const returnTo = `/dashboard/papers/${result.id}`;
    router.push(`/dashboard/questions/new?return_to=${encodeURIComponent(returnTo)}`);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wider text-evergreen-700">Reusable paper · {initial?.id ? `ID ${initial.id.slice(0, 8)}` : "New draft"}</p><h2 className="mt-1 font-display text-2xl font-semibold text-evergreen-950">Paper details & structure</h2></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !title.trim()} onClick={() => void save("draft")}><Save className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Save draft"}</Button>
        <Button type="button" variant="gold" disabled={busy || !title.trim()} onClick={() => void save("published")}>{busy ? "Saving…" : "Publish paper"}</Button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Paper title"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Grade 8 Mathematics — End of term" /></Field>
        <Field label="Publication status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></Select></Field>
        <Field label="Grade / class"><Select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Select a class (optional)</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Subject"><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Select a subject (optional)</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Programme"><Select value={programme} onChange={(e) => setProgramme(e.target.value)}><option value="">Not specified</option>{programmes.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select></Field>
        <Field label="Curriculum / course"><Input value={curriculum} onChange={(e) => setCurriculum(e.target.value)} placeholder="e.g. Cambridge, IB MYP" /></Field>
        <Field label="Maximum marks"><Input type="number" min={0} step="0.5" value={maxMarks} onChange={(e) => setMaxMarks(Number(e.target.value))} /><span className="text-xs text-ink-soft">Question marks total {total}; leave 0 to use that total.</span></Field>
        <Field label="Short description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional paper summary" /></Field>
        <Field label="Candidate instructions" className="md:col-span-2"><Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions shown at the start of the examination." /></Field>
      </div>
      <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={randomizeQuestions} onChange={(e) => setRandomizeQuestions(e.target.checked)} />Randomize questions when used</label><label className="flex items-center gap-2"><input type="checkbox" checked={randomizeOptions} onChange={(e) => setRandomizeOptions(e.target.checked)} />Randomize answer options</label></div>
    </Card>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <div className="space-y-4">
        {sections.map((section, si) => <Card key={section.id} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Section title" value={section.title} onChange={(e) => setSections((prev) => prev.map((s, i) => i === si ? { ...s, title: e.target.value } : s))} className="max-w-sm font-semibold" />
            <button type="button" onClick={() => moveSection(si, -1)} className="rounded-lg p-2 text-ink-soft hover:bg-cream" aria-label="Move section up"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => moveSection(si, 1)} className="rounded-lg p-2 text-ink-soft hover:bg-cream" aria-label="Move section down"><ArrowDown className="h-4 w-4" /></button>
            <button type="button" onClick={() => setSections((prev) => prev.filter((_, i) => i !== si))} disabled={sections.length === 1} className="ml-auto rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label="Remove section"><Trash2 className="h-4 w-4" /></button>
          </div>
          <ol className="mt-3 space-y-2">
            {section.question_ids.map((id, qi) => {
              const q = bankById.get(id); if (!q) return <li key={id} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Question {id.slice(0, 8)} is not available in the question bank.</li>;
              return <li key={id} className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 bg-cream p-3">
                <span className="mt-1 text-xs font-bold text-evergreen-700">{qi + 1}.</span>
                <div className="min-w-0 flex-1"><div className="line-clamp-3 text-sm font-medium"><RichContent doc={q.prompt_doc} text={q.prompt} /></div><p className="mt-1 text-xs text-ink-soft">{q.type.replaceAll("_", " ")} · {q.status}</p></div>
                <label className="flex shrink-0 items-center gap-1 text-xs">Marks <Input aria-label={`Marks for question ${qi + 1}`} type="number" min={0} step="0.5" className="w-20" value={points[id] ?? q.points} onChange={(e) => setPoints((prev) => ({ ...prev, [id]: Number(e.target.value) }))} /></label>
                <button type="button" onClick={() => moveQuestion(si, qi, -1)} className="rounded p-1 text-ink-soft hover:bg-white" aria-label="Move question up"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => moveQuestion(si, qi, 1)} className="rounded p-1 text-ink-soft hover:bg-white" aria-label="Move question down"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setSections((prev) => prev.map((s, i) => i === si ? { ...s, question_ids: s.question_ids.filter((x) => x !== id) } : s))} className="rounded p-1 text-red-700 hover:bg-white" aria-label="Remove question"><Trash2 className="h-4 w-4" /></button>
              </li>;
            })}
          </ol>
          <button type="button" onClick={() => document.getElementById(`question-picker-${si}`)?.focus()} className="mt-3 text-sm font-semibold text-evergreen-700 underline">Add from Question Bank</button>
          <select id={`question-picker-${si}`} aria-label={`Add a question to ${section.title}`} className="sr-only" value="" onChange={(e) => { const q = bankById.get(e.target.value); if (q) addTo(si, q); }}><option value="">Select question</option>{available.map((q) => <option key={q.id} value={q.id}>{q.prompt.slice(0, 100)}</option>)}</select>
        </Card>)}
        <Button type="button" variant="outline" onClick={() => setSections((prev) => [...prev, newSection(prev.length + 1)])}><Plus className="mr-2 h-4 w-4" />Add section</Button>
      </div>
      <div className="space-y-4">
        <Card className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold text-evergreen-950">Question Bank</h3><p className="mt-1 text-xs text-ink-soft">Select existing questions; saved paper links remain organization-scoped.</p></div><Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={() => void createQuestion()} disabled={busy || !title.trim()}><FilePlus2 className="mr-1 h-4 w-4" />New question</Button></div>
          <Input className="mt-3" placeholder="Search questions…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="mt-3 max-h-[620px] space-y-2 overflow-y-auto">{available.map((q) => <div key={q.id} className="rounded-xl border border-evergreen-900/10 bg-white p-3"><div className="line-clamp-3 text-sm"><RichContent doc={q.prompt_doc} text={q.prompt} /></div><div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-soft"><span>{q.type.replaceAll("_", " ")} · {q.points} marks · {q.status}</span><div className="flex gap-1">{sections.map((s, i) => <button key={s.id} type="button" onClick={() => addTo(i, q)} className="rounded-md border border-evergreen-900/15 px-2 py-1 font-semibold text-evergreen-800 hover:bg-cream">+ {s.title}</button>)}</div></div></div>)}{available.length === 0 && <p className="py-6 text-center text-sm text-ink-soft">No matching questions. Create one above, then return here.</p>}</div>
        </Card>
        <Card className="max-h-[850px] overflow-y-auto p-5"><h3 className="font-display text-lg font-semibold text-evergreen-950">Candidate paper preview</h3><p className="mt-1 text-sm text-ink-soft">{sections.reduce((n, s) => n + s.question_ids.length, 0)} questions · {total} marks · {sections.length} sections</p><div className="mt-4 rounded-xl border border-evergreen-900/15 bg-white p-4"><h4 className="text-center font-display text-xl font-semibold text-evergreen-950">{title || "Untitled question paper"}</h4>{classId && <p className="mt-1 text-center text-xs text-ink-soft">{classes.find((c) => c.id === classId)?.name ?? ""}{subjectId ? ` · ${subjects.find((s) => s.id === subjectId)?.name ?? ""}` : ""}</p>}{instructions && <p className="mt-4 whitespace-pre-wrap border-y border-evergreen-900/10 py-3 text-sm">{instructions}</p>}{sections.map((s, si) => <div key={s.id} className="mt-5"><h5 className="border-b border-evergreen-900/15 pb-1 font-semibold text-evergreen-900">{s.title || `Section ${si + 1}`}</h5><ol className="mt-3 space-y-4">{s.question_ids.map((id, qi) => { const q = bankById.get(id); return <li key={id} className="flex gap-2 text-sm"><span className="font-semibold">{qi + 1}.</span><div className="min-w-0 flex-1"><div className="whitespace-pre-wrap"><RichContent doc={q?.prompt_doc ?? null} text={q?.prompt ?? "Question unavailable"} /></div>{q?.question_options && q.question_options.length > 0 && <ol className="mt-2 space-y-1 pl-5">{[...q.question_options].sort((a, b) => a.position - b.position).map((option, oi) => <li key={`${id}-option-${oi}`} className="list-[upper-alpha]"><RichContent doc={option.content_doc} text={option.label} /></li>)}</ol>}<p className="mt-1 text-right text-xs">[{points[id] ?? q?.points ?? 0} marks]</p></div></li>; })}</ol></div>)}</div></Card>
      </div>
    </div>
  </div>;
}
