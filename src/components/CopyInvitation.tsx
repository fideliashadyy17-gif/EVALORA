"use client";

import { Button } from "@/components/ui";
import { useState } from "react";

export function CopyInvitation({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  }
  return (
    <Button type="button" variant="outline" onClick={copy} className="shrink-0">
      {done ? "Copied!" : label}
    </Button>
  );
}
