"use client";

import { Button, Card } from "@/components/ui";
import { useRef, useState } from "react";
import { importQuestionsCsv } from "./actions";

const SAMPLE = `type,prompt,options,correct,points,explanation,topic
single_choice,What is $\\frac{1}{2} + \\frac{1}{4}$?,1|3/4|2/4|5/4,2,1,Convert to quarters: 2/4 + 1/4 = 3/4.,Fractions
true_false,The square root of 16 is 4.,True|False,1,1,,Numbers
numeric,Compute $7 \\times 8$.,,56,2,,Multiplication`;

export function ImportCsv() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported?: number; report?: { row: number; ok: boolean; message: string }[]; error?: string } | null>(null);

  async function onFile(f: File) {
    setBusy(true);
    setResult(null);
    const text = await f.text();
    const res = await importQuestionsCsv(text);
    setResult(res as typeof result);
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-evergreen-950">Import questions (CSV)</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Columns: <code className="rounded bg-cream px-1">type, prompt, options, correct, points, explanation, topic</code>.
        Separate options with <strong>|</strong>; mark correct answers by 1-based position (e.g. <strong>2</strong> or <strong>1|3</strong>).
        Everything imports as <em>Pending review</em>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Importing…" : "Choose CSV file"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const blob = new Blob([SAMPLE], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "evalora-questions-template.csv";
            a.click();
          }}
        >
          Download template
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {result?.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{result.error}</p>}
      {result?.report && (
        <div className="mt-3 rounded-lg bg-cream p-3">
          <p className="text-sm font-semibold text-evergreen-950">
            Imported {result.imported} question(s) — review and publish them from the list.
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto scroll-slim text-xs">
            {result.report.map((r) => (
              <li key={r.row} className={r.ok ? "text-evergreen-700" : "text-red-700"}>
                Row {r.row}: {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        Word / Excel files: save a sheet with these columns as CSV first. PDF and image papers can be transcribed with the same template.
      </p>
    </Card>
  );
}
