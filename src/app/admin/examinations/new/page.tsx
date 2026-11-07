import { Button, ButtonLink, Card, Field, Input, PageTitle, Select, StatCard, Textarea } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { FileCheck2, Library, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "../../ui";
import { createExamAsAdmin } from "../actions";

export const metadata: Metadata = { title: "Create examination" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  fields: "Organization, examination title and question paper are required.",
  module: "The examinations module is disabled in Platform Settings.",
  proctoring_module: "The proctoring module is disabled in Platform Settings.",
  org: "That organization no longer exists.",
  quiz_org: "The selected paper does not belong to the chosen organization.",
  quiz_unpublished: "Only a published quiz can be used as an examination paper.",
  no_questions: "The selected paper has no questions yet.",
  window: "The closing time must be after the opening time.",
  failed: "The examination could not be created. Please try again.",
};

export default async function CreateExaminationPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: orgs } = await admin.from("organizations").select("id, name, type, slug").order("name").limit(500);
  const selected =
    (sp.org && (orgs ?? []).find((o) => o.id === sp.org)) ||
    (orgs ?? []).find((o) => o.slug === "evalora-platform") ||
    (orgs ?? [])[0];

  let quizzes: { id: string; title: string; updated_at: string }[] = [];
  let questionCount = 0;
  let examCount = 0;
  const questionsByQuiz = new Map<string, number>();
  if (selected) {
    const [{ data: qs }, { data: links }, { count: totalQuestions }, { count: totalExams }] = await Promise.all([
      admin.from("quizzes").select("id, title, updated_at").eq("organization_id", selected.id).eq("status", "published").order("title").limit(300),
      admin.from("quiz_questions").select("quiz_id, quizzes!inner(organization_id)").eq("quizzes.organization_id", selected.id).limit(20000),
      admin.from("questions").select("id", { count: "exact", head: true }).eq("organization_id", selected.id).eq("status", "published"),
      admin.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", selected.id),
    ]);
    quizzes = qs ?? [];
    for (const row of links ?? []) questionsByQuiz.set(row.quiz_id, (questionsByQuiz.get(row.quiz_id) ?? 0) + 1);
    questionCount = totalQuestions ?? 0;
    examCount = totalExams ?? 0;
  }

  return (
    <>
      <PageTitle
        title="Create examination"
        subtitle="Build a formal, timed examination directly in the Owner Control Center. The paper is a published quiz whose prompts, options and worked solutions already use the unified mathematical editor."
        action={<ButtonLink href="/admin/examinations" variant="outline">All examinations</ButtonLink>}
      />

      <Notice e={sp.e} messages={MESSAGES} />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block min-w-[300px] flex-1">
          <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Owning organization</span>
          <Select name="org" defaultValue={selected?.id ?? ""}>
            {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type.replace(/_/g, " ")})</option>)}
          </Select>
        </label>
        <Button type="submit" variant="outline">Use organization</Button>
      </form>

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">Create an organization before creating an examination.</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Published question papers" value={quizzes.length} icon={<FileCheck2 className="h-5 w-5" />} />
            <StatCard label="Published questions available" value={questionCount} icon={<Library className="h-5 w-5" />} />
            <StatCard label="Existing examinations" value={examCount} icon={<Timer className="h-5 w-5" />} />
          </div>

          {quizzes.length === 0 ? (
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-evergreen-950">No published paper in {selected.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-ink-soft">
                An examination needs a published quiz as its question paper. Create mathematical questions first, assemble and publish a quiz, then return here.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={`/admin/questions/new?org=${selected.id}`} variant="gold">Create question with math editor</ButtonLink>
                <ButtonLink href={`/admin/quizzes/new?org=${selected.id}`} variant="outline">Build a quiz</ButtonLink>
                <ButtonLink href={`/admin/questions?org=${selected.id}`} variant="outline">Question Bank</ButtonLink>
              </div>
            </Card>
          ) : (
            <Card className="max-w-4xl p-6">
              <form action={createExamAsAdmin} className="space-y-5">
                <input type="hidden" name="organization_id" value={selected.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Examination title *">
                    <Input name="title" required maxLength={180} placeholder="Term 2 Mathematics Final — Grade 9" />
                  </Field>
                  <Field label="Question paper (published quiz) *">
                    <Select name="quiz_id" required>
                      {quizzes.map((q) => (
                        <option key={q.id} value={q.id}>{q.title} — {questionsByQuiz.get(q.id) ?? 0} questions</option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Initial status">
                    <Select name="status" defaultValue="draft">
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </Select>
                  </Field>
                  <Field label="Duration per candidate (minutes) *">
                    <Input name="duration_minutes" type="number" min={1} max={1440} defaultValue={60} required />
                  </Field>
                  <Field label="Pass mark (%)">
                    <Input name="pass_mark_percent" type="number" min={0} max={100} defaultValue={50} />
                  </Field>
                </div>

                <Field label="Result publication mode">
                  <div className="grid gap-3 rounded-xl bg-cream p-4 sm:grid-cols-2">
                    <label className="flex items-start gap-2 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="manual" defaultChecked className="mt-1 accent-evergreen-700" /><span><strong>Manual Result Publication</strong><span className="block text-xs text-ink-soft">Staff validate and publish final results.</span></span></label>
                    <label className="flex items-start gap-2 text-sm text-evergreen-900"><input type="radio" name="result_publication_mode" value="automatic" className="mt-1 accent-evergreen-700" /><span><strong>Automatic Result Publication</strong><span className="block text-xs text-ink-soft">Objective results publish immediately; written responses wait for marking.</span></span></label>
                  </div>
                </Field>
                <label className="flex items-start gap-2 rounded-xl border border-evergreen-900/10 p-3 text-sm text-evergreen-900"><input type="checkbox" name="corrections_published" defaultChecked className="mt-0.5 accent-evergreen-700" /><span><strong>Release answer corrections with the result</strong><span className="block text-xs text-ink-soft">Answer keys and explanations remain hidden unless enabled.</span></span></label>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Window opens (optional)" hint="Candidates cannot start before this time.">
                    <Input name="starts_at" type="datetime-local" />
                  </Field>
                  <Field label="Window closes (optional)" hint="Server deadlines never exceed the authorized window plus a candidate extension.">
                    <Input name="ends_at" type="datetime-local" />
                  </Field>
                </div>

                <Field label="Description">
                  <Textarea name="description" rows={2} maxLength={1500} placeholder="Shown to candidates before they start." />
                </Field>
                <Field label="Instructions and rules">
                  <Textarea name="instructions" rows={4} maxLength={6000} placeholder="Permitted materials, integrity rules, calculator policy, submission instructions…" />
                </Field>

                <div className="grid gap-3 rounded-2xl bg-cream p-4 sm:grid-cols-2">
                  <label className="flex items-start gap-2 text-sm font-medium text-evergreen-900">
                    <input type="checkbox" name="randomize_questions" defaultChecked className="mt-0.5 h-5 w-5 accent-evergreen-700" />
                    Randomize question order per candidate
                  </label>
                  <label className="flex items-start gap-2 text-sm font-medium text-evergreen-900">
                    <input type="checkbox" name="randomize_options" defaultChecked className="mt-0.5 h-5 w-5 accent-evergreen-700" />
                    Randomize answer options where safe
                  </label>
                  <label className="flex items-start gap-2 text-sm font-medium text-evergreen-900">
                    <input type="checkbox" name="proctoring" className="mt-0.5 h-5 w-5 accent-evergreen-700" />
                    Enable LiveKit video proctoring
                  </label>
                  <label className="flex items-start gap-2 text-sm font-medium text-evergreen-900">
                    <input type="checkbox" name="require_screen_share" className="mt-0.5 h-5 w-5 accent-evergreen-700" />
                    Require screen sharing with proctoring
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" variant="gold" className="px-6 py-3">Create examination & register candidates →</Button>
                  <p className="text-xs text-ink-soft">A unique exam access code is generated automatically. Each candidate receives a separate personal code.</p>
                </div>
              </form>
            </Card>
          )}

          <p className="mt-5 text-sm text-ink-soft">
            Need to revise the paper first? <Link href="/admin/examinations/questions" className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">Open Examination Questions</Link>.
          </p>
        </>
      )}
    </>
  );
}
