// Presentation clock regressions: real React component, controlled clock/timers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const filename = path.resolve('scripts/__exam_countdown.cjs');
const m = new Module(filename); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
const originalLoad = Module._load;
Module._load = function(req, parent) {
  if (parent?.filename === filename && req === '@/lib/utils') return { mmss: seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` };
  return originalLoad.apply(this, arguments);
};
try { m._compile(ts.transpileModule(readFileSync('src/components/exam/ExamCountdown.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename); }
finally { Module._load = originalLoad; }
const { ExamCountdown } = m.exports;
const originalNow = Date.now, originalWindow = globalThis.window;
let now = 1_800_000_000_000, tick, focus, cleared = 0, parentRenders = 0;
Date.now = () => now;
globalThis.window = { setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { cleared++; }, addEventListener: (_, fn) => { focus = fn; }, removeEventListener: () => { focus = null; } };
let tree;
function Parent(props) { parentRenders++; return React.createElement(ExamCountdown, props); }
const props = { deadline: new Date(now + 600_000).toISOString(), serverOffsetMs: 0, paused: false };
const text = () => JSON.stringify(tree.toJSON());
try {
  await act(() => { tree = TestRenderer.create(React.createElement(Parent, props)); });
  assert.match(text(), /10:00/);
  now += 1000; await act(() => tick()); assert.match(text(), /9:59/);
  assert.equal(parentRenders, 1, 'clock ticks do not rerender the parent answer workspace');
  await act(() => tree.update(React.createElement(Parent, { ...props, paused: true })));
  assert.match(text(), /Time paused/);
  now += 120_000; await act(() => tick()); assert.match(text(), /9:59/, 'outage freezes remaining time');
  const resumed = { deadline: new Date(now + 599_000).toISOString(), serverOffsetMs: 0, paused: false };
  await act(() => tree.update(React.createElement(Parent, resumed))); assert.match(text(), /9:59/);
  now += 2000; await act(() => focus()); assert.match(text(), /9:57/, 'focus catches up using absolute time');
  await act(() => tree.update(React.createElement(Parent, { ...resumed, serverOffsetMs: 60_000 }))); assert.match(text(), /8:57/, 'server offset is applied');
  await act(() => tree.update(React.createElement(Parent, { deadline: new Date(now - 1000).toISOString(), serverOffsetMs: 0, paused: false }))); assert.match(text(), /0:00/);
  assert.doesNotMatch(text(), /submitted|success/i, 'expiry is presentation only');
  await act(() => tree.update(React.createElement(Parent, { deadline: 'invalid', serverOffsetMs: 0, paused: false }))); assert.match(text(), /—/);
  await act(() => tree.unmount()); assert.equal(cleared, 1); assert.equal(focus, null);
  console.log('13 checks passed: isolated countdown, server offset, pause/resume, focus catch-up, expiry and cleanup.');
} finally { Date.now = originalNow; globalThis.window = originalWindow; }
