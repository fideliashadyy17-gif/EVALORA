"use client";

export type LiveSoundName =
  | "lobby-loop" | "question-loop" | "game-start" | "question-transition" | "countdown-suspense" | "time-up"
  | "answer-reveal" | "answer-submitted" | "answer-correct" | "answer-try-again" | "leaderboard"
  | "rank-shift" | "podium-victory" | "game-complete";
export type LiveAudioBus = "music" | "effects";

/** Original EVALORA live-game assets, played only after an explicit gesture unlocks Web Audio. */
export class LiveAudioPlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<LiveSoundName, Promise<AudioBuffer | null>>();
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private busGains: Record<LiveAudioBus, GainNode> | null = null;
  private musicName: LiveSoundName | null = null;

  async unlock() {
    if (typeof window === "undefined") return false;
    try {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context ??= new AudioCtor();
      if (!this.masterGain) {
        this.masterGain = this.context.createGain();
        this.busGains = { music: this.context.createGain(), effects: this.context.createGain() };
        this.busGains.music.connect(this.masterGain);
        this.busGains.effects.connect(this.masterGain);
        this.masterGain.connect(this.context.destination);
        this.setVolumes(1, 0.55, 0.8);
      }
      await this.context.resume();
      return true;
    } catch {
      return false;
    }
  }

  setVolumes(master: number, music: number, effects: number) {
    if (!this.context || !this.masterGain || !this.busGains) return;
    const now = this.context.currentTime;
    this.masterGain.gain.setTargetAtTime(clamp(master), now, 0.025);
    this.busGains.music.gain.setTargetAtTime(clamp(music), now, 0.025);
    this.busGains.effects.gain.setTargetAtTime(clamp(effects), now, 0.025);
  }

  private load(name: LiveSoundName) {
    if (!this.context) return Promise.resolve(null);
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const loading = fetch(`/audio/live/${name}.wav`, { cache: "force-cache" })
      .then((response) => response.ok ? response.arrayBuffer() : null)
      .then((bytes) => bytes && this.context ? this.context.decodeAudioData(bytes) : null)
      .catch(() => null);
    this.buffers.set(name, loading);
    return loading;
  }

  preload(names: LiveSoundName[]) {
    return Promise.all(names.map((name) => this.load(name)));
  }

  async play(name: LiveSoundName, bus: LiveAudioBus = "effects", offset = 0) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || !this.busGains) return;
    const buffer = await this.load(name);
    if (!buffer || !this.context || this.context.state !== "running") return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = 1;
    source.connect(gain).connect(this.busGains[bus]);
    source.start(0, Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.02))));
  }

  async setMusic(name: LiveSoundName | null) {
    if (name === this.musicName) return;
    this.stopMusic();
    this.musicName = name;
    if (!name || !this.context || this.context.state !== "running" || !this.busGains) return;
    const buffer = await this.load(name);
    if (!buffer || !this.context || this.context.state !== "running" || name !== this.musicName) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    gain.gain.value = 0.0001;
    source.connect(gain).connect(this.busGains.music);
    source.start();
    gain.gain.setTargetAtTime(1, this.context.currentTime, 0.12);
    this.musicSource = source;
    this.musicGain = gain;
  }

  stopMusic() {
    if (this.context && this.musicGain) this.musicGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.04);
    try { this.musicSource?.stop((this.context?.currentTime ?? 0) + 0.2); } catch { /* already stopped */ }
    this.musicSource = null;
    this.musicGain = null;
    this.musicName = null;
  }

  dispose() {
    this.stopMusic();
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
    this.buffers.clear();
  }
}

function clamp(value: number) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
