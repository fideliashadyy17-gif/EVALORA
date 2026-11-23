// Exercises the Super Admin organization credential actions with mocked Auth/DB clients.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

function compileModule(source, destination, dependencies = {}) {
  const filename = path.resolve(destination);
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function (request, parent) {
    if (parent?.filename === filename && request in dependencies) return dependencies[request];
    return originalLoad.apply(this, arguments);
  };
  try {
    compiled._compile(ts.transpileModule(readFileSync(source, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
    return compiled.exports;
  } finally {
    Module._load = originalLoad;
  }
}
const accountRules = compileModule('src/lib/organizationAccounts.ts', 'scripts/__admin_org_account_rules.cjs');

const orgId = '0a400000-0000-4000-8000-000000000001';
const memberId = '0b400000-0000-4000-8000-000000000002';
const userId = '0c400000-0000-4000-8000-000000000003';
const secret = 'OakAdmin2026!';
const adminCtx = { user: { id: 'platform-user' }, profile: { platform_role: 'super_admin' } };
let ctx = adminCtx;
let existingProfile = null;
let memberRecord = null;
let createdAuth = [];
let changedPasswords = [];
let deletedAuth = [];
let audits = [];
let filters = {};

function chain(table) {
  const state = { table, where: [] };
  const result = { data: null, error: null };
  const b = {
    select() { return b; },
    eq(key, value) { state.where.push([key, value]); return b; },
    neq(key, value) { state.where.push([key, value]); return b; },
    ilike(key, value) { state.where.push([key, value]); return b; },
    maybeSingle() {
      filters[table] = state.where;
      if (table === 'organizations') return Promise.resolve({ data: { id: orgId, status: 'active' }, error: null });
      if (table === 'profiles') return Promise.resolve({ data: existingProfile, error: null });
      if (table === 'organization_members') return Promise.resolve({ data: memberRecord, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    insert() { return Promise.resolve(result); },
    update() { return b; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return b;
}

const mockAdmin = {
  from: chain,
  auth: { admin: {
    createUser: async (input) => {
      createdAuth.push(input);
      return { data: { user: { id: userId } }, error: null };
    },
    updateUserById: async (id, input) => {
      changedPasswords.push({ id, ...input });
      return { data: { user: { id } }, error: null };
    },
    deleteUser: async (id) => { deletedAuth.push(id); return { error: null }; },
  } },
};
const redirect = (url) => { const e = new Error(`REDIRECT:${url}`); e.redirectUrl = url; throw e; };
const deps = {
  '@/lib/admin': { audit: async (...args) => audits.push(args), fint: () => null, fstr: () => null, requireSuperAdmin: async () => ctx, uniqueOrgSlug: async () => 'unused' },
  '@/lib/auth': { ADMIN_ORG_COOKIE: 'admin-org' },
  '@/lib/brand': { ORG_TYPES: [] },
  '@/lib/organizationAccounts': accountRules,
  '@/lib/orgAdminSetup': { generateSetupCode: () => 'unused', hashSetupCode: () => 'unused', setupExpiryFrom: () => new Date(), SETUP_CODE_TTL_HOURS: 72 },
  '@/lib/supabase/server': { createAdminClient: () => mockAdmin },
  '@/lib/tenant': { rootDomain: () => 'example.test', subdomainSuggestions: () => [], validateSubdomain: () => ({ ok: false }) },
  'next/cache': { revalidatePath: () => {} },
  'next/headers': { cookies: async () => ({ set() {}, delete() {} }) },
  'next/navigation': { redirect },
};
const { provisionOrganizationAdministrator, setOrganizationAdminPassword } = compileModule(
  'src/app/admin/actions/orgs.ts', 'scripts/__admin_org_credentials.cjs', deps,
);
const form = (values) => ({ get: (key) => values[key] ?? null });
const redirected = async (fn) => {
  try { await fn(); assert.fail('expected redirect'); }
  catch (e) { if (!e.redirectUrl) throw e; return e.redirectUrl; }
};

let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`  ✓ ${name}`); }
function reset() {
  ctx = adminCtx;
  existingProfile = null;
  memberRecord = null;
  createdAuth = [];
  changedPasswords = [];
  deletedAuth = [];
  audits = [];
  filters = {};
}

await test('provisions a brand-new administrator with server-side Auth and scoped membership', async () => {
  reset();
  const url = await redirected(() => provisionOrganizationAdministrator(form({
    organization_id: orgId, email: '  oak.admin@example.org ', full_name: 'Oak Administrator',
    password: secret, confirm_password: secret,
  })));
  assert.match(url, /tab=members&ok=admin_created$/);
  assert.equal(createdAuth.length, 1);
  assert.equal(createdAuth[0].email, 'oak.admin@example.org');
  assert.equal(createdAuth[0].password, secret);
  assert.equal(createdAuth[0].email_confirm, true);
  assert.equal(JSON.stringify(audits).includes(secret), false);
  assert.deepEqual(deletedAuth, []);
});

await test('refuses to provision an existing profile rather than duplicating or overwriting its credentials', async () => {
  reset();
  existingProfile = { id: userId };
  const url = await redirected(() => provisionOrganizationAdministrator(form({
    organization_id: orgId, email: 'oak.admin@example.org', full_name: 'Oak Administrator',
    password: secret, confirm_password: secret,
  })));
  assert.match(url, /e=account_exists$/);
  assert.equal(createdAuth.length, 0);
});

await test('sets a tenant admin password through server-only Auth, scoped to the selected organization', async () => {
  reset();
  memberRecord = {
    id: memberId, user_id: userId, role: 'admin', organization_id: orgId,
    profiles: { id: userId, email: 'oak.admin@example.org', full_name: 'Oak Administrator', platform_role: 'user' },
  };
  const url = await redirected(() => setOrganizationAdminPassword(form({
    organization_id: orgId, member_id: memberId, password: secret, confirm_password: secret,
  })));
  assert.match(url, /tab=members&ok=password_set$/);
  assert.deepEqual(changedPasswords, [{ id: userId, password: secret }]);
  assert.ok(filters.organization_members.some(([key, value]) => key === 'organization_id' && value === orgId));
  assert.equal(JSON.stringify(audits).includes(secret), false);
});

await test('rejects teachers and missing/cross-organization memberships without calling Auth', async () => {
  reset();
  memberRecord = {
    id: memberId, user_id: userId, role: 'teacher', organization_id: orgId,
    profiles: { id: userId, email: 'teacher@example.org', full_name: 'Teacher', platform_role: 'user' },
  };
  let url = await redirected(() => setOrganizationAdminPassword(form({
    organization_id: orgId, member_id: memberId, password: secret, confirm_password: secret,
  })));
  assert.match(url, /e=credential_forbidden$/);
  assert.equal(changedPasswords.length, 0);
  memberRecord = null;
  url = await redirected(() => setOrganizationAdminPassword(form({
    organization_id: orgId, member_id: memberId, password: secret, confirm_password: secret,
  })));
  assert.match(url, /e=member_missing$/);
  assert.equal(changedPasswords.length, 0);
  assert.ok(filters.organization_members.some(([key, value]) => key === 'organization_id' && value === orgId));
});

await test('rejects non-Super-Admin callers before a password operation', async () => {
  reset();
  ctx = { ...adminCtx, profile: { platform_role: 'user' } };
  memberRecord = {
    id: memberId, user_id: userId, role: 'admin', organization_id: orgId,
    profiles: { id: userId, email: 'admin@example.org', full_name: 'Admin', platform_role: 'user' },
  };
  // In production requireSuperAdmin redirects before entering the action body.
  deps['@/lib/admin'].requireSuperAdmin = async () => { throw new Error('not-super-admin'); };
  await assert.rejects(() => setOrganizationAdminPassword(form({
    organization_id: orgId, member_id: memberId, password: secret, confirm_password: secret,
  })), /not-super-admin/);
  assert.equal(changedPasswords.length, 0);
  deps['@/lib/admin'].requireSuperAdmin = async () => ctx;
});

console.log(`\n${checks} checks passed — Super Admin organization credentials (mocked Auth/DB).`);
