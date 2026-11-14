import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CheckCircle2, Clock3, FileCheck2, ShieldCheck, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { pauseExam, setExamStatus } from "./actions";

export const metadata: Metadata = { title: "Examinations" };
export const dynamic = "force-dynamic";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; ok?: string; q?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const sp = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 12;
  let examQuery = supabase
    .from("exams")
    .select("*, quizzes(title), exam_candidates(id), exam_attempts(id, status)", { count: "exact" })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });
  if (sp.q?.trim()) examQuery = examQuery.ilike("title", `%${sp.q.trim()}%`);
  if (sp.status) examQuery = examQuery.eq("status", sp.status);
  const [
    { data: exams, count: examTotal },
    { count: openCount },
    { count: scheduledCount },
    { count: closedCount },
  ] = await Promise.all([
    examQuery.range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["open", "paused"]),
    supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["draft", "scheduled"]),
    supabase.from("exams").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "closed"),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Institutional Assessment Suite"
        title="Examinations"
        subtitle="Formal, server-timed examinations with candidate admission, autosave and optional video proctoring."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/rubrics" variant="outline">Grading rubrics</ButtonLink>
            <ButtonLink href="/dashboard/exams/new">+ New examination</ButtonLink>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Matching examinations" value={examTotal ?? 0} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Open / paused" value={openCount ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Draft / scheduled" value={scheduledCount ?? 0} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Closed" value={closedCount ?? 0} icon={<ShieldCheck className="h-5 w-5" />} />
      </div>
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

      <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-evergreen-900/10 bg-paper p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto_auto] sm:items-end">
        <label className="block text-sm font-medium text-evergreen-900">Search examinations
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Examination title" className="mt-1.5" />
        </label>
        <label className="block text-sm font-medium text-evergreen-900">Status
          <Select name="status" defaultValue={sp.status ?? ""} className="mt-1.5">
            <option value="">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="open">Open</option><option value="paused">Paused</option><option value="closed">Closed</option>
          </Select>
        </label>
        <Button type="submit" variant="outline">Apply filters</Button>
        <Link href="/dashboard/exams" className="inline-flex min-h-11 items-center text-sm font-medium text-evergreen-800 underline underline-offset-2">Clear</Link>
      </form>

      {(exams ?? []).length === 0 ? (
        <EmptyState
          title={sp.q || sp.status ? "No examinations match these filters" : "No examinations yet"}
          body={sp.q || sp.status ? "Try another search or clear the filters. Existing examination records are unchanged." : "Create an examination from a published quiz, register candidates with personal access codes, and open it when ready."}
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
                  <Badge tone={e.status === "open" ? "amber" : e.status === "paused" ? "gold" : e.status === "closed" ? "gray" : "green"}>{e.status}</Badge>
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
                  {e.status === "paused" ? (
                    /* Resuming a paused exam runs the pause RPC (credits every
                       frozen attempt) — the plain open toggle can never do it. */
                    <form action={pauseExam}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="pause_action" value="resume" /><button className="text-gold-700 underline-offset-2 hover:underline">Resume</button></form>
                  ) : e.status !== "open" ? (
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
      <PageNavigation page={page} pageSize={pageSize} total={examTotal ?? 0} pathname="/dashboard/exams" query={{ q: sp.q, status: sp.status }} label="examinations" />
    </>
  );
}
