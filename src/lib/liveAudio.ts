/**
 * EVALORA audio engine (browser).
 *
 * A small, dependency-free Web Audio engine that plays the original EVALORA
 * compositions from `liveMusic.ts`. It is deliberately conservative:
 *
 *  · three real buses — master → soft compressor → speakers, with music and
 *    sound-effects gain stages underneath, so the two never fight;
 *  · a look-ahead scheduler (bar-accurate, drift-free) that fades between
 *    sections instead of cutting them, which keeps loops and transitions free
 *    of clicks;
 *  · autoplay-safe: nothing is created until a user gesture unlocks the
 *    context, and the UI is told when the browser is still blocking;
 *  · exactly one owner per room. The public screen/host console plays music;
 *    participants stay silent unless the host or the participant opts in, so a
 *    projector and a phone in the same room never play the same track twice.
 *
 * No audio files are fetched: every sound is generated locally, which is why
 * the music works on first load, offline and on iOS/Android without CORS,
 * range-request or codec differences.
 */

import {
  CUES,
  MUSIC_TRACKS,
  musicTrack,
  renderBar,
  type CueKey,
  type MusicTrackKey,
} from "./liveMusic";
import {
  DEFAULT_AUDIO_PREFERENCES,
  effectiveGain,
  parseAudioPreferences,
  type AudioPreferences,
  type ServerAudioSettings,
} from "./audioPreferences";

/** Host-selectable arrangement: full energy, calmer, or brighter. */
export type MusicVariant = "evergreen" | "focus" | "celebration";

export interface LiveAudioSnapshot {
  /** Audio context exists and is running. */
  running: boolean;
  /** A music track is scheduled. */
  playing: boolean;
  track: MusicTrackKey | null;
  /** Browser blocked playback until a gesture (an "enable sound" button). */
  blocked: boolean;
  /** This surface is allowed to play music (single-owner rule). */
  ownsMusic: boolean;
  musicGain: number;
  sfxGain: number;
  variant: MusicVariant;
  preferences: AudioPreferences;
}

type Listener = (snapshot: LiveAudioSnapshot) => void;

type CtxFactory = () => AudioContext;

const LOOKAHEAD_SECONDS = 0.4;
const SCHEDULER_MS = 80;
const SECTION_FADE = 0.18;

export class LiveAudioEngine {
  private readonly factory: CtxFactory | null;
  private readonly role: "screen" | "participant" | "host";

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private section: GainNode | null = null;

  private preferences: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private server: ServerAudioSettings = { enabled: true, volume: 0.6 };
  private ownsMusic = true;

  private track: MusicTrackKey | null = null;
  private variant: MusicVariant = "evergreen";
  private barIndex = 0;
  private nextBarAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private running = false;
  private blocked = false;
  private destroyed = false;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly listeners = new Set<Listener>();
  private unlockBound = false;

