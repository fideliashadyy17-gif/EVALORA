import { QuestionForm, type QuestionSaveFn } from "@/components/QuestionForm";
import { PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { saveQuestion, uploadQuestionImage, type QuestionInput } from "../actions";

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

  return (
    <>
      <PageTitle title="New question" subtitle="Author once with the full mathematical editor — reuse in quizzes, live competitions and examinations." />
      <QuestionForm
        categories={categories ?? []}
        save={saveQuestion as unknown as QuestionSaveFn}
        uploadImage={uploadQuestionImage}
        successHref="/dashboard/questions"
      />
    </>
  );
}
