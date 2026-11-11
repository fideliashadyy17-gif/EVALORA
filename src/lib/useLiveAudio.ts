"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveAudioEngine, type LiveAudioSnapshot, type MusicVariant } from "@/lib/liveAudio";
import {
  audioStorageKey,
  loadAudioPreferences,
  saveAudioPreferences,
  type AudioPreferences,
  type AudioRole,
  type ServerAudioSettings,
} from "@/lib/audioPreferences";
import type { MusicTrackKey } from "@/lib/liveMusic";

/**
 * React binding for the EVALORA audio engine.
 *
 * The engine lives for the lifetime of the page and is destroyed on unmount,
 * so opening the public screen twice in a room cannot double the music, and
 * navigating away releases the audio context. The hook also restores the
 * listener's saved volumes before the first note.
 */
export function useLiveAudio(options: {
  role: AudioRole;
  sessionId: string;
  server: ServerAudioSettings;
  track: MusicTrackKey | null;
  /** Host arrangement: evergreen (default), focus (calmer), celebration (brighter). */
  variant?: MusicVariant;
}) {
  const { role, sessionId, track } = options;
  const [engine, setEngine] = useState<LiveAudioEngine | null>(null);
  const [snapshot, setSnapshot] = useState<LiveAudioSnapshot | null>(null);
  const engineRef = useRef<LiveAudioEngine | null>(null);
  const storageKey = useMemo(() => audioStorageKey(role, sessionId), [role, sessionId]);

  useEffect(() => {
    const next = new LiveAudioEngine({
      role,
      server: options.server,
      preferences: loadAudioPreferences(typeof window === "undefined" ? null : window.localStorage, storageKey),
    });
    engineRef.current = next;
    setEngine(next);
    const unsubscribe = next.subscribe(setSnapshot);
    next.bindUnlockHandlers(typeof document === "undefined" ? null : document);
    return () => {
      unsubscribe();
      next.destroy();
      engineRef.current = null;
      setEngine(null);
      setSnapshot(null);
    };
    // `server` is applied by the effect below; recreating the engine for it
    // would drop the audio context on every host slider movement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, storageKey]);

  const { enabled, volume, music_enabled, sfx_enabled, sound_effects } = options.server;
  useEffect(() => {
    engineRef.current?.setServerSettings({ enabled, volume, music_enabled, sfx_enabled, sound_effects });
  }, [enabled, volume, music_enabled, sfx_enabled, sound_effects]);

  useEffect(() => {
    if (!engine) return;
    engine.setVariant(options.variant ?? "evergreen");
  }, [engine, options.variant]);

  useEffect(() => {
    if (!engine) return;
    engine.playTrack(track);
  }, [engine, track]);

  const updatePreferences = useCallback(
    (patch: Partial<AudioPreferences>) => {
      const active = engineRef.current;
      if (!active) return;
      active.setPreferences(patch);
      saveAudioPreferences(
        typeof window === "undefined" ? null : window.localStorage,
        storageKey,
        active.snapshot().preferences,
      );
    },
    [storageKey],
  );

  const unlock = useCallback(() => {
    void engineRef.current?.unlock();
  }, []);

  const cue = useCallback((key: Parameters<LiveAudioEngine["cue"]>[0]) => {
    engineRef.current?.cue(key);
  }, []);

  return { engine, snapshot, updatePreferences, unlock, cue };
}
