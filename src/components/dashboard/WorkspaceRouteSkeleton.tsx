/**
 * Structural placeholder for a route segment that is still streaming in.
 *
 * This is not a substitute for fixing a slow page: it exists so a navigation
 * paints the destination shell within the same frame as the click instead of
 * leaving the previous page frozen. The geometry mirrors the real page header,
 * KPI row and content grid to keep cumulative layout shift at zero when the
 * data arrives.
 */
export function WorkspaceRouteSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="animate-pulse">
      <span className="sr-only">{label}…</span>
      <div className="h-3 w-44 rounded-full bg-evergreen-900/10" />
      <div className="mt-3 h-9 w-80 max-w-full rounded-lg bg-evergreen-900/10" />
      <div className="mt-3 h-4 w-full max-w-xl rounded bg-evergreen-900/[0.07]" />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-evergreen-900/10 bg-paper p-5">
            <div className="h-3 w-24 rounded bg-evergreen-900/10" />
            <div className="mt-3 h-7 w-16 rounded bg-evergreen-900/10" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-evergreen-900/10 bg-paper p-6">
          <div className="h-5 w-48 rounded bg-evergreen-900/10" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-evergreen-900/[0.06]" />
            ))}
          </div>
        </div>
        <div className="hidden rounded-2xl border border-evergreen-900/10 bg-paper p-6 lg:block">
          <div className="h-5 w-32 rounded bg-evergreen-900/10" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-evergreen-900/[0.06]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
