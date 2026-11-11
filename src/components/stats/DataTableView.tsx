import { dataTableSummary, normaliseDataTableSpec, type DataTableSpec } from "@/lib/dataTableSpec";

/**
 * Read-only structured table. Server-component safe and printable: a marker
 * reads the same rows and columns the candidate saved, with row headers marked
 * up as headers rather than as ordinary cells.
 */
export function DataTableView({
  spec,
  className,
  compact = false,
  ariaLabel,
}: {
  spec: DataTableSpec;
  className?: string;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const clean = normaliseDataTableSpec(spec);
  const label = ariaLabel ?? (clean.title || "Data table");

  return (
    <figure className={`data-table-figure ${className ?? ""}`}>
      {clean.title ? <figcaption className="data-table-title">{clean.title}</figcaption> : null}
      <div className="data-table-scroll">
        <table className="data-table" aria-label={label}>
          <thead>
            <tr>
              {clean.columns.map((column, index) => (
                <th key={`head-${index}`} scope="col">
                  {column || (clean.rowHeaders && index === 0 ? "" : `Column ${index + 1}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clean.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, columnIndex) => {
                  if (clean.rowHeaders && columnIndex === 0) {
                    return <th key={`cell-${rowIndex}-${columnIndex}`} scope="row">{cell}</th>;
                  }
                  return <td key={`cell-${rowIndex}-${columnIndex}`}>{cell}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <p className="data-table-meta" aria-hidden>{dataTableSummary(clean)}</p>
      )}
    </figure>
  );
}
