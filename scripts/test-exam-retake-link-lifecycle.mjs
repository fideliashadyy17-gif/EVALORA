// Controlled exam retakes + configurable link expiration — rule-level tests.
//
// These modules are the single source of truth used by the API routes, the
// server actions and the UI, so exercising them here exercises every surface.
import assert from "node:assert/strict";
import {
  EXAM_LINK_DURATION_PRESETS,
  DEFAULT_EXAM_LINK_POLICY,
  examLinkLifecycle,
  expirationFromPreset,
  linkPolicyLabel,
  parseExamLinkPolicy,
  reactivationExpiry,
  resolveLinkExpiry,
} from "../src/lib/examLink.ts";
import {
  attemptLabel,
  retakeState,
  sanitizeRetakeReason,
  usableGrant,
  normalizeGrantedAttempts,
  resolveRetakeAccessWindow,
} from "../src/lib/examRetake.ts";
import { examAccessAvailability } from "../src/lib/exam-access.ts";

const now = new Date("2026-11-10T12:00:00.000Z");
let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

// ── Link lifecycle ───────────────────────────────────────────────────────
check("a link with a future expiry is Active", () => {
  const l = examLinkLifecycle({ shared_link_enabled: true, invite_expires_at: "2026-11-11T12:00:00Z" }, now);
  assert.equal(l.status, "active");
  assert.equal(l.label, "Active");
});

check("an expired link is Expired even though nobody disabled it", () => {
  const l = examLinkLifecycle({ shared_link_enabled: true, invite_expires_at: "2026-11-01T12:00:00Z" }, now);
  assert.equal(l.status, "expired");
  assert.notEqual(l.label, "Active");
});

check("a manually disabled link is Disabled even when unexpired", () => {
  const l = examLinkLifecycle({ shared_link_enabled: false, invite_expires_at: "2026-12-01T12:00:00Z" }, now);
  assert.equal(l.status, "disabled");
});

check("a future activation is Scheduled", () => {
  const l = examLinkLifecycle(
    { shared_link_enabled: true, invite_expires_at: "2026-12-01T12:00:00Z", invite_activates_at: "2026-11-20T12:00:00Z" },
    now,
  );
  assert.equal(l.status, "scheduled");
});

// Migration 0096 makes a stored NULL expiry impossible (trigger + backfill).
// If a legacy row ever arrives without one, display and gate must AGREE that
// the link is usable and flag the missing configuration — the 2026-11-12
// incident was the display saying "Expired" while the gate admitted students.
check("a missing expiry keeps display and gate consistent (usable, flagged)", () => {
  const row = { shared_link_enabled: true, invite_expires_at: null };
  const l = examLinkLifecycle(row, now);
  const a = examAccessAvailability({ ...row, status: "open", starts_at: null, ends_at: null }, now);
  assert.equal(l.status, "active");
  assert.match(l.detail, /no explicit expiration/i);
  assert.equal(a.ok, true);
});

check("an unreadable expiry is Expired in BOTH display and gate", () => {
  const row = { shared_link_enabled: true, invite_expires_at: "not-a-date" };
  const l = examLinkLifecycle(row, now);
  const a = examAccessAvailability({ ...row, status: "open", starts_at: null, ends_at: null }, now);
  assert.equal(l.status, "expired");
  assert.equal(a.ok, false);
  assert.equal(a.reason, "link_expired");
});

check("an explicit policy exemption can be unexpired", () => {
  const l = examLinkLifecycle({ shared_link_enabled: true, invite_expires_at: null, invite_no_expiry: true }, now);
  assert.equal(l.status, "active");
});

check("presets are exactly 24h / 7d / 30d", () => {
  assert.deepEqual(EXAM_LINK_DURATION_PRESETS.map((p) => p.hours), [24, 168, 720]);
  assert.equal(expirationFromPreset("24h", now), "2026-11-11T12:00:00.000Z");
  assert.equal(expirationFromPreset("7d", now), "2026-11-17T12:00:00.000Z");
  assert.equal(expirationFromPreset("30d", now), "2026-12-10T12:00:00.000Z");
});

