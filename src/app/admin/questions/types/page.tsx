import { Badge, Button, ButtonLink, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { QUESTION_TYPES } from "@/lib/brand";
import { resolveQuestionStudioConfig } from "@/lib/questionStudio";
import { describeDesign, formatQuestionNumber } from "@/lib/questionDesign";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Table } from "../../ui";

export const metadata: Metadata = { title: "Question types" };
export const dynamic = "force-dynamic";

const DESCRIPTIONS: Record<string, { authoring: string; grading: string }> = {
  single_choice: {
    authoring: "Rich prompt plus independent rich-text, mathematics and image options; exactly one correct option.",
    grading: "Automatic by selected option.",
  },
  multiple_select: {
    authoring: "Independent rich options with two or more correct answers.",
    grading: "Automatic with credit for correct selections and penalties for incorrect selections under the scoring engine.",
  },
  true_false: {
    authoring: "A statement with True/False options; the statement itself can contain equations and images.",
    grading: "Automatic.",
  },
  short_answer: {
    authoring: "One or more exact accepted text answers. Rich mathematical content belongs in the prompt and explanation; expected answers stay canonical for reliable matching.",
    grading: "Automatic exact-text matching against accepted alternatives.",
  },
  numeric: {
    authoring: "A numerical answer with configurable tolerance; mathematical working can be shown in the explanation.",
    grading: "Automatic within the configured tolerance.",
  },
  ordering: {
    authoring: "Items supplied in the correct order and shuffled for participants.",
    grading: "Automatic sequence comparison.",
  },
  matching: {
    authoring: "Left/right pairs; prompts and explanations support mathematics. Pair labels remain text identities for reliable matching.",
    grading: "Automatic pair comparison.",
  },
  poll: {
    authoring: "Rich options with no correct answer, used for participation and opinion gathering.",
    grading: "Not scored.",
  },
  open_ended: {
    authoring: "Structured written/mathematical response with marking criteria and a detailed worked solution.",
    grading: "Manual marking by an authorized marker/corrector.",
  },
  assess_parts: {
    authoring: "One stem with several separately marked parts, each numeric or keyword-marked with its own points.",
    grading: "Automatic per part, totalled into the question's marks.",
  },
  slide: {
    authoring: "Instructional content slide using text, equations, tables and images.",
    grading: "Not scored.",
  },
};

/**
 * Question types as Question Studio actually offers them.
 *
 * The registry in `@/lib/brand` is what the examination engine can RENDER. What
 * an author may CREATE is decided by the `question_studio.enabled_question_types`
 * configuration resolved here for the selected scope, so this page never presents
 * a withdrawn type as functional — and never hides a type that existing questions
 * still use, because those questions must keep opening, marking and printing.
 */
