// Pure SSO configuration and redirect helpers. No database, no request
// context: the point of most checks is that an unconfigured deployment offers
// no sign-in method and that a Host header can never choose a redirect origin.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const outDir = path.join(os.tmpdir(), `evalora-sso-${process.pid}`);
mkdirSync(outDir, { recursive: true });
const { outputText } = ts.transpileModule(readFileSync('src/lib/sso.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
writeFileSync(path.join(outDir, 'sso.js'), outputText);
writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');

const require = createRequire(import.meta.url);
const {
  enabledSsoProviders,
  isSsoProviderId,
  maskEmail,
  requestOrigin,
  ssoCallbackUrl,
  ssoErrorMessage,
  ssoProviderConfigured,
  ssoProviderStatus,
} = require(path.join(outDir, 'sso.js'));

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('  ✓ ' + name);
};

const ON = { NEXT_PUBLIC_GOOGLE_SSO_ENABLED: 'true' };

/* ─── provider gate: inert unless a credential owner turns it on ─── */

test('with nothing configured the sign-in page is offered no provider', () => {
  assert.deepEqual(enabledSsoProviders({}), []);
  assert.equal(ssoProviderConfigured('google', {}), false);
});

test('a missing flag is off, not "probably on"', () => {
  for (const env of [{}, { NEXT_PUBLIC_GOOGLE_SSO_ENABLED: '' }, { NEXT_PUBLIC_GOOGLE_SSO_ENABLED: '   ' }]) {
    assert.deepEqual(enabledSsoProviders(env), []);
  }
});

test('ambiguous flag values stay off', () => {
  for (const value of ['false', '0', 'off', 'no', 'enabled', 'maybe', 'yes please']) {
    assert.equal(ssoProviderConfigured('google', { NEXT_PUBLIC_GOOGLE_SSO_ENABLED: value }), false, value);
  }
});

test('the explicit on values enable Google', () => {
  for (const value of ['true', 'TRUE', ' True ', '1', 'yes', 'on']) {
    assert.equal(ssoProviderConfigured('google', { NEXT_PUBLIC_GOOGLE_SSO_ENABLED: value }), true, value);
  }
  assert.deepEqual(enabledSsoProviders(ON), [{ id: 'google', label: 'Google' }]);
});

test('a declared but blank client id fails closed', () => {
  assert.equal(ssoProviderConfigured('google', { ...ON, NEXT_PUBLIC_GOOGLE_SSO_CLIENT_ID: '' }), false);
  assert.equal(ssoProviderConfigured('google', { ...ON, NEXT_PUBLIC_GOOGLE_SSO_CLIENT_ID: '  ' }), false);
});

test('a real client id mirror does not block the provider', () => {
  const env = { ...ON, NEXT_PUBLIC_GOOGLE_SSO_CLIENT_ID: '1234-abc.apps.googleusercontent.com' };
  assert.equal(ssoProviderConfigured('google', env), true);
});

test('unknown providers are never configured or accepted', () => {
  for (const id of ['github', 'azure', 'GOOGLE', '', null, undefined, 42]) {
    assert.equal(isSsoProviderId(id), id === 'google' ? true : false);
    assert.equal(ssoProviderConfigured(id, ON), false, String(id));
  }
  assert.equal(isSsoProviderId('google'), true);
});

test('admin status lists every known provider with its state', () => {
  assert.deepEqual(ssoProviderStatus({}), [{ id: 'google', label: 'Google', enabled: false }]);
  assert.deepEqual(ssoProviderStatus(ON), [{ id: 'google', label: 'Google', enabled: true }]);
});

/* ─── callback origin: a Host header must not choose the redirect target ─── */

test('the platform host used in production is accepted', () => {
  assert.equal(
    requestOrigin({ host: 'evalora-six.vercel.app' }),
    'https://evalora-six.vercel.app',
  );
});

test('a school subdomain is accepted once the root domain is known', () => {
  assert.equal(
    requestOrigin({ host: 'oak.evalora.com', rootDomain: 'evalora.com' }),
    'https://oak.evalora.com',
  );
  assert.equal(requestOrigin({ host: 'evalora.com', rootDomain: 'evalora.com' }), 'https://evalora.com');
});

test('an unknown host falls back to the configured app URL', () => {
  assert.equal(
    requestOrigin({ host: 'evil.example.com', rootDomain: 'evalora.com', appUrl: 'https://evalora-six.vercel.app/' }),
    'https://evalora-six.vercel.app',
  );
});

test('an unknown host with no fallback yields no origin at all', () => {
  assert.equal(requestOrigin({ host: 'evil.example.com', rootDomain: 'evalora.com' }), null);
  assert.equal(requestOrigin({ host: 'evil.example.com', appUrl: 'not a url' }), null);
  assert.equal(requestOrigin({}), null);
  assert.equal(requestOrigin({ host: null, appUrl: null }), null);
});

test('host injection tricks are rejected', () => {
  for (const host of [
    'evil.com/../evalora.com',
    'evalora.com@evil.com',
    'evil.com\\@evalora.com',
    'evil.com:80:90',
    'https://evil.com',
    'localhost.evil.com',
    'e vil.com',
  ]) {
    const origin = requestOrigin({ host, rootDomain: 'evalora.com' });
    assert.equal(origin, null, host);
  }
});

test('a look-alike suffix does not pass the platform allowlist', () => {
  assert.equal(requestOrigin({ host: 'evil.vercel.app.evil.com' }), null);
  assert.equal(requestOrigin({ host: 'evalora.vercel.app.attacker.io' }), null);
  // Any *.vercel.app host is accepted as a platform host: the second gate is
  // Supabase's redirect allow-list, which only lists this project's domains.
  assert.equal(requestOrigin({ host: 'other-preview.vercel.app' }), 'https://other-preview.vercel.app');
});

test('the protocol cannot be downgraded by a forwarded header', () => {
  assert.equal(requestOrigin({ host: 'evalora-six.vercel.app', proto: 'http' }), 'https://evalora-six.vercel.app');
});

test('loopback keeps http so local development works', () => {
  assert.equal(requestOrigin({ host: 'localhost:3000' }), 'http://localhost:3000');
  assert.equal(requestOrigin({ host: '127.0.0.1:3000' }), 'http://127.0.0.1:3000');
});

test('a forwarded host chain uses the first entry', () => {
  assert.equal(requestOrigin({ host: 'oak.evalora.com, proxy.internal' , rootDomain: 'evalora.com' }), 'https://oak.evalora.com');
});

/* ─── callback URL ─── */

test('the callback URL marks the SSO leg and keeps a local destination', () => {
  const url = new URL(ssoCallbackUrl('https://oak.evalora.com', '/dashboard/exams?tab=live', 'google'));
  assert.equal(url.origin, 'https://oak.evalora.com');
  assert.equal(url.pathname, '/auth/callback');
  assert.equal(url.searchParams.get('sso'), 'google');
  assert.equal(url.searchParams.get('next'), '/dashboard/exams?tab=live');
});

test('no destination hint means no next parameter', () => {
  const url = new URL(ssoCallbackUrl('https://evalora-six.vercel.app', null, 'google'));
  assert.equal(url.searchParams.has('next'), false);
});

/* ─── audit masking and user-facing copy ─── */

test('audit metadata never carries a full email address', () => {
  assert.equal(maskEmail('ada.lovelace@gmail.com'), 'a***@gmail.com');
  assert.equal(maskEmail('  bob@school.edu  '), 'b***@school.edu');
  assert.equal(maskEmail('@gmail.com'), null);
  assert.equal(maskEmail('no-at-sign'), null);
  assert.equal(maskEmail(null), null);
});

test('SSO failure codes map to copy that names the next step', () => {
  assert.match(ssoErrorMessage('sso_unprovisioned'), /ask your school administrator to invite you/i);
  assert.match(ssoErrorMessage('sso_unavailable'), /email and password/i);
  assert.match(ssoErrorMessage('sso'), /try again/i);
  assert.equal(ssoErrorMessage('suspended'), null, 'non-SSO codes keep their own copy');
  assert.equal(ssoErrorMessage(null), null);
  assert.equal(ssoErrorMessage('toString'), null, 'prototype keys are not messages');
});

console.log(`\n${n} SSO configuration checks passed (pure helpers).`);
