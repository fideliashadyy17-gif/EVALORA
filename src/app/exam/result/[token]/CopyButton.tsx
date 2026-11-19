"use client";

import { Button } from "@/components/ui";
import { useState } from "react";

export function CopyButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${url}` : url;
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  }

  return (
    <Button variant="outline" className="text-xs" onClick={handleCopy}>
      {copied ? "✓ Link copied!" : label}
    </Button>
  );
}
