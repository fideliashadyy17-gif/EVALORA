import { Badge, Button, ButtonLink, PageTitle, Select } from "@/components/ui";
import { RichContent } from "@/components/RichContent";
import { requireSuperAdmin } from "@/lib/auth";
import type { RichDoc } from "@/lib/content";
import { docIsEmpty } from "@/lib/content";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Table } from "../../ui";

export const metadata: Metadata = { title: "Answers and solutions" };
export const dynamic = "force-dynamic";

interface OptionRow {
  is_correct: boolean;
  label: string;
}

function answerReadiness(q: Record<string, unknown>, options: OptionRow[]) {
  const cfg = (q.config as Record<string, unknown> | null) ?? {};
  switch (q.type) {
    case "single_choice":
    case "multiple_select":
    case "true_false": {
      const correct = options.filter((o) => o.is_correct).length;
      return correct > 0
        ? { ok: true, label: `${correct} correct option${correct === 1 ? "" : "s"}` }
        : { ok: false, label: "No correct option" };
    }
    case "short_answer":
      return options.length
        ? { ok: true, label: `${options.length} accepted answer${options.length === 1 ? "" : "s"}` }
        : { ok: false, label: "No accepted answer" };
    case "numeric":
      return cfg.numeric_answer !== undefined && cfg.numeric_answer !== null && cfg.numeric_answer !== ""
        ? { ok: true, label: `Answer ${String(cfg.numeric_answer)} ± ${String(cfg.tolerance ?? 0)}` }
        : { ok: false, label: "Numeric answer missing" };
    case "matching": {
      const pairs = Array.isArray(cfg.pairs) ? cfg.pairs : [];
      return pairs.length >= 2 ? { ok: true, label: `${pairs.length} matching pairs` } : { ok: false, label: "Fewer than two pairs" };
    }
    case "ordering":
      return options.length >= 2 ? { ok: true, label: `${options.length} ordered items` } : { ok: false, label: "Fewer than two items" };
    case "open_ended":
      return String(cfg.marking_criteria ?? "").trim()
        ? { ok: true, label: "Marking criteria present" }
        : { ok: false, label: "Marking criteria missing" };
    default:
      return { ok: true, label: "No score key required" };
  }
}

export default async function AnswersSolutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; issue?: string; status?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("questions")
    .select("*, organizations(name), question_categories(name), question_options(label, is_correct, position)")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.status) query = query.eq("status", sp.status);

  const [{ data: questions }, { data: orgs }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
  ]);

  const rows = (questions ?? []).map((q) => {
    const options = [...(((q.question_options as OptionRow[]) ?? []))];
    const answer = answerReadiness(q as unknown as Record<string, unknown>, options);
    const explanationDoc = q.explanation_doc as RichDoc | null;
    const hasExplanation = Boolean(String(q.explanation ?? "").trim()) || (explanationDoc && !docIsEmpty(explanationDoc));
    return { q, options, answer, hasExplanation };
  });

  const filtered = rows.filter(({ answer, hasExplanation }) => {
    if (sp.issue === "answer") return !answer.ok;
    if (sp.issue === "explanation") return !hasExplanation;
    if (sp.issue === "attention") return !answer.ok || !hasExplanation;
    if (sp.issue === "ready") return answer.ok && hasExplanation;
    return true;
  });

  return (
    <>
      <PageTitle
        title="Answers and solutions"
        subtitle="Audit answer keys, accepted alternatives, marking criteria and worked solutions before questions are used in quizzes, competitions or examinations."
        action={<ButtonLink href="/admin/questions/new" variant="gold">+ Create question</ButtonLink>}
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <Select name="org" defaultValue={sp.org ?? ""} className="min-w-[240px]" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
        <Select name="issue" defaultValue={sp.issue ?? ""} aria-label="Readiness">
          <option value="">All questions</option>
          <option value="attention">Needs attention</option>
          <option value="answer">Answer key issue</option>
          <option value="explanation">Missing worked solution</option>
          <option value="ready">Answer + solution ready</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No questions match this readiness filter.
        </p>
      ) : (
        <Table head={["Question", "Organization / category", "Answer key", "Worked solution", "Marks", "Action"]}>
          {filtered.map(({ q, answer, hasExplanation }) => (
            <tr key={q.id}>
              <td className="max-w-sm">
                <div className="line-clamp-3 font-medium">
                  <RichContent doc={(q.prompt_doc as RichDoc | null) ?? null} text={q.prompt} />
                </div>
                <span className="mt-1 block text-xs text-ink-soft">
                  {String(q.type).replace(/_/g, " ")} · {q.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="text-ink-soft">
                {(q.organizations as { name?: string } | null)?.name ?? "—"}
                <span className="block text-xs">{(q.question_categories as { name?: string } | null)?.name ?? "Uncategorised"}</span>
              </td>
              <td><Badge tone={answer.ok ? "green" : "red"}>{answer.label}</Badge></td>
              <td><Badge tone={hasExplanation ? "green" : "amber"}>{hasExplanation ? "Present" : "Missing"}</Badge></td>
              <td className="tabular-nums">{Number(q.points)}</td>
              <td>
                <Link href={`/admin/questions/${q.id}`} className="font-semibold text-evergreen-700 underline-offset-2 hover:underline">
                  Edit answer / solution →
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
