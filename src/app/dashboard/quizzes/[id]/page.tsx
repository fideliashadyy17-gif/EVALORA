import { ButtonLink, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuizBuilder } from "../QuizBuilder";
import { setQuizGradingSystem } from "@/app/dashboard/grading/actions";
import { Badge, Card, Field, Select, Button } from "@/components/ui";

export const metadata: Metadata = { title: "Edit quiz" };

export default async function EditQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*, quiz_questions(question_id, position)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!quiz) notFound();

  const settings = (quiz.settings as Record<string, unknown>) ?? {};
  const ordered = [...((quiz.quiz_questions as { question_id: string; position: number }[]) ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((r) => r.question_id);

  const selectedIds = ordered;
  const { data: bank } = await supabase
    .from("questions")
    .select("id, type, prompt, prompt_doc, points, status, topic")
    .eq("organization_id", org.id)
    .or(`status.eq.published,id.in.(${selectedIds.length ? selectedIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
    .limit(300);

  const selectedGradingSystemId = typeof settings.grading_system_id === "string" ? settings.grading_system_id : "";
  const { data: gradingSystems } = await supabase
    .from("grading_systems")
    .select("id, name, curriculum, grade_label")
    .eq("organization_id", org.id)
    .eq("status", "active")
    .order("name");

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Quiz Editor"
        title="Edit quiz"
        subtitle={quiz.title}
        action={<ButtonLink href="/dashboard/quizzes" variant="outline">All quizzes</ButtonLink>}
      />

      {sp.ok === "grading" && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Grading configuration saved for this quiz.
        </p>
      )}

      <Card className="mb-6 p-5" data-testid="quiz-grading-config">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Grading configuration</h2>
          <Badge tone={selectedGradingSystemId ? "green" : "gray"}>
            {selectedGradingSystemId ? "System attached" : "Organization default"}
          </Badge>
        </div>
        <form action={setQuizGradingSystem} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="quiz_id" value={quiz.id} />
          <Field label="Grading system for this quiz">
            <Select name="grading_system_id" defaultValue={selectedGradingSystemId} className="min-w-64">
              <option value="">None — raw marks / objective auto-marking only</option>
              {(gradingSystems ?? []).map((gs) => (
                <option key={gs.id} value={gs.id}>
                  {gs.name} ({gs.curriculum}{gs.grade_label ? ` · ${gs.grade_label}` : ""})
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" className="text-xs">Save</Button>
          <ButtonLink href="/dashboard/grading" variant="outline" className="text-xs">Manage grading systems</ButtonLink>
        </form>
      </Card>
      {sp.e === "noquestions" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Add at least one question before starting a live session.
        </p>
      )}
      <QuizBuilder
        bank={(bank ?? []).map((q) => ({ ...q, points: Number(q.points) }))}
        initial={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description ?? "",
          status: quiz.status,
          randomize_questions: Boolean(settings.randomize_questions),
          randomize_options: Boolean(settings.randomize_options),
          time_per_question_seconds: Number(settings.time_per_question_seconds ?? 30),
          question_ids: ordered,
        }}
      />
    </>
  );
}
