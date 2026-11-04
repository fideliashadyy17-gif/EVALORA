import { Badge, Button, ButtonLink, Card, PageTitle, Select } from "@/components/ui";
import { RichContent } from "@/components/RichContent";
import { requireSuperAdmin } from "@/lib/auth";
import type { RichDoc } from "@/lib/content";
import { docIsEmpty } from "@/lib/content";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "../../actions/orgs";
import { StatusBadge } from "../../ui";

export const metadata: Metadata = { title: "Examination questions" };
export const dynamic = "force-dynamic";

interface ExamRow {
  id: string;
  title: string;
  status: string;
  organization_id: string;
  quiz_id: string | null;
  duration_minutes: number;
  organizations: { name: string } | null;
  quizzes: { id: string; title: string; status: string } | null;
}

interface OptionRow {
  id: string;
  question_id: string;
  label: string;
  content_doc: RichDoc | null;
  is_correct: boolean;
  position: number;
}

export default async function ExaminationQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: rawExams } = await admin
    .from("exams")
    .select("id, title, status, organization_id, quiz_id, duration_minutes, organizations(name), quizzes(id, title, status)")
    .order("created_at", { ascending: false })
    .limit(300);
  const exams = (rawExams ?? []) as unknown as ExamRow[];
  const selected = (sp.exam && exams.find((e) => e.id === sp.exam)) || exams[0];

  let links: Record<string, unknown>[] = [];
  const optionsByQuestion = new Map<string, OptionRow[]>();
  if (selected?.quiz_id) {
    const { data } = await admin
      .from("quiz_questions")
      .select("id, position, points, time_limit_seconds, questions(*, question_categories(name))")
      .eq("quiz_id", selected.quiz_id)
      .order("position")
      .limit(500);
    links = (data ?? []) as unknown as Record<string, unknown>[];
    const qids = links
      .map((l) => (l.questions as { id?: string } | null)?.id)
      .filter((v): v is string => Boolean(v));
    if (qids.length) {
      const { data: opts } = await admin
        .from("question_options")
        .select("id, question_id, label, content_doc, is_correct, position")
        .in("question_id", qids)
        .order("position")
        .limit(5000);
      for (const o of (opts ?? []) as OptionRow[]) {
        const list = optionsByQuestion.get(o.question_id) ?? [];
        list.push(o);
        optionsByQuestion.set(o.question_id, list);
      }
    }
  }

  const totalMarks = links.reduce((sum, l) => {
    const q = l.questions as { points?: number } | null;
    return sum + Number(l.points ?? q?.points ?? 0);
  }, 0);

  return (
    <>
      <PageTitle
        title="Examination questions"
        subtitle="The examination paper is its attached published quiz. Prompts, independent options, correct answers and worked solutions use the one unified structured mathematical editor—not a separate weaker exam editor."
        action={selected ? <ButtonLink href={`/admin/questions/new?org=${selected.organization_id}`} variant="gold">+ Create question</ButtonLink> : undefined}
      />

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No examinations exist yet. <Link href="/admin/examinations/new" className="font-semibold text-evergreen-700 underline underline-offset-2">Create one</Link>.
        </p>
      ) : (
        <>
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
            <label className="block min-w-[320px] flex-1">
              <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Examination</span>
              <Select name="exam" defaultValue={selected.id}>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.title} — {e.organizations?.name ?? "Organization"} ({e.status})</option>)}
              </Select>
            </label>
            <Button type="submit" variant="outline">View paper</Button>
          </form>

          <Card className="mb-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-evergreen-950">{selected.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                  {selected.organizations?.name} <StatusBadge status={selected.status} /> · {selected.duration_minutes} minutes
                </p>
                {selected.quizzes ? (
                  <p className="mt-2 text-sm">Paper: <strong>{selected.quizzes.title}</strong> ({selected.quizzes.status}) · {links.length} questions · {totalMarks} total marks</p>
                ) : (
                  <p className="mt-2 text-sm text-amber-800">No question paper is attached. Recreate or manage the examination in its workspace to attach a published quiz.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/admin/questions?org=${selected.organization_id}`} variant="outline">Question Bank</ButtonLink>
                <ButtonLink href={`/admin/questions/solutions?org=${selected.organization_id}`} variant="outline">Answers & solutions</ButtonLink>
                {selected.quizzes && (
                  <form action={enterOrgWorkspace}>
                    <input type="hidden" name="organization_id" value={selected.organization_id} />
                    <input type="hidden" name="next" value={`/dashboard/quizzes/${selected.quizzes.id}`} />
                    <Button type="submit" variant="gold">Add / reorder questions</Button>
                  </form>
                )}
                <form action={enterOrgWorkspace}>
                  <input type="hidden" name="organization_id" value={selected.organization_id} />
                  <input type="hidden" name="next" value={`/dashboard/exams/${selected.id}`} />
                  <Button type="submit" variant="outline">Exam workspace</Button>
                </form>
              </div>
            </div>
          </Card>

          {!selected.quizzes ? (
            <p className="rounded-2xl border border-dashed border-amber-700/40 bg-amber-50 px-6 py-10 text-center text-sm text-amber-900">This examination has no paper attached.</p>
          ) : links.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-10 text-center text-sm text-ink-soft">The attached paper has no questions yet.</p>
          ) : (
            <div className="space-y-4">
              {links.map((link, index) => {
                const q = link.questions as Record<string, unknown> | null;
                if (!q) return null;
                const options = optionsByQuestion.get(String(q.id)) ?? [];
                const explanationDoc = (q.explanation_doc as RichDoc | null) ?? null;
                const hasExplanation = Boolean(String(q.explanation ?? "").trim()) || (explanationDoc && !docIsEmpty(explanationDoc));
                const marks = Number(link.points ?? q.points ?? 0);
                return (
                  <Card key={String(link.id)} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-bold text-evergreen-800">Q{index + 1}</span>
                        <Badge tone="gray">{String(q.type).replace(/_/g, " ")}</Badge>
                        <Badge tone={q.status === "published" ? "green" : "amber"}>{String(q.status)}</Badge>
                        <span className="text-xs text-ink-soft">
                          {marks} mark{marks === 1 ? "" : "s"}
                          {link.time_limit_seconds ? ` · ${Number(link.time_limit_seconds)} sec question limit` : ""}
                          {q.topic ? ` · ${String(q.topic)}` : ""} · {String(q.difficulty ?? "—")}
                        </span>
                      </div>
                      <Link href={`/admin/questions/${q.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit prompt, options & solution →</Link>
                    </div>

                    <div className="mt-3 text-base text-evergreen-950">
                      <RichContent doc={(q.prompt_doc as RichDoc | null) ?? null} text={String(q.prompt ?? "")} />
                    </div>

                    {options.length > 0 && (
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {options.map((o, i) => (
                          <div key={o.id} className={`rounded-xl border px-3 py-2 text-sm ${o.is_correct ? "border-evergreen-500 bg-evergreen-50" : "border-evergreen-900/15 bg-white"}`}>
                            <span className="mr-2 font-display font-bold">{String.fromCharCode(65 + i)}.</span>
                            <span className="inline-block align-top"><RichContent doc={o.content_doc} text={o.label} /></span>
                            {o.is_correct && <span className="ml-2 text-xs font-semibold text-evergreen-700">Correct</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge tone={hasExplanation ? "green" : "amber"}>{hasExplanation ? "Worked solution ready" : "Worked solution missing"}</Badge>
                      {q.type === "open_ended" && <Badge tone="gray">Manual marking criteria in editor</Badge>}
                      {q.type === "numeric" && <Badge tone="gray">Tolerance configured in editor</Badge>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
