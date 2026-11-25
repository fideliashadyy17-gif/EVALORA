import { ButtonLink, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { getCapabilities } from "@/lib/capabilities";
import { parsePaperSections } from "@/lib/examPaper";
import type { RichDoc } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaperBuilder } from "../PaperBuilder";
import { parseQuestionAssessment } from "@/lib/questionAssessment";

export const metadata: Metadata = { title: "Edit examination paper" };

export default async function EditPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!(await canOperate(ctx, org.id, "paper_builder.edit"))) notFound();
  const supabase = await createClient();
  const { capabilities } = await getCapabilities(supabase, ctx, org.id);
  if (!capabilities.question_paper_builder) notFound();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*, quiz_questions(question_id, position, assessment)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!quiz) notFound();

  const settings = (quiz.settings as Record<string, unknown>) ?? {};
  const questionRows = (quiz.quiz_questions as { question_id: string; position: number; assessment: unknown }[]) ?? [];
  const ordered = [...questionRows]
    .sort((a, b) => a.position - b.position)
    .map((r) => r.question_id);
  // Reopen → every saved mapping reappears on its question (null = unmapped).
  const assessmentOf: Record<string, ReturnType<typeof parseQuestionAssessment>> = {};
  for (const row of questionRows) {
    assessmentOf[row.question_id] = parseQuestionAssessment(row.assessment);
  }

  const { data: gradingSystems } = await supabase
    .from("grading_systems")
    .select("id, name, curriculum, config")
    .eq("organization_id", org.id)
    .eq("status", "active")
    .order("name");

  const { data: templates } = await supabase
    .from("exam_paper_templates")
    .select("id, name, is_default")
    .eq("organization_id", org.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  // The bank must contain every published question AND every question already
  // on this paper (drafts included). It is loaded in pages: a single capped
  // SELECT silently dropped selected questions once a bank outgrew the cap,
  // which crashed the editor the moment it opened.
  type BankRow = {
    id: string;
    type: string;
    prompt: string;
    prompt_doc: RichDoc | null;
    points: number | string;
    status: string;
    topic: string | null;
    config: Record<string, unknown> | null;
  };
  const bankRows: BankRow[] = [];
  let bankError: string | null = null;
  let fromRow = 0;
  const pageSize = 500;
  for (let guard = 0; guard < 100; guard += 1) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, type, prompt, prompt_doc, points, status, topic, config")
      .eq("organization_id", org.id)
      .or(`status.eq.published,id.in.(${ordered.length ? ordered.join(",") : "00000000-0000-0000-0000-000000000000"})`)
      .order("created_at", { ascending: false })
      .range(fromRow, fromRow + pageSize - 1);
    if (error) {
      bankError = error.message;
      break;
    }
    const batch = (data ?? []) as BankRow[];
    bankRows.push(...batch);
    if (batch.length < pageSize) break;
    fromRow += pageSize;
  }
  if (bankError) {
    return (
      <>
        <PageTitle
          eyebrow="Question Paper Builder · Edit paper"
          title="Edit examination paper"
          subtitle={quiz.title}
          action={<ButtonLink href="/dashboard/paper-builder" variant="outline">All papers</ButtonLink>}
        />
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          The question bank could not be loaded: {bankError}. Your paper was not changed — go back and try again.
        </p>
      </>
    );
  }
  const bank = bankRows;

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
          assessment_of: assessmentOf,
        }}
        gradingSystems={(gradingSystems ?? []).map((gs) => ({
          id: gs.id,
          name: gs.name,
          curriculum: gs.curriculum,
          config: (gs.config ?? {}) as Record<string, unknown>,
        }))}
      />
    </>
  );
}
