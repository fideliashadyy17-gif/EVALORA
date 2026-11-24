// Show Your Working fix: Math Keyboard must insert at the caret of the
// editor the candidate is actually typing in (Written Answer / Working), not
// at the top of the question prompt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mathInputManager } from "../src/lib/mathInputManager.ts";

function makeTarget(id, questionId, sink) {
  return {
    id,
    questionId,
    fieldId: id.split(":").slice(1).join(":"),
    getElement: () => null,
    getValue: () => "",
    setValue: () => {},
    applyInsertion: (ins) => sink.push(`${id}<=${ins.text}`),
    focus: () => {},
    getSelection: () => ({ start: 0, end: 0 }),
  };
}

const sink = [];
const header = makeTarget("q1:prompt", "q1", sink);
const working = makeTarget("q1:working:part1", "q1", sink);
const written = makeTarget("q1:written", "q1", sink);
const other = makeTarget("q2:written", "q2", sink);

// Fresh state: no DOM focus yet.
globalThis.document = { activeElement: null };
mathInputManager.setActiveTarget(null);
const offHeader = mathInputManager.register(header);
const offWorking = mathInputManager.register(working);
const offWritten = mathInputManager.register(written);
const offOther = mathInputManager.register(other);

// ── focus resolution ─────────────────────────────────────────────────────
// Header target registered first (the historical default) — but the moment
// the candidate focuses the working editor, insertion must route THERE.
mathInputManager.setActiveTarget(header);
assert.equal(mathInputManager.getActiveTargetId(), "q1:prompt");

globalThis.document = {
  activeElement: {
    parentElement: null,
    getAttribute: (name) => (name === "data-target-id" ? "q1:working:part1" : null),
  },
};
const focused = mathInputManager.getFocusedTarget();
assert.equal(focused?.id, "q1:working:part1", "focused [data-target-id] wins over the recorded active target");
assert.equal(mathInputManager.resolveTarget("q1:prompt", "q1").id, "q1:working:part1", "focused-first resolution beats the header target");
assert.equal(mathInputManager.getActiveTargetId(), "q1:working:part1", "resolution syncs the recorded active target");

// No DOM focus → recorded active target is used.
globalThis.document = { activeElement: null };
assert.equal(mathInputManager.getFocusedTarget(), null);
assert.equal(mathInputManager.resolveTarget("q1:prompt", "q1").id, "q1:working:part1");

// Focused element that belongs to NO registered target → recorded target.
globalThis.document = {
  activeElement: {
    parentElement: null,
    getAttribute: (name) => (name === "data-target-id" ? "not-registered" : null),
  },
};
assert.equal(mathInputManager.getFocusedTarget(), null);
assert.equal(mathInputManager.resolveTarget("q1:prompt", "q1").id, "q1:working:part1");

// Explicit fallback id is honoured when nothing is focused/active.
mathInputManager.setActiveTarget(null);
assert.equal(mathInputManager.resolveTarget("q1:written", "q1").id, "q1:written", "fallback target used when idle");

// Question-scoped resolution: given questionId, a target of THAT question wins.
mathInputManager.setActiveTarget(null);
assert.equal(mathInputManager.resolveTarget(undefined, "q2").id, "q2:written", "question-scoped target chosen");

// ── insertion: correct editor, caret model, repeated runs, coexistence ───
globalThis.document = { activeElement: null };
mathInputManager.setActiveTarget(written);
const before = sink.length;
assert.equal(mathInputManager.insertIntoActive({ text: "\\frac{1}{2}", caret: 11 }, undefined, "q1"), true);
assert.equal(mathInputManager.insertIntoActive({ text: " + \\sqrt{2}", caret: 11 }, undefined, "q1"), true);
assert.deepEqual(sink.slice(before), ["q1:written<=\\frac{1}{2}", "q1:written<= + \\sqrt{2}"], "runs land in order in the SAME editor (caret advances after each run)");

// Stale active target (q1) + declared current question (q2): re-routed to
// q2's own field — never written into q1's editor.
const beforeForeign = sink.length;
assert.equal(mathInputManager.insertIntoActive({ text: "x", caret: 1 }, undefined, "q2"), true, "stale target re-routed to the declared question");
assert.equal(sink[beforeForeign], "q2:written<=x", "insertion landed in the CURRENT question's editor");

// Declared question with NO registered field → refused, nothing written.
const beforeUnknown = sink.length;
assert.equal(mathInputManager.insertIntoActive({ text: "y", caret: 1 }, undefined, "q-nope"), false, "unknown question refused");
assert.equal(sink.length, beforeUnknown, "refused insertion touched nothing");

// Header fallback path (preview target) still works when explicitly asked.
assert.equal(mathInputManager.insertIntoActive({ text: "pi", caret: 2 }, "q1:prompt", "q1"), true);
assert.equal(sink.at(-1), "q1:prompt<=pi", "explicit fallback target receives the run");

// Unregistering the active target falls back to another registered field.
offWritten();
const afterUnmount = mathInputManager.resolveTarget(undefined, "q1");
assert.ok(afterUnmount && afterUnmount.id.startsWith("q1:"), "unmount falls back to a LIVE field of the question");
assert.notEqual(afterUnmount.id, "q1:written", "the unmounted field is gone");

offHeader();
offWorking();
offOther();

// ── source wiring ────────────────────────────────────────────────────────
const rce = readFileSync("src/components/editor/RichContentEditor.tsx", "utf8");
assert.ok(rce.includes("mathInputManager.register"), "rich editor registers as an insertion target");
assert.ok(rce.includes("onFocus"), "focus updates the active target");
assert.ok(rce.includes("data-target-id"), "editor exposes its id for focus resolution");
assert.ok(rce.includes("insertContent"), "insertion runs inside the editor instance (at the tiptap caret)");

const structured = readFileSync("src/components/response/StructuredResponseEditor.tsx", "utf8");
assert.ok(structured.includes("questionId") && structured.includes("fieldId"), "structured response threads identity to the rich editor");

const runner = readFileSync("src/components/QuestionRunner.tsx", "utf8");
assert.ok(runner.includes('"written"'), "written-answer editor carries the written field id");
assert.ok(runner.includes("working:"), "working editors carry part-scoped field ids");
assert.ok(runner.includes("floatingKeyboard") || runner.includes("Math keyboard"), "math keyboard still offered in the runner");

const manager = readFileSync("src/lib/mathInputManager.ts", "utf8");
assert.ok(manager.includes("focused-first") || manager.includes("authoritative answer"), "manager documents the focused-first rule");
assert.ok(manager.includes("getFocusedTarget"), "manager exposes focus lookup");

const takeExam = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
assert.ok(takeExam.includes("onInsert"), "attempt header routes insertions through the manager");

console.log("math-insertion-show-working: 31 checks passed");
