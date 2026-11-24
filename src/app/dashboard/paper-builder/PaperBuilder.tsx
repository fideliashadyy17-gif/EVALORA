"use client";

import { RichContent } from "@/components/RichContent";
import type { RichDoc } from "@/lib/content";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveQuiz } from "../quizzes/actions";

interface BankQ {
  id: string;
  type: string;
  prompt: string;
  prompt_doc?: RichDoc | null;
  points: number;
  status: string;
  topic: string | null;
  paper_section?: string | null;
}

export interface PaperSectionDraft {
  id: string;
  title: string;
  instructions: string;
}

const MCQ_TYPES = new Set(["single_choice", "multiple_select", "true_false"]);

export function PaperBuilder({
  initial,
  bank,
  templates,
}: {
  initial?: {
    id?: string;
    title: string;
    description: string;
    status: string;
    randomize_questions: boolean;
    randomize_options: boolean;
    time_per_question_seconds: number;
    question_ids: string[];
    sections: PaperSectionDraft[];
    calculator: boolean;
    calculator_mode: "scientific" | "basic";
    calculator_angle_mode: "deg" | "rad";
    exam_period: string;
    academic_year: string;
    grade_label: string;
    subject: string;
    instructions: string;
    template_id: string;
  };
  bank: BankQ[];
  templates: { id: string; name: string; is_default: boolean }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [randQ, setRandQ] = useState(initial?.randomize_questions ?? true);
  const [randO, setRandO] = useState(initial?.randomize_options ?? true);
  const [tpq, setTpq] = useState(initial?.time_per_question_seconds ?? 30);
  const [selected, setSelected] = useState<string[]>(initial?.question_ids ?? []);
  const [sectionOf, setSectionOf] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const q of bank) {
      if (q.paper_section === "A" || q.paper_section === "B") map[q.id] = q.paper_section;
    }
    return map;
  });
  const [sections, setSections] = useState<PaperSectionDraft[]>(
    initial?.sections.length
      ? initial.sections
      : [
          { id: "A", title: "SECTION A — MULTIPLE CHOICE QUESTIONS", instructions: "Answer all questions in this section." },
          { id: "B", title: "SECTION B — THEORY QUESTIONS", instructions: "Show complete working." },
        ],
  );
  const [calculator, setCalculator] = useState(initial?.calculator ?? true);
  const [calculatorMode, setCalculatorMode] = useState<"scientific" | "basic">(initial?.calculator_mode ?? "scientific");
  const [angleMode, setAngleMode] = useState<"deg" | "rad">(initial?.calculator_angle_mode ?? "deg");
  const [period, setPeriod] = useState(initial?.exam_period ?? "");
  const [academicYear, setAcademicYear] = useState(initial?.academic_year ?? "");
  const [gradeLabel, setGradeLabel] = useState(initial?.grade_label ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [templateId, setTemplateId] = useState(initial?.template_id ?? "");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const available = bank.filter(
    (q) => !selected.includes(q.id) && q.prompt.toLowerCase().includes(filter.toLowerCase()),
  );
  const totalPoints = selected.reduce((s, id) => s + Number(byId.get(id)?.points ?? 0), 0);

  /** Which section a selected paper question belongs to. Safe for ids that
   *  are missing from the loaded bank (large banks page; a missing row must
   *  never crash sections rendering or the save path). */
  function sectionFor(id: string): string {
    if (sectionOf[id]) return sectionOf[id];
    const q = byId.get(id);
    return q && MCQ_TYPES.has(q.type) ? "A" : "B";
  }

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
      question_ids: selected,
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        instructions: s.instructions,
        questions: selected.filter((id) => sectionFor(id) === s.id).length,
        marks: selected
          .filter((id) => sectionFor(id) === s.id)
          .reduce((sum, id) => sum + Number(byId.get(id)?.points ?? 0), 0),
      })),
      section_of: sectionOf,
      calculator,
      calculator_mode: calculatorMode,
      calculator_angle_mode: angleMode,
      exam_period: period,
      academic_year: academicYear,
      grade_label: gradeLabel,
      subject,
      instructions,
      exam_paper_template_id: templateId || null,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push("/dashboard/paper-builder");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <Card className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paper title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="MYP4 Mathematics — End of Term (Version C)" />
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
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this paper about?" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Examination period">
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="First Term Examination" />
          </Field>
          <Field label="Academic year">
            <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2026–2027" />
          </Field>
          <Field label="Grade / Class">
            <Input value={gradeLabel} onChange={(e) => setGradeLabel(e.target.value)} placeholder="MYP4" />
          </Field>
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathematics" />
          </Field>
        </div>
        <Field label="Official paper template">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">No template (organization defaults)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.is_default ? " (default)" : ""}</option>
            ))}
          </Select>
        </Field>
        <Field label="General examination instructions">
          <Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Answer all questions. A scientific calculator is permitted…" />
        </Field>
        <div className="flex flex-wrap items-center gap-6">
          <Field label="Seconds per question">
            <Input type="number" min={5} max={3600} value={tpq} onChange={(e) => setTpq(parseInt(e.target.value) || 30)} className="w-32" />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm font-medium text-evergreen-900">
            <input type="checkbox" checked={randQ} onChange={(e) => setRandQ(e.target.checked)} className="h-5 w-5 accent-evergreen-700" />
            Randomize questions within sections
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm font-medium text-evergreen-900">
            <input type="checkbox" checked={randO} onChange={(e) => setRandO(e.target.checked)} className="h-5 w-5 accent-evergreen-700" />
            Randomize answer options
          </label>
        </div>
        <div className="rounded-xl border border-evergreen-900/10 bg-cream p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-evergreen-900">
            <input type="checkbox" checked={calculator} onChange={(e) => setCalculator(e.target.checked)} className="h-5 w-5 accent-evergreen-700" />
            Scientific calculator available to candidates
          </label>
          {calculator && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Calculator mode">
                <Select value={calculatorMode} onChange={(e) => setCalculatorMode(e.target.value as "scientific" | "basic")}>
                  <option value="scientific">Scientific (full)</option>
                  <option value="basic">Basic (four operations)</option>
                </Select>
              </Field>
              <Field label="Default angle mode">
                <Select value={angleMode} onChange={(e) => setAngleMode(e.target.value as "deg" | "rad")}>
                  <option value="deg">Degrees</option>
                  <option value="rad">Radians</option>
                </Select>
              </Field>
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Sections</h2>
        {sections.map((s, idx) => (
          <div key={s.id} className="grid gap-3 rounded-xl border border-evergreen-900/10 bg-cream p-4 sm:grid-cols-[7rem_1fr_1fr_auto]">
            <Field label="Section">
              <Input value={s.id} disabled />
            </Field>
            <Field label="Title">
              <Input value={s.title} onChange={(e) => setSections((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))} />
            </Field>
            <Field label="Instructions">
              <Input value={s.instructions} onChange={(e) => setSections((prev) => prev.map((x, i) => (i === idx ? { ...x, instructions: e.target.value } : x)))} />
            </Field>
            <div className="flex items-end">
              <Badge tone="gold">
                {selected.filter((id) => sectionFor(id) === s.id).length} questions
              </Badge>
            </div>
          </div>
        ))}
        <p className="text-xs text-ink-soft">
          Section A holds multiple-choice questions; Section B holds theory questions. Randomization shuffles within each
          section only, so the two sections never mix.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">In this paper ({selected.length})</h2>
            <Badge tone="gold">{totalPoints} marks total</Badge>
          </div>
          {selected.length === 0 ? (
            <p className="text-sm text-ink-soft">Add published questions from the bank on the right.</p>
          ) : (
            <ol className="space-y-2">
              {selected.map((id, i) => {
                const q = byId.get(id);
                if (!q) {
                  // Never silently drop a question that belongs to this paper:
                  // show it with an explicit recovery action instead.
                  return (
                    <li key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <span>Question {i + 1} is part of this paper but was not found in the loaded question bank.</span>
                      <button
                        type="button"
                        className="shrink-0 font-medium underline"
                        onClick={() => setSelected((prev) => prev.filter((x) => x !== id))}
                      >
                        Remove from paper
                      </button>
                    </li>
                  );
                }
                const sec = sectionFor(id);
                return (
                  <li key={id} className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 bg-cream p-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-evergreen-700 text-xs font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-medium text-ink"><RichContent doc={q.prompt_doc ?? null} text={q.prompt} /></div>
                      <p className="text-xs text-ink-soft">{q.type.replace(/_/g, " ")} · {q.points} marks</p>
                      <label className="mt-1 flex items-center gap-2 text-xs font-medium text-evergreen-900">
                        Section
                        <Select
                          value={sec}
                          onChange={(e) => setSectionOf((prev) => ({ ...prev, [id]: e.target.value }))}
                          className="w-24 py-1 text-xs"
                          aria-label={`Section for question ${i + 1}`}
                        >
                          {sections.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
                        </Select>
                      </label>
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
                <span className="mt-1 block text-xs text-ink-soft">{q.type.replace(/_/g, " ")} · {q.points} marks{q.topic ? ` · ${q.topic}` : ""} — click to add</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button onClick={submit} disabled={busy || !title.trim()} variant="gold" className="px-6">
          {busy ? "Saving…" : initial?.id ? "Save paper" : "Create paper"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>

      {selected.length > 0 && (
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Official paper preview</h2>
          <div className="paper-document mt-3 bg-white p-6">
            <p className="text-center text-sm font-semibold uppercase tracking-wide">Official Examination Paper</p>
            <p className="mt-1 text-center font-display text-xl font-bold">{title || "Untitled paper"}</p>
            <p className="mt-2 text-center text-sm text-ink-soft">
              {[period, academicYear && `Academic Year: ${academicYear}`, gradeLabel && `Grade: ${gradeLabel}`, subject && `Subject: ${subject}`].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-center text-sm text-ink-soft">{totalPoints} marks{calculator ? " · Scientific calculator permitted" : ""}</p>
            {instructions && <p className="mt-3 text-sm">{instructions}</p>}
            {sections.map((s) => (
              <div key={s.id} className="mt-4">
                <p className="font-bold">{s.title}</p>
                {s.instructions && <p className="text-sm text-ink-soft">{s.instructions}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
