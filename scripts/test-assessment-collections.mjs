// Actual server list pages with mocked infrastructure; no production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let checks = 0;
for (const collection of ['exams', 'quizzes']) {
  let operations = [], failed = false, tree;
  const row = { id: 'record', title: 'Mathematics', status: 'published', settings: {}, created_at: '', updated_at: '', quiz_questions: [{ count: 25 }], quiz_sessions: [{ count: 7 }], exam_candidates: [{ count: 12 }], submitted_attempts: [{ count: 9 }], quizzes: { title: 'Paper' } };
  const query = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => resolve({ data: failed ? null : [row], count: 40, error: failed ? { message: 'unavailable' } : null });
    return (...args) => { operations.push([key, ...args]); return query; };
  } });
  const filename = path.resolve(`scripts/__${collection}_collection.cjs`);
  const ui = Object.fromEntries(['Badge', 'ButtonLink', 'Card', 'EmptyState', 'PageTitle'].map(name => [name, props => React.createElement('div', props, props.children)]));
  const deps = {
    '@/components/FormButton': { FormButton: props => React.createElement('button', props, props.children) },
    '@/lib/pagination': { pageNumber: value => Math.max(1, Number(value) || 1) },
    '@/components/dashboard/CollectionToolbar': { CollectionToolbar: props => React.createElement('aside', { 'data-total': props.total, 'data-failed': props.failed }) },
    '@/components/ui': ui,
    '@/lib/auth': { requireUser: async () => ({}), activeOrg: () => ({ id: 'tenant' }) },
    '@/lib/supabase/server': { createClient: async () => ({ from: table => { assert.equal(table, collection); return query; } }) },
    '@/lib/utils': { fmtDateTime: () => '' },
    'next/link': { default: props => React.createElement('a', props, props.children) },
    './actions': {},
  };
  const m = new Module(filename); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const old = Module._load;
  Module._load = function(req, parent) { if (parent?.filename === filename && req in deps) return deps[req]; return old.apply(this, arguments); };
  try { m._compile(ts.transpileModule(readFileSync(`src/app/dashboard/${collection}/page.tsx`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename); }
  finally { Module._load = old; }
  await act(async () => { tree = TestRenderer.create(await m.exports.default({ searchParams: Promise.resolve({ page: '2', q: 'Math', status: collection === 'exams' ? 'open' : 'draft', sort: 'title' }) })); });
  assert.deepEqual(operations.find(op => op[0] === 'range'), ['range', 18, 35]); checks++;
  assert.ok(operations.some(op => op[0] === 'eq' && op[1] === 'organization_id' && op[2] === 'tenant')); checks++;
  assert.ok(operations.some(op => op[0] === 'ilike' && op[1] === 'title' && op[2] === '%Math%')); checks++;
  assert.ok(operations.some(op => op[0] === 'order' && op[1] === 'title')); checks++;
  assert.ok(operations.some(op => op[0] === 'order' && op[1] === 'id')); checks++;
  assert.ok(operations.some(op => op[0] === 'eq' && op[1] === 'status')); checks++;
  assert.equal(tree.root.findByType('aside').props['data-total'], 40); checks++;
  const rendered = JSON.stringify(tree.toJSON());
  if (collection === 'quizzes') { assert.match(rendered, /25/); assert.match(rendered, /7/); checks += 2; }
  else { assert.match(rendered, /12/); assert.match(rendered, /9/); assert.ok(operations.some(op => op[0] === 'neq' && op[1] === 'submitted_attempts.status' && op[2] === 'in_progress')); checks += 3; }
  await act(() => tree.unmount());
  failed = true; operations = [];
  await act(async () => { tree = TestRenderer.create(await m.exports.default({ searchParams: Promise.resolve({ status: 'invalid', sort: 'injection' }) })); });
  assert.equal(tree.root.findByType('aside').props['data-failed'], true); checks++;
  assert.ok(!operations.some(op => op[0] === 'eq' && op[1] === 'status')); checks++;
  assert.ok(operations.some(op => op[0] === 'order' && op[1] === (collection === 'exams' ? 'created_at' : 'updated_at'))); checks++;
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /No examinations yet|No quizzes yet/); checks++;
  await act(() => tree.unmount());
}
console.log(`${checks} checks passed: tenant-scoped assessment lists, filters, pagination, count aggregates, stable sorting and query failures (mock DB).`);
