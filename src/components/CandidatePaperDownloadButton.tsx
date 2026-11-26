"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type DownloadState = "idle" | "working" | "done" | "error";

type CandidatePaperDownloadProps = (
  | {
      mode: "candidate";
      token: string;
      attemptId?: string;
    }
  | {
      mode: "student";
      attemptId: string;
    }
  | {
      mode: "staff";
      examId: string;
      attemptId: string;
    }
) & {
  label?: string;
  variant?: "primary" | "gold" | "outline" | "ghost" | "danger" | "dark";
  className?: string;
  compact?: boolean;
};

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].replace(/^["']|["']$/g, ""));
    } catch {
      // fall through
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 3.5v8.5m0 0-3.25-3.25M10 12l3.25-3.25" />
      <path d="M4 14.25v1.25A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1.25" />
    </svg>
  );
}

/**
 * Explicit click-only downloader for an individual candidate's submitted
 * examination paper PDF (ManageBac evidence).
 *
 * Never prefetches or triggers on mount; passes candidate tokens via the
 * `Authorization: Bearer` header rather than URL query strings.
 */
export function CandidatePaperDownloadButton(props: CandidatePaperDownloadProps) {
  const {
    label = props.mode === "staff" ? "Download Candidate Paper (PDF)" : "Download My Exam (PDF)",
    variant = props.mode === "staff" ? "outline" : "primary",
    className,
    compact = false,
  } = props;

  const [state, setState] = useState<DownloadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function handleDownload() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("working");
    setMessage(null);

    try {
      let url: string;
      const headers: Record<string, string> = { Accept: "application/pdf" };

      if (props.mode === "candidate") {
        const qs = props.attemptId ? `?attempt_id=${encodeURIComponent(props.attemptId)}` : "";
        url = `/api/exam/candidate-paper${qs}`;
        headers.Authorization = `Bearer ${props.token}`;
      } else if (props.mode === "student") {
        url = `/api/exam/candidate-paper?attempt_id=${encodeURIComponent(props.attemptId)}`;
      } else {
        url = `/api/dashboard/exams/${encodeURIComponent(props.examId)}/attempts/${encodeURIComponent(props.attemptId)}/paper-pdf`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: props.mode === "candidate" ? "omit" : "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        let detail = "";
        try {
          const ct = response.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const payload = (await response.json()) as { error?: string };
            detail = payload.error ?? "";
          } else {
            detail = (await response.text()).trim();
          }
        } catch {
          // ignore body read errors
        }
        throw new Error(detail || `Unable to download PDF (status ${response.status}).`);
      }

      const blob = await response.blob();
      if (!blob.size) {
        throw new Error("The server returned an empty PDF document.");
      }

      const filename =
        filenameFromDisposition(response.headers.get("content-disposition")) ??
        "EVALORA_Candidate_Exam.pdf";
      saveBlob(blob, filename);
      setState("done");
      setMessage("PDF download started.");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not generate your exam PDF. Please try again.");
    } finally {
      inFlight.current = false;
    }
  }

  if (compact) {
    return (
      <span className={`inline-flex flex-col items-start ${className ?? ""}`}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={state === "working"}
          aria-busy={state === "working"}
          aria-label={label}
          title={state === "error" && message ? message : label}
          className="inline-flex items-center gap-1 rounded-md border border-evergreen-800/20 bg-white px-2 py-1 text-[11px] font-semibold text-evergreen-900 transition hover:bg-evergreen-50 disabled:opacity-60 touch-manipulation"
        >
          <DownloadIcon className="h-3 w-3 shrink-0" />
          <span>{state === "working" ? "Preparing…" : "Paper PDF"}</span>
        </button>
        <span
          role="status"
          aria-live="polite"
          className={state === "error" ? "mt-0.5 max-w-[14rem] text-[10px] text-red-700" : "sr-only"}
        >
          {message}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col items-stretch sm:items-start gap-1.5 ${className ?? ""}`}>
      <Button
        type="button"
        variant={variant}
        onClick={handleDownload}
        disabled={state === "working"}
        aria-busy={state === "working"}
        className="w-full sm:w-auto min-h-[42px] gap-2 touch-manipulation"
      >
        <DownloadIcon className="h-4 w-4 shrink-0" />
        <span>{state === "working" ? "Preparing PDF…" : label}</span>
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={
          state === "error"
            ? "text-xs font-medium text-red-700"
            : state === "done"
              ? "text-xs text-evergreen-800"
              : "sr-only"
        }
      >
        {message}
      </span>
    </span>
  );
}
