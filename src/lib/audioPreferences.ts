/**
 * Audio preferences — persisted per device, per role and per live session.
 *
 * Three independent levels (master / music / sound effects), a music switch, a
 * sound-effects switch and a global mute. Everything is stored locally: a
 * student's volume choice never travels to the server and can never be used to
 * identify them. Server-side activity settings (host authorisation) are applied
 * on top, never instead.
 */

export type AudioRole = "screen" | "participant" | "host";

export interface AudioPreferences {
  /** 0..1 */
  master: number;
  /** 0..1 */
  music: number;
  /** 0..1 */
  sfx: number;
  music_on: boolean;
  sfx_on: boolean;
  muted: boolean;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  master: 0.7,
  music: 0.65,
  sfx: 0.8,
  music_on: true,
  sfx_on: true,
  muted: false,
};

export interface ServerAudioSettings {
  enabled: boolean;
  volume: number;
  /** Host-level switch for music; absent falls back to `enabled`. */
  music_enabled?: boolean;
  /** Host-level switch for cues; absent falls back to `sound_effects`. */
  sfx_enabled?: boolean;
  sound_effects?: boolean;
}

const clamp01 = (value: unknown, fallback: number) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
};

export function parseAudioPreferences(raw: unknown): AudioPreferences {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    master: clamp01(value.master, DEFAULT_AUDIO_PREFERENCES.master),
    music: clamp01(value.music, DEFAULT_AUDIO_PREFERENCES.music),
    sfx: clamp01(value.sfx, DEFAULT_AUDIO_PREFERENCES.sfx),
    music_on: value.music_on !== false,
    sfx_on: value.sfx_on !== false,
    muted: value.muted === true,
  };
}

export function audioStorageKey(role: AudioRole, sessionId: string): string {
  return `evalora:audio:v1:${role}:${String(sessionId || "default").slice(0, 80)}`;
}

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void } | null;

export function loadAudioPreferences(storage: StorageLike, key: string): AudioPreferences {
  if (!storage) return { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { ...DEFAULT_AUDIO_PREFERENCES };
    return parseAudioPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function saveAudioPreferences(storage: StorageLike, key: string, preferences: AudioPreferences): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(parseAudioPreferences(preferences)));
  } catch {
    /* Private mode or quota: audio still works, it just is not remembered. */
  }
}

/**
 * The live quiz/competition room is shared by a projector and up to hundreds of
 * telephones. Music plays on the public screen only; participants are silent by
 * default so the room never hears the same track twice, twice-offset. A host who
 * explicitly enables `music_enabled` shares the soundtrack with participant
 * devices too — a deliberate choice, not the default. A participant can always
 * lower the volume or mute; their controls never raise it above the host's.
 */
export function defaultOwnsMusic(role: AudioRole, server: ServerAudioSettings): boolean {
  if (!server.enabled) return false;
  if (role === "screen" || role === "host") return true;
  return server.music_enabled === true;
}

export function serverAllowsMusic(server: ServerAudioSettings): boolean {
  if (!server.enabled) return false;
  if (server.music_enabled === false) return false;
  return true;
}

export function serverAllowsSfx(server: ServerAudioSettings): boolean {
  if (!server.enabled) return false;
  if (server.sfx_enabled === false) return false;
  if (server.sound_effects === false) return false;
  return true;
}

/** Final linear gains handed to the engine; 0 means the bus is silent. */
export function effectiveGain(preferences: AudioPreferences, server: ServerAudioSettings, owns: boolean): { music: number; sfx: number } {
  const muted = preferences.muted || preferences.master <= 0;
  const master = muted ? 0 : preferences.master * clamp01(server.volume, 0.6);
  return {
    music: owns && preferences.music_on && serverAllowsMusic(server) ? master * preferences.music : 0,
    sfx: preferences.sfx_on && serverAllowsSfx(server) ? master * preferences.sfx : 0,
  };
}
