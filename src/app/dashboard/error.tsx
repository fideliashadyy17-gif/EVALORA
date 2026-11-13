"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-amber-500/40 bg-paper p-8 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Temporary Backend Delay</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-evergreen-950">
        This workspace view encountered a temporary error
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Candidate examination sessions and saved answers remain intact. Retry this page or open Examinations directly.
      </p>
      {error?.digest && (
        <p className="mt-2 font-mono text-xs text-ink-soft">Reference: {error.digest}</p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-evergreen-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-evergreen-800"
        >
          Retry page
        </button>
        <Link
          href="/dashboard/exams"
          prefetch={false}
          className="rounded-xl border border-evergreen-900/20 px-4 py-2.5 text-sm font-semibold text-evergreen-900 hover:bg-evergreen-50"
        >
          Open examinations
        </Link>
        <Link
          href="/dashboard"
          prefetch={false}
          className="rounded-xl border border-evergreen-900/20 px-4 py-2.5 text-sm font-semibold text-evergreen-900 hover:bg-evergreen-50"
        >
          Workspace overview
        </Link>
      </div>
    </div>
  );
}
