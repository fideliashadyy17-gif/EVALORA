/**
 * Candidate calculator: the safe expression engine and the exam-page dialog.
 *
 * The engine is exercised directly (no `eval`, no `new Function`) and the
 * launcher is rendered with React so the checks cover what a candidate
 * actually touches: opening the panel, typing an expression and reading the
 * result, then closing it without touching the answer.
 */
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// react-test-renderer has no DOM. The dialog only needs document-level key
// listeners, so a tiny event registry is enough to exercise Escape.
const listeners = new Map();
const windowListeners = new Map();
const store = new Map();
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  sessionStorage: {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  },
  addEventListener(type, fn) {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    windowListeners.get(type)?.delete(fn);
  },
  dispatchEvent(event) {
    for (const fn of windowListeners.get(event.type) ?? []) fn(event);
    return true;
  },
};
globalThis.document = {
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    listeners.get(type)?.delete(fn);
  },
  dispatchEvent(event) {
    for (const fn of listeners.get(event.type) ?? []) fn(event);
    return true;
  },
};
const file = path.resolve("scripts/__virtual_calculator.cjs");
const js = ts.transpileModule(readFileSync("src/components/Calculator.tsx", "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename === file && request === "@/lib/utils") {
    return { cn: (...args) => args.filter(Boolean).join(" ") };
  }
  return originalLoad.apply(this, arguments);
};
const virtual = new Module(file);
virtual.filename = file;
virtual.paths = Module._nodeModulePaths(path.dirname(file));
virtual._compile(js, file);
Module._load = originalLoad;
const { evaluateExpression, formatResult, CalculatorLauncher } = virtual.exports;

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}`);
  }
}
const button = (tree, label) =>
  tree.root.findAll((node) => node.type === "button" && node.props["aria-label"] === label)[0];

await act(() => {
  check("arithmetic obeys precedence", evaluateExpression("2+3*4") === 14);
  check("implicit multiplication works", evaluateExpression("2(3+4)") === 14);
  check("scientific functions and powers work", evaluateExpression("sqrt(81)+2^3") === 17);
  check("angles are in degrees", Math.abs(evaluateExpression("sin(30)") - 0.5) < 1e-12);
  check("division by zero is shown as infinity, never a crash", formatResult(1 / 0) === "∞");
  check("unknown names are rejected", (() => {
    try { evaluateExpression("alert(1)"); return false; } catch { return true; }
  })());
});

let tree;
await act(() => {
  tree = TestRenderer.create(React.createElement(CalculatorLauncher));
});
check("the launcher is a labelled button", Boolean(button(tree, "Open the calculator")));
await act(() => button(tree, "Open the calculator").props.onClick());
const panel = tree.root.findAll((node) => node.props["data-testid"] === "calculator-panel")[0];
check("opening it shows a non-modal floating dialog", Boolean(panel) && panel.props.role === "dialog" && panel.props["aria-modal"] === "false");
check("the panel is marked draggable and has a drag handle",
  panel?.props["data-draggable"] === "true" &&
  tree.root.findAll((node) => node.props["data-testid"] === "calculator-drag-handle").length === 1);
check("it exposes eight resize handles",
  tree.root.findAll((node) => String(node.props["data-testid"] ?? "").startsWith("calculator-resize-")).length === 8);
check("the panel has a bounded persisted size",
  panel?.props.style?.width === 336 && panel?.props.style?.height === 520);
const handle = tree.root.findAll((node) => node.props["data-testid"] === "calculator-drag-handle")[0];
const beforeX = panel.props.style.left;
await act(() => handle.props.onPointerDown({
  preventDefault() {},
  clientX: 100,
  clientY: 100,
  target: { closest: () => null },
}));
await act(() => window.dispatchEvent({ type: "pointermove", clientX: 140, clientY: 130 }));
await act(() => window.dispatchEvent({ type: "pointerup" }));
const dragged = tree.root.findAll((node) => node.props["data-testid"] === "calculator-panel")[0];
check("dragging moves the panel (and keeps it inside the viewport)",
  dragged.props.style.left !== beforeX && dragged.props.style.left >= 8 && dragged.props.style.top >= 8);
const southEast = tree.root.findAll((node) => node.props["data-testid"] === "calculator-resize-se")[0];
await act(() => southEast.props.onPointerDown({ preventDefault() {}, clientX: 300, clientY: 300 }));
await act(() => window.dispatchEvent({ type: "pointermove", clientX: 360, clientY: 380 }));
await act(() => window.dispatchEvent({ type: "pointerup" }));
const resized = tree.root.findAll((node) => node.props["data-testid"] === "calculator-panel")[0];
check("the corner handle resizes the panel",
  resized.props.style.width > 336 && resized.props.style.height > 520);
const input = tree.root.findAll((node) => node.props["aria-label"] === "Calculator expression")[0];
check("the dialog carries a usable expression field", Boolean(input));
await act(() => input.props.onChange({ target: { value: "12/4" } }));
await act(() => button(tree, "Equals").props.onClick());
check("typing 12/4 and pressing equals shows 3", tree.root.findAll((node) => node.props.children === "= 3").length > 0);
await act(() => button(tree, "Minimize the calculator").props.onClick());
check("minimizing removes the panel but leaves a restore control",
  tree.root.findAll((node) => node.props["data-testid"] === "calculator-panel").length === 0 &&
  Boolean(button(tree, "Restore the calculator")));
await act(() => button(tree, "Restore the calculator").props.onClick());
check("reopening after minimize keeps the calculation",
  tree.root.findAll((node) => node.props["aria-label"] === "Calculator expression")[0]?.props.value === "12/4");
await act(() => button(tree, "Close the calculator").props.onClick());
check("closing the dialog removes it from the page",
  tree.root.findAll((node) => node.props["data-testid"] === "calculator-panel").length === 0);
await act(() => button(tree, "Open the calculator").props.onClick());
check("reopening after close keeps the calculation",
  tree.root.findAll((node) => node.props["aria-label"] === "Calculator expression")[0]?.props.value === "12/4");
await act(() => button(tree, "Close the calculator").props.onClick());

await act(() => button(tree, "Open the calculator").props.onClick());
await act(() => {
  document.dispatchEvent({ type: "keydown", key: "Escape" });
});
check("Escape closes the calculator",
  tree.root.findAll((node) => node.props["data-testid"] === "calculator-panel").length === 0);
await act(() => button(tree, "Open the calculator").props.onClick());
check("Escape never clears the candidate's calculation",
  tree.root.findAll((node) => node.props["aria-label"] === "Calculator expression")[0]?.props.value === "12/4");
await act(() => button(tree, "Close the calculator").props.onClick());
await act(() => tree.unmount());

const examUi = readFileSync("src/app/take-exam/[attemptId]/TakeExamClient.tsx", "utf8");
check("the sticky exam header offers the premium calculator",
  /questions\.some\(\(question\) => question\.calculator\) && \(\s*<CalculatorLauncher[\s\S]*?draggable=\{experience\.floatingCalculator\}/.test(examUi));

console.log(`\n${passed} calculator checks passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed === 0 ? 0 : 1);
