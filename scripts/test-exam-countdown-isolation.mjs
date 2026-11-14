import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = globalThis;
const takeExamPath = "src/app/take-exam/[attemptId]/TakeExamClient.tsx";
const source = readFileSync(takeExamPath, "utf8");
const ast = ts.createSourceFile(takeExamPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let countdownSource = "";
function findCountdown(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "ExamCountdown") {
    countdownSource = source.slice(node.getStart(ast), node.end);
  }
  ts.forEachChild(node, findCountdown);
}
findCountdown(ast);
assert.ok(countdownSource, "countdown remains a distinct child component in the exam client");
const isolatedSource = `import { useEffect, useRef, useState } from "react";\nimport { mmss } from "@/lib/utils";\n${countdownSource}\nexports.ExamCountdown = ExamCountdown;`;
const compiled = ts.transpileModule(isolatedSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const file = path.resolve("scripts/__virtual_exam_countdown.cjs");
const mod = new Module(file);
mod.filename = file;
mod.paths = Module._nodeModulePaths(path.dirname(file));
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename === file && request === "@/lib/utils") {
    return { mmss: (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` };
  }
  return originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(compiled, file); } finally { Module._load = originalLoad; }
const { ExamCountdown } = mod.exports;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let siblingRenders = 0;
function StableQuestion() { siblingRenders += 1; return React.createElement("p", null, "Question content stays mounted"); }
const deadline = new Date(Date.now() + 30_000).toISOString();
function Harness({ paused = false }) {
  return React.createElement(React.Fragment, null,
    React.createElement(StableQuestion),
    React.createElement(ExamCountdown, { deadline, serverOffsetMs: 0, paused }),
  );
}
let tree;
await act(async () => { tree = TestRenderer.create(React.createElement(Harness)); });
const initialSiblingRenders = siblingRenders;
const timerLabel = () => tree.root.findByProps({ role: "timer" }).props["aria-label"];
assert.match(timerLabel(), /Time remaining: 00:30/);
await act(async () => { await wait(1100); });
assert.equal(siblingRenders, initialSiblingRenders, "countdown ticks must not rerender stable question content");
assert.match(timerLabel(), /00:2[89]/, "isolated countdown should update its displayed time");
await act(async () => { tree.update(React.createElement(Harness, { paused: true })); await wait(1100); });
const pausedLabel = timerLabel();
await act(async () => { await wait(1100); });
assert.equal(timerLabel(), pausedLabel, "paused countdown should remain visually frozen");
assert.equal(siblingRenders, initialSiblingRenders + 1, "question content should rerender only when its parent pause state changes");
await act(async () => { tree.unmount(); });
console.log("5 examination countdown isolation checks passed");
