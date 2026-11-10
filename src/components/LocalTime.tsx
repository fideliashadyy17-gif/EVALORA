"use client";

/**
 * Renders a stored UTC instant in the viewer's own timezone.
 *
 * Timestamps are always stored and compared in UTC on the server; only the
 * presentation is localized. The full UTC value stays available in `title`
 * and in the machine-readable `dateTime` attribute, so an administrator can
 * always state the exact instant without ambiguity.
 */
export function LocalTime({
  iso,
  fallback = "—",
  className,
}: {
  iso: string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  if (!iso) return <span className={className}>{fallback}</span>;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return <span className={className}>{fallback}</span>;
  const utc = new Date(ms).toISOString();
  return (
    <time
      dateTime={utc}
      title={`${utc.slice(0, 16).replace("T", " ")} UTC`}
      className={className}
      suppressHydrationWarning
    >
      {new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}

/** Date-only variant for creation columns. */
export function LocalDate({ iso, fallback = "—" }: { iso: string | null | undefined; fallback?: string }) {
  if (!iso) return <span>{fallback}</span>;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return <span>{fallback}</span>;
  return (
    <time
      dateTime={new Date(ms).toISOString()}
      title={`${new Date(ms).toISOString().slice(0, 10)} UTC`}
      suppressHydrationWarning
    >
      {new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" })}
    </time>
  );
}
