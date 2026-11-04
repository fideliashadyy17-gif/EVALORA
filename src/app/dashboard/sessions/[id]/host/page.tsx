import { PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostConsole } from "./HostConsole";

export const metadata: Metadata = { title: "Host console" };
export const dynamic = "force-dynamic";

export default async function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("quiz_sessions")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!session) notFound();

  const { data: quiz } = await supabase.from("quizzes").select("title, settings").eq("id", session.quiz_id).single();
  const settings = (quiz?.settings ?? {}) as Record<string, unknown>;

  const { data: qq } = await supabase
    .from("quiz_questions")
    .select("id, time_limit_seconds, questions(prompt, type)")
    .eq("quiz_id", session.quiz_id)
    .order("position");

  return (
    <>
      <PageTitle
        title={`Hosting: ${session.title ?? quiz?.title ?? "Live session"}`}
        subtitle="Control the round here — participants' screens update in real time."
      />
      <HostConsole
        session={session as never}
        questions={(qq ?? []).map((r) => ({
          id: r.id,
          prompt: (r.questions as unknown as { prompt: string }).prompt,
          type: (r.questions as unknown as { type: string }).type,
          time_limit_seconds: r.time_limit_seconds,
        }))}
        timePerQuestion={Number(settings.time_per_question_seconds ?? 30)}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </>
  );
}
