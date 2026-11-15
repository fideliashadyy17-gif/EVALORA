/**
 * Per-participant extra time in a live session (migration 0107).
 *
 * The property that matters: giving one person more time must change NOTHING
 * for anybody else. The session's deadline, the room's phase and every other
 * participant's countdown stay exactly as they were; only the point at which
 * that one participant's answer stops being accepted moves.
 *
 * Run: node scripts/test-live-participant-extra-time.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

let checks = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  checks += 1;
  console.log(`  \u2713 ${name}`);
};

function compile(source, dest, stubs = {}) {
  const file = path.resolve(dest);
  const mod = new Module(file);
  const original = Module._load;
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  Module._load = function (request, parent) {
    if (parent?.filename === file && request in stubs) return stubs[request];
    return original.apply(this, arguments);
  };
  try {
    mod._compile(
      ts.transpileModule(readFileSync(source, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      file,
    );
    return mod.exports;
  } finally {
    Module._load = original;
  }
}

const live = compile("src/lib/live.ts", "scripts/__extra_time_live.cjs", {
  "./liveControl": compile("src/lib/liveControl.ts", "scripts/__extra_time_control.cjs"),
  // Only the pure timing helpers are exercised here; the response-workspace
  // inference is not part of the deadline rules.
  "./responseTools": { responseWorkspaceFor: () => ({ tools: [], calculator: { enabled: false, scientific: false } }) },
  "./assessParts": { assessPartsFromConfig: () => [] },
});

const START = "2026-11-10T12:00:00.000Z";
const ROOM_DEADLINE = "2026-11-10T12:00:30.000Z";
const quizSettings = { time_per_question_seconds: 30 };
const row = { time_limit_seconds: 30 };

/** An open synchronized question whose room window closed 20 seconds ago. */
const expired = {
  status: "live",
  mode: "synchronized",
  phase: "question",
  current_question_index: 2,
  question_started_at: START,
  question_deadline_at: ROOM_DEADLINE,
};
const open = { ...expired, question_deadline_at: "2026-11-10T12:01:30.000Z" };
const now = new Date("2026-11-10T12:00:50.000Z");

/* ── The allowance itself ───────────────────────────────────────────── */
check("the allowance is 30 minutes at most",
  live.MAX_PARTICIPANT_EXTRA_TIME_MS === 30 * 60 * 1000);
check("a negative, zero or unreadable allowance means no extra time",
  live.normalizeExtraTimeMs(0) === 0
  && live.normalizeExtraTimeMs(-5) === 0
  && live.normalizeExtraTimeMs("abc") === 0
  && live.normalizeExtraTimeMs(null) === 0
  && live.normalizeExtraTimeMs(undefined) === 0);
check("a requested allowance is clamped, never trusted",
  live.normalizeExtraTimeMs(60_000) === 60_000
  && live.normalizeExtraTimeMs(10 ** 12) === live.MAX_PARTICIPANT_EXTRA_TIME_MS);
check("a fractional allowance is floored, never rounded up",
  live.normalizeExtraTimeMs(1500.9) === 1500);

/* ── The deadline moves for one participant only ────────────────────── */
check("the room's own deadline is untouched by a participant's allowance",
  live.questionDeadlineAt(expired, row, quizSettings) === ROOM_DEADLINE
  && live.participantDeadlineAt(expired, row, quizSettings, 60_000) !== ROOM_DEADLINE);
check("the allowance extends the deadline by exactly what was granted",
  live.participantDeadlineAt(expired, row, quizSettings, 45_000)
  === new Date(Date.parse(ROOM_DEADLINE) + 45_000).toISOString());
check("no allowance means the room's deadline, unchanged",
  live.participantDeadlineAt(expired, row, quizSettings, 0) === ROOM_DEADLINE
  && live.participantDeadlineAt(expired, row, quizSettings, null) === ROOM_DEADLINE);
check("a question with no window has nothing to extend",
  live.participantDeadlineAt({ ...expired, question_started_at: null, question_deadline_at: null }, row, quizSettings, 60_000) === null);
check("an unreadable stored deadline never produces NaN",
  live.participantDeadlineAt({ ...expired, question_deadline_at: "not-a-date" }, row, quizSettings, 60_000) === "not-a-date");

/* ── Who may still answer ───────────────────────────────────────────── */
check("an open question is answerable with or without an allowance",
  live.answerWindowOpenFor(open, row, quizSettings, 0, now) === true
  && live.answerWindowOpenFor(open, row, quizSettings, 60_000, now) === true);
check("a closed question is closed for a participant with no allowance",
  live.answerWindowOpenFor(expired, row, quizSettings, 0, now) === false);
check("an allowance reopens a window that has closed for the room",
  live.answerWindowOpenFor(expired, row, quizSettings, 60_000, now) === true);
check("the allowance is finite: it does not reopen a long-expired question",
  live.answerWindowOpenFor(expired, row, quizSettings, 5_000, now) === false);
check("extra time never opens a question that has not started yet",
  live.answerWindowOpenFor(
    { status: "live", mode: "synchronized", phase: "question", current_question_index: 0, question_started_at: "2026-11-10T12:01:00.000Z", question_deadline_at: "2026-11-10T12:01:30.000Z" },
    row, quizSettings, 600_000, now,
  ) === false);
check("extra time never reopens a question the organizer has closed",
  live.answerWindowOpenFor({ ...expired, phase: "leaderboard" }, row, quizSettings, 600_000, now) === false
  && live.answerWindowOpenFor({ ...expired, phase: "answer_reveal" }, row, quizSettings, 600_000, now) === false);
