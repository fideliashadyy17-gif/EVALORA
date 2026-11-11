"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import {
  presenceSummary,
  presenceStatusLabel,
  type PresenceEntry,
  type PresenceRoster,
} from "@/lib/presence";

/**
 * Compact participant presence rail.
 *
 * It is the same component for live quizzes/competitions and examinations, so a
 * student learns one interaction. Collapsed it is a single pill; expanded it is
 * a scrollable drawer that never covers the question because it opens inline
 * (the parent decides where it lives) and closes on Escape or on an outside tap.
 *
 * It shows a name, an avatar and a connection state. It cannot show answers,
 * scores, ranks, hints or proctoring fields — the server never sends them here.
 */
export function PresenceRail({
  roster,
  variant = "live",
  title = "Participants",
  loading = false,
  error = null,
  className,
}: {
  roster: PresenceRoster | null;
  variant?: "live" | "exam";
  title?: string;
  loading?: boolean;
  error?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary = presenceSummary(roster);
  const online = roster?.online ?? 0;
  // Both live rooms and examinations render on light paper surfaces; the prop
  // only changes the accessible label, so there is one visual language.
  const dark = false;

  return (
    <div ref={ref} className={cn("relative print:hidden", className)} data-testid="presence-rail" data-variant={variant}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="presence-roster"
        aria-label={`${title}: ${summary}. Open the participant list.`}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          dark
            ? "border-evergreen-900/15 bg-white text-evergreen-900 hover:bg-cream"
            : "border-white/25 bg-white/10 text-white hover:bg-white/20",
        )}
      >
        <Users className="h-4 w-4" aria-hidden />
        <span aria-live="polite" className="tabular-nums" data-testid="presence-summary">
          {loading && !roster ? "Loading…" : `${online}/${roster?.total ?? 0}`}
        </span>
        <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", dark ? "text-ink-soft" : "text-white/70")}>
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              online > 0 ? "bg-emerald-500" : "bg-ink-soft/40",
              online > 0 && "animate-[pulse_2s_ease-in-out_infinite]",
            )}
            aria-hidden
          />
          online
        </span>
      </button>

      {open && (
        <div
          id="presence-roster"
          role="region"
          aria-label={`${title} list`}
          data-testid="presence-roster"
          className={cn(
            "absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border shadow-xl",
            dark ? "border-evergreen-900/10 bg-white text-evergreen-950" : "border-white/20 bg-evergreen-950/95 text-white",
          )}
        >
          <div className={cn("flex items-center justify-between gap-2 border-b px-4 py-3", dark ? "border-evergreen-900/10" : "border-white/10")}>
            <div>
              <p className="font-display text-sm font-semibold">{title}</p>
              <p className={cn("text-[11px]", dark ? "text-ink-soft" : "text-white/70")}>{summary}</p>
            </div>
            <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", dark ? "text-evergreen-700" : "text-gold-300")}>Live</span>
          </div>

          {error && (
            <p role="alert" className={cn("px-4 py-2 text-xs", dark ? "bg-amber-50 text-amber-900" : "bg-amber-400/20 text-amber-100")}>
              {error}
            </p>
          )}

          <ul className={cn("max-h-72 divide-y overflow-y-auto overscroll-contain", dark ? "divide-evergreen-900/5" : "divide-white/5")}>
            {(roster?.entries ?? []).map((entry) => (
              <PresenceRow key={entry.key} entry={entry} dark={dark} />
            ))}
            {roster && roster.entries.length === 0 && (
              <li className={cn("px-4 py-6 text-center text-xs", dark ? "text-ink-soft" : "text-white/60")}>
                Nobody else has joined yet. The list updates on its own.
              </li>
            )}
          </ul>

          <p className={cn("border-t px-4 py-2 text-[10px] leading-relaxed", dark ? "border-evergreen-900/10 text-ink-soft" : "border-white/10 text-white/60")}>
            Presence only. Answers, scores and private details are never shown here.
          </p>
        </div>
      )}
    </div>
  );
}

function PresenceRow({ entry, dark }: { entry: PresenceEntry; dark: boolean }) {
  const online = entry.connection === "online";
  const idle = entry.connection === "idle";
  return (
    <li className="flex items-center gap-2.5 px-4 py-2" data-testid="presence-row" data-connection={entry.connection}>
      <span className="relative">
        <ParticipantAvatar avatarKey={entry.avatar_key} name={entry.display_name} size={28} />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2",
            online ? "bg-emerald-500" : idle ? "bg-amber-400" : "bg-ink-soft/50",
            dark ? "ring-white" : "ring-evergreen-950",
          )}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">
          {entry.display_name}
          {entry.is_me && <span className={cn("ml-1 font-normal", dark ? "text-ink-soft" : "text-white/60")}>(you)</span>}
        </span>
        <span className={cn("block text-[10px]", dark ? "text-ink-soft" : "text-white/60")}>{presenceStatusLabel(entry.connection)}</span>
      </span>
      {online ? (
        <Wifi className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
      ) : (
        <WifiOff className={cn("h-3.5 w-3.5", idle ? "text-amber-500" : dark ? "text-ink-soft/50" : "text-white/40")} aria-hidden />
      )}
    </li>
  );
}
