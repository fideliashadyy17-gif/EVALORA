import { PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuestionForm, type QuestionFormValues, type QuestionSaveFn } from "@/components/QuestionForm";
import { saveQuestion, uploadQuestionImage, type QuestionInput } from "../actions";

export const metadata: Metadata = { title: "Edit question" };

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: q } = await supabase
    .from("questions")
    .select("*, question_options(*)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!q) notFound();

  const { data: categories } = await supabase
    .from("question_categories")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("name");

  const opts = [...((q.question_options as { label: string; is_correct: boolean; position: number; content_doc: unknown }[]) ?? [])]
    .sort((a, b) => a.position - b.position);

  const initial: Partial<QuestionFormValues> & { id: string } = {
    id: q.id,
    type: q.type as QuestionInput["type"],
    prompt: q.prompt,
    prompt_doc: (q.prompt_doc as QuestionFormValues["prompt_doc"]) ?? null,
    explanation: q.explanation ?? "",
    explanation_doc: (q.explanation_doc as QuestionFormValues["explanation_doc"]) ?? null,
    points: Number(q.points),
    difficulty: q.difficulty as QuestionInput["difficulty"],
    topic: q.topic ?? "",
    status: q.status as QuestionInput["status"],
    category_id: q.category_id,
    config: (q.config as Record<string, unknown>) ?? {},
    options: opts.map((o) => ({
      label: o.label,
      is_correct: o.is_correct,
      content_doc: (o.content_doc as QuestionFormValues["prompt_doc"]) ?? null,
    })),
  };

  return (
    <>
      <PageTitle title="Edit question" subtitle="Changes apply to future sessions; past results keep their recorded answers." />
      <QuestionForm
        initial={initial}
        categories={categories ?? []}
        save={saveQuestion as unknown as QuestionSaveFn}
        uploadImage={uploadQuestionImage}
        successHref="/dashboard/questions"
      />
    </>
  );
}
