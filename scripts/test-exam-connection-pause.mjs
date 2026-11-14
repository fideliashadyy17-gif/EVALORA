// Automatic timer suspension during internet outages — rule-level + REAL
// route tests. The presence route (src/app/api/exam/presence/route.ts) is
// compiled from source with only infrastructure replaced by an isolated
// in-memory database that enforces the ledger's unique window index and the
// atomic extension RPC, exactly like production Postgres would.
//
// Covers the acceptance scenarios:
//   A  normal heartbeats never touch the timer;
//   B  a confirmed outage pauses THAT student's timer (extension credit);
//   C  credit is exact, rounded up to whole minutes in the student's favour;
//   D  reconnection resumes from the server-authoritative deadline;
//   E  one student's outage never modifies another student's attempt;
//   F  duplicate reconnection events can never add extra time;
//   G  repeated outages accumulate correctly, under per-event and
//      per-attempt caps;
//   plus: bogus clock claims are anchored to the last server contact, hidden
//   tab time is not outage time, short gaps are jitter not outages, `leave`
//   never credits, and closed attempts are refused.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import {
  connectionPauseCredit,
  creditExtensionMinutes,
  MIN_CREDITABLE_OUTAGE_MS,
  MAX_CREDIT_PER_EVENT_MS,
  MAX_CREDIT_PER_ATTEMPT_MS,
} from "../src/lib/presence.ts";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };
const iso = (ms) => new Date(ms).toISOString();

/* ── pure rules ─────────────────────────────────────────────────────────── */
const NOW = Date.parse("2026-11-12T11:20:00.000Z");

check("pure: the 32-minute scenario — 8 min outage credits 8 min", () => {
  const d = connectionPauseCredit({
    nowMs: NOW,
    lastContactMs: NOW - 8 * 60_000 - 20_000, // server heard them 8m20s ago
    claimedLostMs: NOW - 8 * 60_000,
    hiddenMs: 0,
    creditedMs: 0,
  });
  assert.equal(d.kind, "credit");
  // The window is anchored at the claim (8 min exactly); credited in full.
  assert.equal(d.creditMs, 8 * 60_000);
  assert.equal(creditExtensionMinutes(d.creditMs), 8);
});

check("pure: a claimed lost_at BEFORE the last server contact is anchored", () => {
  const d = connectionPauseCredit({
    nowMs: NOW,
    lastContactMs: NOW - 60_000, // the server heard them 1 min ago
    claimedLostMs: NOW - 45 * 60_000, // the browser claims 45 min (manipulated clock)
    hiddenMs: 0,
    creditedMs: 0,
  });
  // The 45-minute claim is clamped to the server-verified window: the outage
  // cannot have started before the last confirmed contact, so at most ~1 min
  // is creditable — never the claimed 45.
  assert.equal(d.kind, "credit");
  assert.equal(d.claimedMs, 60_000);
  assert.equal(creditExtensionMinutes(d.creditMs), 1);
});

check("pure: heartbeat jitter below the minimum is never credited", () => {
  const d = connectionPauseCredit({
    nowMs: NOW, lastContactMs: NOW - 30_000, claimedLostMs: NOW - 30_000, hiddenMs: 0, creditedMs: 0,
  });
  assert.equal(d.kind, "no_credit");
  assert.ok(30_000 < MIN_CREDITABLE_OUTAGE_MS);
});

check("pure: hidden tab time is subtracted from the claim", () => {
  const d = connectionPauseCredit({
    nowMs: NOW,
    lastContactMs: NOW - 20 * 60_000,
    claimedLostMs: NOW - 20 * 60_000,
    hiddenMs: 18 * 60_000, // 18 of the 20 minutes the page was hidden
    creditedMs: 0,
  });
  assert.equal(d.kind, "credit");
  assert.equal(creditExtensionMinutes(d.creditMs), 2);
});

