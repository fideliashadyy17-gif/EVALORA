import { ButtonLink, PageTitle } from "@/components/ui";
import { PaperBuilder } from "../PaperBuilder";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "New question paper" };

export default async function NewPaperPage({ searchParams }: { searchParams: Promise<{ return_to?: string; addQuestion?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireUser(); const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, CREATOR_ROLES)) redirect("/dashboard");
  const supabase = await createClient();
  if (!(await hasCapability(supabase, ctx, org.id, "examinations")) || !(await hasCapability(supabase, ctx, org.id, "quiz_management"))) redirect("/dashboard/exams?e=module");
  const [{ data: bank }, { data: classes }, { data: subjects }, { data: programmes }] = await Promise.all([
    supabase.from("questions").select("id,prompt,prompt_doc,type,points,status,topic,question_options(label,content_doc,position)").eq("organization_id", org.id).in("status", ["published", "draft"]).order("created_at", { ascending: false }).limit(500),
    supabase.from("classes").select("id,name").eq("organization_id", org.id).eq("status", "active").order("grade_order").order("name"),
    supabase.from("subjects").select("id,name").eq("organization_id", org.id).order("name"),
    supabase.from("curriculum_programmes").select("key,name").eq("organization_id", org.id).eq("is_active", true).order("name"),
  ]);
  const initial = { title: "", description: "", status: "draft", instructions: "", class_id: "", subject_id: "", programme: "", curriculum: "", max_marks: 0, randomize_questions: false, randomize_options: false, sections: [], question_points: {} };
  return <><PageTitle eyebrow="Assessment Authoring · Paper Builder" title="Create a question paper" subtitle="Start with a blank, independent reusable paper. Draft it first, add sections and questions, then publish it for examination scheduling." action={<ButtonLink href="/dashboard/papers" variant="outline">All papers</ButtonLink>} /><PaperBuilder initial={initial} bank={(bank ?? []).map((q) => ({ ...q, prompt_doc: (q.prompt_doc as never) ?? null, points: Number(q.points) }))} classes={classes ?? []} subjects={subjects ?? []} programmes={programmes ?? []} returnToExam={sp.return_to === "examination"} addQuestionId={sp.addQuestion ?? ""} /></>;
}
