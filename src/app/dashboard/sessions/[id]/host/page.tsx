import { PageTitle } from "@/components/ui";
import { activeOrg, can, CREATOR_ROLES, requireUser } from "@/lib/auth";
import { publicScreenPath } from "@/lib/liveDisplayToken";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostConsole } from "./HostConsole";

export const metadata: Metadata = { title: "Host control screen" };
export const dynamic = "force-dynamic";

export default async function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org) notFound();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("quiz_sessions")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!session) notFound();

  // The host screen contains private answers, moderation and controls.
  // Organization membership alone is not organizer authorization.
  if (!can(ctx, org.id, CREATOR_ROLES) && session.host_id !== ctx.user.id) notFound();

  const [{ data: quiz }, { data: qq }, { data: competition }] = await Promise.all([
    supabase.from("quizzes").select("title, settings").eq("id", session.quiz_id).single(),
    supabase
      .from("quiz_questions")
      .select("id, time_limit_seconds, questions(prompt, prompt_doc, type)")
      .eq("quiz_id", session.quiz_id)
      .order("position"),
    supabase.from("competitions").select("id, title").eq("session_id", session.id).maybeSingle(),
  ]);
  const settings = (quiz?.settings ?? {}) as Record<string, unknown>;
  const screenPath = publicScreenPath(
    competition?.id ?? session.id,
    session.id,
    Number(session.display_token_version ?? 1),
  );

  return (
    <>
      <PageTitle
        title={`Host control: ${competition?.title ?? session.title ?? quiz?.title ?? "Live session"}`}
        subtitle="Private organizer screen. The public projection and student devices receive only their own authorized live state."
      />
      <HostConsole
        session={session as never}
        competition={competition}
        publicScreenPath={screenPath}
        questions={(qq ?? []).map((r) => ({
          id: r.id,
          prompt: (r.questions as unknown as { prompt: string }).prompt,
          prompt_doc:
            (r.questions as unknown as { prompt_doc?: import("@/lib/content").RichDoc | null }).prompt_doc ?? null,
          type: (r.questions as unknown as { type: string }).type,
          time_limit_seconds: r.time_limit_seconds,
        }))}
        timePerQuestion={Number(settings.time_per_question_seconds ?? 30)}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </>
  );
}
