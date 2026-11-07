// Unit checks for drag-and-drop state rules (src/lib/matchDnd.ts). Pure logic, no DB.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/lib/matchDnd.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const dir = mkdtempSync(path.join(tmpdir(), 'match-dnd-'));
const file = path.join(dir, 'matchDnd.cjs');
writeFileSync(file, source);
const m = (await import(file)).default ?? (await import(file));
const {placeChip, clearPlacement, bankChips, moveItem, toPairs, normaliseMatchMode, removeChip} = m;

// Match mode: each choice (right) is used once; dropping it on a new row moves it.
let s = {};
s = placeChip(s, 'match', 'B', 'a_1 = 5, u_(n+1) = u_n + 3');
s = placeChip(s, 'match', 'C', 'a_1 = 2, u_(n+1) = 3u_n');
assert.deepEqual(s, {'a_1 = 5, u_(n+1) = u_n + 3': 'B', 'a_1 = 2, u_(n+1) = 3u_n': 'C'});
s = placeChip(s, 'match', 'B', 'a_1 = 2, u_(n+1) = 3u_n');
assert.deepEqual(s, {'a_1 = 2, u_(n+1) = 3u_n': 'B'}, 'moving a choice clears its old row');
assert.deepEqual(bankChips(s, 'match', ['A', 'B', 'C', 'D']), ['A', 'C', 'D'], 'placed choices leave the bank');

// Sort mode: tiles may share a category; a tile is in one category only.
let t = {};
t = placeChip(t, 'sort', 'A', 'Arithmetic');
t = placeChip(t, 'sort', 'B', 'Arithmetic');
t = placeChip(t, 'sort', 'A', 'Geometric');
assert.deepEqual(t, {A: 'Geometric', B: 'Arithmetic'}, 'a tile moves, categories may repeat');
assert.deepEqual(bankChips(t, 'sort', ['A', 'B', 'C']), ['C'], 'placed tiles leave the bank');
assert.deepEqual(clearPlacement(t, 'B'), {A: 'Geometric'});

// Pairs keep only placed rows and stay in row order.
assert.deepEqual(toPairs({x: '', a: 'B', b: 'C'}), [{left: 'a', right: 'B'}, {left: 'b', right: 'C'}]);

// Ordering moves.
assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
assert.deepEqual(moveItem(['a', 'b'], 1, 1), ['a', 'b']);
assert.deepEqual(moveItem(['a', 'b'], 5, 0), ['a', 'b'], 'out of range is a no-op');

// Unknown or missing mode defaults to match.
assert.equal(normaliseMatchMode('sort'), 'sort');
assert.equal(normaliseMatchMode(undefined), 'match');
assert.equal(normaliseMatchMode('anything'), 'match');

assert.deepEqual(removeChip({a: 'B', b: 'C'}, 'match', 'B'), {b: 'C'}, 'match: dragging a choice back clears its row');
assert.deepEqual(removeChip({A: 'X', B: 'X'}, 'sort', 'A'), {B: 'X'}, 'sort: dragging a tile back removes that tile');

console.log('PASS: drag-and-drop state rules (match, sort, ordering, removal, payload).');
