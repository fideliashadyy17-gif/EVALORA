import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { RichContent } from "@/components/RichContent";
import type { RichDoc } from "@/lib/content";
import { ExportButton } from "@/components/ExportTools";
import { toCsv } from "@/lib/utils";
import { enterOrgWorkspace } from "../actions/orgs";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { BookOpen, CheckCircle2, Clock, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { adminDeleteQuestion, adminSetQuestionStatus } from "../actions";
import { duplicateQuestionAsAdmin, setQuestionReview } from "./actions";
import { Notice, Table } from "../ui";
import Link from "next/link";

export const metadata: Metadata = { title: "Question Bank" };
export const dynamic = "force-dynamic";

const tone = (s: string) =>
  (s === "published" ? "green" : s === "pending_review" ? "amber" : "gray") as "green" | "amber" | "gray";

export default async function AdminQuestions({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; class?: string; curr?: string; review?: string; type?: string; saved?: string; e?: string; ok?: string; n?: string; dup?: string; short?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();

  let query = admin
    .from("questions")
    .select("*, organizations(name), classes(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.ilike("prompt", `%${sp.q}%`);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.class) query = query.eq("class_id", sp.class);
  if (sp.curr) query = query.eq("curriculum", sp.curr);
  if (sp.review) query = query.eq("review_status", sp.review);
  if (sp.type) query = query.eq("type", sp.type);
  const [{ data: questions, count: filteredTotal }, { data: orgList }, { data: classList }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    sp.org
      ? admin.from("classes").select("id, name, organization_id").eq("organization_id", sp.org).order("grade_order").order("name").limit(500)
      : admin.from("classes").select("id, name, organization_id").order("name").limit(500),
  ]);
  const back = `/admin/questions${sp.org || sp.class ? `?${new URLSearchParams({ ...(sp.org ? { org: sp.org } : {}), ...(sp.class ? { class: sp.class } : {}), ...(sp.review ? { review: sp.review } : {}) }).toString()}` : ""}`;
  const exportCsv = toCsv([
    ["Prompt", "Type", "Difficulty", "Points", "Status", "Organization", "Topic", "Tags"],
    ...(questions ?? []).map((q) => [
      q.prompt, q.type, q.difficulty, Number(q.points), q.status,
      (q.organizations as { name?: string } | null)?.name ?? "", q.topic ?? "", (q.tags as string[] | null)?.join("; ") ?? "",
    ]),
  ]);
  const head = { count: "exact" as const, head: true };
  const [pendingCount, publishedCount, approvedReviewCount, totalBankCount] = await Promise.all([
    admin.from("questions").select("id", head).eq("status", "pending_review").then((r) => r.count ?? 0),
    admin.from("questions").select("id", head).eq("status", "published").then((r) => r.count ?? 0),
    admin.from("questions").select("id", head).eq("review_status", "approved").then((r) => r.count ?? 0),
    admin.from("questions").select("id", head).then((r) => r.count ?? 0),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Platform Question Bank"
        title="Question bank (platform-wide)"
        subtitle={`Author with the unified mathematical editor, import, moderate and reuse questions platform-wide. ${pendingCount} currently pending review.`}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <ButtonLink href={sp.org ? `/admin/questions/new?org=${sp.org}` : "/admin/questions/new"} variant="gold">+ Create question</ButtonLink>
            <ButtonLink href={sp.org ? `/admin/questions/generate?org=${sp.org}` : "/admin/questions/generate"} variant="outline">Generate batch</ButtonLink>
            <form action={enterOrgWorkspace} className="flex items-end gap-2">
              <input type="hidden" name="next" value="/dashboard/questions/new" />
              <Select name="organization_id" className="w-52" aria-label="Organization for new question">
                {(orgList ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
              <Button type="submit" variant="outline">Add in workspace</Button>
            </form>
            <ExportButton filename="questions.csv" csv={exportCsv} label="Export this page" />
          </div>
        }
      />
      <Notice ok={sp.ok} e={sp.e} messages={{ duplicated: "Question duplicated as a draft.", duplicate_failed: "The question could not be duplicated.", confirm: "Tick the confirmation box before deleting.", not_ready: "That question cannot be approved/published yet — it needs at least two options with a correct answer marked. Open Answers & Solutions to see what is missing.", not_found: "That question no longer exists.", generated: `Generation complete: ${sp.n ?? 0} new questions added as Pending review${sp.dup && sp.dup !== "0" ? `, ${sp.dup} duplicates skipped` : ""}${sp.short && sp.short !== "0" ? `, shortfall of ${sp.short} reported (not padded with repeats)` : ""}. Review and approve them below.`, review_approved: "Question approved and published to its class pool.", review_rejected: "Question rejected (kept as draft for correction).", review_reviewed: "Marked as reviewed — still needs approval before competition use.", review_archived: "Question archived.", review_draft: "Question sent back to draft." }} />
      {sp.saved && <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">Done — the change is in the audit log.</p>}
      {sp.e === "confirm" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Tick the confirmation box before deleting.</p>}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total bank items" value={totalBankCount} icon={<BookOpen className="h-5 w-5" />} />
        <StatCard label="Published items" value={publishedCount} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Approved for competition" value={approvedReviewCount} icon={<Sparkles className="h-5 w-5" />} />
        <StatCard label="Pending review" value={pendingCount} icon={<Clock className="h-5 w-5" />} />
      </div>

      <form method="get" className="mb-4 grid gap-3 rounded-2xl border border-evergreen-900/10 bg-paper p-4 sm:grid-cols-2 xl:grid-cols-5">
        <Input name="q" defaultValue={sp.q} placeholder="Search question text…" aria-label="Search question text" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Filter by question status">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="pending_review">Pending review</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <Select name="org" defaultValue={sp.org ?? ""} aria-label="Filter by organization">
          <option value="">All organizations</option>
          {(orgList ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="class" defaultValue={sp.class ?? ""} aria-label="Filter by class">
          <option value="">All classes</option>
          {(classList ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="review" defaultValue={sp.review ?? ""} aria-label="Filter by review state">
          <option value="">All review states</option>
          <option value="draft">Draft review</option>
          <option value="reviewed">Reviewed</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="archived">Archived</option>
        </Select>
        <Select name="type" defaultValue={sp.type ?? ""} aria-label="Filter by question type">
          <option value="">All question types</option>
          <option value="single_choice">Single choice</option><option value="multiple_select">Multiple select</option>
          <option value="true_false">True or false</option><option value="short_answer">Short answer</option>
          <option value="numeric">Numeric</option><option value="ordering">Ordering</option>
          <option value="matching">Matching</option><option value="open_ended">Open ended</option>
          <option value="assess_parts">Assess parts</option><option value="slide">Slide</option>
        </Select>
        <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-5">
          <Button type="submit" variant="outline">Apply filters</Button>
          <Link href="/admin/questions" className="text-sm font-medium text-evergreen-800 underline underline-offset-2">Clear filters</Link>
        </div>
      </form>

      <Table head={["Question", "Organization", "Class & Curriculum", "Type", "Difficulty", "Status", "Editorial Review", "Created", "Change status", "Delete"]}>
        {(questions ?? []).map((q) => (
          <tr key={q.id}>
            <td className="max-w-xs">
              <div className="line-clamp-3 font-medium" title={q.prompt}><RichContent doc={(q.prompt_doc as RichDoc | null) ?? null} text={q.prompt} /></div>
              {q.topic && <span className="block text-xs text-ink-soft">{q.topic}</span>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <Link href={`/admin/questions/${q.id}`} className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">Edit with math editor →</Link>
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
            <td className="text-ink-soft">{(q.organizations as { name?: string } | null)?.name ?? "—"}</td>
            <td className="text-ink-soft">
              <span className="block font-medium text-ink">{(q.classes as { name?: string } | null)?.name ?? "—"}</span>
              {q.curriculum_course && <span className="block text-xs">{q.curriculum_course}</span>}
              {q.curriculum && <span className="block text-xs">{String(q.curriculum).toUpperCase()}{q.creation_method === "ai_generated" ? " · Generated" : ""}</span>}
            </td>
            <td className="text-ink-soft">{String(q.type).replace(/_/g, " ")}</td>
            <td className="text-ink-soft">{q.difficulty}</td>
            <td><Badge tone={tone(q.status)}>{String(q.status).replace(/_/g, " ")}</Badge></td>
            <td>
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
            <td className="text-ink-soft">{fmtDate(q.created_at)}</td>
            <td>
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
            <td>
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
          <tr><td colSpan={10} className="px-4 py-8 text-center text-ink-soft">No questions match this filter.</td></tr>
        )}
      </Table>
      <PageNavigation
        page={page}
        pageSize={pageSize}
        total={filteredTotal ?? 0}
        pathname="/admin/questions"
        query={{ q: sp.q, status: sp.status, org: sp.org, class: sp.class, curr: sp.curr, review: sp.review, type: sp.type }}
        label="questions"
      />
    </>
  );
}
