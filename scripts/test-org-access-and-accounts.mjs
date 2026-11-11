// Organization access, role routing, navigation visibility, account policy and
// one-time admin provisioning. Pure modules — no network, no database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

function compile(src, dest, deps = {}) {
  const f = path.resolve(dest), m = new Module(f), old = Module._load;
  m.filename = f;
  m.paths = Module._nodeModulePaths(path.dirname(f));
  Module._load = function (req, parent) {
    if (parent?.filename === f && req in deps) return deps[req];
    return old.apply(this, arguments);
  };
  try {
    m._compile(
      ts.transpileModule(readFileSync(src, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      f,
    );
    return m.exports;
  } finally {
    Module._load = old;
  }
}

const routing = compile('src/lib/roleRouting.ts', 'scripts/__org_role_routing.cjs');
const nav = compile('src/lib/navAccess.ts', 'scripts/__org_nav_access.cjs');
const accounts = compile('src/lib/organizationAccounts.ts', 'scripts/__org_accounts.cjs');
const setup = compile('src/lib/orgAdminSetup.ts', 'scripts/__org_setup.cjs');

let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log('  ✓ ' + name);
}

const dest = (input, next = null) => routing.postAuthDestination(input, next);

await test('each verified role lands on its own workspace after sign-in', () => {
  const superAdmin = dest({ platformRole: 'super_admin', role: 'owner', hasOrg: true });
  assert.equal(superAdmin, '/admin');

  for (const role of ['owner', 'admin', 'teacher', 'organizer', 'supervisor', 'corrector']) {
    assert.equal(dest({ platformRole: 'user', role, hasOrg: true }), '/dashboard', role);
  }
  for (const role of ['student', 'candidate', 'participant', 'parent']) {
    assert.equal(dest({ platformRole: 'user', role, hasOrg: true }), '/student', role);
  }
});

await test('staff sign-in never lands on an examination or join screen', () => {
  for (const role of ['owner', 'admin', 'teacher']) {
    const destination = dest({ platformRole: 'user', role, hasOrg: true }, '/dashboard');
    assert.equal(destination, '/dashboard');
    assert.ok(!destination.includes('/exam-access'));
    assert.ok(!destination.includes('/student'));
  }
});

await test('a student keeps learner destinations and cannot be pushed into staff areas', () => {
  assert.equal(dest({ platformRole: 'user', role: 'student', hasOrg: true }, '/dashboard'), '/student');
  assert.equal(dest({ platformRole: 'user', role: 'student', hasOrg: true }, '/student'), '/student');
  assert.equal(dest({ platformRole: 'user', role: 'student', hasOrg: true }, '/exam-access'), '/exam-access');
  assert.equal(dest({ platformRole: 'user', role: 'student', hasOrg: true }, '/admin'), '/student');
});

await test('a super admin cannot be redirected into a customer dashboard via the next hint', () => {
  assert.equal(dest({ platformRole: 'super_admin', role: 'owner', hasOrg: true }, '/dashboard'), '/admin');
  assert.equal(dest({ platformRole: 'super_admin', role: 'owner', hasOrg: true }, '/admin/users'), '/admin/users');
  assert.equal(dest({ platformRole: 'super_admin', role: 'owner', hasOrg: true }, 'https://evil.invalid'), '/admin');
});

await test('missing membership, tenant mismatch and multi-workspace selection stay safe', () => {
  assert.equal(dest({ platformRole: 'user', hasOrg: false }), '/onboarding');
  assert.equal(dest({ platformRole: 'user', role: 'owner', hasOrg: true, tenantDenied: true }), '/dashboard');
  assert.equal(dest({ platformRole: 'user', role: 'owner', hasOrg: true, needsSelection: true }), '/workspaces');
});

await test('only managers are offered administration navigation', () => {
  const items = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dashboard/students', label: 'Students', audience: 'staff' },
    { href: '/dashboard/accounts', label: 'Accounts', audience: 'managers' },
    { href: '/dashboard/team', label: 'Team', audience: 'managers' },
    { href: '/dashboard/settings', label: 'Settings', audience: 'managers' },
  ];
  const forOwner = nav.filterNavItems(items, 'owner').map((i) => i.href);
  const forAdmin = nav.filterNavItems(items, 'admin').map((i) => i.href);
  const forTeacher = nav.filterNavItems(items, 'teacher').map((i) => i.href);
  const forCorrector = nav.filterNavItems(items, 'corrector').map((i) => i.href);
  const forStudent = nav.filterNavItems(items, 'student').map((i) => i.href);

  assert.deepEqual(forOwner, ['/dashboard', '/dashboard/students', '/dashboard/accounts', '/dashboard/team', '/dashboard/settings']);
  assert.deepEqual(forAdmin, forOwner);
  assert.deepEqual(forTeacher, ['/dashboard', '/dashboard/students']);
  assert.deepEqual(forCorrector, ['/dashboard', '/dashboard/students']);
  assert.deepEqual(forStudent, ['/dashboard']);
});

