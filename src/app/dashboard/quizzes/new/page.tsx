import { ButtonLink, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { QuizBuilder } from "../QuizBuilder";

export const metadata: Metadata = { title: "New quiz" };

export default async function NewQuizPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();
  const { data: bank } = await supabase
    .from("questions")
    .select("id, type, prompt, points, status, topic")
    .eq("organization_id", org.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Quiz Builder"
        title="New quiz"
        subtitle="Assemble published questions into a quiz you can run live or attach to an examination."
        action={<ButtonLink href="/dashboard/quizzes" variant="outline">All quizzes</ButtonLink>}
      />
      <QuizBuilder bank={(bank ?? []).map((q) => ({ ...q, points: Number(q.points) }))} />
    </>
  );
}
