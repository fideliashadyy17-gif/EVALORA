import { Badge, Button, ButtonLink, PageTitle, Select } from "@/components/ui";
import { QUESTION_TYPES } from "@/lib/brand";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
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
  slide: {
    authoring: "Instructional content slide using text, equations, tables and images.",
    grading: "Not scored.",
  },
};

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

  return (
    <>
      <PageTitle
        eyebrow="Assessment Authoring · Supported Item Formats"
        title="Question types"
        subtitle="Every supported type uses the same unified editor for prompts and worked solutions. Choice options also support their own equations and images."
        action={<ButtonLink href="/admin/questions" variant="outline">Open Question Bank</ButtonLink>}
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block min-w-[280px]">
          <span className="mb-1.5 block text-sm font-medium text-evergreen-900">Scope</span>
          <Select name="org" defaultValue={selected?.id ?? ""}>
            <option value="">All organizations</option>
            {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <Table head={["Type", "Editor & answer model", "Grading", "Usage", "Create"]}>
        {QUESTION_TYPES.map((t) => {
          const stats = byType.get(t.value) ?? { total: 0, published: 0, draft: 0, review: 0 };
          const desc = DESCRIPTIONS[t.value];
          return (
            <tr key={t.value}>
              <td>
                <span className="font-semibold text-evergreen-950">{t.label}</span>
                <span className="mt-1 block"><Badge tone={t.auto ? "green" : "gray"}>{t.auto ? "auto-marked" : "manual / unscored"}</Badge></span>
              </td>
              <td className="max-w-md text-ink-soft">{desc?.authoring}</td>
              <td className="max-w-xs text-ink-soft">{desc?.grading}</td>
              <td className="tabular-nums">
                {stats.total} total
                <span className="block text-xs text-ink-soft">{stats.published} published · {stats.draft} draft · {stats.review} in review</span>
              </td>
              <td>
                {createOrg ? (
                  <ButtonLink href={`/admin/questions/new?org=${createOrg}&type=${t.value}`} variant="outline">
                    Create
                  </ButtonLink>
                ) : "—"}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
