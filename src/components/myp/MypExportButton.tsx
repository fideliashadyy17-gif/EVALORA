"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type ExportFormat = "pdf" | "xlsx";
type ExportState = "idle" | "working" | "done" | "error";

/**
 * Explicit MYP export control.
 *
 * A download must only ever start because a teacher pressed this button. The
 * component deliberately has no effect, no prefetch, and no render-time fetch:
 * opening the page, refreshing it, changing a filter or navigating back can
 * never produce a file. The request is an authenticated same-origin fetch and the
 * resulting blob is saved through a temporary anchor, so the browser never
 * navigates away from the page either.
 *
 * A ref, not the rendered state, is the in-flight guard: React can render twice
 * (Strict Mode) without the second render starting a second request.
 */
export function MypExportButton({
  format,
  scope,
  attemptId,
  query,
  label,
  variant = "outline",
  className,
  compact = false,
}: {
  format: ExportFormat;
  scope: "individual" | "collective";
  attemptId?: string;
  /** Already-serialised filters, without a leading "?". */
  query?: string;
  label: string;
  variant?: "primary" | "gold" | "outline" | "ghost" | "danger" | "dark";
  className?: string;
  /** Inline text-link appearance for dense tables. */
  compact?: boolean;
}) {
  const [state, setState] = useState<ExportState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function handleExport() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("working");
    setMessage(null);

    try {
      const params = new URLSearchParams(query ?? "");
      params.set("scope", scope);
      if (scope === "individual" && attemptId) params.set("attempt", attemptId);

      const response = await fetch(`/api/myp/export/${format}?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `The server answered ${response.status}.`);
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("The server returned an empty file.");
      const extension = format === "pdf" ? "pdf" : "xlsx";
      const filename =
        filenameFromDisposition(response.headers.get("content-disposition")) ??
        `evalora-myp-${scope}-${new Date().toISOString().slice(0, 10)}.${extension}`;
      saveBlob(blob, filename);
      setState("done");
      setMessage(`Download started: ${filename}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The export could not be generated.");
    } finally {
      // The guard is released only after the download has been handed to the
      // browser, so a rapid double click cannot produce two files.
      inFlight.current = false;
    }
  }

  if (compact) {
    return (
      <span className="inline-flex flex-col items-start">
        <button
          type="button"
          onClick={handleExport}
          disabled={state === "working"}
          aria-busy={state === "working"}
          title={message ?? `Download ${label}`}
          className="text-[11px] font-semibold text-evergreen-800 underline underline-offset-2 disabled:opacity-60"
        >
          {state === "working" ? "…" : label}
        </button>
        <span role="status" aria-live="polite" className={state === "error" ? "text-[10px] text-red-700" : "sr-only"}>
          {message}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className ?? ""}`}>
      <Button
        type="button"
        variant={variant}
        onClick={handleExport}
        disabled={state === "working"}
        aria-busy={state === "working"}
        aria-describedby={message ? `${format}-${scope}-export-status` : undefined}
      >
        {state === "working" ? "Preparing…" : label}
      </Button>
      <span
        id={`${format}-${scope}-export-status`}
        role="status"
        aria-live="polite"
        className={`max-w-[260px] text-[11px] leading-snug ${
          state === "error" ? "text-red-700" : state === "done" ? "text-evergreen-800" : "text-ink-soft"
        }`}
      >
        {message}
      </span>
    </span>
  );
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].replace(/^"|"$/g, ""));
    } catch {
      /* fall through to the plain filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so Safari has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
