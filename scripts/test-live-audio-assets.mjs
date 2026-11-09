import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const dir = "public/audio/live";
const required = [
  "lobby-loop", "question-loop", "game-start", "question-transition", "countdown-suspense",
  "time-up", "answer-reveal", "answer-submitted", "answer-correct", "answer-try-again",
  "leaderboard", "rank-shift", "podium-victory", "game-complete",
];
const files = new Set(readdirSync(dir).filter((f) => f.endsWith(".wav")).map((f) => f.slice(0, -4)));
for (const name of required) assert.ok(files.has(name), `missing original live sound: ${name}`);
let checks = required.length;
for (const name of required) {
  const wav = readFileSync(`${dir}/${name}.wav`);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF", `${name}: RIFF header`);
  assert.equal(wav.toString("ascii", 8, 12), "WAVE", `${name}: WAV encoding`);
  assert.equal(wav.readUInt16LE(22), 2, `${name}: stereo`);
  assert.equal(wav.readUInt32LE(24), 22050, `${name}: 22.05kHz`);
  assert.equal(wav.readUInt16LE(34), 16, `${name}: 16-bit PCM`);
  const pcm = wav.subarray(44);
  assert.equal(pcm.length % 4, 0, `${name}: complete stereo frames`);
  let peak = 0, sumSquares = 0, clipped = 0, count = 0;
  for (let offset = 0; offset < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset);
    peak = Math.max(peak, Math.abs(sample));
    if (Math.abs(sample) >= 32767) clipped++;
    sumSquares += sample * sample;
    count++;
  }
  const peakDbfs = 20 * Math.log10(peak / 32768);
  const rmsDbfs = 20 * Math.log10(Math.sqrt(sumSquares / count) / 32768);
  assert.ok(peakDbfs <= -1 && peakDbfs > -3, `${name}: expected normalized sample peak around -1 dBFS, got ${peakDbfs.toFixed(2)}`);
  assert.equal(clipped, 0, `${name}: no digital clipping`);
  assert.ok(rmsDbfs > -19 && rmsDbfs < -9, `${name}: adequate synthesized program RMS, got ${rmsDbfs.toFixed(2)} dBFS`);
  checks += 8;
}
console.log(`${checks} original live audio asset/PCM checks passed (${required.length} WAV files)`);
