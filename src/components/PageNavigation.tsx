import Link from "next/link";

/** Server-rendered pagination that preserves the active list filters. */
export function PageNavigation({
  page,
  pageSize,
  total,
  pathname,
  query = {},
  pageParam = "page",
  label = "records",
}: {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
  query?: Record<string, string | undefined>;
  pageParam?: string;
  label?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const hrefFor = (nextPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    params.set(pageParam, String(nextPage));
    return `${pathname}?${params.toString()}`;
  };
  const pageLink = "inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen-600";

  return (
    <nav aria-label={`${label} pages`} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-evergreen-900/10 bg-paper px-4 py-3">
      <p className="text-sm text-ink-soft" aria-live="polite">
        Showing <span className="font-semibold tabular-nums text-evergreen-950">{start}–{end}</span> of{" "}
        <span className="font-semibold tabular-nums text-evergreen-950">{total}</span> {label}
      </p>
      <div className="flex items-center gap-2">
        {current > 1 ? (
          <Link className={`${pageLink} border-evergreen-900/15 bg-white text-evergreen-900 hover:bg-evergreen-50`} href={hrefFor(current - 1)} rel="prev">Previous</Link>
        ) : (
          <span className={`${pageLink} cursor-not-allowed border-evergreen-900/10 bg-cream text-ink-soft opacity-60`} aria-disabled="true">Previous</span>
        )}
        <span className="min-w-16 text-center text-xs font-semibold tabular-nums text-ink-soft">Page {current} of {pageCount}</span>
        {current < pageCount ? (
          <Link className={`${pageLink} border-evergreen-900/15 bg-white text-evergreen-900 hover:bg-evergreen-50`} href={hrefFor(current + 1)} rel="next">Next</Link>
        ) : (
          <span className={`${pageLink} cursor-not-allowed border-evergreen-900/10 bg-cream text-ink-soft opacity-60`} aria-disabled="true">Next</span>
        )}
      </div>
    </nav>
  );
}
