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

/** Print → "Save as PDF" gives a clean PDF of the report. */
export function PrintButton() {
  return (
    <Button variant="gold" onClick={() => window.print()}>
      🖨 Print / PDF
    </Button>
  );
}