export default async function QuestionTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data: orgs } = await admin.from("organizations").select("id, name, slug").order("name").limit(500);
  const selected = sp.org ? (orgs ?? []).find((o) => o.id === sp.org) : undefined;

  // The configured studio for this scope. Resolution never throws: an unreadable
  // configuration yields the shipped defaults, which is the honest fallback.
  const studio = await resolveQuestionStudioConfig(selected?.id ?? null);
  const enabledTypes = new Set(studio.questionTypes.map((t) => t.value));
  const withdrawnTypes = new Set(studio.withdrawnTypes.map((t) => t.value));

  let query = admin.from("questions").select("type, status, organization_id").limit(10000);
  if (selected) query = query.eq("organization_id", selected.id);
  const { data: questions } = await query;

  const byType = new Map<string, { total: number; published: number; draft: number; review: number }>();
  for (const q of questions ?? []) {
    const row = byType.get(q.type) ?? { total: 0, published: 0, draft: 0, review: 0 };
    row.total += 1;
    if (q.status === "published") row.published += 1;
    if (q.status === "draft") row.draft += 1;
    if (q.status === "pending_review") row.review += 1;
    byType.set(q.type, row);
  }

  const createOrg = selected?.id ?? (orgs ?? []).find((o) => o.slug === "evalora-platform")?.id ?? (orgs ?? [])[0]?.id;
  const scopeLabel = selected ? selected.name : "the whole platform";
  // A type that is withdrawn but still in use must stay visible with its real
  // usage, so an administrator can see what withdrawing it left behind.
  const rows = [...QUESTION_TYPES].sort((a, b) => {
    const aOn = enabledTypes.has(a.value) ? 0 : 1;
    const bOn = enabledTypes.has(b.value) ? 0 : 1;
    return aOn - bOn || a.label.localeCompare(b.label);
  });

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Supported Item Formats"
        title="Question types"
        subtitle={`What authors may create in ${scopeLabel}, as configured in Question Studio. Every supported type uses the same unified editor for prompts and worked solutions; choice options support their own equations and images.`}
        action={<ButtonLink href="/admin/questions" variant="outline">Open Question Bank</ButtonLink>}
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block min-w-[280px]">
          <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Scope</span>
          <Select name="org" defaultValue={selected?.id ?? ""}>
            <option value="">All organizations (platform default)</option>
            {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="outline">Filter</Button>
        <Link
          href={
            selected
              ? `/admin/control-center/organizations/${selected.id}?section=question_studio`
              : "/admin/control-center?section=question_studio"
          }
          className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-evergreen-800 underline underline-offset-4 hover:text-evergreen-950"
        >
          Change these settings in the Control Center
        </Link>
      </form>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-evergreen-900/12 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Available to authors</p>
          <p className="mt-1.5 font-display text-2xl font-semibold text-evergreen-950">
            {enabledTypes.size}
            <span className="ml-1 text-sm font-normal text-ink-soft">of {QUESTION_TYPES.length} supported</span>
          </p>
          {withdrawnTypes.size > 0 && (
            <p className="mt-2 text-xs leading-5 text-ink-soft">
              {withdrawnTypes.size} withdrawn from the picker. Questions already saved with those types still
              open, mark and print exactly as before.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-evergreen-900/12 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Difficulty vocabulary</p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {studio.difficultyLevels.map((level) => (
              <Badge key={level} tone="gray">{level}</Badge>
            ))}
          </p>
        </div>
        <div className="rounded-2xl border border-evergreen-900/12 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Design defaults for new questions</p>
          <p className="mt-1.5 text-sm text-evergreen-950">
            Numbering{" "}
            <strong className="font-display">
              {formatQuestionNumber(1, studio.numberingStyle)}, {formatQuestionNumber(2, studio.numberingStyle)},{" "}
              {formatQuestionNumber(3, studio.numberingStyle)}
            </strong>
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">{describeDesign(studio.design)}</p>
        </div>
      </div>

      <Table head={["Type", "Editor & answer model", "Grading", "Usage", "Create"]}>
        {rows.map((t) => {
          const stats = byType.get(t.value) ?? { total: 0, published: 0, draft: 0, review: 0 };
          const desc = DESCRIPTIONS[t.value];
          const enabled = enabledTypes.has(t.value);
          const withdrawn = withdrawnTypes.has(t.value);
          return (
            <tr key={t.value}>
              <td>
                <span className="font-semibold text-evergreen-950">{t.label}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={t.auto ? "green" : "gray"}>{t.auto ? "auto-marked" : "manual / unscored"}</Badge>
                  {enabled ? (
                    <Badge tone="green">available</Badge>
                  ) : (
                    <Badge tone={withdrawn ? "amber" : "gray"}>
                      {withdrawn ? "withdrawn from picker" : "not enabled in this scope"}
                    </Badge>
                  )}
                </span>
              </td>
              <td className="max-w-md text-ink-soft">
                {desc?.authoring ?? "Supported by the examination engine; no editor guidance recorded yet."}
                {withdrawn && (
                  <span className="mt-1 block text-xs text-amber-800">
                    {stats.total > 0
                      ? `${stats.total} existing question${stats.total === 1 ? "" : "s"} of this type remain fully functional.`
                      : "No stored question uses this type in this scope."}
                  </span>
                )}
              </td>
              <td className="max-w-xs text-ink-soft">{desc?.grading ?? "—"}</td>
              <td className="tabular-nums">
                {stats.total} total
                <span className="block text-xs text-ink-soft">{stats.published} published · {stats.draft} draft · {stats.review} in review</span>
              </td>
              <td>
                {enabled && createOrg ? (
                  <ButtonLink href={`/admin/questions/new?org=${createOrg}&type=${t.value}`} variant="outline">
                    Create
                  </ButtonLink>
                ) : (
                  <span className="text-xs text-ink-soft">
                    {createOrg ? "Withdrawn" : "—"}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </Table>

      <p className="mt-4 text-xs leading-5 text-ink-soft">
        Withdrawing a type removes it from the creation picker only. It never edits, hides or re-marks a
        question that already exists, and it never changes an examination that is scheduled or open.
      </p>
    </>
  );
}
