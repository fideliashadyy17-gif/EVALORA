import { Button, ButtonLink, Select } from "@/components/ui";
import { MYP_STATUS_FILTERS, type MypFilterOptions } from "@/lib/mypResults";

/**
 * Result filters. A plain GET form: the URL is the state, so a filtered view can
 * be bookmarked, shared with a colleague and re-used as the export scope.
 */
export function MypFilters({
  action,
  options,
  current,
  showOrganization,
  extraHidden,
}: {
  action: string;
  options: MypFilterOptions;
  current: Record<string, string | undefined>;
  showOrganization: boolean;
  extraHidden?: Record<string, string | undefined>;
}) {
  const field = "text-xs";
  return (
    <form method="get" action={action} className="rounded-2xl border border-evergreen-900/15 bg-paper p-4 shadow-[var(--shadow-card)]">
      {Object.entries(extraHidden ?? {}).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showOrganization && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Organization</span>
            <Select name="org" defaultValue={current.org ?? ""} className={field}>
              <option value="">All organizations</option>
              {options.organizations.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">MYP year</span>
          <Select name="year" defaultValue={current.year ?? ""} className={field}>
            <option value="">MYP 1–5</option>
            {(options.years.length ? options.years : [1, 2, 3, 4, 5].map((year) => ({ value: String(year), label: `MYP ${year}` }))).map(
              (option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ),
            )}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Class</span>
          <Select name="class" defaultValue={current.class ?? ""} className={field}>
            <option value="">All classes</option>
            {options.classes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Subject</span>
          <Select name="subject" defaultValue={current.subject ?? ""} className={field}>
            <option value="">All subjects</option>
            {options.subjects.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Examination</span>
          <Select name="exam" defaultValue={current.exam ?? ""} className={field}>
            <option value="">All examinations</option>
            {options.exams.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Criterion</span>
          <Select name="criterion" defaultValue={current.criterion ?? ""} className={field}>
            <option value="">All criteria</option>
            {options.criteria.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Result status</span>
          <Select name="status" defaultValue={current.status ?? "all"} className={field}>
            {MYP_STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Reporting period from</span>
          <input
            type="date"
            name="from"
            defaultValue={current.from ?? ""}
            className="w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-evergreen-600"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Reporting period to</span>
          <input
            type="date"
            name="to"
            defaultValue={current.to ?? ""}
            className="w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-evergreen-600"
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Student or examination search</span>
          <input
            type="search"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Name, reference or examination title"
            className="w-full rounded-lg border border-evergreen-900/20 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-evergreen-600"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" className="text-xs">Apply filters</Button>
        <ButtonLink href={action} variant="outline" className="text-xs">Reset</ButtonLink>
      </div>
    </form>
  );
}
