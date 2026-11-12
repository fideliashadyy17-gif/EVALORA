"use client";

import {
  DATA_TABLE_LIMITS,
  insertDataTableColumn,
  insertDataTableRow,
  normaliseDataTableSpec,
  resizeDataTable,
  type DataTableSpec,
} from "@/lib/dataTableSpec";
import { DataTableView } from "./DataTableView";

const control =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-evergreen-900/20 bg-white px-3 text-[13px] font-semibold text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-40";
const input =
  "min-h-10 w-full rounded-md border border-evergreen-900/15 bg-white px-2 py-1 text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none";

/**
 * Editable structured table. Cells are plain strings (mathematics written as
 * `$…$` is rendered elsewhere by the shared maths renderer), and the grid can
 * fixed by the teacher so a candidate only fills in the blank cells.
 */
export function DataTableEditor({
  spec,
  onChange,
  readOnly = false,
  allowStructure = true,
  title = "Data table",
}: {
  spec: DataTableSpec;
  onChange?: (next: DataTableSpec) => void;
  readOnly?: boolean;
  allowStructure?: boolean;
  title?: string;
}) {
  const clean = normaliseDataTableSpec(spec);

  if (readOnly) return <DataTableView spec={clean} />;

  function publish(next: DataTableSpec) {
    onChange?.(normaliseDataTableSpec(next, clean));
  }

  function setCell(rowIndex: number, columnIndex: number, value: string) {
    publish({
      ...clean,
      rows: clean.rows.map((row, r) => (r === rowIndex
        ? row.map((cell, c) => (c === columnIndex ? value.slice(0, DATA_TABLE_LIMITS.cell) : cell))
        : row)),
    });
  }

  function setColumn(columnIndex: number, value: string) {
    publish({
      ...clean,
      columns: clean.columns.map((column, index) => (index === columnIndex ? value.slice(0, DATA_TABLE_LIMITS.cell) : column)),
    });
  }

  function removeRow(rowIndex: number) {
    if (clean.rows.length <= 1) return;
    publish({ ...clean, rows: clean.rows.filter((_, index) => index !== rowIndex) });
  }

  function removeColumn(columnIndex: number) {
    if (clean.columns.length <= 1) return;
    publish({
      ...clean,
      columns: clean.columns.filter((_, index) => index !== columnIndex),
      rows: clean.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    });
  }

  return (
    <div className="data-table-editor">
      <div className="data-table-editor-head">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Table title</span>
          <input
            className={input}
            value={clean.title}
            placeholder={title}
            aria-label="Table title"
            onChange={(event) => publish({ ...clean, title: event.target.value })}
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-xs text-evergreen-900">
          <input
            type="checkbox"
            checked={clean.rowHeaders}
            disabled={!allowStructure}
            onChange={(event) => publish({ ...clean, rowHeaders: event.target.checked })}
          />
          First column contains row labels
        </label>
      </div>

      <div className="data-table-scroll">
        <table className="data-table data-table-edit">
          <thead>
            <tr>
              <th className="data-table-rownum" scope="col"><span className="sr-only">Row</span></th>
              {clean.columns.map((column, columnIndex) => (
                <th key={`head-${columnIndex}`} scope="col">
                  <input
                    className={input}
                    value={column}
                    aria-label={`Column ${columnIndex + 1} heading`}
                    onChange={(event) => setColumn(columnIndex, event.target.value)}
                  />
                  {allowStructure && (
                    <button
                      type="button"
                      className="data-table-remove"
                      disabled={clean.columns.length >= DATA_TABLE_LIMITS.columns}
                      onClick={() => publish(insertDataTableColumn(clean, columnIndex))}
                      aria-label={`Insert a column before column ${columnIndex + 1}`}
                      title="Insert column here"
                    >
                      +←
                    </button>
                  )}
                  {allowStructure && clean.columns.length > 1 && (
                    <button
                      type="button"
                      className="data-table-remove"
                      onClick={() => removeColumn(columnIndex)}
                      aria-label={`Remove column ${columnIndex + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clean.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                <th className="data-table-rownum" scope="row">
                  {allowStructure ? (
                    <button
                      type="button"
                      className="data-table-remove"
                      disabled={clean.rows.length >= DATA_TABLE_LIMITS.rows}
                      onClick={() => publish(insertDataTableRow(clean, rowIndex))}
                      aria-label={`Insert a row above row ${rowIndex + 1}`}
                      title="Insert row here"
                    >
                      +↑
                    </button>
                  ) : null}
                  {allowStructure && clean.rows.length > 1 ? (
                    <button
                      type="button"
                      className="data-table-remove"
                      onClick={() => removeRow(rowIndex)}
                      aria-label={`Remove row ${rowIndex + 1}`}
                    >
                      ×
                    </button>
                  ) : null}
                </th>
                {row.map((cell, columnIndex) => (
                  <td key={`cell-${rowIndex}-${columnIndex}`}>
                    <input
                      className={input}
                      value={cell}
                      aria-label={`Row ${rowIndex + 1}, ${clean.columns[columnIndex] || `column ${columnIndex + 1}`}`}
                      onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {allowStructure && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={control}
            disabled={clean.rows.length >= DATA_TABLE_LIMITS.rows}
            onClick={() => publish(resizeDataTable(clean, clean.rows.length + 1, clean.columns.length))}
          >
            + Add row
          </button>
          <button
            type="button"
            className={control}
            disabled={clean.columns.length >= DATA_TABLE_LIMITS.columns}
            onClick={() => publish(resizeDataTable(clean, clean.rows.length, clean.columns.length + 1))}
          >
            + Add column
          </button>
          <span className="self-center text-xs text-ink-soft">
            {clean.rows.length} rows × {clean.columns.length} columns
          </span>
        </div>
      )}
    </div>
  );
}
