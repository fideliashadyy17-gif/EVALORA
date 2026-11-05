import { Badge, Button, Card, Input, PageTitle, Select } from "@/components/ui";
import { registerClassForExam } from "../actions/academics";
import { enterOrgWorkspace } from "../actions/orgs";
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
  searchParams: Promise<{ q?: string; status?: string; org?: string; saved?: string; e?: string; ok?: string }>;
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
  if (sp.org) query = query.eq("organization_id", sp.org);
  const [{ data: exams }, { data: orgList }, { data: classList }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("classes").select("id, name, organization_id").order("name").limit(1000),
  ]);

  return (
    <>
      <PageTitle
        title="Examination management"
        subtitle="Create and run formal examinations in any workspace, register whole classes as candidates, and control exam windows platform-wide."
        action={
          <form action={enterOrgWorkspace} className="flex items-end gap-2">
            <input type="hidden" name="next" value="/dashboard/exams/new" />
            <Select name="organization_id" className="w-52" aria-label="Organization for new examination">
              {(orgList ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
            <Button type="submit" variant="gold">+ Create examination</Button>
          </form>
        }
      />
      {sp.ok === "candidates_added" && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Class registered — candidate access codes are ready in the workspace.</p>}
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
        <select name="org" defaultValue={sp.org ?? ""} className="rounded-lg border border-evergreen-900/55 bg-white px-3 py-2.5 text-sm">
          <option value="">All organizations</option>
          {(orgList ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
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
                    <span className="mt-1 flex flex-wrap gap-3 text-xs">
                      <form action={enterOrgWorkspace} className="inline">
                        <input type="hidden" name="organization_id" value={e.organization_id} />
                        <input type="hidden" name="next" value={`/dashboard/exams/${e.id}`} />
                        <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Manage / candidates / marking →</button>
                      </form>
                      <a className="font-medium text-gold-800 underline-offset-2 hover:underline" href={`/admin/examinations/invitations?exam=${e.id}`}>Access link & code</a>
                      <form action={enterOrgWorkspace} className="inline">
                        <input type="hidden" name="organization_id" value={e.organization_id} />
                        <input type="hidden" name="next" value={`/dashboard/exams/${e.id}/paper`} />
                        <button className="font-medium text-gold-800 underline-offset-2 hover:underline">Print paper</button>
                      </form>
                      <form action={enterOrgWorkspace} className="inline">
                        <input type="hidden" name="organization_id" value={e.organization_id} />
                        <input type="hidden" name="next" value={`/dashboard/reports/exam/${e.id}`} />
                        <button className="font-medium text-gold-800 underline-offset-2 hover:underline">Results</button>
                      </form>
                    </span>
                    <form action={registerClassForExam} className="mt-1.5 flex items-center gap-1.5">
                      <input type="hidden" name="exam_id" value={e.id} />
                      <input type="hidden" name="back" value="/admin/examinations" />
                      <select name="class_id" className="max-w-[180px] rounded-lg border border-evergreen-900/55 bg-white px-2 py-1 text-xs">
                        {(classList ?? []).filter((c) => c.organization_id === e.organization_id).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">Register class as candidates</button>
                    </form>
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
