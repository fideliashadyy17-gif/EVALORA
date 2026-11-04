import { Badge, Button, Card, Input, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { adminSetExamStatus } from "../actions";

export const metadata: Metadata = { title: "Examinations" };
export const dynamic = "force-dynamic";

const tone = (s: string) =>
  (s === "open" ? "green" : s === "scheduled" ? "amber" : "gray") as "green" | "amber" | "gray";

export default async function AdminExaminations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; saved?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("exams")
    .select("*, organizations(name), exam_candidates(count), exam_attempts(count)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.ilike("title", `%${sp.q}%`);
  const { data: exams } = await query;

  return (
    <>
      <PageTitle
        title="Examination management"
        subtitle="All formal examinations platform-wide. Closing an exam blocks new admissions immediately; in-progress attempts keep their server deadline."
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search exam title…" className="max-w-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-evergreen-900/55 bg-white px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="scheduled">Scheduled</option>
          <option value="draft">Draft</option>
          <option value="closed">Closed</option>
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Examination</th>
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Window</th>
              <th className="px-4 py-3 font-semibold">Candidates / attempts</th>
              <th className="px-4 py-3 font-semibold">Proctoring</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Change status</th>
            </tr>
          </thead>
          <tbody>
            {(exams ?? []).map((e) => {
              const proctored = Boolean((e.settings as Record<string, unknown> | null)?.proctoring);
              return (
                <tr key={e.id} className="border-b border-evergreen-900/10">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{e.title}</span>
                    <span className="block font-mono text-xs text-ink-soft">access code {e.access_code} · {e.duration_minutes} min</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{(e.organizations as { name?: string } | null)?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {e.starts_at ? fmtDateTime(e.starts_at) : "—"} → {e.ends_at ? fmtDateTime(e.ends_at) : "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {(e.exam_candidates as { count: number }[] | null)?.[0]?.count ?? 0} / {(e.exam_attempts as { count: number }[] | null)?.[0]?.count ?? 0}
                  </td>
                  <td className="px-4 py-2.5">{proctored ? <Badge tone="gold">Video</Badge> : <Badge tone="gray">Off</Badge>}</td>
                  <td className="px-4 py-2.5"><Badge tone={tone(e.status)}>{e.status}</Badge></td>
                  <td className="px-4 py-2.5">
                    <form action={adminSetExamStatus} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={e.id} />
                      <select name="status" defaultValue={e.status} className="rounded-lg border border-evergreen-900/55 bg-white px-2 py-1.5 text-xs">
                        <option value="draft">draft</option>
                        <option value="scheduled">scheduled</option>
                        <option value="open">open</option>
                        <option value="closed">closed</option>
                      </select>
                      <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">Apply</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(exams ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">No examinations match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
