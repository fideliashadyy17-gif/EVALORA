// Manual pause rules (src/lib/examPause.ts) + pause-aware deadline math
// (src/lib/examDeadline.ts) + the sweep guarantee (src/lib/expiredAttempts.ts).
//
// These are the pure rails under Features B and C: an organizer pause freezes
// the countdown through the SAME deadline formula (no parallel timer), a
// paused attempt can never be swept, and multiple pause reasons overlap in
// ONE window so credit can never double.
import assert from "node:assert/strict";
import {
  CONNECTION_PAUSE_REASON,
  isManuallyPaused,
  hasConnectionPause,
  hasOrganizerPause,
  manualPauseMs,
  effectiveExtensionMs,
  parseAllPauseReasons,
  parsePauseReasons,
  pauseNoticeKind,
} from "../src/lib/examPause.ts";
import { CONNECTION_LOST_AFTER_MS, connectionLostAnchor, isConnectionLost } from "../src/lib/connectionLost.ts";
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

// ── CONNECTION_LOST (migration 0099) ──────────────────────────────────────

check("connection: the automatic reason freezes the countdown like any pause", () => {
  const attempt = { pause_reasons: [CONNECTION_PAUSE_REASON], paused_at: "2026-11-12T11:50:00.000Z", extension_minutes: 0 };
  assert.equal(isManuallyPaused(attempt), true, "every freeze gate keys off this");
  assert.equal(hasConnectionPause(attempt), true);
  assert.equal(hasOrganizerPause(attempt), false, "but it is NOT an organizer pause");
  assert.equal(manualPauseMs(attempt, NOW), 10 * 60_000, "the outage duration joins the deadline live");
  assert.equal(effectiveExtensionMs(attempt, NOW), 10 * 60_000);
  const w = submissionWindow(EXAM, { started_at: STARTED }, NOW, 0, manualPauseMs(attempt, NOW));
  assert.equal(w.reached, false, "a connection-paused attempt can never be past its deadline");
  assert.equal(w.deadline, "2026-11-12T12:40:00.000Z", "deadline slides with the open outage");
});

check("connection: candidate-facing notices stay organizer-only", () => {
  const connOnly = { pause_reasons: ["connection"], paused_at: "2026-11-12T11:50:00.000Z" };
  assert.equal(pauseNoticeKind(connOnly), null, "the presence UI owns the connection banner");
  assert.deepEqual(parsePauseReasons(["connection", "student"]), ["student"], "manual parse ignores the automatic reason");
  assert.deepEqual(parseAllPauseReasons(["bogus", "connection", "student", "connection"]), ["student", "connection"], "full parse: known reasons, deduplicated, stable order");
  assert.equal(hasConnectionPause({ pause_reasons: ["wifi"] }), false, "unknown reasons are not connection pauses");
});

check("connection: independent reasons compose; organizer pauses win the notice", () => {
  const both = { pause_reasons: ["assessment", "connection"], paused_at: "2026-11-12T11:45:00.000Z" };
  assert.equal(isManuallyPaused(both), true);
  assert.equal(hasConnectionPause(both), true);
  assert.equal(hasOrganizerPause(both), true);
  assert.equal(pauseNoticeKind(both), "assessment", "the organizer message is the one shown");
});

check("isConnectionLost: the server-evidence rule for declaring an outage", () => {
  const started = { id: "a", status: "in_progress", started_at: "2026-11-12T11:00:00.000Z" };
  assert.equal(isConnectionLost(started, "2026-11-12T11:59:00.000Z", NOW), false, "a fresh heartbeat is connected");
  assert.equal(isConnectionLost(started, "2026-11-12T11:58:55.001Z", NOW), false, "64.999 s silent is ordinary latency");
  assert.equal(isConnectionLost(started, "2026-11-12T11:58:54.999Z", NOW), true, "past the threshold the outage is confirmed");
  assert.equal(CONNECTION_LOST_AFTER_MS, 65_000, "online window (45 s) + one heartbeat (20 s)");
  assert.equal(isConnectionLost(started, null, NOW), true, "no heartbeat ever: anchored at the start");
  assert.equal(isConnectionLost({ ...started, status: "auto_submitted" }, "2026-11-12T11:00:00.000Z", NOW), false, "closed attempts are out of scope");
  assert.equal(isConnectionLost({ ...started, pause_reasons: ["student"] }, "2026-11-12T11:00:00.000Z", NOW), false, "an organizer pause owns the window");
  assert.equal(isConnectionLost({ id: "x", status: "in_progress" }, null, NOW), false, "no evidence at all: nothing is invented");
});

check("connectionLostAnchor: the evidence instant, clamped, never invented", () => {
  const started = { started_at: "2026-11-12T11:00:00.000Z" };
  assert.equal(connectionLostAnchor(started, "2026-11-12T11:50:00.000Z", NOW).anchorIso, "2026-11-12T11:50:00.000Z", "the last confirmed heartbeat");
  assert.equal(connectionLostAnchor(started, null, NOW).anchorIso, "2026-11-12T11:00:00.000Z", "or the start when the device never spoke");
  assert.equal(connectionLostAnchor(started, "2026-11-12T13:00:00.000Z", NOW).anchorIso, "2026-11-12T12:00:00.000Z", "a future claim collapses to now");
  assert.equal(connectionLostAnchor({}, "garbage", NOW), null, "unreadable evidence yields nothing");
  assert.equal(connectionLostAnchor({ started_at: "garbage" }, null, NOW), null, "and never a made-up instant");
});

console.log(`\n${checks} checks passed`);
