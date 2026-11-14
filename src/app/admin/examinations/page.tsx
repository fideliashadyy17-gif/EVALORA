import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { registerClassForExam } from "../actions/academics";
import { enterOrgWorkspace } from "../actions/orgs";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { CheckCircle2, FileCheck2, ShieldAlert, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { adminSetExamStatus } from "../actions";
import { Table } from "../ui";

export const metadata: Metadata = { title: "Examinations" };
export const dynamic = "force-dynamic";

const tone = (s: string) =>
  (s === "open" ? "green" : s === "scheduled" || s === "paused" ? "amber" : "gray") as "green" | "amber" | "gray";

export default async function AdminExaminations({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; exam?: string; saved?: string; e?: string; ok?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("exams")
    .select("*, organizations(name), exam_candidates(count), exam_attempts(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (sp.exam) query = query.eq("id", sp.exam);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.ilike("title", `%${sp.q}%`);
  if (sp.org) query = query.eq("organization_id", sp.org);
  const [
    { data: exams, count: filteredTotal },
    { data: orgList },
    { data: classList },
    { count: openCount },
    { count: scheduledCount },
    { count: closedCount },
  ] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("classes").select("id, name, organization_id").order("name").limit(1000),
    admin.from("exams").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("exams").select("id", { count: "exact", head: true }).in("status", ["scheduled", "paused"]),
    admin.from("exams").select("id", { count: "exact", head: true }).eq("status", "closed"),
  ]);

  const hasFilters = Boolean(sp.q || sp.status || sp.org || sp.exam);

  return (
    <>
      <PageTitle
        eyebrow="Examinations · Platform Assessment Register"
        title="Examination management"
        subtitle="Create and run formal examinations in any workspace, register whole classes as candidates, and control exam windows platform-wide."
        action={
          <div className="flex flex-wrap items-end gap-2">
            <ButtonLink href="/admin/examinations/retakes" variant="outline">Retake requests</ButtonLink>
            <ButtonLink href="/admin/examinations/links" variant="outline">Link expiration</ButtonLink>
            <ButtonLink href="/admin/examinations/hints" variant="outline">Question hints</ButtonLink>
            <form action={enterOrgWorkspace} className="flex items-end gap-2">
              <input type="hidden" name="next" value="/dashboard/exams/new" />
              <Select name="organization_id" className="w-52" aria-label="Organization for new examination">
                {(orgList ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
              <Button type="submit" variant="gold">+ Create examination</Button>
            </form>
          </div>
        }
      />
      {sp.ok === "candidates_added" && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Class registered — candidate access codes are ready in the workspace.</p>}
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Matching examinations" value={filteredTotal ?? 0} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Open now" value={openCount ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Scheduled / paused" value={scheduledCount ?? 0} icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label="Closed" value={closedCount ?? 0} icon={<Video className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search exam title…" className="max-w-sm" aria-label="Search exam title" />
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Status">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="scheduled">Scheduled</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
          <option value="closed">Closed</option>
        </Select>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgList ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {hasFilters && (
          <Link href="/admin/examinations" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      <Table head={["Examination", "Organization", "Window", "Candidates / attempts", "Proctoring", "Status", "Change status"]}>
        {(exams ?? []).map((e) => {
          const proctored = Boolean((e.settings as Record<string, unknown> | null)?.proctoring);
          return (
            <tr key={e.id}>
              <td>
                <span className="font-medium text-evergreen-950">{e.title}</span>
                <span className="block font-mono text-xs text-ink-soft">access code {e.access_code} · {e.duration_minutes} min</span>
                <span className="mt-1 flex flex-wrap gap-3 text-xs">
                  <form action={enterOrgWorkspace} className="inline">
                    <input type="hidden" name="organization_id" value={e.organization_id} />
                    <input type="hidden" name="next" value={`/dashboard/exams/${e.id}`} />
                    <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Manage / candidates / marking →</button>
                  </form>
                  <Link className="font-medium text-gold-800 underline-offset-2 hover:underline" href={`/admin/examinations/invitations?exam=${e.id}`}>Access link & code</Link>
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
                  <select name="class_id" aria-label="Class to register" className="max-w-[180px] rounded-lg border border-evergreen-900/55 bg-white px-2 py-1 text-xs">
                    {(classList ?? []).filter((c) => c.organization_id === e.organization_id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">Register class as candidates</button>
                </form>
              </td>
              <td className="text-ink-soft">{(e.organizations as { name?: string } | null)?.name ?? "—"}</td>
              <td className="text-ink-soft">
                {e.starts_at ? fmtDateTime(e.starts_at) : "—"} → {e.ends_at ? fmtDateTime(e.ends_at) : "—"}
              </td>
              <td className="tabular-nums">
                {(e.exam_candidates as { count: number }[] | null)?.[0]?.count ?? 0} / {(e.exam_attempts as { count: number }[] | null)?.[0]?.count ?? 0}
              </td>
              <td>{proctored ? <Badge tone="gold">Video</Badge> : <Badge tone="gray">Off</Badge>}</td>
              <td><Badge tone={tone(e.status)}>{e.status}</Badge></td>
              <td>
                <form action={adminSetExamStatus} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={e.id} />
                  <select name="status" defaultValue={e.status} aria-label="Change status" className="rounded-lg border border-evergreen-900/55 bg-white px-2 py-1.5 text-xs">
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
      </Table>
      <PageNavigation
        page={page}
        pageSize={pageSize}
        total={filteredTotal ?? 0}
        pathname="/admin/examinations"
        query={{ q: sp.q, status: sp.status, org: sp.org, exam: sp.exam }}
        label="examinations"
      />
    </>
  );
}
