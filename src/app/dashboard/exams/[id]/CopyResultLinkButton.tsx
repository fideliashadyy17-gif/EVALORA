"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Check, Copy } from "lucide-react";

export function CopyResultLinkButton({
  url,
  candidateName,
}: {
  url: string;
  candidateName?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      try {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    }
  };

  return (
    <Button
      type="button"
      variant={copied ? "primary" : "outline"}
      onClick={handleCopy}
      aria-label={candidateName ? `Copy individual result link for ${candidateName}` : "Copy individual result link"}
      className="text-xs px-2.5 py-1 shrink-0 flex items-center gap-1.5 font-medium transition-all"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-white" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>Copy Link</span>
        </>
      )}
    </Button>
  );
}