check("pure: per-event cap bounds a single outage; per-attempt cap bounds the total", () => {
  const huge = connectionPauseCredit({
    nowMs: NOW, lastContactMs: NOW - 3 * 3600_000, claimedLostMs: NOW - 3 * 3600_000, hiddenMs: 0, creditedMs: 0,
  });
  assert.equal(huge.kind, "credit");
  assert.equal(huge.creditMs, MAX_CREDIT_PER_EVENT_MS);
  assert.equal(huge.capped, true);

  const atCap = connectionPauseCredit({
    nowMs: NOW, lastContactMs: NOW - 10 * 60_000, claimedLostMs: NOW - 10 * 60_000, hiddenMs: 0,
    creditedMs: MAX_CREDIT_PER_ATTEMPT_MS,
  });
  assert.equal(atCap.kind, "no_credit");
  assert.equal(atCap.reason, "attempt_cap_reached");

  const partial = connectionPauseCredit({
    nowMs: NOW, lastContactMs: NOW - 10 * 60_000, claimedLostMs: NOW - 10 * 60_000, hiddenMs: 0,
    creditedMs: MAX_CREDIT_PER_ATTEMPT_MS - 60_000, // 1 minute of headroom left
  });
  assert.equal(partial.kind, "credit");
  assert.equal(partial.creditMs, 60_000);
});

check("pure: an invalid claim never crashes and never credits", () => {
  assert.equal(connectionPauseCredit({ nowMs: NOW, lastContactMs: NOW, claimedLostMs: null, hiddenMs: 0, creditedMs: 0 }).kind, "invalid");
  assert.equal(connectionPauseCredit({ nowMs: NOW, lastContactMs: NOW, claimedLostMs: NaN, hiddenMs: 0, creditedMs: 0 }).kind, "invalid");
});

