"use client";

import { Field, Select, Textarea } from "@/components/ui";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface PublishedPaperOption { id: string; title: string; instructions: string }

export function PaperSelectionFields({ papers, initialPaperId = "" }: { papers: PublishedPaperOption[]; initialPaperId?: string }) {
  const initialInstructions = useMemo(() => papers.find((paper) => paper.id === initialPaperId)?.instructions ?? "", [papers, initialPaperId]);
  const [paperId, setPaperId] = useState(initialPaperId);
  const [instructions, setInstructions] = useState(initialInstructions);
  return <div className="space-y-4">
    <Field label="Question paper">
      <Select name="quiz_id" required value={paperId} onChange={(event) => {
        const nextId = event.target.value;
        setPaperId(nextId);
        setInstructions(papers.find((paper) => paper.id === nextId)?.instructions ?? "");
      }}>
        <option value="" disabled>Select an existing published question paper</option>
        {papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}
      </Select>
      <span className="text-xs text-ink-soft">Only published papers in this organization are selectable. <Link href="/dashboard/papers" className="font-semibold text-evergreen-700 underline">Browse Question Paper Builder</Link></span>
    </Field>
    <Field label="Instructions">
      <Textarea name="instructions" rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Rules, permitted materials, integrity notice…" />
    </Field>
  </div>;
}