await test('workspace labels describe the role without granting anything', () => {
  assert.equal(nav.workspaceLabel('owner'), 'Organization owner workspace');
  assert.equal(nav.workspaceLabel('admin'), 'Administrator workspace');
  assert.equal(nav.workspaceLabel('teacher'), 'Teacher workspace');
  assert.equal(nav.workspaceLabel('student'), 'Student workspace');
  assert.equal(nav.workspaceLabel(undefined), 'Workspace');
  assert.equal(nav.isManagementRole('teacher'), false);
  assert.equal(nav.isStaffRole('teacher'), true);
  assert.equal(nav.isManagementRole('admin'), true);
});

await test('emails are normalized or rejected, never silently coerced', () => {
  assert.equal(accounts.normalizeAccountEmail('  Ada@Oak.EDU '), 'ada@oak.edu');
  for (const bad of ['', 'ada', 'ada@', 'ada@oak', 'a@b.c', 'ada @oak.edu', 'ada@oak..edu']) {
    assert.equal(accounts.normalizeAccountEmail(bad), null, bad);
  }
});

await test('initial passwords must clear a real floor', () => {
  assert.equal(accounts.validateInitialPassword('short1').ok, false);
  assert.equal(accounts.validateInitialPassword('alllettersonly').ok, false);
  assert.equal(accounts.validateInitialPassword('1234567890').ok, false);
  assert.equal(accounts.validateInitialPassword('spaces in pass1').ok, false);
  assert.equal(accounts.validateInitialPassword('Oakwood2026!x').ok, true);
  assert.equal(accounts.validateInitialPassword('ada@oak.edu', { email: 'ada@oak.edu' }).ok, false);
  // A name plus digits is acceptable; the raw name alone is not.
  assert.equal(accounts.validateInitialPassword('AdaMensah', { name: 'Ada Mensah' }).ok, false);
  assert.equal(accounts.validateInitialPassword('AdaMensah9', { name: 'Ada Mensah' }).ok, true);
  assert.match(accounts.validateInitialPassword('abc', {}).error ?? '', /at least 10/);
});

await test('account actions are refused for non-managers, owners, super admins and oneself', () => {
  const base = { actorRole: 'admin', actorUserId: 'u1', targetUserId: 'u2', targetRole: 'teacher', targetPlatformRole: 'user' };
  assert.equal(accounts.canManageAccount(base).ok, true);
  assert.equal(accounts.canManageAccount({ ...base, actorRole: 'teacher' }).ok, false);
  assert.equal(accounts.canManageAccount({ ...base, targetRole: 'owner' }).ok, false);
  assert.equal(accounts.canManageAccount({ ...base, targetPlatformRole: 'super_admin' }).ok, false);
  assert.equal(accounts.canManageAccount({ ...base, targetUserId: 'u1' }).ok, false);
  assert.match(accounts.canManageAccount({ ...base, targetPlatformRole: 'super_admin' }).error ?? '', /platform administrator/);
});

await test('assignable staff roles exclude owner and learner roles', () => {
  for (const role of ['admin', 'teacher', 'organizer', 'supervisor', 'corrector']) {
    assert.equal(accounts.isAssignableStaffRole(role), true, role);
  }
  for (const role of ['owner', 'student', 'parent', 'participant', 'nonsense']) {
    assert.equal(accounts.isAssignableStaffRole(role), false, role);
  }
});

await test('setup codes are long, unambiguous and only recoverable as a hash', () => {
  const code = setup.generateSetupCode();
  assert.equal(code.length, setup.SETUP_CODE_LENGTH);
  assert.match(code, /^[A-HJ-NP-Z2-9]+$/);
  assert.notEqual(setup.generateSetupCode(), setup.generateSetupCode());

  const hash = setup.hashSetupCode(code);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes(code));
  assert.equal(setup.hashSetupCode(code.toLowerCase()), hash);
  assert.equal(setup.hashSetupCode(code.replace(/(.{4})/g, '$1 ').trim()), hash);
  assert.equal(setup.setupCodeMatches(code, hash), true);
  assert.equal(setup.setupCodeMatches('KF5SBRLJPN87G47E3V23LSAV', hash), false);
  assert.equal(setup.setupCodeMatches(code, ''), false);
});

await test('setup codes expire and can only be redeemed once', () => {
  const now = new Date('2026-11-11T12:00:00.000Z');
  const expiry = setup.setupExpiryFrom(now, 72);
  assert.equal(expiry.toISOString(), '2026-11-14T12:00:00.000Z');

  assert.equal(setup.setupRecordState(null, now), 'missing');
  assert.equal(setup.setupRecordState({ expires_at: expiry.toISOString() }, now), 'usable');
  assert.equal(setup.setupRecordState({ expires_at: '2026-11-10T00:00:00.000Z' }, now), 'expired');
  assert.equal(setup.setupRecordState({ expires_at: expiry.toISOString(), used_at: now.toISOString() }, now), 'used');
  assert.equal(setup.setupRecordState({ expires_at: null }, now), 'expired');
  assert.match(setup.setupStateMessage('used'), /already been used/i);
  assert.match(setup.setupStateMessage('expired'), /expired/i);
  assert.equal(setup.setupStateMessage('usable'), '');
});

console.log(`\n${count} checks passed — organization access, accounts and provisioning (pure modules).`);