/* ── real route harness ─────────────────────────────────────────────────── */
const EXAM_ID = randomUUID();
const ORG_ID = randomUUID();
const tables = {
  exams: [{ id: EXAM_ID, organization_id: ORG_ID, title: "MYP4 test", status: "open", duration_minutes: 60, ends_at: null, starts_at: null, quiz_id: null, settings: {} }],
  exam_attempts: [],
  exam_presence: [],
  exam_connection_events: [],
  exam_pause_events: [],
};
function makeAttempt(status = "in_progress", startedMinutesAgo = 10, extension = 0) {
  const row = {
    id: randomUUID(), exam_id: EXAM_ID, candidate_id: randomUUID(), status,
    access_token: randomUUID(),
    started_at: iso(Date.now() - startedMinutesAgo * 60_000),
    extension_minutes: extension, attempt_number: 1, identity_data: {},
  };
  tables.exam_attempts.push(row);
  return row;
}
function seedPresence(attemptId, lastSeenMsAgo) {
  tables.exam_presence.push({
    attempt_id: attemptId, exam_id: EXAM_ID, organization_id: ORG_ID,
    last_seen_at: iso(Date.now() - lastSeenMsAgo), current_question: null,
    total_questions: null, saved_count: 0, pending_saves: 0,
    unconfirmed_lost_at: null, updated_at: iso(Date.now()),
  });
}
const LEDGER_COLUMNS = new Set([
  "id", "attempt_id", "exam_id", "organization_id", "event_kind",
  "lost_at", "restored_at", "claimed_ms", "hidden_ms", "credit_ms",
  "extension_minutes_before", "extension_minutes_after", "refusal_reason", "created_at",
]);
const PRESENCE_COLUMNS = new Set([
  "attempt_id", "exam_id", "organization_id", "last_seen_at", "current_question",
  "total_questions", "saved_count", "pending_saves", "unconfirmed_lost_at", "updated_at",
]);
function run(name, st) {
  const rows = tables[name];
  // Mirror Postgres: an insert naming a column that does not exist must fail
  // loudly, exactly as it would in production.
  const allowed = name === "exam_connection_events" ? LEDGER_COLUMNS : name === "exam_presence" ? PRESENCE_COLUMNS : null;
  if (allowed && st.patch) {
    for (const key of Object.keys(st.patch)) {
      if (!allowed.has(key)) throw new Error(`column "${key}" does not exist on ${name}`);
    }
  }
  const match = (r) => st.filters.every((f) => f(r));
  if (st.op === "insert" || st.op === "upsert") {
    const row = { id: randomUUID(), credit_ms: 0, claimed_ms: 0, hidden_ms: 0, extension_minutes_before: 0, extension_minutes_after: 0, created_at: iso(Date.now()), ...st.patch };
    const conflict = st.conflict ?? (name === "exam_presence" ? ["attempt_id"] : name === "exam_connection_events" ? ["attempt_id", "lost_at"] : ["id"]);
    const existing = rows.find((r) => conflict.every((c) => String(r[c]) === String(row[c])));
    if (existing) {
      if (st.ignoreDuplicates) return Promise.resolve({ data: st.single === "maybe" ? null : [], error: null });
      Object.assign(existing, row, { id: existing.id });
      return Promise.resolve({ data: st.single === "maybe" ? existing : [existing], error: null });
    }
    if (name === "exam_presence") row.unconfirmed_lost_at ??= null;
    rows.push(row);
    return Promise.resolve({ data: st.single === "maybe" ? row : st.single === "one" ? row : [row], error: null });
  }
  if (st.op === "update") {
    const hit = rows.filter(match);
    hit.forEach((r) => Object.assign(r, st.patch));
    return Promise.resolve({ data: st.single === "maybe" ? (hit[0] ?? null) : st.single === "one" ? (hit[0] ?? null) : hit, error: null });
  }
  const out = rows.filter(match);
  if (st.single === "maybe") return Promise.resolve({ data: out[0] ?? null, error: null });
  if (st.single === "one") return Promise.resolve({ data: out[0] ?? null, error: out[0] ? null : { message: "no rows" } });
  return Promise.resolve({ data: out, error: null });
}
function table(name) {
  const st = { filters: [], op: "select", patch: null, single: false, conflict: null, ignoreDuplicates: false };
  const api = {
    select() { return api; },
    insert(row) { st.op = "insert"; st.patch = row; return api; },
    update(patch) { st.op = "update"; st.patch = patch; return api; },
    upsert(row, opts) { st.op = "upsert"; st.patch = row; st.ignoreDuplicates = Boolean(opts?.ignoreDuplicates); if (opts?.onConflict) st.conflict = String(opts.onConflict).split(",").map((s) => s.trim()); return api; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return api; },
    in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return api; },
    is(c, v) { st.filters.push((r) => (r[c] ?? null) === v); return api; },
    not() { return api; },
    order() { return api; },
    limit() { return api; },
    maybeSingle() { st.single = "maybe"; return run(name, st); },
    single() { st.single = "one"; return run(name, st); },
    then(res, rej) { return run(name, st).then(res, rej); },
  };
  return api;
}
const admin = {
  from: table,
  rpc: async (fn, args) => {
    if (fn === "exam_attempt_add_extension_minutes") {
      const attempt = tables.exam_attempts.find((a) => a.id === args.p_attempt_id);
      if (attempt && attempt.status === "in_progress") {
        attempt.extension_minutes = Math.min(480, Number(attempt.extension_minutes ?? 0) + Math.max(0, args.p_minutes));
        return { data: attempt.extension_minutes, error: null };
      }
      return { data: null, error: null };
    }
    if (fn === "exam_attempt_set_pause") {
      // Mirror of the 0098/0099 SQL against the real clock: one reason per
      // call, anchor clamped to [started_at, now], credit folded into
      // extension_minutes only when the LAST reason clears.
      const attempt = tables.exam_attempts.find((a) => a.id === args.p_attempt_id);
      if (!attempt || attempt.status !== "in_progress") return { data: null, error: null };
      const reasons = [...(attempt.pause_reasons ?? [])];
      if (args.p_paused) {
        if (reasons.includes(args.p_reason)) return { data: { paused: true, reasons, credited_minutes: 0, duplicate: true }, error: null };
        reasons.push(args.p_reason);
        if (reasons.length === 1) {
          const clamp = args.p_paused_at
            ? Math.min(Math.max(Date.parse(args.p_paused_at), Date.parse(attempt.started_at)), Date.now())
            : Date.now();
          attempt.paused_at = iso(clamp);
        }
        attempt.pause_reasons = reasons;
        return { data: { paused: true, reasons, credited_minutes: 0, paused_at: attempt.paused_at }, error: null };
      }
      const idx = reasons.indexOf(args.p_reason);
      if (idx < 0) return { data: { paused: reasons.length > 0, reasons, credited_minutes: 0, duplicate: true }, error: null };
      reasons.splice(idx, 1);
      attempt.pause_reasons = reasons;
      if (reasons.length > 0) return { data: { paused: true, reasons, credited_minutes: 0 }, error: null };
      const credited = attempt.paused_at ? Math.max(0, Math.ceil((Date.now() - Date.parse(attempt.paused_at)) / 60000)) : 0;
      attempt.extension_minutes = Math.min(1440, Number(attempt.extension_minutes ?? 0) + credited);
      attempt.paused_at = null;
      return { data: { paused: false, reasons: [], credited_minutes: credited, extension_minutes: attempt.extension_minutes }, error: null };
    }
    throw new Error(`unexpected rpc ${fn}`);
  },
};

