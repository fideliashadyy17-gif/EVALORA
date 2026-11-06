import { Badge, Button, Card, Input, PageTitle, Select } from "@/components/ui";
import { enterOrgWorkspace } from "../actions/orgs";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import { adminDeleteQuiz, adminSetQuizStatus } from "../actions";

export const metadata: Metadata = { title: "Quiz Management" };
export const dynamic = "force-dynamic";

const tone = (s: string) => (s === "published" ? "green" : s === "draft" ? "amber" : "gray") as "green" | "amber" | "gray";

export default async function AdminQuizzes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; saved?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("quizzes")
    .select("*, organizations(name), quiz_questions(count)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.ilike("title", `%${sp.q}%`);
  if (sp.org) query = query.eq("organization_id", sp.org);
  const [{ data: quizzes }, { data: orgList }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);

  return (
    <>
      <PageTitle
        title="Quiz management"
        subtitle="Create, edit, duplicate and run quizzes inside any organization's workspace — or moderate them from here. Deleting also removes sessions and results."
        action={
          <form action={enterOrgWorkspace} className="flex items-end gap-2">
            <input type="hidden" name="next" value="/dashboard/quizzes/new" />
            <Select name="organization_id" className="w-52" aria-label="Organization for new quiz">
              {(orgList ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
            <Button type="submit" variant="gold">+ Create quiz</Button>
          </form>
        }
      />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}
      {sp.e === "confirm" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Tick the confirmation box before deleting.</p>}

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search quiz title…" className="max-w-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-evergreen-900/55 bg-white px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
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
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Quiz</th>
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Questions</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 font-semibold">Change status</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {(quizzes ?? []).map((q) => (
              <tr key={q.id} className="border-b border-evergreen-900/10">
                <td className="px-4 py-2.5 font-medium">
                  {q.title}
                  <span className="mt-1 flex gap-3 text-xs font-normal">
                    <form action={enterOrgWorkspace} className="inline">
                      <input type="hidden" name="organization_id" value={q.organization_id} />
                      <input type="hidden" name="next" value={`/dashboard/quizzes/${q.id}`} />
                      <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Open / edit / host →</button>
                    </form>
                    <form action={enterOrgWorkspace} className="inline">
                      <input type="hidden" name="organization_id" value={q.organization_id} />
                      <input type="hidden" name="next" value="/dashboard/quizzes" />
                      <button className="font-medium text-gold-800 underline-offset-2 hover:underline">Quiz Studio</button>
                    </form>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{(q.organizations as { name?: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{(q.quiz_questions as { count: number }[] | null)?.[0]?.count ?? 0}</td>
                <td className="px-4 py-2.5"><Badge tone={tone(q.status)}>{q.status}</Badge></td>
                <td className="px-4 py-2.5 text-ink-soft">{fmtDate(q.updated_at)}</td>
                <td className="px-4 py-2.5">
                  <form action={adminSetQuizStatus} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={q.id} />
                    <select name="status" defaultValue={q.status} className="rounded-lg border border-evergreen-900/55 bg-white px-2 py-1.5 text-xs">
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                    <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">Apply</button>
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <form action={adminDeleteQuiz} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={q.id} />
                    <label className="flex items-center gap-1 text-xs text-ink-soft">
                      <input type="checkbox" name="confirm" required className="h-4 w-4 accent-red-700" /> sure?
                    </label>
                    <button className="text-sm font-medium text-red-700 underline-offset-2 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {(quizzes ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">No quizzes match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
