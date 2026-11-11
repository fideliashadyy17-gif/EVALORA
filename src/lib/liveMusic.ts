/**
 * EVALORA live music — original compositions.
 *
 * Every note in this file is composed for EVALORA. There are no third-party
 * recordings, samples or sound-alikes: the tracks are described as note data
 * (MIDI numbers, rhythms, chord progressions) and synthesised in the browser by
 * `liveAudio.ts`. Nothing is downloaded, and nothing resembles another quiz
 * platform's audio.
 *
 * The engine loops four-bar progressions: because each progression returns to
 * its starting harmony, the loop point is musical rather than a hard restart.
 */

export type MusicTrackKey = "lobby" | "question" | "countdown" | "leaderboard" | "podium" | "champion";

export type CueKey =
  | "transition"
  | "correct"
  | "incorrect"
  | "tick"
  | "join"
  | "lock"
  | "reveal"
  | "podium-third"
  | "podium-second"
  | "podium-champion"
  | "board";

export type NoteRole = "bass" | "chord" | "lead" | "percussion";

export interface NoteEvent {
  /** Seconds from the start of the rendered bar. */
  offset: number;
  /** Frequency in Hz. */
  freq: number;
  /** Seconds the oscillator is held. */
  duration: number;
  /** Per-note peak gain (already scaled for headroom). */
  gain: number;
  wave: OscillatorType;
  role: NoteRole;
}

export interface MusicSpec {
  key: MusicTrackKey;
  bpm: number;
  beatsPerBar: number;
  /** Distinct bars before the progression repeats. */
  loopBars: number;
  /** Chord voicing per bar (MIDI numbers). */
  chords: number[][];
  /** Eight eighth-notes per bar; null is a rest. Absent entries rest. */
  lead: (number | null)[][];
  /**
   * Eight eighth-notes per bar of bass movement, as semitones above the chord
   * root one octave down. `null` is a rest.
   */
  bass: (number | null)[][];
  drums: "four-on-floor" | "backbeat" | "none";
  /** Overall track level, 0..1 of the music bus. */
  level: number;
}