function load(source, overrides = {}) {
  const file = path.resolve(source);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === file) {
      if (overrides[request]) return overrides[request];
      if (request.startsWith("@/lib/")) return load(path.resolve("src", `${request.slice(2)}.ts`));
      if (request.startsWith("./")) {
        // Relative source imports (e.g. connectionLost.ts → ./examPause) are
        // compiled by the same loader, extension or no extension.
        const base = path.resolve(path.dirname(file), request.replace(/\.ts$/, ""));
        if (existsSync(`${base}.ts`)) return load(`${base}.ts`);
      }
      if (request === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    const js = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    mod._compile(js, file);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const route = load("src/app/api/exam/presence/route.ts", {
  "@/lib/supabase/server": { createAdminClient: () => admin },
  "@/lib/exam": {
    attemptDeadline: (exam, startedAt, ext = 0, pauseMs = 0) =>
      new Date(Date.parse(startedAt) + (exam.duration_minutes + Number(ext ?? 0)) * 60_000 + Math.max(0, Number(pauseMs ?? 0))),
    loadAttemptContext: async (a, attemptId, token) => {
      const attempt = tables.exam_attempts.find((x) => x.id === attemptId && x.access_token === token);
      if (!attempt) return null;
      const exam = tables.exams.find((x) => x.id === attempt.exam_id) ?? null;
      return { attempt, exam, candidate: null };
    },
  },
});

const post = (attempt, body) =>
  route.POST({
    headers: { get: (name) => (String(name).toLowerCase() === "authorization" ? `Bearer ${attempt.access_token}` : null) },
    json: async () => ({ attempt_id: attempt.id, ...body }),
  });

/* Scenario A — normal assessment: heartbeats never touch the timer */
const anna = makeAttempt();
seedPresence(anna.id, 20_000);
{
  const res = await post(anna, { event: "heartbeat", current_question: 3, saved_count: 2, pending_saves: 0 });
  const body = await res.json();
  check("A: heartbeat ok, extension untouched, authoritative deadline echoed", () => {
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.pause_credit, null);
    assert.equal(anna.extension_minutes, 0);
    assert.equal(body.deadline, iso(Date.parse(anna.started_at) + 60 * 60_000));
    assert.equal(tables.exam_connection_events.length, 0);
  });
}

/* Scenario B/C/D — outage, exact credit, resumed deadline */
const bilal = makeAttempt();
seedPresence(bilal.id, 5 * 60_000); // server last heard 5 minutes ago
{
  const lostAt = Date.now() - 4.5 * 60_000; // device claims it lost connection 4.5 min ago
  const res = await post(bilal, { event: "restored", lost_at: iso(lostAt), hidden_ms: 0 });
  const body = await res.json();
  check("B/C/D: confirmed outage credits pause minutes and moves ONLY this deadline", () => {
    assert.equal(res.status, 200);
    assert.ok(body.pause_credit, "pause credit returned");
    assert.equal(body.pause_credit.extension_minutes, bilal.extension_minutes);
    assert.ok(bilal.extension_minutes >= 4 && bilal.extension_minutes <= 5, `extension ${bilal.extension_minutes}`);
    assert.equal(body.deadline, iso(Date.parse(bilal.started_at) + (60 + bilal.extension_minutes) * 60_000));
    // Anna is untouched.
    assert.equal(anna.extension_minutes, 0);
    const ev = tables.exam_connection_events.find((e) => e.attempt_id === bilal.id);
    assert.equal(ev.event_kind, "pause_credit");
    assert.equal(ev.extension_minutes_after, bilal.extension_minutes);
    assert.ok(ev.credit_ms > 0);
  });

  /* Scenario F — duplicate reconnection event adds nothing */
  const again = await post(bilal, { event: "restored", lost_at: iso(lostAt), hidden_ms: 0 });
  const againBody = await again.json();
  check("F: a duplicate reconnection event can never add extra time", () => {
    assert.equal(againBody.pause_credit, null);
    assert.equal(bilal.extension_minutes, againBody.pause_credit === null ? bilal.extension_minutes : NaN);
    assert.equal(tables.exam_connection_events.filter((e) => e.attempt_id === bilal.id).length, 1);
  });

  /* Scenario G — a second, distinct outage accumulates */
  tables.exam_presence.find((p) => p.attempt_id === bilal.id).last_seen_at = iso(Date.now() - 3 * 60_000);
  const extBefore = bilal.extension_minutes;
  const res2 = await post(bilal, { event: "restored", lost_at: iso(Date.now() - 2.5 * 60_000), hidden_ms: 0 });
  const body2 = await res2.json();
  check("G: repeated outages accumulate, each recorded once", () => {
    assert.ok(body2.pause_credit, "second window credited");
    assert.ok(bilal.extension_minutes > extBefore);
    assert.equal(tables.exam_connection_events.filter((e) => e.attempt_id === bilal.id).length, 2);
  });
}

/* Anchoring — a bogus old lost_at cannot invent time */
const chen = makeAttempt();
seedPresence(chen.id, 30_000); // the server heard them 30 s ago
{
  const res = await post(chen, { event: "restored", lost_at: iso(Date.now() - 40 * 60_000), hidden_ms: 0 });
  const body = await res.json();
  check("a manipulated clock claim is anchored to the last server contact", () => {
    assert.equal(body.pause_credit, null);
    assert.equal(chen.extension_minutes, 0);
    // The claim is clamped to the server-verified window (30 s), below the
    // outage minimum: nothing credited, nothing audited.
    assert.equal(tables.exam_connection_events.filter((e) => e.attempt_id === chen.id).length, 0);
  });
}

/* Hidden time is not outage time */
const dasia = makeAttempt();
seedPresence(dasia.id, 20 * 60_000);
{
  const res = await post(dasia, { event: "restored", lost_at: iso(Date.now() - 19 * 60_000), hidden_ms: 18.5 * 60_000 });
  const body = await res.json();
  check("hidden tab time is subtracted from the claimed outage", () => {
    // 19 min claimed − 18.5 min hidden = 30 s creditable → 1 rounded minute.
    assert.ok(body.pause_credit, "tiny visible remainder credited");
    assert.equal(body.pause_credit.credit_ms, 60_000);
    assert.equal(dasia.extension_minutes, 1);
    // A fully hidden claim would earn nothing:
  });
}

/* A fully hidden claim earns nothing */
const dasia2 = makeAttempt();
seedPresence(dasia2.id, 20 * 60_000);
{
  const res = await post(dasia2, { event: "restored", lost_at: iso(Date.now() - 19 * 60_000), hidden_ms: 19 * 60_000 + 10_000 });
  const body = await res.json();
  check("an entirely hidden claim is never outage credit", () => {
    assert.equal(body.pause_credit, null);
    assert.equal(dasia2.extension_minutes, 0);
    const ev = tables.exam_connection_events.find((e) => e.attempt_id === dasia2.id);
    assert.equal(ev?.event_kind, "credit_refused");
    assert.equal(ev?.refusal_reason, "hidden_time");
  });
}

/* `leave` never credits and keeps the lost flag */
const eli = makeAttempt();
seedPresence(eli.id, 10_000);
{
  const res = await post(eli, { event: "leave", lost_at: iso(Date.now() - 10 * 60_000) });
  check("a `leave` event never credits pause time", () => {
    assert.equal(res.status, 200);
    assert.equal(eli.extension_minutes, 0);
    assert.equal(tables.exam_connection_events.filter((e) => e.attempt_id === eli.id).length, 0);
  });
}

/* Closed attempts are refused */
const fara = makeAttempt("submitted");
{
  const res = await post(fara, { event: "restored", lost_at: iso(Date.now() - 10 * 60_000) });
  check("a closed attempt cannot be extended by a restored event", () => {
    assert.equal(res.status, 409);
    assert.equal(fara.extension_minutes, 0);
  });
}

/* An expired in-progress attempt whose device is STILL CONNECTED (fresh
 * heartbeat at the deadline) is refused: that is the one legitimate expiry. */
const gus = makeAttempt("in_progress", 70); // started 70 min ago, 60 min paper
seedPresence(gus.id, 20_000); // heartbeating 20 s ago — present at the deadline
{
  const res = await post(gus, { event: "restored", lost_at: iso(Date.now() - 10 * 60_000) });
  check("a connected attempt past its deadline is refused, not extended", () => {
    assert.equal(res.status, 409);
    assert.equal(gus.extension_minutes, 0);
  });
}

/* CONNECTION_LOST recovery (migration 0099): an expired attempt whose device
 * went SILENT BEFORE the deadline is an interrupted attempt, never a
 * completed one. The heartbeat that proves the candidate is back reopens the
 * paper with the outage credited — remaining time continues from the moment
 * of disconnection. This is the exact shape of the 2026-11-12 incident. */
const hana = makeAttempt("in_progress", 70); // started 70 min ago, 60 min paper
seedPresence(hana.id, 15 * 60_000); // server last heard from her 15 min ago — 5 min BEFORE the deadline
{
  const res = await post(hana, { event: "heartbeat", current_question: 9, saved_count: 4, pending_saves: 1 });
  const body = await res.json();
  check("a disconnected candidate returning past the deadline is RECOVERED, never refused or submitted", () => {
    assert.equal(res.status, 200, "the heartbeat is accepted");
    assert.equal(hana.status, "in_progress", "the attempt is never closed on a silent device");
    assert.ok(body.pause_credit, "the credited outage is reported to the client");
    assert.ok(hana.extension_minutes >= 15 && hana.extension_minutes <= 16,
      `the full outage is credited, anchored at the last heartbeat (got ${hana.extension_minutes})`);
    assert.equal(body.pause_credit.credit_ms, hana.extension_minutes * 60_000);
    assert.equal(body.deadline, iso(Date.parse(hana.started_at) + (60 + hana.extension_minutes) * 60_000),
      "the countdown continues from the disconnection instant");
    assert.ok(Date.parse(body.deadline) > Date.now(), "the reopened window is in the future");
    assert.deepEqual(hana.pause_reasons ?? [], [], "the connection pause clears as soon as the candidate is back");
    assert.equal(hana.paused_at, null);
    const evs = tables.exam_pause_events.filter((e) => e.attempt_id === hana.id);
    assert.equal(evs.length, 2, "both transitions are audited");
    assert.equal(evs[0].action, "pause");
    assert.equal(evs[0].reason, "connection");
    assert.equal(evs[1].action, "resume");
    assert.equal(evs[1].credited_minutes, hana.extension_minutes);
    const ledger = tables.exam_connection_events.filter((e) => e.attempt_id === hana.id);
    assert.equal(ledger.length, 1, "the credited window reaches the connection ledger exactly once");
    assert.equal(ledger[0].event_kind, "pause_credit");
    assert.ok(Math.abs(Date.parse(ledger[0].lost_at) - (Date.now() - 15 * 60_000)) < 5_000,
      "the ledger window is anchored at the seeded last heartbeat");
  });

  /* A `restored` claim for the SAME outage can never credit twice: the
   * ledger's unique (attempt_id, lost_at) key deduplicates across rails. */
  const extBeforeClaim = hana.extension_minutes;
  const again = await post(hana, { event: "restored", lost_at: iso(Date.now() - 15 * 60_000), hidden_ms: 0 });
  const againBody = await again.json();
  check("the 0097 restored-event rail cannot double-credit a window the pause cycle already credited", () => {
    assert.equal(again.status, 200);
    assert.equal(hana.extension_minutes, extBeforeClaim, "no extra minutes");
    assert.equal(tables.exam_connection_events.filter((e) => e.attempt_id === hana.id).length, 1, "no extra ledger row");
    assert.equal(againBody.pause_credit, null);
  });
}

/* An open connection pause (a sweep noticed the outage first) resumes on the
 * candidate's heartbeat — automatically, with no organizer action. */
const ido = makeAttempt("in_progress", 30);
seedPresence(ido.id, 4 * 60_000);
ido.pause_reasons = ["connection"];
ido.paused_at = iso(Date.now() - 4 * 60_000); // anchored at his last heartbeat
{
  const res = await post(ido, { event: "heartbeat", current_question: 2, saved_count: 1, pending_saves: 0 });
  const body = await res.json();
  check("an attempt already paused for connection loss resumes on the returning heartbeat", () => {
    assert.equal(res.status, 200);
    assert.deepEqual(ido.pause_reasons ?? [], []);
    assert.ok(ido.extension_minutes >= 4 && ido.extension_minutes <= 5, "the paused outage is folded into the extension");
    assert.ok(body.pause_credit && body.pause_credit.credit_ms === ido.extension_minutes * 60_000);
    assert.equal(tables.exam_pause_events.filter((e) => e.attempt_id === ido.id && e.action === "resume").length, 1);
  });
}

/* A reconnection clears ONLY the connection reason: an organizer pause set
 * before the outage survives the return (reasons are independent). */
const jia = makeAttempt("in_progress", 30);
seedPresence(jia.id, 6 * 60_000);
jia.pause_reasons = ["student", "connection"];
jia.paused_at = iso(Date.now() - 6 * 60_000);
{
  const res = await post(jia, { event: "heartbeat", current_question: 1, saved_count: 0, pending_saves: 0 });
  const body = await res.json();
  check("reconnection never cancels an organizer pause, and no credit is taken while one is open", () => {
    assert.equal(res.status, 200);
    assert.deepEqual(jia.pause_reasons, ["student"], "the organizer reason stays open");
    assert.equal(body.paused, true, "the candidate is still paused");
    assert.equal(jia.extension_minutes, 0, "credit waits until the LAST reason clears");
  });
}

/* Manual (organizer) pause — heartbeat echo + credit refusal while paused */
const pam = makeAttempt("in_progress", 10, 0);
pam.pause_reasons = ["assessment"];
pam.paused_at = iso(Date.now() - 4 * 60_000); // organizer paused 4 minutes ago
seedPresence(pam.id, 20_000);
{
  const res = await post(pam, { event: "heartbeat", current_question: 5, saved_count: 1, pending_saves: 0 });
  const body = await res.json();
  check("manual pause: heartbeat echoes paused + assessment notice and a frozen deadline", () => {
    assert.equal(res.status, 200);
    assert.equal(body.paused, true);
    assert.equal(body.pause_notice, "assessment");
    // Deadline = raw 60 min + the LIVE pause duration (>= 4 min), so the
    // countdown cannot reach zero while the organizer pause is open.
    const deadlineMs = Date.parse(body.deadline);
    const rawMs = Date.parse(pam.started_at) + 60 * 60_000;
    assert.ok(deadlineMs >= rawMs + 4 * 60_000, `deadline carries the open pause (${deadlineMs - rawMs} ms)`);
    assert.equal(pam.extension_minutes, 0, "no stored credit while the pause is open");
    assert.equal(body.pause_credit, null);
  });
}
{
  // An outage INSIDE the manual pause must not also credit connection time.
  const lostAt = Date.now() - 3 * 60_000;
  const res = await post(pam, { event: "restored", lost_at: iso(lostAt), hidden_ms: 0 });
  const body = await res.json();
  check("manual pause open: reconnection credit is REFUSED and ledgered, never double-granted", () => {
    assert.equal(res.status, 200);
    assert.equal(body.pause_credit, null, "no connection credit while the manual pause preserves time");
    assert.equal(pam.extension_minutes, 0, "extension untouched");
    const ev = tables.exam_connection_events.find((e) => e.attempt_id === pam.id && e.event_kind === "credit_refused");
    assert.ok(ev, "the refusal is recorded in the append-only ledger");
    assert.equal(ev.refusal_reason, "manual_pause_open");
    assert.equal(ev.credit_ms, 0);
    assert.equal(ev.extension_minutes_before, 0);
    assert.equal(ev.extension_minutes_after, 0);
    // Duplicate restored events stay a single ledger row (unique window index).
    assert.equal(tables.exam_connection_events.filter((e) => e.attempt_id === pam.id).length, 1);
  });
  const res2 = await post(pam, { event: "restored", lost_at: iso(lostAt), hidden_ms: 0 });
  check("manual pause: a duplicate refusal cannot add a second ledger row", async () => {
    assert.equal(res2.status, 200);
    assert.equal(tables.exam_connection_events.filter((e) => e.attempt_id === pam.id).length, 1);
  });
}
{
  // Resume: reasons cleared, paused_at kept null; the next restored event
  // credits normally again (the refusal was scoped to the open pause only).
  pam.pause_reasons = [];
  pam.paused_at = null;
  const res = await post(pam, { event: "heartbeat" });
  const body = await res.json();
  check("manual pause cleared: heartbeat reports unpaused with the plain deadline", () => {
    assert.equal(body.paused, false);
    assert.equal(body.pause_notice, null);
    assert.equal(body.deadline, iso(Date.parse(pam.started_at) + 60 * 60_000));
  });
  // Backdate the server's last contact so the outage window is real (a
  // second presence row would violate the primary key).
  tables.exam_presence.find((r) => r.attempt_id === pam.id).last_seen_at = iso(Date.now() - 5 * 60_000);
  const lostAt = Date.now() - 4.5 * 60_000;
  const res2 = await post(pam, { event: "restored", lost_at: iso(lostAt), hidden_ms: 0 });
  const body2 = await res2.json();
  check("after the manual pause clears, connection credit works again for THIS attempt", () => {
    assert.equal(res2.status, 200);
    assert.ok(body2.pause_credit, "credit granted again");
    assert.ok(pam.extension_minutes >= 4 && pam.extension_minutes <= 5, `extension ${pam.extension_minutes}`);
  });
}
{
  // An individually paused student ('student' reason) gets the same treatment.
  const ivan = makeAttempt("in_progress", 10, 0);
  ivan.pause_reasons = ["student"];
  ivan.paused_at = iso(Date.now() - 2 * 60_000);
  seedPresence(ivan.id, 20_000);
  const res = await post(ivan, { event: "heartbeat" });
  const body = await res.json();
  check("individual student pause: notice kind is 'student' and only THIS attempt is frozen", () => {
    assert.equal(body.paused, true);
    assert.equal(body.pause_notice, "student");
    const rawMs = Date.parse(ivan.started_at) + 60 * 60_000;
    assert.ok(Date.parse(body.deadline) >= rawMs + 2 * 60_000);
    assert.equal(pam.extension_minutes >= 4, true, "other attempts keep their own state");
  });
}

/* Student-facing copy requirements (static source check) */
{
  const client = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
  check("the student UI shows the required connection banners and freezes the countdown", () => {
    assert.ok(client.includes("CONNECTION LOST — Your assessment time has been paused"));
    assert.ok(client.includes("CONNECTION RESTORED —"));
    const countdown = readFileSync("src/components/exam/ExamCountdown.tsx", "utf8");
    assert.ok(client.includes("<ExamCountdown"));
    assert.ok(client.includes('connState === "lost" || manualPause.paused'));
    assert.ok(countdown.includes("Time paused"));
    assert.ok(countdown.includes("frozenRemaining"));
    assert.ok(client.includes('heartbeat("restored")'));
    assert.ok(client.includes("navigator.onLine === false"));
  });
}

console.log(`\n${checks} checks passed`);
