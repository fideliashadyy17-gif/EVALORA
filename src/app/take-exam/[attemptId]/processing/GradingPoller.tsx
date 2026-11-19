"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";

/**
 * Client-side poller that checks the grading status endpoint until the attempt
 * is graded, then hands off to the result screen. Runs in the browser so the
 * candidate is not left staring at a spinner if grading takes longer than the
 * initial server render.
 */
export function GradingPoller({ attemptId }: { attemptId: string }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/exam/grading-status/${encodeURIComponent(attemptId)}`,
          { cache: "no-store", credentials: "include" },
        );
        if (cancelled) return;
        if (!res.ok) {
          // Session expired or endpoint error: stop polling. The page shell
          // already handled auth server-side; a 401/404 here means the session
          // lapsed after the initial render.
          return;
        }
        const data = await res.json().catch(() => null);
        if (data?.graded) {
          redirect(`/take-exam/${attemptId}/result`);
        }
      } catch {
        // Network hiccup — retry on the next tick.
      }
      if (!cancelled) {
        timer = setTimeout(poll, 3000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [attemptId]);

  return null;
}
