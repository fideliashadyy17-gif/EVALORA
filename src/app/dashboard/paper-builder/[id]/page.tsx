import { ButtonLink, PageTitle } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { getCapabilities } from "@/lib/capabilities";
import { parsePaperSections } from "@/lib/examPaper";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaperBuilder } from "../PaperBuilder";

export const metadata: Metadata = { title: "Edit examination paper" };

export default async function EditPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, CREATOR_ROLES)) notFound();
  const supabase = await createClient();
  const { capabilities } = await getCapabilities(supabase, ctx, org.id);
  if (!capabilities.question_paper_builder) notFound();

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

  const [{ data: bank }, { data: templates }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, type, prompt, prompt_doc, points, status, topic, config")
      .eq("organization_id", org.id)
      .or(`status.eq.published,id.in.(${ordered.length ? ordered.join(",") : "00000000-0000-0000-0000-000000000000"})`)
      .limit(300),
    supabase
      .from("exam_paper_templates")
      .select("id, name, is_default")
      .eq("organization_id", org.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Question Paper Builder · Edit paper"
        title="Edit examination paper"
        subtitle={quiz.title}
        action={<ButtonLink href="/dashboard/paper-builder" variant="outline">All papers</ButtonLink>}
      />
      <PaperBuilder
        bank={(bank ?? []).map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          prompt_doc: q.prompt_doc,
          points: Number(q.points),
          status: q.status,
          topic: q.topic,
          paper_section: typeof (q.config as Record<string, unknown> | null)?.paper_section === "string"
            ? String((q.config as Record<string, unknown>).paper_section)
            : null,
        }))}
        templates={(templates ?? []).map((t) => ({ id: t.id, name: t.name, is_default: Boolean(t.is_default) }))}
        initial={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description ?? "",
          status: quiz.status,
          randomize_questions: Boolean(settings.randomize_questions),
          randomize_options: Boolean(settings.randomize_options),
          time_per_question_seconds: Number(settings.time_per_question_seconds ?? 30),
          question_ids: ordered,
          sections: parsePaperSections(settings.sections).map((s) => ({ id: s.id, title: s.title, instructions: s.instructions ?? "" })),
          calculator: settings.calculator !== false,
          calculator_mode: settings.calculator_mode === "basic" ? "basic" : "scientific",
          calculator_angle_mode: settings.calculator_angle_mode === "rad" ? "rad" : "deg",
          exam_period: typeof settings.exam_period === "string" ? settings.exam_period : "",
          academic_year: typeof settings.academic_year === "string" ? settings.academic_year : "",
          grade_label: typeof settings.grade_label === "string" ? settings.grade_label : "",
          subject: typeof settings.subject === "string" ? settings.subject : "",
          instructions: typeof settings.instructions === "string" ? settings.instructions : "",
          template_id: typeof settings.exam_paper_template_id === "string" ? settings.exam_paper_template_id : "",
        }}
      />
    </>
  );
}
