"use client";

import { useEffect, useRef, useState } from "react";
import { mmss } from "@/lib/utils";

/** Presentation only: a zero countdown never submits or changes an attempt. */
export function ExamCountdown({ deadline, serverOffsetMs, paused }: {
  deadline: string;
  serverOffsetMs: number;
  paused: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const frozenRemaining = useRef<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 500);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const liveRemaining = Math.max(0, (Date.parse(deadline) - (now + serverOffsetMs)) / 1000);
  // Freeze on the pause transition, not on each heartbeat/deadline update.
  // On resume the freshly synchronized server deadline is authoritative again.
  if (paused && frozenRemaining.current === null) frozenRemaining.current = liveRemaining;
  if (!paused) frozenRemaining.current = null;
  const remaining = paused ? frozenRemaining.current ?? liveRemaining : liveRemaining;
  const urgent = remaining <= 300;
  return (
    <div className={`rounded-xl px-4 py-2 text-center ${urgent ? "bg-red-700 text-white" : "border border-evergreen-900/15 bg-evergreen-50 text-evergreen-950"}`}>
      <p className={`text-[10px] uppercase tracking-wider ${urgent ? "text-white" : "text-ink-soft"}`}>{paused ? "Time paused" : "Time remaining"}</p>
      <p className="font-display text-2xl font-bold tabular-nums leading-none">{Number.isFinite(remaining) ? mmss(Math.ceil(remaining)) : "—"}</p>
    </div>
  );
}
