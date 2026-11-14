import { QuestionForm, type QuestionSaveFn } from "@/components/QuestionForm";
import { ButtonLink, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { saveQuestion, uploadQuestionImage } from "../actions";

export const metadata: Metadata = { title: "New question" };

export default async function NewQuestionPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("question_categories")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("name");
  const [{ data: classOptions }, { data: programmes }, { data: subjectOptions }] = await Promise.all([
    supabase.from("classes").select("id, name").eq("organization_id", org.id).eq("status", "active").order("grade_order").order("name"),
    supabase.from("curriculum_programmes").select("key, name").eq("organization_id", org.id).eq("is_active", true).order("name"),
    supabase.from("subjects").select("id, name").eq("organization_id", org.id).order("name"),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Mathematical Question Studio"
        title="New question"
        subtitle="Author once with the full mathematical editor — reuse in quizzes, live competitions and examinations."
        action={<ButtonLink href="/dashboard/questions" variant="outline">Question Bank</ButtonLink>}
      />
      <QuestionForm
        categories={categories ?? []}
        save={saveQuestion as unknown as QuestionSaveFn}
        uploadImage={uploadQuestionImage}
        successHref="/dashboard/questions"
        subjectOptions={subjectOptions ?? []}
        classOptions={classOptions ?? []}
        curriculumOptions={programmes ?? []}
      />
    </>
  );
}
