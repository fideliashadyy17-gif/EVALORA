// Behavioral checks for bounded pagination and honest server-action pending UI.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function compile(src, deps = {}) {
  const filename = path.resolve('scripts/__performance_' + path.basename(src) + '.cjs');
  const m = new Module(filename); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const old = Module._load;
  Module._load = function(req, parent) { if (parent?.filename === filename && req in deps) return deps[req]; return old.apply(this, arguments); };
  try { m._compile(ts.transpileModule(readFileSync(src, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename); return m.exports; }
  finally { Module._load = old; }
}
const { pageNumber, pageHref } = compile('src/lib/pagination.ts');
for (const input of [undefined, '', '-1', '2.5', 'Infinity', '1e9', '99999999999999999']) assert.equal(pageNumber(input), 1);
assert.equal(pageNumber('2'), 2);
assert.equal(pageNumber('999999'), 100000);
assert.equal(pageHref('/questions', { q: 'a & b', status: 'draft', page: '2', e: 'old' }, 3), '/questions?q=a+%26+b&status=draft&page=3');
let pending = false;
const { FormButton } = compile('src/components/FormButton.tsx', { 'react-dom': { useFormStatus: () => ({ pending }) } });
let tree;
await act(() => { tree = TestRenderer.create(React.createElement(FormButton, { type: 'submit' }, 'Save')); });
assert.equal(tree.root.findByType('button').props.disabled, false);
pending = true;
await act(() => { tree.update(React.createElement(FormButton, { type: 'submit' }, 'Save')); });
assert.equal(tree.root.findByType('button').props.disabled, true);
assert.equal(tree.root.findByType('button').props['aria-busy'], true);
assert.match(JSON.stringify(tree.toJSON()), /Processing/);
assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Saved|Success/);
await act(() => { tree.update(React.createElement(FormButton, { type: 'button' }, 'Cancel')); });
assert.equal(tree.root.findByType('button').props.disabled, false);
await act(() => tree.unmount());
console.log('16 checks passed: bounded/filter-preserving pagination and server-confirmed pending semantics.');
