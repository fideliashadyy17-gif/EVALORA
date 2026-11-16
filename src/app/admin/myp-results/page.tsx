import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { MypFilters } from "@/components/myp/MypFilters";
import { MypAnalyticsCards, MypResultsTable } from "@/components/myp/MypResultsTable";
import { requireSuperAdmin } from "@/lib/auth";
import { mypAccess, parseMypFilters } from "@/lib/mypAccess";
import { loadMypResults } from "@/lib/mypResults";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "MYP results — all organizations" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function exportQuery(query: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const key of ["org", "year", "class", "subject", "exam", "criterion", "status", "from", "to", "q"]) {
    const value = query[key];
    if (value) search.set(key, value);
  }
  return search.toString();
}

export default async function AdminMypResultsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdmin();
  const access = await mypAccess({ global: true });
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
  const dataset = await loadMypResults(supabase, parseMypFilters(query, access));
  const params = exportQuery(query);
  const organizationCount = new Set(dataset.results.map((result) => result.organizationId)).size;

  return (
    <>
      <PageTitle
        eyebrow="Platform · MYP results"
        title="MYP results across every organization"
        subtitle="Detailed criterion results and overall MYP grades for every student on the platform. Tenant boundaries are preserved: each row names the organization whose data it is, and filters keep results from different organizations and subjects apart."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/api/myp/export/xlsx?scope=collective&${params}`} variant="outline">⬇ Excel (.xlsx)</ButtonLink>
            <ButtonLink href={`/api/myp/export/pdf?scope=collective&${params}`}>⬇ Collective PDF</ButtonLink>
          </div>
        }
        meta={
          <>
            <span>{dataset.results.length} result{dataset.results.length === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{organizationCount} organization{organizationCount === 1 ? "" : "s"} represented</span>
            {dataset.truncated && (
              <>
                <span>·</span>
                <span className="text-amber-800">Showing the first 1,500 results — narrow the scope for a complete export.</span>
              </>
            )}
          </>
        }
      />

      <MypFilters action="/admin/myp-results" options={dataset.options} current={query} showOrganization />

      <div className="mt-6">
        <MypAnalyticsCards analytics={dataset.analytics} />
      </div>

      <Card className="mt-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Student results</h2>
          <p className="text-xs text-ink-soft">Criterion badges show the achievement level; “…” means pending marking or not assessed.</p>
        </div>
        <div className="px-5 pb-5">
          <MypResultsTable
            results={dataset.results}
            detailBase="/admin/myp-results"
            showOrganization
            emptyMessage="No MYP result matches these filters. Try a different organization, MYP year or result status."
          />
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Per-organization completion</h2>
          <div className="mt-3 space-y-2">
            {[...new Set(dataset.results.map((result) => result.organizationId))].length === 0 ? (
              <p className="text-sm text-ink-soft">No results in this scope.</p>
            ) : (
              [...new Set(dataset.results.map((result) => result.organizationId))].map((organizationId) => {
                const rows = dataset.results.filter((result) => result.organizationId === organizationId);
                const complete = rows.filter((result) => result.gradeStatus === "final").length;
                const pending = rows.filter((result) => result.pendingCriteria.length > 0).length;
                const released = rows.filter((result) => result.published).length;
                return (
                  <div key={organizationId} className="rounded-lg border border-evergreen-900/10 bg-white px-3 py-2">
                    <p className="text-sm font-medium text-evergreen-950">{rows[0].organizationName}</p>
                    <p className="text-[11px] text-ink-soft">
                      {rows.length} results · {complete} with a final grade · {pending} pending marking · {released} released
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-stone-200">
                      <div className="h-full rounded bg-evergreen-700" style={{ width: `${(complete / Math.max(1, rows.length)) * 100}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Analytics</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink">
            <li>
              <span className="font-semibold">Overall MYP grade distribution:</span> grades 1–7 shown above; provisional grades
              are counted separately and never merged into a final distribution.
            </li>
            <li>
              <span className="font-semibold">Criterion-level performance:</span> averages per criterion across the filtered
              scope, with pending and not-assessed counts beside them.
            </li>
            <li>
              <span className="font-semibold">Class, examination and subject performance:</span> filter by class, examination
              or subject to read any of them; the Excel workbook adds a per-class statistics sheet with criterion averages
              and completion.
            </li>
            <li>
              <span className="font-semibold">Reporting period:</span> the from/to dates filter on the examination date
              (falling back to its creation date when it has not been scheduled).
            </li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
            Every student row opens the full criterion breakdown. The individual PDF and Excel links on that page use the
            same authoritative result record as this table.
          </p>
        </Card>
      </div>
    </>
  );
}
