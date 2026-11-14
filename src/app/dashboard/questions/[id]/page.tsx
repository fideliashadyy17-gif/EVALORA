import { ButtonLink, PageTitle } from "@/components/ui";
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
  const [{ data: classOptions }, { data: programmes }, { data: subjectOptions }] = await Promise.all([
    supabase.from("classes").select("id, name").eq("organization_id", org.id).order("grade_order").order("name"),
    supabase.from("curriculum_programmes").select("key, name").eq("organization_id", org.id).order("name"),
    supabase.from("subjects").select("id, name").eq("organization_id", org.id).order("name"),
  ]);

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
    class_id: q.class_id,
    subject_id: q.subject_id,
    curriculum: q.curriculum,
    curriculum_course: q.curriculum_course,
    subtopic: q.subtopic,
    source_reference: q.source_reference,
    source_url: q.source_url,
    config: (q.config as Record<string, unknown>) ?? {},
    options: opts.map((o) => ({
      label: o.label,
      is_correct: o.is_correct,
      content_doc: (o.content_doc as QuestionFormValues["prompt_doc"]) ?? null,
    })),
  };

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Question Editor"
        title="Edit question"
        subtitle="Changes affect linked papers and can affect existing attempts or grading. Use a copy when preserving past questions."
        action={<ButtonLink href="/dashboard/questions" variant="outline">Question Bank</ButtonLink>}
      />
      <QuestionForm
        initial={initial}
        categories={categories ?? []}
        save={saveQuestion as unknown as QuestionSaveFn}
        uploadImage={uploadQuestionImage}
        subjectOptions={subjectOptions ?? []}
        classOptions={classOptions ?? []}
        curriculumOptions={programmes ?? []}
        successHref="/dashboard/questions"
      />
    </>
  );
}
