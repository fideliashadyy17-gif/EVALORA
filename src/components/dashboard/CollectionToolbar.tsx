import { Button, ButtonLink, Field, Input, Select } from "@/components/ui";
import { pageHref } from "@/lib/pagination";

export interface CollectionParams { q?: string; status?: string; sort?: string; page?: string; }

/** URL-backed controls: shareable, keyboard accessible and server filtered. */
export function CollectionToolbar({ path, params, statuses, page, pageSize, total, noun, failed, extraParams = {} }: {
  path: string;
  params: CollectionParams;
  statuses: readonly string[];
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  failed?: boolean;
  extraParams?: Record<string, string>;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-evergreen-900/15 bg-paper p-4 sm:p-5">
      <form method="get" action={path} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_180px_180px_auto]">
        {Object.entries(extraParams).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <Field label={`Search ${noun}`}><Input name="q" placeholder="Search by title…" maxLength={160} defaultValue={params.q ?? ""} /></Field>
        <Field label="Status"><Select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</Select></Field>
        <Field label="Sort by"><Select name="sort" defaultValue={params.sort ?? "recent"}><option value="recent">Most recent</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></Select></Field>
        <div className="flex items-center gap-2"><Button type="submit" variant="outline">Apply</Button>{(params.q || params.status || params.sort) && <ButtonLink href={pageHref(path, extraParams, 1)} variant="ghost">Reset</ButtonLink>}</div>
      </form>
      {failed ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">The list could not be loaded. Reload or try again; no records have been changed.</p> : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-evergreen-900/10 pt-4">
          <p className="text-sm text-ink-soft">{(total === 0 || (page - 1) * pageSize >= total) ? `No ${noun} on this page (${total} matching)` : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} ${noun}`} · Page {page}</p>
          <nav aria-label={`${noun} pages`} className="flex gap-2">
            {page > 1 && <ButtonLink variant="outline" href={pageHref(path, { ...params, ...extraParams }, page - 1)}>Previous</ButtonLink>}
            {page * pageSize < total && <ButtonLink variant="outline" href={pageHref(path, { ...params, ...extraParams }, page + 1)}>Next</ButtonLink>}
          </nav>
        </div>
      )}
    </div>
  );
}
