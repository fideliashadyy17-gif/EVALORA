"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Sends the student to their decision page the moment an administrator decides,
 * without a refresh — and does nothing at all once a decision has been acted on.
 *
 * Two independent channels, because a live room cannot depend on one:
 *   * Supabase Realtime on the student's own request rows (RLS already limits
 *     what this browser may see);
 *   * a small polling fallback for browsers or networks where the socket never
 *     connects.
 *
 * Both produce the same destination, and a ref guarantees exactly one
 * navigation even if both fire.
 */
export function RetakeDecisionWatcher({ pendingIds }: { pendingIds: string[] }) {
  const router = useRouter();
  const handled = useRef(false);
  const ids = pendingIds.filter(Boolean).join(",");

  useEffect(() => {
    if (!ids || handled.current) return;
    const watched = new Set(ids.split(","));
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const go = (id: string) => {
      if (handled.current) return;
      handled.current = true;
      router.push(`/retake/${id}`);
    };

    try {
      channel = supabase
        .channel(`retake-decisions-${ids}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "exam_retake_requests" },
          (payload) => {
            const row = payload.new as { id?: string; status?: string } | null;
            if (!row?.id || !watched.has(row.id)) return;
            if (row.status === "approved" || row.status === "rejected") go(row.id);
          },
        )
        .subscribe();
    } catch {
      // Realtime is an accelerator, never a requirement: polling below covers it.
      channel = null;
    }

    let cancelled = false;
    const poll = async () => {
      if (cancelled || handled.current) return;
      try {
        const res = await fetch("/api/retake/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { decided?: { id: string } | null };
        if (json?.decided?.id) go(json.decided.id);
      } catch {
        // Offline or transient: the next tick tries again.
      }
    };
    void poll();
    const timer = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [ids, router]);

  return null;
}
