"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import {
  DATA_TABLE_LIMITS,
  insertDataTableColumn,
  insertDataTableRow,
  normaliseDataTableSpec,
  resizeDataTable,
  type DataTableSpec,
} from "@/lib/dataTableSpec";
import { DataTableView } from "./DataTableView";
import { mathInputManager, type MathInputTarget } from "@/lib/mathInputManager";
import {
  performMathInsertion,
  handleTemplateSlotKeyDown,
  restoreInputSelection,
  type PendingSlotChain,
} from "@/lib/mathInputOperations";
import type { PlainMathInsertion } from "@/components/editor/plainMathKeyboard";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const control =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-evergreen-900/20 bg-white px-3 text-[13px] font-semibold text-evergreen-950 hover:bg-evergreen-50 disabled:opacity-40";
const input =
  "min-h-10 w-full rounded-md border border-evergreen-900/15 bg-white px-2 py-1 text-sm text-evergreen-950 focus:border-evergreen-600 focus:outline-none";

interface DataTableCellInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className: string;
  tableId: string;
  cellId: string;
  readOnly?: boolean;
  disabled?: boolean;
  questionId?: string;
  placeholder?: string;
}

export function DataTableCellInput({
  value,
  onChange,
  ariaLabel,
  className,
  tableId,
  cellId,
  readOnly = false,
  disabled = false,
  questionId,
  placeholder,
}: DataTableCellInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<PendingSlotChain | null>(null);
  const lastSelectionRef = useRef<{ start: number; end: number }>({
    start: value.length,
    end: value.length,
  });
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const targetId = `table:${tableId}:${cellId}`;

  const recordSelection = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    if (typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
      lastSelectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
    }
  }, []);

  const placeCaret = useCallback((start: number, end?: number) => {
    const apply = () => {
      const node = inputRef.current;
      if (!node) return;
      restoreInputSelection(node, start, end);
      const s = Math.max(0, Math.min(start, node.value.length));
      const e = Math.max(s, Math.min(end ?? s, node.value.length));
      lastSelectionRef.current = { start: s, end: e };
    };
    apply();
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(apply);
    }
  }, []);

  const applyInsertion = useCallback(
    (ins: PlainMathInsertion) => {
      const el = inputRef.current;
      const isFocused = typeof document !== "undefined" && document.activeElement === el;
      const start =
        isFocused && el && typeof el.selectionStart === "number"
          ? el.selectionStart
          : lastSelectionRef.current.start;
      const end =
        isFocused && el && typeof el.selectionEnd === "number"
          ? el.selectionEnd
          : lastSelectionRef.current.end;

      const res = performMathInsertion(valueRef.current, { start, end }, ins);
      onChangeRef.current(res.nextValue);

      pendingRef.current = res.pendingSlot;
      pendingSelectionRef.current = { start: res.caretStart, end: res.caretEnd };
      lastSelectionRef.current = { start: res.caretStart, end: res.caretEnd };
      placeCaret(res.caretStart, res.caretEnd);
    },
    [placeCaret],
  );

  const applyInsertionRef = useRef(applyInsertion);
  applyInsertionRef.current = applyInsertion;

  useEffect(() => {
    if (disabled || readOnly) return;

    const target: MathInputTarget = {
      id: targetId,
      questionId,
      fieldId: cellId,
      isTable: true,
      label: ariaLabel,
      variant: "full",
      getElement: () => inputRef.current,
      getValue: () => valueRef.current,
      setValue: (next) => onChangeRef.current(next),
      applyInsertion: (ins) => applyInsertionRef.current(ins),
      focus: (start, end) => placeCaret(start ?? lastSelectionRef.current.start, end),
      getSelection: () => lastSelectionRef.current,
    };

    const unregister = mathInputManager.register(target);
    return () => unregister();
  }, [ariaLabel, cellId, disabled, placeCaret, questionId, readOnly, targetId]);

  useIsomorphicLayoutEffect(() => {
    if (pendingSelectionRef.current) {
      const { start, end } = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      const node = inputRef.current;
      if (node) {
        restoreInputSelection(node, start, end);
        const len = node.value.length;
        const s = Math.max(0, Math.min(start, len));
        const e = Math.max(s, Math.min(end, len));
        lastSelectionRef.current = { start: s, end: e };
      }
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleTemplateSlotKeyDown(
      e,
      valueRef.current,
      lastSelectionRef.current,
      pendingRef.current,
      (next) => onChangeRef.current(next),
      placeCaret,
      (nextSlot) => {
        pendingRef.current = nextSlot;
      },
    );
  };

  return (
    <input
      ref={inputRef}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(e) => {
        onChange(e.target.value);
        recordSelection(e.target);
      }}
      onSelect={(e) => recordSelection(e.currentTarget)}
      onKeyUp={(e) => recordSelection(e.currentTarget)}
      onPointerDown={() => {
        recordSelection(inputRef.current);
        mathInputManager.setActiveTarget(targetId);
      }}
      onFocus={(e) => {
        recordSelection(e.currentTarget);
        mathInputManager.setActiveTarget(targetId);
      }}
      onBlur={(e) => {
        recordSelection(e.currentTarget);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

/**
 * Editable structured table. Cells are plain strings (mathematics written as
 * `$…$` is rendered elsewhere by the shared maths renderer), and the grid can
 * be fixed by the teacher so a candidate only fills in the blank cells.
 */
export function DataTableEditor({
  spec,
  onChange,
  readOnly = false,
  allowStructure = true,
  title = "Data table",
  tableId: explicitTableId,
  questionId,
}: {
  spec: DataTableSpec;
  onChange?: (next: DataTableSpec) => void;
  readOnly?: boolean;
  allowStructure?: boolean;
  title?: string;
  tableId?: string;
  questionId?: string;
}) {
  const autoTableId = useId();
  const tableId = explicitTableId ?? autoTableId;
  const clean = normaliseDataTableSpec(spec);

  if (readOnly) return <DataTableView spec={clean} />;

  function publish(next: DataTableSpec) {
    onChange?.(normaliseDataTableSpec(next, clean));
  }

  function setCell(rowIndex: number, columnIndex: number, value: string) {
    publish({
      ...clean,
      rows: clean.rows.map((row, r) =>
        r === rowIndex
          ? row.map((cell, c) => (c === columnIndex ? value.slice(0, DATA_TABLE_LIMITS.cell) : cell))
          : row,
      ),
    });
  }

  function setColumn(columnIndex: number, value: string) {
    publish({
      ...clean,
      columns: clean.columns.map((column, index) =>
        index === columnIndex ? value.slice(0, DATA_TABLE_LIMITS.cell) : column,
      ),
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
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Table title
          </span>
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
              <th className="data-table-rownum" scope="col">
                <span className="sr-only">Row</span>
              </th>
              {clean.columns.map((column, columnIndex) => (
                <th key={`head-${columnIndex}`} scope="col">
                  <DataTableCellInput
                    className={input}
                    value={column}
                    ariaLabel={`Column ${columnIndex + 1} heading`}
                    tableId={tableId}
                    cellId={`head-${columnIndex}`}
                    questionId={questionId}
                    disabled={!allowStructure && readOnly}
                    readOnly={readOnly}
                    onChange={(val) => setColumn(columnIndex, val)}
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
                    <DataTableCellInput
                      className={input}
                      value={cell}
                      ariaLabel={`Row ${rowIndex + 1}, ${clean.columns[columnIndex] || `column ${columnIndex + 1}`}`}
                      tableId={tableId}
                      cellId={`r${rowIndex}-c${columnIndex}`}
                      questionId={questionId}
                      disabled={readOnly}
                      readOnly={readOnly}
                      onChange={(val) => setCell(rowIndex, columnIndex, val)}
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
