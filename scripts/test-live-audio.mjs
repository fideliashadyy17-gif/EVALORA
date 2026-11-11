/**
 * Original EVALORA music engine — compositions, loudness budget, bus routing,
 * host switches, listener volumes and single-owner playback.
 *
 * This suite is deliberately honest about what it can and cannot prove: it
 * checks the *score* (notes, chords, phrasing, phase mapping), the *mix*
 * (headroom, independent buses, fades, mutes) and the *state machine* (autoplay
 * block, unlock, one owner, stop on pause), using a fake AudioContext. It cannot
 * hear the result — no browser is available here — so "sounds good" remains a
 * human check, documented as such.
 *
 * Run: node scripts/test-live-audio.mjs
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

let checks = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
};

const outDir = "/tmp/evalora-live-audio-test";
execSync(
  `npx tsc src/lib/liveMusic.ts src/lib/audioPreferences.ts src/lib/liveAudio.ts --outDir ${outDir} --rootDir src --module commonjs --target es2022 --esModuleInterop --skipLibCheck --moduleResolution node --lib es2022,dom`,
  { stdio: "inherit" },
);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`, { stdio: "inherit" });
const require = createRequire(import.meta.url);
const music = require(`${outDir}/lib/liveMusic.js`);
const prefs = require(`${outDir}/lib/audioPreferences.js`);
const audio = require(`${outDir}/lib/liveAudio.js`);

/* ── 1. The score ─────────────────────────────────────────────────────── */
console.log("\nCompositions");

const tracks = music.MUSIC_TRACKS;
ok("six distinct movements exist", tracks.length === 6);
ok("every phase has its own track key", new Set(tracks.map((t) => t.key)).size === 6);
ok(
  "the six required moments are covered",
  ["lobby", "question", "countdown", "leaderboard", "podium", "champion"].every((key) => tracks.some((t) => t.key === key)),
);

for (const track of tracks) {
  const label = track.key;
  ok(`${label}: tempo is danceable but never frantic`, track.bpm >= 100 && track.bpm <= 150);
  ok(
    `${label}: tight loop with a returning progression`,
    (track.loopBars === 4 || track.loopBars === 2) && track.chords.length === track.loopBars,
  );
  ok(`${label}: every bar has a three-note chord`, track.chords.every((c) => c.length === 3));
  const lead = track.lead.flat().filter((n) => typeof n === "number");
  ok(`${label}: melody uses at least six different pitches`, new Set(lead).size >= 6);
  ok(`${label}: melody moves stepwise, never randomly`, lead.every((n) => n >= 55 && n <= 96));
  ok(
    `${label}: bass line present in every bar`,
    track.bass.length === track.loopBars && track.bass.every((bar) => bar.some((n) => typeof n === "number")),
  );
  ok(`${label}: drums are texture, not the tune`, track.drums !== "none" && track.level > 0.5);
  // Harmonic quality: each chord is a triad (two stacked thirds, minor or major).
  const intervals = track.chords.map(([root, third, fifth]) => [third - root, fifth - third]);
  ok(`${label}: chords are real triads`, intervals.every(([a, b]) => [3, 4].includes(a) && [3, 4].includes(b)));
}

const question = music.musicTrack("question");
const lobby = music.musicTrack("lobby");
ok("the question track is not the waiting-room track", question.bpm !== lobby.bpm || question.lead !== lobby.lead);
ok("the question track is minor-leaning (focused, not sleepy)", question.chords[0][1] - question.chords[0][0] === 3);
ok("the waiting room is major and welcoming", lobby.chords[0][1] - lobby.chords[0][0] === 4);
ok("the countdown accelerates", music.musicTrack("countdown").bpm > question.bpm);
ok("the champion track is the brightest", music.musicTrack("champion").bpm >= 110);

/* ── 2. The mix ───────────────────────────────────────────────────────── */
console.log("\nMix and headroom");

for (const track of tracks) {
  const events = music.renderLoop(track, track.loopBars);
  const peak = music.peakSimultaneousGain(events);
  ok(`${track.key}: rendered notes exist`, events.length > 40);
  ok(`${track.key}: headroom preserved (peak ${peak})`, peak <= 0.6);
  ok(`${track.key}: every note is audible but quiet`, events.every((e) => e.gain > 0 && e.gain <= 0.2));
  ok(`${track.key}: no inaudible or painful frequencies`, events.every((e) => e.freq >= 25 && e.freq <= 14000));
  ok(`${track.key}: every note is long enough to be musical`, events.every((e) => e.duration >= 0.03));
  ok(`${track.key}: the melody is on top`, events.some((e) => e.role === "lead" && e.freq > 400));
}

for (const key of ["correct", "incorrect", "transition", "tick", "join", "lock", "reveal", "board", "podium-third", "podium-second", "podium-champion"]) {
  const cue = music.renderCue(key, 0);
  ok(`cue ${key}: exists and is short`, cue.length > 0 && Math.max(...cue.map((n) => n.offset + n.duration)) < 3);
  ok(`cue ${key}: no clipping`, music.peakSimultaneousGain(cue) <= 0.35);
}

