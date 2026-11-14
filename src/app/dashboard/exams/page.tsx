import { FormButton } from "@/components/FormButton";
import { CollectionToolbar, type CollectionParams } from "@/components/dashboard/CollectionToolbar";
import { pageNumber } from "@/lib/pagination";
import { Badge, ButtonLink, Card, EmptyState, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { pauseExam, setExamStatus } from "./actions";

export const metadata: Metadata = { title: "Examinations" };
export const dynamic = "force-dynamic";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<CollectionParams & { e?: string; ok?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const supabase = await createClient();
  const page = pageNumber(sp.page);
  const pageSize = 18;
  const statuses = ["draft", "scheduled", "open", "paused", "closed"];
  let query = supabase.from("exams")
    .select("*, quizzes(title), exam_candidates(count), submitted_attempts:exam_attempts(count)", { count: "exact" })
    .eq("organization_id", org.id)
    .neq("submitted_attempts.status", "in_progress");
  const search = sp.q?.trim().slice(0, 160).replace(/[%_\\]/g, " ").trim();
  if (search) query = query.ilike("title", `%${search}%`);
  if (sp.status && statuses.includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.sort === "title") query = query.order("title");
  else query = query.order("created_at", { ascending: sp.sort === "oldest" });
  const { data: exams, count, error } = await query.order("id").range((page - 1) * pageSize, page * pageSize - 1);

  return (
    <>
      <PageTitle
        title="Examinations"
        subtitle="Formal, server-timed examinations with candidate admission, autosave and optional video proctoring."
        action={<ButtonLink href="/dashboard/exams/new">+ New examination</ButtonLink>}
      />
      {sp.ok && <p role="status" className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{sp.ok === "deleted" ? "Examination removed." : "Examination status updated."}</p>}
      {(sp.e === "delete" || sp.e === "status" || sp.e === "candidate" || sp.e === "incident") && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{sp.e === "delete" ? "The examination could not be removed. Examinations with recorded attempts are protected from deletion." : "The requested change could not be confirmed. Check your workspace and permissions."}</p>}
      {sp.e === "limit" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your current plan has reached its examination limit. See <Link className="font-semibold underline" href="/dashboard/billing">Billing</Link> to upgrade.
        </p>
      )}
      {sp.e === "module" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The Examinations module is temporarily disabled platform-wide by the administrator. Existing examinations are unaffected.
        </p>
      )}
      {sp.e === "proctoring" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Video proctoring is a Premium feature. Start a trial or upgrade in <Link className="font-semibold underline" href="/dashboard/billing">Billing</Link>.
        </p>
      )}

      <CollectionToolbar path="/dashboard/exams" params={{ q: sp.q, status: sp.status, sort: sp.sort }} statuses={statuses} page={page} pageSize={pageSize} total={count ?? 0} noun="examinations" failed={Boolean(error)} />
      {error ? null : (exams ?? []).length === 0 ? (
        <EmptyState
          title={sp.q || sp.status || page > 1 ? "No examinations on this page" : "No examinations yet"}
          body="Create an examination from a published quiz, register candidates with personal access codes, and open it when ready."
          action={<ButtonLink href="/dashboard/exams/new">Create an examination</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(exams ?? []).map((e) => {
            const settings = (e.settings ?? {}) as Record<string, unknown>;
            const submitted = (e.submitted_attempts as { count: number }[])?.[0]?.count ?? 0;
            return (
              <Card key={e.id} className="flex flex-col p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.status === "open" ? "amber" : e.status === "paused" ? "gold" : e.status === "closed" ? "gray" : "green"}>{e.status}</Badge>
                  {Boolean(settings.proctoring) && (
                    <Badge tone="gold"><Video className="h-3.5 w-3.5" /> Proctored</Badge>
                  )}
                  <span className="text-xs text-ink-soft">{e.duration_minutes} min</span>
                </div>
                <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">{e.title}</h2>
                <p className="mt-1 flex-1 text-sm text-ink-soft">
                  Paper: {(e.quizzes as { title: string } | null)?.title ?? "—"} · {(e.exam_candidates as { count: number }[])?.[0]?.count ?? 0} candidates · {submitted} submitted
                </p>
                <p className="mt-2 text-xs text-ink-soft">
                  Exam code <span className="font-mono font-bold text-evergreen-800">{e.access_code}</span> · Created {fmtDateTime(e.created_at)}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-evergreen-900/10 pt-4 text-sm">
                  <Link href={`/dashboard/exams/${e.id}`} className="inline-flex min-h-11 items-center font-semibold text-evergreen-700 underline-offset-2 hover:underline">Manage</Link>
                  {e.status === "paused" ? (
                    /* Resuming a paused exam runs the pause RPC (credits every
                       frozen attempt) — the plain open toggle can never do it. */
                    <form action={pauseExam}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="pause_action" value="resume" /><FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 text-gold-700 underline-offset-2 hover:underline">Resume</FormButton></form>
                  ) : e.status !== "open" ? (
                    <form action={setExamStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="open" /><FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 text-gold-700 underline-offset-2 hover:underline">Open exam</FormButton></form>
                  ) : (
                    <form action={setExamStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="closed" /><FormButton type="submit" className="inline-flex min-h-11 items-center gap-2 text-red-700 underline-offset-2 hover:underline">Close</FormButton></form>
                  )}
                  <Link href={`/dashboard/reports/exam/${e.id}`} className="text-ink-soft underline-offset-2 hover:underline">Report</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
