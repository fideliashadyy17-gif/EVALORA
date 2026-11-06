import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { activeOrg, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  const supabase = await createClient();

  const [{ data: sessions }, { data: exams }] = await Promise.all([
    supabase.from("quiz_sessions").select("*, quizzes(title), session_participants(id)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("exams").select("*, exam_attempts(id, status)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(30),
  ]);

  return (
    <>
      <PageTitle
        title="Reports & Analytics"
        subtitle="Performance across live sessions and examinations. Every report exports to CSV (Excel-ready) and prints cleanly to PDF."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Live quiz sessions</h2>
          {(sessions ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No sessions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10">
              {(sessions ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{s.title || (s.quizzes as { title: string } | null)?.title}</p>
                    <p className="text-xs text-ink-soft">{(s.session_participants as unknown[])?.length ?? 0} participants · {fmtDateTime(s.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.status === "ended" ? "gray" : "amber"}>{s.status}</Badge>
                    <Link href={`/dashboard/reports/session/${s.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Report</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Examinations</h2>
          {(exams ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No examinations yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-evergreen-900/10">
              {(exams ?? []).map((e) => {
                const attempts = (e.exam_attempts as { status: string }[]) ?? [];
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="text-xs text-ink-soft">{attempts.filter((a) => a.status !== "in_progress").length} submitted · {attempts.filter((a) => a.status === "in_progress").length} in progress</p>
                    </div>
                    <Link href={`/dashboard/reports/exam/${e.id}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Report</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      {(sessions ?? []).length === 0 && (exams ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="Nothing to report yet" body="Run a live quiz session or open an examination — analytics appear here automatically." />
        </div>
      )}
    </>
  );
}