  constructor(options: {
    role: "screen" | "participant" | "host";
    server?: ServerAudioSettings;
    preferences?: Partial<AudioPreferences>;
    contextFactory?: CtxFactory;
  }) {
    this.role = options.role;
    this.server = { ...this.server, ...(options.server ?? {}) };
    this.preferences = parseAudioPreferences({ ...DEFAULT_AUDIO_PREFERENCES, ...(options.preferences ?? {}) });
    this.factory =
      options.contextFactory ??
      (typeof window !== "undefined"
        ? () => {
            const Ctor =
              window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) throw new Error("Web Audio is not available in this browser.");
            return new Ctor();
          }
        : null);
    this.ownsMusic = this.computeOwnership();
  }

  /** Subscribe to state changes (React) — returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): LiveAudioSnapshot {
    const gains = effectiveGain(this.preferences, this.server, this.ownsMusic);
    return {
      running: this.running,
      playing: Boolean(this.track) && this.running && gains.music > 0,
      track: this.track,
      blocked: this.blocked,
      ownsMusic: this.ownsMusic,
      musicGain: gains.music,
      sfxGain: gains.sfx,
      variant: this.variant,
      preferences: { ...this.preferences },
    };
  }

  private computeOwnership(): boolean {
    if (this.role === "screen" || this.role === "host") return this.server.enabled;
    // Participants are silent unless the host explicitly shares music with
    // devices. Their own controls can lower or mute that, never raise it.
    return this.server.enabled && this.server.music_enabled === true;
  }

  private emit() {
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
  }

  /* ── context and buses ─────────────────────────────────────────────── */

  private ensureContext(): AudioContext | null {
    if (this.destroyed) return null;
    if (this.ctx) return this.ctx;
    if (!this.factory) return null;
    const ctx = this.factory();
    const master = ctx.createGain();
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    // Gentle bus compression: no clipping when a celebration cue lands on a
    // full arrangement, and no pumping on quiet passages.
    compressor.threshold.value = -18;
    compressor.knee.value = 22;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    const musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 9000;
    musicFilter.Q.value = 0.4;
    musicBus.connect(musicFilter);
    musicFilter.connect(master);

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = 0;
    sfxBus.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.musicBus = musicBus;
    this.sfxBus = sfxBus;
    this.applyGains(0.05);
    return ctx;
  }

  private applyGains(ramp = 0.08) {
    const gains = effectiveGain(this.preferences, this.server, this.ownsMusic);
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const masterLevel = this.preferences.muted ? 0 : this.preferences.master * 0.9;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(masterLevel, now, ramp);
    this.musicBus.gain.setTargetAtTime(gains.music > 0 ? Math.min(1, this.preferences.music * 0.9) : 0, now, ramp);
    this.sfxBus.gain.setTargetAtTime(gains.sfx > 0 ? Math.min(1, this.preferences.sfx) : 0, now, ramp);
  }

  /** Attaches one-shot unlock listeners; safe to call repeatedly. */
  bindUnlockHandlers(target: Document | Window | null = typeof document !== "undefined" ? document : null) {
    if (!target || this.unlockBound) return;
    this.unlockBound = true;
    const handler = () => {
      void this.unlock();
      target.removeEventListener("pointerdown", handler, true);
      target.removeEventListener("keydown", handler, true);
      target.removeEventListener("touchstart", handler, true);
    };
    target.addEventListener("pointerdown", handler, true);
    target.addEventListener("keydown", handler, true);
    target.addEventListener("touchstart", handler, true);
  }

  /** Must be called from a user gesture (button click, key press, tap). */
  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      if (ctx.state !== "running") await ctx.resume();
    } catch {
      /* iOS may reject resume outside a gesture; the button retries. */
    }
    this.running = ctx.state === "running";
    this.blocked = !this.running;
    if (this.running && this.track) {
      // A track requested before the gesture has no section yet: build it now,
      // exactly as if `playTrack` had run after the unlock.
      if (!this.section || this.section === null) this.beginSection();
      else this.startScheduler();
    }
    this.emit();
    return this.running;
  }

  /* ── configuration ─────────────────────────────────────────────────── */

  setPreferences(preferences: Partial<AudioPreferences>) {
    this.preferences = parseAudioPreferences({ ...this.preferences, ...preferences });
    this.ownsMusic = this.computeOwnership();
    this.applyGains();
    if (!this.ownsMusic) this.stop();
    this.emit();
  }

  setServerSettings(server: Partial<ServerAudioSettings>) {
    this.server = { ...this.server, ...server };
    const wasOwner = this.ownsMusic;
    this.ownsMusic = this.computeOwnership();
    this.applyGains();
    if (wasOwner && !this.ownsMusic) this.stop();
    if (!wasOwner && this.ownsMusic && this.track) this.startScheduler();
    this.emit();
  }

  /**
   * Arrangement variant from the host's settings: `focus` drops the percussion
   * texture, `celebration` lifts the whole mix. It applies from the next bar, so
   * changing it mid-question never clicks or restarts the loop.
   */
  setVariant(variant: MusicVariant) {
    if (this.variant === variant) return;
    this.variant = variant;
    this.emit();
  }

  /* ── music ─────────────────────────────────────────────────────────── */

  /** Play (or keep playing) a track. Passing the current track is a no-op. */
  playTrack(key: MusicTrackKey | null) {
    if (key === null) {
      this.stop();
      return;
    }
    if (this.track === key && this.timer) {
      this.emit();
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state !== "running") {
      // Autoplay policy: remember the track and wait for a gesture.
      this.track = key;
      this.blocked = true;
      this.emit();
      return;
    }
    this.running = true;
    this.blocked = false;
    this.track = key;
    this.beginSection();
    this.emit();
  }

  private beginSection() {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.track) return;
    this.generation += 1;
    const previous = this.section;
    if (previous) {
      const now = ctx.currentTime;
      previous.gain.cancelScheduledValues(now);
      previous.gain.setTargetAtTime(0, now, SECTION_FADE / 3);
      const old = previous;
      setTimeout(() => {
        try {
          old.disconnect();
        } catch {
          /* already disconnected */
        }
      }, SECTION_FADE * 1000 + 200);
    }
    const section = ctx.createGain();
    section.gain.setValueAtTime(0, ctx.currentTime);
    section.gain.setTargetAtTime(1, ctx.currentTime, SECTION_FADE / 3);
    section.connect(this.musicBus);
    this.section = section;
    this.barIndex = 0;
    this.nextBarAt = ctx.currentTime + 0.12;
    this.startScheduler();
  }

  private startScheduler() {
    if (this.timer || !this.ctx || !this.track) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), SCHEDULER_MS);
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || !this.track || !this.section || this.destroyed) return;
    if (ctx.state !== "running") {
      this.running = false;
      this.blocked = true;
      this.emit();
      return;
    }
    const spec = musicTrack(this.track);
    const barLength = (60 / spec.bpm) * spec.beatsPerBar;
    while (this.nextBarAt < ctx.currentTime + LOOKAHEAD_SECONDS) {
      const rendered = renderBar(spec, this.barIndex, this.nextBarAt);
      const events =
        this.variant === "focus"
          ? rendered.filter((event) => event.role !== "percussion").map((event) => ({ ...event, gain: event.gain * 0.8 }))
          : this.variant === "celebration"
            ? rendered.map((event) => ({ ...event, gain: Math.min(0.18, event.gain * 1.08) }))
            : rendered;
      this.schedule(events, this.section);
      this.barIndex += 1;
      this.nextBarAt += barLength;
    }
  }

  private schedule(events: { offset: number; freq: number; duration: number; gain: number; wave: OscillatorType }[], destination: GainNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const event of events) {
      if (event.offset < ctx.currentTime - 0.05) continue;
      const osc = ctx.createOscillator();
      osc.type = event.wave;
      osc.frequency.setValueAtTime(event.freq, event.offset);
      // A whisper of detune keeps the square lead from sounding sterile.
      if (event.wave === "square") osc.detune.setValueAtTime(4, event.offset);
      const voice = ctx.createGain();
      const attack = Math.min(0.02, event.duration / 3);
      voice.gain.setValueAtTime(0.0001, event.offset);
      voice.gain.linearRampToValueAtTime(event.gain, event.offset + attack);
      voice.gain.exponentialRampToValueAtTime(0.0004, event.offset + Math.max(event.duration, attack + 0.03));
      osc.connect(voice);
      voice.connect(destination);
      osc.start(event.offset);
      osc.stop(event.offset + Math.max(event.duration, attack + 0.03) + 0.02);
      this.sources.add(osc);
      osc.onended = () => {
        this.sources.delete(osc);
        try {
          voice.disconnect();
        } catch {
          /* already gone */
        }
      };
    }
  }

  /** Play a short musical cue on the sound-effects bus. */
  cue(key: CueKey) {
    if (!CUES[key]) return;
    const gains = effectiveGain(this.preferences, this.server, this.ownsMusic);
    if (gains.sfx <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxBus || ctx.state !== "running") return;
    const spec = CUES[key];
    const start = ctx.currentTime + 0.03;
    this.schedule(
      spec.notes.map((note) => ({
        offset: start + note.offset,
        freq: note.freq,
        duration: note.duration,
        gain: note.gain,
        wave: note.wave,
      })),
      this.sfxBus,
    );
  }

  stop() {
    this.generation += 1;
    this.track = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    const section = this.section;
    this.section = null;
    if (ctx && section) {
      const now = ctx.currentTime;
      section.gain.cancelScheduledValues(now);
      section.gain.setTargetAtTime(0, now, SECTION_FADE / 3);
      setTimeout(() => {
        try {
          section.disconnect();
        } catch {
          /* already disconnected */
        }
      }, SECTION_FADE * 1000 + 250);
    }
    this.emit();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    for (const source of Array.from(this.sources)) {
      try {
        source.stop();
      } catch {
        /* not started */
      }
    }
    this.sources.clear();
    this.listeners.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  /** Track keys available for the host's "theme" picker and for tests. */
  static tracks(): MusicTrackKey[] {
    return MUSIC_TRACKS.map((track) => track.key);
  }
}
