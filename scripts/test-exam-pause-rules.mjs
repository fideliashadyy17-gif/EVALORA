// Manual pause rules (src/lib/examPause.ts) + pause-aware deadline math
// (src/lib/examDeadline.ts) + the sweep guarantee (src/lib/expiredAttempts.ts).
//
// These are the pure rails under Features B and C: an organizer pause freezes
// the countdown through the SAME deadline formula (no parallel timer), a
// paused attempt can never be swept, and multiple pause reasons overlap in
// ONE window so credit can never double.
import assert from "node:assert/strict";
import {
  isManuallyPaused,
  manualPauseMs,
  effectiveExtensionMs,
  parsePauseReasons,
  pauseNoticeKind,
} from "../src/lib/examPause.ts";
import { attemptDeadline, submissionWindow } from "../src/lib/examDeadline.ts";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const EXAM = { duration_minutes: 60, ends_at: null };
const STARTED = "2026-11-12T11:30:00.000Z"; // deadline 12:30

check("reasons: legacy rows (no pause columns) are never paused", () => {
  assert.equal(isManuallyPaused({}), false);
  assert.equal(isManuallyPaused(null), false);
  assert.deepEqual(parsePauseReasons(null), []);
  assert.deepEqual(parsePauseReasons(["bogus", "student", "student"]), ["student"]);
  assert.deepEqual(parsePauseReasons(["student", "assessment"]), ["assessment", "student"]);
});

check("an open pause is detected from the reasons array alone", () => {
  assert.equal(isManuallyPaused({ pause_reasons: ["assessment"], paused_at: null }), true);
  assert.equal(isManuallyPaused({ pause_reasons: [], paused_at: new Date(NOW).toISOString() }), false);
  assert.equal(pauseNoticeKind({ pause_reasons: ["student"] }), "student");
  assert.equal(pauseNoticeKind({ pause_reasons: ["assessment", "student"] }), "assessment");
  assert.equal(pauseNoticeKind({ pause_reasons: [] }), null);
});

check("manualPauseMs: the live pause duration, never negative, never invented", () => {
  const pausedAt = new Date(NOW - 5 * 60_000).toISOString();
  assert.equal(manualPauseMs({ pause_reasons: ["student"], paused_at: pausedAt }, NOW), 5 * 60_000);
  // No readable instant: still paused (composition blocked) but zero time invented.
  assert.equal(manualPauseMs({ pause_reasons: ["student"], paused_at: null }, NOW), 0);
  assert.equal(manualPauseMs({ pause_reasons: ["student"], paused_at: "garbage" }, NOW), 0);
  // A clock behind paused_at collapses to zero.
  assert.equal(manualPauseMs({ pause_reasons: ["student"], paused_at: pausedAt }, NOW - 10 * 60_000), 0);
  // Not paused: zero whatever paused_at says.
  assert.equal(manualPauseMs({ pause_reasons: [], paused_at: pausedAt }, NOW), 0);
});

check("effectiveExtensionMs: stored extension + live pause, on one rail", () => {
  const attempt = { extension_minutes: 7, pause_reasons: ["assessment"], paused_at: new Date(NOW - 3 * 60_000).toISOString() };
  assert.equal(effectiveExtensionMs(attempt, NOW), 7 * 60_000 + 3 * 60_000);
  assert.equal(effectiveExtensionMs({ extension_minutes: 7, pause_reasons: [] }, NOW), 7 * 60_000);
});

check("the countdown FREEZES while an organizer pause is open", () => {
  const pausedAt = NOW - 4 * 60_000;
  const attempt = { started_at: STARTED, extension_minutes: 0, pause_reasons: ["student"], paused_at: new Date(pausedAt).toISOString() };
  // At the pause instant the deadline was 12:30 → 26 min remaining (at 11:34+30=12:04… compute directly):
  const atPause = submissionWindow(EXAM, attempt, pausedAt, attempt.extension_minutes, manualPauseMs(attempt, pausedAt));
  const later = submissionWindow(EXAM, attempt, NOW, attempt.extension_minutes, manualPauseMs(attempt, NOW));
  assert.equal(atPause.remainingMs, later.remainingMs, "remaining time does not move during the pause");
  assert.equal(later.reached, false);
  // Four minutes later still not reached — the window moved with the clock.
  const muchLater = submissionWindow(EXAM, attempt, NOW + 3600_000, attempt.extension_minutes, manualPauseMs(attempt, NOW + 3600_000));
  assert.equal(muchLater.reached, false, "a paused attempt never expires mid-pause");
});

check("after resume the RPC-credited extension continues the same countdown", () => {
  // Paused 11:50→11:55 (5 min). On resume the DB folds 5 min into extension.
  const attempt = { started_at: STARTED, extension_minutes: 5, pause_reasons: [], paused_at: null };
  const atResume = submissionWindow(EXAM, attempt, Date.parse("2026-11-12T11:55:00Z"), attempt.extension_minutes, manualPauseMs(attempt, Date.parse("2026-11-12T11:55:00Z")));
  // Deadline is now 12:35; remaining at 11:55 = 40 min — exactly what the student had at 11:50.
  assert.equal(atResume.deadline, "2026-11-12T12:35:00.000Z");
  assert.equal(Math.round(atResume.remainingMs / 60_000), 40);
});

check("attemptDeadline carries the pause for every display surface", () => {
  const attempt = { started_at: STARTED, extension_minutes: 0, pause_reasons: ["assessment"], paused_at: new Date(NOW - 2 * 60_000).toISOString() };
  const d = attemptDeadline(EXAM, STARTED, 0, manualPauseMs(attempt, NOW));
  assert.equal(d.toISOString(), "2026-11-12T12:32:00.000Z");
});

check("a window-bounded exam freezes too (ends_at + pause)", () => {
  const exam = { duration_minutes: 60, ends_at: "2026-11-12T12:10:00.000Z" };
  const attempt = { started_at: STARTED, extension_minutes: 0, pause_reasons: ["student"], paused_at: new Date(NOW - 60_000).toISOString() };
  const w = submissionWindow(exam, attempt, NOW, attempt.extension_minutes, manualPauseMs(attempt, NOW));
  assert.equal(w.boundBy, "window");
  assert.equal(w.deadline, "2026-11-12T12:11:00.000Z"); // ends_at + 1 min open pause
});

check("sanitizePauseMs: malformed pause input can never move a deadline EARLIER", () => {
  for (const bad of [NaN, Infinity, -5000, null, undefined]) {
    const w = submissionWindow(EXAM, { started_at: STARTED, extension_minutes: 0 }, NOW, 0, bad);
    assert.equal(w.deadline, "2026-11-12T12:30:00.000Z", `input ${String(bad)}`);
  }
});

console.log(`\n${checks} checks passed`);
