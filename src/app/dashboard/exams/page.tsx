import { Badge, ButtonLink, Card, EmptyState, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setExamStatus } from "./actions";

export const metadata: Metadata = { title: "Examinations" };
export const dynamic = "force-dynamic";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: exams } = await supabase
    .from("exams")
    .select("*, quizzes(title), exam_candidates(id), exam_attempts(id, status)")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageTitle
        title="Examinations"
        subtitle="Formal, server-timed examinations with candidate admission, autosave and optional video proctoring."
        action={<ButtonLink href="/dashboard/exams/new">+ New examination</ButtonLink>}
      />
      {sp.e === "limit" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your current plan has reached its examination limit. See <Link className="font-semibold underline" href="/dashboard/billing">Billing</Link> to upgrade.
        </p>
      )}
      {sp.e === "proctoring" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Video proctoring is a Premium feature. Start a trial or upgrade in <Link className="font-semibold underline" href="/dashboard/billing">Billing</Link>.
        </p>
      )}

      {(exams ?? []).length === 0 ? (
        <EmptyState
          title="No examinations yet"
          body="Create an examination from a published quiz, register candidates with personal access codes, and open it when ready."
          action={<ButtonLink href="/dashboard/exams/new">Create an examination</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(exams ?? []).map((e) => {
            const settings = (e.settings ?? {}) as Record<string, unknown>;
            const attempts = (e.exam_attempts as { status: string }[]) ?? [];
            const submitted = attempts.filter((a) => a.status !== "in_progress").length;
            return (
              <Card key={e.id} className="flex flex-col p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.status === "open" ? "amber" : e.status === "closed" ? "gray" : "green"}>{e.status}</Badge>
                  {Boolean(settings.proctoring) && (
                    <Badge tone="gold"><Video className="h-3.5 w-3.5" /> Proctored</Badge>
                  )}
                  <span className="text-xs text-ink-soft">{e.duration_minutes} min</span>
                </div>
                <h2 className="mt-2 font-display text-lg font-semibold text-evergreen-950">{e.title}</h2>
                <p className="mt-1 flex-1 text-sm text-ink-soft">
                  Paper: {(e.quizzes as { title: string } | null)?.title ?? "—"} · {(e.exam_candidates as unknown[])?.length ?? 0} candidates · {submitted} submitted
                </p>
                <p className="mt-2 text-xs text-ink-soft">
                  Exam code <span className="font-mono font-bold text-evergreen-800">{e.access_code}</span> · Created {fmtDateTime(e.created_at)}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-evergreen-900/10 pt-4 text-sm">
                  <Link href={`/dashboard/exams/${e.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Manage</Link>
                  {e.status !== "open" ? (
                    <form action={setExamStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="open" /><button className="text-gold-700 underline-offset-2 hover:underline">Open exam</button></form>
                  ) : (
                    <form action={setExamStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="closed" /><button className="text-red-700 underline-offset-2 hover:underline">Close</button></form>
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
