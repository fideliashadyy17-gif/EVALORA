import { PageTitle, ButtonLink, Badge, Card, StatCard } from "@/components/ui";
import { activeOrg, can, PROCTOR_ROLES, requireUser } from "@/lib/auth";
import { getCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Live examination monitoring" };
export const dynamic = "force-dynamic";

interface MonitorExam {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  starts_at: string | null;
  ends_at: string | null;
}

interface ActiveAttemptExam {
  id: string;
  organization_id: string;
  title: string;
  status: string;
  duration_minutes: number;
  starts_at: string | null;
  ends_at: string | null;
}

/**
 * Read-only index into the existing per-examination live monitor. It deliberately
 * does not create a parallel monitoring stream or touch attempts, answers, clocks,
 * access links, or examination state. The detailed monitor owns its Realtime feed.
 */
export default async function LiveMonitoringPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, PROCTOR_ROLES)) redirect("/dashboard");

  const supabase = await createClient();
  const { capabilities } = await getCapabilities(supabase, ctx, org.id);
  if (!capabilities.examinations) redirect("/dashboard/exams?e=module");

  const [openResult, activeResult] = await Promise.all([
    supabase
      .from("exams")
      .select("id, title, status, duration_minutes, starts_at, ends_at")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .in("status", ["open", "paused"])
      .order("starts_at", { ascending: true, nullsFirst: true })
      .limit(200),
    supabase
      .from("exam_attempts")
      .select("exam_id, exams!inner(id, organization_id, title, status, duration_minutes, starts_at, ends_at)")
      .eq("exams.organization_id", org.id)
      .eq("status", "in_progress")
      .limit(2000),
  ]);

  const exams = new Map<string, MonitorExam>();
  for (const row of (openResult.data ?? []) as MonitorExam[]) exams.set(row.id, row);

  const activeCounts = new Map<string, number>();
  for (const row of (activeResult.data ?? []) as unknown as { exam_id: string; exams: ActiveAttemptExam | null }[]) {
    const exam = row.exams;
    // Keep the organization check explicit as a defense-in-depth tenant boundary,
    // in addition to the relation filter and the caller's RLS policy.
    if (!exam || exam.organization_id !== org.id) continue;
    exams.set(exam.id, exam);
    activeCounts.set(exam.id, (activeCounts.get(exam.id) ?? 0) + 1);
  }

  const rows = [...exams.values()].sort((a, b) => {
    const liveRank = (status: string) => status === "open" ? 0 : status === "paused" ? 1 : 2;
    return liveRank(a.status) - liveRank(b.status) || a.title.localeCompare(b.title);
  });
  const candidateCount = [...activeCounts.values()].reduce((sum, count) => sum + count, 0);
  const openCount = rows.filter((exam) => exam.status === "open").length;
  const pausedCount = rows.filter((exam) => exam.status === "paused").length;
  const hasQueryError = Boolean(openResult.error || activeResult.error);

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Live supervision"
        title="Live examination monitoring"
        subtitle="Choose an examination to view its existing real-time candidate monitor. Candidate connection, saved-answer progress, remaining time, alerts and supervision messages stay in the examination’s own monitor."
        action={<ButtonLink href="/dashboard/exams" variant="outline">Examination management</ButtonLink>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Candidates composing" value={hasQueryError ? "Unavailable" : candidateCount} hint="In-progress attempts across this organization" />
        <StatCard label="Open examinations" value={hasQueryError ? "Unavailable" : openCount} hint="Accepting candidates when their access window permits" />
        <StatCard label="Paused examinations" value={hasQueryError ? "Unavailable" : pausedCount} hint="Existing attempts remain in their preserved pause state" />
      </div>
      {hasQueryError && (
        <p role="alert" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The monitoring overview could not load a complete snapshot. Counts may be incomplete; open an examination&apos;s live monitor to refresh its own server-backed view.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-evergreen-950">Examinations available to monitor</h2>
        <span className="text-sm text-ink-soft">{rows.length} examination{rows.length === 1 ? "" : "s"}</span>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6">
          <p className="font-semibold text-evergreen-950">
            {hasQueryError ? "Monitoring overview unavailable" : "No live or in-progress examinations"}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {hasQueryError
              ? "The live session list could not be confirmed. Open an examination from management to retry its individual monitor."
              : "When an examination is open or a candidate is composing, it will appear here. Existing examination data is unchanged."}
          </p>
          <ButtonLink className="mt-4" href="/dashboard/exams">View examinations</ButtonLink>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((exam) => {
            const active = activeCounts.get(exam.id) ?? 0;
            return (
              <Card key={exam.id} className="flex flex-col p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={exam.status === "open" ? "green" : exam.status === "paused" ? "amber" : "gray"}>{exam.status}</Badge>
                  <span className="text-sm text-ink-soft">{exam.duration_minutes} min</span>
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold text-evergreen-950">{exam.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">
                  {active} candidate{active === 1 ? "" : "s"} currently composing
                </p>
                {exam.starts_at && <p className="mt-1 text-xs text-ink-soft">Starts {fmtDateTime(exam.starts_at)}</p>}
                {exam.ends_at && <p className="mt-1 text-xs text-ink-soft">Exam closes {fmtDateTime(exam.ends_at)}</p>}
                <div className="mt-auto pt-5">
                  <Link
                    href={`/dashboard/exams/${exam.id}/monitor`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-evergreen-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-evergreen-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-evergreen-700"
                  >
                    Open live candidate monitor
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
