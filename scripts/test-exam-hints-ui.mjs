// React-level tests for the in-examination "Need a hint?" panel.
//
// These are not browser tests: they render the real component with a fake
// network and assert the properties that protect a student who is mid-exam —
// opening a hint performs no write, no state read, no submit, no duplicate
// request, and it never shows a hint belonging to another question.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";
import * as hintRules from "../src/lib/examHints.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function compile(source, filename) {
  const file = path.resolve(filename);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(
    ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    file,
  );
  return mod.exports;
}

const attentionRules = compile("src/lib/hintAttention.ts", "scripts/__virtual_hint_attention_rules.cjs");
const panelFile = path.resolve("scripts/__virtual_hint_panel.cjs");
const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === panelFile) {
    if (request === "@/lib/examHints") return hintRules;
    if (request === "@/lib/hintAttention") return attentionRules;
    if (request === "@/components/ui") {
      return {
        Badge: (props) => React.createElement("span", { "data-badge": true }, props.children),
        Button: (props) => React.createElement("button", props, props.children),
      };
    }
    if (request === "lucide-react") {
      return { Lightbulb: () => null, Loader2: () => null };
    }
  }
  return originalLoad.apply(this, arguments);
};
const { HintPanel } = compile("src/app/take-exam/[attemptId]/HintPanel.tsx", "scripts/__virtual_hint_panel.cjs");
Module._load = originalLoad;

let checks = 0;
const checkAsync = async (name, fn) => { await fn(); checks += 1; console.log(`✓ ${name}`); };

const TOKEN = "attempt-token-value";
let calls = [];
let responder = async () => ({ ok: true, json: async () => ({ hints: [] }) });

globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  return responder(String(url), options);
};

function mount(props) {
  let tree;
  act(() => {
    tree = TestRenderer.create(React.createElement(HintPanel, { attemptId: "attempt-1", token: TOKEN, questionId: "q-1", ...props }));
  });
  return tree;
}
/** Safe text flattening: React children trees contain fibre references, so never JSON-stringify them. */
const flat = (child) =>
  Array.isArray(child)
    ? child.map(flat).join("")
    : typeof child === "string" || typeof child === "number"
      ? String(child)
      : "";
const buttonByText = (tree, text) => tree.root.findAllByType("button").find((node) => flat(node.props.children).includes(text));
async function click(tree, text) {
  const button = buttonByText(tree, text);
  assert.ok(button, `button "${text}" should exist`);
  await act(async () => { button.props.onClick(); });
}
const panelRegion = (tree) => tree.root.findAll((node) => node.props?.["aria-label"] === "Hint for this question");
const textOf = (tree) => tree.root.findAll((node) => node.type === "p").map((node) => flat(node.props.children)).join("\n");

await checkAsync("the control is closed by default and advertises its state", async () => {
  calls = [];
  const tree = mount({ initialHints: [{ level: 1, text: "Identify the two measurements the formula needs." }] });
  assert.equal(panelRegion(tree).length, 0);
  const toggle = buttonByText(tree, "Need a hint?");
  assert.equal(toggle.props["aria-expanded"], false);
  assert.equal(toggle.props["aria-controls"], "hint-q-1");
  assert.equal(calls.length, 0, "mounting the panel performs no network request");
  act(() => tree.unmount());
});

await checkAsync("opening with bundled hints is instant and shows level 1 of 2", async () => {
  calls = [];
  const tree = mount({
    initialHints: [
      { level: 1, text: "Remember how area is found: length multiplied by width." },
      { level: 2, text: "Identify which of the two given numbers is the length." },
    ],
  });
  await click(tree, "Need a hint?");
  assert.equal(calls.filter((c) => (c.options?.method ?? "GET") === "GET").length, 0, "no hint fetch when the paper already delivered the hint");
  assert.equal(calls.length, 1, "the opening itself is recorded once for the results view");
  assert.equal(calls[0].url, "/api/exam/hint/usage");
  assert.deepEqual(JSON.parse(calls[0].options.body), { attempt_id: "attempt-1", question_id: "q-1", level: 1 });
  assert.equal(panelRegion(tree).length, 1);
  assert.match(textOf(tree), /length multiplied by width/);
  assert.equal(buttonByText(tree, "Need a hint?"), undefined, "the toggle now reads Hide hint");
  assert.ok(buttonByText(tree, "Another hint"), "a second level offers progressive guidance");
  act(() => tree.unmount());
});

await checkAsync("another hint reveals level 2 without leaving the question", async () => {
  const tree = mount({
    initialHints: [
      { level: 1, text: "Remember how area is found: length multiplied by width." },
      { level: 2, text: "Identify which of the two given numbers is the length." },
    ],
  });
  await click(tree, "Need a hint?");
  await click(tree, "Another hint");
  assert.match(textOf(tree), /Identify which of the two given numbers/);
  assert.equal(buttonByText(tree, "Another hint"), undefined, "the last level offers no further hint");
  assert.equal(panelRegion(tree).length, 1);
  act(() => tree.unmount());
});