const correct = music.renderCue("correct", 0).map((n) => n.freq);
const incorrect = music.renderCue("incorrect", 0).map((n) => n.freq);
ok("correct answer: rising arpeggio", correct.every((f, i) => i === 0 || f > correct[i - 1]));
ok("incorrect answer: gentle, two notes, never a buzzer", incorrect.length <= 3 && incorrect[0] > 200 && incorrect[1] < incorrect[0]);
ok("incorrect answer never uses a square wave", music.renderCue("incorrect", 0).every((n) => n.wave !== "square"));
ok("podium champion fanfare is the biggest celebration", music.renderCue("podium-champion", 0).length >= 6);
ok("transition is melodic, not a beep", new Set(music.renderCue("transition", 0).map((n) => Math.round(n.freq))).size >= 3);
ok("no cue is a horror sting", ["reveal", "lock"].every((k) => music.renderCue(k, 0).every((n) => n.freq >= 40)));

/* ── 3. Phase mapping ─────────────────────────────────────────────────── */
console.log("\nPhase mapping");

ok("waiting room → lobby", music.trackForPhase("waiting", { status: "lobby" }) === "lobby");
ok("countdown → countdown", music.trackForPhase("countdown", { status: "live" }) === "countdown");
ok("question → question", music.trackForPhase("question", { status: "live", remaining: 25 }) === "question");
ok("final five seconds → accelerating countdown", music.trackForPhase("question", { status: "live", remaining: 4 }) === "countdown");
ok("time expired → resolved leaderboard colour", music.trackForPhase("time_expired", { status: "live" }) === "leaderboard");
ok("leaderboard → leaderboard", music.trackForPhase("leaderboard", { status: "live" }) === "leaderboard");
ok("podium → ceremony", music.trackForPhase("podium", { status: "live" }) === "podium");
ok("third place → ceremony", music.trackForPhase("question", { stage: "third" }) === "podium");
ok("champion stage → champion theme", music.trackForPhase("podium", { stage: "champion" }) === "champion");
ok("paused room is silent", music.trackForPhase("question", { status: "paused" }) === null);
ok("completed room is silent", music.trackForPhase("completed", { status: "ended" }) === null);
ok("formal exam states never map to music", ["draft", "marked", ""].every((phase) => music.trackForPhase(phase) === null));

/* ── 4. Preferences and host authority ────────────────────────────────── */
console.log("\nPreferences, host switches, ownership");

const defaults = prefs.DEFAULT_AUDIO_PREFERENCES;
ok("master / music / sfx are independent", defaults.master !== defaults.music && defaults.music !== defaults.sfx);
ok("defaults are audible but not loud", defaults.master > 0 && defaults.master <= 0.8);

const parsed = prefs.parseAudioPreferences({ master: 4, music: -2, muted: "yes", music_on: false });
ok("out-of-range volumes clamp", parsed.master === 1 && parsed.music === 0);
ok("only an explicit true mutes", parsed.muted === false);
ok("explicit switches survive parsing", parsed.music_on === false && parsed.sfx_on === true);

ok("server master off silences everything", prefs.effectiveGain(defaults, { enabled: false, volume: 1 }, true).music === 0);
ok("host can keep effects while silencing music", prefs.effectiveGain(defaults, { enabled: true, volume: 1, music_enabled: false }, true).sfx > 0);
ok("host can keep music while silencing effects", prefs.effectiveGain(defaults, { enabled: true, volume: 1, sfx_enabled: false }, true).music > 0);
ok("mute-all silences both buses", (() => {
  const gains = prefs.effectiveGain({ ...defaults, muted: true }, { enabled: true, volume: 1 }, true);
  return gains.music === 0 && gains.sfx === 0;
})());
ok("listener volume scales the room volume", prefs.effectiveGain({ ...defaults, master: 0.5 }, { enabled: true, volume: 0.4 }, true).music <
  prefs.effectiveGain({ ...defaults, master: 1 }, { enabled: true, volume: 1 }, true).music);
ok("the public screen owns the room soundtrack", prefs.defaultOwnsMusic("screen", { enabled: true, volume: 1 }) === true);
ok("participant devices are silent by default", prefs.defaultOwnsMusic("participant", { enabled: true, volume: 1 }) === false);
ok("the host can deliberately share music with devices", prefs.defaultOwnsMusic("participant", { enabled: true, volume: 1, music_enabled: true }) === true);
ok("legacy sessions without the new switch keep their music", prefs.serverAllowsMusic({ enabled: true, volume: 1 }) === true);

const storage = (() => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
})();
const key = prefs.audioStorageKey("participant", "session-1");
const saved = { master: 0.3, music: 0.2, sfx: 0.4, music_on: false, sfx_on: true, muted: true };
prefs.saveAudioPreferences(storage, key, saved);
const loaded = prefs.loadAudioPreferences(storage, key);
ok("preferences round-trip on the device", loaded.master === 0.3 && loaded.music_on === false && loaded.muted === true);
ok("keys are namespaced per role and session", key.includes("participant") && key.includes("session-1"));
ok("a second session gets its own key", prefs.audioStorageKey("participant", "session-2") !== key);
storage.setItem(key, "{not json");
ok("corrupt storage falls back to defaults", prefs.loadAudioPreferences(storage, key).master === defaults.master);

