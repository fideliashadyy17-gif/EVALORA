import { PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { parseIntegrityPolicy } from "@/lib/integrity";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuizBuilder } from "../QuizBuilder";

export const metadata: Metadata = { title: "Edit quiz" };

export default async function EditQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string }>;
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

  return (
    <>
      <PageTitle title="Edit quiz" subtitle={quiz.title} />
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
          integrity: parseIntegrityPolicy(settings.integrity),
          question_ids: ordered,
        }}
      />
    </>
  );
}
