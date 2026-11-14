// On-demand import identities: real route, mocked authorization/database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const filename = path.resolve('scripts/__import_identities.cjs');
let ctx = null, pages = [], reads = [], failure = false;
const roles = ['owner', 'admin', 'teacher', 'organizer'];
const deps = {
  '@/lib/auth': { CREATOR_ROLES: roles, getSessionContext: async () => ctx, activeOrg: c => c.org, can: (c, id, allowed) => c.org?.id === id && allowed.includes(c.org.role) },
  '@/lib/studentImport': { identityKey: (name, dob) => `${name.toLowerCase()}|${dob ?? ''}` },
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
  '@/lib/supabase/server': { createClient: async () => ({ from: table => {
    assert.equal(table, 'students');
    const operations = []; reads.push(operations);
    const chain = new Proxy({}, { get(_, key) {
      if (key === 'then') return resolve => resolve({ data: pages.shift() ?? [], error: failure ? { message: 'failure' } : null });
      return (...args) => { operations.push([key, ...args]); return chain; };
    } }); return chain;
  } }) },
};
const m = new Module(filename); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
const old = Module._load;
Module._load = function(req, parent) { if (parent?.filename === filename && req in deps) return deps[req]; return old.apply(this, arguments); };
try { m._compile(ts.transpileModule(readFileSync('src/app/api/students/import/identities/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename); } finally { Module._load = old; }
const { GET } = m.exports;
const session = (role = 'teacher') => ({ profile: { status: 'active', platform_role: 'user' }, org: { id: 'tenant', role, status: 'active' } });
assert.equal((await GET()).status, 401);
for (const c of [session('student'), session('corrector'), { ...session(), org: null }, { ...session(), tenantDenied: true }, { ...session(), profile: { status: 'suspended' } }, { ...session(), org: { id: 'tenant', role: 'teacher', status: 'suspended' } }]) { ctx = c; assert.equal((await GET()).status, 403); }
assert.equal(reads.length, 0, 'denied callers never read identities');
ctx = session();
const student = { id: 'student', full_name: 'Ada', email: ' ADA@EXAMPLE.TEST ', student_ref: ' REF ', date_of_birth: '2010-01-01' };
pages = [Array.from({ length: 1000 }, () => student), [student]];
let result = await GET();
assert.equal(result.status, 200); assert.equal(result.body.organization_id, 'tenant');
assert.equal(result.body.existing.refs.length, 1001); assert.equal(result.body.existing.refs[0], 'ref');
assert.equal(result.body.existing.emails[0], 'ada@example.test');
assert.equal(result.body.existing.nameDob[0], 'ada|2010-01-01');
assert.equal(result.headers['Cache-Control'], 'private, no-store');
assert.equal(reads.length, 2);
assert.deepEqual(reads[1].find(op => op[0] === 'range'), ['range', 1000, 1999]);
for (const operations of reads) assert.ok(operations.some(op => op[0] === 'eq' && op[1] === 'organization_id' && op[2] === 'tenant'));
failure = true; result = await GET(); assert.equal(result.status, 503); assert.equal(result.body.existing, undefined);
console.log('20 checks passed: on-demand import identities enforce tenant/role/status, explicit paging, normalization, no-store and fail-closed loading.');
