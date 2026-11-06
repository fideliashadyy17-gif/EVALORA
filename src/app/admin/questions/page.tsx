import { Badge, Button, ButtonLink, Card, Input, PageTitle, Select } from "@/components/ui";
import { RichContent } from "@/components/RichContent";
import type { RichDoc } from "@/lib/content";
import { ExportButton } from "@/components/ExportTools";
import { toCsv } from "@/lib/utils";
import { enterOrgWorkspace } from "../actions/orgs";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import { adminDeleteQuestion, adminSetQuestionStatus } from "../actions";
import { duplicateQuestionAsAdmin, setQuestionReview } from "./actions";
import { Notice } from "../ui";

export const metadata: Metadata = { title: "Question Bank" };
export const dynamic = "force-dynamic";

const tone = (s: string) =>
  (s === "published" ? "green" : s === "pending_review" ? "amber" : "gray") as "green" | "amber" | "gray";

export default async function AdminQuestions({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; class?: string; curr?: string; review?: string; saved?: string; e?: string; ok?: string; n?: string; dup?: string; short?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("questions")
    .select("*, organizations(name), classes(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.ilike("prompt", `%${sp.q}%`);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.class) query = query.eq("class_id", sp.class);
  if (sp.curr) query = query.eq("curriculum", sp.curr);
  if (sp.review) query = query.eq("review_status", sp.review);
  const [{ data: questions }, { data: orgList }, { data: classList }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    sp.org
      ? admin.from("classes").select("id, name, organization_id").eq("organization_id", sp.org).order("grade_order").order("name").limit(500)
      : admin.from("classes").select("id, name, organization_id").order("name").limit(500),
  ]);
  const orgNameById = new Map((orgList ?? []).map((o) => [o.id, o.name]));
  const back = `/admin/questions${sp.org || sp.class ? `?${new URLSearchParams({ ...(sp.org ? { org: sp.org } : {}), ...(sp.class ? { class: sp.class } : {}), ...(sp.review ? { review: sp.review } : {}) }).toString()}` : ""}`;
  const exportCsv = toCsv([
    ["Prompt", "Type", "Difficulty", "Points", "Status", "Organization", "Topic", "Tags"],
    ...(questions ?? []).map((q) => [
      q.prompt, q.type, q.difficulty, Number(q.points), q.status,
      (q.organizations as { name?: string } | null)?.name ?? "", q.topic ?? "", (q.tags as string[] | null)?.join("; ") ?? "",
    ]),
  ]);
  const { count: pendingCount } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");

  return (
    <>
      <PageTitle
        title="Question bank (platform-wide)"
        subtitle={`Author with the unified mathematical editor, import, moderate and reuse questions platform-wide. ${pendingCount ?? 0} currently pending review.`}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <ButtonLink href={sp.org ? `/admin/questions/new?org=${sp.org}` : "/admin/questions/new"} variant="gold">+ Create question</ButtonLink>
            <form action={enterOrgWorkspace} className="flex items-end gap-2">
              <input type="hidden" name="next" value="/dashboard/questions/new" />
              <Select name="organization_id" className="w-52" aria-label="Organization for new question">
                {(orgList ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
              <Button type="submit" variant="outline">Add in workspace</Button>
            </form>
            <ExportButton filename="questions.csv" csv={exportCsv} label="Export listed" />
          </div>
        }
      />
      <Notice ok={sp.ok} e={sp.e} messages={{ duplicated: "Question duplicated as a draft.", duplicate_failed: "The question could not be duplicated.", confirm: "Tick the confirmation box before deleting.", not_ready: "That question cannot be approved/published yet — it needs at least two options with a correct answer marked. Open Answers & Solutions to see what is missing.", not_found: "That question no longer exists.", generated: `Generation complete: ${sp.n ?? 0} new questions added as Pending review${sp.dup && sp.dup !== "0" ? `, ${sp.dup} duplicates skipped` : ""}${sp.short && sp.short !== "0" ? `, shortfall of ${sp.short} reported (not padded with repeats)` : ""}. Review and approve them below.`, review_approved: "Question approved and published to its class pool.", review_rejected: "Question rejected (kept as draft for correction).", review_reviewed: "Marked as reviewed — still needs approval before competition use.", review_archived: "Question archived.", review_draft: "Question sent back to draft." }} />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}
      {sp.e === "confirm" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Tick the confirmation box before deleting.</p>}

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search question text…" className="max-w-sm" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-evergreen-900/55 bg-white px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="pending_review">Pending review</option>
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
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-4 py-3 font-semibold">Question</th>
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Difficulty</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Change status</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {(questions ?? []).map((q) => (
              <tr key={q.id} className="border-b border-evergreen-900/10">
                <td className="max-w-xs px-4 py-2.5">
                  <div className="line-clamp-3 font-medium" title={q.prompt}><RichContent doc={(q.prompt_doc as RichDoc | null) ?? null} text={q.prompt} /></div>
                  {q.topic && <span className="block text-xs text-ink-soft">{q.topic}</span>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <a href={`/admin/questions/${q.id}`} className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">Edit with math editor →</a>
                    <form action={duplicateQuestionAsAdmin} className="inline">
                      <input type="hidden" name="id" value={q.id} />
                      <input type="hidden" name="back" value="/admin/questions" />
                      <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Duplicate</button>
                    </form>
                    <form action={enterOrgWorkspace} className="inline">
                      <input type="hidden" name="organization_id" value={q.organization_id} />
                      <input type="hidden" name="next" value={`/dashboard/questions/${q.id}`} />
                      <button className="font-medium text-gold-800 underline-offset-2 hover:underline">Workspace</button>
                    </form>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{(q.organizations as { name?: string } | null)?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-soft">
                  <span className="block font-medium text-ink">{(q.classes as { name?: string } | null)?.name ?? "—"}</span>
                  {q.curriculum_course && <span className="block text-xs">{q.curriculum_course}</span>}
                  {q.curriculum && <span className="block text-xs">{String(q.curriculum).toUpperCase()}{q.creation_method === "ai_generated" ? " · Generated" : ""}</span>}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{String(q.type).replace(/_/g, " ")}</td>
                <td className="px-4 py-2.5 text-ink-soft">{q.difficulty}</td>
                <td className="px-4 py-2.5"><Badge tone={tone(q.status)}>{String(q.status).replace(/_/g, " ")}</Badge></td>
                <td className="px-4 py-2.5">
                  <Badge tone={q.review_status === "approved" ? "green" : q.review_status === "rejected" ? "gray" : "amber"}>{String(q.review_status ?? "draft")}</Badge>
                  <div className="mt-1.5 flex flex-wrap gap-x-2 text-xs">
                    {q.review_status !== "approved" && (
                      <form action={setQuestionReview} className="inline"><input type="hidden" name="id" value={q.id} /><input type="hidden" name="review" value="approved" /><input type="hidden" name="back" value={back} /><button className="font-semibold text-emerald-800 underline-offset-2 hover:underline">Approve</button></form>
                    )}
                    {q.review_status !== "rejected" && (
                      <form action={setQuestionReview} className="inline"><input type="hidden" name="id" value={q.id} /><input type="hidden" name="review" value="rejected" /><input type="hidden" name="back" value={back} /><button className="font-medium text-red-700 underline-offset-2 hover:underline">Reject</button></form>
                    )}
                    {q.review_status !== "archived" && (
                      <form action={setQuestionReview} className="inline"><input type="hidden" name="id" value={q.id} /><input type="hidden" name="review" value="archived" /><input type="hidden" name="back" value={back} /><button className="font-medium text-ink-soft underline-offset-2 hover:underline">Archive</button></form>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{fmtDate(q.created_at)}</td>
                <td className="px-4 py-2.5">
                  <form action={adminSetQuestionStatus} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={q.id} />
                    <select name="status" defaultValue={q.status} className="rounded-lg border border-evergreen-900/55 bg-white px-2 py-1.5 text-xs">
                      <option value="draft">draft</option>
                      <option value="pending_review">pending review</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                    <button className="text-xs font-medium text-evergreen-700 underline-offset-2 hover:underline">Apply</button>
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <form action={adminDeleteQuestion} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={q.id} />
                    <label className="flex items-center gap-1 text-xs text-ink-soft">
                      <input type="checkbox" name="confirm" required className="h-4 w-4 accent-red-700" /> sure?
                    </label>
                    <button className="text-sm font-medium text-red-700 underline-offset-2 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {(questions ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-soft">No questions match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
