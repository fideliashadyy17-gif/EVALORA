/**
 * Serialisable data-table specification.
 *
 * A structured table is a first-class answer or question figure, not a
 * formatted block of text: the columns, row headers and every cell keep their
 * position, so a marker can see exactly which value the candidate placed where.
 *
 * The same shape is used in three places:
 *   · a figure embedded in a question (`dataTableBlock`);
 *   · a teacher-configured answer grid (`config.response_data_table`);
 *   · the candidate's saved answer (`answer.data_table`).
 */

export const DATA_TABLE_VERSION = 1;

export interface DataTableSpec {
  version: number;
  title: string;
  columns: string[];
  rows: string[][];
  /** When true the first column contains row labels rather than data. */
  rowHeaders: boolean;
}

export const DATA_TABLE_LIMITS = {
  columns: 10,
  rows: 40,
  cell: 200,
  title: 120,
} as const;

export function emptyDataTableSpec(overrides: Partial<DataTableSpec> = {}): DataTableSpec {
  return {
    version: DATA_TABLE_VERSION,
    title: "",
    columns: ["Column 1", "Column 2"],
    rows: [["", ""], ["", ""], ["", ""]],
    rowHeaders: false,
    ...overrides,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Repair a stored table: fixed column count, aligned rows, bounded cells. */
export function normaliseDataTableSpec(raw: unknown, fallback: DataTableSpec = emptyDataTableSpec()): DataTableSpec {
  if (!isRecord(raw)) {
    return {
      ...fallback,
      columns: [...fallback.columns],
      rows: fallback.rows.map((row) => [...row]),
    };
  }

  const columns = Array.isArray(raw.columns)
    ? raw.columns.map((column) => text(column, DATA_TABLE_LIMITS.cell)).slice(0, DATA_TABLE_LIMITS.columns)
    : [...fallback.columns];

  const width = Math.max(1, columns.length);
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map((entry) => {
        const cells = Array.isArray(entry) ? entry : [];
        return Array.from({ length: width }, (_, index) => text(cells[index], DATA_TABLE_LIMITS.cell));
      }).slice(0, DATA_TABLE_LIMITS.rows)
    : fallback.rows.map((row) => Array.from({ length: width }, (_, index) => text(row[index], DATA_TABLE_LIMITS.cell)));

  return {
    version: DATA_TABLE_VERSION,
    title: text(raw.title, DATA_TABLE_LIMITS.title),
    columns: columns.length ? columns : [""],
    rows: rows.length ? rows : [Array.from({ length: width }, () => "")],
    rowHeaders: typeof raw.rowHeaders === "boolean" ? raw.rowHeaders : fallback.rowHeaders,
  };
}

/** Does any cell contain work? Headers alone do not count. */
export function dataTableHasWork(spec: DataTableSpec | null | undefined): boolean {
  if (!spec) return false;
  return spec.rows.some((row) => row.some((cell) => cell.trim().length > 0));
}

/** Grow or shrink the grid without moving existing cells. */
export function resizeDataTable(spec: DataTableSpec, rowCount: number, columnCount: number): DataTableSpec {
  const columns = Math.min(DATA_TABLE_LIMITS.columns, Math.max(1, Math.floor(columnCount)));
  const rows = Math.min(DATA_TABLE_LIMITS.rows, Math.max(1, Math.floor(rowCount)));
  return {
    ...spec,
    version: DATA_TABLE_VERSION,
    columns: Array.from({ length: columns }, (_, index) => spec.columns[index] ?? `Column ${index + 1}`),
    rows: Array.from({ length: rows }, (_, rowIndex) =>
      Array.from({ length: columns }, (_, columnIndex) => spec.rows[rowIndex]?.[columnIndex] ?? ""),
    ),
  };
}

/** Insert an empty row at `index` (clamped); existing rows keep their content. */
export function insertDataTableRow(spec: DataTableSpec, index: number): DataTableSpec {
  if (spec.rows.length >= DATA_TABLE_LIMITS.rows) return spec;
  const at = Math.min(spec.rows.length, Math.max(0, Math.floor(index)));
  const width = spec.columns.length;
  const rows = [...spec.rows];
  rows.splice(at, 0, Array.from({ length: width }, () => ""));
  return { ...spec, version: DATA_TABLE_VERSION, rows };
}

/** Insert an empty column at `index` (clamped); existing columns keep their content. */
export function insertDataTableColumn(spec: DataTableSpec, index: number): DataTableSpec {
  if (spec.columns.length >= DATA_TABLE_LIMITS.columns) return spec;
  const at = Math.min(spec.columns.length, Math.max(0, Math.floor(index)));
  const columns = [...spec.columns];
  columns.splice(at, 0, `Column ${columns.length + 1}`);
  const rows = spec.rows.map((row) => {
    const next = [...row];
    next.splice(at, 0, "");
    return next;
  });
  return { ...spec, version: DATA_TABLE_VERSION, columns, rows };
}

/** A compact description used in plain-text exports and accessible labels. */
export function dataTableSummary(spec: DataTableSpec): string {
  const filled = spec.rows.reduce((total, row) => total + row.filter((cell) => cell.trim()).length, 0);
  return `${spec.rows.length} × ${spec.columns.length} table, ${filled} filled cell${filled === 1 ? "" : "s"}`;
}
