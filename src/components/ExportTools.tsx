"use client";

import { buildDocxParts, DOCX_MIME, type DocxReport } from "@/lib/docxExport";
import { Button } from "./ui";

/** Client-side CSV download (Excel opens CSV natively). */
export function ExportButton({ filename, csv, label = "Export CSV" }: { filename: string; csv: string; label?: string }) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
    >
      ⬇ {label}
    </Button>
  );
}

/** Client-side PDF export (uses window.print). */
export function PrintButton() {
  return (
    <Button variant="gold" onClick={() => window.print()}>
      🖨 Print / PDF
    </Button>
  );
}

/** One spreadsheet cell. Rows may have different lengths; an empty row is a blank line. */
export type ExcelCell = string | number | boolean | Date | null | undefined;

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Client-side Excel export using @e965/xlsx. */
export function ExportExcelButton({ filename, data, label = "Export Excel" }: { filename: string; data: ExcelCell[][]; label?: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        // Dynamic import to avoid bundling in non-export pages
        const XLSX = await import("@e965/xlsx");
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Results");
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
      }}
    >
      ⬇ {label}
    </Button>
  );
}

/**
 * Client-side Word export: a real .docx package.
 *
 * The report is described as data (title, headings, paragraphs, tables) and
 * turned into WordprocessingML by `buildDocxParts`, which escapes every value.
 * The parts are then packed with the ZIP writer that ships inside @e965/xlsx —
 * the same one that produces the .xlsx export — so no extra dependency is
 * needed and nothing is loaded until the button is pressed.
 */
export function ExportWordButton({ filename, report, label = "Export Word" }: { filename: string; report: DocxReport; label?: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const XLSX = await import("@e965/xlsx");
        const encoder = new TextEncoder();
        const zip = XLSX.CFB.utils.cfb_new();
        for (const part of buildDocxParts(report)) XLSX.CFB.utils.cfb_add(zip, part.path, encoder.encode(part.xml));
        const packed: ArrayLike<number> = XLSX.CFB.write(zip, { fileType: "zip", type: "array", compression: true });
        download(new Blob([Uint8Array.from(packed)], { type: DOCX_MIME }), filename);
      }}
    >
      ⬇ {label}
    </Button>
  );
}
