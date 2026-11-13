"use client";

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

/** Client-side Excel export using @e965/xlsx. */
export function ExportExcelButton({ filename, data, label = "Export Excel" }: { filename: string; data: any[][]; label?: string }) {
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
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

/** Client-side Word export using mammoth (converts HTML/Markdown to docx). */
export function ExportWordButton({ filename, html, label = "Export Word" }: { filename: string; html: string; label?: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToWordProcessingOptions({ html });
        const blob = new Blob([result.arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
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
