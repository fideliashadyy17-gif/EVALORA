"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Volume2, VolumeX, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from "@/lib/audioPreferences";
import type { LiveAudioSnapshot } from "@/lib/liveAudio";

/**
 * Listener-facing audio controls: master, music, sound effects, music on/off,
 * effects on/off and mute-all. It is a popover anchored to a small button, so it
 * can sit in a corner of the quiz without covering the question.
 *
 * Every change is stored on the device — no audio preference is ever sent to
 * the server, and a teacher's room settings are never overwritten by a student.
 */
export function AudioControls({
  snapshot,
  onPreferences,
  onUnlock,
  variant = "participant",
  className,
}: {
  snapshot: LiveAudioSnapshot | null;
  onPreferences: (patch: Partial<AudioPreferences>) => void;
  onUnlock: () => void;
  variant?: "screen" | "participant" | "host";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const preferences = snapshot?.preferences ?? DEFAULT_AUDIO_PREFERENCES;
  const blocked = snapshot?.blocked === true;
  const silent = preferences.muted || preferences.master <= 0;
  const musicOff = silent || !preferences.music_on;

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

  const Icon = silent ? VolumeX : musicOff ? Waves : Music2;

  return (
    <div ref={ref} className={cn("relative print:hidden", className)} data-testid="audio-controls">
      <button
        type="button"
        onClick={() => {
          if (blocked) onUnlock();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={blocked ? "Sound is waiting for permission — open sound settings" : "Sound settings"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          variant === "screen"
            ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
            : "border-evergreen-900/15 bg-white/90 text-evergreen-900 hover:bg-white",
          blocked && "animate-pulse ring-2 ring-gold-500/70",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {blocked ? "Enable sound" : silent ? "Muted" : "Sound"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sound settings"
          data-testid="audio-settings-panel"
          className={cn(
            "absolute z-40 mt-2 w-72 rounded-2xl border p-4 text-sm shadow-xl",
            variant === "screen" ? "right-0 border-white/20 bg-evergreen-950/95 text-white" : "right-0 border-evergreen-900/10 bg-white text-evergreen-950",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold">EVALORA sound</p>
            <button
              type="button"
              onClick={() => onPreferences({ muted: !preferences.muted })}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                preferences.muted ? "bg-red-600 text-white" : variant === "screen" ? "bg-white/15 text-white" : "bg-cream text-evergreen-900",
              )}
              aria-pressed={preferences.muted}
            >
              {preferences.muted ? "Unmute all" : "Mute all"}
            </button>
          </div>

          {blocked && (
            <p className={cn("mb-3 rounded-lg px-2 py-1.5 text-xs", variant === "screen" ? "bg-gold-500/20 text-gold-100" : "bg-gold-100 text-gold-800")}>
              Your browser needs a tap before it can play audio.{" "}
              <button type="button" onClick={onUnlock} className="font-semibold underline">
                Enable now
              </button>
            </p>
          )}

          <div className="space-y-3">
            <SliderRow
              label="Music"
              icon={<Music2 className="h-4 w-4" aria-hidden />}
              enabled={preferences.music_on}
              onToggle={() => onPreferences({ music_on: !preferences.music_on })}
              value={preferences.music}
              onChange={(value) => onPreferences({ music: value })}
              dark={variant === "screen"}
              testId="music-volume"
            />
            <SliderRow
              label="Sound effects"
              icon={<Waves className="h-4 w-4" aria-hidden />}
              enabled={preferences.sfx_on}
              onToggle={() => onPreferences({ sfx_on: !preferences.sfx_on })}
              value={preferences.sfx}
              onChange={(value) => onPreferences({ sfx: value })}
              dark={variant === "screen"}
              testId="sfx-volume"
            />
            <SliderRow
              label="Master"
              icon={<Volume2 className="h-4 w-4" aria-hidden />}
              enabled={!preferences.muted}
              onToggle={() => onPreferences({ muted: !preferences.muted })}
              value={preferences.master}
              onChange={(value) => onPreferences({ master: value, muted: false })}
              dark={variant === "screen"}
              testId="master-volume"
            />
          </div>

          {variant !== "screen" && snapshot && !snapshot.ownsMusic && (
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              The room soundtrack plays on the public screen. This device stays silent so you never hear it twice.
            </p>
          )}
          <p className={cn("mt-3 text-[11px] leading-relaxed", variant === "screen" ? "text-white/60" : "text-ink-soft")}>
            Original EVALORA music, generated on this device. Preferences are saved here only.
          </p>
        </div>
      )}
    </div>
  );
}

function SliderRow({
  label,
  icon,
  enabled,
  onToggle,
  value,
  onChange,
  dark,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: () => void;
  value: number;
  onChange: (value: number) => void;
  dark: boolean;
  testId: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          {icon}
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${label} on`}
          onClick={onToggle}
          className={cn("relative h-5 w-9 rounded-full transition", enabled ? "bg-evergreen-700" : dark ? "bg-white/25" : "bg-evergreen-900/20")}
        >
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition", enabled ? "left-4.5" : "left-0.5")} />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label={`${label} volume`}
        data-testid={testId}
        disabled={!enabled}
        className={cn("mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-gold-600", dark ? "bg-white/20" : "bg-evergreen-900/15")}
      />
    </div>
  );
}

/**
 * Unobtrusive "tap to start the music" pill. Shown only while the browser is
 * blocking audio, which is the normal first-load state on projector browsers.
 */
export function AudioEnableChip({
  snapshot,
  onUnlock,
  variant = "screen",
  className,
}: {
  snapshot: LiveAudioSnapshot | null;
  onUnlock: () => void;
  variant?: "screen" | "participant";
  className?: string;
}) {
  if (!snapshot?.blocked) return null;
  return (
    <button
      type="button"
      onClick={onUnlock}
      data-testid="audio-enable-chip"
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variant === "screen" ? "bg-gold-500 text-evergreen-950 hover:bg-gold-400" : "bg-evergreen-800 text-white hover:bg-evergreen-700",
        "animate-[pulse_2.4s_ease-in-out_infinite]",
        className,
      )}
    >
      <Volume2 className="h-4 w-4" aria-hidden />
      Tap for sound
    </button>
  );
}
