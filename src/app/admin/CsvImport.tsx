"use client";

import { Button, Field, Textarea } from "@/components/ui";
import { useState, type ReactNode } from "react";

/**
 * CSV import control: paste CSV or pick a file (Excel users export
 * CSV natively). Submits raw CSV text to a validating server action
 * that reports row-level errors back via flash message.
 */
export function CsvImport({
  action,
  label,
  template,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  template: string;
  children?: ReactNode;
}) {
  const [csv, setCsv] = useState("");
  return (
    <form action={action} className="space-y-3">
      {children}
      <Field label={label} hint={`Header row required. Template: ${template}`}>
        <Textarea
          name="csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={template}
          className="font-mono text-xs"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-evergreen-700/50 bg-white px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50">
          Choose CSV file…
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCsv(await f.text());
            }}
          />
        </label>
        <Button type="submit" variant="gold" disabled={csv.trim().length < 10}>
          Validate & import
        </Button>
        <span className="text-xs text-ink-soft">Invalid rows are skipped and reported — nothing is half-imported silently.</span>
      </div>
    </form>
  );
}