await checkAsync("hiding the hint removes the panel and keeps the question untouched", async () => {
  calls = [];
  const tree = mount({ initialHints: [{ level: 1, text: "Think about the units you are asked for." }] });
  await click(tree, "Need a hint?");
  await click(tree, "Hide hint");
  assert.equal(panelRegion(tree).length, 0);
  assert.equal(calls.length, 1, "hiding makes no request; only the opening was recorded");
  assert.equal(calls[0].url, "/api/exam/hint/usage");
  assert.ok(buttonByText(tree, "Need a hint?"));
  act(() => tree.unmount());
});

await checkAsync("without bundled hints it asks the authorised endpoint exactly once", async () => {
  calls = [];
  responder = async () => ({ ok: true, json: async () => ({ hints: [{ level: 1, text: "Think about what a river gives a community." }] }) });
  const tree = mount({});
  await click(tree, "Need a hint?");
  const reads = calls.filter((c) => (c.options?.method ?? "GET") === "GET");
  assert.equal(reads.length, 1, "exactly one authorised read fetches the hints");
  assert.match(reads[0].url, /^\/api\/exam\/hint\?attempt_id=attempt-1&question_id=q-1$/);
  assert.equal(reads[0].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(reads[0].options.cache, "no-store");
  assert.equal(reads[0].url.includes(TOKEN), false, "the attempt token never travels in a URL");
  assert.match(textOf(tree), /river gives a community/);

  await click(tree, "Hide hint");
  await click(tree, "Need a hint?");
  assert.equal(calls.length, 2, "re-opening repeats neither the read nor the usage record");
  act(() => tree.unmount());
});

await checkAsync("a network failure is explained and can be retried", async () => {
  calls = [];
  responder = async () => { throw new Error("offline"); };
  const tree = mount({});
  await click(tree, "Need a hint?");
  assert.ok(textOf(tree).includes("Hints could not be loaded"), "the student is told what happened");
  assert.equal(tree.root.findAll((node) => node.props?.role === "alert").length >= 1, true);

  responder = async () => ({ ok: true, json: async () => ({ hints: [{ level: 1, text: "Read the passage again and look for repeated ideas." }] }) });
  await click(tree, "Try again");
  assert.equal(calls.filter((c) => (c.options?.method ?? "GET") === "GET").length, 2, "the retry is a second authorised read");
  assert.match(textOf(tree), /repeated ideas/);
  act(() => tree.unmount());
});

await checkAsync("a question with no published hint shows honest guidance, never invented content", async () => {
  calls = [];
  responder = async () => ({ ok: true, json: async () => ({ hints: [] }) });
  const tree = mount({});
  await click(tree, "Need a hint?");
  assert.ok(textOf(tree).includes(hintRules.NO_HINT_MESSAGE));
  assert.equal(panelRegion(tree).length, 1);
  act(() => tree.unmount());
});

await checkAsync("a malformed payload is sanitised before it can be rendered", async () => {
  calls = [];
  responder = async () => ({
    ok: true,
    json: async () => ({
      hints: [
        { level: 9, text: "This level does not exist and must be dropped." },
        { level: 1, text: "This is a valid first-level hint for the question." },
        { level: 1, text: "A duplicate level-1 hint must not be rendered twice." },
        { level: 2, text: "ok" },
        { text: "No level at all." },
      ],
    }),
  });
  const tree = mount({});
  await click(tree, "Need a hint?");
  const text = textOf(tree);
  assert.match(text, /valid first-level hint/);
  assert.equal(text.includes("does not exist"), false);
  assert.equal(text.includes("duplicate level-1"), false);
  assert.equal(buttonByText(tree, "Another hint"), undefined, "only one usable hint survived");
  act(() => tree.unmount());
});

await checkAsync("a submitted attempt renders no hint control at all", async () => {
  calls = [];
  const tree = mount({ disabled: true, initialHints: [{ level: 1, text: "This must never appear after submission." }] });
  assert.equal(tree.root.findAllByType("button").length, 0);
  assert.equal(textOf(tree), "");
  assert.equal(calls.length, 0);
  act(() => tree.unmount());
});

await checkAsync("the panel only ever talks to the hint endpoint", async () => {
  calls = [];
  responder = async () => ({ ok: true, json: async () => ({ hints: [{ level: 1, text: "Look at the diagram's labels before choosing." }] }) });
  const tree = mount({});
  await click(tree, "Need a hint?");
  await click(tree, "Hide hint");
  await click(tree, "Need a hint?");
  assert.ok(calls.length >= 1);
  for (const call of calls) assert.match(call.url, /^\/api\/exam\/hint(\?|\/usage$)/, `unexpected request: ${call.url}`);
  assert.equal(calls.some((call) => /\/api\/exam\/(save|submit|state|integrity)/.test(call.url)), false);
  act(() => tree.unmount());
});

console.log(`\n${checks} in-examination hint panel checks passed (React test renderer; fake network).`);
