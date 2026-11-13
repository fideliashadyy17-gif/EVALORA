// Platform-wide link-lifecycle consistency (Part B) + plain-text math
// keyboard projection (Part D) — rule-level tests.
//
// The 2026-11-12 production incident was a divergence: the administrator
// display (`examLinkLifecycle`) called freshly created links "Expired" while
// the admission gate (`examAccessAvailability`) admitted candidates through
// the same row. Both now delegate the link-level decision to ONE shared pure
// rule (`examLinkWindow`), and this suite pins that agreement for every
// lifecycle state, plus the machine-readable refusal reasons.
//
// It also pins the mathematical keyboard used inside the Formative Assessment
// answer fields: every key of the shared MATH_CATEGORIES projects to plain
// text (never raw LaTeX or MathLive placeholders), the symbols required by
// the specification are all present, and structured keys land the caret in
// the slot the student must fill.
import assert from "node:assert/strict";
import { examLinkLifecycle, examLinkWindow } from "../src/lib/examLink.ts";
import { examAccessAvailability } from "../src/lib/exam-access.ts";
import { MATH_CATEGORIES } from "../src/components/editor/mathKeyboard.ts";
import {
  NUMERIC_MATH_CATEGORY,
  plainInsertionForKey,
} from "../src/components/editor/plainMathKeyboard.ts";

const now = new Date("2026-11-12T12:00:00.000Z");
let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

const examRow = (link, extra = {}) => ({
  status: "open", starts_at: null, ends_at: null, ...extra, ...link,
});

// ── Part B: display and gate can never disagree ─────────────────────────
const STATES = {
  "disabled link": { shared_link_enabled: false, invite_expires_at: "2026-12-01T00:00:00Z" },
  "scheduled activation": { shared_link_enabled: true, invite_expires_at: "2026-12-01T00:00:00Z", invite_activates_at: "2026-11-20T00:00:00Z" },
  "expired link": { shared_link_enabled: true, invite_expires_at: "2026-11-01T00:00:00Z" },
  "unreadable expiry": { shared_link_enabled: true, invite_expires_at: "not-a-date" },
  "active with future expiry": { shared_link_enabled: true, invite_expires_at: "2026-12-01T00:00:00Z" },
  "legacy null expiry": { shared_link_enabled: true, invite_expires_at: null },
  "explicit no-expiry exemption": { shared_link_enabled: true, invite_expires_at: null, invite_no_expiry: true },
};

for (const [name, link] of Object.entries(STATES)) {
  check(`display and gate agree — ${name}`, () => {
    const shown = examLinkLifecycle(link, now).status;
    const gate = examAccessAvailability(examRow(link), now);
    if (shown === "active") {
      assert.equal(gate.ok, true, `${name}: display says active but the gate refused (${gate.error})`);
    } else {
      assert.equal(gate.ok, false, `${name}: display says ${shown} but the gate admitted`);
    }
    // Same state classification on both sides.
    const window = examLinkWindow(link, now);
    assert.equal(window.state, shown);
  });
}

check("every non-ok availability result carries a machine-readable reason", () => {
  const refusals = [
    examAccessAvailability(examRow(STATES["disabled link"]), now),
    examAccessAvailability(examRow(STATES["scheduled activation"]), now),
    examAccessAvailability(examRow(STATES["expired link"]), now),
    examAccessAvailability(examRow({ shared_link_enabled: true, invite_expires_at: "2026-12-01T00:00:00Z" }, { status: "draft" }), now),
    examAccessAvailability(examRow({ shared_link_enabled: true, invite_expires_at: "2026-12-01T00:00:00Z" }, { starts_at: "2026-11-13T00:00:00Z" }), now),
    examAccessAvailability(examRow({ shared_link_enabled: true, invite_expires_at: "2026-12-01T00:00:00Z" }, { ends_at: "2026-11-11T00:00:00Z" }), now),
  ];
  const expected = ["link_disabled", "link_scheduled", "link_expired", "exam_not_open", "opens_later", "window_closed"];
  assert.deepEqual(refusals.map((r) => r.reason), expected);
  for (const refusal of refusals) {
    assert.equal(refusal.ok, false);
    assert.ok(typeof refusal.error === "string" && refusal.error.length > 0, "refusals explain themselves");
  }
  // Distinct classes never share a message.
  const messages = new Set(refusals.map((r) => r.error));
  assert.equal(messages.size, refusals.length, "each refusal class has its own message");
});

