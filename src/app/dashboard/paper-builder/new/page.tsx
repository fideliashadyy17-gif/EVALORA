import { ButtonLink, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { canOperate } from "@/lib/operationalAccess";
import { getCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaperBuilder } from "../PaperBuilder";

export const metadata: Metadata = { title: "New examination paper" };

export default async function NewPaperPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!(await canOperate(ctx, org.id, "paper_builder.create"))) notFound();
  const supabase = await createClient();
  const { capabilities } = await getCapabilities(supabase, ctx, org.id);
  if (!capabilities.question_paper_builder) notFound();

  const [{ data: bank }, { data: templates }, { data: gradingSystems }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, type, prompt, prompt_doc, points, status, topic, config")
      .eq("organization_id", org.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("exam_paper_templates")
      .select("id, name, is_default")
      .eq("organization_id", org.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("grading_systems")
      .select("id, name, curriculum, config")
      .eq("organization_id", org.id)
      .eq("status", "active")
      .order("name"),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Question Paper Builder · New paper"
        title="New examination paper"
        subtitle="Assemble published questions into an official paper with Section A and Section B, randomization, calculator and template settings."
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
