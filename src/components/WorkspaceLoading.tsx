export function WorkspaceLoading() {
  return (
    <section aria-busy="true" aria-label="Loading workspace" className="space-y-6">
      <p role="status" className="text-sm font-medium text-ink-soft">Opening workspace…</p>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-9 w-64 max-w-full rounded-lg bg-evergreen-100" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl border border-evergreen-900/10 bg-paper" />)}</div>
        <div className="rounded-2xl border border-evergreen-900/10 bg-paper p-6">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 border-b border-evergreen-900/10 last:border-0" />)}</div>
      </div>
    </section>
  );
}
