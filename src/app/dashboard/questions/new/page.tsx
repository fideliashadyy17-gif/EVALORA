import { PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { QuestionEditor } from "../QuestionEditor";

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
      <PageTitle title="New question" subtitle="Author once, reuse everywhere — quizzes, assessments and examinations." />
      <QuestionEditor categories={categories ?? []} />
    </>
  );
}