check("refusal messages distinguish expired from closed from unauthorized-style states", () => {
  const expired = examAccessAvailability(examRow(STATES["expired link"]), now);
  const closed = examAccessAvailability(examRow(STATES["disabled link"]), now);
  assert.match(expired.error, /expired/i);
  assert.match(closed.error, /closed/i);
  assert.ok(!/invalid/i.test(expired.error) && !/invalid/i.test(closed.error),
    "a configuration state is never reported as an invalid code");
});

check("legacy null expiry stays usable and is flagged for repair", () => {
  const window = examLinkWindow(STATES["legacy null expiry"], now);
  assert.equal(window.state, "active");
  assert.equal(window.missingExpiry, true);
  const shown = examLinkLifecycle(STATES["legacy null expiry"], now);
  assert.match(shown.detail, /platform-policy default/i);
});

check("device clock changes cannot matter: instants are compared in UTC epoch time", () => {
  // Same stored row evaluated at two server instants around the expiry.
  const link = { shared_link_enabled: true, invite_expires_at: "2026-11-12T13:00:00Z" };
  assert.equal(examLinkWindow(link, new Date("2026-11-12T12:59:59Z")).state, "active");
  assert.equal(examLinkWindow(link, new Date("2026-11-12T13:00:01Z")).state, "expired");
});

// ── Part D: plain-text math keyboard projection ──────────────────────────
const allKeys = MATH_CATEGORIES.flatMap((c) => c.keys);

check("every keyboard key projects to non-empty plain text", () => {
  for (const key of allKeys) {
    const ins = plainInsertionForKey(key);
    assert.ok(ins.text.length > 0, `${key.t}: empty insertion`);
    assert.ok(!ins.text.includes("#"), `${key.t}: raw MathLive placeholder leaked (${ins.text})`);
    assert.ok(!/\\[a-zA-Z]/.test(ins.text), `${key.t}: raw LaTeX command leaked (${ins.text})`);
    assert.ok(!ins.text.includes("$"), `${key.t}: TeX delimiter leaked (${ins.text})`);
    assert.ok(ins.caret >= 0 && ins.caret <= ins.text.length + 2, `${key.t}: caret out of range`);
    if (ins.slot) {
      assert.ok(ins.slot.start >= 0 && ins.slot.end <= ins.text.length, `${key.t}: slot out of range`);
      assert.ok(ins.slot.end > ins.slot.start, `${key.t}: empty slot`);
    }
  }
});

check("spec-required symbols are all reachable from the keyboard", () => {
  const required = [
    "+", "−", "×", "÷", "=", "≠", "≈", "<", ">", "≤", "≥", // operations
    "√", "∛", "^", "π", "θ", "α", "β", "∞", "±", "∠", "Σ", "∏", // notation/greek
    "∈", "∉", "∩", "∪", // sets
  ];
  const projected = allKeys.map((k) => plainInsertionForKey(k).text).join("|");
  for (const symbol of required) {
    assert.ok(projected.includes(symbol), `missing required symbol ${symbol}`);
  }
  // Fractions, decimals, parentheses, brackets and absolute value templates.
  const fraction = plainInsertionForKey(allKeys.find((k) => k.t === "Fraction"));
  assert.equal(fraction.text, "( )/( )");
  assert.deepEqual(fraction.slot, { start: 1, end: 2 });
  const parens = plainInsertionForKey(allKeys.find((k) => k.t === "Parentheses"));
  assert.equal(parens.text, "()");
  assert.equal(parens.caret, 1);
  const abs = plainInsertionForKey(allKeys.find((k) => k.t === "Absolute value"));
  assert.match(abs.text, /^\|.*\|$/);
  const squared = plainInsertionForKey(allKeys.find((k) => k.t === "Squared"));
  assert.equal(squared.text, "^2");
  const nthRoot = plainInsertionForKey(allKeys.find((k) => k.t === "n-th root"));
  assert.match(nthRoot.text, /^√\[ \]\( \)$/);
});

