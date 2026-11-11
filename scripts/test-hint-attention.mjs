/**
 * Hint attention — the "💡 HINT — NEED HELP?" layer.
 *
 * Proves the behaviour the platform promises a student mid-paper:
 *   · the hint is available from the first second (no 30-second gate);
 *   · after 30 seconds without a resolved answer the button asks for attention;
 *   · an incorrect answer asks immediately, before any timer;
 *   · a correct answer never nags, and opening the hint stops the pulse;
 *   · the timer is presentation-only: opening, waiting or answering through the
 *     hint never submits, resets, reloads, deletes an answer or writes anything
 *     to the server — and it is not the assessment clock.
 *
 * Run: node scripts/test-hint-attention.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module, createRequire } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document = globalThis.document ?? { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

let checks = 0;
const ok = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
};

function compile(source, filename, shims = {}) {
  const file = path.resolve(filename);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === file && Object.hasOwn(shims, request)) return shims[request];
    return originalLoad.apply(this, arguments);
  };
  try {
    mod._compile(
      ts.transpileModule(readFileSync(source, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      }).outputText,
      file,
    );
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const require = createRequire(import.meta.url);
const attention = compile("src/lib/hintAttention.ts", "scripts/__virtual_hint_attention.cjs");

console.log("\nRules");
const base = { answerState: "unanswered", elapsedMs: 0, opened: false };
ok("the hint is offered from the first second", attention.hintAttention(base).label === "Need a hint?");
ok("it stays quiet just before 30s", attention.hintAttention({ ...base, elapsedMs: 29_999 }).attention === false);
ok("at 30s it asks for attention", attention.hintAttention({ ...base, elapsedMs: 30_000 }).attention === true);
ok("the attention label is exactly as specified", attention.hintAttention({ ...base, elapsedMs: 30_000 }).label === "💡 HINT — NEED HELP?");
ok("the reason is reported for diagnostics", attention.hintAttention({ ...base, elapsedMs: 30_000 }).reason === "timeout");
ok("an incorrect answer asks immediately", attention.hintAttention({ ...base, answerState: "incorrect", elapsedMs: 500 }).attention === true);
ok("an incorrect answer is not waiting for a timeout", attention.hintAttention({ ...base, answerState: "incorrect", elapsedMs: 0 }).reason === "incorrect");
ok("a correct answer never nags", attention.hintAttention({ ...base, answerState: "correct", elapsedMs: 120_000 }).attention === false);
ok("an answered (unmarked) question stops the invitation", attention.hintAttention({ ...base, answerState: "answered", elapsedMs: 60_000 }).attention === false);
ok("opening the hint stops the pulse", attention.hintAttention({ ...base, elapsedMs: 90_000, opened: true }).attention === false);
ok("a submitted paper has no attention", attention.hintAttention({ ...base, elapsedMs: 90_000, disabled: true }).attention === false);
ok("the threshold is configurable", attention.hintAttention({ ...base, elapsedMs: 5_000, attentionSeconds: 5 }).attention === true);
ok("remaining time is exact", attention.msUntilAttention(12_500) === 17_500);
ok("remaining time never goes negative", attention.msUntilAttention(45_000) === 0);
ok("default threshold is 30 seconds", attention.HINT_ATTENTION_SECONDS === 30);

const answerStateFor = attention.answerStateFor;
ok("no saved answer means unanswered", answerStateFor({ hasSavedAnswer: false }) === "unanswered");
ok("saved during a live paper means answered, not correct", answerStateFor({ hasSavedAnswer: true, isCorrect: null }) === "answered");
ok("released feedback marks a wrong answer", answerStateFor({ hasSavedAnswer: true, isCorrect: false }) === "incorrect");
ok("released feedback marks a right answer", answerStateFor({ hasSavedAnswer: true, isCorrect: true }) === "correct");

console.log("\nPanel behaviour");
const hintRules = {
  HINT_LEVEL_LABELS: { 1: "Gentle clue", 2: "More specific", 3: "Next step" },
  NO_HINT_MESSAGE: "No hint has been approved for this question yet.",
};
const uiStub = {
  Badge: (props) => React.createElement("span", { "data-badge": true }, props.children),
  Button: (props) => React.createElement("button", props, props.children),
};
const lucide = { Lightbulb: () => null, Loader2: () => null };
const { HintPanel } = compile("src/app/take-exam/[attemptId]/HintPanel.tsx", "scripts/__virtual_attention_panel.cjs", {
  "@/lib/examHints": hintRules,
  "@/lib/hintAttention": attention,
  "@/components/ui": uiStub,
  "lucide-react": lucide,
});

const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  return { ok: true, json: async () => ({ hints: [{ level: 1, text: "Think about which quantity the question is asking for." }] }) };
};

const flat = (child) =>
  Array.isArray(child) ? child.map(flat).join("") : typeof child === "string" || typeof child === "number" ? String(child) : "";
const buttons = (tree) => tree.root.findAllByType("button");
const label = (tree) => flat(buttons(tree)[0].props.children);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(props = {}) {
  let tree;
  act(() => {
    tree = TestRenderer.create(
      React.createElement(HintPanel, { attemptId: "attempt-1", token: "attempt-token", questionId: "q-1", initialHints: [], ...props }),
    );
  });
  return tree;
}

calls.length = 0;
const quiet = mount({ attentionSeconds: 0.3, answerState: "unanswered" });
ok("the hint is clickable immediately", buttons(quiet).length === 1 && label(quiet) === "Need a hint?");
ok("nothing is requested on mount", calls.length === 0);
await act(async () => { await sleep(1_250); });
await act(async () => {});
ok("after the threshold the button blinks an invitation", label(quiet) === "💡 HINT — NEED HELP?");
ok("the invitation is exposed as state, not styling alone", buttons(quiet)[0].props["data-attention"] === "true");
ok("an accessible live region announces it", /you have not answered this question yet/i.test(flat(quiet.root.findAll((n) => n.props?.role === "status").map((n) => n.props.children))));
ok("waiting requests no network traffic", calls.length === 0);
act(() => quiet.unmount());

const incorrect = mount({ answerState: "incorrect", attentionSeconds: 30 });
ok("an incorrect answer triggers attention at once", label(incorrect) === "💡 HINT — NEED HELP?" && buttons(incorrect)[0].props["data-attention"] === "true");
calls.length = 0;
await act(async () => { buttons(incorrect)[0].props.onClick(); });
ok("opening the hint stops asking", label(incorrect) === "Hide hint" && buttons(incorrect)[0].props["data-attention"] === "false");
ok("opening performs exactly one authorised read", calls.length === 1 && calls[0].url.startsWith("/api/exam/hint?"));
ok("that read is a GET with the attempt token", (calls[0].options?.method ?? "GET") === "GET" && calls[0].options.headers.Authorization === "Bearer attempt-token");
ok("no write, submit or save endpoint is touched", calls.every((call) => !/save|submit|answer|integrity/.test(call.url)));
await act(async () => { await sleep(400); });
ok("the pulse stays off once opened", label(incorrect) === "Hide hint");
act(() => incorrect.unmount());

const right = mount({ answerState: "correct", attentionSeconds: 0.2 });
await act(async () => { await sleep(900); });
ok("a correct answer is never prompted", label(right) === "Need a hint?" && buttons(right)[0].props["data-attention"] === "false");
act(() => right.unmount());

const answered = mount({ answerState: "answered", attentionSeconds: 0.2 });
await act(async () => { await sleep(900); });
ok("an answered question is not nagged", label(answered) === "Need a hint?");
act(() => answered.unmount());

const submitted = mount({ answerState: "unanswered", disabled: true, attentionSeconds: 0.1 });
await act(async () => { await sleep(400); });
ok("a submitted paper shows no hint control at all", submitted.root.findAllByType("button").length === 0);
act(() => submitted.unmount());

const timed = mount({ attentionSeconds: 0.2 });
await act(async () => { await sleep(900); });
ok("the invitation resets when the question changes", (() => {
  act(() => timed.unmount());
  const next = mount({ questionId: "q-2", attentionSeconds: 0.2 });
  const stillQuiet = label(next) === "Need a hint?";
  act(() => next.unmount());
  return stillQuiet;
})());

console.log("\nWiring and styling");
const panelSource = readFileSync("src/app/take-exam/[attemptId]/HintPanel.tsx", "utf8");
ok("the panel imports the attention rules", panelSource.includes("from \"@/lib/hintAttention\""));
ok("the panel renders the attention class", panelSource.includes("hint-attention"));
ok("the panel never calls the save or submit routes", !/api\/exam\/(save|submit)/.test(panelSource));
const examSource = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
ok("the examination passes the answer state to the hint", examSource.includes("answerState={answerStateFor("));
ok("unsaved typing counts as answered", examSource.includes("Boolean(current.saved_answer) || answerDirty"));
ok("the 30s timer is keyed to the question", /key=\{`hint-\$\{current\.question_id\}`\}/.test(examSource));
const css = readFileSync("src/app/globals.css", "utf8");
ok("a professional pulse animation is defined", css.includes("@keyframes evalora-hint-attention"));
ok("the pulse respects reduced motion", /prefers-reduced-motion[\s\S]{0,400}hint-attention/.test(css));
ok("the hint API still returns approved hints only", readFileSync("src/app/api/exam/hint/route.ts", "utf8").includes("loadPublishedHints"));
ok("the hint API never returns the answer key", !/correct_option_ids|answer_key|marking_scheme/.test(readFileSync("src/app/api/exam/hint/route.ts", "utf8")));

console.log(`\n${checks} checks passed.`);
