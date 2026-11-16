import { PageTitle, ButtonLink, Card } from "@/components/ui";
import { MypFilters } from "@/components/myp/MypFilters";
import { MypAnalyticsCards, MypResultsTable } from "@/components/myp/MypResultsTable";
import { isMypLearner, mypAccess, parseMypFilters } from "@/lib/mypAccess";
import { loadMypResults } from "@/lib/mypResults";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MypExportButton } from "@/components/myp/MypExportButton";

export const metadata: Metadata = { title: "MYP results" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Build the query string used by the collective export links. */
function exportQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const key of ["org", "year", "class", "subject", "exam", "criterion", "status", "from", "to", "q"]) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  return search.toString();
}

export default async function MypResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const access = await mypAccess();
  if (!access.org) redirect("/dashboard");
  if (isMypLearner(access.org.role)) redirect("/student");
  if (!access.organizationIds.length) redirect("/dashboard");

  const raw = await searchParams;
  const query = {
    org: first(raw.org),
    year: first(raw.year),
    class: first(raw.class),
    subject: first(raw.subject),
    exam: first(raw.exam),
    criterion: first(raw.criterion),
    status: first(raw.status),
    from: first(raw.from),
    to: first(raw.to),
    q: first(raw.q),
  };

  const supabase = await createClient();
  const filters = parseMypFilters(query, access);
  const dataset = await loadMypResults(supabase, filters);
  const params = exportQuery(query);

  return (
    <>
      <PageTitle
        eyebrow="Assessment · MYP results"
        title="MYP criterion results"
        subtitle="Criterion marks, achievement levels 0–8 and the overall MYP grade 1–7 for every student in your organization. Every view and export reads the same authoritative result engine."
        action={
          <div className="flex flex-wrap gap-2">
            {access.canManage && (
              <ButtonLink href="/dashboard/myp-results/settings" variant="outline">Grading settings</ButtonLink>
            )}
            <MypExportButton format="xlsx" scope="collective" query={params} label="⬇ Excel (.xlsx)" />
            <MypExportButton format="pdf" scope="collective" query={params} label="⬇ Collective PDF" variant="primary" />
          </div>
        }
        meta={
          <>
            <span>{access.org.name}</span>
            <span>·</span>
            <span>{dataset.results.length} result{dataset.results.length === 1 ? "" : "s"} in scope</span>
            {dataset.truncated && (
              <>
                <span>·</span>
                <span className="text-amber-800">Showing the first 1,500 results — narrow the filters to export the full set.</span>
              </>
            )}
          </>
        }
      />

      <MypFilters
        action="/dashboard/myp-results"
        options={dataset.options}
        current={query}
        showOrganization={false}
      />

      <div className="mt-6">
        <MypAnalyticsCards analytics={dataset.analytics} />
      </div>

      <Card className="mt-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Student results</h2>
          <p className="text-xs text-ink-soft">
            A badge such as <span className="rounded bg-evergreen-100 px-1 font-semibold text-evergreen-800">A 5</span> is
            “Criterion A, achievement level 5”; an ellipsis means pending or not assessed, never zero.
          </p>
        </div>
        <div className="px-5 pb-5">
          <MypResultsTable
            results={dataset.results}
            detailBase="/dashboard/myp-results"
            showOrganization={false}
            emptyMessage="No MYP result matches these filters yet. Clear a filter, or check that the examination has been marked and its paper questions carry MYP criteria."
          />
        </div>
      </Card>

      <div className="mt-6 rounded-2xl border border-evergreen-900/15 bg-cream px-5 py-4 text-xs leading-relaxed text-ink">
        <p className="font-semibold text-evergreen-900">How the overall grade is calculated</p>
        <p className="mt-1">
          Each criterion receives an achievement level from 0 to 8 derived from the marks earned on the paper. The
          authorized total of those levels is mapped through the configured 1–7 boundaries for the subject. The raw
          examination percentage is never converted directly into an MYP grade. Criteria that are pending or not assessed
          stay blank and prevent a final grade until they are marked; they are never scored as zero.
        </p>
        <p className="mt-2">
          Configure the criteria and boundaries per subject in{" "}
          <Link href="/dashboard/myp-results/settings" className="font-semibold text-evergreen-800 underline underline-offset-2">
            MYP grading settings
          </Link>
          . Super Administrators can review every organization in the{" "}
          <Link href="/admin/myp-results" className="font-semibold text-evergreen-800 underline underline-offset-2">
            global MYP results dashboard
          </Link>
          .
        </p>
      </div>
    </>
  );
}