check("cursor-preserving insertion composes real expressions", () => {
  // Mirrors MathAnswerInput exactly: a keyboard insertion selects its slot;
  // typing replaces the selection and then steps past a closing bracket.
  const CLOSERS = new Set([")", "]", "}", "|"]);
  const applyIns = (state, ins) => {
    const { text, start, end } = state;
    const next = text.slice(0, start) + ins.text + text.slice(end);
    if (ins.slot) {
      const pending = { base: start, slot: ins.slot, next: ins.next };
      return { text: next, start: start + ins.slot.start, end: start + ins.slot.end, pending };
    }
    return { text: next, start: start + ins.caret, end: start + ins.caret, pending: null };
  };
  const typeOver = (state, ch) => {
    const text = state.text.slice(0, state.start) + ch + state.text.slice(state.end);
    const pending = state.pending;
    if (pending && state.start === pending.base + pending.slot.start && state.end === pending.base + pending.slot.end) {
      const shift = ch.length - (pending.slot.end - pending.slot.start);
      if (pending.next) {
        const ns = pending.base + pending.next.start + shift;
        const ne = pending.base + pending.next.end + shift;
        return { text, start: ns, end: ne, pending: { base: pending.base, slot: pending.next, next: undefined } };
      }
      let caret = state.start + ch.length;
      if (CLOSERS.has(text[caret] ?? "")) caret += 1;
      return { text, start: caret, end: caret, pending: null };
    }
    let caret = state.start + ch.length;
    return { text, start: caret, end: caret, pending: null };
  };
  const find = (t) => allKeys.find((k) => k.t === t);
  let s = { text: "", start: 0, end: 0 };
  s = typeOver(s, "2");
  s = applyIns(s, plainInsertionForKey(find("Square root")));
  assert.equal(s.text, "2√( )");
  assert.deepEqual([s.start, s.end], [3, 4], "the slot is selected so typing replaces it");
  s = typeOver(s, "3");
  assert.equal(s.text, "2√(3)");
  assert.equal(s.start, 5, "caret stepped past the closing bracket");
  s = applyIns(s, plainInsertionForKey(find("Multiply")));
  s = applyIns(s, plainInsertionForKey(find("pi")));
  assert.equal(s.text, "2√(3)×π");
  // Fractions: filling the numerator chains the selection to the denominator.
  s = applyIns({ text: "", start: 0, end: 0 }, plainInsertionForKey(find("Fraction")));
  assert.equal(s.text, "( )/( )");
  s = typeOver(s, "3");
  assert.equal(s.text, "(3)/( )");
  assert.deepEqual([s.start, s.end], [5, 6], "caret chained to the denominator slot");
  s = typeOver(s, "4");
  assert.equal(s.text, "(3)/(4)");
  assert.equal(s.start, 7, "caret stepped past the final closer");
});

check("canonicalExpression still marks keyboard-composed answers", async () => {
  const { canonicalExpression, parseStudentNumber } = await import("../src/lib/assessParts.ts");
  // A composed expression must canonicalise identically to a typed one.
  assert.equal(canonicalExpression("2×n"), canonicalExpression("2*n"));
  assert.equal(canonicalExpression("n²".replace("²", "^2")), canonicalExpression("n^2"));
  assert.equal(canonicalExpression("aₙ = a₁ + (n−1)d"), canonicalExpression("a1 + (n-1)d"));
  // Numeric parts: the compact keyboard's bare fraction is score-safe.
  assert.equal(parseStudentNumber("3/4"), 0.75);
  assert.equal(parseStudentNumber("-3/4"), -0.75);
  assert.equal(parseStudentNumber("50%"), 50);
});

check("the compact numeric keyboard only offers score-safe keys", () => {
  const titles = NUMERIC_MATH_CATEGORY.keys.map((k) => k.t);
  assert.deepEqual(titles.sort(), ["Fraction", "Minus", "Percent"].sort());
  for (const key of NUMERIC_MATH_CATEGORY.keys) {
    const ins = plainInsertionForKey(key);
    assert.ok(!/[a-wyz√∛π∞≠≤≥]/i.test(ins.text.replace("log", "")), `${key.t} is not numeric-safe: ${ins.text}`);
  }
});

console.log(`\n${checks} checks passed`);