/** MIDI number → frequency, A4 (69) = 440 Hz. */
export function midiToFreq(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

const rest = (count: number) => Array.from({ length: count }, () => null as number | null);

const LOBBY_BASS: (number | null)[][] = [
  [0, null, 7, null, 0, 12, 7, null],
  [0, null, 7, null, 0, 12, 7, null],
  [0, null, 7, null, 12, 7, 0, 7],
  [0, null, 7, null, 12, 7, 0, 7],
];

const LOBBY_LEAD: (number | null)[][] = [
  [72, 74, 76, 79, 76, 74, 72, 67],
  [69, 72, 76, 79, 81, 79, 76, 72],
  [72, 74, 77, 81, 77, 74, 72, 69],
  [71, 74, 79, 83, 79, 74, 71, 67],
];

const QUESTION_LEAD: (number | null)[][] = [
  [69, 72, 76, 72, 79, 76, 72, 69],
  [65, 69, 72, 69, 77, 72, 69, 65],
  [67, 72, 76, 72, 79, 76, 72, 67],
  [67, 71, 74, 79, 74, 71, 67, 62],
];

const QUESTION_BASS: (number | null)[][] = [
  [0, 0, null, 7, 0, 0, 12, 7],
  [0, 0, null, 7, 0, 0, 12, 7],
  [0, 0, null, 7, 0, 12, 7, 0],
  [0, 0, null, 7, 0, 12, 7, 0],
];

/** All live tracks. Order is stable for tests and for the phase mapping. */
export const MUSIC_TRACKS: MusicSpec[] = [
  {
    key: "lobby",
    bpm: 118,
    beatsPerBar: 4,
    loopBars: 4,
    // C major: I – vi – IV – V, upbeat welcome loop.
    chords: [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ],
    lead: LOBBY_LEAD,
    bass: LOBBY_BASS,
    drums: "four-on-floor",
    level: 0.9,
  },
  {
    key: "question",
    bpm: 128,
    beatsPerBar: 4,
    loopBars: 4,
    // A minor: i – VI – III – VII, steady driving concentration loop.
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    lead: QUESTION_LEAD,
    bass: QUESTION_BASS,
    drums: "backbeat",
    level: 0.85,
  },
  {
    key: "countdown",
    bpm: 146,
    beatsPerBar: 4,
    loopBars: 2,
    // Same tonic, lifted energy for the final seconds: rising semitone line.
    chords: [
      [57, 60, 64],
      [59, 62, 66],
    ],
    lead: [
      [81, 83, 84, 86, 88, 86, 84, 83],
      [84, 86, 88, 91, 93, 91, 88, 86],
    ],
    bass: [
      [0, 0, 12, 0, 7, 7, 12, 7],
      [0, 0, 12, 0, 7, 7, 12, 12],
    ],
    drums: "four-on-floor",
    level: 0.95,
  },
  {
    key: "leaderboard",
    bpm: 124,
    beatsPerBar: 4,
    loopBars: 4,
    // F major lift: IV – V – vi – I, competitive but friendly.
    chords: [
      [53, 57, 60],
      [55, 59, 62],
      [57, 60, 64],
      [48, 52, 55],
    ],
    lead: [
      [72, 76, 77, 81, 77, 76, 72, 69],
      [71, 74, 79, 83, 79, 74, 71, 67],
      [72, 76, 79, 84, 79, 76, 72, 69],
      [72, 76, 79, 84, 88, 84, 79, 76],
    ],
    bass: [
      [0, null, 7, null, 0, 12, 7, null],
      [0, null, 7, null, 0, 12, 7, null],
      [0, null, 7, null, 0, 12, 7, null],
      [0, null, 7, null, 12, 7, 0, 7],
    ],
    drums: "four-on-floor",
    level: 0.9,
  },
  {
    key: "podium",
    bpm: 112,
    beatsPerBar: 4,
    loopBars: 4,
    // Ceremony progression: C – G – Am – F, stately and bright.
    chords: [
      [60, 64, 67],
      [55, 59, 62],
      [57, 60, 64],
      [53, 57, 60],
    ],
    lead: [
      [72, 76, 79, 84, 79, 76, 72, 76],
      [74, 79, 83, 86, 83, 79, 74, 71],
      [72, 76, 81, 84, 81, 76, 72, 69],
      [72, 77, 81, 84, 81, 77, 72, 67],
    ],
    bass: [
      [0, null, null, 7, null, 12, null, 7],
      [0, null, null, 7, null, 12, null, 7],
      [0, null, null, 7, null, 12, null, 7],
      [0, null, 12, null, 7, null, 0, null],
    ],
    drums: "backbeat",
    level: 0.88,
  },
  {
    key: "champion",
    bpm: 116,
    beatsPerBar: 4,
    loopBars: 4,
    // Celebration: F – C – G – Am with a high, singable fanfare line.
    chords: [
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
      [57, 60, 64],
    ],
    lead: [
      [77, 81, 84, 89, 84, 81, 77, 81],
      [79, 84, 88, 91, 88, 84, 79, 76],
      [79, 83, 86, 91, 86, 83, 79, 74],
      [81, 84, 88, 93, 88, 84, 81, 76],
    ],
    bass: [
      [0, 0, 7, 0, 12, 12, 7, 0],
      [0, 0, 7, 0, 12, 12, 7, 0],
      [0, 0, 7, 0, 12, 12, 7, 0],
      [0, 0, 7, 0, 12, 7, 0, 12],
    ],
    drums: "four-on-floor",
    level: 0.95,
  },
];

export function musicTrack(key: MusicTrackKey): MusicSpec {
  const found = MUSIC_TRACKS.find((track) => track.key === key);
  if (!found) throw new Error(`Unknown music track: ${key}`);
  return found;
}

/**
 * Which original track belongs to a live phase. `null` means silence: the
 * paused room and the formal, completed states never carry music.
 */
export function trackForPhase(phase: string, options: { status?: string; stage?: string; remaining?: number | null } = {}): MusicTrackKey | null {
  if (options.status === "paused") return null;
  const stage = options.stage ?? "idle";
  if (["suspense", "third", "second"].includes(stage)) return "podium";
  if (stage === "champion") return "champion";
  if (stage === "board") return "leaderboard";
  if (stage === "finished") return "lobby";
  switch (phase) {
    case "waiting":
      return "lobby";
    case "countdown":
      return "countdown";
    case "question":
      // The final seconds move to the high-energy countdown track; once time is
      // up the room resolves into the bright leaderboard progression.
      return options.remaining !== null && options.remaining !== undefined && options.remaining > 0 && options.remaining <= 5
        ? "countdown"
        : "question";
    case "time_expired":
      return "leaderboard";
    case "answer_reveal":
      return "leaderboard";
    case "leaderboard":
      return "leaderboard";
    case "podium":
      return "podium";
    case "completed":
      return null;
    default:
      return null;
  }
}

/**
 * Renders one bar of a track as timed note events. `barStart` is the absolute
 * time (seconds on the AudioContext clock) of the first beat, so the caller can
 * schedule ahead of the playhead for a seamless loop.
 */
export function renderBar(spec: MusicSpec, barIndex: number, barStart = 0): NoteEvent[] {
  const step = 60 / spec.bpm / 2;
  const bar = ((barIndex % spec.loopBars) + spec.loopBars) % spec.loopBars;
  const events: NoteEvent[] = [];

  // Harmony: two sustained pads per bar (beats 1 and 3), quiet and warm.
  const chord = spec.chords[bar] ?? spec.chords[0];
  for (const beat of [0, 4]) {
    for (const note of chord) {
      events.push({
        offset: barStart + beat * step,
        freq: midiToFreq(note),
        duration: step * 3.4,
        gain: 0.026 * spec.level,
        wave: "triangle",
        role: "chord",
      });
    }
  }

  // Bass: eighth-note groove under the harmony.
  const bassLine = spec.bass[bar] ?? rest(8);
  const root = (chord[0] ?? 48) - 24;
  bassLine.slice(0, 8).forEach((semitones, index) => {
    if (semitones === null || semitones === undefined) return;
    events.push({
      offset: barStart + index * step,
      freq: midiToFreq(root + semitones),
      duration: step * 0.85,
      gain: 0.07 * spec.level,
      wave: "sawtooth",
      role: "bass",
    });
  });

  // Lead: the melody, on eighths with a little length variation so it sings.
  const lead = spec.lead[bar] ?? rest(8);
  lead.slice(0, 8).forEach((note, index) => {
    if (note === null || note === undefined) return;
    const accent = index % 4 === 0 ? 1 : index % 2 === 0 ? 0.86 : 0.74;
    events.push({
      offset: barStart + index * step,
      freq: midiToFreq(note),
      duration: step * (index % 4 === 0 ? 0.95 : 0.7),
      gain: 0.062 * accent * spec.level,
      wave: "square",
      role: "lead",
    });
  });

  // Percussion: a steady foundation, never the main event.
  if (spec.drums !== "none") {
    const kickSteps = spec.drums === "four-on-floor" ? [0, 2, 4, 6] : [0, 3, 4, 6];
    for (const index of kickSteps) {
      events.push({
        offset: barStart + index * step,
        freq: 62,
        duration: 0.13,
        gain: 0.15 * spec.level,
        wave: "sine",
        role: "percussion",
      });
    }
    const backbeats = spec.drums === "backbeat" ? [2, 6] : [2, 6];
    for (const index of backbeats) {
      events.push({
        offset: barStart + index * step,
        freq: 260,
        duration: 0.07,
        gain: 0.06 * spec.level,
        wave: "triangle",
        role: "percussion",
      });
    }
    for (let index = 0; index < 8; index += 1) {
      events.push({
        offset: barStart + index * step,
        freq: 6400,
        duration: 0.035,
        gain: (index % 2 === 0 ? 0.022 : 0.014) * spec.level,
        wave: "square",
        role: "percussion",
      });
    }
  }

  return events.sort((a, b) => a.offset - b.offset);
}

/** Renders `bars` consecutive bars from bar 0 of the loop, for the engine. */
export function renderLoop(spec: MusicSpec, bars: number): NoteEvent[] {
  const events: NoteEvent[] = [];
  const barLength = (60 / spec.bpm) * spec.beatsPerBar;
  for (let index = 0; index < bars; index += 1) {
    events.push(...renderBar(spec, index, index * barLength));
  }
  return events;
}

/* ── Musical cues (short, melodic, never horror-style) ──────────────────── */

export interface CueSpec {
  key: CueKey;
  notes: { offset: number; freq: number; duration: number; gain: number; wave: OscillatorType }[];
}

const cue = (key: CueKey, notes: CueSpec["notes"]): CueSpec => ({ key, notes });

const CUE_LIST: CueSpec[] = [
  // Short musical stab used when the room moves to the next question.
  cue("transition", [
    { offset: 0, freq: midiToFreq(84), duration: 0.12, gain: 0.07, wave: "triangle" },
    { offset: 0.06, freq: midiToFreq(88), duration: 0.16, gain: 0.07, wave: "triangle" },
    { offset: 0.12, freq: midiToFreq(91), duration: 0.3, gain: 0.075, wave: "triangle" },
  ]),
  // Rising major arpeggio: rewarding, short, never louder than the music.
  cue("correct", [
    { offset: 0, freq: midiToFreq(79), duration: 0.13, gain: 0.09, wave: "triangle" },
    { offset: 0.09, freq: midiToFreq(84), duration: 0.13, gain: 0.09, wave: "triangle" },
    { offset: 0.18, freq: midiToFreq(88), duration: 0.28, gain: 0.09, wave: "triangle" },
  ]),
  // Gentle falling third on a soft sine: honest, not humiliating.
  cue("incorrect", [
    { offset: 0, freq: midiToFreq(67), duration: 0.24, gain: 0.07, wave: "sine" },
    { offset: 0.18, freq: midiToFreq(64), duration: 0.42, gain: 0.065, wave: "sine" },
  ]),
  cue("tick", [
    { offset: 0, freq: midiToFreq(100), duration: 0.08, gain: 0.06, wave: "square" },
    { offset: 0.03, freq: midiToFreq(112), duration: 0.1, gain: 0.045, wave: "triangle" },
  ]),
  cue("join", [
    { offset: 0, freq: midiToFreq(76), duration: 0.1, gain: 0.06, wave: "triangle" },
    { offset: 0.09, freq: midiToFreq(83), duration: 0.16, gain: 0.06, wave: "triangle" },
  ]),
  cue("lock", [
    { offset: 0, freq: midiToFreq(55), duration: 0.16, gain: 0.08, wave: "sine" },
    { offset: 0.1, freq: midiToFreq(48), duration: 0.24, gain: 0.06, wave: "sine" },
  ]),
  // Positive anticipation drumroll (16 quick notes), never scary.
  cue("reveal", Array.from({ length: 16 }, (_, index) => ({
    offset: index * 0.075,
    freq: midiToFreq(64 + (index % 4)),
    duration: 0.06,
    gain: 0.03 + index * 0.003,
    wave: "triangle" as OscillatorType,
  }))),
  cue("board", [
    { offset: 0, freq: midiToFreq(72), duration: 0.12, gain: 0.07, wave: "triangle" },
    { offset: 0.1, freq: midiToFreq(79), duration: 0.12, gain: 0.07, wave: "triangle" },
    { offset: 0.2, freq: midiToFreq(84), duration: 0.34, gain: 0.075, wave: "triangle" },
  ]),
  // Ceremony: third place is a warm two-note motif.
  cue("podium-third", [
    { offset: 0, freq: midiToFreq(76), duration: 0.22, gain: 0.08, wave: "triangle" },
    { offset: 0.16, freq: midiToFreq(72), duration: 0.4, gain: 0.075, wave: "triangle" },
  ]),
  cue("podium-second", [
    { offset: 0, freq: midiToFreq(79), duration: 0.22, gain: 0.08, wave: "triangle" },
    { offset: 0.16, freq: midiToFreq(83), duration: 0.24, gain: 0.08, wave: "triangle" },
    { offset: 0.34, freq: midiToFreq(88), duration: 0.5, gain: 0.08, wave: "triangle" },
  ]),
  // Champion: full fanfare over the tonic, resolving on a bright major chord.
  cue("podium-champion", [
    { offset: 0, freq: midiToFreq(72), duration: 0.16, gain: 0.09, wave: "square" },
    { offset: 0.14, freq: midiToFreq(76), duration: 0.16, gain: 0.09, wave: "square" },
    { offset: 0.28, freq: midiToFreq(79), duration: 0.16, gain: 0.09, wave: "square" },
    { offset: 0.42, freq: midiToFreq(84), duration: 0.5, gain: 0.1, wave: "square" },
    { offset: 0.56, freq: midiToFreq(88), duration: 0.7, gain: 0.09, wave: "triangle" },
    { offset: 0.56, freq: midiToFreq(91), duration: 0.7, gain: 0.08, wave: "triangle" },
    { offset: 0.56, freq: midiToFreq(96), duration: 0.7, gain: 0.07, wave: "triangle" },
  ]),
];

export const CUES: Record<CueKey, CueSpec> = Object.fromEntries(
  CUE_LIST.map((entry) => [entry.key, entry]),
) as Record<CueKey, CueSpec>;

export function renderCue(key: CueKey, start = 0): NoteEvent[] {
  const spec = CUES[key];
  if (!spec) return [];
  return spec.notes.map((note) => ({
    offset: start + note.offset,
    freq: note.freq,
    duration: note.duration,
    gain: note.gain,
    wave: note.wave,
    role: "lead" as NoteRole,
  }));
}

/**
 * Sum of simultaneous gains at the densest moment of a rendered track, used by
 * tests to guarantee headroom (the engine also runs a soft compressor).
 */
export function peakSimultaneousGain(events: NoteEvent[]): number {
  let peak = 0;
  for (let i = 0; i < events.length; i += 1) {
    const time = events[i].offset;
    const sum = events
      .filter((event) => event.offset <= time + 0.001 && event.offset + event.duration > time)
      .reduce((total, event) => total + event.gain, 0);
    peak = Math.max(peak, sum);
  }
  return Math.round(peak * 1000) / 1000;
}