check("extra time never reopens an ended session",
  live.answerWindowOpenFor({ ...expired, status: "ended" }, row, quizSettings, 600_000, now) === false);
check("extra time never unlocks a waiting room",
  live.answerWindowOpenFor(
    { status: "live", mode: "synchronized", phase: "waiting", current_question_index: -1, question_started_at: null, question_deadline_at: null },
    row, quizSettings, 600_000, now,
  ) === false);
// A paused session freezes the clock by moving the stored window on resume, so
// the pause itself is enforced by the answer route's liveness gate, not here.
check("a paused session's window is frozen, not extended, by an allowance",
  live.effectivePhase({ ...expired, status: "paused" }, row, quizSettings, now) === "time_expired");

/* ── The room keeps its own phase ───────────────────────────────────── */
check("the room's phase is still 'time_expired' while one participant has extra time",
  live.effectivePhase(expired, row, quizSettings, now) === "time_expired");
check("a self-paced session is unaffected by a synchronized allowance",
  live.effectivePhase({ ...expired, mode: "self_paced" }, row, quizSettings, now) === "question");

/* ── Route wiring ───────────────────────────────────────────────────── */
const grantRoute = readFileSync("src/app/api/live/participants/extra-time/route.ts", "utf8");
const stateRoute = readFileSync("src/app/api/live/state/route.ts", "utf8");
const answerRoute = readFileSync("src/app/api/live/answer/route.ts", "utf8");
const hostStateRoute = readFileSync("src/app/api/live/host/state/route.ts", "utf8");
const hostConsole = readFileSync("src/app/dashboard/sessions/[id]/host/HostConsole.tsx", "utf8");
const migration = readFileSync("supabase/migrations/0107_live_participant_extra_time.sql", "utf8");

check("granting is host-or-organizer only, decided on the server",
  /getSessionContext\(\)/.test(grantRoute)
  && /isHost = session\.host_id === ctx\.user\.id/.test(grantRoute)
  && /!isHost && !can\(ctx, session\.organization_id, CREATOR_ROLES\)/.test(grantRoute));
check("a participant from another session cannot be granted time",
  /\.eq\("id", participantId\)\s*\.eq\("session_id", sessionId\)/.test(grantRoute));
check("a removed participant is refused rather than silently restored",
  /\["rejected", "blocked"\]\.includes\(String\(participant\.status\)\)/.test(grantRoute));
check("a self-paced session is refused instead of silently doing nothing",
  /session\.mode !== "synchronized"/.test(grantRoute)
  && /no shared question timer to extend/.test(grantRoute));
check("the allowance is clamped server-side before it is written",
  /normalizeExtraTimeMs\(wanted\)/.test(grantRoute));
check("granting is audit logged with the previous and new allowance",
  /audit\(ctx, "live\.participant_extra_time"/.test(grantRoute)
  && /previous_extra_time_ms: previous/.test(grantRoute));
check("the grant response reports both the room deadline and this participant's",
  /room_deadline_at: roomDeadline/.test(grantRoute)
  && /effective_deadline_at: effectiveDeadline/.test(grantRoute));

check("the participant's own state publishes their deadline and allowance",
  /question_deadline_at: deadline,\s*extra_time_ms: extraTimeMs/.test(stateRoute));
check("the projected room countdown is still the session's own deadline",
  /question_deadline_at: roomDeadline,/.test(stateRoute)
  && /const roomDeadline = questionDeadlineAt\(session, currentRow, quizSettings\)/.test(stateRoute));

check("a paused or ended session refuses every submission before the window is even considered",
  /if \(session\.status !== "live"\)/.test(answerRoute)
  && /The session is not live\./.test(answerRoute));
check("an organizer answer lock still beats an allowance",
  /if \(session\.answer_locked\)/.test(answerRoute)
  && /Answers are locked by the organizer\./.test(answerRoute));

check("submission enforces the participant's own window, not the room's",
  /participantDeadlineAt\(session, row, quizSettings, extraTimeMs\)/.test(answerRoute)
  && /now > deadline \+ GRACE_MS/.test(answerRoute));
check("extra time reopens only the expired window, never any other phase",
  /phase !== "question" && !\(phase === "time_expired" && extraTimeMs > 0\)/.test(answerRoute));
// Speed scoring measures the room's window. Someone granted extra time must
// not be pushed below the factor they had earned when that window closed.
check(
  "the allowance is not a scoring penalty: the measured response is capped at the room's window",
  /const measured = Math\.min\(responseMs, Math\.max\(0, roomDeadline - started\)\)/.test(answerRoute),
);

check(
  "the organizer monitor reads and publishes each participant's allowance",
  /extra_time_ms: normalizeExtraTimeMs\(p\.extra_time_ms\)/.test(hostStateRoute)
  && /last_disconnected_at, extra_time_ms"/.test(hostStateRoute),
);
check("the host console offers quick grants and a clear control",
  /\/api\/live\/participants\/extra-time/.test(hostConsole)
  && /Clear \{Math\.round\(participant\.extra_time_ms \/ 1000\)\}s/.test(hostConsole));
check("the host console hides the control in a self-paced session",
  /synchronized=\{session\.mode === "synchronized"\}/.test(hostConsole)
  && /if \(ended \|\| !synchronized\) return null;/.test(hostConsole));

check("the migration is additive and never weakens a policy",
  /add column if not exists extra_time_ms bigint not null default 0/.test(migration)
  && /check \(extra_time_ms >= 0 and extra_time_ms <= 1800000\)/.test(migration)
  && !/drop policy|drop table|truncate|delete from/i.test(migration));

console.log(`\n${checks} participant extra-time checks passed (real live module, no DB/browser).`);