/* ── 5. Engine state machine with a fake AudioContext ─────────────────── */
console.log("\nEngine");

class Param {
  constructor(value = 0) { this.value = value; }
  setValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  cancelScheduledValues() { return this; }
  setTargetAtTime() { return this; }
}
class FakeNode {
  constructor() {
    this.gain = new Param(0);
    this.frequency = new Param(0);
    this.detune = new Param(0);
    this.threshold = new Param(0);
    this.knee = new Param(0);
    this.ratio = new Param(0);
    this.attack = new Param(0);
    this.release = new Param(0);
    this.Q = new Param(0);
    this.type = "sine";
  }
  connect(node) { return node; }
  disconnect() {}
}
class FakeCtx {
  constructor() { this.currentTime = 0; this.state = "suspended"; this.sampleRate = 48000; this.destination = new FakeNode(); this.closed = false; this.oscillators = 0; }
  createGain() { return new FakeNode(); }
  createOscillator() {
    const node = new FakeNode();
    node.start = () => {};
    node.stop = () => {};
    this.oscillators += 1;
    return node;
  }
  createDynamicsCompressor() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  async resume() { this.state = "running"; }
  async close() { this.closed = true; }
}

const makeEngine = (options = {}) => {
  const ctxs = [];
  const engine = new audio.LiveAudioEngine({
    role: options.role ?? "screen",
    server: options.server ?? { enabled: true, volume: 0.8 },
    preferences: options.preferences ?? {},
    contextFactory: () => {
      const ctx = new FakeCtx();
      ctxs.push(ctx);
      return ctx;
    },
  });
  return { engine, ctxs };
};

const expectedCues = ["transition", "correct", "incorrect", "tick", "join", "lock", "reveal", "podium-third", "podium-second", "podium-champion", "board"];
ok("all eleven cues are registered", expectedCues.every((key) => Boolean(music.CUES[key])));

const a = makeEngine();
ok("nothing plays before the first gesture", a.engine.snapshot().playing === false);
a.engine.playTrack("lobby");
ok("autoplay policy is respected: blocked until a gesture", a.engine.snapshot().blocked === true && a.engine.snapshot().track === "lobby");
await a.engine.unlock();
const afterUnlock = a.engine.snapshot();
ok("a gesture unlocks the context", afterUnlock.running === true && afterUnlock.blocked === false);
ok("the waiting-room track is now playing", a.engine.snapshot().playing === true);
ok("scheduling creates real notes", a.ctxs[0].oscillators > 0);
ok("host volume reaches the music bus", a.engine.snapshot().musicGain > 0);

a.engine.setPreferences({ muted: true });
ok("mute-all stops the music, not just the volume", a.engine.snapshot().musicGain === 0 && a.engine.snapshot().playing === false);
a.engine.setPreferences({ muted: false, music_on: false });
ok("music can be off while effects stay on", a.engine.snapshot().sfxGain > 0 && a.engine.snapshot().musicGain === 0);
a.engine.setPreferences({ music_on: true });
ok("turning music back on needs no reload", a.engine.snapshot().musicGain > 0);

a.engine.playTrack("question");
ok("switching phases keeps one track", a.engine.snapshot().track === "question");
a.engine.playTrack("question");
ok("re-requesting the same track never restarts it", a.engine.snapshot().track === "question");
a.engine.setVariant("focus");
ok("the host arrangement is applied", a.engine.snapshot().variant === "focus");
a.engine.playTrack(null);
ok("pausing silences the room", a.engine.snapshot().track === null && a.engine.snapshot().playing === false);

a.engine.setServerSettings({ enabled: false });
ok("the host master switch wins over the local choice", a.engine.snapshot().ownsMusic === false && a.engine.snapshot().musicGain === 0);
a.engine.destroy();
ok("destroy releases the audio context", a.ctxs[0].closed === true);

const participant = makeEngine({ role: "participant" });
participant.engine.playTrack("lobby");
await participant.engine.unlock();
ok("participant devices stay silent by default (no duplicate music)", participant.engine.snapshot().musicGain === 0);
ok("yet their effects bus is available for feedback", participant.engine.snapshot().sfxGain > 0);
participant.engine.setServerSettings({ music_enabled: true });
ok("a host can opt devices in", participant.engine.snapshot().ownsMusic === true && participant.engine.snapshot().musicGain > 0);
participant.engine.destroy();

const host = makeEngine({ role: "host" });
await host.engine.unlock();
host.engine.playTrack("lobby");
ok("the host console can own the soundtrack", host.engine.snapshot().ownsMusic === true);
host.engine.cue("correct");
ok("a cue never throws on the effects bus", true);
host.engine.destroy();

console.log(`\n${checks} checks passed.`);
