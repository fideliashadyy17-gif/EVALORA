// Server page/query contract checks; no production data or real Supabase calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [];
let rosterError = null;
function query(table) {
  const call = { table, operations: [] }; calls.push(call);
  const chain = new Proxy({}, { get(_, key) {
    if (key === 'then') return (resolve) => resolve({
      data: table === 'students' ? [] : table === 'academic_years' ? [{ id: 'year', name: 'Current', is_current: true }] : [],
      count: table === 'students' ? 91 : null, error: table === 'students' ? rosterError : null,
    });
    return (...args) => { call.operations.push([key, ...args]); return chain; };
  } });
  return chain;
}
const filename = path.resolve('scripts/__student_pagination.cjs');
const ui = Object.fromEntries(['Badge', 'Button', 'ButtonLink', 'Card', 'EmptyState', 'Field', 'Input', 'PageTitle', 'Select'].map(name => [name, props => React.createElement(name === 'ButtonLink' ? 'a' : 'div', props, props.children)]));
const deps = {
  '@/lib/pagination': {
    pageNumber: value => /^\d+$/.test(value ?? '') ? Math.min(100000, Math.max(1, Number(value))) : 1,
    pageHref: (base, values, page) => base + '?' + new URLSearchParams({ ...values, page: String(page) }),
  },
  '@/components/ui': ui,
  '@/lib/auth': { requireUser: async () => ({}), activeOrg: () => ({ id: 'tenant', name: 'School' }), can: () => false },
  '@/lib/supabase/server': { createClient: async () => ({ from: query }) },
  '@/lib/studentImport': { identityKey: () => '' },
  '@/components/StudentImportWizard': { StudentImportWizard: () => null },
  './StudentRegistrationForm': { StudentRegistrationForm: () => null },
  '../academics/actions': {}, './actions': {},
};
const m = new Module(filename); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
const old = Module._load;
Module._load = function(req, parent) { if (parent?.filename === filename && req in deps) return deps[req]; return old.apply(this, arguments); };
try { m._compile(ts.transpileModule(readFileSync('src/app/dashboard/students/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename); }
finally { Module._load = old; }
async function render(params) {
  calls.length = 0;
  let tree;
  await act(async () => { tree = TestRenderer.create(await m.exports.default({ searchParams: Promise.resolve(params) })); });
  return tree;
}
let tree = await render({ page: '2', class: 'class-a', status: 'active', q: 'Ada,(x)' });
const roster = calls.find(c => c.table === 'students');
assert.ok(roster.operations.find(op => op[0] === 'select')[1].includes('!inner'));
assert.deepEqual(roster.operations.find(op => op[0] === 'range'), ['range', 30, 59]);
for (const [column, value] of [['organization_id', 'tenant'], ['student_enrollments.class_id', 'class-a'], ['student_enrollments.status', 'active'], ['status', 'active']]) assert.ok(roster.operations.some(op => op[0] === 'eq' && op[1] === column && op[2] === value));
assert.ok(!roster.operations.find(op => op[0] === 'or')[1].includes('(x)'));
assert.equal(calls.filter(c => c.table === 'students').length, 1, 'read-only role does not receive import identity payload');
assert.equal(calls.filter(c => c.table === 'import_batches').length, 0);
assert.equal(tree.root.findAllByType('a').filter(a => /page=/.test(a.props.href)).length, 2);
await act(() => tree.unmount());
tree = await render({});
assert.ok(!calls.find(c => c.table === 'students').operations.find(op => op[0] === 'select')[1].includes('!inner'), 'unenrolled students remain visible without a class filter');
await act(() => tree.unmount());
rosterError = { message: 'unavailable' };
tree = await render({});
assert.equal(tree.root.findAll(node => node.props?.role === 'alert').length, 1);
assert.doesNotMatch(JSON.stringify(tree.toJSON()), /No students yet/);
await act(() => tree.unmount());
console.log('13 checks passed: tenant-scoped roster pagination, enrollment filters, read-only minimization and honest query errors (mock DB).');