check("custom expiry must be in the future and within two years", () => {
  assert.equal(resolveLinkExpiry({ mode: "custom", custom: "2026-11-09T12:00:00Z" }, { now }).ok, false);
  assert.equal(resolveLinkExpiry({ mode: "custom", custom: "" }, { now }).ok, false);
  const ok = resolveLinkExpiry({ mode: "custom", custom: "2026-12-24T18:30:00Z" }, { now });
  assert.equal(ok.ok, true);
  assert.equal(ok.expiresAt, "2026-12-24T18:30:00.000Z");
});

check("no expiry is refused unless platform policy permits it", () => {
  const refused = resolveLinkExpiry({ mode: "none" }, { now, policy: DEFAULT_EXAM_LINK_POLICY });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /policy/i);
  const allowed = resolveLinkExpiry({ mode: "none" }, { now, policy: parseExamLinkPolicy({ allow_no_expiry: true }) });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.expiresAt, null);
});

check("an unknown duration is refused instead of defaulting to permanent", () => {
  assert.equal(resolveLinkExpiry({ mode: "preset", preset: "forever" }, { now }).ok, false);
});

check("reactivation requires a valid future expiration", () => {
  const stale = reactivationExpiry({ invite_expires_at: "2026-11-01T00:00:00Z" }, {}, { now });
  assert.equal(stale.ok, false);
  const stillValid = reactivationExpiry({ invite_expires_at: "2026-11-20T00:00:00Z" }, {}, { now });
  assert.equal(stillValid.ok, true);
  const extended = reactivationExpiry({ invite_expires_at: "2026-11-01T00:00:00Z" }, { mode: "preset", preset: "30d" }, { now });
  assert.equal(extended.ok, true);
});

check("policy parsing is conservative for missing/garbled values", () => {
  assert.equal(parseExamLinkPolicy(undefined).allowNoExpiry, false);
  assert.equal(parseExamLinkPolicy({ allow_no_expiry: "yes" }).allowNoExpiry, false);
  assert.equal(parseExamLinkPolicy({ allow_no_expiry: true }).allowNoExpiry, true);
  assert.equal(linkPolicyLabel("24h"), "24 hours");
});

// ── Backend availability (server clock only) ─────────────────────────────
const baseExam = {
  status: "open",
  starts_at: null,
  ends_at: null,
  shared_link_enabled: true,
  invite_expires_at: "2026-12-01T12:00:00Z",
};

check("an expired link cannot start a new attempt (server clock)", () => {
  const expired = { ...baseExam, invite_expires_at: "2026-11-01T12:00:00Z" };
  const availability = examAccessAvailability(expired, now);
  assert.equal(availability.ok, false);
  assert.match(availability.error, /expired/i);
  // A different device clock is not an input to this function.
  assert.equal(examAccessAvailability(expired, new Date("2026-10-01T00:00:00Z")).ok, true);
});

check("a disabled link cannot start a new attempt", () => {
  const availability = examAccessAvailability({ ...baseExam, shared_link_enabled: false }, now);
  assert.equal(availability.ok, false);
});

check("a scheduled link cannot start an attempt before activation", () => {
  const availability = examAccessAvailability({ ...baseExam, invite_activates_at: "2026-11-20T12:00:00Z" }, now);
  assert.equal(availability.ok, false);
  assert.match(availability.label, /Scheduled/);
});

check("an expired link message states the exact UTC instant", () => {
  const availability = examAccessAvailability({ ...baseExam, invite_expires_at: "2026-11-01T09:30:00Z" }, now);
  assert.match(availability.error, /2026-11-01 09:30 UTC/);
});

check("a policy-exempt link stays available", () => {
  const availability = examAccessAvailability(
    { ...baseExam, invite_expires_at: null, invite_no_expiry: true, invite_activates_at: null },
    now,
  );
  assert.equal(availability.ok, true);
});

// ── Retake state machine ─────────────────────────────────────────────────
const submitted = { attemptStatus: "submitted", attemptNumber: 1 };
const pendingRequest = {
  id: "r1", status: "pending", created_at: "2026-11-10T10:00:00Z",
};

check("a submitted attempt can request a retake", () => {
  const state = retakeState({ ...submitted, requests: [], now });
  assert.equal(state.submitted, true);
  assert.equal(state.canRequest, true);
  assert.equal(state.canStartAuthorizedRetake, false);
});

check("an attempt still in progress cannot request a retake", () => {
  const state = retakeState({ attemptStatus: "in_progress", attemptNumber: 1, requests: [], now });
  assert.equal(state.canRequest, false);
});

