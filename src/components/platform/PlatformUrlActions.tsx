"use client";

import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "ok" | "error";

/**
 * Open / copy / share actions for an organization's platform URL.
 *
 * The URL is passed in from the server (never re-derived in the browser), so
 * what an administrator copies is exactly the address the platform reports —
 * including path-mode URLs such as `/portal/oak-international-school` when
 * wildcard subdomains are not deployed yet.
 */
export function PlatformUrlActions({
  url,
  openLabel = "Open platform",
  copyLabel = "Copy URL",
  shareLabel = "Share link",
  size = "default",
  className,
}: {
  url: string;
  openLabel?: string;
  copyLabel?: string;
  shareLabel?: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const [canShare, setCanShare] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!url) {
    return (
      <p className="text-sm text-ink-soft">
        No platform URL is available for this organization yet.
      </p>
    );
  }

  async function handleCopy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Clipboard API unavailable (insecure context or permission denied):
      // fall back to a manual selection so copying still works.
      try {
        const area = document.createElement("textarea");
        area.value = url;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.top = "0";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }
    setCopy(ok ? "ok" : "error");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), 2600);
  }

  async function handleShare() {
    try {
      await navigator.share({ title: document.title, url });
    } catch {
      // The user dismissed the share sheet — nothing to report.
    }
  }

  const compact = size === "sm" ? "px-3 py-1.5 text-xs" : undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass("gold", compact)}
      >
        {openLabel}
        <span aria-hidden="true">↗</span>
      </a>
      <button type="button" onClick={handleCopy} className={buttonClass("outline", compact)}>
        {copy === "ok" ? "Copied ✓" : copy === "error" ? "Copy failed" : copyLabel}
      </button>
      {canShare && (
        <button type="button" onClick={handleShare} className={buttonClass("ghost", compact)}>
          {shareLabel}
        </button>
      )}
      <span
        aria-live="polite"
        className={cn(
          "text-xs font-medium",
          copy === "error" ? "text-red-800" : "text-evergreen-800",
        )}
      >
        {copy === "ok"
          ? "Platform URL copied to your clipboard."
          : copy === "error"
            ? "Clipboard unavailable — select the URL and copy it manually."
            : ""}
      </span>
    </div>
  );
}