check("a pending request blocks duplicates", () => {
  const state = retakeState({ ...submitted, requests: [pendingRequest], now });
  assert.equal(state.canRequest, false);
  assert.equal(state.pending?.id, "r1");
  assert.match(state.message, /awaiting/i);
});

check("requesting a retake never grants one", () => {
  const state = retakeState({ ...submitted, requests: [pendingRequest], now });
  assert.equal(state.canStartAuthorizedRetake, false);
  assert.equal(state.grant, null);
});

check("an approved, unused, in-window grant enables a new attempt", () => {
  const approved = {
    id: "r2", status: "approved", created_at: "2026-11-09T10:00:00Z",
    decided_at: "2026-11-09T11:00:00Z", granted_attempts: 1,
    access_expires_at: "2026-11-20T12:00:00Z",
  };
  const state = retakeState({ ...submitted, requests: [approved], now });
  assert.equal(state.canStartAuthorizedRetake, true);
  assert.equal(state.canRequest, false);
  assert.equal(state.grant?.remaining, 1);
  assert.equal(attemptLabel(2), "Second attempt");
});

check("one approval authorizes ONE attempt unless explicitly widened", () => {
  const approved = {
    id: "r3", status: "approved", created_at: "2026-11-09T10:00:00Z",
    granted_attempts: 1, access_expires_at: "2026-11-20T12:00:00Z",
  };
  const used = retakeState({ ...submitted, requests: [approved], attemptsUsedByRequest: { r3: 1 }, now });
  assert.equal(used.canStartAuthorizedRetake, false);
  assert.equal(used.canRequest, true);
  assert.equal(usableGrant(approved, { attemptsUsed: 1, now })?.remaining, 0);
  assert.equal(normalizeGrantedAttempts(99), 3);
  assert.equal(normalizeGrantedAttempts(0), 1);
  assert.equal(normalizeGrantedAttempts("abc"), 1);
});

check("an approval whose access window closed cannot start an attempt", () => {
  const approved = {
    id: "r4", status: "approved", created_at: "2026-11-01T10:00:00Z",
    granted_attempts: 1, access_expires_at: "2026-11-05T12:00:00Z",
  };
  const state = retakeState({ ...submitted, requests: [approved], now });
  assert.equal(state.canStartAuthorizedRetake, false);
  assert.equal(state.canRequest, true);
  assert.match(state.message, /window/i);
});

check("a rejected request never authorizes an attempt and can be re-requested", () => {
  const rejected = { id: "r5", status: "rejected", created_at: "2026-11-09T10:00:00Z", decided_at: "2026-11-09T12:00:00Z" };
  const state = retakeState({ ...submitted, requests: [rejected], now });
  assert.equal(state.canStartAuthorizedRetake, false);
  assert.equal(state.canRequest, true);
  assert.equal(state.latestDecision?.status, "rejected");
});

check("attempt labels distinguish first, second and subsequent attempts", () => {
  assert.equal(attemptLabel(1), "First attempt");
  assert.equal(attemptLabel(2), "Second attempt");
  assert.equal(attemptLabel(3), "Third attempt");
  assert.equal(attemptLabel(7), "Attempt 7");
});

check("retake access windows are bounded and validated", () => {
  const preset = resolveRetakeAccessWindow({ mode: "preset", preset: "7d" }, now);
  assert.equal(preset.ok, true);
  assert.equal(preset.expiresAt, "2026-11-17T12:00:00.000Z");
  assert.equal(resolveRetakeAccessWindow({ mode: "custom", custom: "2026-11-10T12:30:00Z" }, now).ok, false);
  assert.equal(resolveRetakeAccessWindow({ mode: "preset", preset: "forever" }, now).ok, false);
  assert.equal(resolveRetakeAccessWindow({ mode: "custom", custom: "2026-12-01T12:00:00Z" }, now).ok, true);
});

check("reasons are trimmed, bounded and optional", () => {
  assert.equal(sanitizeRetakeReason(""), null);
  assert.equal(sanitizeRetakeReason(null), null);
  assert.equal(sanitizeRetakeReason("  I lost   connection  "), "I lost connection");
  assert.equal(sanitizeRetakeReason("x".repeat(3000))?.length, 2000);
});

console.log(`\n${checks} checks passed`);
